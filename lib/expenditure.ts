// Pure helpers for the public-accounting expenditure lifecycle (no I/O, unit-tested). Mirrors the rules enforced by the RPCs in 0021_expenditure_cycle.sql;
// the database remains the authority - these functions only display, pre-validate and explain.
// Different currencies are NEVER summed. No monetary threshold and no accounting regime is assumed here.
import { r2 } from "./finance";

export type Cur = "LBP" | "USD";
export type ExpFn = "commit" | "liquidate" | "order" | "pay" | "reconcile";
export const EXP_FNS: ExpFn[] = ["commit", "liquidate", "order", "pay", "reconcile"];
export const FN_LABEL: Record<ExpFn, string> = { commit: "عقد النفقة (الالتزام)", liquidate: "تصفية النفقة", order: "إصدار أمر الصرف", pay: "الدفع", reconcile: "المطابقة" };
export const STAGES = [
  { key: "availability", label: "توفر الاعتماد" }, { key: "commit", label: "عقد النفقة" }, { key: "liquidate", label: "التصفية" },
  { key: "order", label: "أمر الصرف" }, { key: "pay", label: "الدفع" }, { key: "reconcile", label: "المطابقة" },
] as const;
export const METHODS: Record<string, string> = { cash: "نقدًا", transfer: "تحويل مصرفي", cheque: "شيك" };

/** Legal references are never shown as confirmed unless a reviewer verified them. */
export function reviewLabel(status: string | null | undefined): { text: string; verified: boolean } {
  return status === "verified" ? { text: "متحقَّق منه", verified: true } : { text: "بانتظار المراجعة القانونية", verified: false };
}

/** Accounting value in the budget-line currency. Same currency -> no rate needed. Different -> rate + date + source are mandatory (mirrors _exp_convert). */
export type Conversion = { ok: true; accounting: number; rate: number; documented: boolean } | { ok: false; code: string };
export function convert(lineCur: Cur, docCur: string, docAmount: number, rate?: number | null, rateDate?: string | null, rateSource?: string | null): Conversion {
  if (docCur !== "LBP" && docCur !== "USD") return { ok: false, code: "bad_currency" };
  if (!Number.isFinite(docAmount) || docAmount <= 0 || docAmount > 100_000_000_000) return { ok: false, code: "bad_amount" };
  if (docCur === lineCur) return { ok: true, accounting: r2(docAmount), rate: 1, documented: false };
  if (rate == null || !Number.isFinite(rate) || rate <= 0 || rate > 100_000_000) return { ok: false, code: "rate_required" };
  if (!rateDate || !/^\d{4}-\d{2}-\d{2}$/.test(rateDate)) return { ok: false, code: "rate_date_required" };
  if (!rateSource || !rateSource.trim()) return { ok: false, code: "rate_source_required" };
  const v = r2(docAmount * rate);
  return v > 0 ? { ok: true, accounting: v, rate, documented: true } : { ok: false, code: "bad_amount" };
}

