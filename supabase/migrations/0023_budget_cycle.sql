-- 0023: Budget lifecycle, typed credit amendments, availability engine, fiscal-year closing.
-- Idempotent and non-destructive: only "if not exists", "add column if not exists", "create or replace", "drop trigger/policy if exists".
-- Requires 0016 (finance), 0015 (council decisions), 0019 (finance_amend with decision), 0020.
-- STRUCTURE ONLY. No legal numbers are hard-coded:
--   * the supplementary period length ("المدة المتممة") is a per-municipality setting, NULL until entered, flagged "يلزم تحقق" until a lawyer verifies it;
--   * which fields each amendment type requires is data (credit_amendment_rule, pending_review), not code;
--   * budget and credit-transfer decisions are never eligible for tacit approval (lib/council.ts NO_TACIT): validation always needs an explicit date + authority.
-- Pre-existing callers keep working: finance_amend(uuid,numeric,text,uuid,date,date), finance_amend_validate(uuid,date), finance_commit, finance_pay are NOT redefined.

-- ───────────────────────── 1) Settings, lifecycle ─────────────────────────
create table if not exists public.budget_cycle_setting (
  municipality_id uuid primary key references public.municipality(id),
  require_cycle_for_execution boolean not null default false,   -- when true a year with no budget_cycle row cannot be executed (commitments/payments blocked)
  supplementary_period_days int check (supplementary_period_days is null or supplementary_period_days between 0 and 366), -- sanity bound only, NOT a legal value
  supplementary_verified boolean not null default false,        -- false = يلزم تحقق
  supplementary_note text,
  freeze_new_commitments boolean not null default true,         -- during closing, no new commitments / payments without commitment (payments on existing commitments continue)
  is_demo boolean not null default false,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now());

create table if not exists public.budget_cycle (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  fiscal_year_id uuid not null unique references public.fiscal_year(id),
  status text not null default 'preparation' check (status in ('preparation','draft','explanatory_report','presented','adopted','validated','executing','closed')),
  draft_on date, report_on date, presented_on date,
  presented_session_id uuid references public.council_session(id) on delete set null,
  adoption_decision_id uuid references public.municipal_decision(id), adopted_on date,
  validation_authority text, validated_on date, validation_note text,
  executing_on date, closed_on date,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.budget_cycle_event (
  id bigint generated always as identity primary key,
  cycle_id uuid not null references public.budget_cycle(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  from_status text, to_status text not null, event_date date, note text,
  is_demo boolean not null default false,
  actor uuid references auth.users(id), created_at timestamptz not null default now());

-- ───────────────────────── 2) Typed credit amendments ─────────────────────────
-- 'original' (the budget line's original_amount) and 'effective' (current_amount) are computed, not stored as amendment rows.
create table if not exists public.credit_amendment_rule (
  amendment_type text primary key,
  label_ar text not null,
  sign text not null check (sign in ('positive','negative','either','pair')),
  affects_credit boolean not null default true,
  requires_decision boolean not null default true,
  requires_funding boolean not null default false,
  requires_authority boolean not null default true,
  requires_validation boolean not null default true,
  requires_effective_date boolean not null default true,
  review_status text not null default 'pending_review' check (review_status in ('verified','pending_review')),
  note_ar text);
alter table public.credit_amendment_rule enable row level security;
drop policy if exists credit_amendment_rule_read on public.credit_amendment_rule;
create policy credit_amendment_rule_read on public.credit_amendment_rule for select to authenticated using (true);

insert into public.credit_amendment_rule (amendment_type, label_ar, sign, affects_credit, requires_decision, requires_funding, requires_authority, requires_validation, requires_effective_date, note_ar) values
 ('amended','تعديل اعتماد','either',true,true,false,true,true,true,'تعديل عام؛ المطلوب الافتراضي محافظ ويلزم تحقق من المواد المنطبقة.'),
 ('opening','فتح اعتماد','positive',true,true,true,true,true,true,'فتح اعتماد جديد؛ يلزم بيان مصدر التمويل. يلزم تحقق.'),
 ('transfer','نقل اعتماد','pair',true,true,false,true,true,true,'نقل بين بندين: يُخفَّض المصدر ويُزاد الهدف معًا؛ لا تصديق حكمي (م.63). يلزم تحقق من القيود.'),
 ('additional','اعتماد إضافي','positive',true,true,true,true,true,true,'يلزم مصدر تمويل. يلزم تحقق.'),
 ('supplementary','اعتماد تكميلي','positive',true,true,true,true,true,true,'يلزم مصدر تمويل. يلزم تحقق من التمييز بينه وبين الإضافي.'),
 ('exceptional','اعتماد استثنائي','positive',true,true,true,true,true,true,'يلزم مصدر تمويل وسبب استثنائي. يلزم تحقق.'),
 ('carried_over','اعتماد مُرحَّل','positive',true,true,true,false,false,true,'يُسجَّل في السنة الجديدة؛ مصدر التمويل = السنة/البند المُرحَّل منه. شروط التصديق تحتاج تحققًا.'),
 ('lapsed','اعتماد ساقط','negative',true,false,false,false,false,true,'إسقاط الرصيد غير المرتبط بالتزام عند الإقفال. شروطه تحتاج تحققًا.'),
 ('suspended','اعتماد معلّق','positive',false,true,false,true,false,true,'لا يغيّر الاعتماد الحالي لكنه يخصم من المتاح إلى أن يُرفع التعليق. يلزم تحقق.')
on conflict (amendment_type) do nothing;

alter table public.budget_amendment
  add column if not exists amendment_type text not null default 'amended'
    check (amendment_type in ('amended','opening','transfer','additional','supplementary','exceptional','carried_over','lapsed','suspended')),
  add column if not exists funding_source text,
  add column if not exists authority text,
  add column if not exists effective_on date,
  add column if not exists transfer_group uuid,
  add column if not exists suspension_released_on date,
  add column if not exists created_via text not null default 'legacy' check (created_via in ('legacy','typed'));
create index if not exists amendment_transfer_group on public.budget_amendment (transfer_group) where transfer_group is not null;

-- ───────────────────────── 3) Closing ─────────────────────────
create table if not exists public.fiscal_year_closing (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  fiscal_year_id uuid not null unique references public.fiscal_year(id),
  status text not null default 'in_progress' check (status in ('in_progress','closed')),
  year_end date not null,                                  -- default Dec 31 of the year: assumption, editable, يلزم تحقق
  supplementary_days int check (supplementary_days is null or supplementary_days between 0 and 366),
  supplementary_ends_on date,
  supplementary_verified boolean not null default false,
  supplementary_note text,
  started_on date not null default current_date,
  final_account_decision_id uuid references public.municipal_decision(id),
  final_account_ref text, final_account_prepared_on date, final_account_validated_on date, final_account_authority text,
  closed_on date, closed_by uuid references auth.users(id), close_note text,
  reopen_count int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.commitment_resolution (
  commitment_id uuid primary key references public.financial_commitment(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  resolution text not null check (resolution in ('carry_over','lapse')),
  remaining_amount numeric(14,2) not null check (remaining_amount > 0),
  decision_id uuid references public.municipal_decision(id),
  note text, is_demo boolean not null default false,
  actor uuid references auth.users(id), created_at timestamptz not null default now());

create table if not exists public.fiscal_year_reopening (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references public.fiscal_year(id),
  municipality_id uuid not null references public.municipality(id),
  reason text not null, decision_id uuid not null references public.municipal_decision(id), authority text,
  snapshot jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  actor uuid references auth.users(id), created_at timestamptz not null default now());

do $$ declare t text; begin
  foreach t in array array['budget_cycle_setting','budget_cycle','budget_cycle_event','fiscal_year_closing','commitment_resolution','fiscal_year_reopening'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()))', t||'_staff_read', t);
  end loop;
end $$;

-- ───────────────────────── 4) Helpers ─────────────────────────
-- Active suspended credit of a line (suspension applied and not released).
create or replace function public._bc_suspended(p_line uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(delta),0) from budget_amendment where line_id = p_line and amendment_type = 'suspended' and applied and suspension_released_on is null
$$;
revoke all on function public._bc_suspended(uuid) from public, anon, authenticated;

-- Compatibility with 0021 (expenditure cycle) when applied: commitment reversals are separate negative rows; unpaid direct payment orders still reserve credit.
-- Resolved dynamically so this migration works before AND after 0021.
create or replace function public._bc_commit_net(p_c uuid) returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v numeric;
begin
  if to_regprocedure('public._exp_commit_net(uuid)') is not null then execute 'select public._exp_commit_net($1)' into v using p_c; return coalesce(v,0); end if;
  select amount into v from financial_commitment where id = p_c; return coalesce(v,0);
end $$;
revoke all on function public._bc_commit_net(uuid) from public, anon, authenticated;

create or replace function public._bc_unpaid_direct(p_line uuid) returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v numeric;
begin
  if to_regprocedure('public._exp_unpaid_direct(uuid)') is not null then execute 'select public._exp_unpaid_direct($1)' into v using p_line; return coalesce(v,0); end if;
  return 0;
end $$;
revoke all on function public._bc_unpaid_direct(uuid) from public, anon, authenticated;

-- Available credit = effective credit - active suspensions - (commitments + payments WITHOUT commitment + unpaid direct orders).
-- A payment under a commitment is never counted twice.
create or replace function public._bc_available(p_line uuid) returns numeric language sql stable security definer set search_path to 'public' as $$
  select l.current_amount - _bc_suspended(l.id) - _fin_reserved(l.id) - _bc_unpaid_direct(l.id) from budget_line l where l.id = p_line
$$;
revoke all on function public._bc_available(uuid) from public, anon, authenticated;

-- ───────────────────────── 5) Availability engine (view) ─────────────────────────
-- security_invoker: the caller's RLS on the underlying tables applies (staff of the same municipality only).
-- Built dynamically so that unpaid direct payment orders (0021) are included when that table exists. Re-run this migration after applying 0021 if it was applied later.
do $$ declare has_orders boolean := to_regclass('public.exp_payment_order') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'expenditure' and column_name = 'payment_order_id'); sql text; begin
  sql := $v$
