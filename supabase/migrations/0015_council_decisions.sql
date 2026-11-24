-- Council sessions, agenda, decision registry (legal status separate from execution status), decision tasks and timeline.
create table if not exists public.council_session (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  session_no text, title text not null, held_on date not null,
  status text not null default 'planned' check (status in ('planned','held','minutes_draft','minutes_approved','cancelled')),
  minutes_text text, is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table if not exists public.agenda_item (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references council_session(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  position int not null default 1, title text not null, description text, outcome text,
  created_at timestamptz not null default now());
create table if not exists public.municipal_decision (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  session_id uuid references council_session(id) on delete set null,
  agenda_item_id uuid references agenda_item(id) on delete set null,
  decision_no text not null, year int not null, decided_on date, title text not null, body text, legal_basis text,
  vote_for int check (vote_for >= 0), vote_against int check (vote_against >= 0), vote_abstain int check (vote_abstain >= 0),
  legal_status text not null default 'draft' check (legal_status in ('draft','adopted','pending_completion','under_review','effective','suspended','annulled')),
  execution_status text not null default 'not_started' check (execution_status in ('not_started','preparing','in_progress','delayed','completed','stopped')),
  review_authority text, sent_on date, received_on date, effective_on date, execution_due date, responsible text, notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (municipality_id, year, decision_no));
create table if not exists public.decision_event (
  id bigint generated always as identity primary key,
  decision_id uuid not null references municipal_decision(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  kind text not null check (kind in ('created','legal_status','execution_status','task','note')),
  from_value text, to_value text, note text, actor uuid references auth.users(id), created_at timestamptz not null default now());
create table if not exists public.decision_task (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references municipal_decision(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  title text not null, assignee uuid references auth.users(id), due_on date,
  done boolean not null default false, done_at timestamptz, created_at timestamptz not null default now());
create index if not exists decision_muni on public.municipal_decision (municipality_id, year desc);
create index if not exists session_muni on public.council_session (municipality_id, held_on desc);

do $$ declare t text; begin
  foreach t in array array['council_session','agenda_item','municipal_decision','decision_event','decision_task'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
  end loop;
end $$;
create policy council_session_staff_read on public.council_session for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy municipal_decision_staff_read on public.municipal_decision for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy agenda_item_staff_read on public.agenda_item for select to authenticated using (exists (select 1 from council_session s where s.id = session_id and is_staff(s.municipality_id) and (s.is_demo or not is_demo_staff())));
create policy decision_event_staff_read on public.decision_event for select to authenticated using (exists (select 1 from municipal_decision d where d.id = decision_id and is_staff(d.municipality_id) and (d.is_demo or not is_demo_staff())));
create policy decision_task_staff_read on public.decision_task for select to authenticated using (exists (select 1 from municipal_decision d where d.id = decision_id and is_staff(d.municipality_id) and (d.is_demo or not is_demo_staff())));

-- Municipality of the calling mayor/admin (writes to the council registry are limited to them).
create or replace function public._council_muni() returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare m uuid;
begin
  select municipality_id into m from staff_member where user_id = auth.uid() and role in ('mayor','admin') order by created_at limit 1;
  if m is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return m;
end $$;
revoke all on function public._council_muni() from public, anon, authenticated;

create or replace function public.council_create_session(p_title text, p_held_on date, p_no text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_title,'')) = '' or p_held_on is null then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into council_session (municipality_id, session_no, title, held_on, is_demo, created_by) values (m, nullif(left(btrim(coalesce(p_no,'')),40),''), left(btrim(p_title),200), p_held_on, is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.session_created', 'council_session', i::text, '{}'::jsonb);
  return i;
end $$;

create or replace function public.council_add_agenda(p_session uuid, p_title text, p_desc text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; s council_session%rowtype; n int;
begin
  select * into s from council_session where id = p_session and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if btrim(coalesce(p_title,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  select coalesce(max(position),0)+1 into n from agenda_item where session_id = p_session;
  insert into agenda_item (session_id, municipality_id, position, title, description) values (p_session, m, n, left(btrim(p_title),300), nullif(left(btrim(coalesce(p_desc,'')),2000),'')) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.agenda_added', 'agenda_item', i::text, '{}'::jsonb);
  return i;
end $$;

create or replace function public.council_set_session(p_session uuid, p_status text default null, p_minutes text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_status is not null and p_status not in ('planned','held','minutes_draft','minutes_approved','cancelled') then raise exception 'bad_input' using errcode = '22023'; end if;
  update council_session set status = coalesce(p_status, status), minutes_text = coalesce(left(p_minutes, 60000), minutes_text) where id = p_session and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.session_updated', 'council_session', p_session::text, jsonb_build_object('status', p_status, 'minutes_edited', p_minutes is not null));
end $$;

create or replace function public.decision_create(p_title text, p_no text, p_year int, p_decided_on date default null, p_session uuid default null, p_agenda uuid default null, p_body text default null, p_legal_basis text default null,
  p_for int default null, p_against int default null, p_abstain int default null, p_authority text default null, p_due date default null, p_responsible text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_title,'')) = '' or btrim(coalesce(p_no,'')) = '' or p_year is null or p_year < 1990 or p_year > 2100 then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_session is not null and not exists (select 1 from council_session where id = p_session and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into municipal_decision (municipality_id, session_id, agenda_item_id, decision_no, year, decided_on, title, body, legal_basis, vote_for, vote_against, vote_abstain, review_authority, execution_due, responsible, is_demo, created_by)
  values (m, p_session, p_agenda, left(btrim(p_no),40), p_year, p_decided_on, left(btrim(p_title),300), left(p_body,60000), left(p_legal_basis,2000), p_for, p_against, p_abstain, left(p_authority,200), p_due, left(p_responsible,200), is_demo_staff(), auth.uid()) returning id into i;
  insert into decision_event (decision_id, municipality_id, kind, to_value, actor) values (i, m, 'created', 'draft', auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.created', 'municipal_decision', i::text, '{}'::jsonb);
  return i;
end $$;

-- kind = 'legal' | 'execution'. Making a decision "effective" requires an explicit date taken from the official document; nothing is inferred from elapsed time.
create or replace function public.decision_set_status(p_id uuid, p_kind text, p_value text, p_note text default null, p_date date default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); d municipal_decision%rowtype; old text;
begin
  select * into d from municipal_decision where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_kind = 'legal' then
    if p_value not in ('draft','adopted','pending_completion','under_review','effective','suspended','annulled') then raise exception 'bad_input' using errcode = '22023'; end if;
    if p_value = 'effective' and p_date is null then raise exception 'effective_date_required' using errcode = '22023'; end if;
    old := d.legal_status;
    update municipal_decision set legal_status = p_value, effective_on = case when p_value = 'effective' then p_date else effective_on end, updated_at = now() where id = p_id;
  elsif p_kind = 'execution' then
    if p_value not in ('not_started','preparing','in_progress','delayed','completed','stopped') then raise exception 'bad_input' using errcode = '22023'; end if;
    old := d.execution_status;
    update municipal_decision set execution_status = p_value, updated_at = now() where id = p_id;
  else raise exception 'bad_input' using errcode = '22023'; end if;
  insert into decision_event (decision_id, municipality_id, kind, from_value, to_value, note, actor) values (p_id, m, case when p_kind = 'legal' then 'legal_status' else 'execution_status' end, old, p_value, nullif(left(btrim(coalesce(p_note,'')),500),''), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.status_changed', 'municipal_decision', p_id::text, jsonb_build_object('kind', p_kind, 'from', old, 'to', p_value));
end $$;

create or replace function public.decision_add_task(p_id uuid, p_title text, p_assignee uuid default null, p_due date default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if not exists (select 1 from municipal_decision where id = p_id and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if btrim(coalesce(p_title,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_assignee is not null and not exists (select 1 from staff_member where user_id = p_assignee and municipality_id = m) then raise exception 'bad_assignee' using errcode = '22023'; end if;
  insert into decision_task (decision_id, municipality_id, title, assignee, due_on) values (p_id, m, left(btrim(p_title),300), p_assignee, p_due) returning id into i;
  insert into decision_event (decision_id, municipality_id, kind, to_value, actor) values (p_id, m, 'task', left(btrim(p_title),300), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.task_added', 'decision_task', i::text, '{}'::jsonb);
  return i;
end $$;

create or replace function public.decision_toggle_task(p_task uuid, p_done boolean) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update decision_task set done = p_done, done_at = case when p_done then now() else null end where id = p_task and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.task_toggled', 'decision_task', p_task::text, jsonb_build_object('done', p_done));
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'council_create_session(text,date,text)','council_add_agenda(uuid,text,text)','council_set_session(uuid,text,text)',
    'decision_create(text,text,int,date,uuid,uuid,text,text,int,int,int,text,date,text)','decision_set_status(uuid,text,text,text,date)',
    'decision_add_task(uuid,text,uuid,date)','decision_toggle_task(uuid,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
