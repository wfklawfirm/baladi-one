const code = (e: { message?: string } | null) => (e?.message ?? "").split(":")[0].trim();
const ERR: Record<string, string> = {
  forbidden: "غير مسموح لهذا الحساب.", four_eyes: "لا يجوز لمن قدّم القالب للمراجعة أن يعتمده: يلزم شخص آخر.", effective_date_required: "حدّد تاريخ السريان.",
  review_note_required: "اكتب ملاحظة المراجعة القانونية.", bad_transition: "انتقال غير مسموح بين الحالتين.", not_draft: "النسخة ليست مسودة؛ أنشئ نسخة جديدة للتعديل.",
  template_not_approved: "القالب غير معتمد قانونيًا بعد: لا يمكن الاعتماد الرسمي، والمسودة تبقى بعلامة مائية.", missing_fields: "حقول إلزامية ناقصة",
  unverified_refs: "مراجع قانونية غير متحقق منها في سجل القواعد", template_unavailable: "القالب غير متاح للاستخدام.", bad_input: "تحقق من الحقول المدخلة.", not_found: "غير موجود.", too_large: "الحجم أكبر من المسموح.",
};
export const errText = (e: { message?: string } | null) => { const c = code(e); const rest = (e?.message ?? "").includes(":") ? `: ${(e!.message as string).split(":").slice(1).join(":").trim()}` : ""; return (ERR[c] ?? "تعذّر تنفيذ الإجراء.") + (c === "missing_fields" || c === "unverified_refs" ? rest : ""); };