create or replace view public.v_budget_line_availability with (security_invoker = true) as
select l.id as line_id, l.municipality_id, l.fiscal_year_id, l.code, l.title_ar, l.kind, l.currency,
  l.original_amount,
  l.current_amount as effective_credit,
  coalesce(a.applied_sum,0) as applied_amendments,
  coalesce(a.pending_sum,0) as pending_amendments,           -- shown, never counted in availability
  coalesce(a.pending_count,0)::int as pending_count,
  coalesce(a.suspended,0) as suspended_amount,
  coalesce(c.total,0) as commitments_total,
  coalesce(p.on_commit,0) as paid_on_commitments,
  coalesce(p.direct,0) as paid_without_commitment,
  coalesce(p.on_commit,0) + coalesce(p.direct,0) as paid_total,
  coalesce(c.total,0) - coalesce(p.on_commit,0) as commitments_outstanding,
  __UNPAID__ as unpaid_direct_orders,
  coalesce(c.total,0) + coalesce(p.direct,0) + __UNPAID__ as reserved,   -- commitments + payments with no commitment + unpaid direct orders (payments under a commitment excluded: already reserved)
  case when l.kind = 'expense' then l.current_amount - coalesce(a.suspended,0) - (coalesce(c.total,0) + coalesce(p.direct,0) + __UNPAID__) end as available,
  l.current_amount - (l.original_amount + coalesce(a.applied_sum,0)) as credit_drift   -- must be 0: effective credit = original + applied amendments
from public.budget_line l
left join (select line_id,
    sum(delta) filter (where applied and amendment_type <> 'suspended') as applied_sum,
    sum(delta) filter (where not applied and amendment_type <> 'suspended') as pending_sum,
    count(*) filter (where not applied) as pending_count,
    sum(delta) filter (where applied and amendment_type = 'suspended' and suspension_released_on is null) as suspended
  from public.budget_amendment group by line_id) a on a.line_id = l.id
left join (select line_id, sum(amount) as total from public.financial_commitment group by line_id) c on c.line_id = l.id
left join (select line_id, sum(amount) filter (where commitment_id is not null) as on_commit, sum(amount) filter (where commitment_id is null) as direct from public.expenditure group by line_id) p on p.line_id = l.id
__JOIN__
$v$;
  if has_orders then
    sql := replace(sql, '__UNPAID__', 'greatest(coalesce(o.orders_direct,0) - coalesce(p.direct_via_order,0), 0)');
    sql := replace(sql, 'sum(amount) filter (where commitment_id is null) as direct from public.expenditure', 'sum(amount) filter (where commitment_id is null) as direct, sum(amount) filter (where commitment_id is null and payment_order_id is not null) as direct_via_order from public.expenditure');
    sql := replace(sql, '__JOIN__', 'left join (select line_id, sum(amount) as orders_direct from public.exp_payment_order where commitment_id is null group by line_id) o on o.line_id = l.id');
  else
    sql := replace(replace(sql, '__UNPAID__', '0::numeric'), '__JOIN__', '');
  end if;
  execute sql;
