// Pure builder of the "full audit file" (الملف الرقابي) for one procurement plan item. No I/O, no legal values.
// Two variants: internal (everything the reader may see) and shareable (no bid financials, no conflict declarations, no actor ids / raw event details).
import { METHOD } from "@/lib/council";
import { COMMITTEE_KIND, COMMITTEE_RESULT, PLAN_STATUS, PUB_KIND, buildFile, publicationComplete } from "@/lib/procurement";

export type Variant = "internal" | "shareable";
export const ND = "غير مسجَّل";
export const SEALED = "العروض مختومة: لم يحل موعد الفتح المسجَّل، فلا تُعرض ولا تدخل الملف";

export type AItem = { id: string; fiscal_year: number; title: string; need_description: string | null; estimated_value: number | string | null; currency: string; budget_line_id: string | null; funding_note: string | null; planned_method: string | null; responsible: string | null; planned_publish_on: string | null; planned_award_on: string | null; planned_start_on: string | null; status: string; status_note: string | null; contract_id: string | null; bids_open_on: string | null };
export type AContract = { id: string; contractor: string; subject: string; value: number | string | null; currency: string; status: string; procurement_method: string | null; published_on: string | null; award_notice_on: string | null; signed_on: string | null; decision_id: string | null; start_on?: string | null; objection_pending?: boolean | null; objection_resolved_on?: string | null };
export type ADecision = { id: string; decision_no: string; year: number; title: string; decided_on: string | null; legal_status: string };
export type AMember = { name: string; role_ar: string | null; declaration_on: string | null; has_conflict: boolean | null; declaration_note: string | null };
export type ACommittee = { id: string; kind: string; formed_on: string | null; report_text: string | null; report_on: string | null; result: string; result_on: string | null; members: AMember[] };
export type APub = { kind: string; platform_url: string | null; reference_no: string | null; published_on: string | null; document_ref: string | null; proof_ref: string | null };
export type ABid = { supplier: string; received_on: string; currency: string; total_value: number | string; delivery_days: number | null; warranty_note: string | null; technical_compliant: boolean | null; evaluation_note: string | null };
export type AEvent = { id: number | string; action: string; entity: string; created_at: string; actor: string | null; detail: unknown };
export type AStageEv = { stage: string; evidence_ref: string; evidence_on: string | null };

export type AuditInput = {
  variant: Variant; generatedAt: string; municipality: string;
  item: AItem; budgetLine: { code: string; title_ar: string } | null; contract: AContract | null; decision: ADecision | null;
  committees: ACommittee[]; publications: APub[]; stageEvidence: AStageEv[];
  bids: { rows: ABid[]; count: number | null };
  events: AEvent[];
  /** Human labels of the sources that could not be read (table missing / not permitted). Reported honestly, never as 'empty'. */
  unavailable: string[];
};

export type Section = { id: string; title: string; kv?: [string, string][]; table?: { head: string[]; rows: string[][] }; notes?: string[] };
export type Missing = { section: string; text: string };
export type AuditPack = { variant: Variant; title: string; cover: [string, string][]; sections: Section[]; missing: Missing[]; disclaimers: string[] };

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
export const fmtMoney = (v: number | string | null | undefined, c: string) => (v === null || v === undefined || v === "" ? ND : `${n(v).toLocaleString("en-US")} ${c === "LBP" ? "ل.ل." : c === "USD" ? "$" : c}`);
const t = (s: string | null | undefined) => (s && s.trim() ? s.trim() : ND);
const isOpened = (opensOn: string | null, now: string) => !!opensOn && new Date(opensOn).getTime() <= new Date(now).getTime();
const ACTION_AR: Record<string, string> = {
  "procurement.plan_added": "إضافة بند إلى الخطة", "procurement.plan_status": "تغيير حالة البند", "procurement.plan_linked": "ربط البند بعقد",
  "procurement.committee_added": "تشكيل لجنة", "procurement.member_added": "إضافة عضو إلى لجنة", "procurement.committee_report": "تسجيل تقرير/نتيجة لجنة",
  "procurement.publication_added": "تسجيل نشر رسمي", "procurement.bids_open_set": "تحديد موعد فتح العروض", "procurement.bid_received": "استلام عرض", "procurement.bid_evaluated": "تقييم عرض",
  "contract.created": "إنشاء عقد", "procurement.supplier_added": "إضافة مورّد",
};
const actionAr = (a: string) => ACTION_AR[a] ?? a;
const detailText = (d: unknown) => { try { const s = typeof d === "string" ? d : JSON.stringify(d ?? {}); return s === "{}" || s === "null" ? "—" : s.slice(0, 160); } catch { return "—"; } };

