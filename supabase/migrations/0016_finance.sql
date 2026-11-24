-- Finance & budget: fiscal years, budget lines, amendments, commitments, expenditures, receivables (linked to collection_entry).
-- NOT personal data: receivable.payer_ref is an opaque reference code (file/transaction number), validated by the RPC; never a name or phone.
-- Money is numeric(14,2), never float. A budget line has exactly one currency; commitments/expenditures inherit it. Currencies are never summed together.
-- Available appropriation = current_amount - (sum of commitments + expenditures NOT linked to a commitment). Payments against a commitment are already reserved by it.

create table if not exists public.fiscal_year (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  year int not null check (year between 1990 and 2100),
  status text not null default 'open' check (status in ('open','closed')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (municipality_id, year));

create table if not exists public.budget_line (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  fiscal_year_id uuid not null references fiscal_year(id),
  code text not null, title_ar text not null,
  kind text not null check (kind in ('revenue','expense')),
  sector text,
  original_amount numeric(14,2) not null check (original_amount >= 0),
  current_amount numeric(14,2) not null check (current_amount >= 0),
  currency text not null check (currency in ('LBP','USD')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique (fiscal_year_id, code));

create table if not exists public.budget_amendment (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references budget_line(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  delta numeric(14,2) not null check (delta <> 0),
  reason text not null, amended_on date not null default current_date,
  is_demo boolean not null default false,
  actor uuid references auth.users(id), created_at timestamptz not null default now());

create table if not exists public.financial_commitment (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references budget_line(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  amount numeric(14,2) not null check (amount > 0),
  description text not null, committed_on date not null default current_date,
  is_demo boolean not null default false,
  actor uuid references auth.users(id), created_at timestamptz not null default now());

create table if not exists public.expenditure (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references budget_line(id) on delete cascade,
  commitment_id uuid references financial_commitment(id),
  municipality_id uuid not null references municipality(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null default current_date,
  beneficiary text not null,
  is_demo boolean not null default false,
  actor uuid references auth.users(id), created_at timestamptz not null default now());

create table if not exists public.receivable (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  fee_type text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('LBP','USD')),
  due_on date not null,
  payer_ref text,
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  settled_on date,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now());

alter table public.collection_entry add column if not exists receivable_id uuid references public.receivable(id);

create index if not exists budget_line_year on public.budget_line (municipality_id, fiscal_year_id);
create index if not exists commitment_line on public.financial_commitment (line_id);
create index if not exists expenditure_line on public.expenditure (line_id, paid_on);
create index if not exists amendment_line on public.budget_amendment (line_id);
create index if not exists receivable_muni_due on public.receivable (municipality_id, due_on);
create index if not exists collection_receivable on public.collection_entry (receivable_id) where receivable_id is not null;

do $$ declare t text; begin
  foreach t in array array['fiscal_year','budget_line','budget_amendment','financial_commitment','expenditure','receivable'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()))', t||'_staff_read', t);
  end loop;
end $$;

-- Reserved appropriation of a line: commitments + payments made without a commitment.
create or replace function public._fin_reserved(p_line uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((select sum(amount) from financial_commitment where line_id = p_line), 0)
       + coalesce((select sum(amount) from expenditure where line_id = p_line and commitment_id is null), 0)
$$;
revoke all on function public._fin_reserved(uuid) from public, anon, authenticated;

create or replace function public.finance_add_line(p_year int, p_code text, p_title text, p_kind text, p_sector text, p_amount numeric, p_currency text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; i uuid;
begin
  if p_year is null or p_year < 1990 or p_year > 2100 then raise exception 'bad_year' using errcode = '22023'; end if;
  if btrim(coalesce(p_code,'')) = '' or btrim(coalesce(p_title,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_kind not in ('revenue','expense') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if p_currency is null or p_currency not in ('LBP','USD') then raise exception 'bad_currency' using errcode = '22023'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  insert into fiscal_year (municipality_id, year, is_demo) values (m, p_year, is_demo_staff()) on conflict (municipality_id, year) do nothing;
  select * into fy from fiscal_year where municipality_id = m and year = p_year;
  if fy.status <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if exists (select 1 from budget_line where fiscal_year_id = fy.id and code = left(btrim(p_code),40)) then raise exception 'duplicate_code' using errcode = '23505'; end if;
  insert into budget_line (municipality_id, fiscal_year_id, code, title_ar, kind, sector, original_amount, current_amount, currency, is_demo, created_by)
  values (m, fy.id, left(btrim(p_code),40), left(btrim(p_title),200), p_kind, nullif(left(btrim(coalesce(p_sector,'')),100),''), round(p_amount,2), round(p_amount,2), p_currency, fy.is_demo, auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.line_added', 'budget_line', i::text, jsonb_build_object('year', p_year, 'kind', p_kind, 'currency', p_currency, 'amount', p_amount));
  return i;
end $$;

create or replace function public.finance_amend(p_line uuid, p_delta numeric, p_reason text, p_date date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); l budget_line%rowtype; i uuid; st text;
begin
  select * into l from budget_line where id = p_line and municipality_id = m for update;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  select status into st from fiscal_year where id = l.fiscal_year_id;
  if st <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  if l.current_amount + round(p_delta,2) < 0 then raise exception 'below_zero' using errcode = '22023'; end if;
  if l.kind = 'expense' and l.current_amount + round(p_delta,2) < _fin_reserved(p_line) then raise exception 'below_commitments' using errcode = '22023'; end if;
  update budget_line set current_amount = current_amount + round(p_delta,2) where id = p_line;
  insert into budget_amendment (line_id, municipality_id, delta, reason, amended_on, is_demo, actor) values (p_line, m, round(p_delta,2), left(btrim(p_reason),500), coalesce(p_date, current_date), l.is_demo, auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.amended', 'budget_line', p_line::text, jsonb_build_object('delta', p_delta));
  return i;
end $$;

create or replace function public.finance_commit(p_line uuid, p_amount numeric, p_description text, p_date date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); l budget_line%rowtype; i uuid; st text;
begin
  select * into l from budget_line where id = p_line and municipality_id = m for update;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  select status into st from fiscal_year where id = l.fiscal_year_id;
  if st <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if l.kind <> 'expense' then raise exception 'not_expense_line' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if btrim(coalesce(p_description,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if round(p_amount,2) > l.current_amount - _fin_reserved(p_line) then raise exception 'exceeds_available' using errcode = '22023'; end if;
  insert into financial_commitment (line_id, municipality_id, amount, description, committed_on, is_demo, actor) values (p_line, m, round(p_amount,2), left(btrim(p_description),300), coalesce(p_date, current_date), l.is_demo, auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.committed', 'financial_commitment', i::text, jsonb_build_object('amount', p_amount, 'currency', l.currency));
  return i;
end $$;

create or replace function public.finance_pay(p_line uuid, p_amount numeric, p_paid_on date, p_beneficiary text, p_commitment uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); l budget_line%rowtype; c financial_commitment%rowtype; i uuid; st text; paid_c numeric;
begin
  select * into l from budget_line where id = p_line and municipality_id = m for update;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  select status into st from fiscal_year where id = l.fiscal_year_id;
  if st <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if l.kind <> 'expense' then raise exception 'not_expense_line' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if btrim(coalesce(p_beneficiary,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_paid_on is null or p_paid_on > current_date + 1 or p_paid_on < date '2000-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  if p_commitment is not null then
    select * into c from financial_commitment where id = p_commitment and line_id = p_line and municipality_id = m;
    if not found then raise exception 'commitment_not_found' using errcode = 'P0002'; end if;
    select coalesce(sum(amount),0) into paid_c from expenditure where commitment_id = p_commitment;
    if paid_c + round(p_amount,2) > c.amount then raise exception 'exceeds_commitment' using errcode = '22023'; end if;
  elsif round(p_amount,2) > l.current_amount - _fin_reserved(p_line) then raise exception 'exceeds_available' using errcode = '22023';
  end if;
  insert into expenditure (line_id, commitment_id, municipality_id, amount, paid_on, beneficiary, is_demo, actor) values (p_line, p_commitment, m, round(p_amount,2), p_paid_on, left(btrim(p_beneficiary),200), l.is_demo, auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.paid', 'expenditure', i::text, jsonb_build_object('amount', p_amount, 'currency', l.currency));
  return i;
end $$;

create or replace function public.receivable_add(p_fee_type text, p_amount numeric, p_currency text, p_due_on date, p_payer_ref text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; ref text := nullif(btrim(coalesce(p_payer_ref,'')),'');
begin
  if btrim(coalesce(p_fee_type,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_currency is null or p_currency not in ('LBP','USD') then raise exception 'bad_currency' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if p_due_on is null or p_due_on < date '2000-01-01' or p_due_on > date '2100-01-01' then raise exception 'bad_date' using errcode = '22023'; end if;
  -- payer_ref must be an opaque code (file/transaction number), not a name or phone number.
  if ref is not null and (ref !~ '^[A-Za-z0-9/_.#-]{1,60}$' or ref ~ '^[+]?[0-9]{7,}$') then raise exception 'bad_payer_ref' using errcode = '22023'; end if;
  insert into receivable (municipality_id, fee_type, amount, currency, due_on, payer_ref, is_demo, created_by) values (m, left(btrim(p_fee_type),200), round(p_amount,2), p_currency, p_due_on, ref, is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'receivable.added', 'receivable', i::text, jsonb_build_object('amount', p_amount, 'currency', p_currency));
  return i;
end $$;

-- Records a (possibly partial) payment against a receivable as a collection_entry linked to it; the entry takes the receivable's currency.
create or replace function public.receivable_settle(p_receivable uuid, p_amount numeric, p_method text default 'cash', p_receipt_no text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); r receivable%rowtype; i uuid; got numeric;
begin
  select * into r from receivable where id = p_receivable and municipality_id = m for update;
  if not found then raise exception 'receivable_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'receivable_closed' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if p_method is null or p_method not in ('cash','transfer','cheque') then raise exception 'bad_method' using errcode = '22023'; end if;
  select coalesce(sum(amount),0) into got from collection_entry where receivable_id = p_receivable;
  if round(p_amount,2) > r.amount - got then raise exception 'exceeds_remaining' using errcode = '22023'; end if;
  insert into collection_entry (municipality_id, service_label, receipt_no, amount, currency, method, collected_by, is_demo, receivable_id)
  values (m, left(r.fee_type,200), nullif(left(btrim(coalesce(p_receipt_no,'')),60),''), round(p_amount,2), r.currency, p_method, auth.uid(), r.is_demo, p_receivable) returning id into i;
  if got + round(p_amount,2) >= r.amount then update receivable set status = 'settled', settled_on = current_date where id = p_receivable; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'receivable.settled', 'receivable', p_receivable::text, jsonb_build_object('amount', p_amount, 'currency', r.currency));
  return i;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'finance_add_line(int,text,text,text,text,numeric,text)','finance_amend(uuid,numeric,text,date)','finance_commit(uuid,numeric,text,date)',
    'finance_pay(uuid,numeric,date,text,uuid)','receivable_add(text,numeric,text,date,text)','receivable_settle(uuid,numeric,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
