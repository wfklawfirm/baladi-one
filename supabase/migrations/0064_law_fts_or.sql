-- 0064: full-text search ORs the question terms (a whole question never matches as AND); ranked by ts_rank. Replaces function body only.
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
    where c.status <> 'rejected' and to_tsvector('simple', c.body) @@ q
    order by 8 desc limit least(greatest(p_limit,1),30);
end $$;
