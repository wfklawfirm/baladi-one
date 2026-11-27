-- 0065: legal versioning + temporal validity for law_chunk. ADDITIVE: new columns, new table, filtered retrieval functions, archive copy of PROC-244 (2021 text). No drops of data.
alter table public.law_chunk
  add column if not exists is_current boolean not null default true,
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists version_label text,
  add column if not exists paragraph int,
  add column if not exists source_url text,
  add column if not exists amended_by text,
  add column if not exists legal_force text not null default 'binding',
  add column if not exists partial_scope text,
  add column if not exists embedded_checksum text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='law_chunk_force_chk') then
    alter table public.law_chunk add constraint law_chunk_force_chk check (legal_force in ('binding','preamble','historical','editorial'));
  end if;
end $$;
update public.law_chunk set embedded_checksum = checksum where embedding is not null and embedded_checksum is null;

-- keep the 2021 original of Law 244 for history only (never current law). Embeddings are copied but retrieval filters is_current.
insert into public.law_chunk (law_id, article, title, source, domain, body, embedding, instrument_type, issue_date, status, checksum, is_current, legal_force, version_label, embedded_checksum)
select 'PROC-244-2021', article, title, source, domain, body, embedding, instrument_type, issue_date, 'requires_update', checksum, false, 'historical',
       'نسخة 2021 الأصلية (قبل التعديلات) — للتاريخ فقط وليست النص النافذ', embedded_checksum
from public.law_chunk where law_id = 'PROC-244'
on conflict (law_id, article, source) do nothing;

create table if not exists public.law_amendment (
  id bigserial primary key,
  law_id text not null, article int, paragraph int,
  amending_instrument text not null, amending_ref text,
  kind text not null check (kind in ('amend','replace','add','repeal_partial','repeal_total','reservation','supersede_ceiling')),
  effect text, partial_scope text, source_url text,
  verified_against_source boolean not null default false,
  note text, created_at timestamptz not null default now()
);
alter table public.law_amendment enable row level security;
create index if not exists law_amendment_idx on public.law_amendment (law_id, article);

create or replace function public.law_amendments_for(p_law text, p_article int default null)
returns table(law_id text, article int, paragraph int, amending_instrument text, amending_ref text, kind text, effect text, partial_scope text, source_url text, verified_against_source boolean, note text)
language sql stable security definer set search_path = public as $$
  select a.law_id, a.article, a.paragraph, a.amending_instrument, a.amending_ref, a.kind, a.effect, a.partial_scope, a.source_url, a.verified_against_source, a.note
  from public.law_amendment a where a.law_id = p_law and (p_article is null or a.article = p_article) order by a.article, a.id;
$$;

-- retrieval = CURRENT + BINDING text only (superseded/historical/preamble rows never surface as current law)
create or replace function public.law_article_lookup(p_law text, p_article int)
returns table(chunk_id text, law_id text, article int, title text, body text, status text, instrument_type text, issue_date date, checksum text)
language sql stable security definer set search_path = public as $$
  select c.law_id || ':' || coalesce(c.article::text, c.id::text), c.law_id, c.article, c.title, c.body, c.status, c.instrument_type, c.issue_date, c.checksum
  from public.law_chunk c
  where c.law_id = p_law and c.article = p_article and c.status <> 'rejected' and c.is_current and c.legal_force = 'binding' and c.source <> 'law_paragraph'
  order by c.id limit 10;
$$;
-- explicit history access (all versions, flagged)
create or replace function public.law_article_history(p_law text, p_article int)
returns table(law_id text, article int, version_label text, is_current boolean, legal_force text, status text, body text)
language sql stable security definer set search_path = public as $$
  select c.law_id, c.article, c.version_label, c.is_current, c.legal_force, c.status, c.body from public.law_chunk c
  where c.article = p_article and (c.law_id = p_law or c.law_id = p_law || '-2021') and c.source <> 'law_paragraph' order by c.is_current desc, c.id;
