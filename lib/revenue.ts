// Pure revenue-administration logic (no I/O, unit-tested). Mirrors the SQL rules of 0022_revenue.sql so the UI can explain them.
// NOTHING here encodes a legal rate, penalty or deadline. Missing data is null, never a fake zero; currencies are never summed together.
import { money, r2, type Cur } from "./finance";

export const NA = "بيانات غير متوفرة";
export const NOT_LOADED = "غير محمَّل";
export const NEEDS_LEGAL = "يلزم تحقق";
export const PENDING = "قيد التفعيل";
export const CURS: Cur[] = ["LBP", "USD"];

export type Rule = { id: string; fee_type: string; instrument: string; instrument_no?: string | null; article?: string | null; basis_ar?: string | null; rate: number | string | null; rate_unit: "fixed" | "per_unit" | "percent" | null; rate_currency: string | null; exemptions_ar?: string | null; penalties_ar?: string | null; applicability_ar?: string | null; effective_from: string; effective_to: string | null; review_status: string };
export type OrderRow = { id: string; order_no: string; amount: number | string; currency: Cur; due_on: string; status: string; notified_on?: string | null; assessment_id?: string };
export type ReceiptRow = { id: string; order_id: string; amount: number | string; currency: string; method: string; collected_on: string; cashier?: string | null; status: string; series_id?: string; fiscal_year?: number; receipt_no?: string };
export type EntryRow = { id?: string; amount: number | string; currency: string; method: string; created_at: string; receipt_no?: string | null };

const n = (x: number | string) => Number(x);

/** Does the rule's effective period intersect the whole assessment year? (The year, never "today", decides which rule applies.) */
export function ruleCoversYear(r: Pick<Rule, "effective_from" | "effective_to">, year: number): boolean {
  return r.effective_from <= `${year}-12-31` && (r.effective_to === null || r.effective_to >= `${year}-01-01`);
}

export type RulePick = { rule: Rule | null; reason: "ok" | "none" | "unverified_only" | "ambiguous" };
/** Mirror of _rev_pick_rule: exactly one VERIFIED rule for the fee type whose period intersects the year; otherwise no rule (nothing is computed). */
export function pickRule(rules: Rule[], feeType: string, year: number): RulePick {
  const inYear = rules.filter((r) => r.fee_type === feeType && ruleCoversYear(r, year));
  if (inYear.length === 0) return { rule: null, reason: "none" };
  const ok = inYear.filter((r) => r.review_status === "verified");
  if (ok.length === 0) return { rule: null, reason: "unverified_only" };
  if (ok.length > 1) return { rule: null, reason: "ambiguous" };
  return { rule: ok[0], reason: "ok" };
}
export const PICK_TEXT: Record<RulePick["reason"], string> = {
  ok: "قاعدة متحقَّق منها وسارية لسنة التكليف",
  none: `${NOT_LOADED}: لا قاعدة لهذا الرسم تغطي سنة التكليف`,
  unverified_only: "توجد قاعدة بانتظار المراجعة القانونية فقط: لا يُحتسب منها شيء",
  ambiguous: "أكثر من قاعدة متحقَّق منها تتقاطع مع السنة: لا يُحتسب شيء حتى تُحسم الفترات",
};

/** Reference amount from a verified rule (mirror of revenue_assess). Null (= NA) if the rule/rate/basis/currency do not allow it. Staff still enter the amount. */
export function referenceAmount(rule: Rule | null, basisValue: number | null, currency: string): number | null {
  if (!rule || rule.rate === null || rule.rate === undefined || rule.rate_unit === null) return null;
  const rate = n(rule.rate);
  if (!Number.isFinite(rate)) return null;
  if (rule.rate_unit !== "percent" && rule.rate_currency !== currency) return null;
  if (rule.rate_unit === "fixed") return r2(rate);
  if (basisValue === null || !Number.isFinite(basisValue) || basisValue < 0) return null;
  return r2(rule.rate_unit === "per_unit" ? basisValue * rate : (basisValue * rate) / 100);
}

