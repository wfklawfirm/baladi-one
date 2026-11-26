-- 0044 (DRAFT — NOT APPLIED): data-driven per-method procurement workflow (state machine). Idempotent. Depends on 0024, 0040, 0042.
-- Replaces the single linear 16-stage model for NEW files; the old procurement_stage_evidence / contract file page are untouched.
-- NO legal content here: no deadlines, thresholds, bidder counts, standstill days or article numbers. Stages are purely STRUCTURAL / PROCEDURAL names,
-- every seeded row is review_status='pending_review'; legal_source_id / provision_id stay NULL until a reviewer links a verified source.
-- Definition tables are read-only to staff (changed only by migration / reviewed data load). File state is written ONLY through SECURITY DEFINER RPCs.

-- 1) Definitions ------------------------------------------------------------------------------------------------------------
create table if not exists public.procurement_workflow (
  id uuid primary key default gen_random_uuid(),
  method text not null unique check (method in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework')),
  label_ar text not null,
  review_status text not null default 'pending_review' check (review_status in ('pending_review','verified','rejected','superseded')),
  created_at timestamptz not null default now());

create table if not exists public.procurement_workflow_stage (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.procurement_workflow(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label_ar text not null check (btrim(label_ar) <> ''),
  ord int not null check (ord > 0),
  required boolean not null default true,
  conditional_on text,                       -- free-text human condition; NULL = unconditional
  who_ar text, why_ar text, document_ar text, -- "ما الإجراء التالي؟" texts (procedural wording only)
  legal_source_id uuid references public.procurement_legal_source(id),
  provision_id uuid references public.procurement_provision(id),
  review_status text not null default 'pending_review' check (review_status in ('pending_review','verified','rejected','superseded')),
  unique (workflow_id, key), unique (workflow_id, ord));

create table if not exists public.procurement_workflow_transition (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.procurement_workflow(id) on delete cascade,
  from_key text not null, to_key text not null,
  kind text not null default 'forward' check (kind in ('forward','return')),
  guard text check (guard is null or guard in ('current_complete','reason_required')),   -- vocabulary interpreted by the RPCs
  unique (workflow_id, from_key, to_key, kind),
  foreign key (workflow_id, from_key) references public.procurement_workflow_stage (workflow_id, key) on delete cascade,
  foreign key (workflow_id, to_key) references public.procurement_workflow_stage (workflow_id, key) on delete cascade);

-- 2) Per-file state, history, checklist -------------------------------------------------------------------------------------
create table if not exists public.procurement_file_state (
  plan_item_id uuid primary key references public.procurement_plan_item(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  workflow_id uuid not null references public.procurement_workflow(id),
  current_stage_key text not null,
  status text not null default 'active' check (status in ('active','cancelled','completed')),
  cycle int not null default 1 check (cycle >= 1),
  is_demo boolean not null default false,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (workflow_id, current_stage_key) references public.procurement_workflow_stage (workflow_id, key));

create table if not exists public.procurement_file_history (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid not null references public.procurement_plan_item(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  cycle int not null default 1,
  action text not null check (action in ('start','advance','return','cancel','restart','finish')),
  from_key text, to_key text, note text,
  is_demo boolean not null default false,
  actor uuid references auth.users(id), at timestamptz not null default now());
create index if not exists procurement_file_history_item on public.procurement_file_history (plan_item_id, at);

create table if not exists public.procurement_file_check (
  plan_item_id uuid not null references public.procurement_plan_item(id) on delete cascade,
  cycle int not null default 1,
  stage_key text not null,
  municipality_id uuid not null references public.municipality(id),
  status text not null check (status in ('complete','needs_completion','awaiting_approval','not_yet_due','overdue','not_applicable','needs_legal_review')),
  evidence_ref text, note text,
  due_on date,                               -- optional, entered by staff; never derived from law
  is_demo boolean not null default false,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  primary key (plan_item_id, cycle, stage_key),
  check (status <> 'complete' or btrim(coalesce(evidence_ref,'')) <> ''),            -- completion requires evidence, not a bare tick
  check (status <> 'not_applicable' or btrim(coalesce(note,'')) <> ''));

alter table public.procurement_workflow enable row level security;
alter table public.procurement_workflow_stage enable row level security;
alter table public.procurement_workflow_transition enable row level security;
alter table public.procurement_file_state enable row level security;
alter table public.procurement_file_history enable row level security;
alter table public.procurement_file_check enable row level security;
drop policy if exists procurement_workflow_read on public.procurement_workflow;
drop policy if exists procurement_workflow_stage_read on public.procurement_workflow_stage;
drop policy if exists procurement_workflow_transition_read on public.procurement_workflow_transition;
drop policy if exists procurement_file_state_staff_read on public.procurement_file_state;
drop policy if exists procurement_file_history_staff_read on public.procurement_file_history;
drop policy if exists procurement_file_check_staff_read on public.procurement_file_check;
create policy procurement_workflow_read on public.procurement_workflow for select to authenticated using (true);
create policy procurement_workflow_stage_read on public.procurement_workflow_stage for select to authenticated using (true);
create policy procurement_workflow_transition_read on public.procurement_workflow_transition for select to authenticated using (true);
create policy procurement_file_state_staff_read on public.procurement_file_state for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_file_history_staff_read on public.procurement_file_history for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
create policy procurement_file_check_staff_read on public.procurement_file_check for select to authenticated using (is_staff(municipality_id) and (is_demo or not is_demo_staff()));
-- no insert/update/delete policies anywhere: writes only through the RPCs below (history is append-only)

-- 3) Seed: structural stages only, all pending_review ------------------------------------------------------------------------
-- row format: key|label|required(1/0)|conditional_on|who|why|document
do $$
declare
  head text[] := array[
    'need|تحديد الحاجة|1||الجهة الطالبة / رئيس البلدية|توثيق سبب الشراء قبل أي إجراء|مذكرة الحاجة',
    'estimate|التقدير|1||المصلحة المختصة|تحديد قيمة تقديرية يُبنى عليها القرار|جدول الكميات / تقدير الكلفة',
    'funding_check|التحقق من التمويل|1||المصلحة المالية|التأكد من وجود بند تمويل مناسب|إفادة مالية / بند الموازنة',
    'method_decision|قرار أسلوب الشراء|1||رئيس البلدية / المجلس|تثبيت الأسلوب المعتمد وتعليله|قرار أو مذكرة اختيار الأسلوب',
    'documents_prepared|إعداد المستندات|1||المصلحة المختصة|تجهيز مستندات الطلب قبل الانطلاق|دفتر الشروط / مستندات الطلب'];
  tail text[] := array[
    'award_decision|قرار الترسية / الاختيار|1||الجهة المخوّلة|تثبيت النتيجة بقرار موثَّق|قرار الترسية / محضر الاختيار',
    'contract|العقد|1||رئيس البلدية والمتعاقد|تثبيت الالتزامات المتبادلة|العقد الموقّع',
    'execution|التنفيذ|1||المتعاقد / مصلحة المتابعة|متابعة تنفيذ الالتزامات|تقارير المتابعة',
    'acceptance|الاستلام|1||جهة الاستلام|التحقق من مطابقة المنفَّذ|محضر الاستلام',
    'payment|الدفع|1||المصلحة المالية|تسوية المستحقات بعد الاستلام|مستندات الصرف',
    'closing|الإقفال|1||مسؤول الملف|ختم الملف وحفظه|فهرس الملف النهائي'];
  mid jsonb := jsonb_build_object(
    'open_tender', array['tender_notice|إعلان المناقصة|1||الجهة المعلنة|إتاحة الطلب للمتنافسين|نسخة الإعلان وإثبات نشره','bids_receipt|استلام العروض|1||أمانة الاستلام|حفظ العروض مختومة|سجل الاستلام','bids_opening|فتح العروض|1||لجنة الفتح|تسجيل محتوى العروض عند فتحها|محضر الفتح','evaluation|تقييم العروض|1||لجنة التقييم|مقارنة العروض بمعايير موثَّقة|تقرير التقييم'],
    'two_stage', array['stage_one_notice|إعلان المرحلة الأولى|1||الجهة المعلنة|إتاحة الطلب للمتنافسين|نسخة الإعلان وإثبات نشره','stage_one_receipt|استلام العروض الفنية|1||أمانة الاستلام|حفظ العروض مختومة|سجل الاستلام','stage_one_review|مراجعة العروض الفنية|1||لجنة التقييم|فحص العروض الفنية|تقرير المرحلة الأولى','stage_two_invitation|دعوة المرحلة الثانية|1||الجهة المعلنة|دعوة المقبولين فنيًا للمرحلة التالية|كتب الدعوة','stage_two_receipt|استلام العروض المالية|1||أمانة الاستلام|حفظ العروض المالية مختومة|سجل الاستلام','evaluation|تقييم العروض|1||لجنة التقييم|مقارنة العروض بمعايير موثَّقة|تقرير التقييم'],
    'quotations', array['quotation_request|طلب عروض الأسعار|1||المصلحة المختصة|توجيه الطلب إلى المتنافسين|نسخة الطلب وسجل المدعوّين','quotation_receipt|استلام العروض|1||أمانة الاستلام|حفظ العروض الواردة|سجل الاستلام','quotation_comparison|مقارنة العروض|1||لجنة / مسؤول الملف|مقارنة موثَّقة بين العروض|جدول المقارنة'],
    'proposals', array['proposals_request|طلب العروض|1||المصلحة المختصة|دعوة مقدمي العروض|نسخة الطلب','proposals_receipt|استلام العروض|1||أمانة الاستلام|حفظ العروض الواردة|سجل الاستلام','proposals_evaluation|تقييم العروض|1||لجنة التقييم|تقييم موثَّق للعروض|تقرير التقييم'],
    'negotiated', array['supplier_invitation|دعوة الطرف المتعاقد|1||المصلحة المختصة|توجيه الدعوة وتوثيقها|كتاب الدعوة','negotiation|التفاوض|1||الجهة المخوّلة|التوصل إلى شروط متفق عليها|محضر التفاوض','negotiation_record|توثيق نتيجة التفاوض|1||مسؤول الملف|حفظ الشروط المتفق عليها|وثيقة الاتفاق'],
    'invoice', array['invoice_obtained|الحصول على الفاتورة / العرض|1||المصلحة المختصة|توثيق السعر المعروض|الفاتورة أو عرض السعر','invoice_review|مراجعة الفاتورة|0|عند الحاجة وفق تقدير المصلحة المختصة|المصلحة المختصة|مطابقة الفاتورة للحاجة|ملاحظات المراجعة'],
    'framework', array['framework_setup|إعداد الاتفاقية الإطارية|1||الجهة المخوّلة|تثبيت شروط الاتفاقية العامة|وثيقة الاتفاقية','call_off|طلب التنفيذ ضمن الاتفاقية|1||المصلحة المختصة|إصدار الطلب المحدَّد|أمر / طلب التنفيذ']);
  m text; wid uuid; rows text[]; r text[]; i int; n int; lbl jsonb := jsonb_build_object(
    'open_tender','مناقصة عامة','two_stage','مناقصة على مرحلتين','quotations','استدراج عروض أسعار','proposals','طلب عروض (استشارات)','negotiated','اتفاق رضائي','invoice','شراء بالفاتورة','framework','اتفاقية إطارية');
begin
  foreach m in array array['open_tender','two_stage','quotations','proposals','negotiated','invoice','framework'] loop
    insert into procurement_workflow (method, label_ar) values (m, lbl->>m) on conflict (method) do nothing;
    select id into wid from procurement_workflow where method = m;
    if exists (select 1 from procurement_workflow_stage where workflow_id = wid) then continue; end if;   -- never overwrite reviewed data
    rows := head || array(select jsonb_array_elements_text(mid->m)) || tail;
    n := array_length(rows, 1);
    for i in 1..n loop
      insert into procurement_workflow_stage (workflow_id, key, label_ar, ord, required, conditional_on, who_ar, why_ar, document_ar)
      values (wid, split_part(rows[i],'|',1), split_part(rows[i],'|',2), i, split_part(rows[i],'|',3) = '1', nullif(split_part(rows[i],'|',4),''), nullif(split_part(rows[i],'|',5),''), nullif(split_part(rows[i],'|',6),''), nullif(split_part(rows[i],'|',7),''));
    end loop;
    -- forward: consecutive, plus a skip edge over every non-required stage; return: one step back
    insert into procurement_workflow_transition (workflow_id, from_key, to_key, kind, guard)
      select wid, a.key, b.key, 'forward', 'current_complete' from procurement_workflow_stage a join procurement_workflow_stage b on b.workflow_id = a.workflow_id and b.ord = a.ord + 1 where a.workflow_id = wid
      on conflict do nothing;
    insert into procurement_workflow_transition (workflow_id, from_key, to_key, kind, guard)
      select wid, a.key, c.key, 'forward', 'current_complete' from procurement_workflow_stage a
        join procurement_workflow_stage b on b.workflow_id = a.workflow_id and b.ord = a.ord + 1 and not b.required
        join procurement_workflow_stage c on c.workflow_id = a.workflow_id and c.ord = a.ord + 2 where a.workflow_id = wid
      on conflict do nothing;
    insert into procurement_workflow_transition (workflow_id, from_key, to_key, kind, guard)
      select wid, b.key, a.key, 'return', 'reason_required' from procurement_workflow_stage a join procurement_workflow_stage b on b.workflow_id = a.workflow_id and b.ord = a.ord + 1 where a.workflow_id = wid
      on conflict do nothing;
  end loop;
end $$;

-- 4) RPCs: every state change is audited; transitions not in the table are refused -------------------------------------------
create or replace function public.procurement_file_start(p_item uuid, p_method text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); pm text; wid uuid; first_key text;
begin
  select planned_method into pm from procurement_plan_item where id = p_item and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  pm := coalesce(nullif(p_method,''), pm);
  if pm is null then raise exception 'method_required' using errcode = '22023'; end if;
  select id into wid from procurement_workflow where method = pm;
  if wid is null then raise exception 'bad_method' using errcode = '22023'; end if;
  if exists (select 1 from procurement_file_state where plan_item_id = p_item) then raise exception 'already_started' using errcode = '22023'; end if;
  select key into first_key from procurement_workflow_stage where workflow_id = wid order by ord limit 1;
  insert into procurement_file_state (plan_item_id, municipality_id, workflow_id, current_stage_key, is_demo, updated_by) values (p_item, m, wid, first_key, is_demo_staff(), auth.uid());
  insert into procurement_file_history (plan_item_id, municipality_id, action, to_key, is_demo, actor) values (p_item, m, 'start', first_key, is_demo_staff(), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.file_started', 'procurement_plan_item', p_item::text, jsonb_build_object('method', pm));
end $$;

create or replace function public.procurement_file_check_set(p_item uuid, p_stage text, p_status text, p_evidence text default null, p_note text default null, p_due date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fs record; st record;
begin
  select * into fs from procurement_file_state where plan_item_id = p_item and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fs.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  select * into st from procurement_workflow_stage where workflow_id = fs.workflow_id and key = p_stage;
  if not found then raise exception 'bad_stage' using errcode = '22023'; end if;
  if p_status not in ('complete','needs_completion','awaiting_approval','not_yet_due','overdue','not_applicable','needs_legal_review') then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_status = 'complete' and btrim(coalesce(p_evidence,'')) = '' then raise exception 'evidence_required' using errcode = '22023'; end if;
  if p_status = 'not_applicable' and (btrim(coalesce(p_note,'')) = '' or (st.required and st.conditional_on is null)) then raise exception 'not_applicable_refused' using errcode = '22023'; end if;
  insert into procurement_file_check (plan_item_id, cycle, stage_key, municipality_id, status, evidence_ref, note, due_on, is_demo, updated_by)
  values (p_item, fs.cycle, p_stage, m, p_status, nullif(left(btrim(coalesce(p_evidence,'')),1000),''), nullif(left(btrim(coalesce(p_note,'')),1000),''), p_due, is_demo_staff(), auth.uid())
  on conflict (plan_item_id, cycle, stage_key) do update set status = excluded.status, evidence_ref = excluded.evidence_ref, note = excluded.note, due_on = excluded.due_on, updated_by = excluded.updated_by, updated_at = now();
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.file_check_set', 'procurement_plan_item', p_item::text, jsonb_build_object('stage', p_stage, 'status', p_status));
end $$;

create or replace function public.procurement_file_advance(p_item uuid, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fs record; g text;
begin
  select * into fs from procurement_file_state where plan_item_id = p_item and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fs.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  select guard into g from procurement_workflow_transition where workflow_id = fs.workflow_id and from_key = fs.current_stage_key and to_key = p_to and kind = 'forward';
  if not found then raise exception 'transition_not_allowed' using errcode = '22023'; end if;
  if g = 'current_complete' and not exists (select 1 from procurement_file_check where plan_item_id = p_item and cycle = fs.cycle and stage_key = fs.current_stage_key and status in ('complete','not_applicable')) then
    raise exception 'stage_incomplete' using errcode = '22023'; end if;
  update procurement_file_state set current_stage_key = p_to, updated_at = now(), updated_by = auth.uid() where plan_item_id = p_item;
  insert into procurement_file_history (plan_item_id, municipality_id, cycle, action, from_key, to_key, note, is_demo, actor) values (p_item, m, fs.cycle, 'advance', fs.current_stage_key, p_to, nullif(left(btrim(coalesce(p_note,'')),1000),''), fs.is_demo, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.file_advanced', 'procurement_plan_item', p_item::text, jsonb_build_object('from', fs.current_stage_key, 'to', p_to));
end $$;

create or replace function public.procurement_file_return(p_item uuid, p_to text, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fs record;
begin
  select * into fs from procurement_file_state where plan_item_id = p_item and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fs.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  if not exists (select 1 from procurement_workflow_transition where workflow_id = fs.workflow_id and from_key = fs.current_stage_key and to_key = p_to and kind = 'return') then raise exception 'transition_not_allowed' using errcode = '22023'; end if;
  update procurement_file_state set current_stage_key = p_to, updated_at = now(), updated_by = auth.uid() where plan_item_id = p_item;
  insert into procurement_file_history (plan_item_id, municipality_id, cycle, action, from_key, to_key, note, is_demo, actor) values (p_item, m, fs.cycle, 'return', fs.current_stage_key, p_to, left(btrim(p_reason),1000), fs.is_demo, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.file_returned', 'procurement_plan_item', p_item::text, jsonb_build_object('from', fs.current_stage_key, 'to', p_to));
end $$;

create or replace function public.procurement_file_finish(p_item uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fs record;
begin
  select * into fs from procurement_file_state where plan_item_id = p_item and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fs.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  if exists (select 1 from procurement_workflow_transition where workflow_id = fs.workflow_id and from_key = fs.current_stage_key and kind = 'forward') then raise exception 'transition_not_allowed' using errcode = '22023'; end if;
  if not exists (select 1 from procurement_file_check where plan_item_id = p_item and cycle = fs.cycle and stage_key = fs.current_stage_key and status in ('complete','not_applicable')) then raise exception 'stage_incomplete' using errcode = '22023'; end if;
  update procurement_file_state set status = 'completed', updated_at = now(), updated_by = auth.uid() where plan_item_id = p_item;
  insert into procurement_file_history (plan_item_id, municipality_id, cycle, action, from_key, is_demo, actor) values (p_item, m, fs.cycle, 'finish', fs.current_stage_key, fs.is_demo, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.file_finished', 'procurement_plan_item', p_item::text, '{}'::jsonb);
end $$;

create or replace function public.procurement_file_cancel(p_item uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fs record;
begin
  select * into fs from procurement_file_state where plan_item_id = p_item and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fs.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update procurement_file_state set status = 'cancelled', updated_at = now(), updated_by = auth.uid() where plan_item_id = p_item;
  insert into procurement_file_history (plan_item_id, municipality_id, cycle, action, from_key, note, is_demo, actor) values (p_item, m, fs.cycle, 'cancel', fs.current_stage_key, left(btrim(p_reason),1000), fs.is_demo, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.file_cancelled', 'procurement_plan_item', p_item::text, jsonb_build_object('at_stage', fs.current_stage_key));
end $$;

create or replace function public.procurement_file_restart(p_item uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); fs record; first_key text;
begin
  select * into fs from procurement_file_state where plan_item_id = p_item and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fs.status <> 'cancelled' then raise exception 'not_cancelled' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  select key into first_key from procurement_workflow_stage where workflow_id = fs.workflow_id order by ord limit 1;
  update procurement_file_state set status = 'active', cycle = fs.cycle + 1, current_stage_key = first_key, updated_at = now(), updated_by = auth.uid() where plan_item_id = p_item;   -- history and old-cycle checks are kept
  insert into procurement_file_history (plan_item_id, municipality_id, cycle, action, from_key, to_key, note, is_demo, actor) values (p_item, m, fs.cycle + 1, 'restart', fs.current_stage_key, first_key, left(btrim(p_reason),1000), fs.is_demo, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.file_restarted', 'procurement_plan_item', p_item::text, jsonb_build_object('cycle', fs.cycle + 1));
end $$;

revoke all on function public.procurement_file_start(uuid,text), public.procurement_file_check_set(uuid,text,text,text,text,date), public.procurement_file_advance(uuid,text,text), public.procurement_file_return(uuid,text,text), public.procurement_file_finish(uuid), public.procurement_file_cancel(uuid,text), public.procurement_file_restart(uuid,text) from public, anon;
grant execute on function public.procurement_file_start(uuid,text), public.procurement_file_check_set(uuid,text,text,text,text,date), public.procurement_file_advance(uuid,text,text), public.procurement_file_return(uuid,text,text), public.procurement_file_finish(uuid), public.procurement_file_cancel(uuid,text), public.procurement_file_restart(uuid,text) to authenticated;
