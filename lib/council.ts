export const SESSION_STATUS: Record<string, string> = { planned: "مقررة", held: "منعقدة", minutes_draft: "محضر قيد الإعداد", minutes_approved: "محضر معتمد", cancelled: "ملغاة" };
export const LEGAL_STATUS: Record<string, string> = { draft: "مسودة", adopted: "متخذ", pending_completion: "قيد استكمال الإجراءات", under_review: "قيد الرقابة أو التصديق", effective: "نافذ", suspended: "معلّق", annulled: "ملغى أو مبطل" };
export const EXEC_STATUS: Record<string, string> = { not_started: "لم يبدأ", preparing: "قيد التحضير", in_progress: "قيد التنفيذ", delayed: "متأخر", completed: "مكتمل", stopped: "متوقف" };
export const uuidOk = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
export const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** A decision is "late" when its legal status is effective, its due date has passed and it is neither completed nor stopped. Derived, never inferred as legal effect. */
export const isLate = (d: { legal_status: string; execution_status: string; execution_due: string | null }, today: string) =>
  d.legal_status === "effective" && !!d.execution_due && d.execution_due < today && d.execution_status !== "completed" && d.execution_status !== "stopped";

export const CATEGORY: Record<string, string> = { general: "عام", budget: "موازنة", accounts: "حسابات", planning: "تنظيم مدني/تخطيط", loan: "قرض", tax: "رسوم وضرائب", contract: "عقد/لزمة", property: "أملاك/إيجار", other: "أخرى" };
export const VALIDATION_LEVEL: Record<string, string> = { none: "لا يحتاج تصديقًا", qaimaqam: "القائمقام", mohafez: "المحافظ", minister: "وزير الداخلية والبلديات" };
/** Categories the municipal act excludes from the "tacit approval after one month" rule (budget, accounts, planning, loans) — they need explicit validation. */
export const NO_TACIT = ["budget", "accounts", "planning", "loan"];

const days = (a: string, b: string) => Math.floor((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const addMonth = (d: string) => { const x = new Date(d + "T00:00:00Z"); x.setUTCMonth(x.getUTCMonth() + 1); return x.toISOString().slice(0, 10); };

/** Derived reminders from the municipal act (Decree-Law 118/1977). They flag; they never change a legal status by themselves. */
export function decisionAlerts(d: { decided_on: string | null; sent_on: string | null; received_on: string | null; validated_on: string | null; validation_level: string; category: string; legal_status: string; vote_for: number | null; vote_against: number | null }, today: string): string[] {
  const out: string[] = [];
  if (d.decided_on && !d.sent_on && days(d.decided_on, today) > 8) out.push("تجاوز مهلة الثمانية أيام لإرسال القرار إلى سلطة الرقابة (م.58) ولم يُسجَّل تاريخ الإرسال.");
  if (d.validation_level !== "none" && !d.validated_on) {
    if (NO_TACIT.includes(d.category)) out.push("قرار من فئة لا تسري عليها قاعدة التصديق الحكمي: يحتاج تصديقًا خطيًا صريحًا قبل أن يصير نافذًا (م.63).");
    else if (d.received_on && addMonth(d.received_on) <= today) out.push("انقضت مهلة الشهر من تاريخ الاستلام لدى سلطة التصديق (م.63): قد يُعدّ القرار مصدَّقًا حكمًا — تحقّق من الأصول القانونية ثم سجّل نفاذه.");
    else if (d.legal_status !== "draft") out.push("بانتظار تصديق " + (VALIDATION_LEVEL[d.validation_level] ?? "سلطة الرقابة") + ".");
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
export const STANDSTILL_DAYS = 14; // >= 10 working days (art. 35/39 of Law 244/2021), conservatively as calendar days
export const NEGOTIATED_NOTICE_DAYS = 10;
export const COMPETITIVE = ["open_tender", "two_stage", "proposals", "framework"];
/** Earliest sensible signing date given the method and the recorded notices; null when it cannot be computed yet. */
export function earliestSigning(c: { procurement_method: string | null; award_notice_on: string | null; ppa_notice_on: string | null }): string | null {
  const add = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  if (c.procurement_method && COMPETITIVE.includes(c.procurement_method)) return c.award_notice_on ? add(c.award_notice_on, STANDSTILL_DAYS) : null;
  if (c.procurement_method === "negotiated") return c.ppa_notice_on ? add(c.ppa_notice_on, NEGOTIATED_NOTICE_DAYS) : null;
  return null;
}
