// Pure helpers for the data-driven per-method procurement workflow (state machine). No I/O, no legal content:
// stages, transitions and guards come from the procurement_workflow* tables (seeded pending_review). Dates are YYYY-MM-DD strings.
import { isMissingErr } from "@/lib/procurement";
// The RPCs in migration 0044 enforce the same rules in the database; this module only mirrors them for the UI and for tests.

export const WF_METHODS = ["open_tender", "two_stage", "quotations", "proposals", "negotiated", "invoice", "framework"] as const;
export const WF_PENDING_NOTE = "تسلسل المراحل مقترح بانتظار المراجعة القانونية";

export const CHECK_STATUSES = ["complete", "needs_completion", "awaiting_approval", "not_yet_due", "overdue", "not_applicable", "needs_legal_review"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  complete: "مكتمل", needs_completion: "يحتاج إلى استكمال", awaiting_approval: "ينتظر موافقة", not_yet_due: "لم يستحق بعد",
  overdue: "متأخر", not_applicable: "غير منطبق", needs_legal_review: "يحتاج إلى مراجعة قانونية",
};
export const isCheckStatus = (s: unknown): s is CheckStatus => typeof s === "string" && (CHECK_STATUSES as readonly string[]).includes(s);

export type WfStage = { key: string; label_ar: string; ord: number; required: boolean; conditional_on: string | null; who_ar: string | null; why_ar: string | null; document_ar: string | null; review_status?: string; legal_source_id?: string | null; provision_id?: string | null };
export type WfTransition = { from_key: string; to_key: string; kind: "forward" | "return"; guard: string | null };
export type FileCheck = { stage_key: string; status: string; evidence_ref: string | null; note: string | null; due_on: string | null };
export type FileStatus = "active" | "cancelled" | "completed";

export const WF_ERR: Record<string, string> = {
  transition_not_allowed: "هذا الانتقال غير معرَّف في مسار هذه الطريقة.",
  stage_incomplete: "لا يمكن الانتقال: المرحلة الحالية غير مكتملة بإثبات (أو غير موسومة «غير منطبق» بملاحظة).",
  evidence_required: "الإكمال يتطلب إثباتًا مسجَّلًا (اسم مستند أو رقم أو رابط)، لا يكفي وضع علامة.",
  not_applicable_refused: "«غير منطبق» يتطلب ملاحظة تعليل، ولا يجوز لمرحلة إلزامية غير مشروطة.",
  reason_required: "السبب مطلوب.", not_active: "الملف ليس نشطًا.", not_cancelled: "الملف غير ملغى.",
  method_required: "حدّدوا أسلوب الشراء أولًا.", bad_method: "أسلوب الشراء غير صالح.", already_started: "بدأ مسار هذا الملف أصلًا.",
  pending: "قيد التفعيل: هذه الميزة بانتظار تطبيق ترحيل قاعدة البيانات 0044.",
  bad_stage: "مرحلة غير معروفة.", bad_input: "تحقق من المدخلات.", not_found: "العنصر غير موجود.",
};
export const wfErr = (code?: string) => (code && WF_ERR[code]) || "تعذّر تنفيذ العملية، تحقق من المدخلات.";
/** Extracts a known error code from an RPC error message. */
export function wfErrCode(e: { message?: string; code?: string } | null | undefined): string {
  if (isMissingErr(e)) return "pending";
  const m = e?.message ?? "";
  return Object.keys(WF_ERR).find((k) => m.includes(k)) ?? "1";
}

export const sortStages = (stages: WfStage[]): WfStage[] => [...stages].sort((a, b) => a.ord - b.ord);
export const firstStage = (stages: WfStage[]): WfStage | null => sortStages(stages)[0] ?? null;
export const stageByKey = (stages: WfStage[], key: string): WfStage | undefined => stages.find((s) => s.key === key);

/** Transitions leaving `from` of a given kind. The table is the only source of truth. */
export const transitionsFrom = (ts: WfTransition[], from: string, kind: "forward" | "return"): WfTransition[] => ts.filter((t) => t.from_key === from && t.kind === kind);
export const isFinalStage = (ts: WfTransition[], key: string): boolean => transitionsFrom(ts, key, "forward").length === 0;