end $$;
revoke all on public.v_budget_line_availability from public, anon;
grant select on public.v_budget_line_availability to authenticated;

-- ───────────────────────── 6) Write guard: closed year, lifecycle gate, closing freeze, suspensions ─────────────────────────
create or replace function public._bc_guard_write() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare j jsonb; fy uuid; lid uuid; st text; cyc text; mun uuid; req boolean := false; frz boolean := true; sus numeric; cur numeric;
begin
  if TG_OP = 'DELETE' then j := to_jsonb(OLD); else j := to_jsonb(NEW); end if;
  if TG_TABLE_NAME = 'budget_line' then fy := (j->>'fiscal_year_id')::uuid;
  else lid := (j->>'line_id')::uuid; select fiscal_year_id into fy from budget_line where id = lid; end if;
  if fy is null then return case when TG_OP = 'DELETE' then OLD else NEW end; end if;   -- e.g. cascade of a deleted line
  select status, municipality_id into st, mun from fiscal_year where id = fy;
  if st = 'closed' then raise exception 'year_closed' using errcode = '22023'; end if;

  if TG_OP = 'INSERT' and TG_TABLE_NAME in ('financial_commitment','expenditure','budget_amendment') and not (TG_TABLE_NAME in ('financial_commitment','expenditure') and (j->>'amount')::numeric < 0) then   -- reversals (0021, negative rows) only face the closed-year check
    select status into cyc from budget_cycle where fiscal_year_id = fy;
    if found then
      if cyc <> 'executing' then raise exception 'budget_not_executing' using errcode = '22023'; end if;
    else
      select coalesce(s.require_cycle_for_execution,false) into req from (select 1) x left join budget_cycle_setting s on s.municipality_id = mun;
      if req then raise exception 'budget_cycle_required' using errcode = '22023'; end if;
    end if;
    if TG_TABLE_NAME in ('financial_commitment','expenditure') and (TG_TABLE_NAME = 'financial_commitment' or (j->>'commitment_id') is null) then
      select coalesce(s.freeze_new_commitments,true) into frz from (select 1) x left join budget_cycle_setting s on s.municipality_id = mun;
      if frz and exists (select 1 from fiscal_year_closing c where c.fiscal_year_id = fy and c.status = 'in_progress') then raise exception 'commitments_frozen' using errcode = '22023'; end if;
      sus := _bc_suspended(lid);
      if sus > 0 then
        select current_amount into cur from budget_line where id = lid;
        if (j->>'amount')::numeric > cur - sus - _fin_reserved(lid) then raise exception 'credit_suspended' using errcode = '22023'; end if;
      end if;
    end if;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end $$;
revoke all on function public._bc_guard_write() from public, anon, authenticated;

drop trigger if exists bc_guard_budget_line on public.budget_line;
create trigger bc_guard_budget_line before insert or update or delete on public.budget_line for each row execute function public._bc_guard_write();
drop trigger if exists bc_guard_commitment on public.financial_commitment;
create trigger bc_guard_commitment before insert or update or delete on public.financial_commitment for each row execute function public._bc_guard_write();
drop trigger if exists bc_guard_expenditure on public.expenditure;
create trigger bc_guard_expenditure before insert or update or delete on public.expenditure for each row execute function public._bc_guard_write();
drop trigger if exists bc_guard_amendment on public.budget_amendment;
create trigger bc_guard_amendment before insert or update or delete on public.budget_amendment for each row execute function public._bc_guard_write();

-- Typed amendments can only be validated through finance_amendment_validate_typed (which also handles both legs of a transfer).
create or replace function public._bc_guard_amend_apply() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not OLD.applied and NEW.applied and (OLD.created_via = 'typed' or OLD.amendment_type <> 'amended') and coalesce(current_setting('baladi.bc_validate', true),'') <> '1' then
    raise exception 'use_typed_validation' using errcode = '22023';
  end if;
  return NEW;
end $$;
revoke all on function public._bc_guard_amend_apply() from public, anon, authenticated;
drop trigger if exists bc_guard_amend_apply on public.budget_amendment;
create trigger bc_guard_amend_apply before update on public.budget_amendment for each row execute function public._bc_guard_amend_apply();

-- ───────────────────────── 7) Lifecycle RPCs ─────────────────────────
create or replace function public.budget_cycle_settings_set(p_require boolean, p_supp_days int default null, p_supp_verified boolean default false, p_freeze boolean default true, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_supp_days is not null and (p_supp_days < 0 or p_supp_days > 366) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into budget_cycle_setting (municipality_id, require_cycle_for_execution, supplementary_period_days, supplementary_verified, supplementary_note, freeze_new_commitments, is_demo, updated_by)
  values (m, coalesce(p_require,false), p_supp_days, coalesce(p_supp_verified,false) and p_supp_days is not null, nullif(left(btrim(coalesce(p_note,'')),500),''), coalesce(p_freeze,true), is_demo_staff(), auth.uid())
  on conflict (municipality_id) do update set require_cycle_for_execution = excluded.require_cycle_for_execution, supplementary_period_days = excluded.supplementary_period_days,
    supplementary_verified = excluded.supplementary_verified, supplementary_note = excluded.supplementary_note, freeze_new_commitments = excluded.freeze_new_commitments, updated_by = auth.uid(), updated_at = now();
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'budget_cycle.settings_set', 'budget_cycle_setting', m::text,
    jsonb_build_object('require', p_require, 'supp_days', p_supp_days, 'verified', p_supp_verified, 'freeze', p_freeze));
end $$;

create or replace function public.budget_cycle_open(p_year int)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; i uuid;
begin
  if p_year is null or p_year < 1990 or p_year > 2100 then raise exception 'bad_year' using errcode = '22023'; end if;
  insert into fiscal_year (municipality_id, year, is_demo) values (m, p_year, is_demo_staff()) on conflict (municipality_id, year) do nothing;
  select * into fy from fiscal_year where municipality_id = m and year = p_year;
  if fy.status <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  select id into i from budget_cycle where fiscal_year_id = fy.id;
  if found then return i; end if;
  insert into budget_cycle (municipality_id, fiscal_year_id, is_demo, created_by) values (m, fy.id, fy.is_demo, auth.uid()) returning id into i;
  insert into budget_cycle_event (cycle_id, municipality_id, from_status, to_status, event_date, is_demo, actor) values (i, m, null, 'preparation', current_date, fy.is_demo, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'budget_cycle.opened', 'budget_cycle', i::text, jsonb_build_object('year', p_year));
  return i;
