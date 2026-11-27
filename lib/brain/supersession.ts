import { issueYear } from "./recency";
import { isProcurementQuery } from "./legalGraph";
import { instrumentKind, KIND_AR, RANK } from "./hierarchy";
import type { AuthMeta } from "./claims";
// "Latest in-force instrument prevails". For procurement questions the assistant is told which instruments are newest, and that older municipal-law-era
// sources cannot decide procurement-committee questions. No legal content is hard-coded here: only what the legal source register itself holds.
const LEGACY_TOPIC = /لجنة (?:الشراء|التلزيم|المناقصات|الاستلام|استلام)|لجان (?:الشراء|التلزيم|المناقصات)|عضو(?:ية)? في لجنة|مناقصة|مناقصات|تلزيم|استدراج|شراء عام|الشراء العام|تضارب مصالح|تعارض مصالح/;
/** One shared topic detector: the legacy phrase list OR any procurement concept in the legal graph (so «تقييم العروض», «المرجع الصالح»… are covered). */
export const PROC_TOPIC = { test: (q: string) => LEGACY_TOPIC.test(q) || isProcurementQuery(q) };
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
  const SYN: Record<string, string[]> = { لجنة: ["لجان", "التلزيم", "الاستلام", "استثناء", "المجلس", "البلدي"], لجان: ["لجنة", "التلزيم"], عضو: ["أعضاء", "عضو"], عضوا: ["أعضاء", "عضو"], عضوًا: ["أعضاء", "عضو"], الشراء: ["التلزيم", "الجهة الشارية"], مناقصة: ["التلزيم", "مناقصة"] };
  const out = words.flatMap((w) => [w, bare(w), ...(SYN[bare(w)] ?? SYN[w] ?? [])]);
  return [...new Set(out.flatMap((w) => w.split(/\s+/)))].filter((w) => w.length >= 3).slice(0, 16);
}
type Row = { title: string; category: string; published_on: string | null; source_url: string; text_quality: string | null; label: string | null; body: string };
/** Retrieved PPA texts, newest first. OCR rows are flagged: their numbers/dates may be wrong. */
/** Distinct documents from chunk rows (best-match order kept), ordered by legal RANK first and, within a rank, newest ISSUE year first. */
export function ppaMeta(rows: Row[] | null): AuthMeta[] {
  const by = new Map<string, AuthMeta>();
  for (const r of (rows ?? []).slice(0, 12)) {
    const k = instrumentKind(r.category, r.title), o = by.get(r.title);
    if (o) { if (o.excerpt.length < 3500) o.excerpt += `\n${r.body.slice(0, 1300)}`; continue; }
    by.set(r.title, { title: r.title, kind: k, kindAr: KIND_AR[k], rank: RANK[k], year: issueYear(r.title, r.published_on), url: r.source_url, quality: r.text_quality, status: "pending_review", excerpt: r.body.slice(0, 1300), category: r.category });
  }
  return [...by.values()].slice(0, 8).sort((a, b) => a.rank - b.rank || (b.year ?? -1) - (a.year ?? -1));
}
/** Retrieved PPA texts for the prompt: hierarchy first (law > decree > decision > memo > guide), newest issue year within a rank. All are pending review. */
export function ppaExcerpts(rows: Row[] | null): string | undefined {
  const docs = ppaMeta(rows);
  if (!docs.length) return undefined;
  const blocks = docs.map((d) => `### ${d.title} — [${d.kindAr} · مرتبة ${d.rank}${d.year ? ` · ${d.year}` : ""}]\nالتصنيف: ${d.category} | المصدر: ${d.url} | الحالة: قيد المراجعة${d.quality?.includes("ocr") ? " | تنبيه: نص مقروء ضوئيًا، قد تكون الأرقام والتواريخ غير دقيقة فارجع إلى الرابط" : ""}\n${d.excerpt.slice(0, 1800)}`);
  return `=== نصوص هيئة الشراء العام (من موقعها، مرتّبة بمرتبة النص ثم الأحدث صدورًا، كلها قيد المراجعة) ===\n${blocks.join("\n\n")}\nقاعدة: مأخوذة من الموقع ولم تُوثَّق قانونيًا بعد؛ اذكر مصدرها وسنتها و«قيد المراجعة». عند التعارض: الأعلى مرتبة يسود، وضمن المرتبة نفسها الأحدث صدورًا (من عنوان النص أو متنه، لا من تاريخ نشره على الموقع). الأدلة التفسيرية والأسئلة والأجوبة تشرح ولا تُنشئ حكمًا يخالف نصًا أعلى.`;
}
