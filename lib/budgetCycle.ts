// Budget lifecycle, typed credit amendments, availability and fiscal-year closing: pure helpers (no I/O, unit-tested).
// No legal numbers here: required-field matrices mirror the database table credit_amendment_rule (pending legal review) and
// the supplementary period ("المدة المتممة") is an input, never a constant.
import { NO_TACIT } from "./council";

export const NEEDS_REVIEW = "يلزم تحقق";

/* ───────────── lifecycle ───────────── */
export const CYCLE_STAGES = ["preparation", "draft", "explanatory_report", "presented", "adopted", "validated", "executing", "closed"] as const;
export type CycleStage = (typeof CYCLE_STAGES)[number];
export const CYCLE_LABEL: Record<CycleStage, string> = {
  preparation: "التحضير", draft: "مشروع الموازنة", explanatory_report: "التقرير الإيضاحي", presented: "العرض على المجلس",
  adopted: "اعتماد المجلس", validated: "تصديق سلطة الرقابة", executing: "التنفيذ", closed: "مقفلة",
};
/** What evidence each forward step needs (shown to the user before they submit). */
export const STAGE_EVIDENCE: Record<Exclude<CycleStage, "preparation" | "closed">, string> = {
  draft: "تاريخ إعداد مشروع الموازنة",
  explanatory_report: "تاريخ التقرير الإيضاحي",
  presented: "تاريخ العرض على المجلس (والجلسة إن وُجدت)",
  adopted: "قرار المجلس باعتماد الموازنة (من فئة «موازنة») وتاريخه",
  validated: "تاريخ التصديق الصريح وجهة التصديق — لا تصديق حكمي للموازنة",
  executing: "تاريخ بدء التنفيذ (يُتحقَّق من أدلة الاعتماد والتصديق)",
};
export const stageIndex = (s: string) => CYCLE_STAGES.indexOf(s as CycleStage);
export const nextStage = (s: string): CycleStage | null => {
  const i = stageIndex(s);
  // 'closed' is reached only through the closing wizard, never through the stepper.
  return i < 0 || i >= CYCLE_STAGES.indexOf("executing") ? null : CYCLE_STAGES[i + 1];
};

export type CycleRow = {
  status: string; draft_on?: string | null; report_on?: string | null; presented_on?: string | null;
  adoption_decision_id?: string | null; adopted_on?: string | null; validation_authority?: string | null; validated_on?: string | null; executing_on?: string | null;
};
export type DecisionLite = { legal_status: string; category: string } | null | undefined;
const ADOPTED = ["adopted", "under_review", "effective"];

/** Arabic list of what is still missing before the budget may be executed. Empty = execution evidence is complete. */
export function executionMissing(c: CycleRow | null | undefined, decision?: DecisionLite): string[] {
  if (!c) return ["لم يُفتح مسار دورة الموازنة لهذه السنة (لا أدلة اعتماد أو تصديق مسجَّلة)."];
  const out: string[] = [];
  if (!c.adoption_decision_id) out.push("قرار المجلس البلدي باعتماد الموازنة غير مسجَّل.");
  else if (decision) {
    if (!ADOPTED.includes(decision.legal_status)) out.push("قرار الاعتماد المسجَّل لم يعد في حالة «متخذ/نافذ» (معلّق أو ملغى أو مسودة).");
    if (decision.category !== "budget") out.push("قرار الاعتماد ليس من فئة «موازنة»، لذا لا يُعتدّ به.");
  }
  if (!c.adopted_on) out.push("تاريخ اعتماد الموازنة غير مسجَّل.");
  if (!c.validated_on) out.push("تاريخ تصديق سلطة الرقابة على الموازنة غير مسجَّل (لا تصديق حكمي للموازنة).");
  if (!c.validation_authority || !c.validation_authority.trim()) out.push("جهة التصديق (القائمقام/المحافظ/الوزير…) غير مسجَّلة.");
  if (c.validated_on && c.adopted_on && c.validated_on < c.adopted_on) out.push("تاريخ التصديق سابق لتاريخ الاعتماد: تحقّق من التواريخ.");
  return out;
}
export const canExecute = (c: CycleRow | null | undefined, decision?: DecisionLite) => executionMissing(c, decision).length === 0;
/** Budget and credit-transfer decisions are never eligible for tacit approval (art. 63, pending lawyer review). */
export const noTacit = (category: string) => NO_TACIT.includes(category);

