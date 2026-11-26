-- 0043 (DRAFT — NOT APPLIED): procurement objections register, SEPARATE from citizen complaints. Idempotent. Depends on 0024 and 0042.
-- No legal period, deadline length, authority or article is stored or assumed: competent_authority / deadline_note / effect_on_procedure are free text
-- typed by staff after legal verification. The system never decides an objection and never computes its effect. Reads are RLS (staff); writes only via
-- SECURITY DEFINER RPCs (mayor/admin through _council_muni()), each audited.
create table if not exists public.procurement_objection (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  plan_item_id uuid not null references public.procurement_plan_item(id) on delete cascade,
  objector text not null check (btrim(objector) <> ''),
  subject text not null check (btrim(subject) <> ''),
  received_on date not null,
  competent_authority text,        -- free text, typed by staff
  deadline_note text,              -- free text; NOT computed, NOT enforced
  documents_ref text,              -- reference to the filed documents (no upload here)
  decision text,
  decided_on date,
  effect_on_procedure text,        -- free text; to be verified legally
  status text not null default 'open' check (status in ('open','answered','decided','withdrawn')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists procurement_objection_item on public.procurement_objection (plan_item_id, received_on);

create table if not exists public.procurement_objection_reply (
  id uuid primary key default gen_random_uuid(),
  objection_id uuid not null references public.procurement_objection(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  reply_text text not null check (btrim(reply_text) <> ''),
  replied_on date not null,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now());
create index if not exists procurement_objection_reply_obj on public.procurement_objection_reply (objection_id);

alter table public.procurement_objection enable row level security;
alter table public.procurement_objection_reply enable row level security;
drop policy if exists procurement_objection_staff_read on public.procurement_objection;
drop policy if exists procurement_objection_reply_staff_read on public.procurement_objection_reply;
create policy procurement_objection_staff_read on public.procurement_objection for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_objection_reply_staff_read on public.procurement_objection_reply for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));

create or replace function public.procurement_objection_add(p_item uuid, p_objector text, p_subject text, p_received date, p_authority text default null, p_deadline_note text default null, p_docs text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if btrim(coalesce(p_objector,'')) = '' or btrim(coalesce(p_subject,'')) = '' or p_received is null then raise exception 'bad_input' using errcode = '22023'; end if;
  if not exists (select 1 from procurement_plan_item where id = p_item and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into procurement_objection (municipality_id, plan_item_id, objector, subject, received_on, competent_authority, deadline_note, documents_ref, is_demo, created_by)
  values (m, p_item, left(btrim(p_objector),300), left(btrim(p_subject),3000), p_received, nullif(left(btrim(coalesce(p_authority,'')),500),''), nullif(left(btrim(coalesce(p_deadline_note,'')),1000),''), nullif(left(btrim(coalesce(p_docs,'')),1000),''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.objection_added', 'procurement_objection', i::text, jsonb_build_object('item', p_item));
  return i;
end $$;

create or replace function public.procurement_objection_reply_add(p_objection uuid, p_reply text, p_replied_on date)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; st text;
begin
  if btrim(coalesce(p_reply,'')) = '' or p_replied_on is null then raise exception 'bad_input' using errcode = '22023'; end if;
  select status into st from procurement_objection where id = p_objection and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st in ('decided','withdrawn') then raise exception 'objection_closed' using errcode = '22023'; end if;
  insert into procurement_objection_reply (objection_id, municipality_id, reply_text, replied_on, is_demo, created_by)
  values (p_objection, m, left(btrim(p_reply),5000), p_replied_on, is_demo_staff(), auth.uid()) returning id into i;
  update procurement_objection set status = 'answered', updated_at = now() where id = p_objection and status = 'open';
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.objection_replied', 'procurement_objection', p_objection::text, '{}'::jsonb);
  return i;
end $$;

-- Records the decision of the competent authority as typed by staff. The effect on the procedure is free text pending legal verification.
create or replace function public.procurement_objection_decide(p_objection uuid, p_decision text, p_decided_on date, p_effect text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); st text;
begin
  if btrim(coalesce(p_decision,'')) = '' or p_decided_on is null then raise exception 'bad_input' using errcode = '22023'; end if;
  select status into st from procurement_objection where id = p_objection and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st in ('decided','withdrawn') then raise exception 'objection_closed' using errcode = '22023'; end if;
  update procurement_objection set decision = left(btrim(p_decision),5000), decided_on = p_decided_on, effect_on_procedure = nullif(left(btrim(coalesce(p_effect,'')),2000),''), status = 'decided', updated_at = now() where id = p_objection;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.objection_decided', 'procurement_objection', p_objection::text, '{}'::jsonb);
end $$;

create or replace function public.procurement_objection_withdraw(p_objection uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); st text;
begin
  select status into st from procurement_objection where id = p_objection and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st in ('decided','withdrawn') then raise exception 'objection_closed' using errcode = '22023'; end if;
  update procurement_objection set status = 'withdrawn', updated_at = now() where id = p_objection;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.objection_withdrawn', 'procurement_objection', p_objection::text, '{}'::jsonb);
end $$;

revoke all on function public.procurement_objection_add(uuid,text,text,date,text,text,text), public.procurement_objection_reply_add(uuid,text,date), public.procurement_objection_decide(uuid,text,date,text), public.procurement_objection_withdraw(uuid) from public, anon;
grant execute on function public.procurement_objection_add(uuid,text,text,date,text,text,text), public.procurement_objection_reply_add(uuid,text,date), public.procurement_objection_decide(uuid,text,date,text), public.procurement_objection_withdraw(uuid) to authenticated;
