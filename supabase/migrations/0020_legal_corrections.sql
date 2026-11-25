-- Corrections after verification against the municipal act text (Decree-Law 118/1977) and the procurement-law guide.
-- Art.32 monthly meeting; art.33 written summons >= 3 days (may be shortened if urgent); art.34 quorum (> half; second meeting >= 24h later, one third);
-- art.58 send within 8 days; art.63 tacit approval one month from registration, EXCLUDING planning, budget, credit transfers and loans
--   (for decisions subject to the audit bureau the month runs from notice of its approval); Law 244/2021: standstill = 10 WORKING days from publication of the winning-bid acceptance; an objection blocks signing until decided.
-- Rules are stored in legal_rule as 'pending_review' until a lawyer approves them. No monetary thresholds are hard-coded.

-- 1) Decisions: credit transfers category, audit-bureau flags
alter table public.municipal_decision drop constraint if exists municipal_decision_category_check;
alter table public.municipal_decision add constraint municipal_decision_category_check
  check (category in ('general','budget','accounts','planning','loan','transfer','tax','contract','property','other'));
alter table public.municipal_decision
  add column if not exists audit_bureau_required boolean not null default false,
  add column if not exists audit_bureau_notice_on date,
  add column if not exists tacit_notified_on date;

drop function if exists public.decision_set_review(uuid, text, text, date, date, date, text);
create or replace function public.decision_set_review(p_id uuid, p_category text, p_level text, p_sent date default null, p_received date default null, p_validated date default null, p_note text default null,
  p_audit_required boolean default false, p_audit_notice date default null, p_tacit_notified date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_category not in ('general','budget','accounts','planning','loan','transfer','tax','contract','property','other') or p_level not in ('none','qaimaqam','mohafez','minister') then raise exception 'bad_input' using errcode = '22023'; end if;
  update municipal_decision set category = p_category, validation_level = p_level, sent_on = p_sent, received_on = p_received, validated_on = p_validated,
    audit_bureau_required = coalesce(p_audit_required,false), audit_bureau_notice_on = p_audit_notice, tacit_notified_on = p_tacit_notified,
    validation_note = nullif(left(btrim(coalesce(p_note,'')),1000),''), updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into decision_event (decision_id, municipality_id, kind, to_value, note, actor) values (p_id, m, 'note', 'review', 'تحديث بيانات الإرسال والتصديق', auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.review_updated', 'municipal_decision', p_id::text, jsonb_build_object('level', p_level, 'category', p_category));
end $$;

-- Tacit approval (art.63): one month from registration with the authority (or from notice of audit-bureau approval when it applies);
-- not available for planning, budget, credit transfers, loans; the mayor must notify the authority (tacit_notified_on). Nothing becomes effective automatically.
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

-- 2) Working-days calendar (Mon-Fri; holidays loaded by the municipality/legal reviewer — none are invented here)
create table if not exists public.legal_holiday (
  day date primary key, name_ar text not null, source text, verified boolean not null default false);
alter table public.legal_holiday enable row level security;
drop policy if exists legal_holiday_read on public.legal_holiday;
create policy legal_holiday_read on public.legal_holiday for select to authenticated using (true);

create or replace function public._add_working_days(p_from date, p_n int) returns date language plpgsql stable set search_path to 'public' as $$
declare d date := p_from; k int := 0;
begin
  while k < p_n loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from legal_holiday h where h.day = d) then k := k + 1; end if;
  end loop;
  return d;
end $$;
grant execute on function public._add_working_days(date, int) to authenticated;

-- 3) Contracts: objection tracking; standstill in working days; unverified assumptions removed from the hard gate
alter table public.contract
  add column if not exists objection_pending boolean not null default false,
  add column if not exists objection_resolved_on date;

