-- 0024: Public-procurement extension (Law 244/2021 as already documented in docs/). Idempotent and non-destructive.
-- NO legal thresholds / ratios are hard-coded: procurement_threshold is EMPTY by default and art.29 limit is NULL until a reviewed value is loaded.
-- Every legal_rule added here is 'pending_review' with original_text_loaded=false; article numbers are not asserted unless already in 0020.
-- Writes go through SECURITY DEFINER RPCs (public._council_muni()); tables are read-only to staff via RLS. Depends on 0017, 0019, 0020.

-- 1) Annual procurement plan ------------------------------------------------------------------------------------------------
create table if not exists public.procurement_plan_item (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  fiscal_year int not null check (fiscal_year between 1990 and 2100),
  title text not null check (btrim(title) <> ''),
  need_description text,
  estimated_value numeric(16,2) not null check (estimated_value >= 0),
  currency text not null default 'USD' check (currency in ('LBP','USD')),
  budget_line_id uuid references public.budget_line(id),
  funding_note text,
  planned_method text check (planned_method is null or planned_method in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework')),
  responsible text,
  planned_publish_on date, planned_award_on date, planned_start_on date,
  status text not null default 'planned' check (status in ('planned','in_progress','done','cancelled')),
  contract_id uuid references public.contract(id) on delete set null,
  status_note text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists procurement_plan_muni on public.procurement_plan_item (municipality_id, fiscal_year desc);

-- 2) Threshold table (EMPTY by default; loaded by the municipality after legal review) + engine settings ------------------------
create table if not exists public.procurement_threshold (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  method text not null check (method in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework')),
  min_value numeric(16,2) not null default 0 check (min_value >= 0),
  max_value numeric(16,2),
  currency text not null check (currency in ('LBP','USD')),
  effective_from date not null,
  effective_to date,
  source text not null check (btrim(source) <> ''),
  review_status text not null default 'pending_review' check (review_status in ('pending_review','verified','rejected','superseded')),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (max_value is null or max_value >= min_value), check (effective_to is null or effective_to >= effective_from));
create index if not exists procurement_threshold_muni on public.procurement_threshold (municipality_id, currency, effective_from);

create table if not exists public.procurement_setting (
  municipality_id uuid primary key references public.municipality(id),
  split_window_days int not null default 90 check (split_window_days between 1 and 3650),   -- heuristic knob, NOT a legal value
  split_min_similarity numeric(3,2) not null default 0.50 check (split_min_similarity between 0.10 and 1),   -- heuristic knob, NOT a legal value
  art29_limit_pct numeric(6,2) check (art29_limit_pct is null or art29_limit_pct >= 0),   -- NULL = not loaded
  art29_source text, art29_review_status text not null default 'pending_review' check (art29_review_status in ('pending_review','verified','rejected')),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id));

-- 3) Committees (award / acceptance) -----------------------------------------------------------------------------------------
create table if not exists public.procurement_committee (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  contract_id uuid references public.contract(id) on delete cascade,
  plan_item_id uuid references public.procurement_plan_item(id) on delete set null,
  kind text not null check (kind in ('award','acceptance')),
  formation_decision_id uuid references public.municipal_decision(id),
  formed_on date, notes text,
  report_text text, report_on date,
  result text not null default 'pending' check (result in ('pending','accepted','accepted_reservations','rejected')),
  result_on date,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists procurement_committee_contract on public.procurement_committee (contract_id, kind);

create table if not exists public.procurement_committee_member (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.procurement_committee(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  name text not null check (btrim(name) <> ''),
  role_ar text,
  declaration_on date,                      -- date of the conflict-of-interest declaration (null = none on file)
  has_conflict boolean,                     -- null = not declared yet
  declaration_note text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now());
create index if not exists procurement_member_committee on public.procurement_committee_member (committee_id);

-- 4) Official publication record. Saving a document inside BALADI ONE is NOT official publication: only platform_url + reference + date + proof count.
create table if not exists public.procurement_publication (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  contract_id uuid references public.contract(id) on delete cascade,
  plan_item_id uuid references public.procurement_plan_item(id) on delete set null,
  kind text not null default 'tender_notice' check (kind in ('tender_notice','award_notice','contract_notice','other')),
  platform_url text, reference_no text, published_on date,
  document_ref text,       -- the published document (name / link) as published on the official platform
  proof_ref text,          -- proof of publication (screenshot / receipt / archive link)
  notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (contract_id is not null or plan_item_id is not null));
create index if not exists procurement_publication_contract on public.procurement_publication (contract_id);

-- 5) Procurement file: manual evidence per stage (auto-derived stages are computed in the app from existing data)
create table if not exists public.procurement_stage_evidence (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  contract_id uuid not null references public.contract(id) on delete cascade,
  stage text not null check (stage in ('need','study','estimate','funding','method','publication','offers','evaluation','committee','award','notice','objections','standstill','contract','execution','acceptance')),
  evidence_ref text not null check (btrim(evidence_ref) <> ''), evidence_on date, note text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (contract_id, stage));

