// Pure finance computations (no I/O, unit-tested). Different currencies are NEVER summed together.
// Missing data is null, never a fake zero; every division is guarded.
import { buckets, dayKey, type Range } from "./ops";

export type Cur = "LBP" | "USD";
export const CURRENCIES: Cur[] = ["LBP", "USD"];
export const NA = "بيانات غير متوفرة";

export type Line = { id: string; code: string; title_ar: string; kind: "revenue" | "expense"; sector: string | null; original_amount: number | string; current_amount: number | string; currency: Cur };
export type Commit = { id?: string; line_id: string; amount: number | string; description?: string; committed_on?: string };
export type Exp = { id?: string; line_id: string; commitment_id: string | null; amount: number | string; paid_on: string; beneficiary?: string };
export type Recv = { id: string; fee_type: string; amount: number | string; currency: Cur; due_on: string; status: string; payer_ref?: string | null };
export type Coll = { receivable_id: string | null; amount: number | string; currency: string; created_at: string };

const n = (x: number | string) => Number(x);
/** Rounds to 2 decimals (money). */
export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Percentage with one decimal; null when the denominator is not positive. */
export const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((1000 * num) / den) / 10 : null);
const sum = (a: number[]) => r2(a.reduce((s, x) => s + x, 0));

/**
 * Per-line figures.
 *  paid        = Σ expenditures of the line
 *  committed   = Σ commitments + Σ expenditures NOT linked to a commitment (payments under a commitment are already reserved by it)
 *  available   = current appropriation − committed            (may not go below 0; enforced by the RPCs)
 *  execution   = paid / current appropriation                 (null if current = 0)
 *  commitRatio = committed / current appropriation            (SEPARATE indicator, null if current = 0)
 */
export function lineStats(line: Line, commits: Commit[], exps: Exp[]) {
  const cur = n(line.current_amount);
  const c = commits.filter((x) => x.line_id === line.id);
  const e = exps.filter((x) => x.line_id === line.id);
  const paid = sum(e.map((x) => n(x.amount)));
  const committed = r2(sum(c.map((x) => n(x.amount))) + sum(e.filter((x) => !x.commitment_id).map((x) => n(x.amount))));
  return { id: line.id, currency: line.currency, kind: line.kind, current: cur, original: n(line.original_amount), paid, committed, available: r2(cur - committed), execution: line.kind === "expense" ? pct(paid, cur) : null, commitRatio: line.kind === "expense" ? pct(committed, cur) : null };
}
export type LineStats = ReturnType<typeof lineStats>;

