-- Municipal administration modules (P2): correspondence, assets, legal affairs, administrative oversight, transparency (access-to-information), HR position register.
-- Idempotent and non-destructive (create-if-not-exists, create-or-replace). NOT applied by the author: the lead applies it.
-- Read: mayor/admin of the municipality (demo rule). Writes: only through SECURITY DEFINER RPCs that call _council_muni() (mayor/admin). No role in the schema is clerk-like.
-- No legal deadline, threshold or classification rule is hard-coded: deadlines are entered by the user (lawyer / registrar); the asset legal classification is a user-entered
-- field flagged "needs verification" until a basis is recorded; nothing is blocked by it; legal disposal of assets is NOT automated.
-- Personal data (requesters in access-to-information requests, parties) is staff-only: no anon/public policy or grant exists on any table here; confidential minutes are not touched.
-- HR: position/assignment register only. There are NO salary or payroll columns by design.

-- ───────── helpers ─────────
create or replace function public._adm_txt(p text, p_max int) returns text language sql immutable set search_path to 'public' as
$$ select nullif(left(btrim(coalesce(p,'')), p_max), '') $$;

create or replace function public._adm_audit(p_m uuid, p_action text, p_entity text, p_id text, p_detail jsonb default '{}'::jsonb) returns void language sql security definer set search_path to 'public' as
$$ insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (p_m, auth.uid(), p_action, p_entity, p_id, coalesce(p_detail,'{}'::jsonb)) $$;
revoke all on function public._adm_txt(text, int) from public, anon, authenticated;
revoke all on function public._adm_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ───────── tables ─────────
create table if not exists public.admin_setting (
  municipality_id uuid not null references municipality(id), key text not null check (key in ('info_request_default_days')),
  int_value int check (int_value is null or int_value between 1 and 365), verified boolean not null default false, note text,
  updated_at timestamptz not null default now(), primary key (municipality_id, key));

create table if not exists public.correspondence (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  direction text not null check (direction in ('in','out')),
  year int not null check (year between 1990 and 2200), seq int not null check (seq > 0),
  subject text not null check (btrim(subject) <> ''), party text not null check (btrim(party) <> ''),
  doc_date date not null default current_date,
  referred_to text, deadline_on date,
  status text not null default 'new' check (status in ('new','referred','in_progress','replied','sent','closed')),
  reply_to uuid references correspondence(id) on delete set null,
  archived boolean not null default false, archived_on date, notes text,
  is_demo boolean not null default false, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (municipality_id, direction, year, seq));
create index if not exists correspondence_muni on public.correspondence (municipality_id, direction, year desc, seq desc);