end $$;

-- One step forward at a time. Evidence per stage:
--   draft/explanatory_report/presented: date (presented: optional council session)
--   adopted: council decision (category 'budget', adopted or later)
--   validated: explicit validation date + authority (NO tacit approval for budget decisions)
--   executing: re-checks adoption + validation evidence and that the decision was not suspended/annulled.
-- 'closed' is reached only through closing_close.
create or replace function public.budget_cycle_advance(p_year int, p_to text, p_date date, p_decision uuid default null, p_authority text default null, p_session uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; c budget_cycle%rowtype; d municipal_decision%rowtype;
  ord text[] := array['preparation','draft','explanatory_report','presented','adopted','validated','executing','closed']; a int; b int; prev date; note text := nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  select * into fy from fiscal_year where municipality_id = m and year = p_year;
  if not found then raise exception 'bad_year' using errcode = '22023'; end if;
  if fy.status = 'closed' then raise exception 'year_closed' using errcode = '22023'; end if;
  select * into c from budget_cycle where fiscal_year_id = fy.id for update;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0002'; end if;
  a := array_position(ord, c.status); b := array_position(ord, p_to);
  if b is null or p_to in ('preparation','closed') then raise exception 'bad_stage' using errcode = '22023'; end if;
  if b <> a + 1 then raise exception 'stage_order' using errcode = '22023'; end if;
  if p_date is null or p_date > current_date then raise exception 'bad_date' using errcode = '22023'; end if;
  prev := coalesce(c.executing_on, c.validated_on, c.adopted_on, c.presented_on, c.report_on, c.draft_on);
  if prev is not null and p_date < prev then raise exception 'bad_date' using errcode = '22023'; end if;

  if p_to = 'presented' and p_session is not null and not exists (select 1 from council_session where id = p_session and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_to = 'adopted' then
    select * into d from municipal_decision where id = p_decision and municipality_id = m;
    if not found then raise exception 'decision_required' using errcode = '22023'; end if;
    if d.legal_status not in ('adopted','under_review','effective') then raise exception 'decision_not_adopted' using errcode = '22023'; end if;
    if d.category <> 'budget' then raise exception 'decision_not_budget' using errcode = '22023'; end if;
  elsif p_to = 'validated' then
    if btrim(coalesce(p_authority,'')) = '' then raise exception 'authority_required' using errcode = '22023'; end if;
  elsif p_to = 'executing' then
    if c.adoption_decision_id is null or c.adopted_on is null then raise exception 'adoption_evidence_missing' using errcode = '22023'; end if;
    if c.validated_on is null or btrim(coalesce(c.validation_authority,'')) = '' then raise exception 'validation_evidence_missing' using errcode = '22023'; end if;
    select * into d from municipal_decision where id = c.adoption_decision_id;
    if not found or d.legal_status not in ('adopted','under_review','effective') then raise exception 'decision_not_adopted' using errcode = '22023'; end if;
  end if;

  update budget_cycle set status = p_to,
    draft_on = case when p_to = 'draft' then p_date else draft_on end,
    report_on = case when p_to = 'explanatory_report' then p_date else report_on end,
    presented_on = case when p_to = 'presented' then p_date else presented_on end,
    presented_session_id = case when p_to = 'presented' then p_session else presented_session_id end,
    adoption_decision_id = case when p_to = 'adopted' then p_decision else adoption_decision_id end,
    adopted_on = case when p_to = 'adopted' then p_date else adopted_on end,
    validation_authority = case when p_to = 'validated' then left(btrim(p_authority),200) else validation_authority end,
    validated_on = case when p_to = 'validated' then p_date else validated_on end,
    validation_note = case when p_to = 'validated' then note else validation_note end,
    executing_on = case when p_to = 'executing' then p_date else executing_on end,
    updated_at = now() where id = c.id;
  insert into budget_cycle_event (cycle_id, municipality_id, from_status, to_status, event_date, note, is_demo, actor) values (c.id, m, c.status, p_to, p_date, note, c.is_demo, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'budget_cycle.advanced', 'budget_cycle', c.id::text,
    jsonb_build_object('year', p_year, 'from', c.status, 'to', p_to, 'date', p_date, 'decision', p_decision));
end $$;

-- ───────────────────────── 8) Typed amendment RPCs ─────────────────────────
create or replace function public.finance_amend_typed(p_line uuid, p_type text, p_amount numeric, p_reason text, p_decision uuid default null, p_funding text default null,
  p_authority text default null, p_validated_on date default null, p_effective_on date default null, p_date date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); l budget_line%rowtype; r credit_amendment_rule%rowtype; i uuid; st text; ds text; delta numeric; apply boolean;
begin
  select * into r from credit_amendment_rule where amendment_type = p_type;
  if not found then raise exception 'bad_type' using errcode = '22023'; end if;
  if r.sign = 'pair' then raise exception 'use_transfer_rpc' using errcode = '22023'; end if;
  select * into l from budget_line where id = p_line and municipality_id = m for update;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  select status into st from fiscal_year where id = l.fiscal_year_id;
  if st <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if (r.sign in ('positive','negative')) and p_amount < 0 then raise exception 'bad_amount' using errcode = '22023'; end if;
  delta := round(case r.sign when 'negative' then -abs(p_amount) when 'positive' then abs(p_amount) else p_amount end, 2);
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  if r.requires_decision or p_decision is not null then
    select legal_status into ds from municipal_decision where id = p_decision and municipality_id = m;
    if not found then raise exception 'decision_required' using errcode = '22023'; end if;
    if ds not in ('adopted','under_review','effective') then raise exception 'decision_not_adopted' using errcode = '22023'; end if;
  end if;
  if r.requires_funding and btrim(coalesce(p_funding,'')) = '' then raise exception 'funding_required' using errcode = '22023'; end if;
  if r.requires_effective_date and p_effective_on is null then raise exception 'effective_date_required' using errcode = '22023'; end if;
  if r.requires_authority and p_validated_on is not null and btrim(coalesce(p_authority,'')) = '' then raise exception 'authority_required' using errcode = '22023'; end if;
  if p_validated_on is not null and p_validated_on > current_date then raise exception 'bad_date' using errcode = '22023'; end if;
  -- applied immediately when no validation is required by the rule, or when an explicit validation date is supplied (never tacit)
  apply := (not r.requires_validation) or p_validated_on is not null;
  if apply and r.requires_authority and btrim(coalesce(p_authority,'')) = '' then raise exception 'authority_required' using errcode = '22023'; end if;
  if apply then
    if r.affects_credit then perform _fin_apply_amendment(p_line, delta);
    else
      if l.kind <> 'expense' then raise exception 'not_expense_line' using errcode = '22023'; end if;
      if delta > _bc_available(p_line) then raise exception 'exceeds_available' using errcode = '22023'; end if;
    end if;
  end if;
  insert into budget_amendment (line_id, municipality_id, delta, reason, amended_on, is_demo, actor, decision_id, applied, validated_on, amendment_type, funding_source, authority, effective_on, created_via)
  values (p_line, m, delta, left(btrim(p_reason),500), coalesce(p_date, current_date), l.is_demo, auth.uid(), p_decision, apply, case when apply then p_validated_on end, p_type,
    nullif(left(btrim(coalesce(p_funding,'')),300),''), nullif(left(btrim(coalesce(p_authority,'')),200),''), p_effective_on, 'typed') returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.amended_typed', 'budget_line', p_line::text,
    jsonb_build_object('type', p_type, 'delta', delta, 'applied', apply, 'decision', p_decision, 'amendment', i));
  return i;
