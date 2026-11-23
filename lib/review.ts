export const VERSION_STATUS_AR: Record<string, string> = { draft: "مسودة", in_review: "قيد المراجعة", approved: "معتمد", archived: "مؤرشف" };
/** Allowed next states per current state (the database enforces the same rules and the roles). */
export const NEXT: Record<string, { to: string; label: string; roles: string[] }[]> = {
  draft: [{ to: "in_review", label: "إرسال للمراجعة", roles: ["admin"] }],
  in_review: [{ to: "approved", label: "اعتماد", roles: ["mayor", "admin"] }, { to: "draft", label: "إعادة للمسودة (رفض)", roles: ["mayor", "admin"] }],
  approved: [{ to: "archived", label: "أرشفة", roles: ["mayor", "admin"] }],
  archived: [],
};
export function actionsFor(status: string, roles: string[]) {
  return (NEXT[status] ?? []).filter((a) => a.roles.some((r) => roles.includes(r)));
}
export const REVIEW_ERRORS: Record<string, string> = {
  four_eyes: "لا يمكن لمن أرسل النسخة للمراجعة أن يعتمدها بنفسه.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  bad_transition: "هذا الانتقال غير مسموح من الحالة الحالية.",
  not_found: "النسخة غير موجودة.",
};
