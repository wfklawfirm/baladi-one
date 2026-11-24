-- Operations dashboard: collections ledger, request assignment, staff roster for oversight.
create table if not exists public.collection_entry (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipality(id),
  request_id uuid references citizen_request(id) on delete set null,
  service_label text,
  receipt_no text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'LBP' check (currency in ('LBP','USD')),
  method text not null default 'cash' check (method in ('cash','transfer','cheque')),
  collected_by uuid references auth.users(id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists collection_entry_muni_time on public.collection_entry (municipality_id, created_at desc);
alter table public.collection_entry enable row level security;
drop policy if exists coll_staff_read on public.collection_entry;
create policy coll_staff_read on public.collection_entry for select to authenticated
  using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));

create or replace function public.record_collection(p_amount numeric, p_currency text, p_method text, p_service_label text default null, p_receipt_no text default null, p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid; id uuid; d boolean := is_demo_staff();
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select municipality_id into m from staff_member where user_id = auth.uid() order by created_at limit 1;
  if m is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  insert into collection_entry (municipality_id, request_id, service_label, receipt_no, amount, currency, method, collected_by, is_demo)
  values (m, p_request_id, nullif(left(btrim(coalesce(p_service_label,'')), 200), ''), nullif(left(btrim(coalesce(p_receipt_no,'')), 60), ''), p_amount, p_currency, p_method, auth.uid(), d)
  returning collection_entry.id into id;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (m, auth.uid(), 'collection.recorded', 'collection_entry', id::text, jsonb_build_object('amount', p_amount, 'currency', p_currency));
  return id;
end $$;
revoke all on function public.record_collection(numeric, text, text, text, text, uuid) from public, anon;
grant execute on function public.record_collection(numeric, text, text, text, text, uuid) to authenticated;

-- Mayor/admin assigns a request to an employee of the same municipality.
create or replace function public.assign_request(p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r citizen_request%rowtype;
begin
  select * into r from citizen_request where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if auth.uid() is null or not is_staff(r.municipality_id, array['mayor','admin']::staff_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if is_demo_staff() and not r.is_demo then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is not null and not exists (select 1 from staff_member where user_id = p_user and municipality_id = r.municipality_id) then raise exception 'bad_assignee' using errcode = '22023'; end if;
  update citizen_request set assigned_to = p_user, updated_at = now() where id = p_id;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (r.municipality_id, auth.uid(), 'request.assigned', 'citizen_request', p_id::text, jsonb_build_object('to', p_user));
end $$;
revoke all on function public.assign_request(uuid, uuid) from public, anon;
grant execute on function public.assign_request(uuid, uuid) to authenticated;

-- Roster (names) visible to mayor/admin only; staff_member itself is self-read only.
create or replace function public.ops_roster()
returns table (user_id uuid, display_name text, role staff_role) language sql stable security definer set search_path to 'public' as $$
  select s.user_id, s.display_name, s.role from staff_member s
  where exists (select 1 from staff_member me where me.user_id = auth.uid() and me.municipality_id = s.municipality_id and me.role in ('mayor','admin'))
    and (not is_demo_staff() or s.is_demo);
$$;
revoke all on function public.ops_roster() from public, anon;
grant execute on function public.ops_roster() to authenticated;
