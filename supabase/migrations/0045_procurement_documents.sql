-- 0045 (DRAFT — NOT APPLIED): procurement document factory records + plan-item <-> decision-builder link. Idempotent. Depends on 0024, 0031, 0040, 0042.
-- No legal value is stored or assumed. A generated document is always a draft; this table only records WHAT was generated, from WHICH records, by WHOM.
-- Writes go through SECURITY DEFINER RPCs (mayor/admin of the caller's municipality via public._council_muni()); both tables are append-only (no update/delete policy).

-- 1) Generated-document log ---------------------------------------------------------------------------------------------------
create table if not exists public.procurement_document (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  plan_item_id uuid not null references public.procurement_plan_item(id) on delete cascade,
  template_key text not null check (template_key in ('purchase_request','need_definition','estimate_sheet','bid_register','bid_comparison','committee_minutes','bidder_notification')),
  template_version text not null check (length(template_version) between 1 and 20),
  format text not null check (format in ('html','docx','xlsx')),
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),   -- [{table,id,label}] records the content came from
  autofilled jsonb not null default '[]'::jsonb check (jsonb_typeof(autofilled) = 'array'),    -- [{label,source_table,source_id}] fields filled automatically
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{8,64}$'),
  is_demo boolean not null default false,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now());
create index if not exists procurement_document_item on public.procurement_document (plan_item_id, generated_at desc);
alter table public.procurement_document enable row level security;
drop policy if exists procurement_document_staff_read on public.procurement_document;
create policy procurement_document_staff_read on public.procurement_document for select to authenticated
  using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));

create or replace function public.procurement_document_record(p_item uuid, p_key text, p_version text, p_format text, p_sources jsonb, p_autofilled jsonb, p_hash text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if not exists (select 1 from procurement_plan_item where id = p_item and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_key not in ('purchase_request','need_definition','estimate_sheet','bid_register','bid_comparison','committee_minutes','bidder_notification')
     or p_format not in ('html','docx','xlsx') or btrim(coalesce(p_version,'')) = ''
     or jsonb_typeof(coalesce(p_sources,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_autofilled,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_sources,'[]'::jsonb)) > 200 or jsonb_array_length(coalesce(p_autofilled,'[]'::jsonb)) > 200 then
    raise exception 'bad_input' using errcode = '22023';
  end if;
  insert into procurement_document (municipality_id, plan_item_id, template_key, template_version, format, source_refs, autofilled, content_hash, is_demo, generated_by)
  values (m, p_item, p_key, left(btrim(p_version),20), p_format, coalesce(p_sources,'[]'::jsonb), coalesce(p_autofilled,'[]'::jsonb), nullif(p_hash,''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (m, auth.uid(), 'procurement.document_generated', 'procurement_document', i::text, jsonb_build_object('item', p_item, 'template', p_key, 'version', p_version, 'format', p_format));
  return i;
end $$;

-- 2) Plan item <-> municipal_decision link (the decision itself is created by the EXISTING decision_builder_create; nothing is duplicated) --
create table if not exists public.procurement_plan_decision (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  plan_item_id uuid not null references public.procurement_plan_item(id) on delete cascade,
  decision_id uuid not null unique references public.municipal_decision(id) on delete cascade,
  template_version_id uuid references public.decision_template_version(id) on delete restrict,
  is_demo boolean not null default false,
  linked_by uuid references auth.users(id),
  linked_at timestamptz not null default now());
create index if not exists procurement_plan_decision_item on public.procurement_plan_decision (plan_item_id);
alter table public.procurement_plan_decision enable row level security;
drop policy if exists procurement_plan_decision_staff_read on public.procurement_plan_decision;
create policy procurement_plan_decision_staff_read on public.procurement_plan_decision for select to authenticated
  using (is_staff(municipality_id, array['mayor','admin']::staff_role[]) and (is_demo or not is_demo_staff()));

-- Creates a draft decision from a procurement-domain template (through decision_builder_create, which keeps its own checks:
-- template approved or pending legal review only) and links it to the plan item. 'no_matching_template' when the chosen template is not in the procurement domain.
create or replace function public.procurement_plan_create_decision(p_item uuid, p_version uuid, p_session uuid default null, p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); it procurement_plan_item%rowtype; v decision_template_version%rowtype; d uuid;
begin
  select * into it from procurement_plan_item where id = p_item and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v from decision_template_version where id = p_version;
  if not found or v.domain <> 'procurement' then raise exception 'no_matching_template' using errcode = '22023'; end if;
  d := decision_builder_create(p_version, p_session, left(v.title_ar || ' — ' || it.title, 300), coalesce(p_data,'{}'::jsonb));
  insert into procurement_plan_decision (municipality_id, plan_item_id, decision_id, template_version_id, is_demo, linked_by)
  values (m, p_item, d, p_version, is_demo_staff(), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (m, auth.uid(), 'procurement.decision_draft_linked', 'procurement_plan_item', p_item::text, jsonb_build_object('decision', d, 'template', v.template_id, 'version', v.version));
  return d;
end $$;

revoke all on function public.procurement_document_record(uuid,text,text,text,jsonb,jsonb,text), public.procurement_plan_create_decision(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.procurement_document_record(uuid,text,text,text,jsonb,jsonb,text), public.procurement_plan_create_decision(uuid,uuid,uuid,jsonb) to authenticated;
