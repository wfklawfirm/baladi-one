-- Municipal projects & contracts. Read: staff of the municipality (demo rule). Writes: SECURITY DEFINER RPCs for mayor/admin only.
-- No legal rule, threshold or procurement method is hard-coded; procurement_method is free text. Nothing is awarded or approved automatically:
-- contracts are always created as 'draft' and change status only through an explicit contract_set_status call.
create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  title text not null check (btrim(title) <> ''), description text, location_text text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'proposed' check (status in ('proposed','approved','active','delayed','completed','stopped')),
  decision_id uuid references municipal_decision(id) on delete set null,
  responsible text, start_on date, due_on date,
  budget_amount numeric(14,2) check (budget_amount is null or budget_amount >= 0),
  currency text not null default 'USD' check (currency in ('LBP','USD')),
  spent_amount numeric(14,2) not null default 0 check (spent_amount >= 0),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (start_on is null or due_on is null or due_on >= start_on));
create table if not exists public.project_milestone (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  title text not null check (btrim(title) <> ''), weight numeric(8,2) not null default 1 check (weight > 0),
  progress_pct numeric(5,2) not null default 0 check (progress_pct between 0 and 100),
  planned_pct numeric(5,2) check (planned_pct is null or planned_pct between 0 and 100),
  due_on date, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.project_update (
  id bigint generated always as identity primary key,
  project_id uuid not null references project(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  kind text not null check (kind in ('created','status','milestone','progress','spend','contract','note')),
  from_value text, to_value text, note text, actor uuid references auth.users(id), created_at timestamptz not null default now());
create table if not exists public.contract (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  project_id uuid references project(id) on delete set null,
  contractor text not null check (btrim(contractor) <> ''), subject text not null check (btrim(subject) <> ''),
  value numeric(14,2) not null check (value >= 0), currency text not null default 'USD' check (currency in ('LBP','USD')),
  start_on date, end_on date,
  procurement_method text,  -- free text as recorded in the official file; never validated against legal rules here
  status text not null default 'draft' check (status in ('draft','signed','active','completed','terminated','expired')),
  notes text, is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (start_on is null or end_on is null or end_on >= start_on));
create index if not exists project_muni on public.project (municipality_id, created_at desc);
create index if not exists project_milestone_project on public.project_milestone (project_id);
create index if not exists project_update_project on public.project_update (project_id, created_at desc);
create index if not exists contract_muni on public.contract (municipality_id, end_on);
create index if not exists contract_project on public.contract (project_id);

do $$ declare t text; begin
  foreach t in array array['project','project_milestone','project_update','contract'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
  end loop;
end $$;
create policy project_staff_read on public.project for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy contract_staff_read on public.contract for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy project_milestone_staff_read on public.project_milestone for select to authenticated using (exists (select 1 from project p where p.id = project_id and is_staff(p.municipality_id) and (p.is_demo or not is_demo_staff())));
create policy project_update_staff_read on public.project_update for select to authenticated using (exists (select 1 from project p where p.id = project_id and is_staff(p.municipality_id) and (p.is_demo or not is_demo_staff())));

create or replace function public.project_create(p_title text, p_description text default null, p_location text default null, p_priority text default 'normal', p_decision uuid default null,
  p_responsible text default null, p_start date default null, p_due date default null, p_budget numeric default null, p_currency text default 'USD') returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_title,'')) = '' or p_priority not in ('low','normal','high','urgent') or p_currency not in ('LBP','USD')
     or (p_budget is not null and p_budget < 0) or (p_start is not null and p_due is not null and p_due < p_start) then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_decision is not null and not exists (select 1 from municipal_decision where id = p_decision and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into project (municipality_id, title, description, location_text, priority, decision_id, responsible, start_on, due_on, budget_amount, currency, is_demo, created_by)
  values (m, left(btrim(p_title),300), nullif(left(btrim(coalesce(p_description,'')),10000),''), nullif(left(btrim(coalesce(p_location,'')),300),''), p_priority, p_decision,
    nullif(left(btrim(coalesce(p_responsible,'')),200),''), p_start, p_due, p_budget, p_currency, is_demo_staff(), auth.uid()) returning id into i;
  insert into project_update (project_id, municipality_id, kind, to_value, actor) values (i, m, 'created', 'proposed', auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'project.created', 'project', i::text, '{}'::jsonb);
  return i;
end $$;

create or replace function public.project_set_status(p_id uuid, p_status text, p_note text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); old text;
begin
  if p_status is null or p_status not in ('proposed','approved','active','delayed','completed','stopped') then raise exception 'bad_input' using errcode = '22023'; end if;
  select status into old from project where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update project set status = p_status, updated_at = now() where id = p_id;
  insert into project_update (project_id, municipality_id, kind, from_value, to_value, note, actor) values (p_id, m, 'status', old, p_status, nullif(left(btrim(coalesce(p_note,'')),500),''), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'project.status_changed', 'project', p_id::text, jsonb_build_object('from', old, 'to', p_status));
end $$;

create or replace function public.milestone_add(p_project uuid, p_title text, p_weight numeric default 1, p_planned numeric default null, p_due date default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if not exists (select 1 from project where id = p_project and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if btrim(coalesce(p_title,'')) = '' or p_weight is null or p_weight <= 0 or p_weight > 999999 or (p_planned is not null and (p_planned < 0 or p_planned > 100)) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into project_milestone (project_id, municipality_id, title, weight, planned_pct, due_on) values (p_project, m, left(btrim(p_title),300), p_weight, p_planned, p_due) returning id into i;
  insert into project_update (project_id, municipality_id, kind, to_value, actor) values (p_project, m, 'milestone', left(btrim(p_title),300), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'project.milestone_added', 'project_milestone', i::text, '{}'::jsonb);
  return i;
end $$;

create or replace function public.milestone_progress(p_milestone uuid, p_pct numeric, p_note text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); r project_milestone%rowtype;
begin
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into r from project_milestone where id = p_milestone and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update project_milestone set progress_pct = p_pct, updated_at = now() where id = p_milestone;
  update project set updated_at = now() where id = r.project_id;
  insert into project_update (project_id, municipality_id, kind, from_value, to_value, note, actor) values (r.project_id, m, 'progress', r.progress_pct::text, p_pct::text, left(r.title,300) || coalesce(' — ' || nullif(left(btrim(coalesce(p_note,'')),500),''), ''), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'project.progress_updated', 'project_milestone', p_milestone::text, jsonb_build_object('from', r.progress_pct, 'to', p_pct));
end $$;

-- Sets the cumulative amount spent so far (absolute figure, so a wrong entry can be corrected); old and new values are kept in the timeline.
create or replace function public.project_spend(p_id uuid, p_spent_total numeric, p_note text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); old numeric;
begin
  if p_spent_total is null or p_spent_total < 0 or p_spent_total >= 1e12 then raise exception 'bad_input' using errcode = '22023'; end if;
  select spent_amount into old from project where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update project set spent_amount = p_spent_total, updated_at = now() where id = p_id;
  insert into project_update (project_id, municipality_id, kind, from_value, to_value, note, actor) values (p_id, m, 'spend', old::text, p_spent_total::text, nullif(left(btrim(coalesce(p_note,'')),500),''), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'project.spend_updated', 'project', p_id::text, jsonb_build_object('from', old, 'to', p_spent_total));
end $$;

-- Always creates the contract as 'draft': recording a contract never awards or approves it.
create or replace function public.contract_add(p_project uuid, p_contractor text, p_subject text, p_value numeric, p_currency text default 'USD', p_start date default null, p_end date default null,
  p_procurement text default null, p_notes text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_contractor,'')) = '' or btrim(coalesce(p_subject,'')) = '' or p_value is null or p_value < 0 or p_value >= 1e12 or p_currency not in ('LBP','USD')
     or (p_start is not null and p_end is not null and p_end < p_start) then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_project is not null and not exists (select 1 from project where id = p_project and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into contract (municipality_id, project_id, contractor, subject, value, currency, start_on, end_on, procurement_method, status, notes, is_demo, created_by)
  values (m, p_project, left(btrim(p_contractor),300), left(btrim(p_subject),1000), p_value, p_currency, p_start, p_end, nullif(left(btrim(coalesce(p_procurement,'')),300),''), 'draft', nullif(left(btrim(coalesce(p_notes,'')),5000),''), is_demo_staff(), auth.uid()) returning id into i;
  if p_project is not null then insert into project_update (project_id, municipality_id, kind, to_value, actor) values (p_project, m, 'contract', left(btrim(p_contractor),300), auth.uid()); end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.created', 'contract', i::text, '{}'::jsonb);
  return i;
end $$;

create or replace function public.contract_set_status(p_id uuid, p_status text, p_note text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c contract%rowtype;
begin
  if p_status is null or p_status not in ('draft','signed','active','completed','terminated','expired') then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into c from contract where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update contract set status = p_status, notes = case when nullif(btrim(coalesce(p_note,'')),'') is null then notes else left(coalesce(notes || E'\n', '') || btrim(p_note), 5000) end, updated_at = now() where id = p_id;
  if c.project_id is not null then insert into project_update (project_id, municipality_id, kind, from_value, to_value, note, actor) values (c.project_id, m, 'contract', c.status, p_status, left(c.contractor,300), auth.uid()); end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.status_changed', 'contract', p_id::text, jsonb_build_object('from', c.status, 'to', p_status));
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'project_create(text,text,text,text,uuid,text,date,date,numeric,text)','project_set_status(uuid,text,text)','milestone_add(uuid,text,numeric,numeric,date)',
    'milestone_progress(uuid,numeric,text)','project_spend(uuid,numeric,text)','contract_add(uuid,text,text,numeric,text,date,date,text,text)','contract_set_status(uuid,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
