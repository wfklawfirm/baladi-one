// Pure generators for procurement documents. Every value comes from a record passed in (with its source); nothing is invented.
// - Mandatory fields missing  -> a Refusal with an Arabic message (no partial document).
// - Recitals are built only from records and each one carries its source record.
// - Legal references appear only when a VERIFIED legal_rule / procurement_provision was supplied; otherwise "يتطلب تحققًا قانونيًا".
// - No legal threshold, period or percentage is written here.
import { METHOD } from "@/lib/council";
import type { AutoField, Block, BidIn, Doc, DocInput, DocKey, GenResult, LegalRef, Src } from "./types";

export const WATERMARK = "مسودة";
export const NEEDS_LEGAL = "يتطلب تحققًا قانونيًا";
export const TEMPLATE_VERSION: Record<DocKey, string> = { purchase_request: "1", need_definition: "1", estimate_sheet: "1", bid_register: "1", bid_comparison: "1", committee_minutes: "1", bidder_notification: "1" };
export const DOC_TITLE: Record<DocKey, string> = {
  purchase_request: "طلب شراء", need_definition: "تحديد الحاجة", estimate_sheet: "جدول التقدير (الكلفة التقديرية)", bid_register: "سجل استلام العروض",
  bid_comparison: "جدول مقارنة العروض", committee_minutes: "محضر لجنة التلزيم (مسودة)", bidder_notification: "كتاب إلى العارض (مسودة)",
};
/** Which verified legal topics each document may cite (provision topics from procurement_provision; rule ids from legal_rule). */
const TOPICS: Record<DocKey, { topic: string; label: string }[]> = {
  purchase_request: [{ topic: "planning", label: "التخطيط" }],
  need_definition: [{ topic: "planning", label: "التخطيط" }],
  estimate_sheet: [{ topic: "estimation", label: "التقدير" }],
  bid_register: [{ topic: "bids", label: "العروض" }],
  bid_comparison: [{ topic: "evaluation", label: "التقييم" }, { topic: "award", label: "الترسية" }],
  committee_minutes: [{ topic: "committees", label: "اللجان" }, { topic: "conflict_of_interest", label: "تعارض المصالح" }, { topic: "evaluation", label: "التقييم" }],
  bidder_notification: [{ topic: "objections", label: "الاعتراضات" }, { topic: "standstill", label: "فترة التجميد" }],
};
const RULE_IDS: Partial<Record<DocKey, string[]>> = { bidder_notification: ["PPL-244-STANDSTILL", "PPL-244-OBJ"] };

export const SRC_LABEL: Record<string, string> = { procurement_plan_item: "بند خطة الشراء", municipality: "سجل البلدية", budget_line: "بند الموازنة", procurement_bid: "العرض المستلم", procurement_supplier: "المورّد", procurement_committee: "لجنة التلزيم", procurement_committee_member: "عضو اللجنة", municipal_decision: "سجل القرارات", procurement_provision: "حكم قانوني (سجل الأحكام)", legal_rule: "قاعدة قانونية (سجل القواعد)" };

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
export const fmtMoney = (n: number, c: string | null) => `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c === "LBP" ? "ل.ل." : c === "USD" ? "$" : (c ?? "")}`.trim();
const compl = (b: boolean | null) => (b === null ? "لم يُقيَّم" : b ? "مطابق" : "غير مطابق");

class Ctx {
  auto: AutoField[] = []; missing: { key: string; label: string }[] = []; private seen = new Set<string>(); srcs: Src[] = [];
  src(s: Src) { const k = `${s.table}:${s.id}`; if (!this.seen.has(k)) { this.seen.add(k); this.srcs.push(s); } return s; }
  /** Mandatory field: records it as auto-filled with its source, or as missing. */
  req(key: string, label: string, v: unknown, s: Src, show?: (v: any) => string): string {
    if (blank(v)) { this.missing.push({ key, label }); return "—"; }
    const out = show ? show(v) : String(v).trim(); this.auto.push({ label, value: out, source: this.src(s) }); return out;
  }
  /** Optional field: shown only when the record holds it, otherwise null (never guessed). */
  opt(label: string, v: unknown, s: Src, show?: (v: any) => string): string | null {
    if (blank(v)) return null;
    const out = show ? show(v) : String(v).trim(); this.auto.push({ label, value: out, source: this.src(s) }); return out;
  }
  need(key: string, label: string, ok: boolean) { if (!ok) this.missing.push({ key, label }); }
}

