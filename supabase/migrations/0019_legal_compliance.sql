-- Legal-compliance hardening (Decree-Law 118/1977 municipal act; Public Procurement Law 244/2021).
-- Structure and gating only: NO legal thresholds are hard-coded (they change by amendment/decree).

-- 1) Council: attendance/quorum inputs, summons date
alter table public.council_session
  add column if not exists members_total int check (members_total is null or members_total between 1 and 100),
  add column if not exists members_present int check (members_present is null or members_present between 0 and 100),
  add column if not exists summoned_on date,
  add column if not exists is_second_meeting boolean not null default false;

-- 2) Decisions: category + validation (tutelle) tracking
alter table public.municipal_decision
  add column if not exists category text not null default 'general' check (category in ('general','budget','accounts','planning','loan','tax','contract','property','other')),
  add column if not exists validation_level text not null default 'none' check (validation_level in ('none','qaimaqam','mohafez','minister')),
  add column if not exists validated_on date,
  add column if not exists validation_note text;

create or replace function public.council_set_attendance(p_session uuid, p_total int, p_present int, p_summoned date default null, p_second boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_total is null or p_present is null or p_total < 1 or p_total > 100 or p_present < 0 or p_present > p_total then raise exception 'bad_input' using errcode = '22023'; end if;
  update council_session set members_total = p_total, members_present = p_present, summoned_on = p_summoned, is_second_meeting = coalesce(p_second,false) where id = p_session and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.attendance_set', 'council_session', p_session::text, jsonb_build_object('total', p_total, 'present', p_present, 'second', coalesce(p_second,false)));
end $$;

create or replace function public.decision_set_review(p_id uuid, p_category text, p_level text, p_sent date default null, p_received date default null, p_validated date default null, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_category not in ('general','budget','accounts','planning','loan','tax','contract','property','other') or p_level not in ('none','qaimaqam','mohafez','minister') then raise exception 'bad_input' using errcode = '22023'; end if;
  update municipal_decision set category = p_category, validation_level = p_level, sent_on = p_sent, received_on = p_received, validated_on = p_validated,
    validation_note = nullif(left(btrim(coalesce(p_note,'')),1000),''), updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into decision_event (decision_id, municipality_id, kind, to_value, note, actor) values (p_id, m, 'note', 'review', 'تحديث بيانات الإرسال والتصديق', auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.review_updated', 'municipal_decision', p_id::text, jsonb_build_object('level', p_level, 'category', p_category));
end $$;

-- Making a validated-type decision effective needs either the authority's validation date, or (non-budget/accounts/planning/loan) the one-month silence period after receipt.
create or replace function public.decision_set_status(p_id uuid, p_kind text, p_value text, p_note text default null, p_date date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); d municipal_decision%rowtype; old text; note text := nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  select * into d from municipal_decision where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_kind = 'legal' then
    if p_value not in ('draft','adopted','pending_completion','under_review','effective','suspended','annulled') then raise exception 'bad_input' using errcode = '22023'; end if;
    if p_value = 'effective' then
      if p_date is null then raise exception 'effective_date_required' using errcode = '22023'; end if;
      if d.validation_level <> 'none' and d.validated_on is null then
        if d.received_on is not null and d.received_on + interval '1 month' <= current_date and d.category not in ('budget','accounts','planning','loan') then
          note := coalesce(note || ' — ', '') || 'نفاذ حكمي بانقضاء مهلة الشهر من تاريخ الاستلام لدى سلطة التصديق';
        else raise exception 'validation_required' using errcode = '22023'; end if;
      end if;
    end if;
    old := d.legal_status;
    update municipal_decision set legal_status = p_value, effective_on = case when p_value = 'effective' then p_date else effective_on end, updated_at = now() where id = p_id;
  elsif p_kind = 'execution' then
    if p_value not in ('not_started','preparing','in_progress','delayed','completed','stopped') then raise exception 'bad_input' using errcode = '22023'; end if;
    old := d.execution_status;
    update municipal_decision set execution_status = p_value, updated_at = now() where id = p_id;
  else raise exception 'bad_input' using errcode = '22023'; end if;
  insert into decision_event (decision_id, municipality_id, kind, from_value, to_value, note, actor) values (p_id, m, case when p_kind = 'legal' then 'legal_status' else 'execution_status' end, old, p_value, note, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.status_changed', 'municipal_decision', p_id::text, jsonb_build_object('kind', p_kind, 'from', old, 'to', p_value));
end $$;

-- 3) Budget amendments (transfers / extra credits) need a council decision and, when applicable, authority validation before they take effect
alter table public.budget_amendment
  add column if not exists decision_id uuid references public.municipal_decision(id),
  add column if not exists applied boolean not null default true,
  add column if not exists validated_on date;

drop function if exists public.finance_amend(uuid, numeric, text, date);

create or replace function public._fin_apply_amendment(p_line uuid, p_delta numeric) returns void language plpgsql security definer set search_path to 'public' as $$
declare l budget_line%rowtype; st text;
begin
  select * into l from budget_line where id = p_line for update;
  select status into st from fiscal_year where id = l.fiscal_year_id;
  if st <> 'open' then raise exception 'year_closed' using errcode = '22023'; end if;
  if l.current_amount + p_delta < 0 then raise exception 'below_zero' using errcode = '22023'; end if;
  if l.kind = 'expense' and l.current_amount + p_delta < _fin_reserved(p_line) then raise exception 'below_commitments' using errcode = '22023'; end if;
  update budget_line set current_amount = current_amount + p_delta where id = p_line;
end $$;
revoke all on function public._fin_apply_amendment(uuid, numeric) from public, anon, authenticated;

create or replace function public.finance_amend(p_line uuid, p_delta numeric, p_reason text, p_decision uuid, p_validated_on date default null, p_date date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); l budget_line%rowtype; i uuid; ls text;
begin
  select * into l from budget_line where id = p_line and municipality_id = m for update;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  select legal_status into ls from municipal_decision where id = p_decision and municipality_id = m;
  if not found then raise exception 'decision_required' using errcode = '22023'; end if;
  if ls not in ('adopted','under_review','effective') then raise exception 'decision_not_adopted' using errcode = '22023'; end if;
  if p_validated_on is not null then perform _fin_apply_amendment(p_line, round(p_delta,2)); end if;
  insert into budget_amendment (line_id, municipality_id, delta, reason, amended_on, is_demo, actor, decision_id, applied, validated_on)
  values (p_line, m, round(p_delta,2), left(btrim(p_reason),500), coalesce(p_date, current_date), l.is_demo, auth.uid(), p_decision, p_validated_on is not null, p_validated_on) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.amended', 'budget_line', p_line::text, jsonb_build_object('delta', p_delta, 'applied', p_validated_on is not null, 'decision', p_decision));
  return i;
end $$;

create or replace function public.finance_amend_validate(p_amendment uuid, p_validated_on date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a budget_amendment%rowtype;
begin
  if p_validated_on is null then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into a from budget_amendment where id = p_amendment and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.applied then raise exception 'already_applied' using errcode = '22023'; end if;
  perform _fin_apply_amendment(a.line_id, a.delta);
  update budget_amendment set applied = true, validated_on = p_validated_on where id = p_amendment;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'finance.amendment_validated', 'budget_amendment', p_amendment::text, jsonb_build_object('validated_on', p_validated_on));
end $$;

-- 4) Contracts: structured procurement method + tracked dates + amendments
alter table public.contract
  add column if not exists justification text,
  add column if not exists tender_ref text,
  add column if not exists published_on date,
  add column if not exists award_notice_on date,
  add column if not exists ppa_notice_on date,
  add column if not exists signed_on date,
  add column if not exists decision_id uuid references public.municipal_decision(id),
  add column if not exists guarantee_amount numeric(14,2) check (guarantee_amount is null or guarantee_amount >= 0);
alter table public.contract drop constraint if exists contract_method_chk;
alter table public.contract add constraint contract_method_chk check (procurement_method is null or procurement_method in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework')) not valid;

create table if not exists public.contract_amendment (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  delta numeric(14,2) not null check (delta <> 0),
  reason text not null, decision_id uuid references public.municipal_decision(id),
  actor uuid references auth.users(id), created_at timestamptz not null default now());
alter table public.contract_amendment enable row level security;
drop policy if exists contract_amendment_staff_read on public.contract_amendment;
create policy contract_amendment_staff_read on public.contract_amendment for select to authenticated
  using (exists (select 1 from contract c where c.id = contract_id and is_staff(c.municipality_id) and (c.is_demo or not is_demo_staff())));

drop function if exists public.contract_add(uuid, text, text, numeric, text, date, date, text, text);

create or replace function public.contract_add(p_project uuid, p_contractor text, p_subject text, p_value numeric, p_currency text, p_start date, p_end date,
  p_method text, p_justification text default null, p_tender_ref text default null, p_published_on date default null, p_decision uuid default null, p_guarantee numeric default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_contractor,'')) = '' or btrim(coalesce(p_subject,'')) = '' or p_value is null or p_value < 0 or p_value >= 1e12 or p_currency not in ('LBP','USD')
     or (p_start is not null and p_end is not null and p_end < p_start) or (p_guarantee is not null and p_guarantee < 0) then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_method is null or p_method not in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework') then raise exception 'bad_method' using errcode = '22023'; end if;
  if p_method = 'negotiated' and btrim(coalesce(p_justification,'')) = '' then raise exception 'justification_required' using errcode = '22023'; end if;
  if p_project is not null and not exists (select 1 from project where id = p_project and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into contract (municipality_id, project_id, contractor, subject, value, currency, start_on, end_on, procurement_method, justification, tender_ref, published_on, decision_id, guarantee_amount, status, notes, is_demo, created_by)
  values (m, p_project, left(btrim(p_contractor),300), left(btrim(p_subject),1000), p_value, p_currency, p_start, p_end, p_method, nullif(left(btrim(coalesce(p_justification,'')),3000),''), nullif(left(btrim(coalesce(p_tender_ref,'')),200),''), p_published_on, p_decision, p_guarantee, 'draft',
    nullif(left(btrim(coalesce(p_notes,'')),5000),''), is_demo_staff(), auth.uid()) returning id into i;
  if p_project is not null then insert into project_update (project_id, municipality_id, kind, to_value, actor) values (p_project, m, 'contract', left(btrim(p_contractor),300), auth.uid()); end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.created', 'contract', i::text, jsonb_build_object('method', p_method));
  return i;
end $$;

create or replace function public.contract_set_dates(p_id uuid, p_published date default null, p_award date default null, p_ppa date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update contract set published_on = coalesce(p_published, published_on), award_notice_on = coalesce(p_award, award_notice_on), ppa_notice_on = coalesce(p_ppa, ppa_notice_on), updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.dates_set', 'contract', p_id::text, jsonb_build_object('published', p_published, 'award', p_award, 'ppa', p_ppa));
end $$;

-- Signing gate (conservative, structure only): standstill >= 14 calendar days (>= 10 working days) after award notice for competitive methods;
-- negotiated agreement needs justification + notice to the procurement authority >= 10 days before signing; a council decision is required except for quotations/invoice purchases.
create or replace function public.contract_set_status(p_id uuid, p_status text, p_note text default null, p_date date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c contract%rowtype;
begin
  if p_status is null or p_status not in ('draft','signed','active','completed','terminated','expired') then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into c from contract where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status = 'signed' and c.status = 'draft' then
    if p_date is null or p_date > current_date then raise exception 'sign_date_required' using errcode = '22023'; end if;
    if c.procurement_method is null then raise exception 'bad_method' using errcode = '22023'; end if;
    if c.procurement_method not in ('quotations','invoice') and c.decision_id is null then raise exception 'decision_required' using errcode = '22023'; end if;
    if c.procurement_method in ('open_tender','two_stage','proposals','framework') and (c.award_notice_on is null or p_date < c.award_notice_on + 14) then raise exception 'standstill' using errcode = '22023'; end if;
    if c.procurement_method = 'negotiated' and (btrim(coalesce(c.justification,'')) = '' or c.ppa_notice_on is null or p_date < c.ppa_notice_on + 10) then raise exception 'negotiated_notice' using errcode = '22023'; end if;
  end if;
  update contract set status = p_status, signed_on = case when p_status = 'signed' and c.status = 'draft' then p_date else signed_on end,
    notes = case when nullif(btrim(coalesce(p_note,'')),'') is null then notes else left(coalesce(notes || E'\n', '') || btrim(p_note), 5000) end, updated_at = now() where id = p_id;
  if c.project_id is not null then insert into project_update (project_id, municipality_id, kind, from_value, to_value, note, actor) values (c.project_id, m, 'contract', c.status, p_status, left(c.contractor,300), auth.uid()); end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.status_changed', 'contract', p_id::text, jsonb_build_object('from', c.status, 'to', p_status));
end $$;
drop function if exists public.contract_set_status(uuid, text, text);

create or replace function public.contract_amend(p_contract uuid, p_delta numeric, p_reason text, p_decision uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c contract%rowtype; i uuid;
begin
  select * into c from contract where id = p_contract and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) >= 1e12 or c.value + round(p_delta,2) < 0 or btrim(coalesce(p_reason,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  update contract set value = value + round(p_delta,2), updated_at = now() where id = p_contract;
  insert into contract_amendment (contract_id, municipality_id, delta, reason, decision_id, actor) values (p_contract, m, round(p_delta,2), left(btrim(p_reason),500), p_decision, auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.amended', 'contract', p_contract::text, jsonb_build_object('delta', p_delta));
  return i;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'council_set_attendance(uuid,int,int,date,boolean)','decision_set_review(uuid,text,text,date,date,date,text)','decision_set_status(uuid,text,text,text,date)',
    'finance_amend(uuid,numeric,text,uuid,date,date)','finance_amend_validate(uuid,date)',
    'contract_add(uuid,text,text,numeric,text,date,date,text,text,text,date,uuid,numeric,text)','contract_set_dates(uuid,date,date,date)',
    'contract_set_status(uuid,text,text,date)','contract_amend(uuid,numeric,text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
