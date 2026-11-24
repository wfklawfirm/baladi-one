export const SESSION_STATUS: Record<string, string> = { planned: "مقررة", held: "منعقدة", minutes_draft: "محضر قيد الإعداد", minutes_approved: "محضر معتمد", cancelled: "ملغاة" };
export const LEGAL_STATUS: Record<string, string> = { draft: "مسودة", adopted: "متخذ", pending_completion: "قيد استكمال الإجراءات", under_review: "قيد الرقابة أو التصديق", effective: "نافذ", suspended: "معلّق", annulled: "ملغى أو مبطل" };
export const EXEC_STATUS: Record<string, string> = { not_started: "لم يبدأ", preparing: "قيد التحضير", in_progress: "قيد التنفيذ", delayed: "متأخر", completed: "مكتمل", stopped: "متوقف" };
export const uuidOk = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
export const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** A decision is "late" when its legal status is effective, its due date has passed and it is neither completed nor stopped. Derived, never inferred as legal effect. */
export const isLate = (d: { legal_status: string; execution_status: string; execution_due: string | null }, today: string) =>
  d.legal_status === "effective" && !!d.execution_due && d.execution_due < today && d.execution_status !== "completed" && d.execution_status !== "stopped";