-- 6) Late decision link flag on contract (real event dates are never touched)
alter table public.contract
  add column if not exists decision_linked_late boolean not null default false,
  add column if not exists decision_linked_late_on timestamptz,
  add column if not exists decision_link_reason text,
  add column if not exists decision_link_after_signing boolean;

-- RLS: staff read only; no insert/update policies => writes only via the RPCs below
do $$ declare t text; begin
  foreach t in array array['procurement_plan_item','procurement_threshold','procurement_setting','procurement_committee','procurement_committee_member','procurement_publication','procurement_stage_evidence'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
  end loop;
end $$;
create policy procurement_plan_item_staff_read on public.procurement_plan_item for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_threshold_staff_read on public.procurement_threshold for select to authenticated using (is_staff(municipality_id));
create policy procurement_setting_staff_read on public.procurement_setting for select to authenticated using (is_staff(municipality_id));
create policy procurement_committee_staff_read on public.procurement_committee for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_committee_member_staff_read on public.procurement_committee_member for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_publication_staff_read on public.procurement_publication for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_stage_evidence_staff_read on public.procurement_stage_evidence for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));

-- 7) RPCs -------------------------------------------------------------------------------------------------------------------
create or replace function public.procurement_plan_add(p_year int, p_title text, p_need text, p_value numeric, p_currency text, p_budget_line uuid default null, p_funding_note text default null,
  p_method text default null, p_responsible text default null, p_publish date default null, p_award date default null, p_start date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_year is null or p_year not between 1990 and 2100 or btrim(coalesce(p_title,'')) = '' or p_value is null or p_value < 0 or p_value >= 1e13 or p_currency not in ('LBP','USD') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_method is not null and p_method not in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework') then raise exception 'bad_method' using errcode = '22023'; end if;
  if p_budget_line is not null and not exists (select 1 from budget_line where id = p_budget_line and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into procurement_plan_item (municipality_id, fiscal_year, title, need_description, estimated_value, currency, budget_line_id, funding_note, planned_method, responsible, planned_publish_on, planned_award_on, planned_start_on, is_demo, created_by)
  values (m, p_year, left(btrim(p_title),300), nullif(left(btrim(coalesce(p_need,'')),3000),''), round(p_value,2), p_currency, p_budget_line, nullif(left(btrim(coalesce(p_funding_note,'')),1000),''), p_method,
    nullif(left(btrim(coalesce(p_responsible,'')),200),''), p_publish, p_award, p_start, is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.plan_added', 'procurement_plan_item', i::text, jsonb_build_object('year', p_year, 'method', p_method));
  return i;
end $$;

create or replace function public.procurement_plan_set_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_status is null or p_status not in ('planned','in_progress','done','cancelled') then raise exception 'bad_input' using errcode = '22023'; end if;
  update procurement_plan_item set status = p_status, status_note = nullif(left(btrim(coalesce(p_note,'')),500),''), updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.plan_status', 'procurement_plan_item', p_id::text, jsonb_build_object('to', p_status));
end $$;

create or replace function public.procurement_plan_link_contract(p_item uuid, p_contract uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_contract is not null and not exists (select 1 from contract where id = p_contract and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  update procurement_plan_item set contract_id = p_contract, updated_at = now() where id = p_item and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.plan_linked', 'procurement_plan_item', p_item::text, jsonb_build_object('contract', p_contract));
end $$;

-- Threshold loading: values come from the municipality / lawyer with a mandatory source; they start as pending_review. Nothing is blocked by them.
create or replace function public.procurement_threshold_add(p_method text, p_min numeric, p_max numeric, p_currency text, p_from date, p_to date, p_source text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_method is null or p_method not in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework') or p_currency not in ('LBP','USD')
     or p_min is null or p_min < 0 or (p_max is not null and p_max < p_min) or p_from is null or (p_to is not null and p_to < p_from) or p_min >= 1e13 or (p_max is not null and p_max >= 1e13) then raise exception 'bad_input' using errcode = '22023'; end if;
  if btrim(coalesce(p_source,'')) = '' then raise exception 'source_required' using errcode = '22023'; end if;
  insert into procurement_threshold (municipality_id, method, min_value, max_value, currency, effective_from, effective_to, source, created_by)
  values (m, p_method, round(p_min,2), round(p_max,2), p_currency, p_from, p_to, left(btrim(p_source),1000), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.threshold_added', 'procurement_threshold', i::text, jsonb_build_object('method', p_method, 'currency', p_currency));
  return i;
end $$;

create or replace function public.procurement_threshold_set_review(p_id uuid, p_status text, p_effective_to date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_status is null or p_status not in ('pending_review','verified','rejected','superseded') then raise exception 'bad_input' using errcode = '22023'; end if;
  update procurement_threshold set review_status = p_status, effective_to = coalesce(p_effective_to, effective_to) where id = p_id and municipality_id = m and (p_effective_to is null or p_effective_to >= effective_from);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.threshold_review', 'procurement_threshold', p_id::text, jsonb_build_object('status', p_status, 'effective_to', p_effective_to));
end $$;

create or replace function public.procurement_set_setting(p_split_days int, p_similarity numeric, p_art29_pct numeric default null, p_art29_source text default null, p_art29_status text default 'pending_review')
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_split_days is null or p_split_days not between 1 and 3650 or p_similarity is null or p_similarity not between 0.1 and 1 or (p_art29_pct is not null and (p_art29_pct < 0 or p_art29_pct > 10000))
     or p_art29_status not in ('pending_review','verified','rejected') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_art29_pct is not null and btrim(coalesce(p_art29_source,'')) = '' then raise exception 'source_required' using errcode = '22023'; end if;
  insert into procurement_setting (municipality_id, split_window_days, split_min_similarity, art29_limit_pct, art29_source, art29_review_status, updated_by)
  values (m, p_split_days, round(p_similarity,2), p_art29_pct, nullif(left(btrim(coalesce(p_art29_source,'')),1000),''), p_art29_status, auth.uid())
  on conflict (municipality_id) do update set split_window_days = excluded.split_window_days, split_min_similarity = excluded.split_min_similarity, art29_limit_pct = excluded.art29_limit_pct,
    art29_source = excluded.art29_source, art29_review_status = excluded.art29_review_status, updated_at = now(), updated_by = auth.uid();
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.settings_set', 'procurement_setting', m::text, jsonb_build_object('split_days', p_split_days, 'similarity', p_similarity, 'art29_loaded', p_art29_pct is not null));
end $$;

create or replace function public.procurement_committee_add(p_contract uuid, p_kind text, p_decision uuid default null, p_formed_on date default null, p_notes text default null, p_plan_item uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_kind is null or p_kind not in ('award','acceptance') or (p_contract is null and p_plan_item is null) then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_contract is not null and not exists (select 1 from contract where id = p_contract and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_plan_item is not null and not exists (select 1 from procurement_plan_item where id = p_plan_item and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into procurement_committee (municipality_id, contract_id, plan_item_id, kind, formation_decision_id, formed_on, notes, is_demo, created_by)
  values (m, p_contract, p_plan_item, p_kind, p_decision, p_formed_on, nullif(left(btrim(coalesce(p_notes,'')),2000),''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.committee_added', 'procurement_committee', i::text, jsonb_build_object('kind', p_kind, 'contract', p_contract));
  return i;
end $$;

create or replace function public.procurement_committee_member_add(p_committee uuid, p_name text, p_role text default null, p_declaration_on date default null, p_has_conflict boolean default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_name,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if not exists (select 1 from procurement_committee where id = p_committee and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into procurement_committee_member (committee_id, municipality_id, name, role_ar, declaration_on, has_conflict, declaration_note, is_demo, created_by)
  values (p_committee, m, left(btrim(p_name),200), nullif(left(btrim(coalesce(p_role,'')),100),''), p_declaration_on, p_has_conflict, nullif(left(btrim(coalesce(p_note,'')),1000),''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.member_added', 'procurement_committee', p_committee::text, jsonb_build_object('conflict', p_has_conflict));
  return i;
end $$;

create or replace function public.procurement_committee_report(p_committee uuid, p_report_text text, p_report_on date default null, p_result text default 'pending', p_result_on date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_result is null or p_result not in ('pending','accepted','accepted_reservations','rejected') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_result <> 'pending' and p_result_on is null then raise exception 'result_date_required' using errcode = '22023'; end if;
  update procurement_committee set report_text = nullif(left(btrim(coalesce(p_report_text,'')),20000),''), report_on = p_report_on, result = p_result, result_on = p_result_on, updated_at = now() where id = p_committee and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.committee_report', 'procurement_committee', p_committee::text, jsonb_build_object('result', p_result));
end $$;

create or replace function public.procurement_publication_add(p_contract uuid, p_kind text, p_url text, p_ref text, p_published_on date, p_document text default null, p_proof text default null, p_notes text default null, p_plan_item uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_kind is null or p_kind not in ('tender_notice','award_notice','contract_notice','other') or (p_contract is null and p_plan_item is null) then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_contract is not null and not exists (select 1 from contract where id = p_contract and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_plan_item is not null and not exists (select 1 from procurement_plan_item where id = p_plan_item and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into procurement_publication (municipality_id, contract_id, plan_item_id, kind, platform_url, reference_no, published_on, document_ref, proof_ref, notes, is_demo, created_by)
  values (m, p_contract, p_plan_item, p_kind, nullif(left(btrim(coalesce(p_url,'')),1000),''), nullif(left(btrim(coalesce(p_ref,'')),200),''), p_published_on, nullif(left(btrim(coalesce(p_document,'')),1000),''),
    nullif(left(btrim(coalesce(p_proof,'')),1000),''), nullif(left(btrim(coalesce(p_notes,'')),2000),''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.publication_added', 'procurement_publication', i::text, jsonb_build_object('kind', p_kind, 'contract', p_contract));
  return i;
end $$;

create or replace function public.procurement_stage_set(p_contract uuid, p_stage text, p_evidence text, p_on date default null, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_stage is null or p_stage not in ('need','study','estimate','funding','method','publication','offers','evaluation','committee','award','notice','objections','standstill','contract','execution','acceptance') or btrim(coalesce(p_evidence,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if not exists (select 1 from contract where id = p_contract and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into procurement_stage_evidence (municipality_id, contract_id, stage, evidence_ref, evidence_on, note, is_demo, created_by)
  values (m, p_contract, p_stage, left(btrim(p_evidence),1000), p_on, nullif(left(btrim(coalesce(p_note,'')),1000),''), is_demo_staff(), auth.uid())
  on conflict (contract_id, stage) do update set evidence_ref = excluded.evidence_ref, evidence_on = excluded.evidence_on, note = excluded.note, updated_at = now();
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.stage_evidence', 'contract', p_contract::text, jsonb_build_object('stage', p_stage));
end $$;

-- FIX: link a decision to an existing contract AFTER creation. Mandatory documented reason; real event dates (signed_on, published_on, award_notice_on, decision dates) stay untouched;
-- the contract is permanently flagged 'ربط لاحق' and flags whether the decision post-dates the signing, so a missing prior approval cannot be hidden.
create or replace function public.contract_link_decision_late(p_contract uuid, p_decision uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c contract%rowtype; d municipal_decision%rowtype; after_sign boolean;
begin
  if btrim(coalesce(p_reason,'')) = '' or char_length(btrim(p_reason)) < 15 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into c from contract where id = p_contract and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.decision_id is not null then raise exception 'already_linked' using errcode = '22023'; end if;
  select * into d from municipal_decision where id = p_decision and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  after_sign := case when c.signed_on is not null and d.decided_on is not null then d.decided_on > c.signed_on when c.signed_on is not null then null else false end;
  update contract set decision_id = p_decision, decision_linked_late = true, decision_linked_late_on = now(), decision_link_reason = left(btrim(p_reason),2000), decision_link_after_signing = after_sign, updated_at = now() where id = p_contract;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.decision_linked_late', 'contract', p_contract::text,
    jsonb_build_object('decision', p_decision, 'reason', left(btrim(p_reason),2000), 'contract_status', c.status, 'signed_on', c.signed_on, 'decision_decided_on', d.decided_on, 'decision_legal_status', d.legal_status,
      'decision_effective_on', d.effective_on, 'decision_after_signing', after_sign));
end $$;

-- Completion with acceptance check. Without an acceptance committee record with a positive result: WARNING (needs p_ack) unless rule PPL-244-ACCEPT has been marked 'verified' (then BLOCK).
-- Delegates the actual status change to the existing contract_set_status (not redefined here).
create or replace function public.procurement_complete_contract(p_id uuid, p_note text default null, p_ack boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c contract%rowtype; has_acc boolean; ver boolean := false; n text := nullif(left(btrim(coalesce(p_note,'')),400),'');
begin
  select * into c from contract where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status not in ('signed','active') then raise exception 'bad_input' using errcode = '22023'; end if;
  select exists (select 1 from procurement_committee pc where pc.contract_id = p_id and pc.kind = 'acceptance' and pc.result in ('accepted','accepted_reservations')) into has_acc;
  if to_regclass('public.legal_rule') is not null then execute 'select exists (select 1 from public.legal_rule where rule_id = ''PPL-244-ACCEPT'' and review_status = ''verified'')' into ver; end if;
  if not has_acc then
    if ver then raise exception 'acceptance_required' using errcode = '22023'; end if;
    if not coalesce(p_ack,false) then raise exception 'acceptance_warning' using errcode = '22023'; end if;
    n := coalesce(n || ' — ', '') || 'تنبيه: أُغلق العقد دون محضر استلام مسجَّل في النظام';
    insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.completed_without_acceptance', 'contract', p_id::text, jsonb_build_object('acknowledged', true));
  end if;
  perform public.contract_set_status(p_id, 'completed', n, null);
end $$;

-- 8) Rules registry additions (pending_review; no article numbers asserted; original text NOT loaded)
do $$ begin
  if to_regclass('public.legal_rule') is not null then
    insert into public.legal_rule (rule_id, instrument, instrument_no, article, topic, summary_ar, enforcement, review_status, original_text_loaded, workflow) values
    ('PPL-244-ACCEPT','قانون الشراء العام','244/2021','يلزم تحقق','لجنة الاستلام قبل إنهاء العقد','قاعدة تشغيلية مقترحة (غير موثّقة بنص محمَّل): وجود سجل لجنة استلام بنتيجة إيجابية قبل اعتبار العقد منتهيًا بالتنفيذ. تُطبَّق كتنبيه إلى أن تُراجَع قانونيًا.','WARNING','pending_review',false,'procurement'),
    ('PPL-244-THRESH','قانون الشراء العام','244/2021','يلزم تحقق','سقوف القيمة وأسلوب الشراء','السقوف غير محمَّلة عمدًا في النظام؛ تُحمَّل من النصوص النافذة بعد المراجعة في جدول procurement_threshold، ولا يمنع محرك التوصية أي إجراء.','INFORMATION','pending_review',false,'procurement'),
    ('PPL-244-SPLIT','قانون الشراء العام','244/2021','يلزم تحقق','تجزئة الشراء','كشف استرشادي (تشابه الموضوع أو المورّد ضمن نافذة زمنية قابلة للضبط). نتيجته «احتمال تجزئة يستلزم التحقق» وليست إثباتًا لتحايل.','WARNING','pending_review',false,'procurement'),
    ('PPL-244-PUBLISH','قانون الشراء العام','244/2021','يلزم تحقق','النشر الرسمي','لا يُعدّ حفظ مستند داخل النظام نشرًا رسميًا؛ يُسجَّل رابط المنصة الرسمية والرقم المرجعي وتاريخ النشر وإثباته.','INFORMATION','pending_review',false,'procurement')
    on conflict (rule_id) do nothing;
  end if;
end $$;

-- 9) Grants
do $$ declare f text; begin
  foreach f in array array[
    'procurement_plan_add(int,text,text,numeric,text,uuid,text,text,text,date,date,date)','procurement_plan_set_status(uuid,text,text)','procurement_plan_link_contract(uuid,uuid)',
    'procurement_threshold_add(text,numeric,numeric,text,date,date,text)','procurement_threshold_set_review(uuid,text,date)','procurement_set_setting(int,numeric,numeric,text,text)',
    'procurement_committee_add(uuid,text,uuid,date,text,uuid)','procurement_committee_member_add(uuid,text,text,date,boolean,text)','procurement_committee_report(uuid,text,date,text,date)',
    'procurement_publication_add(uuid,text,text,text,date,text,text,text,uuid)','procurement_stage_set(uuid,text,text,date,text)',
    'contract_link_decision_late(uuid,uuid,text)','procurement_complete_contract(uuid,text,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
