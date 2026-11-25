// Pure helpers for the municipal administration modules (correspondence, assets, legal affairs, oversight, transparency, HR positions). No I/O.
// Dates are YYYY-MM-DD strings (Asia/Beirut "today" is supplied by the caller). No legal period or threshold is hard-coded here.
import { daysBetween } from "./projects";

export const DIRECTION: Record<string, string> = { in: "وارد", out: "صادر" };
export const CORR_STATUS: Record<string, string> = { new: "جديد", referred: "محال", in_progress: "قيد المتابعة", replied: "تم الرد", sent: "مُرسل", closed: "مغلق" };
export const ASSET_KIND: Record<string, string> = { real_estate: "عقار", land: "أرض", vehicle: "آلية", equipment: "معدات", furniture: "أثاث" };
export const ASSET_STATUS: Record<string, string> = { in_use: "قيد الاستعمال", idle: "غير مستعمل", retired: "خارج الخدمة" };
export const LEGAL_CLASS: Record<string, string> = { unclassified: "غير مصنّف", public: "ملك عام", private: "ملك خاص" };
export const LEGAL_KIND: Record<string, string> = { case: "دعوى", claim: "مطالبة", consultation: "استشارة", judgment: "حكم" };
export const LEGAL_STATUS: Record<string, string> = { open: "مفتوحة", awaiting_judgment: "بانتظار الحكم", judged: "صدر الحكم", closed: "مقفلة" };
export const OVERSIGHT_KIND: Record<string, string> = { supervisory_letter: "كتاب رقابي", document_request: "طلب مستندات", remark: "ملاحظة", corrective_action: "إجراء تصحيحي" };
export const OVERSIGHT_STATUS: Record<string, string> = { open: "مفتوح", in_progress: "قيد المعالجة", closed: "مغلق" };
export const INFO_STATUS: Record<string, string> = { received: "مستلم", in_review: "قيد الدراسة", replied: "تم الرد", refused: "مرفوض (مع تعليل)", closed: "مقفل" };

export const ASSET_DISPOSAL_WARNING = "التصرف بالأملاك يستلزم قرارًا وتصديقًا وفق نوع الملك";
export const NEEDS_VERIFICATION = "يلزم تحقق";

/** Correspondence number is scoped per (municipality, direction, year): shown as «وارد 12/2026». */
export const corrNumber = (direction: string, seq: number, year: number) => `${DIRECTION[direction] ?? direction} ${seq}/${year}`;

export function addDays(d: string, n: number): string {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type DeadlineState = "overdue" | "soon" | "ok" | null;
/** Null without a due date or when the item is finished; overdue if due < today; soon within `soonDays`. */
export function deadlineState(due: string | null | undefined, today: string, finished = false, soonDays = 7): DeadlineState {
  if (!due || finished) return null;
  const left = daysBetween(today, due);
  return left < 0 ? "overdue" : left <= soonDays ? "soon" : "ok";
}
export const DEADLINE_LABEL: Record<string, string> = { overdue: "تجاوز الموعد", soon: "الموعد قريب", ok: "ضمن المهلة" };

/** Unknown value is never rendered as zero. */
export function formatValue(v: number | string | null | undefined, currency: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "غير مُدخل";
  const n = Number(v);
  if (!Number.isFinite(n)) return "غير مُدخل";
  return `${n.toLocaleString("en-US")} ${currency === "LBP" ? "ل.ل." : "$"}`;
}

/** The access-to-information due date is user-entered; when a configured default (days, flagged for legal verification) exists it only PRE-FILLS the form. */
export function suggestedDue(received: string | null, defaultDays: number | null | undefined): string | null {
  if (!received || !defaultDays || defaultDays < 1 || !Number.isFinite(defaultDays)) return null;
  return addDays(received, Math.floor(defaultDays));
}

/** Publication is allowed only if no redaction is required, or redaction is done. Requests with personal data always require redaction. */
export function canPublish(r: { redaction_required: boolean; redaction_done: boolean; contains_personal_data?: boolean }): boolean {
  const need = r.redaction_required || !!r.contains_personal_data;
  return !need || r.redaction_done;
}

/** A document reference is plain text or an http(s) URL. Returns an href only for http(s); other schemes (javascript:, data:, file:) are never linked. */
export function safeRef(ref: string): { href: string | null; text: string } {
  const text = (ref ?? "").trim();
  if (/^https?:\/\/[^\s]+$/i.test(text)) { try { const u = new URL(text); if (u.protocol === "http:" || u.protocol === "https:") return { href: u.toString(), text }; } catch { /* plain text */ } }
  return { href: null, text };
}
export const refSchemeBad = (ref: string) => /^[a-z][a-z0-9+.-]*:/i.test(ref.trim()) && !/^https?:\/\//i.test(ref.trim());

/** True when a PostgREST/Postgres error means the table or RPC has not been deployed yet (migration 0025 not applied). */
export function isMissingObject(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const c = err.code ?? "", m = (err.message ?? "").toLowerCase();
  return ["PGRST205", "PGRST202", "42P01", "42883"].includes(c) || m.includes("schema cache") || m.includes("does not exist") || m.includes("could not find the");
}

export const ERR: Record<string, string> = {
  pending: "هذه الوحدة قيد التفعيل: لم يُطبَّق ترحيل قاعدة البيانات بعد.",
  forbidden: "الصلاحية مقتصرة على رئيس البلدية أو مدير النظام.",
  bad_input: "تحقق من الحقول المطلوبة والتواريخ والقيم.",
  not_found: "السجل غير موجود.",
  not_closed: "لا يُؤرشف إلا ما تم الرد عليه أو أُرسل أو أُغلق.",
  basis_required: "التحقق من التصنيف يستلزم تسجيل السند.",
  lawyer_required: "يجب تسجيل اسم المحامي الذي أدخل المهلة؛ لا يحتسب النظام المهل.",
  evidence_required: "الإقفال يستلزم نص الدليل وتاريخ الإقفال.",
  reply_date_required: "سجّل تاريخ الرد.",
  redaction_required: "لا يُنشر قبل إتمام الحجب/التنقيح المطلوب.",
  bad_ref: "المرجع نص أو رابط http(s) فقط.",
  "1": "تعذّر تنفيذ العملية.",
};
export function errCode(message: string | undefined | null): string {
  const m = message ?? "";
  return Object.keys(ERR).find((k) => k !== "1" && k !== "pending" && m.includes(k)) ?? "1";
}

export type Row = Record<string, any>;
/** Tolerant list loader: returns rows, or {missing:true} when the table is not deployed (never throws). */
export async function loadList(sb: any, table: string, cols: string, order?: { col: string; asc?: boolean }, limit = 500): Promise<{ rows: Row[]; missing: boolean }> {
  try {
    let q = sb.from(table).select(cols).limit(limit);
    if (order) q = q.order(order.col, { ascending: order.asc ?? false });
    const { data, error } = await q;
    if (error) return { rows: [], missing: true };
    return { rows: (data ?? []) as Row[], missing: false };
  } catch { return { rows: [], missing: true }; }
}