end $$;

-- Transfer = two legs (source down, target up) created and applied together; both stay pending until validated.
create or replace function public.finance_transfer_credit(p_from uuid, p_to uuid, p_amount numeric, p_reason text, p_decision uuid, p_authority text default null,
  p_validated_on date default null, p_effective_on date default null, p_date date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a budget_line%rowtype; b budget_line%rowtype; r credit_amendment_rule%rowtype; g uuid := gen_random_uuid(); ds text; st text; apply boolean; amt numeric;
begin
  select * into r from credit_amendment_rule where amendment_type = 'transfer';
  if p_from is null or p_to is null or p_from = p_to then raise exception 'bad_input' using errcode = '22023'; end if;
  -- lock in a stable order to avoid deadlocks
  perform 1 from budget_line where id in (p_from, p_to) and municipality_id = m order by id for update;
  select * into a from budget_line where id = p_from and municipality_id = m;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  select * into b from budget_line where id = p_to and municipality_id = m;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  if a.fiscal_year_id <> b.fiscal_year_id then raise exception 'transfer_year_mismatch' using errcode = '22023'; end if;
  if a.currency <> b.currency then raise exception 'transfer_currency_mismatch' using errcode = '22023'; end if;
  if a.kind <> 'expense' or b.kind <> 'expense' then raise exception 'not_expense_line' using errcode = '22023'; end if;
  select status into st from fiscal_year where id = a.fiscal_year_id;
  if st <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  amt := round(p_amount, 2);
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  select legal_status into ds from municipal_decision where id = p_decision and municipality_id = m;
  if not found then raise exception 'decision_required' using errcode = '22023'; end if;
  if ds not in ('adopted','under_review','effective') then raise exception 'decision_not_adopted' using errcode = '22023'; end if;
  if r.requires_effective_date and p_effective_on is null then raise exception 'effective_date_required' using errcode = '22023'; end if;
  if p_validated_on is not null and p_validated_on > current_date then raise exception 'bad_date' using errcode = '22023'; end if;
  if amt > _bc_available(p_from) then raise exception 'exceeds_available' using errcode = '22023'; end if;
  apply := p_validated_on is not null;     -- no tacit approval for credit transfers
  if apply and r.requires_authority and btrim(coalesce(p_authority,'')) = '' then raise exception 'authority_required' using errcode = '22023'; end if;
  if apply then perform _fin_apply_amendment(p_from, -amt); perform _fin_apply_amendment(p_to, amt); end if;
  insert into budget_amendment (line_id, municipality_id, delta, reason, amended_on, is_demo, actor, decision_id, applied, validated_on, amendment_type, funding_source, authority, effective_on, transfer_group, created_via)
  values (p_from, m, -amt, left(btrim(p_reason),500), coalesce(p_date, current_date), a.is_demo, auth.uid(), p_decision, apply, case when apply then p_validated_on end, 'transfer', 'نقل إلى ' || left(b.code,40), nullif(left(btrim(coalesce(p_authority,'')),200),''), p_effective_on, g, 'typed'),
         (p_to, m, amt, left(btrim(p_reason),500), coalesce(p_date, current_date), b.is_demo, auth.uid(), p_decision, apply, case when apply then p_validated_on end, 'transfer', 'نقل من ' || left(a.code,40), nullif(left(btrim(coalesce(p_authority,'')),200),''), p_effective_on, g, 'typed');
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.credit_transferred', 'budget_line', p_from::text,
    jsonb_build_object('to', p_to, 'amount', amt, 'applied', apply, 'decision', p_decision, 'group', g));
  return g;
end $$;

-- Validates a pending typed amendment (all legs of a transfer together) with an explicit date and the validating authority.
create or replace function public.finance_amendment_validate_typed(p_amendment uuid, p_validated_on date, p_authority text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a budget_amendment%rowtype; x budget_amendment%rowtype; r credit_amendment_rule%rowtype; auth_txt text; dd date;
begin
  if p_validated_on is null or p_validated_on > current_date then raise exception 'bad_date' using errcode = '22023'; end if;
  select * into a from budget_amendment where id = p_amendment and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.applied then raise exception 'already_applied' using errcode = '22023'; end if;
  select * into r from credit_amendment_rule where amendment_type = a.amendment_type;
  auth_txt := nullif(left(btrim(coalesce(p_authority, a.authority, '')),200),'');
  if r.requires_authority and auth_txt is null then raise exception 'authority_required' using errcode = '22023'; end if;
  if a.decision_id is not null then select decided_on into dd from municipal_decision where id = a.decision_id; if dd is not null and p_validated_on < dd then raise exception 'bad_date' using errcode = '22023'; end if; end if;
  perform set_config('baladi.bc_validate', '1', true);
  for x in select * from budget_amendment where municipality_id = m and not applied and (id = a.id or (a.transfer_group is not null and transfer_group = a.transfer_group)) order by delta, id for update loop
    if r.affects_credit then perform _fin_apply_amendment(x.line_id, x.delta); end if;
    update budget_amendment set applied = true, validated_on = p_validated_on, authority = coalesce(auth_txt, authority) where id = x.id;
  end loop;
  perform set_config('baladi.bc_validate', '', true);
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.amendment_validated_typed', 'budget_amendment', p_amendment::text,
    jsonb_build_object('validated_on', p_validated_on, 'authority', auth_txt, 'type', a.amendment_type));
end $$;

