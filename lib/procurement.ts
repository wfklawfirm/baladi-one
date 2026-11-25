// Pure helpers for the procurement extension (Law 244/2021 as documented in docs/). No I/O. Dates are YYYY-MM-DD strings.
// NOTHING here hard-codes a legal threshold or ratio: thresholds come from the procurement_threshold table (empty by default).
import { METHOD } from "@/lib/council";

export const NO_THRESHOLD_MSG = "بيانات غير متوفرة: حمّل السقوف النافذة";
export const SPLIT_MSG = "احتمال تجزئة يستلزم التحقق";
export const ART29_NOT_LOADED = "غير محمَّل — يلزم تحقق";
export const PENDING_NOTICE = "قيد التفعيل: هذه الميزة بانتظار تطبيق ترحيل قاعدة البيانات 0024.";

export const PLAN_STATUS: Record<string, string> = { planned: "مخطط", in_progress: "قيد التنفيذ", done: "منجز", cancelled: "ملغى" };
export const COMMITTEE_KIND: Record<string, string> = { award: "لجنة التلزيم", acceptance: "لجنة الاستلام" };
export const COMMITTEE_RESULT: Record<string, string> = { pending: "لم تُصدر نتيجة", accepted: "استلام مقبول", accepted_reservations: "استلام مع تحفظات", rejected: "مرفوض" };
export const PUB_KIND: Record<string, string> = { tender_notice: "إعلان المناقصة", award_notice: "قبول العرض الفائز", contract_notice: "إعلان العقد", other: "أخرى" };
export const REVIEW_STATUS: Record<string, string> = { pending_review: "بانتظار المراجعة", verified: "مراجَع", rejected: "مرفوض", superseded: "مستبدل" };

