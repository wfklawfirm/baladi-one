-- Municipal revenue & tax administration (extends the collections ledger `collection_entry` and the finance `receivable`; does not replace them).
-- Lifecycle: assessment (تكليف) -> collection order (أمر قبض) -> notification -> due -> objection -> review/correction -> collection (full/partial) -> receipt -> cash reconciliation.
--
-- LEGAL STATUS: NOTHING here encodes a legal rate, penalty, exemption, deadline or article. The revenue_rule registry is EMPTY on purpose;
-- every rule is created as 'pending_review'. Amounts are entered by staff; a reference calculation is only offered from a *verified* rule whose
-- effective period matches the assessment year. Receipt-number scope (per municipality / series / fiscal year) and the fiscal-year definition
-- (calendar year assumed) NEED LEGAL VERIFICATION (يلزم تحقق). No global unique constraint is placed on receipt numbers.
--
-- Idempotent and non-destructive: create ... if not exists, drop policy/constraint if exists then recreate; no deletes, no truncation.
-- Writes happen only through SECURITY DEFINER RPCs. Reads: RLS staff + demo rule, same as 0016.

-- 0) Ledger extension: append-only reversals (negative entries linked to the original). Totals that sum collection_entry net out automatically.
alter table public.collection_entry add column if not exists reversal_of uuid references public.collection_entry(id);
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.collection_entry'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%amount > 0%' and pg_get_constraintdef(oid) not ilike '%reversal_of%' loop
    execute format('alter table public.collection_entry drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.collection_entry drop constraint if exists collection_entry_amount_nonzero;
alter table public.collection_entry add constraint collection_entry_amount_nonzero check ((amount > 0) or (reversal_of is not null and amount < 0));
create unique index if not exists collection_entry_one_reversal on public.collection_entry (reversal_of) where reversal_of is not null;

-- 1) Taxpayer registry (مكلف). Opaque reference code (same rule as receivable.payer_ref); name optional: avoid collecting personal data that is not needed.
create table if not exists public.revenue_taxpayer (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  taxpayer_ref text not null check (taxpayer_ref ~ '^[A-Za-z0-9/_.#-]{1,60}$'),
  name_ar text, kind text not null default 'individual' check (kind in ('individual','company','institution','other')),
  status text not null default 'active' check (status in ('active','inactive')),
  note text, is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique (municipality_id, taxpayer_ref));

-- 2) Revenue rules registry. Empty by design. Rates/penalties/exemptions are loaded only after legal review; nothing is invented.
create table if not exists public.revenue_rule (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  fee_type text not null, instrument text not null, instrument_no text, article text,
  basis_ar text,                                    -- what the fee is levied on (e.g. area, value): free text as stated by the source
  rate numeric(18,6) check (rate is null or rate >= 0), rate_unit text check (rate_unit is null or rate_unit in ('fixed','per_unit','percent')), rate_currency text check (rate_currency is null or rate_currency in ('LBP','USD')),
  exemptions_ar text, penalties_ar text, applicability_ar text, source_url text,
  effective_from date not null, effective_to date,
  review_status text not null default 'pending_review' check (review_status in ('pending_review','verified','superseded','repealed','not_applicable')),
  review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from));
create index if not exists revenue_rule_lookup on public.revenue_rule (municipality_id, fee_type, effective_from);

-- 3) Receipt series (configurable) + counters. Numbering is unique per (municipality, series, fiscal year) ONLY.
create table if not exists public.revenue_receipt_series (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'), name_ar text not null, prefix text check (prefix is null or prefix ~ '^[A-Za-z0-9_-]{0,10}$'),
  is_active boolean not null default true,
  legal_scope_verified boolean not null default false,   -- stays false until a lawyer confirms the legal scope of receipt numbering
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique (municipality_id, code));

create table if not exists public.revenue_counter (
  municipality_id uuid not null references municipality(id),
  scope text not null, year int not null, last_seq int not null default 0,
  primary key (municipality_id, scope, year));

