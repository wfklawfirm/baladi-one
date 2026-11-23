-- DRAFT — not applied. Legal library (laws + articles). Source of truth for now: data/laws.json
create table if not exists legal_instrument (
  id text primary key, title_ar text not null, short_ar text not null, number text, enacted_on date,
  source_url text, source_name text, note_ar text, article_count int not null
);
create table if not exists legal_article (
  instrument_id text not null references legal_instrument(id) on delete cascade,
  n int not null, heading_ar text, part_ar text, text_ar text not null, amendment_note text,
  primary key (instrument_id, n)
);
alter table legal_instrument enable row level security;
alter table legal_article enable row level security;
create policy legal_instrument_read on legal_instrument for select using (true);
create policy legal_article_read on legal_article for select using (true);
create index if not exists legal_article_fts on legal_article using gin (to_tsvector('simple', coalesce(heading_ar,'') || ' ' || text_ar));
