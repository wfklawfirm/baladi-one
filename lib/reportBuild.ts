// Pure report builders for the Reporting Center (no I/O, unit-tested).
// All numbers come from the existing computations (computeOps / buildCards / decisionStats); nothing is recalculated here,
// this module only shapes them into rows and adds data-limit notes.
import { FIRST_RESPONSE_H, PERIODS, SLA_DAYS, dayKey, parsePeriod, type Coll, type Person, type Range, type Req, type computeOps } from "./ops";
import type { Card } from "./kpi";
import { EXEC_STATUS, LEGAL_STATUS, isLate } from "./council";
import { REPORT_TYPES } from "./reports-client";

export const REPORT_KINDS = ["executive", "requests", "collections", "decisions", "staff"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const isReportKind = (v: unknown): v is ReportKind => typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);

export const REVIEW_STATUS = "مسودة — لم تُراجَع";
export const NA = "بيانات غير متوفرة";
export const MAX_REQUESTS = 3000;
export const MAX_RECEIPTS = 5000;

export const KIND_META: Record<ReportKind, { title: string; description: string; icon: string }> = {
  executive: { title: "الملخص التنفيذي", description: "مؤشرات الأداء الرئيسية للفترة مع حدود البيانات ومصادرها.", icon: "gauge" },
  requests: { title: "تقرير الطلبات والشكاوى", description: "الوارد والمنجز والمتأخر، التوزيع حسب النوع والحالة، وسجل الطلبات.", icon: "inbox" },
  collections: { title: "تقرير التحصيل", description: "الإيصالات المسجّلة لكل عملة على حدة، حسب الطريقة والموظف.", icon: "wallet" },
  decisions: { title: "تقرير القرارات", description: "الوضع القانوني وحالة التنفيذ منفصلان، والقرارات المتأخرة.", icon: "gavel" },
  staff: { title: "تقرير أداء الموظفين", description: "مؤشرات المعالجة والاستجابة لكل موظف مع شرح المعادلة.", icon: "users" },
};

export type Cell = string | number | null;
export type Table = { title: string; columns: string[]; rows: Cell[][]; note?: string };
export type Kpi = { label: string; value: string; note?: string };
export type ReportDoc = {
  kind: ReportKind; title: string; municipality: string; period: string; periodKey: string; generatedAt: string;
  reviewStatus: string; sources: string[]; kpis: Kpi[]; tables: Table[]; limits: string[]; formulaNote?: string;
};

export type DecisionRow = { id: string; decision_no: string; year: number; title: string; legal_status: string; execution_status: string; execution_due: string | null; responsible: string | null; decided_on?: string | null };
export type ReportInput = {
  o: ReturnType<typeof computeOps>;
  people: Person[];
  cards: Card[];
  ds: { total: number; due: number; done: number; late: DecisionRow[]; rate: number | null } | null;
  decisions: DecisionRow[] | null;
  requests: Req[] | null;          // requests created inside the period (raw rows)
  receipts: (Coll & { service_label?: string | null; receipt_no?: string | null })[] | null; // receipts inside the period
  municipality: string;
  now?: Date;
};

