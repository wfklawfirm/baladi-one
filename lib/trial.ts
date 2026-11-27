// Pure helpers for the public 3-day assistant trial. No I/O.
export const TRIAL_COOKIE = "bt_trial";
export const TRIAL_DAYS = 3;
/** Digits only, 7–15 long (international format allowed); null when it cannot be a phone number. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "").replace(/^00/, "");
  return /^[0-9]{7,15}$/.test(d) ? d : null;
}
export const TRIAL_ERR: Record<string, string> = {
  bad_phone: "رقم الهاتف غير صحيح. اكتبوه بالأرقام فقط مثل 71123456 أو 96171123456.",
  consent: "يلزم الموافقة على حفظ رقم الهاتف لبدء التجربة.",
  expired: "انتهت مدة التجربة (3 أيام) لهذا الرقم. للمتابعة تواصلوا مع AIJUR.",
  invalid: "انتهت الجلسة أو لم تُسجَّل بعد. سجّلوا رقمكم لبدء التجربة.",
  busy: "الخدمة مزدحمة الآن، حاولوا بعد قليل.",
  failed: "تعذّر التسجيل الآن. حاولوا مرة أخرى بعد قليل.",
};
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
