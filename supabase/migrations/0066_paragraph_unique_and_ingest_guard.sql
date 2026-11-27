-- additive: allow paragraph-level chunks and stop bulk ingest from overwriting versioned (replaced) text
alter table public.law_chunk drop constraint if exists law_chunk_law_id_article_source_key;
create unique index if not exists law_chunk_law_article_source_par_key
  on public.law_chunk (law_id, article, source, (coalesce(paragraph, 0)));

create or replace function public.admin_upsert_law_chunks(p_rows jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int := 0; r jsonb;
begin
  if auth.uid() is null or not is_any_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into law_chunk (law_id, article, title, source, domain, body, embedding)
    values (r->>'law_id', nullif(r->>'article','')::int, r->>'title', coalesce(r->>'source','law_library'), coalesce(r->>'domain','D01'), r->>'body',
            (r->>'embedding')::extensions.vector(1536))
    on conflict (law_id, article, source, (coalesce(paragraph, 0))) do update
      set title=excluded.title, body=excluded.body, embedding=excluded.embedding
      where law_chunk.version_label is null;  -- never overwrite versioned/consolidated text
    n := n + 1;
  end loop;
  return n;
end $$;
