-- 0042 (DRAFT — NOT APPLIED): supplier registry and sealed bids (Phase 3). Idempotent. Depends on 0024. No legal value is stored or assumed here.
-- Bids are SEALED: staff cannot read bid rows until the plan item's bids_open_on has passed (RLS); before that only the count is visible (RPC).
-- A received bid is never edited; only the post-opening evaluation fields change, through an RPC. Reads cannot be logged from RLS; writes are audited.
create table if not exists public.procurement_supplier (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  name text not null check (btrim(name) <> ''),
  legal_form text, contact text, registry_ref text,
  docs_expire_on date, notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now());
create index if not exists procurement_supplier_muni on public.procurement_supplier (municipality_id, name);

alter table public.procurement_plan_item add column if not exists bids_open_on timestamptz;

create table if not exists public.procurement_bid (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  plan_item_id uuid not null references public.procurement_plan_item(id) on delete cascade,
  supplier_id uuid not null references public.procurement_supplier(id),
  received_on date not null,
  currency text not null check (currency in ('LBP','USD')),
  total_value numeric(16,2) not null check (total_value >= 0),
  delivery_days int check (delivery_days is null or delivery_days >= 0),
  warranty_note text, bid_note text,
  technical_compliant boolean,              -- null = not assessed yet (set only after opening)
  evaluation_note text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique (plan_item_id, supplier_id));
create index if not exists procurement_bid_item on public.procurement_bid (plan_item_id);

alter table public.procurement_supplier enable row level security;
alter table public.procurement_bid enable row level security;
drop policy if exists procurement_supplier_staff_read on public.procurement_supplier;
drop policy if exists procurement_bid_staff_read on public.procurement_bid;
create policy procurement_supplier_staff_read on public.procurement_supplier for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_bid_staff_read on public.procurement_bid for select to authenticated using (
  is_staff(municipality_id) and (is_demo or not is_demo_staff())
  and exists (select 1 from public.procurement_plan_item p where p.id = plan_item_id and p.bids_open_on is not null and p.bids_open_on <= now()));

create or replace function public.procurement_supplier_add(p_name text, p_form text default null, p_contact text default null, p_registry text default null, p_docs_expire date default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_name,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into procurement_supplier (municipality_id, name, legal_form, contact, registry_ref, docs_expire_on, notes, is_demo, created_by)
  values (m, left(btrim(p_name),300), nullif(left(btrim(coalesce(p_form,'')),100),''), nullif(left(btrim(coalesce(p_contact,'')),300),''), nullif(left(btrim(coalesce(p_registry,'')),100),''), p_docs_expire, nullif(left(btrim(coalesce(p_notes,'')),1000),''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.supplier_added', 'procurement_supplier', i::text, '{}'::jsonb);
  return i;
end $$;

create or replace function public.procurement_set_bids_open(p_item uuid, p_open timestamptz)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); cur timestamptz;
begin
  select bids_open_on into cur from procurement_plan_item where id = p_item and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if cur is not null and cur <= now() then raise exception 'bids_already_open' using errcode = '22023'; end if;
  if p_open is null or p_open <= now() then raise exception 'bad_input' using errcode = '22023'; end if;
  update procurement_plan_item set bids_open_on = p_open, updated_at = now() where id = p_item;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.bids_open_set', 'procurement_plan_item', p_item::text, jsonb_build_object('open_on', p_open));
end $$;

create or replace function public.procurement_bid_add(p_item uuid, p_supplier uuid, p_received date, p_currency text, p_total numeric, p_days int default null, p_warranty text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; op timestamptz;
begin
  select bids_open_on into op from procurement_plan_item where id = p_item and municipality_id = m;
  if not found or not exists (select 1 from procurement_supplier where id = p_supplier and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if op is not null and op <= now() then raise exception 'bids_closed' using errcode = '22023'; end if;
  if p_received is null or p_currency not in ('LBP','USD') or p_total is null or p_total < 0 or p_total >= 1e13 or (p_days is not null and p_days < 0) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into procurement_bid (municipality_id, plan_item_id, supplier_id, received_on, currency, total_value, delivery_days, warranty_note, bid_note, is_demo, created_by)
  values (m, p_item, p_supplier, p_received, p_currency, round(p_total,2), p_days, nullif(left(btrim(coalesce(p_warranty,'')),500),''), nullif(left(btrim(coalesce(p_note,'')),1000),''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.bid_received', 'procurement_bid', i::text, jsonb_build_object('item', p_item));
  return i;
end $$;

create or replace function public.procurement_bid_count(p_item uuid) returns int
language plpgsql stable security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if not exists (select 1 from procurement_plan_item where id = p_item and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select count(*)::int from procurement_bid where plan_item_id = p_item);
end $$;

create or replace function public.procurement_bid_evaluate(p_bid uuid, p_compliant boolean, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); op timestamptz;
begin
  select p.bids_open_on into op from procurement_bid b join procurement_plan_item p on p.id = b.plan_item_id where b.id = p_bid and b.municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if op is null or op > now() then raise exception 'bids_sealed' using errcode = '22023'; end if;
  update procurement_bid set technical_compliant = p_compliant, evaluation_note = nullif(left(btrim(coalesce(p_note,'')),1000),'') where id = p_bid;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.bid_evaluated', 'procurement_bid', p_bid::text, jsonb_build_object('compliant', p_compliant));
end $$;

revoke all on function public.procurement_supplier_add(text,text,text,text,date,text), public.procurement_set_bids_open(uuid,timestamptz), public.procurement_bid_add(uuid,uuid,date,text,numeric,int,text,text), public.procurement_bid_count(uuid), public.procurement_bid_evaluate(uuid,boolean,text) from public, anon;
grant execute on function public.procurement_supplier_add(text,text,text,text,date,text), public.procurement_set_bids_open(uuid,timestamptz), public.procurement_bid_add(uuid,uuid,date,text,numeric,int,text,text), public.procurement_bid_count(uuid), public.procurement_bid_evaluate(uuid,boolean,text) to authenticated;