/** Net collected on an order = issued receipts only (reversed receipts do not count). */
export const netCollected = (orderId: string, receipts: ReceiptRow[]) => r2(receipts.filter((r) => r.order_id === orderId && r.status === "issued").reduce((s, r) => s + n(r.amount), 0));

export function orderState(o: OrderRow, receipts: ReceiptRow[], today: string) {
  const amount = n(o.amount), collected = netCollected(o.id, receipts), remaining = r2(Math.max(0, amount - collected));
  const open = o.status !== "cancelled" && remaining > 0;
  const overdueDays = open && o.due_on < today ? Math.floor((+new Date(`${today}T00:00:00Z`) - +new Date(`${o.due_on}T00:00:00Z`)) / 86_400_000) : 0;
  return { amount, collected, remaining, open, overdue: overdueDays > 0, overdueDays, partial: collected > 0 && remaining > 0 };
}

/** Arrears per currency: open orders past their due date. No penalties/interest are computed (no verified rule): penalty is NA. */
export function arrearsByCurrency(orders: OrderRow[], receipts: ReceiptRow[], today: string) {
  return CURS.map((currency) => {
    const rows = orders.filter((o) => o.currency === currency).map((o) => ({ o, ...orderState(o, receipts, today) })).filter((x) => x.overdue);
    if (!rows.length) return null;
    const bucket = (lo: number, hi: number) => r2(rows.filter((x) => x.overdueDays >= lo && x.overdueDays <= hi).reduce((s, x) => s + x.remaining, 0));
    return { currency, count: rows.length, total: r2(rows.reduce((s, x) => s + x.remaining, 0)), d1_30: bucket(1, 30), d31_90: bucket(31, 90), d90p: bucket(91, 99999), penalty: null as number | null };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

/** Mirror of the collection guards in revenue_collect (returns the error code or null). */
export function collectGuard(o: OrderRow, receipts: ReceiptRow[], amount: number, hasOpenObjection: boolean): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "bad_amount";
  if (o.status === "cancelled") return "order_cancelled";
  if (hasOpenObjection) return "objection_pending";
  const { remaining } = orderState(o, receipts, "9999-12-31");
  if (remaining <= 0) return "order_collected";
  if (r2(amount) > remaining) return "exceeds_remaining";
  return null;
}

/** Receipt number, unique per (municipality, series, fiscal year): the legal scope of this numbering needs verification. */
export const formatReceiptNo = (prefix: string | null | undefined, fiscalYear: number, seq: number) => `${prefix ? `${prefix}-` : ""}${fiscalYear}/${String(seq).padStart(6, "0")}`;
export const receiptKey = (r: { series_id?: string; fiscal_year?: number; receipt_no?: string }) => `${r.series_id}|${r.fiscal_year}|${r.receipt_no}`;
/** Duplicate receipt numbers within the same (series, fiscal year). Empty = healthy. */
export function duplicateReceiptNos(receipts: ReceiptRow[]): string[] {
  const seen = new Map<string, number>();
  for (const r of receipts) seen.set(receiptKey(r), (seen.get(receiptKey(r)) ?? 0) + 1);
  return [...seen].filter(([, c]) => c > 1).map(([k]) => k);
}

export type Close = { business_date: string; currency: string; cashier: string; recorded_amount: number | string; counted_amount: number | string; difference: number | string; receipt_count: number };
/**
 * Daily reconciliation for one date. Per currency: totals by method from issued revenue receipts, the ledger total (collection_entry, net of reversals),
 * ledger entries NOT backed by a revenue receipt (legacy/manual: need review), and the cash-close snapshots with drift (live cash vs snapshot).
 */
export function reconcileDay(date: string, receipts: ReceiptRow[], entries: EntryRow[], closes: Close[], tz = "Asia/Beirut") {
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  return CURS.map((currency) => {
    const rs = receipts.filter((r) => r.currency === currency && r.collected_on === date && r.status === "issued");
    const es = entries.filter((e) => e.currency === currency && day(e.created_at) === date);
    const byMethod = (m: string) => r2(rs.filter((r) => r.method === m).reduce((s, r) => s + n(r.amount), 0));
    const receiptTotal = r2(rs.reduce((s, r) => s + n(r.amount), 0));
    const ledgerTotal = r2(es.reduce((s, e) => s + n(e.amount), 0));
    const receiptNos = new Set(receipts.filter((r) => r.status === "issued" || r.status === "reversed").map((r) => r.receipt_no));
    const legacy = es.filter((e) => n(e.amount) > 0 && !(e.receipt_no && receiptNos.has(e.receipt_no)));
    const cs = closes.filter((c) => c.business_date === date && c.currency === currency);
    const cashNow = byMethod("cash");
    const cashRecordedAtClose = r2(cs.reduce((s, c) => s + n(c.recorded_amount), 0));
    if (!rs.length && !es.length && !cs.length) return null;
    return {
      currency, receipts: rs.length, receiptTotal, cash: cashNow, transfer: byMethod("transfer"), cheque: byMethod("cheque"), ledgerTotal,
      ledgerGap: r2(ledgerTotal - receiptTotal), legacyCount: legacy.length, legacyTotal: r2(legacy.reduce((s, e) => s + n(e.amount), 0)),
      closes: cs.length, counted: r2(cs.reduce((s, c) => s + n(c.counted_amount), 0)), difference: r2(cs.reduce((s, c) => s + n(c.difference), 0)),
      driftAfterClose: cs.length ? r2(cashNow - cashRecordedAtClose) : null,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

export const ORDER_STATUS: Record<string, string> = { issued: "صادر", notified: "مبلَّغ", objected: "قيد الاعتراض", collected: "محصَّل", cancelled: "ملغى" };
export const ASSESS_STATUS: Record<string, string> = { assessed: "مكلَّف به", ordered: "صدر أمر قبض", cancelled: "ملغى" };
export const REVIEW_STATUS: Record<string, string> = { pending_review: "بانتظار المراجعة القانونية", verified: "متحقَّق منه", superseded: "مستبدل", repealed: "ملغى", not_applicable: "غير منطبق" };
export const EXEMPT_STATUS: Record<string, string> = { pending_review: "بانتظار المراجعة", approved: "معتمد", rejected: "مرفوض", revoked: "مسحوب" };
export const OBJ_STATUS: Record<string, string> = { filed: "قيد النظر", accepted: "مقبول", rejected: "مرفوض", withdrawn: "مسحوب" };
export const METHOD: Record<string, string> = { cash: "نقدًا", transfer: "حوالة", cheque: "شيك" };
export const RATE_UNIT: Record<string, string> = { fixed: "مبلغ ثابت", per_unit: "لكل وحدة أساس", percent: "نسبة مئوية" };

export const showMoney = (x: number | null | undefined, c: string) => (x === null || x === undefined ? NA : money(x, c));
export const rateText = (r: Rule) => (r.rate === null || r.rate === undefined || !r.rate_unit ? NOT_LOADED : `${n(r.rate).toLocaleString("en-US")} ${r.rate_unit === "percent" ? "%" : r.rate_currency === "USD" ? "$" : "ل.ل."}${r.rate_unit === "per_unit" ? " / وحدة" : ""}`);

const ERR: Record<string, string> = {
  forbidden: "هذه العملية للمخوَّلين فقط (رئيس البلدية أو المدير؛ الصندوق لجميع الموظفين).", bad_input: "يرجى تعبئة الحقول المطلوبة.", bad_year: "السنة غير صالحة.", bad_amount: "المبلغ غير صالح.", bad_currency: "العملة غير صالحة.",
  bad_date: "التاريخ غير صالح (لا تاريخ مستقبليًا؛ التحصيل بأثر رجعي محدود بـ31 يومًا).", bad_method: "طريقة الدفع غير صالحة.", bad_payer_ref: "المرجع رمز بأحرف وأرقام فقط (لا اسم ولا رقم هاتف).",
  duplicate_taxpayer: "المكلّف مسجَّل مسبقًا بهذا الرمز.", duplicate_series: "رمز السلسلة مستخدم.", taxpayer_not_found: "المكلّف غير موجود أو غير فعّال.", decision_not_found: "القرار غير موجود.",
  exempt_documented: "يوجد إعفاء معتمد وموثَّق لهذا المكلّف والرسم في هذه السنة: لا يجوز التكليف.", duplicate_assessment: "تكليف قائم بالمواصفات نفسها (المكلّف، الرسم، السنة، المرجع): منع التكرار.",
  reason_required: "السبب/الملاحظة مطلوب (5 أحرف على الأقل، والإلغاء 10).", document_required: "المستند الداعم مطلوب (قرار أو مرجع مستند).", proof_required: "طريقة التبليغ وإثباته مطلوبان.",
  bad_state: "الحالة الحالية لا تسمح بهذه العملية.", order_exists: "يوجد أمر قبض فعّال لهذا التكليف.", order_cancelled: "أمر القبض ملغى.", has_collections: "على الأمر تحصيلات: ألغِ الإيصالات أولًا بعكس موثَّق.",
  objection_exists: "يوجد اعتراض قيد النظر على هذا الأمر.", objection_pending: "اعتراض قيد النظر: لا تحصيل قبل البتّ فيه (يلزم تحقق قانوني من هذا الشرط).", below_collected: "المبلغ المصحَّح أقل من المحصَّل: اعكس الإيصالات المطلوبة أولًا.",
  idempotency_key_required: "مفتاح منع التكرار مفقود: أعد فتح الصفحة.", idempotency_conflict: "مفتاح الطلب استُخدم لعملية مختلفة: أعد فتح الصفحة.", series_not_found: "سلسلة الإيصالات غير موجودة أو غير فعّالة.",
  order_collected: "الأمر محصَّل بالكامل.", exceeds_remaining: "المبلغ يتجاوز المتبقي على الأمر.", already_reversed: "الإيصال معكوس مسبقًا.", already_closed: "أُقفل صندوق هذا اليوم لهذه العملة مسبقًا.", note_required: "يوجد فرق بين المحصَّى والمسجَّل: الملاحظة مطلوبة.",
  not_found: "العنصر غير موجود.", receipt_immutable: "الإيصالات لا تُعدَّل ولا تُحذف: استخدم العكس الموثَّق.", append_only: "السجل للإضافة فقط.",
};
export function revenueError(code: string | null | undefined): string {
  const k = code ? Object.keys(ERR).find((e) => code.includes(e)) : undefined;
  return k ? ERR[k] : "تعذّر تنفيذ العملية، حاول مجددًا.";
}
export const revenueErrCode = (message: string | undefined) => Object.keys(ERR).find((e) => (message ?? "").includes(e)) ?? "unknown";

/** True when the Supabase error means the revenue tables/RPCs are not applied yet (so pages show «قيد التفعيل» instead of crashing). */
export const isMissing = (err: { code?: string; message?: string } | null | undefined) => !!err && (/^(42P01|42883|PGRST202|PGRST205)$/.test(err.code ?? "") || /does not exist|schema cache|Could not find/i.test(err.message ?? ""));

export const OK_TEXT: Record<string, string> = { taxpayer: "سُجِّل المكلّف.", rule: "أُضيفت القاعدة بحالة «بانتظار المراجعة».", review: "حُدِّثت حالة المراجعة.", series: "أُضيفت سلسلة الإيصالات.", exemption: "سُجِّل الإعفاء بانتظار الاعتماد.", exreview: "حُدِّثت حالة الإعفاء.", assess: "سُجِّل التكليف.", cancel: "أُلغي.", order: "صدر أمر القبض.", notify: "سُجِّل التبليغ.", objection: "سُجِّل الاعتراض.", resolve: "سُجِّل البتّ بالاعتراض.", collect: "سُجِّل التحصيل وصدر الإيصال.", reverse: "عُكس الإيصال بسند موثَّق.", close: "أُقفل صندوق اليوم." };
