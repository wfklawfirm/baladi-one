-- 0062: owner-only human review of PPA documents. The AI never sets a status; 'verified' needs the owner, a note, and is voided automatically if the text changes.
-- Status wording in the UI: «معتمد من المالك (مراجعة بشرية)» — never a blanket "legally verified" label.
alter table public.procurement_doc add column if not exists reviewed_by uuid references auth.users(id);
alter table public.procurement_doc add column if not exists reviewed_at timestamptz;
alter table public.procurement_doc add column if not exists review_note text;
alter table public.procurement_doc add column if not exists reviewed_hash text;

create table if not exists public.procurement_doc_review_log (
  id bigserial primary key, doc_id uuid not null references public.procurement_doc(id) on delete cascade, page_id int not null,
  from_status text not null, to_status text not null, note text, reviewer uuid, reason text not null default 'owner_review',
  content_hash text, at timestamptz not null default now());
alter table public.procurement_doc_review_log enable row level security;
revoke all on public.procurement_doc_review_log from public, anon, authenticated;
grant select on public.procurement_doc_review_log to authenticated;
drop policy if exists procurement_doc_review_log_owner on public.procurement_doc_review_log;
create policy procurement_doc_review_log_owner on public.procurement_doc_review_log for select to authenticated using (public.is_platform_owner());

create or replace function public.procurement_doc_hash(p_doc uuid) returns text language sql stable security invoker set search_path = public as $$
  select md5(coalesce(string_agg(body, '|' order by ord), '')) from procurement_doc_chunk where doc_id = p_doc $$;

create or replace function public.procurement_doc_review(p_page_id int, p_status text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare d procurement_doc%rowtype; h text;
begin
  if not public.is_platform_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending_review','verified','rejected','superseded') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into d from procurement_doc where page_id = p_page_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status in ('verified','rejected','superseded') and char_length(btrim(coalesce(p_note,''))) < 10 then raise exception 'note_required' using errcode = '22023'; end if;
  if p_status = 'verified' and d.text_quality is null then raise exception 'no_text_to_verify' using errcode = '22023'; end if;
  h := public.procurement_doc_hash(d.id);
  update procurement_doc set verification_status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000),
    reviewed_hash = case when p_status = 'verified' then h else null end where id = d.id;
  insert into procurement_doc_review_log(doc_id, page_id, from_status, to_status, note, reviewer, content_hash) values (d.id, d.page_id, d.verification_status, p_status, left(p_note, 1000), auth.uid(), h);
  return p_status;
end $$;
revoke all on function public.procurement_doc_review(int, text, text) from public, anon, authenticated;
grant execute on function public.procurement_doc_review(int, text, text) to authenticated;

-- Re-importing changed text voids a prior verification (the reviewed text is no longer what is stored).
create or replace function public.procurement_doc_import(p_doc jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare d uuid; n int := 0; c jsonb; q text := nullif(p_doc->>'text_quality', ''); st text; rh text;
begin
  if not public.is_platform_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_doc->'chunks') <> 'array' or (p_doc->>'page_id') !~ '^\d{1,6}$' or coalesce(p_doc->>'source_url','') !~ '^https://www\.ppa\.gov\.lb/' then raise exception 'invalid_doc' using errcode = '22023'; end if;
  insert into procurement_doc(page_id, category, title, published_on, source_url, file_urls, text_quality)
  values ((p_doc->>'page_id')::int, left(p_doc->>'category', 120), left(p_doc->>'title', 400), nullif(p_doc->>'published_on','')::date, p_doc->>'source_url',
          coalesce(array(select jsonb_array_elements_text(p_doc->'file_urls')), '{}'), q)
  on conflict (page_id) do update set category = excluded.category, title = excluded.title, published_on = excluded.published_on,
    source_url = excluded.source_url, file_urls = excluded.file_urls, text_quality = excluded.text_quality
  returning id, verification_status, reviewed_hash into d, st, rh;
  delete from procurement_doc_chunk where doc_id = d;
  for c in select * from jsonb_array_elements(p_doc->'chunks') loop
    insert into procurement_doc_chunk(doc_id, ord, label, body) values (d, (c->>'o')::int, nullif(c->>'l',''), c->>'b'); n := n + 1;
  end loop;
  if st = 'verified' and rh is distinct from public.procurement_doc_hash(d) then
    update procurement_doc set verification_status = 'pending_review', reviewed_hash = null where id = d;
    insert into procurement_doc_review_log(doc_id, page_id, from_status, to_status, note, reason) select id, page_id, 'verified', 'pending_review', 'النص تغيّر بعد الاعتماد', 'text_changed' from procurement_doc where id = d;
  end if;
  return n;
end $$;
revoke all on function public.procurement_doc_import(jsonb) from public, anon, authenticated;
grant execute on function public.procurement_doc_import(jsonb) to authenticated;

-- Search: rejected/superseded documents are never retrieved; the review status travels with each row.
drop function if exists public.procurement_doc_search(text[], int);
create function public.procurement_doc_search(p_terms text[], p_limit int default 8)
returns table (page_id int, category text, title text, published_on date, source_url text, text_quality text, label text, body text, rank real, verification_status text)
language plpgsql stable security invoker set search_path = public as $$
declare q tsquery; t text; parts text[] := '{}';
begin
  foreach t in array coalesce(p_terms, '{}') loop
    t := regexp_replace(public.ppa_stem(t), '[^[:alnum:]]', '', 'g');
    if char_length(t) >= 3 and not (t || ':*') = any(parts) then parts := parts || (t || ':*'); end if;
  end loop;
  if array_length(parts, 1) is null then return; end if;
  parts := parts[1:16];
  q := to_tsquery('simple', array_to_string(parts, ' | '));
  return query
    select d.page_id, d.category, d.title, d.published_on, d.source_url, d.text_quality, c.label, left(c.body, 2500),
           (ts_rank(c.tsv, q) + 10 * (select count(*) from unnest(parts) p where c.tsv @@ to_tsquery('simple', p)))::real, d.verification_status
    from procurement_doc_chunk c join procurement_doc d on d.id = c.doc_id
    where c.tsv @@ q and d.verification_status in ('pending_review','verified')
    order by 9 desc, d.published_on desc nulls last
    limit least(coalesce(p_limit, 8), 20);
end $$;
revoke all on function public.procurement_doc_search(text[], int) from public, anon;
grant execute on function public.procurement_doc_search(text[], int) to authenticated;
