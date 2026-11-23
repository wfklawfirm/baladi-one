-- BALADI ONE — schema as applied to Supabase project sdpemqqozovxmoaerspq
-- (reconstructed from the live database: migrations 0001_core_schema + 0002_fix_service_policy, consolidated).
create type request_status as enum ('received','in_progress','done','needs_info','rejected','cancelled');
create type service_scope   as enum ('MUNICIPAL','SHARED','OUT_OF_SCOPE');
create type staff_role      as enum ('staff','mayor','admin');
create type version_status  as enum ('draft','in_review','approved','archived');

create table municipality (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_ar text not null, name_en text, logo_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now());

create table staff_member (
  user_id uuid not null references auth.users(id) on delete cascade,
  municipality_id uuid not null references municipality(id) on delete cascade,
  role staff_role not null default 'staff', display_name text,
  created_at timestamptz not null default now(),
  primary key (user_id, municipality_id));

create table municipal_service (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null check (category in ('licenses','certificates','shops','public_works','reports')),
  scope service_scope not null default 'MUNICIPAL',
  online_enabled boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now());

create table service_version (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references municipal_service(id) on delete cascade,
  version_no int not null default 1,
  status version_status not null default 'draft',
  title_ar text not null, title_en text, summary_ar text, summary_en text,
  documents jsonb not null default '[]', steps jsonb not null default '[]',
  authority_ar text, municipal_role_ar text, fees jsonb, processing_time_ar text,
  reviewed_on date, approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (service_id, version_no));
create unique index one_approved_per_service on service_version (service_id) where status = 'approved';

create table service_source (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references service_version(id) on delete cascade,
  title text not null, url text,
  kind text not null default 'official' check (kind in ('official','law','internal')),
  reference text);

create table citizen_request (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  service_id uuid references municipal_service(id),
  kind text not null default 'report' check (kind in ('report','service_request')),
  report_type text, description text, location_text text, contact_phone text,
  token_hash text not null,
  is_demo boolean not null default false,
  status request_status not null default 'received',
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index citizen_request_municipality_id_status_idx on citizen_request (municipality_id, status);

create table request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references citizen_request(id) on delete cascade,
  from_status request_status, to_status request_status not null,
  note text, internal boolean not null default true,
  actor uuid references auth.users(id), created_at timestamptz not null default now());

create table audit_event (
  id bigint generated always as identity primary key,
  municipality_id uuid references municipality(id), actor uuid,
  action text not null, entity text not null, entity_id text, detail jsonb,
  created_at timestamptz not null default now());

create function is_staff(m uuid, roles staff_role[] default array['staff','mayor','admin']::staff_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_member s where s.user_id = auth.uid() and s.municipality_id = m and s.role = any(roles)); $$;
create function is_any_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_member s where s.user_id = auth.uid() and s.role = 'admin'); $$;

alter table municipality enable row level security;       alter table staff_member enable row level security;
alter table municipal_service enable row level security;  alter table service_version enable row level security;
alter table service_source enable row level security;     alter table citizen_request enable row level security;
alter table request_status_history enable row level security; alter table audit_event enable row level security;

create policy muni_public_read on municipality for select to public using (true);
create policy staff_self on staff_member for select to authenticated using (user_id = auth.uid());
create policy svc_public_read on municipal_service for select to public using (
  scope in ('MUNICIPAL','SHARED') and exists (select 1 from service_version v where v.service_id = municipal_service.id and v.status = 'approved'));
create policy svc_admin_all on municipal_service for all to authenticated using (is_any_admin()) with check (is_any_admin());
create policy ver_public_read on service_version for select to public using (status = 'approved');
create policy ver_admin_all on service_version for all to authenticated using (is_any_admin()) with check (is_any_admin());
create policy src_public_read on service_source for select to public using (
  exists (select 1 from service_version v where v.id = service_source.version_id and v.status = 'approved'));
create policy src_admin_all on service_source for all to authenticated using (is_any_admin()) with check (is_any_admin());
create policy req_staff_read on citizen_request for select to authenticated using (is_staff(municipality_id));
create policy req_staff_update on citizen_request for update to authenticated using (is_staff(municipality_id)) with check (is_staff(municipality_id));
create policy hist_staff_read on request_status_history for select to authenticated using (
  exists (select 1 from citizen_request r where r.id = request_status_history.request_id and is_staff(r.municipality_id)));
create policy hist_staff_insert on request_status_history for insert to authenticated with check (
  actor = auth.uid() and exists (select 1 from citizen_request r where r.id = request_status_history.request_id and is_staff(r.municipality_id)));
create policy audit_staff_read on audit_event for select to authenticated using (
  municipality_id is not null and is_staff(municipality_id, array['mayor','admin']::staff_role[]));
