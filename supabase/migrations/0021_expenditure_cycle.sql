-- Public-accounting EXPENDITURE LIFECYCLE on top of the finance module (0016/0019).
-- credit availability -> commitment -> liquidation (invoice + delivery proof) -> payment order -> payment -> reconciliation.
--
-- Design (no new money ledger is duplicated):
--  * financial_commitment and expenditure are EXTENDED (new nullable columns); cycle RPCs write into them so existing dashboards stay correct.
--  * Corrections are APPEND-ONLY reversal rows with NEGATIVE amounts (entry_kind='reversal', reverses_id -> original). Net = original + reversals.
--    Approved records created by the cycle (cycle_entry = true) can never be UPDATEd or DELETEd (trigger). Legacy rows are untouched.
--  * Currency: every record keeps doc_currency/doc_amount/exchange_rate/rate_date/rate_source; `amount` is the ACCOUNTING value in the budget line's currency.
--    exchange_rate = units of the budget-line currency per 1 unit of the document currency. Different currencies are never summed.
--    Using USD is NOT a violation by itself; a rate (with date + source) is required only when the document currency differs from the line currency.
--  * Concurrency: every stage takes SELECT ... FOR UPDATE on the budget line first, so concurrent operations on a line are serialized.
--  * Segregation of duties: table exp_function_assignment (commit/liquidate/order/pay/reconcile) + rule that the same user cannot perform two
--    consecutive stages of the same chain unless a documented exp_sod_exception exists.
--  * No monetary threshold and no accounting regime is hard-coded. Legal references are stored as text with review_status 'pending_review'.
--  * Legacy RPCs (finance_commit/finance_pay) keep working until a municipality turns on enforcement (exp_set_enforcement); then a trigger blocks
--    inserts that did not come through the cycle (error use_expenditure_cycle).
-- Idempotent; no data deletes. The only constraint changes are relaxing `amount > 0` to `amount <> 0` (with a sign rule per entry_kind) so reversals can be stored.

-- ---------------------------------------------------------------- 1) settings, assignments, counters, exceptions
create table if not exists public.exp_setting (
  municipality_id uuid primary key references public.municipality(id),
  enforce_cycle boolean not null default false,
  updated_by uuid, updated_at timestamptz not null default now());

create table if not exists public.exp_function_assignment (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  user_id uuid not null references auth.users(id),
  fn text not null check (fn in ('commit','liquidate','order','pay','reconcile')),
  active boolean not null default true,
  basis_ref text,                 -- reference of the delegation / designation document (text, pending legal review)
  note text,
  granted_by uuid, created_at timestamptz not null default now(),
  revoked_by uuid, revoked_at timestamptz);
create unique index if not exists exp_fn_active_uq on public.exp_function_assignment (municipality_id, user_id, fn) where active;

create table if not exists public.exp_counter (
  municipality_id uuid not null references public.municipality(id), yr int not null, kind text not null, last_no int not null default 0,
  primary key (municipality_id, yr, kind));

create table if not exists public.exp_exception (          -- documented exceptional path (bypasses the general cycle; always flagged)
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  line_id uuid not null references public.budget_line(id),
  commitment_id uuid references public.financial_commitment(id),
  scope text not null check (scope in ('skip_liquidation','direct_payment')),
  approved_amount numeric(14,2) not null check (approved_amount > 0),   -- in the budget line currency
  legal_justification text not null, legal_reference text not null,
  reference_review text not null default 'pending_review' check (reference_review in ('pending_review','verified')),
  created_by uuid, created_at timestamptz not null default now(), is_demo boolean not null default false,
  check ((scope = 'skip_liquidation' and commitment_id is not null) or (scope = 'direct_payment' and commitment_id is null)));

create table if not exists public.exp_sod_exception (      -- documented permission for ONE user to do consecutive stages
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  line_id uuid not null references public.budget_line(id),
  commitment_id uuid references public.financial_commitment(id),   -- null = every chain on the line
  user_id uuid not null references auth.users(id),
  justification text not null, legal_reference text not null,
  reference_review text not null default 'pending_review' check (reference_review in ('pending_review','verified')),
  created_by uuid, created_at timestamptz not null default now(), is_demo boolean not null default false);
create unique index if not exists exp_sod_uq on public.exp_sod_exception (line_id, coalesce(commitment_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);

-- ---------------------------------------------------------------- 2) extend commitment / expenditure
alter table public.financial_commitment
  add column if not exists cycle_entry boolean not null default false,
  add column if not exists entry_kind text not null default 'commitment' check (entry_kind in ('commitment','reversal')),
  add column if not exists reverses_id uuid references public.financial_commitment(id),
  add column if not exists commitment_no text,
  add column if not exists doc_currency text check (doc_currency is null or doc_currency in ('LBP','USD')),
  add column if not exists doc_amount numeric(14,2),
  add column if not exists exchange_rate numeric(18,8),
  add column if not exists rate_date date, add column if not exists rate_source text,
  add column if not exists basis_ref text,
  add column if not exists decision_id uuid references public.municipal_decision(id),
  add column if not exists contract_id uuid references public.contract(id),
  add column if not exists available_before numeric(14,2),
  add column if not exists idempotency_key text, add column if not exists reason text,
  add column if not exists sod_exception_id uuid references public.exp_sod_exception(id);

alter table public.financial_commitment drop constraint if exists financial_commitment_amount_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fc_amount_sign_chk') then
    alter table public.financial_commitment add constraint fc_amount_sign_chk check ((entry_kind = 'commitment' and amount > 0) or (entry_kind = 'reversal' and amount < 0 and reverses_id is not null));
  end if;