/** A check satisfies a stage guard only when complete WITH evidence, or not_applicable WITH a note. A bare status never counts. */
export function checkSatisfied(c: FileCheck | undefined | null): boolean {
  if (!c) return false;
  if (c.status === "complete") return !!c.evidence_ref && c.evidence_ref.trim() !== "";
  if (c.status === "not_applicable") return !!c.note && c.note.trim() !== "";
  return false;
}

export type CheckInput = { status: string; evidence?: string | null; note?: string | null };
/** Mirror of procurement_file_check_set validation. */
export function validateCheck(stage: WfStage | undefined, i: CheckInput): { ok: true } | { ok: false; code: string } {
  if (!stage) return { ok: false, code: "bad_stage" };
  if (!isCheckStatus(i.status)) return { ok: false, code: "bad_input" };
  if (i.status === "complete" && !(i.evidence ?? "").trim()) return { ok: false, code: "evidence_required" };
  if (i.status === "not_applicable" && (!(i.note ?? "").trim() || (stage.required && !stage.conditional_on))) return { ok: false, code: "not_applicable_refused" };
  return { ok: true };
}

/** Mirror of procurement_file_advance. Refuses anything not defined as a forward transition from the current stage. */
export function canAdvance(ts: WfTransition[], checks: FileCheck[], current: string, to: string, status: FileStatus = "active"): { ok: true } | { ok: false; code: string } {
  if (status !== "active") return { ok: false, code: "not_active" };
  const t = ts.find((x) => x.from_key === current && x.to_key === to && x.kind === "forward");
  if (!t) return { ok: false, code: "transition_not_allowed" };
  if (t.guard === "current_complete" && !checkSatisfied(checks.find((c) => c.stage_key === current))) return { ok: false, code: "stage_incomplete" };
  return { ok: true };
}
export function canReturn(ts: WfTransition[], current: string, to: string, reason: string, status: FileStatus = "active"): { ok: true } | { ok: false; code: string } {
  if (status !== "active") return { ok: false, code: "not_active" };
  if (!reason.trim()) return { ok: false, code: "reason_required" };
  if (!ts.some((x) => x.from_key === current && x.to_key === to && x.kind === "return")) return { ok: false, code: "transition_not_allowed" };
  return { ok: true };
}
export function canCancel(status: FileStatus, reason: string): { ok: true } | { ok: false; code: string } {
  if (status !== "active") return { ok: false, code: "not_active" };
  return reason.trim() ? { ok: true } : { ok: false, code: "reason_required" };
}
export function canRestart(status: FileStatus, reason: string): { ok: true } | { ok: false; code: string } {
  if (status !== "cancelled") return { ok: false, code: "not_cancelled" };
  return reason.trim() ? { ok: true } : { ok: false, code: "reason_required" };
}
export function canFinish(ts: WfTransition[], checks: FileCheck[], current: string, status: FileStatus = "active"): { ok: true } | { ok: false; code: string } {
  if (status !== "active") return { ok: false, code: "not_active" };
  if (!isFinalStage(ts, current)) return { ok: false, code: "transition_not_allowed" };
  return checkSatisfied(checks.find((c) => c.stage_key === current)) ? { ok: true } : { ok: false, code: "stage_incomplete" };
}

/** Status shown for a stage: the stored one, adjusted by position and by a staff-entered due date (never a legal one). */
export function effectiveStatus(stage: WfStage, check: FileCheck | undefined, currentOrd: number, today: string): CheckStatus {
  if (check && isCheckStatus(check.status)) {
    if (check.status === "complete" && !checkSatisfied(check)) return "needs_completion";   // defensive: no evidence, not complete
    if (check.status === "not_applicable" && !checkSatisfied(check)) return "needs_completion";
    if ((check.status === "needs_completion" || check.status === "awaiting_approval" || check.status === "not_yet_due") && check.due_on && check.due_on < today) return "overdue";
    return check.status;
  }
  return stage.ord > currentOrd ? "not_yet_due" : "needs_completion";
}

