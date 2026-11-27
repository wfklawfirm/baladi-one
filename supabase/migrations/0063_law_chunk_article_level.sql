-- 0063: article-level metadata + Arabic-tolerant full-text + exact article lookup for law_chunk. ADDITIVE ONLY (no drops, no rewrites of body/embedding).
alter table public.law_chunk
  add column if not exists instrument_type text,
  add column if not exists issue_date date,
  add column if not exists status text not null default 'pending_review',
  add column if not exists checksum text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='law_chunk_status_chk') then
    alter table public.law_chunk add constraint law_chunk_status_chk
      check (status in ('pending_review','verified','repealed','requires_update','rejected'));
  end if;
end $$;

-- backfill: type from the existing source column (no legal dates are invented: issue_date stays null until reviewed)
update public.law_chunk set instrument_type = case source
  when 'law_library' then 'law' when 'book' then 'book' when 'circular' then 'circular'
  when 'form' then 'template' when 'service' then 'service' else 'other' end
where instrument_type is null;
update public.law_chunk set checksum = md5(body) where checksum is null;

create index if not exists law_chunk_fts_idx on public.law_chunk using gin (to_tsvector('simple', body));
create index if not exists law_chunk_law_article_idx on public.law_chunk (law_id, article);

-- exact article lookup: e.g. ('MUN-118', 67). Returns text with status so callers never present unreviewed text as verified.
create or replace function public.law_article_lookup(p_law text, p_article int)
returns table(chunk_id text, law_id text, article int, title text, body text, status text, instrument_type text, issue_date date, checksum text)
language sql stable security definer set search_path = public as $$
  select c.law_id || ':' || coalesce(c.article::text, c.id::text), c.law_id, c.article, c.title, c.body, c.status, c.instrument_type, c.issue_date, c.checksum
  from public.law_chunk c
  where c.law_id = p_law and c.article = p_article and c.status <> 'rejected'
  order by c.id limit 10;
$$;

create or replace function public.law_fts_search(p_query text, p_limit int default 10)
returns table(chunk_id text, law_id text, article int, title text, body text, source text, domain text, rank real)
language sql stable security definer set search_path = public as $$
  select c.law_id || ':' || coalesce(c.article::text, c.id::text), c.law_id, c.article, c.title, c.body, c.source, c.domain,
         ts_rank(to_tsvector('simple', c.body), plainto_tsquery('simple', p_query))
  from public.law_chunk c
  where c.status <> 'rejected' and to_tsvector('simple', c.body) @@ plainto_tsquery('simple', p_query)
  order by 8 desc limit least(greatest(p_limit,1),30);
$$;

revoke all on function public.law_article_lookup(text,int) from public;
revoke all on function public.law_fts_search(text,int) from public;
grant execute on function public.law_article_lookup(text,int) to authenticated, service_role;
grant execute on function public.law_fts_search(text,int) to authenticated, service_role;
