-- Legal knowledge for the mayor's AI tools, kept in Supabase (pgvector) instead of an external vector DB.
create extension if not exists vector with schema extensions;

create table if not exists public.law_chunk (
  id bigserial primary key,
  law_id text not null,
  article int,
  title text not null,
  source text not null default 'law_library',
  domain text not null default 'D01',
  body text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (law_id, article, source)
);
alter table public.law_chunk enable row level security;  -- no policies: reachable only through the functions below
create index if not exists law_chunk_embedding_idx on public.law_chunk using hnsw (embedding extensions.vector_cosine_ops);

-- Staff-only semantic search.
create or replace function public.match_law_chunks(p_embedding extensions.vector(1536), p_limit int default 20, p_min real default 0.2)
returns table (chunk_id text, title text, body text, domain text, source text, score real)
language plpgsql security definer set search_path to 'public','extensions' as $$
begin
  if auth.uid() is null or not exists (select 1 from staff_member where user_id = auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select (c.law_id || ':' || coalesce(c.article::text,'0')), c.title, c.body, c.domain, c.source,
    (1 - (c.embedding <=> p_embedding))::real from law_chunk c
    where c.embedding is not null and (1 - (c.embedding <=> p_embedding)) >= p_min
    order by c.embedding <=> p_embedding limit least(p_limit, 40);
end $$;

-- Admin-only ingestion (called by the app with the admin's own session).
create or replace function public.admin_upsert_law_chunks(p_rows jsonb)
returns int language plpgsql security definer set search_path to 'public','extensions' as $$
declare n int := 0; r jsonb;
begin
  if auth.uid() is null or not is_any_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into law_chunk (law_id, article, title, source, domain, body, embedding)
    values (r->>'law_id', nullif(r->>'article','')::int, r->>'title', coalesce(r->>'source','law_library'), coalesce(r->>'domain','D01'), r->>'body',
            (r->>'embedding')::extensions.vector(1536))
    on conflict (law_id, article, source) do update set title=excluded.title, body=excluded.body, embedding=excluded.embedding;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.admin_law_chunk_count() returns bigint language sql security definer set search_path to 'public' as $$
  select case when auth.uid() is not null and is_any_admin() then (select count(*) from law_chunk where embedding is not null) else null end $$;

revoke all on function public.match_law_chunks(extensions.vector,int,real), public.admin_upsert_law_chunks(jsonb), public.admin_law_chunk_count() from public, anon;
grant execute on function public.match_law_chunks(extensions.vector,int,real), public.admin_upsert_law_chunks(jsonb), public.admin_law_chunk_count() to authenticated;