export type ChecklistRow = { stage: WfStage; status: CheckStatus; label: string; evidence: string | null; note: string | null; due_on: string | null; isCurrent: boolean; needsLegalReview: boolean };
export function buildChecklist(stages: WfStage[], checks: FileCheck[], currentKey: string, today: string): ChecklistRow[] {
  const ss = sortStages(stages), cur = ss.find((s) => s.key === currentKey), curOrd = cur?.ord ?? 0;
  return ss.map((stage) => {
    const c = checks.find((x) => x.stage_key === stage.key);
    const status = effectiveStatus(stage, c, curOrd, today);
    return { stage, status, label: CHECK_STATUS_LABEL[status], evidence: c?.evidence_ref ?? null, note: c?.note ?? null, due_on: c?.due_on ?? null, isCurrent: stage.key === currentKey, needsLegalReview: stage.review_status !== "verified" };
  });
}
export function progress(rows: ChecklistRow[]): { done: number; total: number } {
  const applicable = rows.filter((r) => r.status !== "not_applicable");
  return { done: applicable.filter((r) => r.status === "complete").length, total: applicable.length };
}

export type NextAction = { stageKey: string; stageLabel: string; who: string; why: string; document: string; missingEvidence: boolean; nextKeys: string[]; reviewPending: boolean };
const NONE = "غير محدَّد في المسار";
/** «ما الإجراء التالي؟» for the current stage: who / why / which document, plus which forward targets are defined. */
export function nextAction(stages: WfStage[], ts: WfTransition[], checks: FileCheck[], currentKey: string): NextAction | null {
  const s = stageByKey(stages, currentKey); if (!s) return null;
  return {
    stageKey: s.key, stageLabel: s.label_ar, who: s.who_ar || NONE, why: s.why_ar || NONE, document: s.document_ar || NONE,
    missingEvidence: !checkSatisfied(checks.find((c) => c.stage_key === currentKey)),
    nextKeys: transitionsFrom(ts, currentKey, "forward").map((t) => t.to_key),
    reviewPending: s.review_status !== "verified",
  };
}

export type WfTab = { id: "overview" | "checklist" | "bids" | "history"; label: string };
/** Stage keys that mean offers are received/compared (structural, not legal). The bids tab exists only when the method has such a stage. */
export const BID_STAGE_KEYS = ["bids_receipt", "bids_opening", "stage_one_receipt", "stage_two_receipt", "quotation_receipt", "quotation_comparison", "proposals_receipt", "proposals_evaluation", "evaluation"] as const;
export function applicableTabs(stages: WfStage[]): WfTab[] {
  const tabs: WfTab[] = [{ id: "overview", label: "نظرة عامة" }, { id: "checklist", label: "قائمة التحقق" }];
  if (stages.some((s) => (BID_STAGE_KEYS as readonly string[]).includes(s.key))) tabs.push({ id: "bids", label: "العروض" });
  tabs.push({ id: "history", label: "السجل" });
  return tabs;
}

/** Structural validation of a loaded workflow definition (for tests/diagnostics): unique contiguous order, edges reference real stages, a single final stage reachable. */
export function validateWorkflow(stages: WfStage[], ts: WfTransition[]): string[] {
  const errs: string[] = [], ss = sortStages(stages), keys = new Set(ss.map((s) => s.key));
  if (!ss.length) return ["no_stages"];
  if (keys.size !== ss.length) errs.push("duplicate_key");
  ss.forEach((s, i) => { if (s.ord !== i + 1) errs.push("order_not_contiguous"); });
  for (const t of ts) if (!keys.has(t.from_key) || !keys.has(t.to_key)) errs.push("dangling_transition");
  const reach = new Set([ss[0].key]); let grew = true;
  while (grew) { grew = false; for (const t of ts) if (t.kind === "forward" && reach.has(t.from_key) && !reach.has(t.to_key)) { reach.add(t.to_key); grew = true; } }
  if (reach.size !== ss.length) errs.push("unreachable_stage");
  if (ss.filter((s) => isFinalStage(ts, s.key)).length !== 1) errs.push("final_stage_count");
  return [...new Set(errs)];
}