-- 4) Documented exemptions (full exemption of a fee type for a taxpayer over a period; no amounts invented)
create table if not exists public.revenue_exemption (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  taxpayer_id uuid not null references revenue_taxpayer(id),
  fee_type text not null, reason_ar text not null,
  instrument text, article text,                    -- as typed by staff: NOT verified
  decision_id uuid references municipal_decision(id), document_ref text,
  valid_from date not null, valid_to date,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','revoked')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_note text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check (decision_id is not null or nullif(btrim(coalesce(document_ref,'')),'') is not null));

-- 5) Assessments (تكليف)
create table if not exists public.revenue_assessment (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  taxpayer_id uuid not null references revenue_taxpayer(id),
  fee_type text not null, fiscal_year int not null check (fiscal_year between 1990 and 2100),
  object_ref text,                                   -- property / activity reference (opaque code), part of the duplicate key
  basis_label text, basis_value numeric(18,4) check (basis_value is null or basis_value >= 0),
  rule_id uuid references revenue_rule(id), rate_snapshot numeric(18,6), rate_unit_snapshot text, computed_amount numeric(14,2),   -- reference only, from a verified rule of that year
  amount numeric(14,2) not null check (amount > 0), currency text not null check (currency in ('LBP','USD')),
  due_on date not null, decision_id uuid references municipal_decision(id), note text,
  status text not null default 'assessed' check (status in ('assessed','ordered','cancelled')),
  cancel_reason text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists revenue_assessment_dup on public.revenue_assessment (municipality_id, taxpayer_id, fee_type, fiscal_year, coalesce(object_ref,'')) where status <> 'cancelled';
create index if not exists revenue_assessment_muni on public.revenue_assessment (municipality_id, fiscal_year, status);

-- 6) Collection orders (أمر قبض): one active order per assessment; linked to a finance receivable so arrears/collection-rate dashboards see it
create table if not exists public.revenue_order (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  assessment_id uuid not null references revenue_assessment(id),
  receivable_id uuid references receivable(id),
  order_year int not null, seq int not null, order_no text not null,
  amount numeric(14,2) not null check (amount > 0), currency text not null check (currency in ('LBP','USD')), due_on date not null,
  issued_on date not null default current_date,
  notified_on date, notification_method text, notification_proof text,   -- legal effects of notification (deadlines) are NOT computed: يلزم تحقق
  status text not null default 'issued' check (status in ('issued','notified','objected','collected','cancelled')),
  cancel_reason text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (municipality_id, order_year, seq));
create unique index if not exists revenue_order_one_active on public.revenue_order (assessment_id) where status <> 'cancelled';

-- 7) Objections and corrections
create table if not exists public.revenue_objection (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  order_id uuid not null references revenue_order(id),
  filed_on date not null, grounds_ar text not null,
  status text not null default 'filed' check (status in ('filed','accepted','rejected','withdrawn')),
  resolved_on date, resolution_note text, amount_before numeric(14,2), amount_after numeric(14,2),
  is_demo boolean not null default false,
  filed_by uuid references auth.users(id), resolved_by uuid references auth.users(id), created_at timestamptz not null default now());
create unique index if not exists revenue_objection_one_open on public.revenue_objection (order_id) where status = 'filed';

-- 8) Receipts (immutable; cancelled only by documented reversal)
create table if not exists public.revenue_receipt (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  series_id uuid not null references revenue_receipt_series(id),
  fiscal_year int not null, seq int not null, receipt_no text not null,
  order_id uuid not null references revenue_order(id),
  collection_entry_id uuid references collection_entry(id), reversal_entry_id uuid references collection_entry(id),
  amount numeric(14,2) not null check (amount > 0), currency text not null check (currency in ('LBP','USD')),
  method text not null check (method in ('cash','transfer','cheque')),
  collected_on date not null, cashier uuid references auth.users(id),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  status text not null default 'issued' check (status in ('issued','reversed')),
  reversed_at timestamptz, reversed_by uuid references auth.users(id), reversal_reason text, reversal_document_ref text,
  is_demo boolean not null default false, created_at timestamptz not null default now(),
  unique (municipality_id, series_id, fiscal_year, seq),
  unique (municipality_id, series_id, fiscal_year, receipt_no),
  unique (municipality_id, idempotency_key));
create index if not exists revenue_receipt_day on public.revenue_receipt (municipality_id, collected_on);
create index if not exists revenue_receipt_order on public.revenue_receipt (order_id);

-- 9) Cash register reconciliation (snapshot at close; compared with live data afterwards)
create table if not exists public.revenue_cash_close (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  business_date date not null, currency text not null check (currency in ('LBP','USD')),
  cashier uuid not null references auth.users(id),
  recorded_amount numeric(14,2) not null, receipt_count int not null, counted_amount numeric(14,2) not null check (counted_amount >= 0), difference numeric(14,2) not null,
  note text, is_demo boolean not null default false, created_at timestamptz not null default now(),
  unique (municipality_id, business_date, currency, cashier));

-- 10) Append-only event log of the revenue lifecycle
create table if not exists public.revenue_event (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  entity text not null, entity_id uuid not null, kind text not null, from_value text, to_value text, note text,
  actor uuid references auth.users(id), is_demo boolean not null default false, created_at timestamptz not null default now());
create index if not exists revenue_event_entity on public.revenue_event (entity, entity_id, created_at);