export function buildAuditPack(i: AuditInput): AuditPack {
  const share = i.variant === "shareable";
  const it = i.item, c = i.contract, now = i.generatedAt;
  const opened = isOpened(it.bids_open_on, now);
  const missing: Missing[] = [];
  const miss = (section: string, text: string) => missing.push({ section, text });
  for (const u of i.unavailable) miss("مصادر", `تعذّرت قراءة: ${u} (الجدول غير متاح أو غير مصرَّح به) — لا يعني ذلك أنه فارغ`);

  // ---- missing-record rules (facts about the file only; no legal conclusion) ----
  if (!it.need_description?.trim()) miss("الحاجة", "وصف الحاجة غير مسجَّل");
  if (n(it.estimated_value) <= 0) miss("التقدير", "الكلفة التقديرية غير مسجَّلة أو صفر");
  if (!it.budget_line_id && !it.funding_note?.trim()) miss("التمويل", "لا بند موازنة مربوط ولا ملاحظة تمويل");
  if (!it.planned_method) miss("البند", "أسلوب الشراء المخطَّط غير محدد");
  if (!c) miss("العقد", "لا عقد مربوط بالبند");
  if (c && !c.decision_id) miss("القرار", "لا قرار بلدي مربوط بالعقد");
  if (c && c.decision_id && !i.decision && !i.unavailable.includes("القرارات")) miss("القرار", "القرار المربوط غير ظاهر للقارئ (صلاحية أو حذف)");
  const award = i.committees.filter((x) => x.kind === "award"), acc = i.committees.filter((x) => x.kind === "acceptance");
  if (!award.length) miss("اللجان", "لا لجنة تلزيم مسجَّلة");
  for (const k of award) if (!k.report_text?.trim()) miss("اللجان", `لجنة التلزيم${k.formed_on ? ` (${k.formed_on})` : ""}: لا تقرير مسجَّل`);
  if (c && ["active", "completed"].includes(c.status) && !acc.some((k) => ["accepted", "accepted_reservations"].includes(k.result))) miss("اللجان", "لا محضر لجنة استلام بنتيجة إيجابية رغم أن حالة العقد ساري/منفَّذ");
  const noDecl = i.committees.flatMap((k) => k.members.filter((m) => !m.declaration_on || m.has_conflict === null).map((m) => ({ k, m })));
  if (share) { if (noDecl.length) miss("التصاريح", `${noDecl.length} عضو/أعضاء بلا تصريح تعارض مصالح مسجَّل كاملًا`); }
  else for (const { k, m } of noDecl) miss("التصاريح", `${m.name} (${COMMITTEE_KIND[k.kind] ?? k.kind}): تصريح تعارض المصالح غير مسجَّل كاملًا`);
  if (i.committees.some((k) => !k.members.length)) miss("التصاريح", "لجنة واحدة على الأقل بلا أعضاء مسجَّلين");
  if (!i.publications.some(publicationComplete)) miss("النشر", i.publications.length ? "سجلات النشر موجودة لكن لا سجل مكتمل (رابط + مرجع + تاريخ + إثبات)" : "لا سجل نشر رسمي");
  if (!it.bids_open_on) miss("العروض", "موعد فتح العروض غير محدد");
  else if (opened && i.bids.rows.length === 0 && !i.unavailable.includes("العروض")) miss("العروض", "فُتحت العروض ولا عروض مقروءة");
  if (opened) for (const b of i.bids.rows) if (b.technical_compliant === null) miss("التقييم", `عرض ${b.supplier}: لم يُسجَّل تقييم المطابقة الفنية`);
  if (c && !c.signed_on) miss("العقد", "تاريخ توقيع العقد غير مسجَّل");
  if (c && !c.award_notice_on) miss("العقد", "تاريخ إشعار قبول العرض غير مسجَّل");
  if (!i.events.length && !i.unavailable.includes("سجل التدقيق")) miss("التدقيق", "لا أحداث تدقيق مسجَّلة لهذا البند");

  // ---- sections ----
  const sections: Section[] = [];
  sections.push({ id: "need", title: "الحاجة", kv: [["وصف الحاجة", t(it.need_description)], ["الجهة المسؤولة", t(it.responsible)]] });
  sections.push({ id: "estimate", title: "التقدير", kv: [["الكلفة التقديرية", it.estimated_value === null ? ND : fmtMoney(it.estimated_value, it.currency)]], notes: ["قيمة تقديرية مستقلة عن قيمة العقد وعن أي مبلغ مدفوع؛ لا تُجمع معهما."] });
  sections.push({ id: "plan", title: "بند الخطة", kv: [
    ["السنة المالية", String(it.fiscal_year)], ["الحالة", PLAN_STATUS[it.status] ?? it.status], ["ملاحظة الحالة", t(it.status_note)],
    ["أسلوب الشراء المخطَّط", it.planned_method ? METHOD[it.planned_method] ?? it.planned_method : ND],
    ["النشر المخطَّط", t(it.planned_publish_on)], ["الترسية المخطَّطة", t(it.planned_award_on)], ["بدء التنفيذ المخطَّط", t(it.planned_start_on)]] });
  sections.push({ id: "funding", title: "التمويل", kv: [["بند الموازنة", i.budgetLine ? `${i.budgetLine.code} — ${i.budgetLine.title_ar}` : ND], ["ملاحظة التمويل", t(it.funding_note)]] });
  sections.push({ id: "decision", title: "القرار المربوط", kv: i.decision
    ? [["رقم القرار", `${i.decision.decision_no}/${i.decision.year}`], ["العنوان", i.decision.title], ["تاريخ القرار", t(i.decision.decided_on)], ["الحالة", i.decision.legal_status]]
    : [["القرار", c ? (c.decision_id ? "غير ظاهر للقارئ" : ND) : "لا عقد مربوط"]] });

  const cm: Section = { id: "committees", title: share ? "اللجان" : "اللجان وتصاريح تعارض المصالح" };
  if (!i.committees.length) cm.notes = [ND];
  else cm.table = share
    ? { head: ["اللجنة", "التشكيل", "الأعضاء", "النتيجة"], rows: i.committees.map((k) => [COMMITTEE_KIND[k.kind] ?? k.kind, t(k.formed_on), k.members.map((m) => m.role_ar ? `${m.name} (${m.role_ar})` : m.name).join("، ") || ND, `${COMMITTEE_RESULT[k.result] ?? k.result}${k.result_on ? ` · ${k.result_on}` : ""}`]) }
    : { head: ["اللجنة", "العضو", "الصفة", "تاريخ التصريح", "تعارض", "ملاحظة"], rows: i.committees.flatMap((k) => (k.members.length ? k.members : [null]).map((m) => [COMMITTEE_KIND[k.kind] ?? k.kind, m?.name ?? ND, t(m?.role_ar), t(m?.declaration_on), m ? (m.has_conflict === null ? ND : m.has_conflict ? "نعم" : "لا") : ND, t(m?.declaration_note)])) };
  sections.push(cm);

  if (opened) {
    sections.push({ id: "bids", title: "الموردون والعروض", notes: share ? ["نسخة قابلة للمشاركة: لا تُعرض أسعار العروض ولا ضماناتها."] : undefined,
      table: i.bids.rows.length ? (share
        ? { head: ["العارض", "تاريخ الاستلام", "المطابقة الفنية"], rows: i.bids.rows.map((b) => [b.supplier, b.received_on, b.technical_compliant === null ? ND : b.technical_compliant ? "مطابق" : "غير مطابق"]) }
        : { head: ["العارض", "الاستلام", "السعر", "التسليم (يوم)", "الضمان", "المطابقة الفنية"], rows: i.bids.rows.map((b) => [b.supplier, b.received_on, fmtMoney(b.total_value, b.currency), b.delivery_days === null ? ND : String(b.delivery_days), t(b.warranty_note), b.technical_compliant === null ? ND : b.technical_compliant ? "مطابق" : "غير مطابق"]) }) : undefined });
    if (!i.bids.rows.length) sections[sections.length - 1].notes = [...(sections[sections.length - 1].notes ?? []), ND];
    sections.push({ id: "evaluation", title: "ملاحظات التقييم", table: i.bids.rows.some((b) => b.evaluation_note) ? { head: ["العارض", "الملاحظة"], rows: i.bids.rows.filter((b) => b.evaluation_note).map((b) => [b.supplier, b.evaluation_note!]) } : undefined, notes: i.bids.rows.some((b) => b.evaluation_note) ? [`ترتيب الأسعار ليس اختيارًا للفائز؛ الاختيار من اختصاص اللجنة.`] : [ND] });
  } else {
    sections.push({ id: "bids", title: "الموردون والعروض", notes: [SEALED + (it.bids_open_on ? "" : " (لم يُحدَّد موعد الفتح)"), i.bids.count !== null ? `عدد العروض المستلمة: ${i.bids.count}` : "عدد العروض غير متاح"] });
  }

  sections.push({ id: "contract", title: "العقد وسجلات النشر", kv: c ? [
    ["المتعاقد", c.contractor], ["الموضوع", c.subject], ["قيمة العقد", fmtMoney(c.value, c.currency)], ["الحالة", c.status], ["أسلوب الشراء المسجَّل", c.procurement_method ? METHOD[c.procurement_method] ?? c.procurement_method : ND],
    ["تاريخ النشر", t(c.published_on)], ["إشعار قبول العرض", t(c.award_notice_on)], ["تاريخ التوقيع", t(c.signed_on)]] : [["العقد", ND]],
    table: i.publications.length ? { head: ["النوع", "المنصة", "المرجع", "تاريخ النشر", "الإثبات", "مكتمل"], rows: i.publications.map((p) => [PUB_KIND[p.kind] ?? p.kind, t(p.platform_url), t(p.reference_no), t(p.published_on), t(p.proof_ref), publicationComplete(p) ? "نعم" : "لا"]) } : undefined,
    notes: i.publications.length ? undefined : ["لا سجلات نشر رسمي."] });

  const stages = buildFile({
    contract: { procurement_method: c?.procurement_method ?? null, published_on: c?.published_on ?? null, award_notice_on: c?.award_notice_on ?? null, signed_on: c?.signed_on ?? null, status: c?.status ?? "draft", objection_pending: !!c?.objection_pending, objection_resolved_on: c?.objection_resolved_on ?? null, decision_id: c?.decision_id ?? null },
    manual: i.stageEvidence.map((s) => ({ stage: s.stage, evidence_ref: s.evidence_ref, evidence_on: s.evidence_on })),
    publications: i.publications, committees: i.committees.map((k) => ({ kind: k.kind, result: k.result, report_text: k.report_text, formed_on: k.formed_on })),
    plan: { budget_line_id: it.budget_line_id, estimated_value: it.estimated_value, funding_note: it.funding_note }, today: now.slice(0, 10) });
  sections.push({ id: "stages", title: "مراحل الملف", table: { head: ["المرحلة", "الحالة", "الدليل"], rows: stages.map((s) => [s.label, s.done ? "مسجَّلة" : ND, s.evidence ?? "—"]) }, notes: ["المراحل غير المسجَّلة ليست بالضرورة مخالفة: قد لا تنطبق على أسلوب الشراء المتبع."] });

  sections.push({ id: "audit", title: "سجل التدقيق", table: i.events.length ? (share
    ? { head: ["التاريخ", "الإجراء"], rows: i.events.map((e) => [e.created_at.slice(0, 16).replace("T", " "), actionAr(e.action)]) }
    : { head: ["التاريخ", "الإجراء", "الجهة", "المنفِّذ", "تفاصيل"], rows: i.events.map((e) => [e.created_at.slice(0, 16).replace("T", " "), actionAr(e.action), e.entity, e.actor ? e.actor.slice(0, 8) : "—", detailText(e.detail)]) }) : undefined, notes: i.events.length ? undefined : [ND] });

  return {
    variant: i.variant, title: it.title,
    cover: [["البلدية", i.municipality], ["البند", it.title], ["السنة المالية", String(it.fiscal_year)], ["النسخة", share ? "قابلة للمشاركة (دون الأسعار وتصاريح التعارض)" : "داخلية"], ["تاريخ الإنشاء", now.slice(0, 10)], ["عدد السجلات الناقصة", String(missing.length)]],
    sections, missing,
    disclaimers: [
      "حدود التحقق: هذا الملف تجميع لما هو مسجَّل في النظام وقت الإنشاء؛ لا يُثبت صحة الإجراءات ولا يُغني عن المراجعة القانونية.",
      "ليس في الملف أي اعتماد أو توقيع أو اختيار فائز؛ تلك من اختصاص أصحاب الصلاحية.",
      "قائمة السجلات الناقصة تعدّد ما لم يُسجَّل فقط، ولا تحكم بوجود مخالفة.",
    ],
  };
}