/** Totals per currency for lines of one kind. Rates are null when the appropriation is 0. Returns only currencies that have lines. */
export function budgetTotals(lines: Line[], commits: Commit[], exps: Exp[], kind: "revenue" | "expense" = "expense") {
  const stats = lines.filter((l) => l.kind === kind).map((l) => lineStats(l, commits, exps));
  return CURRENCIES.map((currency) => {
    const s = stats.filter((x) => x.currency === currency);
    if (!s.length) return null;
    const appropriation = sum(s.map((x) => x.current)), paid = sum(s.map((x) => x.paid)), committed = sum(s.map((x) => x.committed));
    return { currency, lines: s.length, appropriation, paid, committed, available: r2(appropriation - committed), execution: kind === "expense" ? pct(paid, appropriation) : null, commitRatio: kind === "expense" ? pct(committed, appropriation) : null };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

/** Amount collected (linked entries) and remaining for each receivable. Entries in another currency than the receivable are ignored. */
export function receivableState(r: Recv, colls: Coll[]) {
  const amount = n(r.amount);
  const collected = sum(colls.filter((c) => c.receivable_id === r.id && c.currency === r.currency).map((c) => n(c.amount)));
  return { amount, collected, remaining: Math.max(0, r2(amount - collected)) };
}

/** Receivables that are due on or before `asOf` (YYYY-MM-DD) and within [from,to] by due date (when a range is given), excluding cancelled. */
function dueIn(recvs: Recv[], asOf: string, range?: { from: string; to: string }) {
  return recvs.filter((r) => r.status !== "cancelled" && r.due_on <= asOf && (!range || (r.due_on >= range.from && r.due_on <= range.to)));
}

/**
 * Collection rate per currency = collected linked to the due receivables / due receivables amount × 100.
 * Over-collection of a single receivable is capped at its amount. null (never 0%) when nothing is due.
 */
export function collectionRate(recvs: Recv[], colls: Coll[], asOf: string, range?: { from: string; to: string }) {
  const due = dueIn(recvs, asOf, range);
  return CURRENCIES.map((currency) => {
    const d = due.filter((r) => r.currency === currency);
    if (!d.length) return null;
    const st = d.map((r) => receivableState(r, colls));
    const dueAmount = sum(st.map((s) => s.amount));
    const collected = sum(st.map((s) => Math.min(s.collected, s.amount)));
    return { currency, count: d.length, due: dueAmount, collected, rate: pct(collected, dueAmount) };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

const dayDiff = (a: string, b: string) => Math.floor((+new Date(`${a}T00:00:00Z`) - +new Date(`${b}T00:00:00Z`)) / 86_400_000);
export const ARREARS_BUCKETS = [["١–٣٠ يومًا", 1, 30], ["٣١–٩٠ يومًا", 31, 90], ["أكثر من ٩٠ يومًا", 91, Infinity]] as const;

/** Arrears = open receivables whose due date is before `today` with a positive remaining balance; per currency, with ageing buckets. */
export function arrears(recvs: Recv[], colls: Coll[], today: string) {
  const late = recvs
    .filter((r) => r.status === "open" && r.due_on < today)
    .map((r) => ({ r, ...receivableState(r, colls), days: dayDiff(today, r.due_on) }))
    .filter((x) => x.remaining > 0);
  return CURRENCIES.map((currency) => {
    const l = late.filter((x) => x.r.currency === currency);
    if (!l.length) return null;
    return { currency, count: l.length, total: sum(l.map((x) => x.remaining)), buckets: ARREARS_BUCKETS.map(([label, lo, hi]) => ({ label, count: l.filter((x) => x.days >= lo && x.days <= hi).length, amount: sum(l.filter((x) => x.days >= lo && x.days <= hi).map((x) => x.remaining)) })) };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

/** Per-currency sum of any {amount,currency} list. */
export function totalsByCurrency(items: { amount: number | string; currency: string }[]) {
  return CURRENCIES.map((currency) => ({ currency, total: sum(items.filter((i) => i.currency === currency).map((i) => n(i.amount))), count: items.filter((i) => i.currency === currency).length })).filter((x) => x.count > 0);
}

/** Revenue (all collection entries) vs expense (payments) per bucket of the period, one series per currency. Expense currency comes from its line. */
export function monthlyFlow(colls: Coll[], exps: Exp[], lines: Line[], range: Range) {
  const bk = buckets(range);
  const keyOf = (d: string) => (bk.monthly ? dayKey(d).slice(0, 7) : dayKey(d));
  const lineCur = new Map(lines.map((l) => [l.id, l.currency]));
  const inR = (d: string) => { const t = +new Date(d.length === 10 ? `${d}T12:00:00+02:00` : d); return t >= +range.from && t <= +range.to + 86_400_000; };
  return CURRENCIES.map((currency) => {
    const cs = colls.filter((c) => c.currency === currency && inR(c.created_at));
    const es = exps.filter((e) => lineCur.get(e.line_id) === currency && inR(e.paid_on));
    if (!cs.length && !es.length) return null;
    const series = bk.list.map((b) => ({ key: b.key, label: b.label, revenue: sum(cs.filter((c) => keyOf(c.created_at) === b.key).map((c) => n(c.amount))), expense: sum(es.filter((e) => keyOf(e.paid_on) === b.key).map((e) => n(e.amount))) }));
    return { currency, revenue: sum(cs.map((c) => n(c.amount))), expense: sum(es.map((e) => n(e.amount))), series };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

export const money = (x: number, c: string) => `${x.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c === "USD" ? "$" : "ل.ل."}`;
export const curName = (c: string) => (c === "USD" ? "دولار" : "ليرة");

/** Parses a user-typed amount (Arabic-Indic digits and thousands separators allowed) into a number with at most 2 decimals; null if invalid. */
export function parseAmount(raw: string, opts: { signed?: boolean } = {}): number | null {
  const s = raw.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫]/g, ".").replace(/[,٬\s]/g, "");
  const re = opts.signed ? /^[+-]?\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}(\.\d{1,2})?$/;
  if (!re.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

const ERR: Record<string, string> = {
  forbidden: "هذه العملية لرئيس البلدية أو المدير فقط.", bad_year: "السنة المالية غير صالحة.", bad_input: "يرجى تعبئة الحقول المطلوبة.", bad_kind: "نوع البند غير صالح.",
  bad_currency: "العملة غير صالحة.", bad_amount: "المبلغ غير صالح.", year_closed: "السنة المالية مقفلة.", duplicate_code: "رمز البند مستخدم في هذه السنة.",
  line_not_found: "بند الموازنة غير موجود.", reason_required: "سبب التعديل مطلوب.", below_zero: "لا يمكن أن يصبح الاعتماد سالبًا.",
  below_commitments: "الاعتماد الجديد أقل من الالتزامات والمدفوعات القائمة.", not_expense_line: "هذه العملية لبنود النفقات فقط.",
  exceeds_available: "المبلغ يتجاوز الاعتماد المتاح (الاعتماد الحالي ناقص الالتزامات).", bad_date: "التاريخ غير صالح.", commitment_not_found: "الالتزام غير موجود في هذا البند.",
  exceeds_commitment: "المبلغ يتجاوز المتبقي من الالتزام.", bad_payer_ref: "مرجع المكلّف رمز (رقم ملف أو معاملة) بأحرف وأرقام فقط، لا اسم ولا رقم هاتف.",
  receivable_not_found: "المستحق غير موجود.", receivable_closed: "المستحق مغلق.", bad_method: "طريقة الدفع غير صالحة.", exceeds_remaining: "المبلغ يتجاوز المتبقي من المستحق.",
};
/** Maps an RPC/error code (or a raw error message containing one) to a clear Arabic message. */
export function financeError(code: string | null | undefined): string {
  if (!code) return "تعذّر تنفيذ العملية، حاول مجددًا.";
  const k = Object.keys(ERR).find((e) => code.includes(e));
  return k ? ERR[k] : "تعذّر تنفيذ العملية، حاول مجددًا.";
}
export const errCodeOf = (message: string | undefined) => Object.keys(ERR).find((e) => (message ?? "").includes(e)) ?? "unknown";