/** Stage dates in order, for the audit timeline. */
export function stageDates(c: CycleRow): { stage: CycleStage; on: string | null }[] {
  return [
    { stage: "draft", on: c.draft_on ?? null }, { stage: "explanatory_report", on: c.report_on ?? null }, { stage: "presented", on: c.presented_on ?? null },
    { stage: "adopted", on: c.adopted_on ?? null }, { stage: "validated", on: c.validated_on ?? null }, { stage: "executing", on: c.executing_on ?? null },
  ];
}

/* ───────────── amendment types ───────────── */
export const AMEND_TYPES = ["amended", "opening", "transfer", "additional", "supplementary", "exceptional", "carried_over", "lapsed", "suspended"] as const;
export type AmendType = (typeof AMEND_TYPES)[number];
export const AMEND_LABEL: Record<AmendType | "original" | "effective", string> = {
  original: "أصلي", effective: "فعلي (نافذ)", amended: "معدَّل", opening: "فتح اعتماد", transfer: "نقل اعتماد", additional: "إضافي", supplementary: "تكميلي",
  exceptional: "استثنائي", carried_over: "مُرحَّل", lapsed: "ساقط", suspended: "معلّق",
};
export type AmendRule = { sign: "positive" | "negative" | "either" | "pair"; affectsCredit: boolean; decision: boolean; funding: boolean; authority: boolean; validation: boolean; effectiveDate: boolean };
/** Default mirror of the credit_amendment_rule table seed (all pending legal review). The database is authoritative. */
export const DEFAULT_RULES: Record<AmendType, AmendRule> = {
  amended: { sign: "either", affectsCredit: true, decision: true, funding: false, authority: true, validation: true, effectiveDate: true },
  opening: { sign: "positive", affectsCredit: true, decision: true, funding: true, authority: true, validation: true, effectiveDate: true },
  transfer: { sign: "pair", affectsCredit: true, decision: true, funding: false, authority: true, validation: true, effectiveDate: true },
  additional: { sign: "positive", affectsCredit: true, decision: true, funding: true, authority: true, validation: true, effectiveDate: true },
  supplementary: { sign: "positive", affectsCredit: true, decision: true, funding: true, authority: true, validation: true, effectiveDate: true },
  exceptional: { sign: "positive", affectsCredit: true, decision: true, funding: true, authority: true, validation: true, effectiveDate: true },
  carried_over: { sign: "positive", affectsCredit: true, decision: true, funding: true, authority: false, validation: false, effectiveDate: true },
  lapsed: { sign: "negative", affectsCredit: true, decision: false, funding: false, authority: false, validation: false, effectiveDate: true },
  suspended: { sign: "positive", affectsCredit: false, decision: true, funding: false, authority: true, validation: false, effectiveDate: true },
};
export type AmendInput = { reason?: string; decision?: string | null; funding?: string; authority?: string; validatedOn?: string | null; effectiveOn?: string | null };
const blank = (v: string | null | undefined) => !v || !v.trim();
/** Arabic list of required fields that are missing for this amendment type. Reason is always required. */
export function amendMissing(type: AmendType, i: AmendInput, rules: Record<AmendType, AmendRule> = DEFAULT_RULES): string[] {
  const r = rules[type];
  if (!r) return ["نوع التعديل غير معروف."];
  const out: string[] = [];
  if (blank(i.reason)) out.push("السبب");
  if (r.decision && blank(i.decision)) out.push("قرار المجلس");
  if (r.funding && blank(i.funding)) out.push("مصدر التمويل");
  if (r.effectiveDate && blank(i.effectiveOn)) out.push("تاريخ النفاذ");
  // authority is needed whenever the amendment is going to take effect now (no validation required, or a validation date is given)
  if (r.authority && (!r.validation || !blank(i.validatedOn)) && blank(i.authority)) out.push("جهة التصديق/المرجع");
  return out;
}
/** Will the amendment be applied to the credit at once (true) or stay pending (false)? Never tacit: validation is an explicit date. */
export const appliesNow = (type: AmendType, validatedOn: string | null | undefined, rules: Record<AmendType, AmendRule> = DEFAULT_RULES) => !rules[type].validation || !blank(validatedOn);
/** Signed delta for a typed amendment from the amount the user typed. Throws-free: returns null when the amount is not usable for the type. */
export function signedDelta(type: AmendType, amount: number, rules: Record<AmendType, AmendRule> = DEFAULT_RULES): number | null {
  if (!Number.isFinite(amount) || amount === 0) return null;
  const s = rules[type].sign;
  if (s === "pair") return null;
  if (s === "either") return amount;
  if (amount < 0) return null;
  return s === "negative" ? -amount : amount;
}