end $$;
create unique index if not exists fc_idem_uq on public.financial_commitment (municipality_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists fc_no_uq on public.financial_commitment (municipality_id, commitment_no) where commitment_no is not null;
create index if not exists fc_reverses on public.financial_commitment (reverses_id) where reverses_id is not null;

create table if not exists public.exp_liquidation (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  line_id uuid not null references public.budget_line(id),
  commitment_id uuid not null references public.financial_commitment(id),
  liquidation_no text not null,
  entry_kind text not null default 'liquidation' check (entry_kind in ('liquidation','reversal')),
  reverses_id uuid references public.exp_liquidation(id),
  amount numeric(14,2) not null check (amount <> 0),
  doc_currency text check (doc_currency in ('LBP','USD')), doc_amount numeric(14,2),
  exchange_rate numeric(18,8), rate_date date, rate_source text,
  invoice_no text, invoice_date date, evidence_ref text, delivery_ref text, delivered_on date,
  note text, reason text, sod_exception_id uuid references public.exp_sod_exception(id),
  idempotency_key text not null, actor uuid, is_demo boolean not null default false, created_at timestamptz not null default now(),
  check ((entry_kind = 'liquidation' and amount > 0 and invoice_no is not null and evidence_ref is not null and delivery_ref is not null)
      or (entry_kind = 'reversal' and amount < 0 and reverses_id is not null)));
create unique index if not exists exp_liq_no_uq on public.exp_liquidation (municipality_id, liquidation_no);
create unique index if not exists exp_liq_idem_uq on public.exp_liquidation (municipality_id, idempotency_key);
create index if not exists exp_liq_commitment on public.exp_liquidation (commitment_id);
create index if not exists exp_liq_reverses on public.exp_liquidation (reverses_id) where reverses_id is not null;

create table if not exists public.exp_payment_order (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  line_id uuid not null references public.budget_line(id),
  commitment_id uuid references public.financial_commitment(id),
  liquidation_id uuid references public.exp_liquidation(id),
  order_no text not null, order_date date not null,
  entry_kind text not null default 'order' check (entry_kind in ('order','reversal')),
  reverses_id uuid references public.exp_payment_order(id),
  amount numeric(14,2) not null check (amount <> 0),
  doc_currency text check (doc_currency in ('LBP','USD')), doc_amount numeric(14,2),
  exchange_rate numeric(18,8), rate_date date, rate_source text,
  beneficiary text not null,
  is_exceptional boolean not null default false, exception_id uuid references public.exp_exception(id),
  sod_exception_id uuid references public.exp_sod_exception(id),
  note text, reason text,
  idempotency_key text not null, actor uuid, is_demo boolean not null default false, created_at timestamptz not null default now(),
  check ((entry_kind = 'order' and amount > 0 and (liquidation_id is not null or exception_id is not null))
      or (entry_kind = 'reversal' and amount < 0 and reverses_id is not null)));
create unique index if not exists exp_po_no_uq on public.exp_payment_order (municipality_id, order_no);
create unique index if not exists exp_po_idem_uq on public.exp_payment_order (municipality_id, idempotency_key);
create index if not exists exp_po_liq on public.exp_payment_order (liquidation_id);
create index if not exists exp_po_commitment on public.exp_payment_order (commitment_id);
create index if not exists exp_po_reverses on public.exp_payment_order (reverses_id) where reverses_id is not null;

alter table public.expenditure
  add column if not exists cycle_entry boolean not null default false,
  add column if not exists entry_kind text not null default 'payment' check (entry_kind in ('payment','reversal')),
  add column if not exists reverses_id uuid references public.expenditure(id),
  add column if not exists payment_no text,
  add column if not exists payment_order_id uuid references public.exp_payment_order(id),
  add column if not exists payment_method text check (payment_method is null or payment_method in ('cash','transfer','cheque')),
  add column if not exists proof_ref text, add column if not exists note text, add column if not exists reason text,
  add column if not exists doc_currency text check (doc_currency is null or doc_currency in ('LBP','USD')),
  add column if not exists doc_amount numeric(14,2),
  add column if not exists exchange_rate numeric(18,8), add column if not exists rate_date date, add column if not exists rate_source text,
  add column if not exists exception_id uuid references public.exp_exception(id),
  add column if not exists sod_exception_id uuid references public.exp_sod_exception(id),
  add column if not exists idempotency_key text;
alter table public.expenditure drop constraint if exists expenditure_amount_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exp_amount_sign_chk') then
    alter table public.expenditure add constraint exp_amount_sign_chk check ((entry_kind = 'payment' and amount > 0) or (entry_kind = 'reversal' and amount < 0 and reverses_id is not null));
  end if;
end $$;
create unique index if not exists expenditure_idem_uq on public.expenditure (municipality_id, idempotency_key) where idempotency_key is not null;
-- the same proof (cheque no / transfer reference / cash receipt no) can never justify two payments
create unique index if not exists expenditure_proof_uq on public.expenditure (municipality_id, payment_method, lower(btrim(proof_ref))) where entry_kind = 'payment' and proof_ref is not null and cycle_entry;
create unique index if not exists expenditure_no_uq on public.expenditure (municipality_id, payment_no) where payment_no is not null;
create index if not exists expenditure_order on public.expenditure (payment_order_id) where payment_order_id is not null;
create index if not exists expenditure_reverses on public.expenditure (reverses_id) where reverses_id is not null;

create table if not exists public.exp_reconciliation (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  payment_id uuid not null references public.expenditure(id),
  status text not null check (status in ('matched','discrepancy')),
  statement_ref text not null, statement_date date not null,
  statement_amount numeric(14,2) not null, statement_currency text not null check (statement_currency in ('LBP','USD')),
  expected_amount numeric(14,2), note text,
  sod_exception_id uuid references public.exp_sod_exception(id),
  actor uuid, is_demo boolean not null default false, created_at timestamptz not null default now());
create unique index if not exists exp_rec_uq on public.exp_reconciliation (payment_id, lower(btrim(statement_ref)));

-- ---------------------------------------------------------------- 3) RLS (read for staff of the municipality, demo rule) - writes only via RPCs
do $$ declare t text; begin
  foreach t in array array['exp_liquidation','exp_payment_order','exp_reconciliation','exp_exception'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()))', t||'_staff_read', t);
  end loop;
  foreach t in array array['exp_setting','exp_function_assignment','exp_counter'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
  end loop;
  foreach t in array array['exp_setting','exp_function_assignment'] loop
    execute format('create policy %I on public.%I for select to authenticated using (is_staff(municipality_id))', t||'_staff_read', t);
  end loop;
  alter table public.exp_sod_exception enable row level security;
  drop policy if exists exp_sod_exception_staff_read on public.exp_sod_exception;
  create policy exp_sod_exception_staff_read on public.exp_sod_exception for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
end $$;

-- ---------------------------------------------------------------- 4) immutability + enforcement triggers
create or replace function public._exp_immutable_all() returns trigger language plpgsql as $$
begin raise exception 'immutable_record' using errcode = '22023'; end $$;
create or replace function public._exp_immutable_cycle() returns trigger language plpgsql as $$
begin
  if coalesce(old.cycle_entry, false) then raise exception 'immutable_record' using errcode = '22023'; end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end $$;
