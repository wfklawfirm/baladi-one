// "Latest in-force instrument prevails". For procurement questions the assistant is told which instruments are newest, and that older municipal-law-era
// sources cannot decide procurement-committee questions. No legal content is hard-coded here: only what the legal source register itself holds.
export const PROC_TOPIC = /لجنة (?:الشراء|التلزيم|المناقصات|الاستلام|استلام)|لجان (?:الشراء|التلزيم|المناقصات)|عضو(?:ية)? في لجنة|مناقصة|مناقصات|تلزيم|استدراج|شراء عام|الشراء العام|تضارب مصالح|تعارض مصالح/;
type Src = { instrument_type: string; instrument_number: string; instrument_date: string | null; verification_status: string; effective_to?: string | null };
const TYPE: Record<string, string> = { law: "قانون", decree: "مرسوم", legislative_decree: "مرسوم اشتراعي", decision: "قرار", memo: "مذكرة", circular: "تعميم", template: "نموذج", other: "نص" };
const ST: Record<string, string> = { pending_review: "قيد المراجعة", verified: "موثّق", rejected: "مرفوض", superseded: "منسوخ", source_unreachable: "مصدر غير متاح" };

export function supersessionNote(query: string, sources: Src[] | null): string | undefined {
  if (!PROC_TOPIC.test(query)) return undefined;
  const live = (sources ?? []).filter((s) => s.verification_status !== "rejected" && s.verification_status !== "superseded" && !s.effective_to)
    .sort((a, b) => String(b.instrument_date ?? "").localeCompare(String(a.instrument_date ?? ""))).slice(0, 12);
  const list = live.length ? live.map((s) => `- ${TYPE[s.instrument_type] ?? s.instrument_type} ${s.instrument_number}${s.instrument_date ? ` (${s.instrument_date})` : ""} — ${ST[s.verification_status] ?? s.verification_status}`).join("\n") : "- (سجل المصادر غير متاح)";
  return `=== أولوية النص الأحدث النافذ (الشراء العام) ===
السؤال يتعلق بالشراء العام. المرجع هو قانون الشراء العام 244/2021 بتعديلاته (ومنها القانون 309/2023 الذي أبقاه المجلس الدستوري بالقرار 7/2023) وتطبيقاته، وليس ما جاء في كتب وأدلة قانون البلديات 118/1977 وما قبله عن «لجنة الشراء» أو لجنة المناقصات البلدية، فهذه منسوخة أو معدّلة بالنظام الأحدث.
نصوص الشراء العام المسجّلة في المنصة، الأحدث أولًا:
${list}
قواعد الجواب: (1) ابدأ بالنص الأحدث وبيّن ما نُسخ من النص الأقدم. (2) لجان التلزيم والاستلام في النظام الجديد تُؤلَّف وفق أسس هيئة الشراء العام ويُشترط استقلالها وعدم تضارب مصالح أعضائها؛ فلا تقل إن رئيس البلدية يحق له أن يكون عضوًا استنادًا إلى مصادر أقدم، بل اعرض ما يقتضيه هذا الشرط واذكر أن النص الحرفي للمادة غير محمَّل في المنصة ويلزم التحقق منه قبل الاعتماد. (3) لا تعرض أي حكم على أنه «موثّق» ما دام قيد المراجعة.`;
}