/* ───────────── availability engine (mirror of v_budget_line_availability) ───────────── */
export type AvLine = { id: string; kind: "revenue" | "expense"; original_amount: number | string; current_amount: number | string; currency: string };
export type AvCommit = { id?: string; line_id: string; amount: number | string };
export type AvExp = { line_id: string; commitment_id: string | null; amount: number | string };
export type AvAmend = { line_id: string; delta: number | string; applied: boolean; amendment_type?: string | null; suspension_released_on?: string | null };
const num = (x: number | string) => Number(x);
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const sum = (a: number[]) => r2(a.reduce((s, x) => s + x, 0));

/**
 * Availability of one line.
 *  effectiveCredit = current credit (original + applied amendments)
 *  reserved        = Σ commitments + Σ payments WITHOUT a commitment + unpaid direct orders   (a payment under a commitment is never counted again)
 *  suspended       = applied, unreleased 'suspended' amendments
 *  available       = effectiveCredit − suspended − reserved           (pending amendments are NOT included; shown separately)
 *  drift           = effectiveCredit − (original + applied amendments excluding suspensions) — must be 0
 */
export function availability(line: AvLine, commits: AvCommit[], exps: AvExp[], amends: AvAmend[], unpaidDirectOrders = 0) {
  const c = commits.filter((x) => x.line_id === line.id), e = exps.filter((x) => x.line_id === line.id), a = amends.filter((x) => x.line_id === line.id);
  const isSusp = (x: AvAmend) => x.amendment_type === "suspended";
  const effectiveCredit = num(line.current_amount);
  const appliedSum = sum(a.filter((x) => x.applied && !isSusp(x)).map((x) => num(x.delta)));
  const pending = a.filter((x) => !x.applied && !isSusp(x));
  const suspended = sum(a.filter((x) => x.applied && isSusp(x) && !x.suspension_released_on).map((x) => num(x.delta)));
  const commitments = sum(c.map((x) => num(x.amount)));
  const paidOn = sum(e.filter((x) => x.commitment_id).map((x) => num(x.amount)));
  const paidDirect = sum(e.filter((x) => !x.commitment_id).map((x) => num(x.amount)));
  const unpaidDirect = Math.max(0, r2(unpaidDirectOrders));   // direct payment orders (expenditure cycle) not yet paid still reserve credit
  const reserved = r2(commitments + paidDirect + unpaidDirect);
  return {
    lineId: line.id, currency: line.currency, kind: line.kind, original: num(line.original_amount), effectiveCredit, appliedAmendments: appliedSum,
    pendingAmendments: sum(pending.map((x) => num(x.delta))), pendingCount: pending.length, suspended, commitments, paidOnCommitments: paidOn, paidWithoutCommitment: paidDirect, unpaidDirectOrders: unpaidDirect,
    paidTotal: r2(paidOn + paidDirect), commitmentsOutstanding: r2(commitments - paidOn), reserved,
    available: line.kind === "expense" ? r2(effectiveCredit - suspended - reserved) : null,
    drift: r2(effectiveCredit - (num(line.original_amount) + appliedSum)),
  };
}
export type Availability = ReturnType<typeof availability>;

/** Per-currency totals of expense lines (currencies are never summed together). */
export function availabilityTotals(rows: Availability[]) {
  const cur = [...new Set(rows.filter((r) => r.kind === "expense").map((r) => r.currency))].sort();
  return cur.map((currency) => {
    const x = rows.filter((r) => r.kind === "expense" && r.currency === currency);
    return { currency, lines: x.length, credit: sum(x.map((r) => r.effectiveCredit)), reserved: sum(x.map((r) => r.reserved)), paid: sum(x.map((r) => r.paidTotal)), suspended: sum(x.map((r) => r.suspended)), pending: sum(x.map((r) => r.pendingAmendments)), available: sum(x.map((r) => r.available ?? 0)) };
  });
}