create or replace function public.contract_set_objection(p_id uuid, p_pending boolean, p_resolved date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update contract set objection_pending = coalesce(p_pending,false), objection_resolved_on = case when coalesce(p_pending,false) then null else p_resolved end, updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.objection_set', 'contract', p_id::text, jsonb_build_object('pending', p_pending, 'resolved', p_resolved));
end $$;

create or replace function public.contract_set_status(p_id uuid, p_status text, p_note text default null, p_date date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); c contract%rowtype;
begin
  if p_status is null or p_status not in ('draft','signed','active','completed','terminated','expired') then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into c from contract where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status = 'signed' and c.status = 'draft' then
    if p_date is null or p_date > current_date then raise exception 'sign_date_required' using errcode = '22023'; end if;
    if c.procurement_method is null then raise exception 'bad_method' using errcode = '22023'; end if;
    if c.objection_pending then raise exception 'objection_pending' using errcode = '22023'; end if;
    -- standstill: 10 working days from publication of the winning-bid acceptance (Law 244/2021), for competitive methods
    if c.procurement_method in ('open_tender','two_stage','proposals','framework','quotations') and (c.award_notice_on is null or p_date <= public._add_working_days(c.award_notice_on, 10)) then raise exception 'standstill' using errcode = '22023'; end if;
    if c.procurement_method = 'negotiated' and btrim(coalesce(c.justification,'')) = '' then raise exception 'justification_required' using errcode = '22023'; end if;
  end if;
  update contract set status = p_status, signed_on = case when p_status = 'signed' and c.status = 'draft' then p_date else signed_on end,
    notes = case when nullif(btrim(coalesce(p_note,'')),'') is null then notes else left(coalesce(notes || E'\n', '') || btrim(p_note), 5000) end, updated_at = now() where id = p_id;
  if c.project_id is not null then insert into project_update (project_id, municipality_id, kind, from_value, to_value, note, actor) values (c.project_id, m, 'contract', c.status, p_status, left(c.contractor,300), auth.uid()); end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'contract.status_changed', 'contract', p_id::text, jsonb_build_object('from', c.status, 'to', p_status));
end $$;

-- 4) Central legal rules registry (read-only for staff; maintained by migrations after legal review)
create table if not exists public.legal_rule (
  rule_id text primary key, instrument text not null, instrument_no text, article text, topic text not null,
  summary_ar text not null, conditions_ar text, exceptions_ar text, deadline_ar text, required_docs_ar text,
  source_url text, source_kind text not null default 'secondary' check (source_kind in ('official','secondary')),
  enforcement text not null check (enforcement in ('BLOCK','WARNING','INFORMATION')),
  review_status text not null default 'pending_review' check (review_status in ('verified','pending_review','superseded','repealed','not_applicable')),
  original_text_loaded boolean not null default false, version int not null default 1, last_checked_on date, workflow text);
alter table public.legal_rule enable row level security;
drop policy if exists legal_rule_read on public.legal_rule;
create policy legal_rule_read on public.legal_rule for select to authenticated using (true);