create table if not exists public.asset (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  kind text not null check (kind in ('real_estate','land','vehicle','equipment','furniture')),
  name text not null check (btrim(name) <> ''), location_text text,
  legal_class text not null default 'unclassified' check (legal_class in ('unclassified','public','private')),
  legal_class_verified boolean not null default false,  -- false = 'يلزم تحقق'
  legal_class_basis text,
  value_amount numeric(14,2) check (value_amount is null or value_amount >= 0),  -- null = unknown (never shown as 0)
  currency text not null default 'USD' check (currency in ('LBP','USD')),
  acquired_on date, status text not null default 'in_use' check (status in ('in_use','idle','retired')), notes text,
  is_demo boolean not null default false, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists asset_muni on public.asset (municipality_id, kind, created_at desc);
create table if not exists public.asset_lease (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references asset(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  lessee text not null check (btrim(lessee) <> ''), start_on date, end_on date,
  rent_amount numeric(14,2) check (rent_amount is null or rent_amount >= 0), currency text not null default 'USD' check (currency in ('LBP','USD')),
  status text not null default 'active' check (status in ('active','ended')), notes text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (start_on is null or end_on is null or end_on >= start_on));
create index if not exists asset_lease_asset on public.asset_lease (asset_id);
create table if not exists public.asset_maintenance (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references asset(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  done_on date not null, description text not null check (btrim(description) <> ''),
  cost_amount numeric(14,2) check (cost_amount is null or cost_amount >= 0), currency text not null default 'USD' check (currency in ('LBP','USD')),
  next_due_on date, created_by uuid references auth.users(id), created_at timestamptz not null default now());
create index if not exists asset_maintenance_asset on public.asset_maintenance (asset_id, done_on desc);

-- Document references: free text or http(s) URL only. No file storage.
create table if not exists public.admin_ref (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references municipality(id),
  entity text not null check (entity in ('asset','legal_matter','oversight_item','correspondence')), entity_id uuid not null,
  title text not null check (btrim(title) <> ''), ref text not null check (btrim(ref) <> ''),
  created_by uuid references auth.users(id), created_at timestamptz not null default now());
create index if not exists admin_ref_entity on public.admin_ref (entity, entity_id);

create table if not exists public.legal_matter (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references municipality(id),
  kind text not null check (kind in ('case','claim','consultation','judgment')),
  title text not null check (btrim(title) <> ''), ref_no text, court text, opposing_party text, lawyer text,
  opened_on date, judgment_on date, next_hearing_on date, outcome text,
  status text not null default 'open' check (status in ('open','awaiting_judgment','judged','closed')), notes text,
  is_demo boolean not null default false, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists legal_matter_muni on public.legal_matter (municipality_id, created_at desc);
-- Deadlines are ENTERED by the lawyer (label + date + who entered); the system never computes appeal/limitation periods.
create table if not exists public.legal_deadline (
  id uuid primary key default gen_random_uuid(), matter_id uuid not null references legal_matter(id) on delete cascade,
  municipality_id uuid not null references municipality(id),
  label text not null check (btrim(label) <> ''), due_on date not null, entered_by text not null check (btrim(entered_by) <> ''),
  done boolean not null default false, created_by uuid references auth.users(id), created_at timestamptz not null default now());
create index if not exists legal_deadline_matter on public.legal_deadline (matter_id, due_on);

create table if not exists public.oversight_item (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references municipality(id),
  kind text not null check (kind in ('supervisory_letter','document_request','remark','corrective_action')),
  subject text not null check (btrim(subject) <> ''), authority text, ref_no text, responsible text,
  received_on date, due_on date, response text,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  closed_on date, closure_evidence text,
  is_demo boolean not null default false, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'closed' or (closure_evidence is not null and btrim(closure_evidence) <> '' and closed_on is not null)));
create index if not exists oversight_muni on public.oversight_item (municipality_id, due_on);

create table if not exists public.info_request (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references municipality(id),
  requester_name text not null check (btrim(requester_name) <> ''), contact text,  -- personal data: staff only
  subject text not null check (btrim(subject) <> ''),
  received_on date not null, due_on date,  -- entered or taken from admin_setting; never hard-coded
  replied_on date, reply_summary text,
  status text not null default 'received' check (status in ('received','in_review','replied','refused','closed')),
  contains_personal_data boolean not null default false,
  redaction_required boolean not null default true, redaction_done boolean not null default false,
  publishable boolean not null default false,
  is_demo boolean not null default false, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (not publishable or not redaction_required or redaction_done));
create index if not exists info_request_muni on public.info_request (municipality_id, received_on desc);

create table if not exists public.hr_position (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references municipality(id),
  person_name text not null check (btrim(person_name) <> ''), position_title text not null check (btrim(position_title) <> ''), unit text,
  assigned_on date, ended_on date, notes text,
  is_demo boolean not null default false, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (assigned_on is null or ended_on is null or ended_on >= assigned_on));
create index if not exists hr_position_muni on public.hr_position (municipality_id, created_at desc);

-- ───────── RLS: read for mayor/admin only (demo rule); no write policy; nothing for anon ─────────
do $$ declare t text; begin
  foreach t in array array['admin_setting','correspondence','asset','asset_lease','asset_maintenance','admin_ref','legal_matter','legal_deadline','oversight_item','info_request','hr_position'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_read', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;
create policy admin_setting_staff_read on public.admin_setting for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]));
create policy correspondence_staff_read on public.correspondence for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));
create policy asset_staff_read on public.asset for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));
create policy asset_lease_staff_read on public.asset_lease for select to authenticated using (exists (select 1 from asset a where a.id = asset_id and is_staff(a.municipality_id, array['mayor','admin']::staff_role[]) and (a.is_demo or not is_demo_staff())));
create policy asset_maintenance_staff_read on public.asset_maintenance for select to authenticated using (exists (select 1 from asset a where a.id = asset_id and is_staff(a.municipality_id, array['mayor','admin']::staff_role[]) and (a.is_demo or not is_demo_staff())));
create policy admin_ref_staff_read on public.admin_ref for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo_staff() is not true or entity_id in (select id from asset where is_demo union select id from legal_matter where is_demo union select id from oversight_item where is_demo union select id from correspondence where is_demo)));
create policy legal_matter_staff_read on public.legal_matter for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));
create policy legal_deadline_staff_read on public.legal_deadline for select to authenticated using (exists (select 1 from legal_matter l where l.id = matter_id and is_staff(l.municipality_id, array['mayor','admin']::staff_role[]) and (l.is_demo or not is_demo_staff())));
create policy oversight_item_staff_read on public.oversight_item for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));
create policy info_request_staff_read on public.info_request for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));
create policy hr_position_staff_read on public.hr_position for select to authenticated using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));

