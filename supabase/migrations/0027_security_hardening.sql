-- Security hardening (findings X1-X4 of docs/SYSTEM_AUDIT.md / PERMISSION_MATRIX.md). Non-destructive; no data is changed.
-- 1) Demo staff can never create real rows or touch real rows (trigger-level, independent of each RPC).
-- 2) Admin account functions are scoped to the caller's own municipality and refuse demo users.
-- 3) Contract status transitions and decision effectiveness gates.

-- 1) demo guard
create or replace function public._demo_row_guard() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare j jsonb;
begin
  if auth.uid() is null or not is_demo_staff() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    j := to_jsonb(new);
    -- a demo user may not hang rows under a real parent record
    if (j->>'line_id') is not null and exists (select 1 from budget_line p where p.id = (j->>'line_id')::uuid and not p.is_demo) then raise exception 'demo_forbidden' using errcode = '42501'; end if;
    if (j->>'session_id') is not null and exists (select 1 from council_session p where p.id = (j->>'session_id')::uuid and not p.is_demo) then raise exception 'demo_forbidden' using errcode = '42501'; end if;
    if (j->>'decision_id') is not null and exists (select 1 from municipal_decision p where p.id = (j->>'decision_id')::uuid and not p.is_demo) then raise exception 'demo_forbidden' using errcode = '42501'; end if;
    if (j->>'project_id') is not null and exists (select 1 from project p where p.id = (j->>'project_id')::uuid and not p.is_demo) then raise exception 'demo_forbidden' using errcode = '42501'; end if;
    if (j->>'contract_id') is not null and exists (select 1 from contract p where p.id = (j->>'contract_id')::uuid and not p.is_demo) then raise exception 'demo_forbidden' using errcode = '42501'; end if;
    new := jsonb_populate_record(new, jsonb_build_object('is_demo', true));
    return new;
  end if;
  if coalesce((to_jsonb(old)->>'is_demo')::boolean, false) = false then
    raise exception 'demo_forbidden' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public._demo_row_guard() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'is_demo' and c.data_type = 'boolean'
      and c.table_name not in ('staff_member', 'citizen_request', 'municipality')
  loop
    execute format('drop trigger if exists zz_demo_guard on public.%I', r.table_name);
    execute format('create trigger zz_demo_guard before insert or update or delete on public.%I for each row execute function public._demo_row_guard()', r.table_name);
  end loop;
end $$;

-- 2) admin account functions scoped by municipality
create or replace function public._caller_admin_munis() returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select municipality_id from staff_member where user_id = auth.uid() and role = 'admin' and not is_demo; $$;
revoke all on function public._caller_admin_munis() from public, anon, authenticated;

create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or is_demo_staff() or not exists (select 1 from _caller_admin_munis()) then raise exception 'forbidden' using errcode='42501'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'weak_password' using errcode='22023'; end if;
  if not exists (select 1 from staff_member where user_id = p_user and municipality_id in (select _caller_admin_munis())) then raise exception 'not_found' using errcode='P0002'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
  update staff_member set must_change_password = true where user_id = p_user;
  insert into audit_event (municipality_id,actor,action,entity,entity_id,detail)
  select municipality_id, auth.uid(), 'staff.password_reset', 'staff_member', p_user::text, '{}'::jsonb from staff_member where user_id = p_user and municipality_id in (select _caller_admin_munis()) limit 1;
end $$;

create or replace function public.admin_list_staff()
returns table (user_id uuid, email text, role staff_role, display_name text, municipality text, must_change_password boolean, is_demo boolean, created_at timestamptz)
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or is_demo_staff() or not exists (select 1 from _caller_admin_munis()) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select s.user_id, u.email::text, s.role, s.display_name, m.name_ar, s.must_change_password, s.is_demo, s.created_at
    from staff_member s join auth.users u on u.id = s.user_id join municipality m on m.id = s.municipality_id
    where s.municipality_id in (select _caller_admin_munis()) order by s.created_at desc;
end $$;

create or replace function public.admin_create_staff(p_email text, p_password text, p_role staff_role, p_name text, p_muni_slug text, p_demo boolean default false)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := gen_random_uuid(); mun uuid; em text := lower(btrim(coalesce(p_email,'')));
begin
  if auth.uid() is null or is_demo_staff() or not exists (select 1 from _caller_admin_munis()) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_demo and p_role = 'admin' then raise exception 'demo_not_admin' using errcode='22023'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode='22023'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'weak_password' using errcode='22023'; end if;
  select id into mun from municipality where slug = p_muni_slug;
  if mun is null then raise exception 'bad_municipality' using errcode='22023'; end if;
  if mun not in (select _caller_admin_munis()) then raise exception 'forbidden' using errcode='42501'; end if;
  if exists (select 1 from auth.users where lower(email) = em) then raise exception 'exists' using errcode='23505'; end if;
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
    created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',em,extensions.crypt(p_password, extensions.gen_salt('bf')),now(),
    '{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','','');
  insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  values (uid::text,uid,jsonb_build_object('sub',uid::text,'email',em,'email_verified',true,'phone_verified',false),'email',now(),now(),now());
  insert into staff_member (user_id,municipality_id,role,display_name,must_change_password,is_demo)
  values (uid,mun,p_role,nullif(btrim(coalesce(p_name,'')),''),not p_demo,p_demo);
  insert into audit_event (municipality_id,actor,action,entity,entity_id,detail)
  values (mun,auth.uid(),'staff.created','staff_member',uid::text,jsonb_build_object('role',p_role,'email',em,'demo',p_demo));
  return uid;
