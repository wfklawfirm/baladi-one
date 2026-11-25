// Pure helpers for municipal projects & contracts. No I/O; dates are YYYY-MM-DD strings (Asia/Beirut "today" is supplied by the caller).
export const PROJECT_STATUS: Record<string, string> = { proposed: "مقترح", approved: "معتمد", active: "قيد التنفيذ", delayed: "متأخر", completed: "مكتمل", stopped: "متوقف" };
export const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "مرتفعة", urgent: "عاجلة" };
export const CONTRACT_STATUS: Record<string, string> = { draft: "مسودة", signed: "موقّع", active: "ساري", completed: "منتهٍ بالتنفيذ", terminated: "مفسوخ", expired: "منتهي المدة" };
export const CURRENCY: Record<string, string> = { LBP: "ل.ل.", USD: "دولار" };

export type Milestone = { weight: number | string; progress_pct: number | string; planned_pct?: number | string | null };
export type ProjectLike = { status: string; start_on: string | null; due_on: string | null; budget_amount: number | string | null; spent_amount: number | string };
export type ContractLike = { status: string; end_on: string | null };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const clamp = (n: number) => Math.min(100, Math.max(0, n));
const dayNo = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
/** Whole days from a to b (b - a). */
export const daysBetween = (a: string, b: string) => Math.round(dayNo(b) - dayNo(a));

/** Weighted physical progress = Σ(weight × progress) / Σ weight. Null when there are no milestones (or no weight). */
export function physicalProgress(ms: Milestone[]): number | null {
  const w = ms.reduce((s, m) => s + Math.max(0, num(m.weight)), 0);
  if (!ms.length || w <= 0) return null;
  return clamp(ms.reduce((s, m) => s + Math.max(0, num(m.weight)) * clamp(num(m.progress_pct)), 0) / w);
}

/** Planned progress: weighted over milestones that carry planned_pct; otherwise a straight-line estimate between start and due; otherwise null. */
export function plannedProgress(ms: Milestone[], p: { start_on: string | null; due_on: string | null }, today: string): number | null {
  const withPlan = ms.filter((m) => m.planned_pct !== null && m.planned_pct !== undefined && m.planned_pct !== "");
  const w = withPlan.reduce((s, m) => s + Math.max(0, num(m.weight)), 0);
  if (withPlan.length && w > 0) return clamp(withPlan.reduce((s, m) => s + Math.max(0, num(m.weight)) * clamp(num(m.planned_pct)), 0) / w);
  if (!p.start_on || !p.due_on) return null;
  const total = daysBetween(p.start_on, p.due_on);
  if (total <= 0) return today >= p.due_on ? 100 : null;
  return clamp((daysBetween(p.start_on, today) / total) * 100);
}

/** spent / budget as a percentage (may exceed 100 on overspend). Null when there is no budget. */
export function financialConsumption(spent: number | string | null, budget: number | string | null): number | null {
  const b = num(budget);
  if (!b || b <= 0) return null;
  return (num(spent) / b) * 100;
}

/** Actual minus planned, in percentage points (negative = behind schedule). Null if either is unknown. */
export const scheduleVariance = (actual: number | null, planned: number | null) => (actual === null || planned === null ? null : actual - planned);

/** Delayed = due date passed and the project is neither completed nor stopped. */
export const isDelayed = (p: { status: string; due_on: string | null }, today: string) => !!p.due_on && p.due_on < today && p.status !== "completed" && p.status !== "stopped";

/** Contracts that are signed/active and end within the next `days` days (inclusive of today). Sorted by end date. */
export function expiringContracts<T extends ContractLike>(cs: T[], today: string, days: number): T[] {
  return cs.filter((c) => (c.status === "active" || c.status === "signed") && !!c.end_on && c.end_on >= today && daysBetween(today, c.end_on) <= days).sort((a, b) => (a.end_on! < b.end_on! ? -1 : 1));
}
/** Signed/active contracts whose end date has already passed (still not closed out). */
export const overdueContracts = <T extends ContractLike>(cs: T[], today: string): T[] => cs.filter((c) => (c.status === "active" || c.status === "signed") && !!c.end_on && c.end_on < today);

/** Parses a user-entered amount (accepts Arabic-Indic digits and ٫ / ,). Returns null when invalid or negative. */
export function parseAmount(v: string): number | null {
  const s = v.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٫]/g, ".").replace(/[,٬\s]/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}
export const fmtPct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

export const CONTRACT_ERR: Record<string, string> = {
  bad_method: "حدّد أسلوب التلزيم (مناقصة عامة، استدراج عروض، اتفاق رضائي…).",
  justification_required: "الاتفاق الرضائي استثناء ويستلزم تبريرًا مكتوبًا.",
  sign_date_required: "سجّل تاريخ التوقيع الفعلي (لا يكون في المستقبل).",
  standstill: "لا يمكن التوقيع قبل تسجيل تاريخ نشر قبول العرض الفائز وانقضاء فترة التجميد (10 أيام عمل) — راجع المرجعية القانونية.",
  objection_pending: "يوجد اعتراض قائم على هذا اللزمة: لا يجوز التوقيع قبل البتّ فيه.",
};
export const contractErr = (code?: string) => (code && CONTRACT_ERR[code]) || "تعذّر تنفيذ العملية، تحقق من المدخلات.";