create or replace function public.finance_suspension_release(p_amendment uuid, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a budget_amendment%rowtype;
begin
  select * into a from budget_amendment where id = p_amendment and municipality_id = m and amendment_type = 'suspended' for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not a.applied or a.suspension_released_on is not null then raise exception 'already_applied' using errcode = '22023'; end if;
  update budget_amendment set suspension_released_on = current_date where id = p_amendment;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.suspension_released', 'budget_amendment', p_amendment::text, jsonb_build_object('note', nullif(left(btrim(coalesce(p_note,'')),300),'')));
end $$;

-- ───────────────────────── 9) Closing ─────────────────────────
-- Checks used by the wizard and re-evaluated by closing_close. level: block | warn | ok.
create or replace function public._bc_closing_check(p_fy uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare cl fiscal_year_closing%rowtype; r jsonb := '[]'::jsonb; n int; ds text; cat text;
begin
  select * into cl from fiscal_year_closing where fiscal_year_id = p_fy;
  if not found then return jsonb_build_array(jsonb_build_object('code','closing_not_started','level','block','count',1)); end if;

  select count(*) into n from financial_commitment c join budget_line l on l.id = c.line_id
   where l.fiscal_year_id = p_fy and c.amount > 0 and _bc_commit_net(c.id) - coalesce((select sum(e.amount) from expenditure e where e.commitment_id = c.id),0) > 0
     and not exists (select 1 from commitment_resolution x where x.commitment_id = c.id);
  r := r || jsonb_build_object('code','open_commitments_unresolved','level',case when n > 0 then 'block' else 'ok' end,'count',n);

  select count(*) into n from budget_amendment a join budget_line l on l.id = a.line_id where l.fiscal_year_id = p_fy and not a.applied;
  r := r || jsonb_build_object('code','pending_amendments','level',case when n > 0 then 'block' else 'ok' end,'count',n);

  select count(*) into n from financial_commitment c join budget_line l on l.id = c.line_id
   where l.fiscal_year_id = p_fy and c.amount > 0 and (select coalesce(sum(e.amount),0) from expenditure e where e.commitment_id = c.id) > _bc_commit_net(c.id);
  r := r || jsonb_build_object('code','payments_exceed_commitment','level',case when n > 0 then 'block' else 'ok' end,'count',n);

  select count(*) into n from budget_line l where l.fiscal_year_id = p_fy and l.kind = 'expense' and (_fin_reserved(l.id) + _bc_unpaid_direct(l.id)) > l.current_amount;
  r := r || jsonb_build_object('code','reserved_exceeds_credit','level',case when n > 0 then 'block' else 'ok' end,'count',n);

  select count(*) into n from v_budget_line_availability v where v.fiscal_year_id = p_fy and v.credit_drift <> 0;
  r := r || jsonb_build_object('code','credit_drift','level',case when n > 0 then 'block' else 'ok' end,'count',n);

  select count(*) into n from expenditure e join budget_line l on l.id = e.line_id where l.fiscal_year_id = p_fy and e.commitment_id is null;
  r := r || jsonb_build_object('code','payments_without_commitment','level',case when n > 0 then 'warn' else 'ok' end,'count',n);

  r := r || jsonb_build_object('code','supplementary_not_set','level',case when cl.supplementary_ends_on is null then 'block' else 'ok' end,'count',case when cl.supplementary_ends_on is null then 1 else 0 end);
  r := r || jsonb_build_object('code','supplementary_not_ended','level',case when cl.supplementary_ends_on is not null and current_date <= cl.supplementary_ends_on then 'block' else 'ok' end,'count',case when cl.supplementary_ends_on is not null and current_date <= cl.supplementary_ends_on then 1 else 0 end);
  r := r || jsonb_build_object('code','supplementary_unverified','level',case when cl.supplementary_ends_on is not null and not cl.supplementary_verified then 'warn' else 'ok' end,'count',case when cl.supplementary_ends_on is not null and not cl.supplementary_verified then 1 else 0 end);

  r := r || jsonb_build_object('code','final_account_missing','level',case when cl.final_account_decision_id is null or cl.final_account_prepared_on is null then 'block' else 'ok' end,'count',case when cl.final_account_decision_id is null or cl.final_account_prepared_on is null then 1 else 0 end);
  if cl.final_account_decision_id is not null then
    select legal_status, category into ds, cat from municipal_decision where id = cl.final_account_decision_id;
    r := r || jsonb_build_object('code','final_account_decision_not_adopted','level',case when ds is null or ds not in ('adopted','under_review','effective') then 'block' else 'ok' end,'count',case when ds is null or ds not in ('adopted','under_review','effective') then 1 else 0 end);
    r := r || jsonb_build_object('code','final_account_not_validated','level',case when cl.final_account_validated_on is null then 'warn' else 'ok' end,'count',case when cl.final_account_validated_on is null then 1 else 0 end);
  end if;
  return r;
end $$;
revoke all on function public._bc_closing_check(uuid) from public, anon, authenticated;

create or replace function public.closing_check(p_year int) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype;
begin
  select * into fy from fiscal_year where municipality_id = m and year = p_year;
  if not found then raise exception 'bad_year' using errcode = '22023'; end if;
  return jsonb_build_object('checks', _bc_closing_check(fy.id),
    'totals', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'credit', cr, 'committed', cm, 'paid', pd, 'available', av) order by currency)
       from (select currency, sum(effective_credit) cr, sum(reserved) cm, sum(paid_total) pd, sum(available) av from v_budget_line_availability where fiscal_year_id = fy.id and kind = 'expense' group by currency) t), '[]'::jsonb));
end $$;

create or replace function public.closing_start(p_year int, p_year_end date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; c budget_cycle%rowtype; s budget_cycle_setting%rowtype; i uuid; ye date;
begin
  select * into fy from fiscal_year where municipality_id = m and year = p_year;
  if not found then raise exception 'bad_year' using errcode = '22023'; end if;
  if fy.status = 'closed' then raise exception 'year_closed' using errcode = '22023'; end if;
  select * into c from budget_cycle where fiscal_year_id = fy.id;
  if found and c.status <> 'executing' then raise exception 'budget_not_executing' using errcode = '22023'; end if;
  select id into i from fiscal_year_closing where fiscal_year_id = fy.id;
  if found then return i; end if;
  select * into s from budget_cycle_setting where municipality_id = m;
  ye := coalesce(p_year_end, make_date(p_year, 12, 31));   -- assumption: calendar fiscal year (يلزم تحقق); editable by passing p_year_end
  insert into fiscal_year_closing (municipality_id, fiscal_year_id, year_end, supplementary_days, supplementary_ends_on, supplementary_verified, supplementary_note, is_demo)
  values (m, fy.id, ye, s.supplementary_period_days, case when s.supplementary_period_days is not null then ye + s.supplementary_period_days end, coalesce(s.supplementary_verified,false),
    nullif(left(btrim(coalesce(p_note, s.supplementary_note, '')),500),''), fy.is_demo) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'closing.started', 'fiscal_year', fy.id::text, jsonb_build_object('year', p_year, 'year_end', ye));
  return i;
