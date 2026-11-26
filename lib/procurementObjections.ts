// Pure helpers for the procurement objections register. No legal period/rule is encoded: all legal fields are free text typed by staff.
export const OBJECTION_STATUS: Record<string, string> = { open: "مفتوح", answered: "تم الرد", decided: "صدر القرار", withdrawn: "مسحوب" };
export const OBJECTION_BANNER = "الاعتراض قد يوقف الإجراء — يُتحقق من الأثر القانوني";
export const OBJECTION_ERR: Record<string, string> = { objection_closed: "الاعتراض مغلق (صدر فيه قرار أو سُحب): لا تعديل عليه." };
export type MemberLite = { has_conflict: boolean | null; declaration_on: string | null };
/** Members without a conflict-of-interest declaration on file (has_conflict null). Informational only; blocks nothing. */
export const membersWithoutDeclaration = <T extends MemberLite>(ms: T[]): T[] => ms.filter((m) => m.has_conflict === null);
export const isClosedObjection = (status: string) => status === "decided" || status === "withdrawn";
export const openObjectionCount = (rows: { status: string }[]) => rows.filter((r) => !isClosedObjection(r.status)).length;