export const STAGES = ["need", "study", "estimate", "funding", "method", "publication", "offers", "evaluation", "committee", "award", "notice", "objections", "standstill", "contract", "execution", "acceptance"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { need: "تحديد الحاجة", study: "الدراسة", estimate: "التقدير (الكلفة التقديرية)", funding: "التمويل والاعتماد", method: "أسلوب الشراء", publication: "النشر الرسمي", offers: "العروض", evaluation: "التقييم", committee: "لجنة التلزيم", award: "الترسية", notice: "إشعار قبول العرض", objections: "الاعتراضات", standstill: "فترة التجميد", contract: "العقد", execution: "التنفيذ", acceptance: "الاستلام" };

export const PROC_ERR: Record<string, string> = {
  bad_input: "تحقق من المدخلات.", bad_method: "أسلوب الشراء غير صالح.", not_found: "العنصر غير موجود.",
  source_required: "المصدر مطلوب لتحميل أي سقف أو نسبة (نص قانوني أو مرسوم أو تعميم).",
  reason_required: "السبب الموثَّق مطلوب (15 حرفًا على الأقل) لربط قرار بعقد بعد إنشائه.",
  already_linked: "العقد مربوط بقرار أصلًا؛ لا يُستبدل الربط.",
  result_date_required: "سجّل تاريخ النتيجة.",
  acceptance_warning: "تنبيه: لا يوجد محضر لجنة استلام بنتيجة إيجابية لهذا العقد. أكّد الإنهاء صراحةً إن أردت المتابعة.",
  acceptance_required: "لا يمكن إنهاء العقد: لا محضر لجنة استلام بنتيجة إيجابية (القاعدة مراجَعة).",
  pending: PENDING_NOTICE,
};
export const procErr = (code?: string) => (code && PROC_ERR[code]) || "تعذّر تنفيذ العملية، تحقق من المدخلات.";
/** Maps a Supabase/PostgREST error to a code understood by procErr; 'pending' when the table/RPC is not deployed yet. */
export function procErrCode(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return "1";
  if (isMissingErr(e)) return "pending";
  const k = Object.keys(PROC_ERR).find((x) => x !== "pending" && (e.message ?? "").includes(x));
  return k ?? "1";
}
/** True when the error means the table, column or function does not exist yet (migration not applied). */
export function isMissingErr(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false;
  const c = e.code ?? "", m = (e.message ?? "").toLowerCase();
  return ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(c) || m.includes("does not exist") || m.includes("could not find the") || m.includes("schema cache");
}

// ---------- thresholds & recommender ----------
export type Threshold = { id?: string; method: string; min_value: number | string; max_value: number | string | null; currency: string; effective_from: string; effective_to: string | null; source: string; review_status: string };
export type Recommendation =
  | { status: "no_data"; message: string; methods: [] }
  | { status: "no_match"; message: string; methods: [] }
  | { status: "matched"; message: string; methods: { method: string; label: string; review_status: string; source: string; note: string }[] };

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
/** Thresholds in force on `today` for a currency. Rejected / superseded rows are ignored. */
export function activeThresholds(ts: Threshold[], currency: string, today: string): Threshold[] {
  return ts.filter((t) => t.currency === currency && t.effective_from <= today && (!t.effective_to || t.effective_to >= today) && t.review_status !== "rejected" && t.review_status !== "superseded");
}
/** Table-driven recommender. Returns 'no_data' when NO threshold is loaded at all (never guesses); never blocks anything. Both bounds are inclusive; boundary cases return several methods for human review. */
export function recommendMethod(value: number, currency: string, ts: Threshold[], today: string): Recommendation {
  if (!ts.length) return { status: "no_data", message: NO_THRESHOLD_MSG, methods: [] };
  const act = activeThresholds(ts, currency, today);
  if (!act.length) return { status: "no_data", message: NO_THRESHOLD_MSG + " (لا سقوف نافذة بهذه العملة في هذا التاريخ)", methods: [] };
  const hit = act.filter((t) => value >= n(t.min_value) && (t.max_value === null || t.max_value === undefined || value <= n(t.max_value)));
  if (!hit.length) return { status: "no_match", message: "لا تغطي السقوف المحمَّلة هذه القيمة؛ راجع الجدول والنص النافذ.", methods: [] };
  return {
    status: "matched",
    message: hit.length > 1 ? "أكثر من أسلوب ممكن وفق السقوف المحمَّلة: يلزم تقدير المختص." : "توصية استرشادية وفق السقوف المحمَّلة؛ لا تُلزم ولا تمنع أي إجراء.",
    methods: hit.map((t) => ({ method: t.method, label: METHOD[t.method] ?? t.method, review_status: t.review_status, source: t.source, note: t.review_status === "verified" ? "" : "السقف بانتظار المراجعة القانونية" })),
  };
}
/** Does the chosen method sit outside the recommendation? Informational only (null when there is no usable recommendation). */
export function methodMismatch(chosen: string | null, rec: Recommendation): boolean | null {
  if (!chosen || rec.status !== "matched") return null;
  return !rec.methods.some((m) => m.method === chosen);
}

// ---------- split-purchase heuristic ----------
export type PurchaseLike = { id: string; subject: string; contractor?: string | null; value: number | string; currency: string; date: string | null };
export type SplitGroup = { ids: string[]; count: number; total: number; currency: string; reason: "same_supplier" | "similar_subject"; message: string; band_changes?: boolean };

const STOP = new Set(["من", "في", "على", "الى", "إلى", "عن", "مع", "او", "أو", "ثم", "هذا", "هذه", "ذلك", "تلك", "لـ", "بين", "عمل", "اعمال", "أعمال", "تنفيذ", "شراء", "توريد", "the", "of", "and", "for"]);
/** Arabic-aware normalisation: strips diacritics/tatweel, unifies alef/ya/ta-marbuta, lowercases. */
export function normalizeText(s: string): string {
  return (s ?? "").normalize("NFKC").replace(/[ً-ٰٟـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
const tokens = (s: string) => new Set(normalizeText(s).split(" ").map((t) => t.replace(/^ال/, "")).filter((t) => t.length >= 2 && !STOP.has(t)));
/** Jaccard similarity of subject tokens, 0..1. */
export function subjectSimilarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / (A.size + B.size - i);
}
const dayNo = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
/**
 * Flags purchases that MAY be a split: same supplier or similar subject, same currency, dated within `windowDays` of each other (connected groups).
 * Wording is deliberately cautious: it is a heuristic WARNING, never a finding of evasion. Items without a date are ignored.
 * When thresholds are supplied, `band_changes` tells whether the combined total falls in a different method band than at least one part (informational).
 */
export function detectSplitPurchases(items: PurchaseLike[], opts: { windowDays: number; minSimilarity: number; thresholds?: Threshold[]; today?: string }): SplitGroup[] {
  const xs = items.filter((i) => i.date);
  const parent = new Map<string, string>(); const why = new Map<string, "same_supplier" | "similar_subject">();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  xs.forEach((i) => parent.set(i.id, i.id));
  for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) {
    const p = xs[a], q = xs[b];
    if (p.currency !== q.currency || Math.abs(dayNo(p.date!) - dayNo(q.date!)) > opts.windowDays) continue;
    const sameSup = !!p.contractor && !!q.contractor && normalizeText(p.contractor) === normalizeText(q.contractor) && normalizeText(p.contractor) !== "";
    const sim = subjectSimilarity(p.subject, q.subject) >= opts.minSimilarity;
    if (!sameSup && !sim) continue;
    // a shared supplier alone is weak evidence: require some subject overlap too unless the subjects are similar
    if (sameSup && !sim && subjectSimilarity(p.subject, q.subject) === 0) continue;
    const ra = find(p.id), rb = find(q.id); if (ra !== rb) parent.set(ra, rb);
    const r = find(p.id); if (!why.has(r) || sim) why.set(r, sim ? "similar_subject" : "same_supplier");
  }
  const groups = new Map<string, PurchaseLike[]>();
  for (const i of xs) { const r = find(i.id); groups.set(r, [...(groups.get(r) ?? []), i]); }
  const out: SplitGroup[] = [];
  for (const [r, g] of groups) {
    if (g.length < 2) continue;
    const total = g.reduce((s, i) => s + n(i.value), 0), currency = g[0].currency;
    let band: boolean | undefined;
    if (opts.thresholds?.length && opts.today) {
      const tot = recommendMethod(total, currency, opts.thresholds, opts.today);
      if (tot.status === "matched") band = g.some((i) => { const one = recommendMethod(n(i.value), currency, opts.thresholds!, opts.today!); return one.status === "matched" && one.methods.map((m) => m.method).sort().join() !== tot.methods.map((m) => m.method).sort().join(); });
    }
    out.push({ ids: g.map((i) => i.id), count: g.length, total, currency, reason: why.get(r) ?? "similar_subject", band_changes: band, message: SPLIT_MSG });
  }
  return out.sort((a, b) => b.total - a.total);
}

// ---------- amendments (cumulative vs original) ----------
export type AmendmentSummary = { original: number; current: number; cumulativeDelta: number; cumulativePct: number | null; limitPct: number | null; limitLabel: string; overLimit: boolean | null };
/** Original value = current value minus the sum of recorded amendments. Art.29 limit is shown only if a value was loaded in procurement_setting; otherwise 'غير محمَّل — يلزم تحقق'. */
export function amendmentSummary(currentValue: number | string, deltas: (number | string)[], limitPct: number | string | null | undefined): AmendmentSummary {
  const current = n(currentValue), cum = deltas.reduce<number>((s, d) => s + n(d), 0), original = Math.round((current - cum) * 100) / 100;
  const pct = original > 0 ? (cum / original) * 100 : null;
  const lim = limitPct === null || limitPct === undefined || limitPct === "" ? null : n(limitPct);
  return { original, current, cumulativeDelta: Math.round(cum * 100) / 100, cumulativePct: pct, limitPct: lim, limitLabel: lim === null ? ART29_NOT_LOADED : `${lim}% (بانتظار التحقق من النص)`, overLimit: lim === null || pct === null ? null : pct > lim };
}

// ---------- procurement file ----------
export type StageState = { stage: Stage; label: string; done: boolean; evidence: string | null; source: "auto" | "manual" | null };
export type FileInput = {
  contract: { procurement_method: string | null; published_on: string | null; award_notice_on: string | null; signed_on: string | null; status: string; objection_pending?: boolean; objection_resolved_on?: string | null; decision_id: string | null; start_on?: string | null };
  manual: { stage: string; evidence_ref: string; evidence_on: string | null }[];
  publications: { platform_url: string | null; reference_no: string | null; published_on: string | null; proof_ref: string | null; document_ref: string | null }[];
  committees: { kind: string; result: string; report_text: string | null; formed_on: string | null }[];
  plan: { budget_line_id: string | null; estimated_value: number | string | null; funding_note: string | null } | null;
  holidays?: string[];
  today: string;
};
/** Complete = platform URL + reference + date + proof; anything less is only a partial record (an internal copy is never official publication). */
export const publicationComplete = (p: { platform_url: string | null; reference_no: string | null; published_on: string | null; proof_ref: string | null }) => !!(p.platform_url && p.reference_no && p.published_on && p.proof_ref);

export function buildFile(i: FileInput): StageState[] {
  const m = new Map(i.manual.map((x) => [x.stage, x]));
  const c = i.contract;
  const auto = (stage: Stage): string | null => {
    switch (stage) {
      case "need": return i.plan ? "بند في خطة الشراء" : null;
      case "estimate": return i.plan && i.plan.estimated_value !== null && n(i.plan.estimated_value) > 0 ? `تقدير في الخطة: ${n(i.plan.estimated_value).toLocaleString("en-US")}` : null;
      case "funding": return i.plan?.budget_line_id ? "مربوط ببند موازنة" : null;
      case "method": return c.procurement_method ? METHOD[c.procurement_method] ?? c.procurement_method : null;
      case "publication": { const p = i.publications.find(publicationComplete); return p ? `منشور رسميًا ${p.published_on} (${p.reference_no})` : null; }
      case "committee": { const k = i.committees.find((x) => x.kind === "award"); return k ? `لجنة تلزيم${k.formed_on ? " " + k.formed_on : ""}` : null; }
      case "evaluation": { const k = i.committees.find((x) => x.kind === "award" && x.report_text); return k ? "تقرير لجنة التلزيم مسجَّل" : null; }
      case "award": return c.award_notice_on ? `قبول العرض ${c.award_notice_on}` : null;
      case "notice": return c.award_notice_on ? `نشر قبول العرض ${c.award_notice_on}` : null;
      case "objections": return c.objection_pending ? null : c.award_notice_on ? (c.objection_resolved_on ? `اعتراض مبتوت ${c.objection_resolved_on}` : "لا اعتراض قائم مسجَّل") : null;
      case "standstill": { if (!c.award_notice_on || !c.signed_on) return null; return c.signed_on > c.award_notice_on ? `التوقيع ${c.signed_on} بعد نشر القبول ${c.award_notice_on} (تحقق من 10 أيام عمل)` : null; }
      case "contract": return c.signed_on ? `موقّع ${c.signed_on}` : null;
      case "execution": return ["active", "completed"].includes(c.status) ? "العقد ساري/منفَّذ" : null;
      case "acceptance": { const k = i.committees.find((x) => x.kind === "acceptance" && ["accepted", "accepted_reservations"].includes(x.result)); return k ? COMMITTEE_RESULT[k.result] : null; }
      default: return null;
    }
  };
  return STAGES.map((stage) => {
    const a = auto(stage), mm = m.get(stage);
    return { stage, label: STAGE_LABEL[stage], done: !!(a || mm), evidence: a ?? mm?.evidence_ref ?? null, source: a ? "auto" : mm ? "manual" : null };
  });
}