-- ───────── Correspondence ─────────
-- Numbering is per (municipality, direction, year); allocated under an advisory lock, backed by the unique constraint.
create or replace function public.adm_corr_add(p_direction text, p_subject text, p_party text, p_doc_date date default null, p_referred_to text default null,
  p_deadline date default null, p_reply_to uuid default null, p_notes text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); d date := coalesce(p_doc_date, current_date); y int; n int; i uuid; r correspondence%rowtype; st text;
begin
  if p_direction not in ('in','out') or _adm_txt(p_subject,500) is null or _adm_txt(p_party,300) is null then raise exception 'bad_input' using errcode = '22023'; end if;
  y := extract(year from d)::int;
  if p_reply_to is not null then
    select * into r from correspondence where id = p_reply_to and municipality_id = m;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(m::text || ':' || p_direction || ':' || y::text, 0));
  select coalesce(max(seq),0) + 1 into n from correspondence where municipality_id = m and direction = p_direction and year = y;
  st := case when p_direction = 'out' then 'sent' when _adm_txt(p_referred_to,200) is not null then 'referred' else 'new' end;
  insert into correspondence (municipality_id, direction, year, seq, subject, party, doc_date, referred_to, deadline_on, status, reply_to, notes, is_demo, created_by)
  values (m, p_direction, y, n, _adm_txt(p_subject,500), _adm_txt(p_party,300), d, _adm_txt(p_referred_to,200), p_deadline, st, p_reply_to, _adm_txt(p_notes,3000), is_demo_staff(), auth.uid()) returning id into i;
  if p_direction = 'out' and p_reply_to is not null and r.direction = 'in' and r.status not in ('closed') then
    update correspondence set status = 'replied', updated_at = now() where id = p_reply_to;
  end if;
  perform _adm_audit(m, 'correspondence.created', 'correspondence', i::text, jsonb_build_object('direction', p_direction, 'year', y, 'seq', n));
  return i;
end $$;

