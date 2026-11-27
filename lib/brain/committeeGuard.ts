// Data-driven guard: when the retrieved PPA texts say the mayor is excluded from procurement/receiving committees, a draft that seats the mayor
// as a committee member is rejected. The rule is read from the retrieved text («باستثناء رئيس البلدية»), not hard-coded as a legal claim.
const n = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْـ]/g, "");
export const mayorExcludedBySources = (sourcesText: string) => /باستثناء\s+رئيس\s+البلديه/.test(n(sourcesText));
const COMMITTEE = /لجنه\s+(?:الشراء|التلزيم|الاستلام|المناقصات)|لجان\s+(?:الشراء|التلزيم|الاستلام)/;
const NEGATION = /باستثناء|عدا|لا\s+يجوز|لا\s+يحق|لا\s+يكون|لا\s+يُدرج|يستثني|مستثني|ممنوع|يمنع|لا\s+يشارك|مستبعد|غير\s+جائز/;
const MEMBER = /عضو|اعضاء|اصيل|رديف|رئيس\s+اللجنه|يضم|تضم|تتالف|يتالف|تشكل|ينتخب|انتخاب|تؤلف|مؤلفه|ممثل/;

/** Returns an issue text when the draft seats «رئيس البلدية» on a procurement/receiving committee although the sources exclude him. */
export function auditCommitteeMayor(answer: string, sourcesText: string): string | null {
  if (!mayorExcludedBySources(sourcesText)) return null;
  const a = n(answer);
  if (!COMMITTEE.test(a)) return null;
  const lines = a.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/رئيس\s+البلديه/.test(l) || NEGATION.test(l)) continue;
    const ctx = `${lines[i - 2] ?? ""} ${lines[i - 1] ?? ""} ${l}`;
    if (MEMBER.test(ctx) && COMMITTEE.test(`${lines.slice(Math.max(0, i - 8), i + 1).join(" ")}`)) return "مسودة تُدرج رئيس البلدية عضوًا في لجنة تلزيم/استلام، بينما نص هيئة الشراء المرفق يستثنيه من عضويتها";
  }
  return null;
}
export const SAFE_COMMITTEE_NOTE = "⚠️ لم أستطع صياغة جواب يتوافق مع نص هيئة الشراء العام المرفق. بحسب قرار الهيئة 9/2023 (قيد المراجعة القانونية) يُستثنى رئيس البلدية من عضوية لجان التلزيم والاستلام حين يُستعان بأعضاء المجلس البلدي. راجع النص المذكور في المصادر قبل أي قرار.";
