import { issueYear, newestFirst } from "./recency";
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
قواعد الجواب: (1) ابدأ بالنص الأحدث وبيّن ما نُسخ من النص الأقدم. (2) أجب من «نصوص هيئة الشراء العام» المرفقة أدناه إن وُجدت (مع ذكر عنوان النص وتاريخه ورابطه؛ والتاريخ المعروض هو تاريخ النشر على الموقع لا الصدور)، ولا تعتمد على مصادر أقدم تخالفها. إن لم تحسم المقتطفات المسألة فقل ذلك صراحةً ولا تخمّن. (3) لا تعرض أي حكم على أنه «موثّق» ما دام قيد المراجعة.`;
}

const STOP = new Set(["هل","ما","ماذا","كيف","متى","اين","أين","يحق","يجوز","من","في","على","الى","إلى","عن","هي","هو","ان","أن","كان","يكون","لدى","بين","مع","ذلك","هذا","هذه","التي","الذي","لنا","لي","لا","نعم","كل","اي","أي"]);
export function searchTerms(query: string): string[] {
  const words = query.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
  // Arabic clitics: also try the word without a leading «ال/لل/بال/وال/ل/ب/و», since stored text is matched by prefix
  const bare = (w: string) => w.replace(/^(?:وال|بال|لل|ال|ل|ب|و)(?=.{3,})/, "");
  // the stored texts say «لجان التلزيم والاستلام / أعضاء», while people ask «لجنة الشراء / عضو»
  const SYN: Record<string, string[]> = { لجنة: ["لجان", "التلزيم", "الاستلام"], لجان: ["لجنة", "التلزيم"], عضو: ["أعضاء", "عضو"], عضوا: ["أعضاء", "عضو"], عضوًا: ["أعضاء", "عضو"], الشراء: ["التلزيم", "الجهة الشارية"], مناقصة: ["التلزيم", "مناقصة"] };
  const out = words.flatMap((w) => [w, bare(w), ...(SYN[bare(w)] ?? SYN[w] ?? [])]);
  return [...new Set(out.flatMap((w) => w.split(/\s+/)))].filter((w) => w.length >= 3).slice(0, 16);
}
type Row = { title: string; category: string; published_on: string | null; source_url: string; text_quality: string | null; label: string | null; body: string };
/** Retrieved PPA texts, newest first. OCR rows are flagged: their numbers/dates may be wrong. */
export function ppaExcerpts(rows: Row[] | null): string | undefined {
  if (!rows?.length) return undefined;
  // rows arrive best-match first: keep the best 8, then show newest ISSUE year first (from the title; publication date only as a fallback)
  const sorted = newestFirst(rows.slice(0, 8), (r) => issueYear(r.title, r.published_on));
  const blocks = sorted.map((r) => `### ${r.title}${r.label ? ` — ${r.label}` : ""}\nالتصنيف: ${r.category}${r.published_on ? ` | نُشر على الموقع: ${r.published_on}` : ""} | المصدر: ${r.source_url}${r.text_quality?.includes("ocr") ? " | تنبيه: نص مقروء ضوئيًا، قد تكون الأرقام والتواريخ غير دقيقة فارجع إلى الرابط" : ""}\n${r.body.slice(0, 1300)}`);
  return `=== نصوص هيئة الشراء العام (من موقعها، الأحدث أولًا، كلها قيد المراجعة) ===\n${blocks.join("\n\n")}\nقاعدة: هذه نصوص مأخوذة من الموقع ولم تُوثَّق قانونيًا بعد؛ اذكر مصدرها وتاريخها وقل «قيد المراجعة»، وعند التعارض يسود الأحدث صدورًا (وفق تاريخ الصدور الوارد في عنوان النص أو متنه، وليس تاريخ نشره على الموقع).`;
}