end $$;

create or replace function public.closing_set_supplementary(p_year int, p_days int default null, p_ends_on date default null, p_verified boolean default false, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; cl fiscal_year_closing%rowtype; ends date;
begin
  select * into fy from fiscal_year where municipality_id = m and year = p_year;
  if not found then raise exception 'bad_year' using errcode = '22023'; end if;
  select * into cl from fiscal_year_closing where fiscal_year_id = fy.id for update;
  if not found then raise exception 'closing_not_started' using errcode = 'P0002'; end if;
  if cl.status = 'closed' then raise exception 'year_closed' using errcode = '22023'; end if;
  if p_days is not null and (p_days < 0 or p_days > 366) then raise exception 'bad_input' using errcode = '22023'; end if;
  ends := coalesce(p_ends_on, case when p_days is not null then cl.year_end + p_days end);
  if ends is null or ends < cl.year_end then raise exception 'bad_date' using errcode = '22023'; end if;
  update fiscal_year_closing set supplementary_days = p_days, supplementary_ends_on = ends, supplementary_verified = coalesce(p_verified,false),
    supplementary_note = nullif(left(btrim(coalesce(p_note,'')),500),''), updated_at = now() where id = cl.id;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'closing.supplementary_set', 'fiscal_year', fy.id::text,
    jsonb_build_object('days', p_days, 'ends_on', ends, 'verified', coalesce(p_verified,false)));
end $$;

create or replace function public.closing_resolve_commitment(p_commitment uuid, p_resolution text, p_decision uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c financial_commitment%rowtype; l budget_line%rowtype; rem numeric;
begin
  if p_resolution is null or p_resolution not in ('carry_over','lapse') then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into c from financial_commitment where id = p_commitment and municipality_id = m;
  if not found then raise exception 'commitment_not_found' using errcode = 'P0002'; end if;
  select * into l from budget_line where id = c.line_id;
  if not exists (select 1 from fiscal_year_closing where fiscal_year_id = l.fiscal_year_id and status = 'in_progress') then raise exception 'closing_not_started' using errcode = 'P0002'; end if;
  if c.amount <= 0 then raise exception 'nothing_to_resolve' using errcode = '22023'; end if;
  rem := _bc_commit_net(p_commitment) - coalesce((select sum(amount) from expenditure where commitment_id = p_commitment),0);
  if rem <= 0 then raise exception 'nothing_to_resolve' using errcode = '22023'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into commitment_resolution (commitment_id, municipality_id, resolution, remaining_amount, decision_id, note, is_demo, actor)
  values (p_commitment, m, p_resolution, rem, p_decision, nullif(left(btrim(coalesce(p_note,'')),300),''), c.is_demo, auth.uid())
  on conflict (commitment_id) do update set resolution = excluded.resolution, remaining_amount = excluded.remaining_amount, decision_id = excluded.decision_id, note = excluded.note, actor = auth.uid(), created_at = now();
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'closing.commitment_resolved', 'financial_commitment', p_commitment::text, jsonb_build_object('resolution', p_resolution, 'remaining', rem));
end $$;

-- قطع الحساب (final account): link to the council decision that adopts it. The decision must be of category 'accounts'.
create or replace function public.closing_record_final_account(p_year int, p_decision uuid, p_prepared_on date, p_ref text default null, p_validated_on date default null, p_authority text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; cl fiscal_year_closing%rowtype; d municipal_decision%rowtype;
begin
  select * into fy from fiscal_year where municipality_id = m and year = p_year;
  if not found then raise exception 'bad_year' using errcode = '22023'; end if;
  select * into cl from fiscal_year_closing where fiscal_year_id = fy.id for update;
  if not found then raise exception 'closing_not_started' using errcode = 'P0002'; end if;
  if cl.status = 'closed' then raise exception 'year_closed' using errcode = '22023'; end if;
  select * into d from municipal_decision where id = p_decision and municipality_id = m;
  if not found then raise exception 'decision_required' using errcode = '22023'; end if;
  if d.legal_status not in ('adopted','under_review','effective') then raise exception 'decision_not_adopted' using errcode = '22023'; end if;
  if d.category <> 'accounts' then raise exception 'decision_not_accounts' using errcode = '22023'; end if;
  if p_prepared_on is null or p_prepared_on > current_date or (p_validated_on is not null and (p_validated_on > current_date or p_validated_on < p_prepared_on)) then raise exception 'bad_date' using errcode = '22023'; end if;
  update fiscal_year_closing set final_account_decision_id = p_decision, final_account_prepared_on = p_prepared_on, final_account_ref = nullif(left(btrim(coalesce(p_ref,'')),200),''),
    final_account_validated_on = p_validated_on, final_account_authority = nullif(left(btrim(coalesce(p_authority,'')),200),''), updated_at = now() where id = cl.id;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'closing.final_account_recorded', 'fiscal_year', fy.id::text, jsonb_build_object('decision', p_decision, 'prepared_on', p_prepared_on, 'validated_on', p_validated_on));
end $$;

create or replace function public.closing_close(p_year int, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; cl fiscal_year_closing%rowtype; chk jsonb; blockers text;
begin
  select * into fy from fiscal_year where municipality_id = m and year = p_year for update;
  if not found then raise exception 'bad_year' using errcode = '22023'; end if;
  if fy.status = 'closed' then raise exception 'year_closed' using errcode = '22023'; end if;
  select * into cl from fiscal_year_closing where fiscal_year_id = fy.id for update;
  if not found then raise exception 'closing_not_started' using errcode = 'P0002'; end if;
  chk := _bc_closing_check(fy.id);
  select string_agg(x->>'code', ',') into blockers from jsonb_array_elements(chk) x where x->>'level' = 'block';
  if blockers is not null then raise exception 'closing_blocked: %', blockers using errcode = '22023'; end if;
  -- refresh remaining amounts of resolved commitments so the snapshot is final
  update commitment_resolution r set remaining_amount = greatest(0.01, _bc_commit_net(c.id) - coalesce((select sum(e.amount) from expenditure e where e.commitment_id = c.id),0))
    from financial_commitment c where c.id = r.commitment_id and c.line_id in (select id from budget_line where fiscal_year_id = fy.id);
  update fiscal_year set status = 'closed' where id = fy.id;
  update fiscal_year_closing set status = 'closed', closed_on = current_date, closed_by = auth.uid(), close_note = nullif(left(btrim(coalesce(p_note,'')),500),''), updated_at = now() where id = cl.id;
  update budget_cycle set status = 'closed', closed_on = current_date, updated_at = now() where fiscal_year_id = fy.id and status <> 'closed';
  insert into budget_cycle_event (cycle_id, municipality_id, from_status, to_status, event_date, note, is_demo, actor)
    select id, m, 'executing', 'closed', current_date, nullif(left(btrim(coalesce(p_note,'')),500),''), is_demo, auth.uid() from budget_cycle where fiscal_year_id = fy.id;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'closing.closed', 'fiscal_year', fy.id::text, jsonb_build_object('year', p_year, 'checks', chk));
