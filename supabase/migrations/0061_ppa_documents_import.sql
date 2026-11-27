-- 0061: owner-only import of one PPA document (+ its chunks) into procurement_doc / procurement_doc_chunk. Re-running replaces the document's chunks.
-- Always lands as 'pending_review'; never sets a verified status.
create or replace function public.procurement_doc_import(p_doc jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare d uuid; n int := 0; c jsonb; q text := nullif(p_doc->>'text_quality', '');
begin
  if not public.is_platform_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_doc->'chunks') <> 'array' or (p_doc->>'page_id') !~ '^\d{1,6}$' or coalesce(p_doc->>'source_url','') !~ '^https://www\.ppa\.gov\.lb/' then raise exception 'invalid_doc' using errcode = '22023'; end if;
  insert into procurement_doc(page_id, category, title, published_on, source_url, file_urls, text_quality)
  values ((p_doc->>'page_id')::int, left(p_doc->>'category', 120), left(p_doc->>'title', 400), nullif(p_doc->>'published_on','')::date, p_doc->>'source_url',
          coalesce(array(select jsonb_array_elements_text(p_doc->'file_urls')), '{}'), q)
  on conflict (page_id) do update set category = excluded.category, title = excluded.title, published_on = excluded.published_on,
    source_url = excluded.source_url, file_urls = excluded.file_urls, text_quality = excluded.text_quality
  returning id into d;
  delete from procurement_doc_chunk where doc_id = d;
  for c in select * from jsonb_array_elements(p_doc->'chunks') loop
    insert into procurement_doc_chunk(doc_id, ord, label, body) values (d, (c->>'o')::int, nullif(c->>'l',''), c->>'b'); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.procurement_doc_import(jsonb) from public, anon, authenticated;
grant execute on function public.procurement_doc_import(jsonb) to authenticated;
