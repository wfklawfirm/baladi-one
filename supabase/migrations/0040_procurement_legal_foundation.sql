-- 0040 (DRAFT — NOT APPLIED): procurement legal foundation. Idempotent and non-destructive. Depends on 0024.
-- NO legal value is loaded here: no threshold, no deadline, no article text. Every row is entered later, with a source,
-- through reviewed RPCs, and starts as 'pending_review'. Nothing in this file asserts what any law says.

-- 1) Official source register for procurement instruments (laws, decrees, memos). Text is stored only after it is read from the official source.
create table if not exists public.procurement_legal_source (
  id uuid primary key default gen_random_uuid(),
  instrument_type text not null check (instrument_type in ('law','decree','legislative_decree','decision','memo','circular','template','other')),
  instrument_number text not null check (btrim(instrument_number) <> ''),
  instrument_date date,
  official_title text,
  official_source_url text,
  gazette_reference text,
  applicable_entities text[] not null default '{}',          -- e.g. municipality, union_of_municipalities (free text, verified at review)
  effective_from date, effective_to date,
  verification_status text not null default 'pending_review' check (verification_status in ('pending_review','verified','rejected','superseded','source_unreachable')),
  reviewed_by uuid references auth.users(id), last_reviewed_at timestamptz,
  note text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique (instrument_type, instrument_number, instrument_date));

-- 2) Article/paragraph level provisions (original Arabic text only when it was actually read from the source).
create table if not exists public.procurement_provision (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.procurement_legal_source(id) on delete cascade,
  article_number text not null check (btrim(article_number) <> ''),
  paragraph_number text,
  topic text not null check (topic in ('planning','estimation','anti_splitting','methods','competition','tender_documents','prequalification','advertising','bids','evaluation','award','objections','standstill','contracts','guarantees','execution','amendments','acceptance','payment','publication','oversight','committees','conflict_of_interest','ethics','other')),
  original_arabic_text text,            -- NULL until read from the official source
  amendments text, exceptions text,
  verification_status text not null default 'pending_review' check (verification_status in ('pending_review','verified','rejected','superseded')),
  reviewed_by uuid references auth.users(id), last_reviewed_at timestamptz,
  unique (source_id, article_number, paragraph_number));
create index if not exists procurement_provision_topic on public.procurement_provision (topic);

-- 3) Threshold registry: four separate KINDS that must never be mixed (method / competence / administrative approval / financial control).
alter table public.procurement_threshold
  add column if not exists threshold_kind text not null default 'method',
  add column if not exists legal_source_id uuid references public.procurement_legal_source(id),
  add column if not exists provision_id uuid references public.procurement_provision(id),
  add column if not exists comparison_operator text not null default 'between_inclusive',
  add column if not exists applies_to text,                 -- category/authority the threshold governs (free text, filled at review)
  add column if not exists conditions text, add column if not exists exceptions text,
  add column if not exists reviewed_by uuid references auth.users(id), add column if not exists last_reviewed_at timestamptz;
alter table public.procurement_threshold alter column method drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'procurement_threshold_kind_chk') then
    alter table public.procurement_threshold add constraint procurement_threshold_kind_chk
      check (threshold_kind in ('method','competence','admin_approval','financial_control'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'procurement_threshold_op_chk') then
    alter table public.procurement_threshold add constraint procurement_threshold_op_chk
      check (comparison_operator in ('between_inclusive','lt','lte','gt','gte','eq'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'procurement_threshold_method_kind_chk') then
    alter table public.procurement_threshold add constraint procurement_threshold_method_kind_chk
      check (threshold_kind <> 'method' or method is not null);
  end if;
end $$;
create index if not exists procurement_threshold_kind on public.procurement_threshold (municipality_id, threshold_kind, currency, effective_from);

-- 4) RLS: staff read only; writes only through reviewed SECURITY DEFINER RPCs (to be added with the review screen).
alter table public.procurement_legal_source enable row level security;
alter table public.procurement_provision enable row level security;
drop policy if exists procurement_legal_source_read on public.procurement_legal_source;
drop policy if exists procurement_provision_read on public.procurement_provision;
create policy procurement_legal_source_read on public.procurement_legal_source for select to authenticated using (true);
create policy procurement_provision_read on public.procurement_provision for select to authenticated using (true);
