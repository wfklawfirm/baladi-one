-- Demo (exhibition) accounts: may change status of DEMO requests only; cannot review/approve services,
-- cannot see real citizen requests, cannot manage accounts. Shared demo passwords are never force-changed.
alter table staff_member add column if not exists is_demo boolean not null default false;

create or replace function public.is_demo_staff() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.staff_member s where s.user_id = auth.uid() and s.is_demo); $$;

drop policy if exists req_staff_read on citizen_request;
drop policy if exists req_staff_update on citizen_request;
create policy req_staff_read on citizen_request for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy req_staff_update on citizen_request for update to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff())) with check (is_staff(municipality_id) and (is_demo or not is_demo_staff()));

create or replace function public.staff_set_status(p_id uuid, p_status request_status, p_note text default null, p_public boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r citizen_request%rowtype; n text := nullif(left(btrim(coalesce(p_note,'')), 500), '');
begin
  select * into r from citizen_request where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if auth.uid() is null or not is_staff(r.municipality_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if is_demo_staff() and not r.is_demo then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status = p_status and n is null then return; end if;
  update citizen_request set status = p_status, updated_at = now() where id = p_id;
  insert into request_status_history (request_id, from_status, to_status, note, internal, actor)
  values (p_id, r.status, p_status, n, not p_public, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (r.municipality_id, auth.uid(), 'request.status_changed', 'citizen_request', p_id::text,
          jsonb_build_object('from', r.status, 'to', p_status, 'public_note', p_public and n is not null));
end $$;

create or replace function public.review_service_version(p_id uuid, p_to version_status, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v service_version%rowtype; me staff_member%rowtype; n text := nullif(left(btrim(coalesce(p_note,'')),500),'');
        submitter uuid;
begin
  select * into me from staff_member where user_id = auth.uid() order by (role='admin') desc limit 1;
  if auth.uid() is null or not found or me.role not in ('mayor','admin') or me.is_demo then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v from service_version where id = p_id for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if v.status='draft' and p_to='in_review' then
    if me.role <> 'admin' then raise exception 'forbidden' using errcode='42501'; end if;
  elsif v.status='in_review' and p_to in ('approved','draft') then
    if p_to='approved' then
      select actor into submitter from audit_event
        where entity='service_version' and entity_id=p_id::text and action='service_version.in_review' order by id desc limit 1;
      if submitter is not distinct from auth.uid() then raise exception 'four_eyes' using errcode='42501'; end if;
    end if;
  elsif v.status='approved' and p_to='archived' then null;
  else raise exception 'bad_transition' using errcode='22023'; end if;
  if p_to='approved' then
    update service_version set status='archived' where service_id=v.service_id and status='approved' and id<>p_id;
    update service_version set status='approved', approved_by=auth.uid(), approved_at=now() where id=p_id;
  else
    update service_version set status=p_to, approved_by=null, approved_at=null where id=p_id;
  end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (me.municipality_id, auth.uid(), 'service_version.'||p_to, 'service_version', p_id::text,
          jsonb_build_object('from', v.status, 'to', p_to, 'service_id', v.service_id, 'note', n));
end $$;

drop function if exists public.admin_create_staff(text,text,staff_role,text,text);
create or replace function public.admin_create_staff(p_email text, p_password text, p_role staff_role, p_name text, p_muni_slug text, p_demo boolean default false)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := gen_random_uuid(); mun uuid; em text := lower(btrim(coalesce(p_email,'')));
begin
  if auth.uid() is null or not is_any_admin() or is_demo_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_demo and p_role = 'admin' then raise exception 'demo_not_admin' using errcode='22023'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode='22023'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'weak_password' using errcode='22023'; end if;
  select id into mun from municipality where slug = p_muni_slug;
  if mun is null then raise exception 'bad_municipality' using errcode='22023'; end if;
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

drop function if exists public.admin_list_staff();
create or replace function public.admin_list_staff()
returns table (user_id uuid, email text, role staff_role, display_name text, municipality text, must_change_password boolean, is_demo boolean, created_at timestamptz)
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not is_any_admin() or is_demo_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  return query select s.user_id, u.email::text, s.role, s.display_name, m.name_ar, s.must_change_password, s.is_demo, s.created_at
    from staff_member s join auth.users u on u.id = s.user_id join municipality m on m.id = s.municipality_id order by s.created_at desc;
end $$;

revoke all on function public.admin_create_staff(text,text,staff_role,text,text,boolean), public.admin_list_staff(), public.is_demo_staff() from public, anon;
grant execute on function public.admin_create_staff(text,text,staff_role,text,text,boolean), public.admin_list_staff(), public.is_demo_staff() to authenticated;

-- Sample DEMO requests for exhibition visitors (fictional, no personal data).
insert into citizen_request (municipality_id, kind, report_type, description, location_text, token_hash, is_demo, status)
select m.id, 'report', x.t, x.d, x.l, encode(extensions.digest('demo-seed-'||x.n, 'sha256'),'hex'), true, x.s::request_status
from municipality m, (values
  (1,'lighting','عمود الإنارة قرب الساحة العامة مطفأ منذ أسبوع.','الساحة العامة','received'),
  (2,'waste','تراكم نفايات حول الحاويات في الحي الشرقي.','الحي الشرقي','in_progress'),
  (3,'roads','حفرة كبيرة في منتصف الطريق الرئيسي.','الطريق الرئيسي','received'),
  (4,'water','تسرب مياه من الشبكة أمام المدرسة.','أمام المدرسة','in_progress'),
  (5,'noise','ضجيج مرتفع ليلاً من ورشة قريبة من المنازل.','الحي الغربي','received'),
  (6,'other','سور بلدي متضرر ويحتاج إلى ترميم.','قرب الحديقة العامة','received')
) as x(n,t,d,l,s)
where m.slug = 'khreibet-al-jundi' and not exists (select 1 from citizen_request c where c.token_hash = encode(extensions.digest('demo-seed-'||x.n, 'sha256'),'hex'));