-- RLS: staff read with the demo rule; no write policies (writes only through RPCs). revenue_counter: no policy = no access.
do $$ declare t text; begin
  foreach t in array array['revenue_taxpayer','revenue_rule','revenue_receipt_series','revenue_exemption','revenue_assessment','revenue_order','revenue_objection','revenue_receipt','revenue_cash_close','revenue_event'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()))', t||'_staff_read', t);
  end loop;
end $$;
alter table public.revenue_counter enable row level security;

-- Immutability guards (receipts and events are never deleted; a receipt only moves issued -> reversed)
create or replace function public._rev_receipt_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'receipt_immutable' using errcode = '42501'; end if;
  if old.status = 'reversed' or (new.series_id, new.fiscal_year, new.seq, new.receipt_no, new.order_id, new.amount, new.currency, new.method, new.collected_on, new.idempotency_key, new.municipality_id, new.cashier)
     is distinct from (old.series_id, old.fiscal_year, old.seq, old.receipt_no, old.order_id, old.amount, old.currency, old.method, old.collected_on, old.idempotency_key, old.municipality_id, old.cashier) then
    raise exception 'receipt_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists revenue_receipt_guard on public.revenue_receipt;
create trigger revenue_receipt_guard before update or delete on public.revenue_receipt for each row execute function public._rev_receipt_guard();

create or replace function public._rev_append_only() returns trigger language plpgsql as $$
begin raise exception 'append_only' using errcode = '42501'; end $$;
drop trigger if exists revenue_event_guard on public.revenue_event;
create trigger revenue_event_guard before update or delete on public.revenue_event for each row execute function public._rev_append_only();
drop trigger if exists revenue_cash_close_guard on public.revenue_cash_close;
create trigger revenue_cash_close_guard before update or delete on public.revenue_cash_close for each row execute function public._rev_append_only();

-- Helpers
create or replace function public._rev_staff_muni() returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare m uuid;
begin
  select municipality_id into m from staff_member where user_id = auth.uid() order by created_at limit 1;
  if m is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return m;
end $$;

create or replace function public._rev_event(p_m uuid, p_entity text, p_id uuid, p_kind text, p_from text, p_to text, p_note text) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into revenue_event (municipality_id, entity, entity_id, kind, from_value, to_value, note, actor, is_demo) values (p_m, p_entity, p_id, p_kind, p_from, p_to, nullif(left(btrim(coalesce(p_note,'')),500),''), auth.uid(), is_demo_staff());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (p_m, auth.uid(), 'revenue.' || p_kind, p_entity, p_id::text, jsonb_build_object('from', p_from, 'to', p_to));
end $$;

create or replace function public._rev_next(p_m uuid, p_scope text, p_year int) returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  insert into revenue_counter (municipality_id, scope, year, last_seq) values (p_m, p_scope, p_year, 1)
  on conflict (municipality_id, scope, year) do update set last_seq = revenue_counter.last_seq + 1 returning last_seq into n;
  return n;
end $$;

-- Rule selection by the ASSESSMENT YEAR's effective period (never "today"): exactly one verified rule intersecting the year, else NULL (ambiguous or not loaded).
create or replace function public._rev_pick_rule(p_m uuid, p_fee text, p_year int) returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare ids uuid[];
begin
  select array_agg(id) into ids from revenue_rule where municipality_id = p_m and fee_type = p_fee and review_status = 'verified'
    and effective_from <= make_date(p_year,12,31) and (effective_to is null or effective_to >= make_date(p_year,1,1));
  if ids is null or array_length(ids,1) <> 1 then return null; end if;
  return ids[1];
end $$;

-- Net collected on an order (issued receipts only)
create or replace function public._rev_net(p_order uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(amount),0) from revenue_receipt where order_id = p_order and status = 'issued' $$;