create or replace function public.adm_corr_update(p_id uuid, p_status text, p_referred_to text default null, p_deadline date default null, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c correspondence%rowtype; st text := p_status;
begin
  select * into c from correspondence where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st is null or st not in ('new','referred','in_progress','replied','sent','closed') then raise exception 'bad_input' using errcode = '22023'; end if;
  if (c.direction = 'in' and st = 'sent') or (c.direction = 'out' and st in ('new','referred','in_progress','replied')) then raise exception 'bad_input' using errcode = '22023'; end if;
  if st = 'new' and _adm_txt(p_referred_to,200) is not null then st := 'referred'; end if;
  update correspondence set status = st, referred_to = _adm_txt(p_referred_to,200), deadline_on = p_deadline,
    notes = case when _adm_txt(p_note,1000) is null then notes else left(coalesce(notes || E'\n','') || _adm_txt(p_note,1000), 5000) end, updated_at = now() where id = p_id;
  perform _adm_audit(m, 'correspondence.updated', 'correspondence', p_id::text, jsonb_build_object('from', c.status, 'to', st));
end $$;

create or replace function public.adm_corr_archive(p_id uuid, p_archived boolean) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c correspondence%rowtype;
begin
  select * into c from correspondence where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(p_archived,false) and c.status not in ('replied','sent','closed') then raise exception 'not_closed' using errcode = '22023'; end if;
  update correspondence set archived = coalesce(p_archived,false), archived_on = case when coalesce(p_archived,false) then current_date else null end, updated_at = now() where id = p_id;
  perform _adm_audit(m, case when coalesce(p_archived,false) then 'correspondence.archived' else 'correspondence.unarchived' end, 'correspondence', p_id::text);
end $$;

-- ───────── Assets ─────────
create or replace function public.adm_asset_add(p_kind text, p_name text, p_location text default null, p_legal_class text default 'unclassified', p_value numeric default null,
  p_currency text default 'USD', p_acquired date default null, p_notes text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_kind not in ('real_estate','land','vehicle','equipment','furniture') or _adm_txt(p_name,300) is null or coalesce(p_legal_class,'unclassified') not in ('unclassified','public','private')
     or p_currency not in ('LBP','USD') or (p_value is not null and p_value < 0) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into asset (municipality_id, kind, name, location_text, legal_class, value_amount, currency, acquired_on, notes, is_demo, created_by)
  values (m, p_kind, _adm_txt(p_name,300), _adm_txt(p_location,500), coalesce(p_legal_class,'unclassified'), p_value, p_currency, p_acquired, _adm_txt(p_notes,3000), is_demo_staff(), auth.uid()) returning id into i;
  perform _adm_audit(m, 'asset.created', 'asset', i::text, jsonb_build_object('kind', p_kind));
  return i;
end $$;

create or replace function public.adm_asset_update(p_id uuid, p_name text, p_location text, p_value numeric, p_currency text, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if _adm_txt(p_name,300) is null or p_currency not in ('LBP','USD') or p_status not in ('in_use','idle','retired') or (p_value is not null and p_value < 0) then raise exception 'bad_input' using errcode = '22023'; end if;
  update asset set name = _adm_txt(p_name,300), location_text = _adm_txt(p_location,500), value_amount = p_value, currency = p_currency, status = p_status, notes = _adm_txt(p_notes,3000), updated_at = now()
    where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _adm_audit(m, 'asset.updated', 'asset', p_id::text, jsonb_build_object('status', p_status));
end $$;

-- Legal classification (public vs private municipal property) is a user-entered label. It stays "needs verification" until a basis is recorded; it blocks nothing.
create or replace function public.adm_asset_set_class(p_id uuid, p_class text, p_verified boolean default false, p_basis text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_class not in ('unclassified','public','private') then raise exception 'bad_input' using errcode = '22023'; end if;
  if coalesce(p_verified,false) and (p_class = 'unclassified' or _adm_txt(p_basis,1000) is null) then raise exception 'basis_required' using errcode = '22023'; end if;
  update asset set legal_class = p_class, legal_class_verified = coalesce(p_verified,false), legal_class_basis = _adm_txt(p_basis,1000), updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _adm_audit(m, 'asset.class_set', 'asset', p_id::text, jsonb_build_object('class', p_class, 'verified', coalesce(p_verified,false)));
end $$;

create or replace function public.adm_asset_lease_add(p_asset uuid, p_lessee text, p_start date default null, p_end date default null, p_rent numeric default null, p_currency text default 'USD', p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if _adm_txt(p_lessee,300) is null or p_currency not in ('LBP','USD') or (p_rent is not null and p_rent < 0) or (p_start is not null and p_end is not null and p_end < p_start) then raise exception 'bad_input' using errcode = '22023'; end if;
  if not exists (select 1 from asset where id = p_asset and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into asset_lease (asset_id, municipality_id, lessee, start_on, end_on, rent_amount, currency, notes, created_by) values (p_asset, m, _adm_txt(p_lessee,300), p_start, p_end, p_rent, p_currency, _adm_txt(p_notes,2000), auth.uid()) returning id into i;
  perform _adm_audit(m, 'asset.lease_added', 'asset_lease', i::text, jsonb_build_object('asset', p_asset));
  return i;
end $$;

create or replace function public.adm_asset_lease_set_status(p_id uuid, p_status text) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_status not in ('active','ended') then raise exception 'bad_input' using errcode = '22023'; end if;
  update asset_lease set status = p_status where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _adm_audit(m, 'asset.lease_status', 'asset_lease', p_id::text, jsonb_build_object('to', p_status));
end $$;

create or replace function public.adm_asset_maint_add(p_asset uuid, p_done_on date, p_description text, p_cost numeric default null, p_currency text default 'USD', p_next_due date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_done_on is null or _adm_txt(p_description,2000) is null or p_currency not in ('LBP','USD') or (p_cost is not null and p_cost < 0) then raise exception 'bad_input' using errcode = '22023'; end if;
  if not exists (select 1 from asset where id = p_asset and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into asset_maintenance (asset_id, municipality_id, done_on, description, cost_amount, currency, next_due_on, created_by) values (p_asset, m, p_done_on, _adm_txt(p_description,2000), p_cost, p_currency, p_next_due, auth.uid()) returning id into i;
  perform _adm_audit(m, 'asset.maintenance_added', 'asset_maintenance', i::text, jsonb_build_object('asset', p_asset));
  return i;
end $$;

-- ───────── Document references (text / http(s) URL only) ─────────
create or replace function public.adm_ref_add(p_entity text, p_entity_id uuid, p_title text, p_ref text) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; ok boolean; r text := _adm_txt(p_ref,1000);
begin
  if _adm_txt(p_title,300) is null or r is null or p_entity not in ('asset','legal_matter','oversight_item','correspondence') then raise exception 'bad_input' using errcode = '22023'; end if;
  if r ~* '^[a-z][a-z0-9+.-]*:' and r !~* '^https?://' then raise exception 'bad_ref' using errcode = '22023'; end if;
  ok := case p_entity
    when 'asset' then exists (select 1 from asset where id = p_entity_id and municipality_id = m)
    when 'legal_matter' then exists (select 1 from legal_matter where id = p_entity_id and municipality_id = m)
    when 'oversight_item' then exists (select 1 from oversight_item where id = p_entity_id and municipality_id = m)
    else exists (select 1 from correspondence where id = p_entity_id and municipality_id = m) end;
  if not ok then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into admin_ref (municipality_id, entity, entity_id, title, ref, created_by) values (m, p_entity, p_entity_id, _adm_txt(p_title,300), r, auth.uid()) returning id into i;
  perform _adm_audit(m, 'admin.ref_added', 'admin_ref', i::text, jsonb_build_object('entity', p_entity, 'entity_id', p_entity_id));
  return i;
end $$;

create or replace function public.adm_ref_delete(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  delete from admin_ref where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _adm_audit(m, 'admin.ref_deleted', 'admin_ref', p_id::text);
end $$;

-- ───────── Legal affairs ─────────
create or replace function public.adm_legal_add(p_kind text, p_title text, p_ref_no text default null, p_court text default null, p_opposing text default null, p_lawyer text default null,
  p_opened_on date default null, p_judgment_on date default null, p_notes text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_kind not in ('case','claim','consultation','judgment') or _adm_txt(p_title,500) is null then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into legal_matter (municipality_id, kind, title, ref_no, court, opposing_party, lawyer, opened_on, judgment_on, notes, status, is_demo, created_by)
  values (m, p_kind, _adm_txt(p_title,500), _adm_txt(p_ref_no,100), _adm_txt(p_court,300), _adm_txt(p_opposing,300), _adm_txt(p_lawyer,200), p_opened_on, p_judgment_on, _adm_txt(p_notes,5000),
    case when p_kind = 'judgment' then 'judged' else 'open' end, is_demo_staff(), auth.uid()) returning id into i;
  perform _adm_audit(m, 'legal.created', 'legal_matter', i::text, jsonb_build_object('kind', p_kind));
  return i;
end $$;

create or replace function public.adm_legal_update(p_id uuid, p_status text, p_next_hearing date default null, p_outcome text default null, p_lawyer text default null, p_judgment_on date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); old text;
begin
  if p_status not in ('open','awaiting_judgment','judged','closed') then raise exception 'bad_input' using errcode = '22023'; end if;
  select status into old from legal_matter where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update legal_matter set status = p_status, next_hearing_on = p_next_hearing, outcome = _adm_txt(p_outcome,3000), lawyer = _adm_txt(p_lawyer,200), judgment_on = p_judgment_on, updated_at = now() where id = p_id;
  perform _adm_audit(m, 'legal.updated', 'legal_matter', p_id::text, jsonb_build_object('from', old, 'to', p_status));
end $$;

create or replace function public.adm_legal_deadline_add(p_matter uuid, p_label text, p_due date, p_entered_by text) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if _adm_txt(p_label,300) is null or p_due is null then raise exception 'bad_input' using errcode = '22023'; end if;
  if _adm_txt(p_entered_by,200) is null then raise exception 'lawyer_required' using errcode = '22023'; end if;
  if not exists (select 1 from legal_matter where id = p_matter and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into legal_deadline (matter_id, municipality_id, label, due_on, entered_by, created_by) values (p_matter, m, _adm_txt(p_label,300), p_due, _adm_txt(p_entered_by,200), auth.uid()) returning id into i;
  perform _adm_audit(m, 'legal.deadline_added', 'legal_deadline', i::text, jsonb_build_object('matter', p_matter, 'due', p_due));
  return i;
end $$;

create or replace function public.adm_legal_deadline_set_done(p_id uuid, p_done boolean) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update legal_deadline set done = coalesce(p_done,false) where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _adm_audit(m, 'legal.deadline_done', 'legal_deadline', p_id::text, jsonb_build_object('done', coalesce(p_done,false)));
end $$;

-- ───────── Administrative oversight ─────────
create or replace function public.adm_oversight_add(p_kind text, p_subject text, p_authority text default null, p_ref_no text default null, p_received_on date default null, p_due_on date default null, p_responsible text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_kind not in ('supervisory_letter','document_request','remark','corrective_action') or _adm_txt(p_subject,1000) is null or (p_received_on is not null and p_due_on is not null and p_due_on < p_received_on) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into oversight_item (municipality_id, kind, subject, authority, ref_no, responsible, received_on, due_on, is_demo, created_by)
  values (m, p_kind, _adm_txt(p_subject,1000), _adm_txt(p_authority,300), _adm_txt(p_ref_no,100), _adm_txt(p_responsible,200), p_received_on, p_due_on, is_demo_staff(), auth.uid()) returning id into i;
  perform _adm_audit(m, 'oversight.created', 'oversight_item', i::text, jsonb_build_object('kind', p_kind));
  return i;
end $$;

-- Closing requires evidence text and a closing date.
create or replace function public.adm_oversight_update(p_id uuid, p_status text, p_response text default null, p_closure_evidence text default null, p_closed_on date default null, p_due_on date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); old text;
begin
  if p_status not in ('open','in_progress','closed') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_status = 'closed' and (_adm_txt(p_closure_evidence,5000) is null or p_closed_on is null) then raise exception 'evidence_required' using errcode = '22023'; end if;
  select status into old from oversight_item where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update oversight_item set status = p_status, response = _adm_txt(p_response,5000), due_on = p_due_on,
    closure_evidence = case when p_status = 'closed' then _adm_txt(p_closure_evidence,5000) else null end, closed_on = case when p_status = 'closed' then p_closed_on else null end, updated_at = now() where id = p_id;
  perform _adm_audit(m, 'oversight.updated', 'oversight_item', p_id::text, jsonb_build_object('from', old, 'to', p_status));
end $$;

-- ───────── Transparency: access-to-information requests ─────────
-- The due date is entered by the registrar (or defaulted from admin_setting.info_request_default_days, itself flagged as needing legal verification). No legal period is hard-coded.
create or replace function public.adm_setting_set(p_key text, p_int int, p_verified boolean default false, p_note text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_key <> 'info_request_default_days' or (p_int is not null and (p_int < 1 or p_int > 365)) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into admin_setting (municipality_id, key, int_value, verified, note, updated_at) values (m, p_key, p_int, coalesce(p_verified,false), _adm_txt(p_note,500), now())
  on conflict (municipality_id, key) do update set int_value = excluded.int_value, verified = excluded.verified, note = excluded.note, updated_at = now();
  perform _adm_audit(m, 'admin.setting_set', 'admin_setting', p_key, jsonb_build_object('value', p_int, 'verified', coalesce(p_verified,false)));
end $$;

create or replace function public.adm_info_add(p_requester text, p_contact text, p_subject text, p_received_on date, p_due_on date default null, p_personal boolean default false)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if _adm_txt(p_requester,300) is null or _adm_txt(p_subject,2000) is null or p_received_on is null or (p_due_on is not null and p_due_on < p_received_on) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into info_request (municipality_id, requester_name, contact, subject, received_on, due_on, contains_personal_data, redaction_required, is_demo, created_by)
  values (m, _adm_txt(p_requester,300), _adm_txt(p_contact,300), _adm_txt(p_subject,2000), p_received_on, p_due_on, coalesce(p_personal,false), true, is_demo_staff(), auth.uid()) returning id into i;
  perform _adm_audit(m, 'info_request.created', 'info_request', i::text);  -- no requester data in the audit detail
  return i;
end $$;

create or replace function public.adm_info_update(p_id uuid, p_status text, p_replied_on date default null, p_reply_summary text default null, p_due_on date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); old text;
begin
  if p_status not in ('received','in_review','replied','refused','closed') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_status in ('replied','refused') and p_replied_on is null then raise exception 'reply_date_required' using errcode = '22023'; end if;
  select status into old from info_request where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update info_request set status = p_status, replied_on = p_replied_on, reply_summary = _adm_txt(p_reply_summary,5000), due_on = p_due_on, updated_at = now() where id = p_id;
  perform _adm_audit(m, 'info_request.updated', 'info_request', p_id::text, jsonb_build_object('from', old, 'to', p_status));
end $$;

-- Publication flag: a reply can be marked publishable only after redaction is done when redaction is required; requests with personal data always require redaction.
create or replace function public.adm_info_set_publication(p_id uuid, p_publishable boolean, p_personal boolean, p_redaction_required boolean, p_redaction_done boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); req boolean := coalesce(p_redaction_required,true) or coalesce(p_personal,false);
begin
  if coalesce(p_publishable,false) and req and not coalesce(p_redaction_done,false) then raise exception 'redaction_required' using errcode = '22023'; end if;
  update info_request set publishable = coalesce(p_publishable,false), contains_personal_data = coalesce(p_personal,false), redaction_required = req, redaction_done = coalesce(p_redaction_done,false), updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _adm_audit(m, 'info_request.publication_set', 'info_request', p_id::text, jsonb_build_object('publishable', coalesce(p_publishable,false), 'redaction_done', coalesce(p_redaction_done,false)));
end $$;

-- ───────── HR: position / assignment register (no salary) ─────────
create or replace function public.adm_hr_add(p_name text, p_position text, p_unit text default null, p_assigned_on date default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if _adm_txt(p_name,200) is null or _adm_txt(p_position,200) is null then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into hr_position (municipality_id, person_name, position_title, unit, assigned_on, notes, is_demo, created_by) values (m, _adm_txt(p_name,200), _adm_txt(p_position,200), _adm_txt(p_unit,200), p_assigned_on, _adm_txt(p_notes,2000), is_demo_staff(), auth.uid()) returning id into i;
  perform _adm_audit(m, 'hr.position_added', 'hr_position', i::text);
  return i;
end $$;

create or replace function public.adm_hr_end(p_id uuid, p_ended_on date) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a date;
begin
  select assigned_on into a from hr_position where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_ended_on is null or (a is not null and p_ended_on < a) then raise exception 'bad_input' using errcode = '22023'; end if;
  update hr_position set ended_on = p_ended_on where id = p_id;
  perform _adm_audit(m, 'hr.position_ended', 'hr_position', p_id::text);
end $$;

-- RPC execution: authenticated only (each function self-checks mayor/admin through _council_muni()).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'adm\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