end $$;

-- 3a) contract status: draft can only move to signed (through the signing gate) or terminated; final states are final
create or replace function public.contract_set_status(p_id uuid, p_status text, p_note text default null, p_date date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c contract%rowtype;
begin
  if p_status is null or p_status not in ('draft','signed','active','completed','terminated','expired') then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into c from contract where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status <> c.status then
    if c.status = 'draft' and p_status not in ('signed','terminated') then raise exception 'bad_transition' using errcode = '22023'; end if;
    if c.status in ('completed','terminated','expired') then raise exception 'bad_transition' using errcode = '22023'; end if;
    if p_status = 'draft' then raise exception 'bad_transition' using errcode = '22023'; end if;
  end if;
  if p_status = 'signed' and c.status = 'draft' then
    if p_date is null or p_date > current_date then raise exception 'sign_date_required' using errcode = '22023'; end if;
    if c.procurement_method is null then raise exception 'bad_method' using errcode = '22023'; end if;
    if c.objection_pending then raise exception 'objection_pending' using errcode = '22023'; end if;
    if c.procurement_method in ('open_tender','two_stage','proposals','framework','quotations') and (c.award_notice_on is null or p_date <= public._add_working_days(c.award_notice_on, 10)) then raise exception 'standstill' using errcode = '22023'; end if;
    if c.procurement_method = 'negotiated' and btrim(coalesce(c.justification,'')) = '' then raise exception 'justification_required' using errcode = '22023'; end if;
  end if;
  update contract set status = p_status, signed_on = case when p_status = 'signed' and c.status = 'draft' then p_date else signed_on end,
    notes = case when nullif(btrim(coalesce(p_note,'')),'') is null then notes else left(coalesce(notes || E'\n', '') || btrim(p_note), 5000) end, updated_at = now() where id = p_id;
  if c.project_id is not null then insert into project_update (project_id, municipality_id, kind, from_value, to_value, note, actor) values (c.project_id, m, 'contract', c.status, p_status, left(c.contractor,300), auth.uid()); end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.status_changed', 'contract', p_id::text, jsonb_build_object('from', c.status, 'to', p_status));
end $$;

-- 3b) decision effective: categories excluded from tacit approval always need an explicit validation date
create or replace function public.decision_set_status(p_id uuid, p_kind text, p_value text, p_note text default null, p_date date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); d municipal_decision%rowtype; old text; base date; note text := nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  select * into d from municipal_decision where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_kind = 'legal' then
    if p_value not in ('draft','adopted','pending_completion','under_review','effective','suspended','annulled') then raise exception 'bad_input' using errcode = '22023'; end if;
    if p_value = 'effective' then
      if p_date is null then raise exception 'effective_date_required' using errcode = '22023'; end if;
      if d.category in ('budget','planning','transfer','loan') and d.validated_on is null then raise exception 'validation_required' using errcode = '22023'; end if;
      if d.validation_level <> 'none' and d.validated_on is null then
        base := case when d.audit_bureau_required then d.audit_bureau_notice_on else d.received_on end;
        if base is not null and base + interval '1 month' <= current_date and d.category not in ('budget','planning','transfer','loan') and d.tacit_notified_on is not null then
          note := coalesce(note || ' — ', '') || 'تصديق حكمي (م.63): انقضى شهر من التسجيل/الإبلاغ دون قرار، وأُبلغت سلطة الرقابة';
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

-- 3c) bound the working-days loop (a huge p_n would otherwise spin)
create or replace function public._add_working_days(p_from date, p_n int) returns date language plpgsql stable set search_path to 'public' as $$
declare d date := p_from; k int := 0;
begin
  if p_n is null or p_n < 0 or p_n > 366 then raise exception 'bad_input' using errcode = '22023'; end if;
  while k < p_n loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from legal_holiday h where h.day = d) then k := k + 1; end if;
  end loop;
  return d;
end $$;

revoke all on function public.admin_create_staff(text,text,staff_role,text,text,boolean), public.admin_list_staff(), public.admin_reset_password(uuid,text) from public, anon;
grant execute on function public.admin_create_staff(text,text,staff_role,text,text,boolean), public.admin_list_staff(), public.admin_reset_password(uuid,text) to authenticated;