/* ───────────── closing ───────────── */
export type Check = { code: string; level: "block" | "warn" | "ok"; count: number };
export const CHECK_LABEL: Record<string, { title: string; fix: string }> = {
  closing_not_started: { title: "لم يبدأ مسار الإقفال", fix: "ابدأ الإقفال لهذه السنة أولًا." },
  open_commitments_unresolved: { title: "التزامات مفتوحة بلا معالجة", fix: "سدّد المتبقي أو سجّل لكل التزام: ترحيل أو إسقاط." },
  pending_amendments: { title: "تعديلات اعتماد معلّقة", fix: "صدّق التعديلات المعلّقة أو عالجها قبل الإقفال." },
  payments_exceed_commitment: { title: "مدفوعات تتجاوز الالتزام", fix: "صحّح البيانات قبل الإقفال (لا يُفترض أن يحدث)." },
  reserved_exceeds_credit: { title: "التزامات ومدفوعات تتجاوز الاعتماد", fix: "راجع البنود وأصدر تعديلًا مصدَّقًا أو صحّح الخطأ." },
  credit_drift: { title: "الاعتماد الحالي لا يطابق الأصلي + التعديلات", fix: "طابق سجل التعديلات مع الاعتماد قبل الإقفال." },
  payments_without_commitment: { title: "مدفوعات دون التزام مسبق", fix: "تنبيه: وثّق مبررها في قطع الحساب." },
  supplementary_not_set: { title: "المدة المتممة غير محدَّدة", fix: `أدخل مدة المتممة أو تاريخ انتهائها (${NEEDS_REVIEW}).` },
  supplementary_not_ended: { title: "المدة المتممة لم تنتهِ بعد", fix: "انتظر انتهاءها قبل الإقفال." },
  supplementary_unverified: { title: "مدة المتممة غير موثَّقة قانونيًا", fix: `${NEEDS_REVIEW}: اعرض المدة على المختص ثم علّمها موثَّقة.` },
  final_account_missing: { title: "قطع الحساب غير مسجَّل", fix: "سجّل قرار المجلس بقطع الحساب وتاريخ إعداده." },
  final_account_decision_not_adopted: { title: "قرار قطع الحساب غير معتمد", fix: "اعتمد القرار في سجل المجلس." },
  final_account_not_validated: { title: "تصديق قطع الحساب غير مسجَّل", fix: `تنبيه: سجّل تاريخ التصديق إن لزم (${NEEDS_REVIEW}).` },
};
export const checkLabel = (code: string) => CHECK_LABEL[code] ?? { title: code, fix: "" };
export const blockers = (checks: Check[]) => checks.filter((c) => c.level === "block");
export const warnings = (checks: Check[]) => checks.filter((c) => c.level === "warn");
export const canClose = (checks: Check[]) => checks.length > 0 && blockers(checks).length === 0;

const dayMs = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** End of the supplementary period = fiscal year end + configured days. Null when the length is not configured (never defaulted). */
export function supplementaryEnd(yearEnd: string, days: number | null | undefined): string | null {
  if (days === null || days === undefined || !Number.isInteger(days) || days < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(yearEnd)) return null;
  return new Date(parse(yearEnd) + days * dayMs).toISOString().slice(0, 10);
}
/** The period is over only strictly after its last day. Null when no end date is set. */
export const supplementaryOver = (endsOn: string | null | undefined, today: string): boolean | null => (endsOn ? today > endsOn : null);
export const defaultYearEnd = (year: number) => `${year}-12-31`;

/** Unresolved open commitments: remaining > 0 and no carry-over/lapse resolution. Currencies come from the line. */
export function openCommitments(commits: { id: string; line_id: string; amount: number | string }[], exps: AvExp[], resolvedIds: Set<string>, reversed: Map<string, number> = new Map()) {
  // reversal rows (negative amounts, expenditure cycle) are not commitments; a commitment's net = its amount + its reversals (given as negative numbers)
  return commits.filter((c) => num(c.amount) > 0).map((c) => {
    const paid = sum(exps.filter((e) => e.commitment_id === c.id).map((e) => num(e.amount)));
    const net = r2(num(c.amount) + (reversed.get(c.id) ?? 0));
    return { id: c.id, lineId: c.line_id, amount: net, paid, remaining: r2(net - paid), resolved: resolvedIds.has(c.id) };
  }).filter((x) => x.remaining > 0);
}