function legalBlock(key: DocKey, legal: LegalRef[], c: Ctx): Block {
  const lines: Extract<Block, { t: "legal" }>["lines"] = [];
  const ok = legal.filter((l) => l.verified);
  const srcOf = (l: LegalRef): Src => c.src({ table: l.kind === "rule" ? "legal_rule" : "procurement_provision", id: l.id, label: l.label });
  for (const { topic, label } of TOPICS[key]) {
    const hits = ok.filter((l) => l.kind === "provision" && l.topic === topic);
    if (!hits.length) lines.push({ topic: label, status: "needs_verification", text: NEEDS_LEGAL });
    for (const h of hits) lines.push({ topic: label, status: "verified", text: h.text ? `${h.label}: ${h.text}` : h.label, source: srcOf(h) });
  }
  for (const rid of RULE_IDS[key] ?? []) {
    const r = ok.find((l) => l.kind === "rule" && l.ruleId === rid);
    if (r) lines.push({ topic: "قاعدة من سجل القواعد", status: "verified", text: r.text ? `${r.label}: ${r.text}` : r.label, source: srcOf(r) });
  }
  return { t: "legal", lines };
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

export function generateDoc(key: DocKey, i: DocInput): GenResult {
  const c = new Ctx();
  const pi: Src = { table: "procurement_plan_item", id: i.item.id, label: `بند الخطة: ${i.item.title}` };
  const mu: Src = { table: "municipality", id: i.muni.id, label: "سجل البلدية" };
  const muniName = c.req("municipality", "اسم البلدية", i.muni.name, mu);
  const blocks: Block[] = [];
  const recitals: Block[] = [];
  const title = c.req("item_title", "عنوان بند الخطة", i.item.title, pi);
  const money = () => (i.item.estimated_value === null || i.item.estimated_value === undefined ? null : fmtMoney(i.item.estimated_value, i.item.currency));
  const bl = i.budgetLine ? ({ table: "budget_line", id: i.budgetLine.id, label: `بند الموازنة ${i.budgetLine.code}` } as Src) : null;
  const subject = (): Block => ({ t: "kv", rows: [["البلدية", muniName], ["الموضوع", title], ["السنة المالية", dash(c.opt("السنة المالية", i.item.fiscal_year, pi, String))]] });
  let comparison: Doc["comparison"];

  switch (key) {
    case "purchase_request": {
      const need = c.req("need_description", "وصف الحاجة", i.item.need_description, pi);
      const val = c.req("estimated_value", "القيمة التقديرية", i.item.estimated_value === null ? null : money(), pi);
      const fund = i.budgetLine ? c.req("funding", "التمويل", `${i.budgetLine.code} — ${i.budgetLine.title}`, bl!) : c.req("funding", "التمويل (بند موازنة أو ملاحظة تمويل)", i.item.funding_note, pi);
      const resp = c.req("responsible", "المسؤول / الجهة الطالبة", i.item.responsible, pi);
      const method = c.opt("الأسلوب المخطط", i.item.planned_method, pi, (m) => METHOD[m] ?? m);
      blocks.push(subject(), { t: "heading", text: "بيانات الطلب" }, { t: "kv", rows: [["الجهة الطالبة", resp], ["وصف الحاجة", need], ["القيمة التقديرية", val], ["التمويل", fund], ["الأسلوب المخطط (كما في الخطة)", method ?? "غير محدد"], ["تاريخ النشر المخطط", dash(c.opt("تاريخ النشر المخطط", i.item.planned_publish_on, pi))], ["تاريخ الترسية المخطط", dash(c.opt("تاريخ الترسية المخطط", i.item.planned_award_on, pi))], ["تاريخ البدء المخطط", dash(c.opt("تاريخ البدء المخطط", i.item.planned_start_on, pi))]] });
      if (method) blocks.push({ t: "note", text: `الأسلوب أعلاه كما سُجّل في خطة الشراء؛ مطابقته للأسلوب الواجب اتباعه بحسب القيمة ${NEEDS_LEGAL}.` });
      recitals.push({ t: "recital", text: `وارد في خطة الشراء السنوية لعام ${i.item.fiscal_year ?? "—"} تحت عنوان «${i.item.title}».`, source: c.src(pi) });
      blocks.push({ t: "sign", items: ["مقدّم الطلب", "رئيس المصلحة المعنية", "رئيس البلدية"] });
      break;
    }
    case "need_definition": {
      const need = c.req("need_description", "وصف الحاجة", i.item.need_description, pi);
      const resp = c.req("responsible", "المسؤول / الجهة الطالبة", i.item.responsible, pi);
      blocks.push(subject(), { t: "heading", text: "الحاجة" }, { t: "kv", rows: [["الجهة الطالبة", resp], ["وصف الحاجة", need]] },
        { t: "heading", text: "عناصر تُستكمل يدويًا (لا بيانات لها في السجلات)" },
        { t: "table", columns: ["العنصر", "التفصيل"], rows: ["المواصفات الفنية", "الكميات", "مكان التسليم / التنفيذ", "مدة التنفيذ المطلوبة", "مبرر الحاجة والمنفعة العامة"].map((x) => [x, ""]) });
      recitals.push({ t: "recital", text: `الحاجة مسجَّلة في بند خطة الشراء «${i.item.title}».`, source: c.src(pi) });
      blocks.push({ t: "sign", items: ["مقدّم الطلب", "رئيس المصلحة المعنية"] });
      break;
    }
    case "estimate_sheet": {
      c.need("currency", "عملة التقدير", !blank(i.item.currency));
      const val = c.req("estimated_value", "القيمة التقديرية", i.item.estimated_value === null ? null : money(), pi);
      blocks.push(subject(), { t: "kv", rows: [["القيمة التقديرية الإجمالية (من الخطة)", val]] }, { t: "heading", text: "تفصيل التقدير" },
        { t: "table", columns: ["#", "البند", "الوحدة", "الكمية", "السعر الإفرادي", "المجموع"], rows: [1, 2, 3, 4, 5, 6].map((n) => [String(n), "", "", "", "", ""]), note: "تفصيل البنود يُدخَل يدويًا من الدراسة الفنية؛ لم يُسجَّل في النظام ولا يُخمَّن. يجب أن يطابق المجموع التقدير الإجمالي أو يُبرَّر الفرق." },
        { t: "kv", rows: [["أساس التقدير (مرجع الأسعار / الدراسة)", ""]] });
      recitals.push({ t: "recital", text: `القيمة التقديرية الإجمالية مأخوذة من بند خطة الشراء «${i.item.title}».`, source: c.src(pi) });
      blocks.push({ t: "sign", items: ["معدّ التقدير", "رئيس المصلحة المعنية"] });
      break;
    }
    case "bid_register":
    case "bid_comparison": {
      c.need("bids_open_on", "موعد فتح العروض", !blank(i.item.bids_open_on));
      c.need("bids_opened", "حلول موعد فتح العروض (العروض مختومة قبله)", i.bidsOpened);
      c.need("bids", "عرض مستلم واحد على الأقل", i.bids.length > 0);
      const bids = i.bidsOpened ? i.bids : [];
      const open = c.opt("موعد فتح العروض", i.item.bids_open_on, pi);
      const bidSrc = (b: BidIn): Src => c.src({ table: "procurement_bid", id: b.id, label: `عرض ${b.supplier_name}` });
      const cur = new Set(bids.map((b) => b.currency));
      const single = cur.size <= 1;
      if (key === "bid_register") {
        bids.forEach((b) => { c.opt(`عرض ${b.supplier_name}`, b.supplier_name, bidSrc(b)); });
        blocks.push(subject(), { t: "kv", rows: [["موعد فتح العروض", dash(open)], ["عدد العروض المستلمة", String(bids.length)]] },
          { t: "table", columns: ["#", "العارض", "تاريخ الاستلام", "السعر الإجمالي", "مدة التسليم", "الضمان"], rows: [...bids].sort((a, b) => a.received_on.localeCompare(b.received_on) || a.supplier_name.localeCompare(b.supplier_name, "ar")).map((b, n) => [String(n + 1), b.supplier_name, b.received_on, fmtMoney(b.total_value, b.currency), b.delivery_days === null ? "—" : `${b.delivery_days} يوم`, dash(b.warranty_note)]) });
        if (bids.length) recitals.push({ t: "recital", text: `سُجّلت ${bids.length} عروض مستلمة في سجل العروض لبند الخطة «${i.item.title}».`, source: c.src(pi) });
        blocks.push({ t: "sign", items: ["أمين السجل", "رئيس اللجنة"] });
      } else {
        const sorted = single ? [...bids].sort((a, b) => a.total_value - b.total_value) : [...bids].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, "ar"));
        const low = single && sorted.length ? sorted[0].total_value : null;
        const est = i.item.estimated_value;
        const columns = ["#", "العارض", "السعر الإجمالي", "العملة", "مدة التسليم (يوم)", "الضمان", "المطابقة الفنية", "ملاحظة التقييم"];
        const rows: (string | number)[][] = sorted.map((b, n) => { bidSrc(b); return [single ? n + 1 : "—", b.supplier_name, b.total_value, b.currency === "LBP" ? "ل.ل." : "$", b.delivery_days ?? "—", dash(b.warranty_note), compl(b.technical_compliant), dash(b.evaluation_note)]; });
        const note = (single ? "الترتيب بالسعر للاستئناس فقط وليس ترجيحًا." : "العروض بعملات مختلفة وغير قابلة للمقارنة المباشرة؛ لم يُرتَّب بينها.") + " اختيار العرض الفائز واعتماد نتيجة التقييم من اختصاص اللجنة المختصة؛ لا يتخذهما النظام ولا الذكاء الاصطناعي.";
        comparison = { columns, rows, note };
        blocks.push(subject(), { t: "kv", rows: [["موعد فتح العروض", dash(open)], ["عدد العروض", String(bids.length)], ["القيمة التقديرية (الخطة)", est === null || est === undefined ? "—" : fmtMoney(est, i.item.currency)], ["أقل سعر مقدَّم", low === null ? "—" : fmtMoney(low, sorted[0].currency)]] },
          { t: "table", columns, rows: rows.map((r) => r.map((x, ci) => (ci === 2 ? Number(x).toLocaleString("en-US") : String(x)))), note });
        if (bids.length) recitals.push({ t: "recital", text: `الجدول مبني على العروض المسجَّلة بعد فتحها لبند الخطة «${i.item.title}».`, source: c.src(pi) });
        blocks.push({ t: "sign", items: ["معدّ الجدول", "رئيس اللجنة"] });
      }
      break;
    }
    case "committee_minutes": {
      const cm = i.committee;
      c.need("committee", "لجنة تلزيم مسجَّلة لهذا البند", !!cm && cm.kind === "award");
      c.need("formed_on", "تاريخ تشكيل اللجنة", !!cm && !blank(cm.formed_on));
      c.need("members", "عضو واحد على الأقل في اللجنة", !!cm && cm.members.length > 0);
      c.need("bids_opened", "حلول موعد فتح العروض", i.bidsOpened);
      c.need("bids", "عرض مستلم واحد على الأقل", i.bids.length > 0);
      if (cm && cm.kind === "award") {
        const cs: Src = { table: "procurement_committee", id: cm.id, label: "لجنة التلزيم" };
        const formed = c.opt("تاريخ تشكيل اللجنة", cm.formed_on, cs);
        const bids = i.bidsOpened ? i.bids : [];
        blocks.push(subject(), { t: "kv", rows: [["تاريخ تشكيل اللجنة", dash(formed)], ["موعد فتح العروض", dash(c.opt("موعد فتح العروض", i.item.bids_open_on, pi))], ["عدد العروض", String(bids.length)]] });
        if (i.formationDecision) { const d = i.formationDecision, ds: Src = { table: "municipal_decision", id: d.id, label: `القرار ${d.decision_no}/${d.year}` }; recitals.push({ t: "recital", text: `بناءً على القرار رقم ${d.decision_no}/${d.year}${d.decided_on ? ` تاريخ ${d.decided_on}` : ""} («${d.title}») المسجَّل في سجل القرارات.`, source: c.src(ds) }); }
        else if (cm.formation_decision_id) c.need("formation_decision", "قرار تشكيل اللجنة (مرتبط لكن غير مقروء)", false);
        recitals.push({ t: "recital", text: `وبعد فتح العروض المسجَّلة لبند الخطة «${i.item.title}».`, source: c.src(pi) });
        blocks.push({ t: "heading", text: "الأعضاء الحاضرون وإقرارات تعارض المصالح" },
          { t: "table", columns: ["#", "الاسم", "الصفة", "إقرار تعارض المصالح", "تاريخ الإقرار"], rows: cm.members.map((m, n) => { c.opt(`عضو اللجنة ${m.name}`, m.name, c.src({ table: "procurement_committee_member", id: m.id, label: `عضو: ${m.name}` })); return [String(n + 1), m.name, dash(m.role_ar), m.has_conflict === null ? "لم يُصرَّح بعد" : m.has_conflict ? "تعارض مصرَّح — يلزم التحقق من استبعاده" : "لا تعارض", dash(m.declaration_on)]; }) },
          { t: "heading", text: "العروض المعروضة على اللجنة" },
          { t: "table", columns: ["#", "العارض", "السعر الإجمالي", "المطابقة الفنية"], rows: bids.map((b, n) => { c.src({ table: "procurement_bid", id: b.id, label: `عرض ${b.supplier_name}` }); return [String(n + 1), b.supplier_name, fmtMoney(b.total_value, b.currency), compl(b.technical_compliant)]; }) },
          { t: "heading", text: "نتيجة اللجنة وتوصيتها" });
        if (cm.report_text && cm.report_text.trim()) { c.opt("نص المحضر المسجَّل", cm.report_text, cs); blocks.push({ t: "para", text: cm.report_text.trim() }, { t: "note", text: `النص أعلاه كما سُجّل في ملف اللجنة${cm.report_on ? ` بتاريخ ${cm.report_on}` : ""}.` }); }
        else blocks.push({ t: "para", text: "[تُدوَّن هنا نتيجة اللجنة وتوصيتها بقرار اللجنة نفسها؛ لا يقترحها النظام.]" });
        blocks.push({ t: "sign", items: cm.members.map((m) => m.name) });
      }
      break;
    }
    case "bidder_notification": {
      c.need("bids_opened", "حلول موعد فتح العروض", i.bidsOpened);
      const b = i.bidsOpened ? i.bids.find((x) => x.id === i.bidderBidId) : undefined;
      c.need("bidder", "تحديد العارض المخاطَب", !!b);
      if (b) {
        const bs: Src = { table: "procurement_bid", id: b.id, label: `عرض ${b.supplier_name}` };
        const ss: Src = { table: "procurement_supplier", id: b.supplier_id, label: `المورّد ${b.supplier_name}` };
        const to = c.req("bidder_name", "اسم العارض", b.supplier_name, ss);
        const rec = c.req("received_on", "تاريخ استلام العرض", b.received_on, bs);
        const val = c.req("bid_total", "قيمة العرض", b.total_value, bs, () => fmtMoney(b.total_value, b.currency));
        blocks.push({ t: "kv", rows: [["من", `بلدية ${muniName}`], ["إلى", to], ["العنوان / وسيلة الاتصال", dash(c.opt("جهة اتصال العارض", b.supplier_contact, ss))], ["الموضوع", `عرضكم في «${title}»`], ["التاريخ", i.today]] },
          { t: "para", text: `تحية طيبة، نشير إلى عرضكم المستلم بتاريخ ${rec} بقيمة ${val} في إطار «${title}».` },
          { t: "para", text: "[تُدرَج هنا نتيجة اللجنة بشأن العرض بعد صدور قرارها؛ لا يحدّدها النظام.]" },
          { t: "para", text: `بشأن مهلة الاعتراض وفترة التجميد وسبل الطعن: ${NEEDS_LEGAL} قبل إدراجها في الكتاب.` });
        recitals.push({ t: "recital", text: `العرض مسجَّل في سجل العروض لبند الخطة «${i.item.title}».`, source: c.src(bs) });
        blocks.push({ t: "sign", items: ["رئيس البلدية"] });
      }
      break;
    }
  }
  if (c.missing.length) {
    const list = c.missing.map((m) => m.label).join("، ");
    return { ok: false, key, missing: c.missing, message: `لا يمكن إنشاء «${DOC_TITLE[key]}»: حقول إلزامية ناقصة أو غير متاحة: ${list}. أكملوها في السجلات المصدر ثم أعيدوا المحاولة.` };
  }
  const lb = legalBlock(key, i.legal, c);
  const out: Block[] = [...blocks.slice(0, 1)];
  if (recitals.length) out.push({ t: "heading", text: "الحيثيات (كل حيثية مرتبطة بسجلها المصدر)" }, ...recitals);
  out.push(...blocks.slice(1), { t: "heading", text: "المراجع القانونية" }, lb);
  return {
    ok: true, key, version: TEMPLATE_VERSION[key], title: DOC_TITLE[key], watermark: WATERMARK, municipality: muniName,
    blocks: out, autofilled: c.auto, sources: c.srcs, comparison,
    footer: "مسودة — مولَّدة من سجلات النظام ولم تُعتمد. يراجعها المختص ويعتمدها وفق الأصول؛ لا يتخذ النظام ولا الذكاء الاصطناعي أي قرار.",
  };
}