insert into public.legal_rule (rule_id, instrument, instrument_no, article, topic, summary_ar, conditions_ar, exceptions_ar, deadline_ar, required_docs_ar, source_url, enforcement, last_checked_on, workflow) values
('MUN-118-32','مرسوم اشتراعي','118/1977','32','اجتماع المجلس','يجتمع المجلس البلدي مرة في الشهر على الأقل بدعوة من الرئيس، وكلما اقتضت الحاجة؛ وعلى الرئيس الدعوة إذا طلب ذلك المحافظ أو القائمقام أو أكثرية الأعضاء.',null,null,'شهريًا',null,'https://www.mohamah.net/law/?p=40069','INFORMATION','2026-11-25','council'),
('MUN-118-33','مرسوم اشتراعي','118/1977','33','الدعوة إلى الجلسة','تكون الدعوة خطية وتُرسل قبل ثلاثة أيام على الأقل من الجلسة إلى مقر إقامة العضو أو العنوان الذي اختاره.','دعوة خطية','يجوز تقصير المهلة عند الضرورة، وللمجلس أن يقرر متابعة الجلسة أو تأجيلها','3 أيام على الأقل','إثبات التبليغ','https://www.mohamah.net/law/?p=40069','WARNING','2026-11-25','council'),
('MUN-118-34','مرسوم اشتراعي','118/1977','34','النصاب','النصاب القانوني أكثر من نصف الأعضاء؛ إن لم يكتمل تُوجَّه دعوة ثانية بعد 24 ساعة على الأقل ويكفي حضور ثلث الأعضاء، على أن تتضمن الدعوة الثانية تلخيصًا لهذه القاعدة.','عدد أعضاء المجلس الحالي','لا حاجة لدعوة ثانية إن كان الغياب بسبب مصلحة شخصية للأعضاء الغائبين','24 ساعة بين الجلستين',null,'https://www.mohamah.net/law/?p=40069','WARNING','2026-11-25','council'),
('MUN-118-58','مرسوم اشتراعي','118/1977','58','إرسال القرارات','يرسل الرئيس قرارات المجلس مباشرة إلى سلطة الرقابة المختصة خلال ثمانية أيام من صدورها مع نسخة إلى المراجع التسلسلية.',null,null,'8 أيام من صدور القرار','إثبات الإرسال','https://www.mohamah.net/law/?p=40069','WARNING','2026-11-25','decisions'),
('MUN-118-59-62','مرسوم اشتراعي','118/1977','59–62','القرارات الخاضعة للتصديق وسلطته','تحدد المواد قرارات لا تحتاج تصديقًا (م.59)، وقرارات تصدَّق من القائمقام (م.60) أو المحافظ (م.61) أو وزير الداخلية (م.62)؛ والمواد 59–61 معدّلة بقانون 25/4/1999 والسقوف المالية فيها تحتاج تحققًا من النص النافذ.','فئة القرار وقيمته',null,null,null,'https://www.mohamah.net/law/?p=40069','INFORMATION','2026-11-25','decisions'),
('MUN-118-63','مرسوم اشتراعي','118/1977','63','التصديق الحكمي','تُعدّ القرارات الخاضعة للتصديق مصدَّقة إذا لم تبتّ السلطة خلال شهر من تسجيل القرار لديها، وعلى الرئيس إبلاغها بأن القرار صار مصدَّقًا. لا ينطبق على التخطيط والموازنة ونقل الاعتمادات والقروض. وللقرارات الخاضعة لديوان المحاسبة تسري المهلة من إبلاغ موافقته.','تسجيل القرار لدى سلطة الرقابة','التخطيط، الموازنة، نقل الاعتمادات، القروض','شهر من التسجيل','إثبات التسجيل والإبلاغ','https://www.mohamah.net/law/?p=40069','BLOCK','2026-11-25','decisions'),
('MUN-118-64','مرسوم اشتراعي','118/1977','64','شكل التصديق','يكون التصديق خطيًا ويجوز الطعن فيه أمام مجلس شورى الدولة.',null,null,null,null,'https://www.mohamah.net/law/?p=40069','INFORMATION','2026-11-25','decisions'),
('PPL-244-STANDSTILL','قانون الشراء العام','244/2021','فترة التجميد','فترة التجميد قبل توقيع العقد','فترة التجميد عشرة أيام عمل تبدأ من نشر قبول العرض الفائز؛ لا يجوز توقيع العقد قبل انتهائها، ولا قبل البت في أي اعتراض مقدَّم. (دليل معهد باسل فليحان يذكر بدايتها أحيانًا من تبليغ الفائز: يلزم حسم ذلك قانونيًا.)','نشر قبول العرض الفائز','وجود اعتراض يمنع التوقيع حتى البت','10 أيام عمل','مستند نشر قبول العرض','https://institutdesfinances.gov.lb/sites/default/files/2025-06/PP-questions-answers-guide.pdf','BLOCK','2026-11-25','procurement'),
('PPL-244-OBJ','قانون الشراء العام','244/2021','الاعتراضات','هيئة الاعتراضات','لكل صاحب صفة ومصلحة الاعتراض أمام هيئة الاعتراضات، وتبتّ خلال 20 يوم عمل كحد أقصى ويمكنها تجميد الإجراءات.',null,null,'20 يوم عمل',null,'https://institutdesfinances.gov.lb/sites/default/files/2025-06/PP-questions-answers-guide.pdf','INFORMATION','2026-11-25','procurement'),
('PPL-244-29','قانون الشراء العام','244/2021','29','تعديل قيمة العقد','البدلات ثابتة مبدئيًا ويجوز تعديل القيمة استثناءً ضمن ضوابط ونسب في المادة 29؛ لم تُحمَّل النسبة المنطبقة في النظام ويلزم الرجوع إلى النص.',null,null,null,null,'https://institutdesfinances.gov.lb/sites/default/files/2025-06/PP-questions-answers-guide.pdf','WARNING','2026-11-25','procurement')
on conflict (rule_id) do nothing;