create or replace function public._exp_guard_legacy() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not new.cycle_entry and exists (select 1 from exp_setting s where s.municipality_id = new.municipality_id and s.enforce_cycle) then
    raise exception 'use_expenditure_cycle' using errcode = '22023';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['exp_liquidation','exp_payment_order','exp_reconciliation','exp_exception','exp_sod_exception'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_immutable', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public._exp_immutable_all()', t||'_immutable', t);
  end loop;
  foreach t in array array['financial_commitment','expenditure'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_immutable', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public._exp_immutable_cycle()', t||'_immutable', t);
    execute format('drop trigger if exists %I on public.%I', t||'_guard', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public._exp_guard_legacy()', t||'_guard', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 5) internal helpers
-- Caller's municipality for a function; raises function_not_assigned (staff without the assignment) or forbidden (not staff).
create or replace function public._exp_ctx(p_fn text) returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare m uuid;
begin
  select a.municipality_id into m from exp_function_assignment a join staff_member s on s.user_id = a.user_id and s.municipality_id = a.municipality_id
   where a.user_id = auth.uid() and a.fn = p_fn and a.active order by a.created_at limit 1;
  if m is null then
    if exists (select 1 from staff_member where user_id = auth.uid()) then raise exception 'function_not_assigned' using errcode = '42501'; end if;
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return m;
end $$;

create or replace function public._exp_next(p_m uuid, p_kind text, p_prefix text) returns text language plpgsql security definer set search_path to 'public' as $$
declare y int := extract(year from current_date)::int; n int;
begin
  insert into exp_counter (municipality_id, yr, kind, last_no) values (p_m, y, p_kind, 1)
  on conflict (municipality_id, yr, kind) do update set last_no = exp_counter.last_no + 1 returning last_no into n;
  return p_prefix || '-' || y || '-' || lpad(n::text, 6, '0');
end $$;

-- Accounting value (in the line currency) of a document amount. Same currency: rate not needed. Different: rate + rate_date + rate_source required.
create or replace function public._exp_convert(p_line_cur text, p_cur text, p_doc numeric, p_rate numeric, p_rate_date date, p_rate_source text) returns numeric language plpgsql immutable set search_path to 'public' as $$
declare v numeric;
begin
  if p_cur is null or p_cur not in ('LBP','USD') then raise exception 'bad_currency' using errcode = '22023'; end if;
  if p_doc is null or p_doc <= 0 or p_doc > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if p_cur = p_line_cur then return round(p_doc, 2); end if;
  if p_rate is null or p_rate <= 0 or p_rate > 100000000 then raise exception 'rate_required' using errcode = '22023'; end if;
  if p_rate_date is null or p_rate_date < date '2000-01-01' or p_rate_date > current_date + 1 then raise exception 'rate_date_required' using errcode = '22023'; end if;
  if btrim(coalesce(p_rate_source,'')) = '' then raise exception 'rate_source_required' using errcode = '22023'; end if;
  v := round(p_doc * p_rate, 2);
  if v <= 0 then raise exception 'bad_amount' using errcode = '22023'; end if;
  return v;
end $$;

create or replace function public._exp_line_ok(l budget_line) returns void language plpgsql security definer set search_path to 'public' as $$
declare st text;
begin
  if is_demo_staff() and not l.is_demo then raise exception 'forbidden' using errcode = '42501'; end if;
  select status into st from fiscal_year where id = l.fiscal_year_id;
  if st <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if l.kind <> 'expense' then raise exception 'not_expense_line' using errcode = '22023'; end if;
end $$;

create or replace function public._exp_key(p_key text) returns text language plpgsql immutable as $$
begin
  if btrim(coalesce(p_key,'')) = '' or length(p_key) > 100 then raise exception 'idempotency_key_required' using errcode = '22023'; end if;
  return btrim(p_key);
end $$;

create or replace function public._exp_date(p_d date) returns date language plpgsql immutable as $$
begin
  if p_d is null then return current_date; end if;
  if p_d > current_date + 1 or p_d < date '2000-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  return p_d;
end $$;

create or replace function public._exp_commit_net(p_c uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((select amount from financial_commitment where id = p_c and entry_kind = 'commitment'), 0) + coalesce((select sum(amount) from financial_commitment where reverses_id = p_c), 0) $$;
create or replace function public._exp_liq_net(p_l uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((select amount from exp_liquidation where id = p_l and entry_kind = 'liquidation'), 0) + coalesce((select sum(amount) from exp_liquidation where reverses_id = p_l), 0) $$;
create or replace function public._exp_order_net(p_o uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((select amount from exp_payment_order where id = p_o and entry_kind = 'order'), 0) + coalesce((select sum(amount) from exp_payment_order where reverses_id = p_o), 0) $$;
create or replace function public._exp_pay_net(p_p uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((select amount from expenditure where id = p_p and entry_kind = 'payment'), 0) + coalesce((select sum(amount) from expenditure where reverses_id = p_p), 0) $$;
-- totals attached to a parent (reversal rows carry the same parent id, so these are NET figures)
create or replace function public._exp_liq_of_commitment(p_c uuid) returns numeric language sql stable security definer set search_path to 'public' as $$ select coalesce(sum(amount),0) from exp_liquidation where commitment_id = p_c $$;
create or replace function public._exp_orders_of_commitment(p_c uuid) returns numeric language sql stable security definer set search_path to 'public' as $$ select coalesce(sum(amount),0) from exp_payment_order where commitment_id = p_c $$;
create or replace function public._exp_paid_of_commitment(p_c uuid) returns numeric language sql stable security definer set search_path to 'public' as $$ select coalesce(sum(amount),0) from expenditure where commitment_id = p_c $$;
create or replace function public._exp_orders_of_liquidation(p_l uuid) returns numeric language sql stable security definer set search_path to 'public' as $$ select coalesce(sum(amount),0) from exp_payment_order where liquidation_id = p_l $$;
create or replace function public._exp_paid_of_order(p_o uuid) returns numeric language sql stable security definer set search_path to 'public' as $$ select coalesce(sum(amount),0) from expenditure where payment_order_id = p_o $$;
-- orders without a commitment that are not paid yet still reserve credit
create or replace function public._exp_unpaid_direct(p_line uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((select sum(amount) from exp_payment_order where line_id = p_line and commitment_id is null), 0)
       - coalesce((select sum(amount) from expenditure where line_id = p_line and commitment_id is null and payment_order_id is not null), 0) $$;

-- Segregation of duties: the previous stage's actor cannot be the caller unless a documented exception exists. Returns the exception id used (or null).
create or replace function public._exp_sod(p_line uuid, p_commitment uuid, p_prev_actor uuid) returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare e uuid;
begin
  if p_prev_actor is null or p_prev_actor <> auth.uid() then return null; end if;
  select id into e from exp_sod_exception where user_id = auth.uid() and line_id = p_line and (commitment_id is null or commitment_id = p_commitment) order by created_at limit 1;
  if e is null then raise exception 'same_actor_consecutive' using errcode = '42501'; end if;
  return e;
end $$;

do $$ declare f text; begin
  foreach f in array array['_exp_immutable_all()','_exp_immutable_cycle()','_exp_guard_legacy()','_exp_ctx(text)','_exp_next(uuid,text,text)','_exp_convert(text,text,numeric,numeric,date,text)',
    '_exp_line_ok(budget_line)','_exp_key(text)','_exp_date(date)','_exp_commit_net(uuid)','_exp_liq_net(uuid)','_exp_order_net(uuid)','_exp_pay_net(uuid)',
    '_exp_liq_of_commitment(uuid)','_exp_orders_of_commitment(uuid)','_exp_paid_of_commitment(uuid)','_exp_orders_of_liquidation(uuid)','_exp_paid_of_order(uuid)',
    '_exp_unpaid_direct(uuid)','_exp_sod(uuid,uuid,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- 6) administration RPCs (mayor/admin only, via _council_muni)
create or replace function public.exp_assign(p_user uuid, p_fn text, p_basis text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_fn is null or p_fn not in ('commit','liquidate','order','pay','reconcile') then raise exception 'bad_function' using errcode = '22023'; end if;
  if not exists (select 1 from staff_member where user_id = p_user and municipality_id = m) then raise exception 'user_not_staff' using errcode = '22023'; end if;
  select id into i from exp_function_assignment where municipality_id = m and user_id = p_user and fn = p_fn and active;
  if found then return i; end if;
  insert into exp_function_assignment (municipality_id, user_id, fn, basis_ref, note, granted_by) values (m, p_user, p_fn, nullif(left(btrim(coalesce(p_basis,'')),300),''), nullif(left(btrim(coalesce(p_note,'')),500),''), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.function_assigned', 'exp_function_assignment', i::text, jsonb_build_object('user', p_user, 'fn', p_fn));
  return i;
end $$;

create or replace function public.exp_unassign(p_assignment uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a exp_function_assignment%rowtype;
begin
  select * into a from exp_function_assignment where id = p_assignment and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not a.active then return; end if;
  update exp_function_assignment set active = false, revoked_by = auth.uid(), revoked_at = now() where id = p_assignment;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.function_revoked', 'exp_function_assignment', p_assignment::text, jsonb_build_object('user', a.user_id, 'fn', a.fn));
end $$;

create or replace function public.exp_set_enforcement(p_on boolean, p_reason text) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  insert into exp_setting (municipality_id, enforce_cycle, updated_by) values (m, coalesce(p_on,false), auth.uid())
  on conflict (municipality_id) do update set enforce_cycle = coalesce(p_on,false), updated_by = auth.uid(), updated_at = now();
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.enforcement_set', 'exp_setting', m::text, jsonb_build_object('on', coalesce(p_on,false), 'reason', left(btrim(p_reason),500)));
end $$;

create or replace function public.exp_declare_exception(p_line uuid, p_commitment uuid, p_scope text, p_amount numeric, p_justification text, p_reference text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); l budget_line%rowtype; i uuid;
begin
  select * into l from budget_line where id = p_line and municipality_id = m for update;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  perform _exp_line_ok(l);
  if p_scope not in ('skip_liquidation','direct_payment') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_scope = 'skip_liquidation' and not exists (select 1 from financial_commitment where id = p_commitment and line_id = p_line and entry_kind = 'commitment') then raise exception 'commitment_not_found' using errcode = 'P0002'; end if;
  if p_scope = 'direct_payment' and p_commitment is not null then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_justification,''))) < 10 then raise exception 'justification_required' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reference,''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
  insert into exp_exception (municipality_id, line_id, commitment_id, scope, approved_amount, legal_justification, legal_reference, created_by, is_demo)
  values (m, p_line, p_commitment, p_scope, round(p_amount,2), left(btrim(p_justification),3000), left(btrim(p_reference),500), auth.uid(), l.is_demo) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.exception_declared', 'exp_exception', i::text, jsonb_build_object('scope', p_scope, 'amount', p_amount, 'currency', l.currency));
  return i;
end $$;

create or replace function public.exp_declare_sod_exception(p_line uuid, p_commitment uuid, p_user uuid, p_justification text, p_reference text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); l budget_line%rowtype; i uuid;
begin
  select * into l from budget_line where id = p_line and municipality_id = m;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  if p_commitment is not null and not exists (select 1 from financial_commitment where id = p_commitment and line_id = p_line) then raise exception 'commitment_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from staff_member where user_id = p_user and municipality_id = m) then raise exception 'user_not_staff' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_justification,''))) < 10 then raise exception 'justification_required' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reference,''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
  select id into i from exp_sod_exception where line_id = p_line and coalesce(commitment_id,'00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_commitment,'00000000-0000-0000-0000-000000000000'::uuid) and user_id = p_user;
  if found then return i; end if;
  insert into exp_sod_exception (municipality_id, line_id, commitment_id, user_id, justification, legal_reference, created_by, is_demo)
  values (m, p_line, p_commitment, p_user, left(btrim(p_justification),3000), left(btrim(p_reference),500), auth.uid(), l.is_demo) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.sod_exception_declared', 'exp_sod_exception', i::text, jsonb_build_object('user', p_user, 'line', p_line, 'commitment', p_commitment));
  return i;
end $$;

-- ---------------------------------------------------------------- 7) stage 1: commitment (credit availability is checked and snapshotted)
create or replace function public.exp_commit(p_line uuid, p_doc_amount numeric, p_doc_currency text, p_description text, p_basis_ref text, p_idempotency_key text,
  p_rate numeric default null, p_rate_date date default null, p_rate_source text default null, p_decision uuid default null, p_contract uuid default null, p_date date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _exp_ctx('commit'); k text := _exp_key(p_idempotency_key); l budget_line%rowtype; i uuid; f financial_commitment%rowtype; acc numeric; avail numeric; no text; same boolean;
begin
  select * into l from budget_line where id = p_line and municipality_id = m for update;          -- serializes every operation on this line
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  select * into f from financial_commitment where municipality_id = m and idempotency_key = k;
  if found then if f.line_id <> p_line then raise exception 'idempotency_conflict' using errcode = '22023'; end if; return f.id; end if;
  perform _exp_line_ok(l);
  if btrim(coalesce(p_description,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if btrim(coalesce(p_basis_ref,'')) = '' then raise exception 'basis_required' using errcode = '22023'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'decision_not_found' using errcode = 'P0002'; end if;
  if p_contract is not null and not exists (select 1 from contract where id = p_contract and municipality_id = m) then raise exception 'contract_not_found' using errcode = 'P0002'; end if;
  acc := _exp_convert(l.currency, p_doc_currency, p_doc_amount, p_rate, p_rate_date, p_rate_source);
  avail := l.current_amount - _fin_reserved(p_line) - _exp_unpaid_direct(p_line);
  if acc > avail then raise exception 'exceeds_available' using errcode = '22023'; end if;
  same := p_doc_currency = l.currency; no := _exp_next(m, 'commitment', 'CM');
  insert into financial_commitment (line_id, municipality_id, amount, description, committed_on, is_demo, actor, cycle_entry, entry_kind, commitment_no, doc_currency, doc_amount, exchange_rate, rate_date, rate_source,
    basis_ref, decision_id, contract_id, available_before, idempotency_key)
  values (p_line, m, acc, left(btrim(p_description),300), _exp_date(p_date), l.is_demo, auth.uid(), true, 'commitment', no, p_doc_currency, round(p_doc_amount,2), case when same then 1 else p_rate end,
    case when same then null else p_rate_date end, case when same then null else left(btrim(p_rate_source),200) end, left(btrim(p_basis_ref),500), p_decision, p_contract, avail, k) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.committed', 'financial_commitment', i::text, jsonb_build_object('no', no, 'amount', acc, 'currency', l.currency, 'doc_currency', p_doc_currency));
  return i;
end $$;

-- ---------------------------------------------------------------- 8) stage 2: liquidation (invoice/receipt evidence + delivery/acceptance proof are mandatory)
create or replace function public.exp_liquidate(p_commitment uuid, p_doc_amount numeric, p_doc_currency text, p_invoice_no text, p_invoice_date date, p_evidence_ref text, p_delivery_ref text, p_idempotency_key text,
  p_rate numeric default null, p_rate_date date default null, p_rate_source text default null, p_delivered_on date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _exp_ctx('liquidate'); k text := _exp_key(p_idempotency_key); lid uuid; l budget_line%rowtype; c financial_commitment%rowtype; x exp_liquidation%rowtype; i uuid; acc numeric; sod uuid; no text; same boolean;
begin
  select line_id into lid from financial_commitment where id = p_commitment and municipality_id = m and entry_kind = 'commitment';
  if lid is null then raise exception 'commitment_not_found' using errcode = 'P0002'; end if;      -- no commitment => no liquidation
  select * into l from budget_line where id = lid for update;
  select * into x from exp_liquidation where municipality_id = m and idempotency_key = k;
  if found then if x.commitment_id <> p_commitment then raise exception 'idempotency_conflict' using errcode = '22023'; end if; return x.id; end if;
  perform _exp_line_ok(l);
  select * into c from financial_commitment where id = p_commitment;
  if btrim(coalesce(p_invoice_no,'')) = '' or p_invoice_date is null or btrim(coalesce(p_evidence_ref,'')) = '' then raise exception 'evidence_required' using errcode = '22023'; end if;
  if btrim(coalesce(p_delivery_ref,'')) = '' then raise exception 'delivery_proof_required' using errcode = '22023'; end if;
  if p_invoice_date > current_date + 1 or p_invoice_date < date '2000-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  if exists (select 1 from exp_liquidation q where q.commitment_id = p_commitment and q.entry_kind = 'liquidation' and lower(btrim(q.invoice_no)) = lower(btrim(p_invoice_no)) and _exp_liq_net(q.id) > 0) then raise exception 'duplicate_invoice' using errcode = '23505'; end if;
  acc := _exp_convert(l.currency, p_doc_currency, p_doc_amount, p_rate, p_rate_date, p_rate_source);
  if _exp_liq_of_commitment(p_commitment) + acc > _exp_commit_net(p_commitment) then raise exception 'exceeds_commitment' using errcode = '22023'; end if;
  sod := _exp_sod(lid, p_commitment, c.actor);
  same := p_doc_currency = l.currency; no := _exp_next(m, 'liquidation', 'LQ');
  insert into exp_liquidation (municipality_id, line_id, commitment_id, liquidation_no, entry_kind, amount, doc_currency, doc_amount, exchange_rate, rate_date, rate_source, invoice_no, invoice_date, evidence_ref, delivery_ref, delivered_on, note, sod_exception_id, idempotency_key, actor, is_demo)
  values (m, lid, p_commitment, no, 'liquidation', acc, p_doc_currency, round(p_doc_amount,2), case when same then 1 else p_rate end, case when same then null else p_rate_date end, case when same then null else left(btrim(p_rate_source),200) end,
    left(btrim(p_invoice_no),100), p_invoice_date, left(btrim(p_evidence_ref),500), left(btrim(p_delivery_ref),500), p_delivered_on, nullif(left(btrim(coalesce(p_note,'')),1000),''), sod, k, auth.uid(), l.is_demo) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.liquidated', 'exp_liquidation', i::text, jsonb_build_object('no', no, 'amount', acc, 'currency', l.currency, 'sod_exception', sod));
  return i;
end $$;

-- ---------------------------------------------------------------- 9) stage 3: payment order (general path: needs a liquidation)
create or replace function public.exp_order(p_liquidation uuid, p_doc_amount numeric, p_doc_currency text, p_beneficiary text, p_idempotency_key text,
  p_rate numeric default null, p_rate_date date default null, p_rate_source text default null, p_order_date date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _exp_ctx('order'); k text := _exp_key(p_idempotency_key); q exp_liquidation%rowtype; l budget_line%rowtype; x exp_payment_order%rowtype; i uuid; acc numeric; sod uuid; no text; same boolean;
begin
  select * into q from exp_liquidation where id = p_liquidation and municipality_id = m and entry_kind = 'liquidation';
  if not found then raise exception 'liquidation_required' using errcode = 'P0002'; end if;      -- no liquidation => no payment order
  select * into l from budget_line where id = q.line_id for update;
  select * into x from exp_payment_order where municipality_id = m and idempotency_key = k;
  if found then if x.liquidation_id is distinct from p_liquidation then raise exception 'idempotency_conflict' using errcode = '22023'; end if; return x.id; end if;
  perform _exp_line_ok(l);
  if btrim(coalesce(p_beneficiary,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  acc := _exp_convert(l.currency, p_doc_currency, p_doc_amount, p_rate, p_rate_date, p_rate_source);
  if _exp_orders_of_liquidation(p_liquidation) + acc > _exp_liq_net(p_liquidation) then raise exception 'exceeds_liquidation' using errcode = '22023'; end if;
  if _exp_orders_of_commitment(q.commitment_id) + acc > _exp_commit_net(q.commitment_id) then raise exception 'exceeds_commitment' using errcode = '22023'; end if;
  sod := _exp_sod(q.line_id, q.commitment_id, q.actor);
  same := p_doc_currency = l.currency; no := _exp_next(m, 'order', 'PO');
  insert into exp_payment_order (municipality_id, line_id, commitment_id, liquidation_id, order_no, order_date, entry_kind, amount, doc_currency, doc_amount, exchange_rate, rate_date, rate_source, beneficiary, is_exceptional, sod_exception_id, note, idempotency_key, actor, is_demo)
  values (m, q.line_id, q.commitment_id, p_liquidation, no, _exp_date(p_order_date), 'order', acc, p_doc_currency, round(p_doc_amount,2), case when same then 1 else p_rate end, case when same then null else p_rate_date end, case when same then null else left(btrim(p_rate_source),200) end,
    left(btrim(p_beneficiary),200), false, sod, nullif(left(btrim(coalesce(p_note,'')),1000),''), k, auth.uid(), l.is_demo) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.ordered', 'exp_payment_order', i::text, jsonb_build_object('no', no, 'amount', acc, 'currency', l.currency, 'sod_exception', sod));
  return i;
end $$;

-- Exceptional path: order issued under a documented exception (legal justification + reference + approved ceiling). Always flagged.
create or replace function public.exp_order_exceptional(p_exception uuid, p_doc_amount numeric, p_doc_currency text, p_beneficiary text, p_idempotency_key text,
  p_rate numeric default null, p_rate_date date default null, p_rate_source text default null, p_order_date date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _exp_ctx('order'); k text := _exp_key(p_idempotency_key); e exp_exception%rowtype; l budget_line%rowtype; x exp_payment_order%rowtype; c financial_commitment%rowtype; i uuid; acc numeric; sod uuid; no text; same boolean; spent numeric;
begin
  select * into e from exp_exception where id = p_exception and municipality_id = m;
  if not found then raise exception 'exception_not_found' using errcode = 'P0002'; end if;
  select * into l from budget_line where id = e.line_id for update;
  select * into x from exp_payment_order where municipality_id = m and idempotency_key = k;
  if found then if x.exception_id is distinct from p_exception then raise exception 'idempotency_conflict' using errcode = '22023'; end if; return x.id; end if;
  perform _exp_line_ok(l);
  if btrim(coalesce(p_beneficiary,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  acc := _exp_convert(l.currency, p_doc_currency, p_doc_amount, p_rate, p_rate_date, p_rate_source);
  select coalesce(sum(amount),0) into spent from exp_payment_order where exception_id = p_exception;
  if spent + acc > e.approved_amount then raise exception 'exceeds_exception' using errcode = '22023'; end if;
  if e.scope = 'skip_liquidation' then
    if _exp_orders_of_commitment(e.commitment_id) + acc > _exp_commit_net(e.commitment_id) then raise exception 'exceeds_commitment' using errcode = '22023'; end if;
    select * into c from financial_commitment where id = e.commitment_id;
    sod := _exp_sod(e.line_id, e.commitment_id, c.actor);
  else
    if acc > l.current_amount - _fin_reserved(e.line_id) - _exp_unpaid_direct(e.line_id) then raise exception 'exceeds_available' using errcode = '22023'; end if;
  end if;
  same := p_doc_currency = l.currency; no := _exp_next(m, 'order', 'PO');
  insert into exp_payment_order (municipality_id, line_id, commitment_id, liquidation_id, order_no, order_date, entry_kind, amount, doc_currency, doc_amount, exchange_rate, rate_date, rate_source, beneficiary, is_exceptional, exception_id, sod_exception_id, note, idempotency_key, actor, is_demo)
  values (m, e.line_id, e.commitment_id, null, no, _exp_date(p_order_date), 'order', acc, p_doc_currency, round(p_doc_amount,2), case when same then 1 else p_rate end, case when same then null else p_rate_date end, case when same then null else left(btrim(p_rate_source),200) end,
    left(btrim(p_beneficiary),200), true, p_exception, sod, nullif(left(btrim(coalesce(p_note,'')),1000),''), k, auth.uid(), l.is_demo) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.ordered_exceptional', 'exp_payment_order', i::text, jsonb_build_object('no', no, 'amount', acc, 'currency', l.currency, 'exception', p_exception, 'scope', e.scope));
  return i;
end $$;

-- ---------------------------------------------------------------- 10) stage 4: payment (partial allowed; proof + idempotency key mandatory; written into `expenditure`)
create or replace function public.exp_pay(p_order uuid, p_doc_amount numeric, p_doc_currency text, p_method text, p_paid_on date, p_proof_ref text, p_idempotency_key text,
  p_rate numeric default null, p_rate_date date default null, p_rate_source text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _exp_ctx('pay'); k text := _exp_key(p_idempotency_key); o exp_payment_order%rowtype; l budget_line%rowtype; x expenditure%rowtype; i uuid; acc numeric; sod uuid; no text; same boolean; d date := _exp_date(p_paid_on);
begin
  select * into o from exp_payment_order where id = p_order and municipality_id = m and entry_kind = 'order';
  if not found then raise exception 'order_required' using errcode = 'P0002'; end if;            -- no payment order => no payment
  select * into l from budget_line where id = o.line_id for update;
  select * into x from expenditure where municipality_id = m and idempotency_key = k;
  if found then if x.payment_order_id is distinct from p_order then raise exception 'idempotency_conflict' using errcode = '22023'; end if; return x.id; end if;
  perform _exp_line_ok(l);
  if p_method is null or p_method not in ('cash','transfer','cheque') then raise exception 'bad_method' using errcode = '22023'; end if;
  if btrim(coalesce(p_proof_ref,'')) = '' then raise exception 'proof_required' using errcode = '22023'; end if;
  if d < o.order_date then raise exception 'paid_before_order' using errcode = '22023'; end if;
  if exists (select 1 from expenditure e where e.municipality_id = m and e.entry_kind = 'payment' and e.cycle_entry and e.payment_method = p_method and lower(btrim(e.proof_ref)) = lower(btrim(p_proof_ref))) then raise exception 'duplicate_payment_ref' using errcode = '23505'; end if;
  acc := _exp_convert(l.currency, p_doc_currency, p_doc_amount, p_rate, p_rate_date, p_rate_source);
  if _exp_paid_of_order(p_order) + acc > _exp_order_net(p_order) then raise exception 'exceeds_order' using errcode = '22023'; end if;
  if o.commitment_id is not null then
    if _exp_paid_of_commitment(o.commitment_id) + acc > _exp_commit_net(o.commitment_id) then raise exception 'exceeds_commitment' using errcode = '22023'; end if;
  elsif acc > l.current_amount - _fin_reserved(o.line_id) then raise exception 'exceeds_available' using errcode = '22023';
  end if;
  sod := _exp_sod(o.line_id, o.commitment_id, o.actor);
  same := p_doc_currency = l.currency; no := _exp_next(m, 'payment', 'PY');
  insert into expenditure (line_id, commitment_id, municipality_id, amount, paid_on, beneficiary, is_demo, actor, cycle_entry, entry_kind, payment_no, payment_order_id, payment_method, proof_ref, note,
    doc_currency, doc_amount, exchange_rate, rate_date, rate_source, exception_id, sod_exception_id, idempotency_key)
  values (o.line_id, o.commitment_id, m, acc, d, o.beneficiary, l.is_demo, auth.uid(), true, 'payment', no, p_order, p_method, left(btrim(p_proof_ref),200), nullif(left(btrim(coalesce(p_note,'')),1000),''),
    p_doc_currency, round(p_doc_amount,2), case when same then 1 else p_rate end, case when same then null else p_rate_date end, case when same then null else left(btrim(p_rate_source),200) end, o.exception_id, sod, k) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.paid', 'expenditure', i::text, jsonb_build_object('no', no, 'amount', acc, 'currency', l.currency, 'method', p_method, 'exceptional', o.is_exceptional, 'sod_exception', sod));
  return i;
end $$;

-- ---------------------------------------------------------------- 11) stage 5: reconciliation (append-only; discrepancies need a note)
create or replace function public.exp_reconcile(p_payment uuid, p_statement_ref text, p_statement_date date, p_statement_amount numeric, p_statement_currency text, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _exp_ctx('reconcile'); p expenditure%rowtype; l budget_line%rowtype; i uuid; sod uuid; expected numeric; docnet numeric; st text;
begin
  select * into p from expenditure where id = p_payment and municipality_id = m and entry_kind = 'payment' and cycle_entry;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  select * into l from budget_line where id = p.line_id for update;
  if is_demo_staff() and not l.is_demo then raise exception 'forbidden' using errcode = '42501'; end if;
  if btrim(coalesce(p_statement_ref,'')) = '' or p_statement_date is null or p_statement_date > current_date + 1 or p_statement_date < date '2000-01-01' then raise exception 'statement_required' using errcode = '22023'; end if;
  if p_statement_amount is null or p_statement_amount <= 0 or p_statement_amount > 100000000000 or p_statement_currency not in ('LBP','USD') then raise exception 'bad_amount' using errcode = '22023'; end if;
  if _exp_pay_net(p_payment) <= 0 then raise exception 'nothing_to_reconcile' using errcode = '22023'; end if;
  if exists (select 1 from exp_reconciliation where payment_id = p_payment and lower(btrim(statement_ref)) = lower(btrim(p_statement_ref))) then raise exception 'duplicate_reconciliation' using errcode = '23505'; end if;
  -- expected = net payment in its own document currency (never converted silently)
  docnet := coalesce(p.doc_amount, p.amount) + coalesce((select sum(coalesce(r.doc_amount, r.amount)) from expenditure r where r.reverses_id = p_payment), 0);
  expected := docnet;
  st := case when p_statement_currency = coalesce(p.doc_currency, l.currency) and round(p_statement_amount,2) = round(expected,2) then 'matched' else 'discrepancy' end;
  if st = 'discrepancy' and btrim(coalesce(p_note,'')) = '' then raise exception 'discrepancy_note_required' using errcode = '22023'; end if;
  sod := _exp_sod(p.line_id, p.commitment_id, p.actor);
  insert into exp_reconciliation (municipality_id, payment_id, status, statement_ref, statement_date, statement_amount, statement_currency, expected_amount, note, sod_exception_id, actor, is_demo)
  values (m, p_payment, st, left(btrim(p_statement_ref),200), p_statement_date, round(p_statement_amount,2), p_statement_currency, round(expected,2), nullif(left(btrim(coalesce(p_note,'')),1000),''), sod, auth.uid(), l.is_demo) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.reconciled', 'exp_reconciliation', i::text, jsonb_build_object('payment', p_payment, 'status', st));
  return i;
end $$;

-- ---------------------------------------------------------------- 12) corrections: append-only reversal entries (never edit/delete)
-- p_kind: commitment | liquidation | order | payment. p_amount (accounting value, line currency) null = everything still reversible.
create or replace function public.exp_reverse(p_kind text, p_id uuid, p_amount numeric, p_reason text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare fn text; m uuid; k text := _exp_key(p_idempotency_key); lid uuid; l budget_line%rowtype; i uuid; remaining numeric; amt numeric; docr numeric; no text;
  fc financial_commitment%rowtype; q exp_liquidation%rowtype; o exp_payment_order%rowtype; p expenditure%rowtype; found_old uuid;
begin
  if p_kind not in ('commitment','liquidation','order','payment') then raise exception 'bad_input' using errcode = '22023'; end if;
  fn := case p_kind when 'commitment' then 'commit' when 'liquidation' then 'liquidate' when 'order' then 'order' else 'pay' end;
  m := _exp_ctx(fn);
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_kind = 'commitment' then select line_id into lid from financial_commitment where id = p_id and municipality_id = m and entry_kind = 'commitment';
  elsif p_kind = 'liquidation' then select line_id into lid from exp_liquidation where id = p_id and municipality_id = m and entry_kind = 'liquidation';
  elsif p_kind = 'order' then select line_id into lid from exp_payment_order where id = p_id and municipality_id = m and entry_kind = 'order';
  else select line_id into lid from expenditure where id = p_id and municipality_id = m and entry_kind = 'payment' and cycle_entry; end if;
  if lid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into l from budget_line where id = lid for update;
  perform _exp_line_ok(l);

  if p_kind = 'commitment' then
    select id into found_old from financial_commitment where municipality_id = m and idempotency_key = k; if found_old is not null then return found_old; end if;
    select * into fc from financial_commitment where id = p_id;
    no := _exp_next(m, 'reversal', 'RV');
    remaining := _exp_commit_net(p_id) - greatest(_exp_liq_of_commitment(p_id), _exp_orders_of_commitment(p_id), _exp_paid_of_commitment(p_id));
    if remaining <= 0 then raise exception 'nothing_to_reverse' using errcode = '22023'; end if;
    amt := coalesce(round(p_amount,2), remaining); if amt <= 0 or amt > remaining then raise exception 'reverse_exceeds' using errcode = '22023'; end if;
    docr := case when fc.doc_amount is null then null else round(fc.doc_amount * amt / fc.amount, 2) end;
    insert into financial_commitment (line_id, municipality_id, amount, description, committed_on, is_demo, actor, cycle_entry, entry_kind, reverses_id, commitment_no, doc_currency, doc_amount, exchange_rate, rate_date, rate_source, basis_ref, reason, idempotency_key)
    values (lid, m, -amt, left('عكس: ' || fc.description, 300), current_date, l.is_demo, auth.uid(), true, 'reversal', p_id, no, fc.doc_currency, -docr, fc.exchange_rate, fc.rate_date, fc.rate_source, fc.basis_ref, left(btrim(p_reason),500), k) returning id into i;
  elsif p_kind = 'liquidation' then
    select id into found_old from exp_liquidation where municipality_id = m and idempotency_key = k; if found_old is not null then return found_old; end if;
    select * into q from exp_liquidation where id = p_id;
    no := _exp_next(m, 'reversal', 'RV');
    remaining := _exp_liq_net(p_id) - _exp_orders_of_liquidation(p_id);
    if remaining <= 0 then raise exception 'nothing_to_reverse' using errcode = '22023'; end if;
    amt := coalesce(round(p_amount,2), remaining); if amt <= 0 or amt > remaining then raise exception 'reverse_exceeds' using errcode = '22023'; end if;
    docr := case when q.doc_amount is null then null else round(q.doc_amount * amt / q.amount, 2) end;
    insert into exp_liquidation (municipality_id, line_id, commitment_id, liquidation_no, entry_kind, reverses_id, amount, doc_currency, doc_amount, exchange_rate, rate_date, rate_source, reason, idempotency_key, actor, is_demo)
    values (m, lid, q.commitment_id, no, 'reversal', p_id, -amt, q.doc_currency, -docr, q.exchange_rate, q.rate_date, q.rate_source, left(btrim(p_reason),500), k, auth.uid(), l.is_demo) returning id into i;
  elsif p_kind = 'order' then
    select id into found_old from exp_payment_order where municipality_id = m and idempotency_key = k; if found_old is not null then return found_old; end if;
    select * into o from exp_payment_order where id = p_id;
    no := _exp_next(m, 'reversal', 'RV');
    remaining := _exp_order_net(p_id) - _exp_paid_of_order(p_id);
    if remaining <= 0 then raise exception 'nothing_to_reverse' using errcode = '22023'; end if;
    amt := coalesce(round(p_amount,2), remaining); if amt <= 0 or amt > remaining then raise exception 'reverse_exceeds' using errcode = '22023'; end if;
    docr := case when o.doc_amount is null then null else round(o.doc_amount * amt / o.amount, 2) end;
    insert into exp_payment_order (municipality_id, line_id, commitment_id, liquidation_id, order_no, order_date, entry_kind, reverses_id, amount, doc_currency, doc_amount, exchange_rate, rate_date, rate_source, beneficiary, is_exceptional, exception_id, reason, idempotency_key, actor, is_demo)
    values (m, lid, o.commitment_id, o.liquidation_id, no, current_date, 'reversal', p_id, -amt, o.doc_currency, -docr, o.exchange_rate, o.rate_date, o.rate_source, o.beneficiary, o.is_exceptional, o.exception_id, left(btrim(p_reason),500), k, auth.uid(), l.is_demo) returning id into i;
  else
    select id into found_old from expenditure where municipality_id = m and idempotency_key = k; if found_old is not null then return found_old; end if;
    select * into p from expenditure where id = p_id;
    no := _exp_next(m, 'reversal', 'RV');
    remaining := _exp_pay_net(p_id);
    if remaining <= 0 then raise exception 'nothing_to_reverse' using errcode = '22023'; end if;
    amt := coalesce(round(p_amount,2), remaining); if amt <= 0 or amt > remaining then raise exception 'reverse_exceeds' using errcode = '22023'; end if;
    docr := case when p.doc_amount is null then null else round(p.doc_amount * amt / p.amount, 2) end;
    insert into expenditure (line_id, commitment_id, municipality_id, amount, paid_on, beneficiary, is_demo, actor, cycle_entry, entry_kind, reverses_id, payment_no, payment_order_id, payment_method, reason, doc_currency, doc_amount, exchange_rate, rate_date, rate_source, exception_id, idempotency_key)
    values (lid, p.commitment_id, m, -amt, current_date, p.beneficiary, l.is_demo, auth.uid(), true, 'reversal', p_id, no, p.payment_order_id, p.payment_method, left(btrim(p_reason),500), p.doc_currency, -docr, p.exchange_rate, p.rate_date, p.rate_source, p.exception_id, k) returning id into i;
  end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'expenditure.reversed', p_kind, p_id::text, jsonb_build_object('reversal', i, 'amount', amt, 'currency', l.currency, 'reason', left(btrim(p_reason),200)));
  return i;
end $$;

-- Staff directory for the function matrix / actor names (own municipality only; no contact data).
create or replace function public.exp_staff_list() returns table (user_id uuid, display_name text, role text) language plpgsql stable security definer set search_path to 'public' as $$
declare m uuid;
begin
  select municipality_id into m from staff_member where staff_member.user_id = auth.uid() order by created_at limit 1;
  if m is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select s.user_id, s.display_name, s.role::text from staff_member s where s.municipality_id = m order by s.created_at;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'exp_assign(uuid,text,text,text)','exp_unassign(uuid)','exp_set_enforcement(boolean,text)','exp_declare_exception(uuid,uuid,text,numeric,text,text)','exp_declare_sod_exception(uuid,uuid,uuid,text,text)',
    'exp_commit(uuid,numeric,text,text,text,text,numeric,date,text,uuid,uuid,date)',
    'exp_liquidate(uuid,numeric,text,text,date,text,text,text,numeric,date,text,date,text)',
    'exp_order(uuid,numeric,text,text,text,numeric,date,text,date,text)',
    'exp_order_exceptional(uuid,numeric,text,text,text,numeric,date,text,date,text)',
    'exp_pay(uuid,numeric,text,text,date,text,text,numeric,date,text,text)',
    'exp_reconcile(uuid,text,date,numeric,text,text)','exp_reverse(text,uuid,numeric,text,text)','exp_staff_list()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