/** Parses an exchange rate typed by the user (Arabic digits / decimal separators allowed); up to 8 decimals. */
export function parseRate(raw: string): number | null {
  const s = raw.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫]/g, ".").replace(/[,٬\s]/g, "");
  if (!/^\d{1,9}(\.\d{1,8})?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ---------------------------------------------------------------- row shapes (subset of columns we read)
export type CommitRow = { id: string; line_id: string; amount: number | string; entry_kind: string; reverses_id: string | null; commitment_no: string | null; description: string; committed_on: string; actor: string | null; cycle_entry: boolean; doc_currency?: string | null; doc_amount?: number | string | null; exchange_rate?: number | string | null; rate_source?: string | null; basis_ref?: string | null };
export type LiqRow = { id: string; line_id: string; commitment_id: string; liquidation_no: string; entry_kind: string; reverses_id: string | null; amount: number | string; doc_currency?: string | null; doc_amount?: number | string | null; invoice_no: string | null; invoice_date: string | null; evidence_ref?: string | null; delivery_ref?: string | null; actor: string | null; created_at: string; reason?: string | null };
export type OrderRow = { id: string; line_id: string; commitment_id: string | null; liquidation_id: string | null; order_no: string; order_date: string; entry_kind: string; reverses_id: string | null; amount: number | string; doc_currency?: string | null; doc_amount?: number | string | null; beneficiary: string; is_exceptional: boolean; exception_id: string | null; actor: string | null; created_at: string; reason?: string | null };
export type PayRow = { id: string; line_id: string; commitment_id: string | null; payment_order_id: string | null; entry_kind: string; reverses_id: string | null; amount: number | string; paid_on: string; beneficiary: string; payment_no: string | null; payment_method: string | null; proof_ref: string | null; doc_currency?: string | null; doc_amount?: number | string | null; cycle_entry: boolean; exception_id: string | null; actor: string | null; reason?: string | null };
export type RecRow = { id: string; payment_id: string; status: string; statement_ref: string; statement_date: string; statement_amount: number | string; statement_currency: string; expected_amount: number | string | null; note: string | null; created_at: string };

const n = (x: number | string | null | undefined) => Number(x ?? 0);
const sum = (a: (number | string | null | undefined)[]) => r2(a.reduce<number>((s, x) => s + n(x), 0));

/** Net figures of one commitment chain. Reversal rows carry the same parent id, so plain sums are already net. */
export function commitmentChain(c: CommitRow, commits: CommitRow[], liqs: LiqRow[], orders: OrderRow[], pays: PayRow[]) {
  const net = r2(n(c.amount) + sum(commits.filter((x) => x.reverses_id === c.id).map((x) => x.amount)));
  const liquidated = sum(liqs.filter((x) => x.commitment_id === c.id).map((x) => x.amount));
  const ordered = sum(orders.filter((x) => x.commitment_id === c.id).map((x) => x.amount));
  const paid = sum(pays.filter((x) => x.commitment_id === c.id).map((x) => x.amount));
  return {
    id: c.id, net, liquidated, ordered, paid,
    toLiquidate: Math.max(0, r2(net - liquidated)),       // still available for liquidation
    toOrder: Math.max(0, r2(liquidated - ordered)),        // liquidated but no payment order yet (general path)
    toPay: Math.max(0, r2(ordered - paid)),                // ordered but not paid
    balance: r2(net - paid),                               // commitment balance = net commitment - net payments
    reversible: Math.max(0, r2(net - Math.max(liquidated, ordered, paid))),
  };
}
export const liquidationNet = (l: LiqRow, liqs: LiqRow[]) => r2(n(l.amount) + sum(liqs.filter((x) => x.reverses_id === l.id).map((x) => x.amount)));
export const orderNet = (o: OrderRow, orders: OrderRow[]) => r2(n(o.amount) + sum(orders.filter((x) => x.reverses_id === o.id).map((x) => x.amount)));
export const paymentNet = (p: PayRow, pays: PayRow[]) => r2(n(p.amount) + sum(pays.filter((x) => x.reverses_id === p.id).map((x) => x.amount)));
export const orderRemaining = (o: OrderRow, orders: OrderRow[], pays: PayRow[]) => Math.max(0, r2(orderNet(o, orders) - sum(pays.filter((x) => x.payment_order_id === o.id).map((x) => x.amount))));
export const liquidationRemaining = (l: LiqRow, liqs: LiqRow[], orders: OrderRow[]) => Math.max(0, r2(liquidationNet(l, liqs) - sum(orders.filter((x) => x.liquidation_id === l.id).map((x) => x.amount))));

/** Reconciliation state of a payment = its latest reconciliation entry (append-only history). */
export function reconState(paymentId: string, recs: RecRow[]): "none" | "matched" | "discrepancy" {
  const r = recs.filter((x) => x.payment_id === paymentId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return r.length ? (r[0].status === "matched" ? "matched" : "discrepancy") : "none";
}

/** Next mandatory stage of a chain, in words (used as the 'required next action' hint). */
export function nextAction(ch: ReturnType<typeof commitmentChain>): string {
  if (ch.net <= 0) return "الالتزام مُلغى بالكامل: لا إجراء مطلوب.";
  if (ch.toLiquidate > 0) return "التصفية: سجّل الفاتورة/الإيصال وإثبات التسليم أو القبول.";
  if (ch.toOrder > 0) return "إصدار أمر صرف للمبلغ المصفّى.";
  if (ch.toPay > 0) return "تنفيذ الدفع وإرفاق إثباته.";
  return ch.paid > 0 ? "الدورة مكتملة لهذا الالتزام؛ تأكد من مطابقة المدفوعات." : "لا إجراء مطلوب.";
}

/** Role matrix check (UI hint only; the RPC decides): can the user perform `fn` given their active assignments. */
export function hasFn(assignments: { user_id: string; fn: string; active: boolean }[], user: string, fn: ExpFn) {
  return assignments.some((a) => a.user_id === user && a.fn === fn && a.active);
}
/** Segregation of duties: the caller may not do the next stage right after performing the previous one, unless a documented exception exists. */
export function sodBlocked(prevActor: string | null | undefined, user: string, hasException: boolean) {
  return Boolean(prevActor) && prevActor === user && !hasException;
}

// ---------------------------------------------------------------- errors (Arabic, each with the required next action)
const ERR: Record<string, string> = {
  forbidden: "هذه العملية غير متاحة لحسابك. الإجراء: راجع رئيس البلدية أو المدير.",
  function_not_assigned: "لم تُسند إليك هذه الوظيفة المالية. الإجراء: اطلب من رئيس البلدية أو المدير إسنادها إليك في «توزيع الوظائف».",
  user_not_staff: "المستخدم المختار ليس من موظفي هذه البلدية.", bad_function: "الوظيفة المالية غير صالحة.", not_found: "السجل غير موجود. الإجراء: حدّث الصفحة وأعد المحاولة.",
  bad_input: "بيانات ناقصة أو غير صالحة. الإجراء: أكمل الحقول المطلوبة.", bad_amount: "المبلغ غير صالح. الإجراء: أدخل مبلغًا موجبًا بخانتين عشريتين كحد أقصى.", bad_date: "التاريخ غير صالح. الإجراء: اختر تاريخًا صحيحًا لا يتجاوز الغد.",
  bad_currency: "العملة غير صالحة.", bad_method: "طريقة الدفع غير صالحة. الإجراء: اختر نقدًا أو تحويلًا أو شيكًا.",
  rate_required: "العملة تختلف عن عملة بند الموازنة. الإجراء: أدخل سعر الصرف الموثَّق (أكبر من صفر).", rate_date_required: "تاريخ سعر الصرف مطلوب عند اختلاف العملة. الإجراء: أدخل تاريخ السعر.",
  rate_source_required: "مصدر سعر الصرف مطلوب عند اختلاف العملة. الإجراء: اذكر المصدر (مثل: نشرة مصرفية أو قرار أو إيصال تحويل).",
  line_not_found: "بند الموازنة غير موجود.", year_closed: "السنة المالية مقفلة؛ لا قيود جديدة عليها.", not_expense_line: "هذه العملية لبنود النفقات فقط.",
  exceeds_available: "المبلغ يتجاوز الاعتماد المتاح في البند (بعد الالتزامات والأوامر غير المدفوعة). الإجراء: خفّض المبلغ أو عدّل الاعتماد بقرار مصدَّق.",
  basis_required: "مستند الالتزام (مرجع القرار/العقد/الجهة المختصة) مطلوب. الإجراء: أدخل المرجع.", decision_not_found: "القرار المختار غير موجود.", contract_not_found: "العقد المختار غير موجود.",
  idempotency_key_required: "مفتاح منع التكرار مفقود. الإجراء: حدّث الصفحة وأعد الإرسال.", idempotency_conflict: "مفتاح منع التكرار مستخدم لعملية مختلفة. الإجراء: حدّث الصفحة وأعد الإدخال.",
  commitment_not_found: "الالتزام غير موجود. الإجراء: لا تصفية قبل عقد النفقة؛ سجّل الالتزام أولًا.",
  liquidation_required: "لا يوجد تصفية لهذا الأمر. الإجراء: لا يصدر أمر صرف قبل التصفية؛ سجّل التصفية أولًا، أو افتح مسارًا استثنائيًا موثَّقًا (للرئيس/المدير).",
  order_required: "لا يوجد أمر صرف. الإجراء: لا دفع قبل أمر الصرف؛ أصدر الأمر أولًا.",
  evidence_required: "مستند الإثبات ناقص. الإجراء: أدخل رقم الفاتورة وتاريخها ومرجع المستند.", delivery_proof_required: "إثبات التسليم أو القبول مطلوب. الإجراء: أدخل مرجع محضر الاستلام أو القبول.",
  duplicate_invoice: "هذه الفاتورة مصفّاة مسبقًا على هذا الالتزام. الإجراء: راجع التصفيات السابقة أو اعكس التصفية الخاطئة أولًا.",
  exceeds_commitment: "المبلغ يتجاوز رصيد الالتزام. الإجراء: خفّض المبلغ أو سجّل التزامًا إضافيًا.", exceeds_liquidation: "المبلغ يتجاوز المتبقي من التصفية. الإجراء: خفّض المبلغ أو سجّل تصفية إضافية.",
  exceeds_order: "المبلغ يتجاوز المتبقي من أمر الصرف. الإجراء: خفّض المبلغ أو أصدر أمرًا إضافيًا.", exceeds_exception: "المبلغ يتجاوز سقف المسار الاستثنائي المعتمد. الإجراء: خفّض المبلغ أو افتح استثناءً جديدًا موثَّقًا.",
  duplicate_payment_ref: "مرجع الإثبات (رقم الشيك/الحوالة/الإيصال) مستخدم في دفعة أخرى. الإجراء: تحقق من عدم تكرار الدفع.",
  proof_required: "إثبات الدفع مطلوب. الإجراء: أدخل رقم الشيك أو مرجع الحوالة أو رقم الإيصال.", paid_before_order: "تاريخ الدفع يسبق تاريخ أمر الصرف. الإجراء: صحّح التاريخ.",
  same_actor_consecutive: "لا يجوز أن تنفّذ أنت مرحلتين متتاليتين من الدورة نفسها. الإجراء: يتولى موظف آخر هذه المرحلة، أو يوثّق رئيس البلدية/المدير استثناء فصل المهام مع مبرره ومرجعه.",
  justification_required: "المبرر القانوني مطلوب (10 أحرف على الأقل). الإجراء: اكتبه بوضوح.", reference_required: "المرجع القانوني مطلوب. الإجراء: أدخل رقم النص أو القرار؛ سيُعرض «بانتظار المراجعة القانونية» حتى يتحقق منه مراجع.",
  exception_not_found: "المسار الاستثنائي غير موجود.", reason_required: "السبب مطلوب. الإجراء: اكتب سبب العكس أو التغيير.", nothing_to_reverse: "لا مبلغ قابل للعكس: الجزء المتبقي استُخدم في مرحلة لاحقة. الإجراء: اعكس المرحلة اللاحقة أولًا.",
  reverse_exceeds: "مبلغ العكس يتجاوز القابل للعكس. الإجراء: خفّض المبلغ.", statement_required: "بيانات كشف الحساب ناقصة. الإجراء: أدخل مرجع الكشف وتاريخه.",
  nothing_to_reconcile: "لا مبلغ صافٍ لمطابقته (الدفعة معكوسة).", payment_not_found: "الدفعة غير موجودة.", duplicate_reconciliation: "هذا الكشف مسجّل لهذه الدفعة مسبقًا.",
  discrepancy_note_required: "المبلغ في الكشف يختلف عن المدفوع. الإجراء: اكتب ملاحظة تفسّر الفرق ثم أعد الإرسال.",
  use_expenditure_cycle: "الدفع/الالتزام المباشر موقوف في هذه البلدية. الإجراء: استخدم دورة الإنفاق (عقد النفقة ثم التصفية ثم أمر الصرف ثم الدفع).",
  immutable_record: "السجل معتمد ولا يُعدَّل ولا يُحذف. الإجراء: استخدم قيد العكس/التصحيح.",
};
const KEYS = Object.keys(ERR).sort((a, b) => b.length - a.length);
/** Extracts the error code from an RPC error message (longest known code wins). */
export const expCodeOf = (message: string | undefined) => KEYS.find((k) => (message ?? "").includes(k)) ?? "unknown";
export function expError(code: string | null | undefined): string {
  if (!code) return "تعذّر تنفيذ العملية. الإجراء: أعد المحاولة، وإن تكرر الخطأ فأبلغ المسؤول.";
  const k = KEYS.find((e) => code.includes(e));
  return k ? ERR[k] : "تعذّر تنفيذ العملية. الإجراء: أعد المحاولة، وإن تكرر الخطأ فأبلغ المسؤول.";
}
/** Postgres 'undefined function/table' => the migration has not been applied yet. */
export const isMissing = (e: { message?: string; code?: string } | null | undefined) => Boolean(e && (e.code === "42P01" || e.code === "42883" || e.code === "PGRST202" || e.code === "PGRST205" || /could not find the (function|table)|does not exist|schema cache/i.test(e.message ?? "")));
export const NOT_ACTIVE = "قيد التفعيل: وحدة دورة الإنفاق لم تُفعَّل بعد في قاعدة البيانات. الإجراء: يُطبَّق الترحيل 0021 ثم تُحدَّث الصفحة.";

export const OK: Record<string, string> = {
  commit: "سُجّل عقد النفقة وحُجز الاعتماد.", liquidate: "سُجّلت التصفية.", order: "أُصدر أمر الصرف.", order_x: "أُصدر أمر الصرف عبر المسار الاستثنائي (موسوم كاستثناء).", pay: "سُجّلت الدفعة.",
  reconcile: "سُجّلت المطابقة.", reverse: "سُجّل قيد العكس (السجل الأصلي باقٍ دون تعديل).", assign: "أُسندت الوظيفة.", unassign: "سُحبت الوظيفة.", exception: "وُثّق المسار الاستثنائي (يظهر موسومًا في كل السجلات).",
  sod: "وُثّق استثناء فصل المهام.", enforce: "حُدّث وضع إلزام الدورة.",
};

/** Idempotency key generated when the form renders, so a double click / resubmit cannot create a second record. */
export const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k${Date.now()}${Math.random().toString(16).slice(2)}`);
