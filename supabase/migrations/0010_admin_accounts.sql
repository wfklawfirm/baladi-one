-- Admin-managed staff accounts with temporary passwords and a forced change at first login.
-- No service-role key is needed in the app: these SECURITY DEFINER functions are admin-only (is_any_admin()).
alter table staff_member add column if not exists must_change_password boolean not null default false;

create or replace function public.admin_create_staff(p_email text, p_password text, p_role staff_role, p_name text, p_muni_slug text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := gen_random_uuid(); mun uuid; em text := lower(btrim(coalesce(p_email,'')));
begin
  if auth.uid() is null or not is_any_admin() then raise exception 'forbidden' using errcode='42501'; end if;
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
  insert into staff_member (user_id,municipality_id,role,display_name,must_change_password) values (uid,mun,p_role,nullif(btrim(coalesce(p_name,'')),''),true);
  insert into audit_event (municipality_id,actor,action,entity,entity_id,detail)
  values (mun,auth.uid(),'staff.created','staff_member',uid::text,jsonb_build_object('role',p_role,'email',em));
  return uid;
end $$;

create or replace function public.admin_list_staff()
returns table (user_id uuid, email text, role staff_role, display_name text, municipality text, must_change_password boolean, created_at timestamptz)
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not is_any_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return query select s.user_id, u.email::text, s.role, s.display_name, m.name_ar, s.must_change_password, s.created_at
    from staff_member s join auth.users u on u.id = s.user_id join municipality m on m.id = s.municipality_id order by s.created_at desc;
end $$;

create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not is_any_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'weak_password' using errcode='22023'; end if;
  if not exists (select 1 from staff_member where user_id = p_user) then raise exception 'not_found' using errcode='P0002'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
  update staff_member set must_change_password = true where user_id = p_user;
  insert into audit_event (municipality_id,actor,action,entity,entity_id,detail)
  select municipality_id, auth.uid(), 'staff.password_reset', 'staff_member', p_user::text, '{}'::jsonb from staff_member where user_id = p_user limit 1;
end $$;

-- Called by the app right after the user has set a new password.
create or replace function public.staff_password_changed() returns void language sql security definer set search_path to 'public' as $$
  update staff_member set must_change_password = false where user_id = auth.uid(); $$;

revoke all on function public.admin_create_staff(text,text,staff_role,text,text), public.admin_list_staff(), public.admin_reset_password(uuid,text), public.staff_password_changed() from public, anon;
grant execute on function public.admin_create_staff(text,text,staff_role,text,text), public.admin_list_staff(), public.admin_reset_password(uuid,text), public.staff_password_changed() to authenticated;