-- Re-derives the order status from facts (cancelled stays cancelled) and keeps the finance receivable in step.
create or replace function public._rev_sync_order(p_order uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare o revenue_order%rowtype; net numeric; st text;
begin
  select * into o from revenue_order where id = p_order for update;
  if not found or o.status = 'cancelled' then return; end if;
  net := _rev_net(p_order);
  st := case when exists (select 1 from revenue_objection where order_id = p_order and status = 'filed') then 'objected'
             when net >= o.amount then 'collected' when o.notified_on is not null then 'notified' else 'issued' end;
  update revenue_order set status = st, updated_at = now() where id = p_order;
  if o.receivable_id is not null then
    update receivable set amount = o.amount, status = case when net >= o.amount then 'settled' else 'open' end, settled_on = case when net >= o.amount then current_date else null end where id = o.receivable_id and status <> 'cancelled';
  end if;
end $$;

-- ====================== RPCs ======================
create or replace function public.revenue_taxpayer_add(p_ref text, p_name text default null, p_kind text default 'individual', p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; r text := btrim(coalesce(p_ref,''));
begin
  if r !~ '^[A-Za-z0-9/_.#-]{1,60}$' or r ~ '^[+]?[0-9]{7,}$' then raise exception 'bad_payer_ref' using errcode = '22023'; end if;
  if p_kind is null or p_kind not in ('individual','company','institution','other') then raise exception 'bad_input' using errcode = '22023'; end if;
  if exists (select 1 from revenue_taxpayer where municipality_id = m and taxpayer_ref = r) then raise exception 'duplicate_taxpayer' using errcode = '23505'; end if;
  insert into revenue_taxpayer (municipality_id, taxpayer_ref, name_ar, kind, note, is_demo, created_by) values (m, r, nullif(left(btrim(coalesce(p_name,'')),200),''), p_kind, nullif(left(btrim(coalesce(p_note,'')),500),''), is_demo_staff(), auth.uid()) returning id into i;
  perform _rev_event(m, 'taxpayer', i, 'taxpayer_added', null, 'active', null);
  return i;
end $$;

create or replace function public.revenue_rule_add(p_fee_type text, p_instrument text, p_instrument_no text, p_article text, p_basis text, p_rate numeric, p_rate_unit text, p_rate_currency text,
  p_exemptions text, p_penalties text, p_applicability text, p_source_url text, p_from date, p_to date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_fee_type,'')) = '' or btrim(coalesce(p_instrument,'')) = '' or p_from is null then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_to is not null and p_to < p_from then raise exception 'bad_date' using errcode = '22023'; end if;
  if p_rate is not null and (p_rate < 0 or p_rate_unit is null or p_rate_unit not in ('fixed','per_unit','percent')) then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_rate is not null and p_rate_unit <> 'percent' and (p_rate_currency is null or p_rate_currency not in ('LBP','USD')) then raise exception 'bad_currency' using errcode = '22023'; end if;
  insert into revenue_rule (municipality_id, fee_type, instrument, instrument_no, article, basis_ar, rate, rate_unit, rate_currency, exemptions_ar, penalties_ar, applicability_ar, source_url, effective_from, effective_to, is_demo, created_by)
  values (m, left(btrim(p_fee_type),200), left(btrim(p_instrument),200), nullif(left(btrim(coalesce(p_instrument_no,'')),60),''), nullif(left(btrim(coalesce(p_article,'')),60),''), nullif(left(btrim(coalesce(p_basis,'')),500),''),
    p_rate, case when p_rate is null then null else p_rate_unit end, case when p_rate is null then null else p_rate_currency end,
    nullif(left(btrim(coalesce(p_exemptions,'')),2000),''), nullif(left(btrim(coalesce(p_penalties,'')),2000),''), nullif(left(btrim(coalesce(p_applicability,'')),1000),''), nullif(left(btrim(coalesce(p_source_url,'')),500),''),
    p_from, p_to, is_demo_staff(), auth.uid()) returning id into i;
  perform _rev_event(m, 'rule', i, 'rule_added', null, 'pending_review', null);
  return i;
end $$;

create or replace function public.revenue_rule_set_review(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); old text;
begin
  if p_status is null or p_status not in ('pending_review','verified','superseded','repealed','not_applicable') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_status = 'verified' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'reason_required' using errcode = '22023'; end if;   -- who checked what against which source
  select review_status into old from revenue_rule where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update revenue_rule set review_status = p_status, review_note = nullif(left(btrim(coalesce(p_note,'')),500),''), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform _rev_event(m, 'rule', p_id, 'rule_review', old, p_status, p_note);
end $$;

create or replace function public.revenue_series_add(p_code text, p_name text, p_prefix text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if coalesce(p_code,'') !~ '^[A-Za-z0-9_-]{1,20}$' or btrim(coalesce(p_name,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if coalesce(p_prefix,'') !~ '^[A-Za-z0-9_-]{0,10}$' then raise exception 'bad_input' using errcode = '22023'; end if;
  if exists (select 1 from revenue_receipt_series where municipality_id = m and code = p_code) then raise exception 'duplicate_series' using errcode = '23505'; end if;
  insert into revenue_receipt_series (municipality_id, code, name_ar, prefix, is_demo, created_by) values (m, p_code, left(btrim(p_name),200), nullif(p_prefix,''), is_demo_staff(), auth.uid()) returning id into i;
  perform _rev_event(m, 'series', i, 'series_added', null, p_code, null);
  return i;
end $$;

create or replace function public.revenue_series_set_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update revenue_receipt_series set is_active = coalesce(p_active,false) where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _rev_event(m, 'series', p_id, 'series_active', null, coalesce(p_active,false)::text, null);
end $$;

create or replace function public.revenue_exemption_add(p_taxpayer uuid, p_fee_type text, p_reason text, p_instrument text, p_article text, p_decision uuid, p_document_ref text, p_from date, p_to date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_fee_type,'')) = '' or length(btrim(coalesce(p_reason,''))) < 5 or p_from is null then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_to is not null and p_to < p_from then raise exception 'bad_date' using errcode = '22023'; end if;
  if p_decision is null and nullif(btrim(coalesce(p_document_ref,'')),'') is null then raise exception 'document_required' using errcode = '22023'; end if;
  if not exists (select 1 from revenue_taxpayer where id = p_taxpayer and municipality_id = m) then raise exception 'taxpayer_not_found' using errcode = 'P0002'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'decision_not_found' using errcode = 'P0002'; end if;
  insert into revenue_exemption (municipality_id, taxpayer_id, fee_type, reason_ar, instrument, article, decision_id, document_ref, valid_from, valid_to, is_demo, created_by)
  values (m, p_taxpayer, left(btrim(p_fee_type),200), left(btrim(p_reason),1000), nullif(left(btrim(coalesce(p_instrument,'')),200),''), nullif(left(btrim(coalesce(p_article,'')),60),''), p_decision, nullif(left(btrim(coalesce(p_document_ref,'')),200),''), p_from, p_to, is_demo_staff(), auth.uid()) returning id into i;
  perform _rev_event(m, 'exemption', i, 'exemption_added', null, 'pending_review', null);
  return i;
end $$;

create or replace function public.revenue_exemption_review(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); old text;
begin
  if p_status is null or p_status not in ('approved','rejected','revoked') then raise exception 'bad_input' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select status into old from revenue_exemption where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update revenue_exemption set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(btrim(p_note),500) where id = p_id;
  perform _rev_event(m, 'exemption', p_id, 'exemption_review', old, p_status, p_note);
end $$;

create or replace function public.revenue_assess(p_taxpayer uuid, p_fee_type text, p_year int, p_object_ref text, p_basis_label text, p_basis_value numeric, p_amount numeric, p_currency text, p_due_on date, p_decision uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; rid uuid; rl revenue_rule%rowtype; comp numeric; obj text := nullif(left(btrim(coalesce(p_object_ref,'')),60),''); fee text := left(btrim(coalesce(p_fee_type,'')),200);
begin
  if fee = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_year is null or p_year < 1990 or p_year > 2100 then raise exception 'bad_year' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if p_currency is null or p_currency not in ('LBP','USD') then raise exception 'bad_currency' using errcode = '22023'; end if;
  if p_due_on is null or p_due_on < date '2000-01-01' or p_due_on > date '2100-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  if p_basis_value is not null and p_basis_value < 0 then raise exception 'bad_input' using errcode = '22023'; end if;
  if obj is not null and obj !~ '^[A-Za-z0-9/_.#-]{1,60}$' then raise exception 'bad_payer_ref' using errcode = '22023'; end if;
  if not exists (select 1 from revenue_taxpayer where id = p_taxpayer and municipality_id = m and status = 'active') then raise exception 'taxpayer_not_found' using errcode = 'P0002'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'decision_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from revenue_exemption where municipality_id = m and taxpayer_id = p_taxpayer and fee_type = fee and status = 'approved'
             and valid_from <= make_date(p_year,12,31) and (valid_to is null or valid_to >= make_date(p_year,1,1))) then raise exception 'exempt_documented' using errcode = '22023'; end if;
  if exists (select 1 from revenue_assessment where municipality_id = m and taxpayer_id = p_taxpayer and fee_type = fee and fiscal_year = p_year and coalesce(object_ref,'') = coalesce(obj,'') and status <> 'cancelled') then raise exception 'duplicate_assessment' using errcode = '23505'; end if;
  -- rate chosen by the assessment year's period; reference amount only when a single verified rule applies and a basis value was given
  rid := _rev_pick_rule(m, fee, p_year);
  if rid is not null then
    select * into rl from revenue_rule where id = rid;
    if rl.rate is not null and (rl.rate_unit = 'fixed' or p_basis_value is not null) and (rl.rate_unit = 'percent' or rl.rate_currency = p_currency) then
      comp := round(case rl.rate_unit when 'fixed' then rl.rate when 'per_unit' then p_basis_value * rl.rate else p_basis_value * rl.rate / 100 end, 2);
    end if;
  end if;
  insert into revenue_assessment (municipality_id, taxpayer_id, fee_type, fiscal_year, object_ref, basis_label, basis_value, rule_id, rate_snapshot, rate_unit_snapshot, computed_amount, amount, currency, due_on, decision_id, note, is_demo, created_by)
  values (m, p_taxpayer, fee, p_year, obj, nullif(left(btrim(coalesce(p_basis_label,'')),200),''), p_basis_value, rid, rl.rate, rl.rate_unit, comp, round(p_amount,2), p_currency, p_due_on, p_decision, nullif(left(btrim(coalesce(p_note,'')),500),''), is_demo_staff(), auth.uid()) returning id into i;
  perform _rev_event(m, 'assessment', i, 'assessed', null, 'assessed', case when rid is null then 'بلا قاعدة محمَّلة ومتحقَّق منها' else null end);
  return i;
end $$;

create or replace function public.revenue_assessment_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a revenue_assessment%rowtype;
begin
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into a from revenue_assessment where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.status <> 'assessed' then raise exception 'bad_state' using errcode = '22023'; end if;   -- an ordered assessment is cancelled by cancelling its order
  update revenue_assessment set status = 'cancelled', cancel_reason = left(btrim(p_reason),500), updated_at = now() where id = p_id;
  perform _rev_event(m, 'assessment', p_id, 'assessment_cancelled', 'assessed', 'cancelled', p_reason);
end $$;

create or replace function public.revenue_order_issue(p_assessment uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a revenue_assessment%rowtype; t revenue_taxpayer%rowtype; i uuid; rv uuid; y int := extract(year from current_date)::int; s int;
begin
  select * into a from revenue_assessment where id = p_assessment and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.status <> 'assessed' then raise exception 'bad_state' using errcode = '22023'; end if;
  if exists (select 1 from revenue_order where assessment_id = p_assessment and status <> 'cancelled') then raise exception 'order_exists' using errcode = '23505'; end if;
  select * into t from revenue_taxpayer where id = a.taxpayer_id;
  insert into receivable (municipality_id, fee_type, amount, currency, due_on, payer_ref, is_demo, created_by) values (m, left(a.fee_type,200), a.amount, a.currency, a.due_on, t.taxpayer_ref, a.is_demo, auth.uid()) returning id into rv;
  s := _rev_next(m, 'order', y);
  insert into revenue_order (municipality_id, assessment_id, receivable_id, order_year, seq, order_no, amount, currency, due_on, is_demo, created_by)
  values (m, a.id, rv, y, s, y::text || '/' || lpad(s::text, 5, '0'), a.amount, a.currency, a.due_on, a.is_demo, auth.uid()) returning id into i;
  update revenue_assessment set status = 'ordered', updated_at = now() where id = a.id;
  perform _rev_event(m, 'order', i, 'order_issued', null, 'issued', null);
  return i;
end $$;

create or replace function public.revenue_order_notify(p_order uuid, p_date date, p_method text, p_proof text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); o revenue_order%rowtype;
begin
  if p_date is null or p_date > current_date or p_date < date '2000-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  if btrim(coalesce(p_method,'')) = '' or btrim(coalesce(p_proof,'')) = '' then raise exception 'proof_required' using errcode = '22023'; end if;
  select * into o from revenue_order where id = p_order and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled' using errcode = '22023'; end if;
  update revenue_order set notified_on = p_date, notification_method = left(btrim(p_method),100), notification_proof = left(btrim(p_proof),300), updated_at = now() where id = p_order;
  perform _rev_sync_order(p_order);
  perform _rev_event(m, 'order', p_order, 'order_notified', o.status, 'notified', p_proof);
end $$;

create or replace function public.revenue_order_cancel(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); o revenue_order%rowtype;
begin
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into o from revenue_order where id = p_order and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled' using errcode = '22023'; end if;
  if _rev_net(p_order) > 0 then raise exception 'has_collections' using errcode = '22023'; end if;   -- reverse receipts first (documented reversal)
  update revenue_order set status = 'cancelled', cancel_reason = left(btrim(p_reason),500), updated_at = now() where id = p_order;
  update revenue_assessment set status = 'assessed', updated_at = now() where id = o.assessment_id;
  if o.receivable_id is not null then update receivable set status = 'cancelled' where id = o.receivable_id; end if;
  perform _rev_event(m, 'order', p_order, 'order_cancelled', o.status, 'cancelled', p_reason);
end $$;

create or replace function public.revenue_objection_file(p_order uuid, p_filed_on date, p_grounds text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); o revenue_order%rowtype; i uuid;
begin
  if p_filed_on is null or p_filed_on > current_date or p_filed_on < date '2000-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_grounds,''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into o from revenue_order where id = p_order and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled' using errcode = '22023'; end if;
  if exists (select 1 from revenue_objection where order_id = p_order and status = 'filed') then raise exception 'objection_exists' using errcode = '23505'; end if;
  -- Whether the objection is timely is NOT computed: the legal objection period and forum need legal verification (يلزم تحقق).
  insert into revenue_objection (municipality_id, order_id, filed_on, grounds_ar, amount_before, is_demo, filed_by) values (m, p_order, p_filed_on, left(btrim(p_grounds),2000), o.amount, o.is_demo, auth.uid()) returning id into i;
  perform _rev_sync_order(p_order);
  perform _rev_event(m, 'order', p_order, 'objection_filed', o.status, 'objected', p_grounds);
  return i;
end $$;

create or replace function public.revenue_objection_resolve(p_objection uuid, p_outcome text, p_corrected numeric default null, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); ob revenue_objection%rowtype; o revenue_order%rowtype; net numeric;
begin
  if p_outcome is null or p_outcome not in ('accepted','rejected','withdrawn') then raise exception 'bad_input' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_note,''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into ob from revenue_objection where id = p_objection and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if ob.status <> 'filed' then raise exception 'bad_state' using errcode = '22023'; end if;
  select * into o from revenue_order where id = ob.order_id for update;
  if p_outcome = 'accepted' then
    if p_corrected is null or p_corrected <= 0 or p_corrected > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
    net := _rev_net(o.id);
    if round(p_corrected,2) < net then raise exception 'below_collected' using errcode = '22023'; end if;   -- refund requires documented receipt reversal first
    update revenue_order set amount = round(p_corrected,2), updated_at = now() where id = o.id;
    update revenue_assessment set amount = round(p_corrected,2), updated_at = now() where id = o.assessment_id;
    perform _rev_event(m, 'order', o.id, 'amount_corrected', o.amount::text, round(p_corrected,2)::text, p_note);
  end if;
  update revenue_objection set status = p_outcome, resolved_on = current_date, resolution_note = left(btrim(p_note),1000), amount_after = case when p_outcome = 'accepted' then round(p_corrected,2) else o.amount end, resolved_by = auth.uid() where id = p_objection;
  perform _rev_sync_order(o.id);
  perform _rev_event(m, 'objection', p_objection, 'objection_resolved', 'filed', p_outcome, p_note);
end $$;

-- Collection: idempotent (client key), locks the order, never exceeds the remaining amount, allocates the number per (municipality, series, fiscal year),
-- writes the ledger entry linked to the finance receivable so existing dashboards stay consistent.
create or replace function public.revenue_collect(p_order uuid, p_amount numeric, p_method text, p_series uuid, p_key text, p_date date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _rev_staff_muni(); o revenue_order%rowtype; s revenue_receipt_series%rowtype; ex revenue_receipt%rowtype; net numeric; amt numeric; d date := coalesce(p_date, current_date);
  fy int; sq int; rno text; ce uuid; rid uuid;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'idempotency_key_required' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  amt := round(p_amount,2);
  if p_method is null or p_method not in ('cash','transfer','cheque') then raise exception 'bad_method' using errcode = '22023'; end if;
  if d > current_date or d < current_date - 31 then raise exception 'bad_date' using errcode = '22023'; end if;
  select * into o from revenue_order where id = p_order and municipality_id = m for update;   -- serialises concurrent collections on the same order
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into ex from revenue_receipt where municipality_id = m and idempotency_key = p_key;
  if found then
    if ex.order_id = p_order and ex.amount = amt and ex.cashier = auth.uid() then return ex.id; end if;   -- replay of the same request: same receipt, no double charge
    raise exception 'idempotency_conflict' using errcode = '23505';
  end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled' using errcode = '22023'; end if;
  if exists (select 1 from revenue_objection where order_id = p_order and status = 'filed') then raise exception 'objection_pending' using errcode = '22023'; end if;
  select * into s from revenue_receipt_series where id = p_series and municipality_id = m;
  if not found or not s.is_active then raise exception 'series_not_found' using errcode = 'P0002'; end if;
  net := _rev_net(p_order);
  if net >= o.amount then raise exception 'order_collected' using errcode = '22023'; end if;
  if amt > o.amount - net then raise exception 'exceeds_remaining' using errcode = '22023'; end if;
  fy := extract(year from d)::int;
  sq := _rev_next(m, 'rcpt:' || s.id::text, fy);
  rno := coalesce(nullif(s.prefix,'') || '-', '') || fy::text || '/' || lpad(sq::text, 6, '0');
  insert into collection_entry (municipality_id, service_label, receipt_no, amount, currency, method, collected_by, is_demo, receivable_id)
  values (m, left(coalesce((select fee_type from revenue_assessment where id = o.assessment_id), 'تحصيل'),200), left(rno,60), amt, o.currency, p_method, auth.uid(), o.is_demo, o.receivable_id) returning id into ce;
  insert into revenue_receipt (municipality_id, series_id, fiscal_year, seq, receipt_no, order_id, collection_entry_id, amount, currency, method, collected_on, cashier, idempotency_key, is_demo)
  values (m, s.id, fy, sq, rno, p_order, ce, amt, o.currency, p_method, d, auth.uid(), p_key, o.is_demo) returning id into rid;
  perform _rev_sync_order(p_order);
  perform _rev_event(m, 'receipt', rid, 'receipt_issued', null, rno, null);
  return rid;
end $$;

-- Cancellation of a receipt = documented reversal only (mayor/admin). The receipt row stays; a negative ledger entry offsets it.
create or replace function public.revenue_receipt_reverse(p_receipt uuid, p_reason text, p_document_ref text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); r revenue_receipt%rowtype; o revenue_order%rowtype; orig collection_entry%rowtype; rev uuid;
begin
  if length(btrim(coalesce(p_reason,''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_document_ref,''))) < 3 then raise exception 'document_required' using errcode = '22023'; end if;
  select * into r from revenue_receipt where id = p_receipt and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'issued' then raise exception 'already_reversed' using errcode = '23505'; end if;
  select * into o from revenue_order where id = r.order_id for update;
  select * into orig from collection_entry where id = r.collection_entry_id;
  insert into collection_entry (municipality_id, service_label, receipt_no, amount, currency, method, collected_by, is_demo, receivable_id, reversal_of)
  values (m, left('إلغاء إيصال: ' || coalesce(orig.service_label,''),200), left(r.receipt_no || '/REV',60), -r.amount, r.currency, r.method, auth.uid(), r.is_demo, orig.receivable_id, orig.id) returning id into rev;
  update revenue_receipt set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = left(btrim(p_reason),500), reversal_document_ref = left(btrim(p_document_ref),200), reversal_entry_id = rev where id = p_receipt;
  perform _rev_sync_order(r.order_id);
  perform _rev_event(m, 'receipt', p_receipt, 'receipt_reversed', 'issued', 'reversed', p_reason);
  return rev;
end $$;

-- Daily cash close for the calling cashier: snapshots the recorded cash total of their issued receipts and compares with the counted cash.
create or replace function public.revenue_cash_close(p_date date, p_currency text, p_counted numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _rev_staff_muni(); rec numeric; cnt int; i uuid; diff numeric;
begin
  if p_date is null or p_date > current_date or p_date < date '2000-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  if p_currency is null or p_currency not in ('LBP','USD') then raise exception 'bad_currency' using errcode = '22023'; end if;
  if p_counted is null or p_counted < 0 or p_counted > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if exists (select 1 from revenue_cash_close where municipality_id = m and business_date = p_date and currency = p_currency and cashier = auth.uid()) then raise exception 'already_closed' using errcode = '23505'; end if;
  select coalesce(sum(amount),0), count(*) into rec, cnt from revenue_receipt where municipality_id = m and collected_on = p_date and currency = p_currency and cashier = auth.uid() and method = 'cash' and status = 'issued';
  diff := round(p_counted,2) - rec;
  if diff <> 0 and length(btrim(coalesce(p_note,''))) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  insert into revenue_cash_close (municipality_id, business_date, currency, cashier, recorded_amount, receipt_count, counted_amount, difference, note, is_demo)
  values (m, p_date, p_currency, auth.uid(), rec, cnt, round(p_counted,2), diff, nullif(left(btrim(coalesce(p_note,'')),500),''), is_demo_staff()) returning id into i;
  perform _rev_event(m, 'cash_close', i, 'cash_closed', null, diff::text, p_note);
  return i;
end $$;

-- Grants: helpers are internal; RPCs only for authenticated.
revoke all on function public._rev_staff_muni() from public, anon, authenticated;
revoke all on function public._rev_event(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public._rev_next(uuid, text, int) from public, anon, authenticated;
revoke all on function public._rev_pick_rule(uuid, text, int) from public, anon, authenticated;
revoke all on function public._rev_net(uuid) from public, anon, authenticated;
revoke all on function public._rev_sync_order(uuid) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array[
    'revenue_taxpayer_add(text,text,text,text)',
    'revenue_rule_add(text,text,text,text,text,numeric,text,text,text,text,text,text,date,date)', 'revenue_rule_set_review(uuid,text,text)',
    'revenue_series_add(text,text,text)', 'revenue_series_set_active(uuid,boolean)',
    'revenue_exemption_add(uuid,text,text,text,text,uuid,text,date,date)', 'revenue_exemption_review(uuid,text,text)',
    'revenue_assess(uuid,text,int,text,text,numeric,numeric,text,date,uuid,text)', 'revenue_assessment_cancel(uuid,text)',
    'revenue_order_issue(uuid)', 'revenue_order_notify(uuid,date,text,text)', 'revenue_order_cancel(uuid,text)',
    'revenue_objection_file(uuid,date,text)', 'revenue_objection_resolve(uuid,text,numeric,text)',
    'revenue_collect(uuid,numeric,text,uuid,text,date)', 'revenue_receipt_reverse(uuid,text,text)', 'revenue_cash_close(date,text,numeric,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
