-- 0052: texts published by the Public Procurement Authority (ppa.gov.lb) — laws, decrees, presidential decisions, memos, circulars, guides.
-- Stored as read from the PPA site (page + attachment). Every row is 'pending_review': nothing here is labelled legally verified.
-- text_quality: 'text' = extracted from the PDF text layer; 'ocr' = scanned page read by OCR (numbers/dates may be wrong — rely on the link).
create or replace function public.ppa_norm(t text) returns text language sql immutable parallel safe as $$
  select translate(replace(regexp_replace(coalesce(t,''), '[\u064B-\u0652\u0670\u200e\u200f]', '', 'g'), 'ـ', ''),
                   'أإآٱىة٠١٢٣٤٥٦٧٨٩', 'ااااي' || 'ه' || '0123456789') $$;
-- Light Arabic stemming used on BOTH sides (stored text and query): drops the article/clitic at the start of a word (ال، بال، لل، و، ل، ب ...) so «لرئيس» matches «الرئيس».
create or replace function public.ppa_stem(t text) returns text language sql immutable parallel safe as $$
  select regexp_replace(regexp_replace(public.ppa_norm(t),
    '(^|[^[:alnum:]])(وال|بال|كال|فال|لل|ال)(?=[[:alnum:]]{2,})', '\1', 'g'),
    '(^|[^[:alnum:]])[لبوفك](?=[[:alnum:]]{4,})', '\1', 'g') $$;

create table if not exists public.procurement_doc (
  id uuid primary key default gen_random_uuid(),
  page_id int not null unique,                       -- id in https://www.ppa.gov.lb/ar/pages/details/<id>
  category text not null,
  title text not null,
  published_on date,
  source_url text not null,
  file_urls text[] not null default '{}',
  text_quality text check (text_quality in ('text','ocr','ocr+text')),   -- null = metadata only (no readable text)
  verification_status text not null default 'pending_review' check (verification_status in ('pending_review','verified','rejected','superseded')),
  imported_at timestamptz not null default now());
create table if not exists public.procurement_doc_chunk (
  id bigserial primary key,
  doc_id uuid not null references public.procurement_doc(id) on delete cascade,
  ord int not null, label text, body text not null,
  tsv tsvector generated always as (to_tsvector('simple', public.ppa_stem(body))) stored,
  unique (doc_id, ord));
create index if not exists procurement_doc_chunk_tsv on public.procurement_doc_chunk using gin (tsv);
alter table public.procurement_doc enable row level security;
alter table public.procurement_doc_chunk enable row level security;
revoke all on public.procurement_doc, public.procurement_doc_chunk from public, anon, authenticated;
grant select on public.procurement_doc, public.procurement_doc_chunk to authenticated;
drop policy if exists procurement_doc_staff_read on public.procurement_doc;
create policy procurement_doc_staff_read on public.procurement_doc for select to authenticated using (exists (select 1 from public.staff_member s where s.user_id = auth.uid()));
drop policy if exists procurement_doc_chunk_staff_read on public.procurement_doc_chunk;
create policy procurement_doc_chunk_staff_read on public.procurement_doc_chunk for select to authenticated using (exists (select 1 from public.staff_member s where s.user_id = auth.uid()));

-- Keyword search (staff only). Terms are stemmed like the stored text and OR-ed; chunks matching MORE distinct terms rank first, then ts_rank, then newest.
create or replace function public.procurement_doc_search(p_terms text[], p_limit int default 8)
returns table (page_id int, category text, title text, published_on date, source_url text, text_quality text, label text, body text, rank real)
language plpgsql stable security invoker set search_path = public as $$
declare q tsquery; t text; parts text[] := '{}'; qs text[] := '{}';
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
           (ts_rank(c.tsv, q) + 10 * (select count(*) from unnest(parts) p where c.tsv @@ to_tsquery('simple', p)))::real
    from procurement_doc_chunk c join procurement_doc d on d.id = c.doc_id
    where c.tsv @@ q
    order by 9 desc, d.published_on desc nulls last
    limit least(coalesce(p_limit, 8), 20);
end $$;
revoke all on function public.procurement_doc_search(text[], int) from public, anon;
grant execute on function public.procurement_doc_search(text[], int) to authenticated;