// ---------- formatting ----------
export const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
export const fmtMoney = (n: number, cur: string) => `${Math.round(n).toLocaleString("en-US")} ${cur === "USD" ? "$" : "ل.ل."}`;
export const fmtPct = (n: number | null) => (n === null ? NA : `${n}%`);
export const fmtDays = (n: number | null) => (n === null ? NA : fmtNum(n));
export const fmtDate = (d: string | Date | null | undefined) => (d ? dayKey(d) : "—");
export function fmtDateTime(d: string | Date): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
  return `${dayKey(d)} ${p}`;
}
/** Cells that start with = + - @ (or tab/CR) are neutralised so spreadsheets never evaluate user-entered text as a formula. */
export function safeCell(v: Cell): Cell {
  if (typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
export function safeFileName(kind: ReportKind, periodKey: string, now: Date, ext: string): string {
  return `baladi-${kind}-${periodKey.replace(/[^a-z0-9-]/gi, "")}-${dayKey(now)}.${ext}`;
}
/** Validates the period query. Unlike parsePeriod (which silently falls back to this month) bad input is rejected. */
export function validatePeriod(p: string | null | undefined, from: string | null | undefined, to: string | null | undefined, now = new Date()): { ok: true; range: Range } | { ok: false } {
  const key = p || "month";
  if (!PERIODS.some(([k]) => k === key)) return { ok: false };
  const range = parsePeriod(key, from || undefined, to || undefined, now);
  if (key === "custom" && range.key !== "custom") return { ok: false };
  return { ok: true, range };
}
/** Short period tag for the audit RPC: "month" or "custom:2026-01-01..2026-02-01". */
export const periodTag = (r: Range) => (r.key === "custom" ? `custom:${dayKey(r.from)}..${dayKey(r.to)}` : r.key);

// ---------- labels ----------
// Same wording as lib/reports.ts STATUS_AR (that module is server-only, so the pure builder keeps its own copy of the labels).
const REQ_STATUS: Record<string, string> = { received: "تم الاستلام", in_progress: "قيد المعالجة", done: "تمت المعالجة", needs_info: "بحاجة إلى معلومات إضافية", rejected: "مرفوض", cancelled: "ملغى" };
const METHOD: Record<string, string> = { cash: "نقدًا", transfer: "حوالة", cheque: "شيك" };
const ROLE: Record<string, string> = { staff: "موظف", mayor: "رئيس", admin: "مدير" };
export const typeLabel = (r: { kind: string; report_type: string | null }) => REPORT_TYPES.find(([k]) => k === r.report_type)?.[1] ?? (r.kind === "service_request" ? "طلب خدمة" : "بلاغ");
const personName = (people: Person[], id: string | null) => (id ? people.find((p) => p.user_id === id)?.display_name ?? "—" : "غير مُسند");

const count = <T,>(items: T[], key: (t: T) => string) => { const m = new Map<string, number>(); for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

function base(kind: ReportKind, i: ReportInput, sources: string[]): ReportDoc {
  const now = i.now ?? new Date();
  return {
    kind, title: KIND_META[kind].title, municipality: i.municipality, period: i.o.range.label, periodKey: i.o.range.key,
    generatedAt: fmtDateTime(now), reviewStatus: REVIEW_STATUS, sources, kpis: [], tables: [],
    limits: ["التقرير مولَّد آليًا من بيانات النظام ولم يُراجَع بشريًا؛ يجب مراجعته قبل أي استخدام رسمي.", "الأيام والتواريخ بتوقيت بيروت."],
  };
}

// ---------- the five reports ----------
export function buildExecutive(i: ReportInput): ReportDoc {
  const { o, cards, ds } = i;
  const d = base("executive", i, ["citizen_request", "request_status_history", "collection_entry", "municipal_decision"]);
  d.kpis = cards.map((c) => ({
    label: c.def.ar,
    value: c.value ?? NA,
    note: c.value !== null ? [...(c.lines ?? []), c.delta ? `${c.delta.text} عن الفترة السابقة` : ""].filter(Boolean).join(" · ") : c.reason,
  }));
  d.kpis.push(
    { label: "طلبات مفتوحة الآن", value: fmtNum(o.open), note: `متأخرة أكثر من ${SLA_DAYS} أيام: ${o.overdue.length} · غير مُسندة: ${o.unassigned}` },
    { label: "واردة / منجزة في الفترة", value: `${o.intakeNow} / ${o.processedNow}`, note: `الفترة السابقة: ${o.intakePrev} / ${o.processedPrev}` },
    { label: "متوسط زمن المعالجة (أيام)", value: fmtDays(o.resolutionDays), note: "للطلبات المنتهية" },
  );
  d.tables.push({ title: "تعريف المؤشرات", columns: ["المؤشر", "المعادلة", "المصدر", "جودة البيانات"], rows: cards.map((c) => [c.def.ar, c.def.formula, c.def.source, c.def.quality === "available" ? "متوفرة" : c.def.quality === "partial" ? "جزئية" : NA]) });
  d.tables.push({ title: "حالات الطلبات (الكل)", columns: ["الحالة", "العدد"], rows: o.status.map((s) => [REQ_STATUS[s.s] ?? s.s, s.n]) });
  if (ds) d.tables.push({ title: "القرارات", columns: ["البند", "العدد"], rows: [["إجمالي القرارات", ds.total], ["نافذة ومستحقة", ds.due], ["منفذة من المستحقة", ds.done], ["متأخرة", ds.late.length]] });
  d.limits.push(
    "مؤشرات نسبة التحصيل وإنجاز المشاريع وتنفيذ الموازنة غير متوفرة لعدم وجود سجل المستحقات والمشاريع والموازنة بعد.",
    "الإيرادات المحصلة تشمل الإيصالات التي سجّلها الموظفون فقط، ولا تُجمع العملات المختلفة.",
    ds ? "تنفيذ القرارات يُحسب على القرارات النافذة التي حلّ موعد تنفيذها فقط." : "سجل القرارات غير مفعّل أو غير متاح للمستخدم.",
    "قراءة الطلبات محدودة بآخر " + MAX_REQUESTS + " طلب، وسجل الحالات بآخر 8000 حركة.",
  );
  return d;
}

export function buildRequests(i: ReportInput): ReportDoc {
  const { o, people } = i;
  const now = i.now ?? new Date();
  const d = base("requests", i, ["citizen_request", "request_status_history"]);
  d.kpis = [
    { label: "واردة في الفترة", value: fmtNum(o.intakeNow), note: `الفترة السابقة: ${o.intakePrev}` },
    { label: "أُنجزت في الفترة", value: fmtNum(o.processedNow), note: `الفترة السابقة: ${o.processedPrev}` },
    { label: "نسبة معالجة الواردة", value: fmtPct(o.completionRate), note: o.completionRate === null ? "لا طلبات واردة في الفترة" : `${o.cohort.done} من ${o.cohort.total} · السابقة: ${fmtPct(o.completionPrev)}` },
    { label: "متوسط زمن المعالجة (أيام)", value: fmtDays(o.resolutionDays) },
    { label: "طلبات مفتوحة الآن", value: fmtNum(o.open) },
    { label: `متأخرة (أكثر من ${SLA_DAYS} أيام)`, value: fmtNum(o.overdue.length) },
    { label: "مفتوحة غير مُسندة", value: fmtNum(o.unassigned) },
  ];
  d.tables.push({ title: "حالات الطلبات (الكل)", columns: ["الحالة", "العدد"], rows: o.status.map((s) => [REQ_STATUS[s.s] ?? s.s, s.n]) });
  d.tables.push({ title: "أعمار الطلبات المفتوحة", columns: ["العمر", "العدد"], rows: o.aging.map((a) => [a.label, a.n]) });
  if (i.requests) {
    d.tables.push({ title: "الواردة في الفترة حسب النوع", columns: ["النوع", "العدد"], rows: count(i.requests, typeLabel).map(([k, n]) => [k, n]) });
    d.tables.push({
      title: "سجل الطلبات الواردة في الفترة", note: "لا يتضمن بيانات المواطنين (الاسم أو الهاتف أو نص الطلب).",
      columns: ["النوع", "الحالة", "تاريخ الورود", "آخر تحديث", "العمر (يوم)", "المسؤول"],
      rows: [...i.requests].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).map((r) => [
        typeLabel(r), REQ_STATUS[r.status] ?? r.status, fmtDateTime(r.created_at), fmtDateTime(r.updated_at),
        Math.floor((+now - +new Date(r.created_at)) / 86_400_000), personName(people, r.assigned_to),
      ]),
    });
    if (i.requests.length >= MAX_REQUESTS) d.limits.push(`بلغت القراءة الحد الأقصى (${MAX_REQUESTS} طلب)؛ قد تكون هناك طلبات أقدم غير مشمولة في السجل.`);
  } else d.limits.push("تعذّر تحميل سجل الطلبات للفترة؛ الأعداد أعلاه فقط.");
  d.limits.push("الطلبات المفتوحة والمتأخرة تعبّر عن الوضع الحالي، وليست مقيّدة بالفترة المختارة.");
  d.limits.push("تُستثنى بيانات المواطنين الشخصية من التقرير عمدًا.");
  return d;
}

export function buildCollections(i: ReportInput): ReportDoc {
  const { o, people } = i;
  const d = base("collections", i, ["collection_entry"]);
  const cs = o.collections.filter((c) => c.count > 0);
  if (!cs.length) d.kpis.push({ label: "الإيرادات المحصلة", value: NA, note: "لم تُسجَّل إيصالات بعد" });
  for (const c of cs) {
    d.kpis.push({ label: `المحصّل بالـ${c.currency === "USD" ? "دولار" : "ليرة"} في الفترة`, value: fmtMoney(c.month, c.currency), note: `الفترة السابقة: ${fmtMoney(c.prev, c.currency)}` });
    d.tables.push({ title: `المحصّل حسب الموظف (${c.currency})`, columns: ["الموظف", "المبلغ"], rows: c.byCollector.map((x) => [personName(people, x.id), fmtMoney(x.v, c.currency)]) });
  }
  d.kpis.push({ label: "نسبة التحصيل", value: NA, note: "يتطلب سجل مستحقات (غير مفعّل بعد)" });
  if (i.receipts) {
    const rs = [...i.receipts].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    d.tables.push({ title: "حسب طريقة الدفع", columns: ["العملة", "الطريقة", "عدد الإيصالات", "المبلغ"], rows: (["LBP", "USD"] as const).flatMap((cur) => count(rs.filter((r) => r.currency === cur), (r) => r.method).map(([m, n]) => [cur, METHOD[m] ?? m, n, fmtMoney(rs.filter((r) => r.currency === cur && r.method === m).reduce((s, r) => s + Number(r.amount), 0), cur)])) });
    d.tables.push({
      title: "سجل الإيصالات في الفترة", columns: ["التاريخ", "رقم الإيصال", "البند", "المبلغ", "العملة", "الطريقة", "الموظف"],
      rows: rs.map((r) => [fmtDateTime(r.created_at), r.receipt_no ?? "—", r.service_label ?? "—", Number(r.amount), r.currency, METHOD[r.method] ?? r.method, personName(people, r.collected_by)]),
    });
    if (rs.length >= MAX_RECEIPTS) d.limits.push(`بلغت القراءة الحد الأقصى (${MAX_RECEIPTS} إيصال)؛ قد تكون هناك إيصالات غير مشمولة.`);
  } else d.limits.push("تعذّر تحميل سجل الإيصالات.");
  d.limits.push("المبالغ لا تُجمع عبر العملات؛ كل عملة تُعرض على حدة.", "المحصّل يشمل ما سجّله الموظفون من إيصالات فقط، ولا يقابله سجل مستحقات، لذلك لا تُحسب نسبة تحصيل.", "لا مطابقة مع حسابات مصرفية أو دفاتر محاسبية.");
  return d;
}

export function buildDecisions(i: ReportInput): ReportDoc {
  const { ds, decisions } = i;
  const now = i.now ?? new Date();
  const d = base("decisions", i, ["municipal_decision"]);
  if (!decisions || !ds) {
    d.kpis.push({ label: "القرارات", value: NA, note: "سجل القرارات غير مفعّل أو غير متاح" });
    d.limits.push("سجل القرارات غير متاح؛ لا يوجد ما يُعرض.");
    return d;
  }
  const today = dayKey(now);
  d.kpis = [
    { label: "إجمالي القرارات المسجّلة", value: fmtNum(ds.total) },
    { label: "نافذة ومستحقة التنفيذ", value: fmtNum(ds.due) },
    { label: "منفذة من المستحقة", value: fmtNum(ds.done) },
    { label: "نسبة تنفيذ المستحقة", value: fmtPct(ds.rate), note: ds.rate === null ? "لا قرارات نافذة مستحقة بعد" : `${ds.done} من ${ds.due}` },
    { label: "قرارات نافذة متأخرة التنفيذ", value: fmtNum(ds.late.length) },
  ];
  // Legal status and execution status are deliberately two separate tables.
  d.tables.push({ title: "الوضع القانوني", columns: ["الوضع القانوني", "العدد"], rows: Object.entries(LEGAL_STATUS).map(([k, v]) => [v, decisions.filter((x) => x.legal_status === k).length]) });
  d.tables.push({ title: "حالة التنفيذ", columns: ["حالة التنفيذ", "العدد"], rows: Object.entries(EXEC_STATUS).map(([k, v]) => [v, decisions.filter((x) => x.execution_status === k).length]) });
  d.tables.push({
    title: "القرارات المتأخرة (نافذة، انقضى موعد تنفيذها، لم تكتمل ولم تتوقف)", columns: ["الرقم", "العنوان", "الوضع القانوني", "حالة التنفيذ", "موعد التنفيذ", "المسؤول"],
    rows: ds.late.map((x) => [`${x.decision_no}/${x.year}`, x.title, LEGAL_STATUS[x.legal_status] ?? x.legal_status, EXEC_STATUS[x.execution_status] ?? x.execution_status, fmtDate(x.execution_due), x.responsible || "غير محدد"]),
  });
  d.tables.push({
    title: "سجل القرارات", columns: ["الرقم", "العنوان", "تاريخ القرار", "الوضع القانوني", "حالة التنفيذ", "موعد التنفيذ", "متأخر", "المسؤول"],
    rows: [...decisions].sort((a, b) => b.year - a.year || b.decision_no.localeCompare(a.decision_no, "en", { numeric: true })).map((x) => [
      `${x.decision_no}/${x.year}`, x.title, fmtDate(x.decided_on), LEGAL_STATUS[x.legal_status] ?? x.legal_status, EXEC_STATUS[x.execution_status] ?? x.execution_status, fmtDate(x.execution_due), isLate(x, today) ? "نعم" : "لا", x.responsible || "غير محدد",
    ]),
  });
  d.limits.push(
    "سجل القرارات يُعرض كما هو حتى تاريخ اليوم، ولا يُقيَّد بالفترة المختارة.",
    "الوضع القانوني وحالة التنفيذ حقلان مستقلان؛ تنفيذ القرار لا يعني نفاذه قانونيًا، و«متأخر» حالة مشتقة وليست أثرًا قانونيًا.",
    "لا يتضمن التقرير نصوص القرارات ولا تفاصيل التصويت.",
  );
  return d;
}

export function formulaNote(): string {
  return `المؤشر من ١٠٠ = ٥٠٪ نسبة الإنجاز مما عالجه الموظف + ٣٠٪ نسبة ما أُنجز خلال ${SLA_DAYS} أيام من وروده + ٢٠٪ نسبة الاستجابة الأولى خلال ${FIRST_RESPONSE_H} ساعة. لا يُحتسب قبل معالجة ٣ طلبات على الأقل. مؤشر مساعد للمتابعة وليس تقييمًا وظيفيًا.`;
}

export function buildStaff(i: ReportInput): ReportDoc {
  const { o } = i;
  const d = base("staff", i, ["request_status_history", "citizen_request", "staff_member (ops_roster)"]);
  const scored = o.perf.filter((p) => p.score !== null);
  d.kpis = [
    { label: "عدد الموظفين", value: fmtNum(o.perf.length) },
    { label: "موظفون بمؤشر محسوب", value: fmtNum(scored.length), note: "٣ طلبات معالَجة على الأقل" },
    { label: "متوسط المؤشر", value: scored.length ? fmtNum(Math.round(scored.reduce((s, p) => s + (p.score ?? 0), 0) / scored.length)) : NA },
    { label: "طلبات متأخرة عند الموظفين", value: fmtNum(o.perf.reduce((s, p) => s + p.overdueAssigned, 0)) },
  ];
  d.formulaNote = formulaNote();
  d.tables.push({
    title: "مؤشرات الموظفين", columns: ["الموظف", "الدور", "عالج", "أنجز", "في الموعد %", "استجابة سريعة %", "مفتوح عنده", "متأخر", "المؤشر"],
    rows: o.perf.map((p) => [p.display_name ?? "—", ROLE[p.role] ?? p.role, p.handled, p.closed, p.onTime, p.fast, p.openAssigned, p.overdueAssigned, p.score ?? "بيانات غير كافية"]),
  });
  d.limits.push(
    "المؤشرات مبنية على سجل تغيّر حالات الطلبات (من عالج وأغلق وردّ أولًا) وهي كل التاريخ المتاح، وليست مقيّدة بالفترة المختارة.",
    "«أنجز» يعني نقل الطلب إلى «تمت المعالجة». الإغلاق بحالة مرفوض أو ملغى لا يُحتسب إنجازًا.",
    "المؤشر لا يقيس جودة القرار ولا صعوبة الطلبات؛ لا يُستخدم وحده في أي تقييم.",
    "سجل الحالات مقروء بآخر 8000 حركة.",
  );
  return d;
}

export function buildReport(kind: ReportKind, i: ReportInput): ReportDoc {
  switch (kind) {
    case "executive": return buildExecutive(i);
    case "requests": return buildRequests(i);
    case "collections": return buildCollections(i);
    case "decisions": return buildDecisions(i);
    case "staff": return buildStaff(i);
  }
}