$$;
create or replace function public.law_paragraph_lookup(p_law text, p_article int)
returns table(law_id text, article int, paragraph int, body text, status text)
language sql stable security definer set search_path = public as $$
  select c.law_id, c.article, c.paragraph, c.body, c.status from public.law_chunk c
  where c.law_id = p_law and c.article = p_article and c.source = 'law_paragraph' and c.is_current order by c.paragraph;
$$;
create or replace function public.law_fts_search(p_query text, p_limit int default 10)
returns table(chunk_id text, law_id text, article int, title text, body text, source text, domain text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare q tsquery;
begin
  q := nullif(replace(plainto_tsquery('simple', p_query)::text, ' & ', ' | '), '')::tsquery;
  if q is null then return; end if;
  return query
    select c.law_id || ':' || coalesce(c.article::text, c.id::text), c.law_id, c.article, c.title, c.body, c.source, c.domain,
           ts_rank(to_tsvector('simple', c.body), q)
    from public.law_chunk c
    where c.status <> 'rejected' and c.is_current and c.legal_force = 'binding' and c.source <> 'law_paragraph' and to_tsvector('simple', c.body) @@ q
    order by 8 desc limit least(greatest(p_limit,1),30);
end $$;
create or replace function public.match_law_chunks(p_embedding extensions.vector(1536), p_limit int default 20, p_min real default 0.2)
returns table (chunk_id text, title text, body text, domain text, source text, score real)
language plpgsql security definer set search_path to 'public','extensions' as $$
begin
  if auth.uid() is null or not exists (select 1 from staff_member where user_id = auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select (c.law_id || ':' || coalesce(c.article::text,'0')), c.title, c.body, c.domain, c.source,
    (1 - (c.embedding <=> p_embedding))::real from law_chunk c
    where c.embedding is not null and c.is_current and c.legal_force = 'binding' and c.status <> 'rejected' and (1 - (c.embedding <=> p_embedding)) >= p_min
    order by c.embedding <=> p_embedding limit least(p_limit, 40);
end $$;

-- owner-run embedding backfill: rows without an embedding, or whose text changed since it was embedded
create or replace function public.admin_chunks_needing_embedding(p_limit int default 40)
returns table(id bigint, title text, body text, checksum text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_any_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return query select c.id, c.title, c.body, c.checksum from law_chunk c
    where c.is_current and c.legal_force = 'binding' and c.source <> 'law_paragraph' and c.status <> 'rejected' and (c.embedding is null or c.embedded_checksum is distinct from c.checksum)
    order by c.id limit least(greatest(p_limit,1),100);
end $$;
create or replace function public.admin_set_chunk_embedding(p_id bigint, p_embedding extensions.vector(1536))
returns void language plpgsql security definer set search_path to 'public','extensions' as $$
begin
  if auth.uid() is null or not is_any_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  update law_chunk set embedding = p_embedding, embedded_checksum = checksum where id = p_id;
end $$;
create or replace function public.admin_embedding_backlog()
returns bigint language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and is_any_admin() then
    (select count(*) from law_chunk c where c.is_current and c.legal_force='binding' and c.source <> 'law_paragraph' and c.status <> 'rejected' and (c.embedding is null or c.embedded_checksum is distinct from c.checksum)) else null end $$;

revoke all on function public.law_amendments_for(text,int), public.law_article_history(text,int), public.law_paragraph_lookup(text,int), public.admin_chunks_needing_embedding(int), public.admin_set_chunk_embedding(bigint, extensions.vector), public.admin_embedding_backlog() from public, anon;
grant execute on function public.law_amendments_for(text,int), public.law_article_history(text,int), public.law_paragraph_lookup(text,int) to authenticated, service_role;
grant execute on function public.admin_chunks_needing_embedding(int), public.admin_set_chunk_embedding(bigint, extensions.vector), public.admin_embedding_backlog() to authenticated;