/* ───────────── errors / parsing ───────────── */
const ERR: Record<string, string> = {
  forbidden: "هذه العملية لرئيس البلدية أو المدير فقط.", bad_year: "السنة المالية غير صالحة.", year_closed: "السنة المالية مقفلة ولا تقبل أي كتابة.", year_not_closed: "السنة المالية غير مقفلة.",
  cycle_not_found: "لم يُفتح مسار دورة الموازنة لهذه السنة؛ افتحه أولًا.", bad_stage: "المرحلة غير صالحة.", stage_order: "لا تُتخطّى المراحل: تُسجَّل المرحلة التالية مباشرة فقط.",
  bad_date: "التاريخ غير صالح (لا مستقبلًا ولا سابقًا لمرحلة سابقة).", decision_required: "اختر قرار المجلس المطلوب.", decision_not_adopted: "القرار المختار ليس معتمدًا (أو عُلّق/أُلغي).",
  decision_not_budget: "قرار الاعتماد يجب أن يكون من فئة «موازنة» (لا تصديق حكمي للموازنة).", decision_not_accounts: "قرار قطع الحساب يجب أن يكون من فئة «حسابات».",
  authority_required: "جهة التصديق/المرجع مطلوبة.", adoption_evidence_missing: "لا يمكن بدء التنفيذ: قرار اعتماد الموازنة وتاريخه غير مسجَّلين.",
  validation_evidence_missing: "لا يمكن بدء التنفيذ: تاريخ تصديق سلطة الرقابة وجهته غير مسجَّلين.", budget_not_executing: "الموازنة ليست في مرحلة التنفيذ بعد (أو لم تُستكمل أدلة الاعتماد والتصديق).",
  budget_cycle_required: "لا يجوز التنفيذ قبل فتح مسار دورة الموازنة وتسجيل أدلة الاعتماد والتصديق.", commitments_frozen: "الإقفال جارٍ: لا التزامات جديدة ولا مدفوعات بلا التزام قائم.",
  credit_suspended: "جزء من الاعتماد معلّق؛ المبلغ يتجاوز المتاح بعد خصم المعلّق.", bad_type: "نوع التعديل غير معروف.", use_transfer_rpc: "النقل بين بندين يُسجَّل من نموذج «نقل اعتماد».",
  use_typed_validation: "هذا التعديل مُصنَّف النوع ويُصدَّق من صفحة دورة الموازنة.", funding_required: "مصدر التمويل مطلوب لهذا النوع.", effective_date_required: "تاريخ النفاذ مطلوب لهذا النوع.",
  bad_amount: "المبلغ غير صالح لهذا النوع.", reason_required: "السبب مطلوب (وللإعادة الفتح 15 حرفًا على الأقل).", exceeds_available: "المبلغ يتجاوز الاعتماد المتاح.", below_zero: "لا يمكن أن يصبح الاعتماد سالبًا.",
  below_commitments: "الاعتماد الجديد أقل من الالتزامات والمدفوعات القائمة.", transfer_year_mismatch: "بندا النقل من سنتين ماليتين مختلفتين.", transfer_currency_mismatch: "بندا النقل بعملتين مختلفتين.",
  not_expense_line: "هذه العملية لبنود النفقات فقط.", line_not_found: "بند الموازنة غير موجود.", already_applied: "هذا البند مطبَّق/مرفوع مسبقًا.", not_found: "العنصر غير موجود.",
  closing_not_started: "لم يبدأ مسار الإقفال لهذه السنة.", closing_blocked: "الإقفال ممنوع: توجد شروط غير مستوفاة (راجع قائمة التحقق).", nothing_to_resolve: "لا متبقٍّ على هذا الالتزام.",
  commitment_not_found: "الالتزام غير موجود.", bad_input: "يرجى تعبئة الحقول المطلوبة بشكل صحيح.",
};
/** Longest key first so e.g. 'decision_not_budget' is not shadowed. */
const KEYS = Object.keys(ERR).sort((a, b) => b.length - a.length);
export const cycleErrCode = (message: string | undefined) => KEYS.find((k) => (message ?? "").includes(k)) ?? "unknown";
export const cycleError = (code: string | null | undefined): string => {
  if (!code) return "تعذّر تنفيذ العملية، حاول مجددًا.";
  const k = KEYS.find((e) => code.includes(e));
  return k ? ERR[k] : "تعذّر تنفيذ العملية، حاول مجددًا.";
};
/** Tolerant detection of "table/function does not exist" so pages can show «قيد التفعيل» instead of crashing. */
export const isMissingObject = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (["42P01", "42883", "PGRST202", "PGRST205", "PGRST200"].includes(e.code ?? "") || /does not exist|could not find|schema cache/i.test(e.message ?? ""));
export const PENDING_ACTIVATION = "قيد التفعيل: وحدة دورة الموازنة وإقفال السنة تنتظر تطبيق الترحيل 0023 على قاعدة البيانات.";