end $$;

-- Documented corrective path: needs a written reason and an adopted council decision; the previous final account is snapshotted and must be re-recorded.
create or replace function public.closing_reopen(p_year int, p_reason text, p_decision uuid, p_authority text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fy fiscal_year%rowtype; cl fiscal_year_closing%rowtype; ds text; i uuid;
begin
  select * into fy from fiscal_year where municipality_id = m and year = p_year for update;
  if not found then raise exception 'bad_year' using errcode = '22023'; end if;
  if fy.status <> 'closed' then raise exception 'year_not_closed' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 15 then raise exception 'reason_required' using errcode = '22023'; end if;
  select legal_status into ds from municipal_decision where id = p_decision and municipality_id = m;
  if not found then raise exception 'decision_required' using errcode = '22023'; end if;
  if ds not in ('adopted','under_review','effective') then raise exception 'decision_not_adopted' using errcode = '22023'; end if;
  select * into cl from fiscal_year_closing where fiscal_year_id = fy.id for update;
  insert into fiscal_year_reopening (fiscal_year_id, municipality_id, reason, decision_id, authority, snapshot, is_demo, actor)
  values (fy.id, m, left(btrim(p_reason),1000), p_decision, nullif(left(btrim(coalesce(p_authority,'')),200),''),
    jsonb_build_object('closed_on', cl.closed_on, 'final_account_decision_id', cl.final_account_decision_id, 'final_account_prepared_on', cl.final_account_prepared_on, 'final_account_ref', cl.final_account_ref, 'final_account_validated_on', cl.final_account_validated_on),
    fy.is_demo, auth.uid()) returning id into i;
  update fiscal_year set status = 'open' where id = fy.id;
  if found then
    update fiscal_year_closing set status = 'in_progress', closed_on = null, closed_by = null, reopen_count = reopen_count + 1, updated_at = now(),
      final_account_decision_id = null, final_account_prepared_on = null, final_account_ref = null, final_account_validated_on = null, final_account_authority = null where fiscal_year_id = fy.id;
    update budget_cycle set status = 'executing', closed_on = null, updated_at = now() where fiscal_year_id = fy.id and status = 'closed';
    insert into budget_cycle_event (cycle_id, municipality_id, from_status, to_status, event_date, note, is_demo, actor)
      select id, m, 'closed', 'executing', current_date, 'إعادة فتح تصحيحية: ' || left(btrim(p_reason),300), is_demo, auth.uid() from budget_cycle where fiscal_year_id = fy.id;
  end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'closing.reopened', 'fiscal_year', fy.id::text, jsonb_build_object('year', p_year, 'decision', p_decision, 'reopening', i));
  return i;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'budget_cycle_settings_set(boolean,int,boolean,boolean,text)','budget_cycle_open(int)','budget_cycle_advance(int,text,date,uuid,text,uuid,text)',
    'finance_amend_typed(uuid,text,numeric,text,uuid,text,text,date,date,date)','finance_transfer_credit(uuid,uuid,numeric,text,uuid,text,date,date,date)',
    'finance_amendment_validate_typed(uuid,date,text)','finance_suspension_release(uuid,text)',
    'closing_check(int)','closing_start(int,date,text)','closing_set_supplementary(int,int,date,boolean,text)','closing_resolve_commitment(uuid,text,uuid,text)',
    'closing_record_final_account(int,uuid,date,text,date,text)','closing_close(int,text)','closing_reopen(int,text,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ───────────────────────── 10) Legal rule registry entries (structural controls; all pending lawyer review) ─────────────────────────
do $$ begin
  if to_regclass('public.legal_rule') is not null then
    insert into public.legal_rule (rule_id, instrument, instrument_no, article, topic, summary_ar, conditions_ar, exceptions_ar, deadline_ar, required_docs_ar, enforcement, last_checked_on, workflow) values
    ('BUD-CYCLE-EXEC','ضابط داخلي (يلزم تحقق من المواد المنطبقة)',null,null,'تنفيذ الموازنة','لا يُنفَّذ إنفاق على سنة قبل تسجيل قرار المجلس باعتماد الموازنة وتصديق سلطة الرقابة (تاريخ وجهة). لا تصديق حكمي للموازنة ولا لنقل الاعتمادات.','قرار بفئة موازنة','لا استثناء في النظام','—','قرار الاعتماد + تاريخ التصديق وجهته','BLOCK','2026-11-25','finance'),
    ('BUD-CYCLE-SUPP','ضابط داخلي (يلزم تحقق من المواد المنطبقة)',null,null,'المدة المتممة','مدة المدة المتممة قيمة قابلة للضبط لكل بلدية وغير مُدرجة افتراضيًا؛ تُعلَّم «يلزم تحقق» إلى أن يوثّقها مختص. لا يُقفل العام قبل انتهائها.',null,null,'غير محددة (تُدخل يدويًا)','نص المادة المنطبقة','WARNING','2026-11-25','finance'),
    ('BUD-CYCLE-CLOSE','ضابط داخلي (يلزم تحقق من المواد المنطبقة)',null,null,'إقفال السنة وقطع الحساب','لا يُقفل العام إلا بعد معالجة الالتزامات المفتوحة، وتطبيق التعديلات المعلّقة، وتسجيل قرار المجلس بقطع الحساب، ومطابقة المدفوعات والالتزامات والاعتمادات. إعادة الفتح بمسار تصحيحي موثّق فقط.',null,null,null,'قرار قطع الحساب','BLOCK','2026-11-25','finance')
    on conflict (rule_id) do nothing;
  end if;
end $$;
