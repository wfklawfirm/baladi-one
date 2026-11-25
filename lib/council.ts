export const SESSION_STATUS: Record<string, string> = { planned: "مقررة", held: "منعقدة", minutes_draft: "محضر قيد الإعداد", minutes_approved: "محضر معتمد", cancelled: "ملغاة" };
export const LEGAL_STATUS: Record<string, string> = { draft: "مسودة", adopted: "متخذ", pending_completion: "قيد استكمال الإجراءات", under_review: "قيد الرقابة أو التصديق", effective: "نافذ", suspended: "معلّق", annulled: "ملغى أو مبطل" };
export const EXEC_STATUS: Record<string, string> = { not_started: "لم يبدأ", preparing: "قيد التحضير", in_progress: "قيد التنفيذ", delayed: "متأخر", completed: "مكتمل", stopped: "متوقف" };
export const uuidOk = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
export const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** A decision is "late" when its legal status is effective, its due date has passed and it is neither completed nor stopped. Derived, never inferred as legal effect. */
export const isLate = (d: { legal_status: string; execution_status: string; execution_due: string | null }, today: string) =>
  d.legal_status === "effective" && !!d.execution_due && d.execution_due < today && d.execution_status !== "completed" && d.execution_status !== "stopped";

export const CATEGORY: Record<string, string> = { general: "عام", budget: "موازنة", accounts: "حسابات", planning: "تنظيم مدني/تخطيط", loan: "قرض", transfer: "نقل اعتمادات", tax: "رسوم وضرائب", contract: "عقد/لزمة", property: "أملاك/إيجار", other: "أخرى" };
export const VALIDATION_LEVEL: Record<string, string> = { none: "لا يحتاج تصديقًا", qaimaqam: "القائمقام", mohafez: "المحافظ", minister: "وزير الداخلية والبلديات" };
/** Categories excluded from tacit approval by art. 63 of Decree-Law 118/1977: planning, budget, credit transfers, loans. Pending lawyer review (see legal_rule MUN-118-63). */
export const NO_TACIT = ["budget", "planning", "transfer", "loan"];

const days = (a: string, b: string) => Math.floor((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const addMonth = (d: string) => { const x = new Date(d + "T00:00:00Z"); x.setUTCMonth(x.getUTCMonth() + 1); return x.toISOString().slice(0, 10); };

/** Derived reminders from the municipal act (Decree-Law 118/1977). They flag; they never change a legal status by themselves. */
export function decisionAlerts(d: { decided_on: string | null; sent_on: string | null; received_on: string | null; validated_on: string | null; validation_level: string; category: string; legal_status: string; audit_bureau_required?: boolean; audit_bureau_notice_on?: string | null; tacit_notified_on?: string | null; vote_for: number | null; vote_against: number | null }, today: string): string[] {
  const out: string[] = [];
  if (d.decided_on && !d.sent_on && days(d.decided_on, today) > 8) out.push("تجاوز مهلة الثمانية أيام لإرسال القرار إلى سلطة الرقابة (م.58) ولم يُسجَّل تاريخ الإرسال.");
  if (d.validation_level !== "none" && !d.validated_on) {
    if (NO_TACIT.includes(d.category)) out.push("قرار من فئة لا تسري عليها قاعدة التصديق الحكمي: يحتاج تصديقًا خطيًا صريحًا قبل أن يصير نافذًا (م.63).");
    else {
      const base = d.audit_bureau_required ? d.audit_bureau_notice_on ?? null : d.received_on;
      if (d.audit_bureau_required && !base) out.push("القرار خاضع لديوان المحاسبة: سجّل تاريخ إبلاغ موافقته لتبدأ مهلة الشهر (م.63).");
      else if (base && addMonth(base) <= today) out.push(d.tacit_notified_on ? "انقضت مهلة الشهر وأُبلغت سلطة الرقابة: يجوز اعتبار القرار مصدَّقًا حكمًا (م.63) — راجع المختص ثم سجّل نفاذه." : "انقضت مهلة الشهر (م.63): لا يُعتدّ بالتصديق الحكمي قبل أن يُبلّغ الرئيس سلطة الرقابة بذلك ويُسجَّل تاريخ الإبلاغ.");
      else if (d.legal_status !== "draft") out.push("بانتظار تصديق " + (VALIDATION_LEVEL[d.validation_level] ?? "سلطة الرقابة") + ".");
    }
  }
  if (d.vote_for !== null && d.vote_against !== null && d.vote_for > 0 && d.vote_for === d.vote_against) out.push("تعادل في الأصوات: يُرجَّح الجانب الذي فيه رئيس المجلس (م.42) — تأكّد من تدوينه في المحضر.");
  return out;
}

/** Quorum: more than half of the members; at the second meeting at least one third (art. 34). */
export function quorumState(total: number | null, present: number | null, second: boolean): { ok: boolean | null; need: number | null } {
  if (!total || present === null) return { ok: null, need: null };
  const need = second ? Math.ceil(total / 3) : Math.floor(total / 2) + 1;
  return { ok: present >= need, need };
}
/** Written summons at least three days before the session (art. 33). */
export const summonsOk = (summoned: string | null, held: string) => (summoned ? days(summoned, held) >= 3 : null);

export const METHOD: Record<string, string> = { open_tender: "مناقصة عامة", two_stage: "مناقصة على مرحلتين", quotations: "استدراج عروض أسعار", proposals: "طلب عروض (استشارات)", negotiated: "اتفاق رضائي", invoice: "شراء بالفاتورة", framework: "اتفاقية إطارية" };
/** Standstill = 10 WORKING days from publication of the winning-bid acceptance (Law 244/2021). Start-date wording differs between sources: pending lawyer review (PPL-244-STANDSTILL). */
export const STANDSTILL_WORKING_DAYS = 10;
export const COMPETITIVE = ["open_tender", "two_stage", "proposals", "framework", "quotations"];
/** Mirrors the database function _add_working_days: Mon–Fri, skipping loaded holidays. */
export function addWorkingDays(from: string, n: number, holidays: string[] = []): string {
  const h = new Set(holidays); let d = new Date(from + "T00:00:00Z"); let k = 0;
  while (k < n) { d = new Date(d.getTime() + 86400000); const dow = d.getUTCDay(); if (dow !== 0 && dow !== 6 && !h.has(d.toISOString().slice(0, 10))) k++; }
  return d.toISOString().slice(0, 10);
}
/** Earliest signing date the database accepts (strictly after the 10th working day); null when it cannot be computed. Not sufficient by itself to sign. */
export function earliestSigning(c: { procurement_method: string | null; award_notice_on: string | null }, holidays: string[] = []): string | null {
  if (!c.procurement_method || !COMPETITIVE.includes(c.procurement_method) || !c.award_notice_on) return null;
  return new Date(Date.parse(addWorkingDays(c.award_notice_on, STANDSTILL_WORKING_DAYS, holidays) + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
}
