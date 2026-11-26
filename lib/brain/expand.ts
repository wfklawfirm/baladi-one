// Pure query understanding: widens retrieval and finds a matching library template. No network.
import raw from "../../data/municipal_decision_templates.json";

export type LibTemplate = { id: string; title_ar: string; category_ar?: string; status?: string; legal_reference_candidates?: { source_id: string; article_candidates?: string }[]; operative_clauses_ar?: string[]; facts_recitals_ar?: string[]; issuer_candidate?: string };
const TEMPLATES = ((raw as unknown as { templates: LibTemplate[] }).templates) ?? [];

const norm = (t: string) => t.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْ]/g, "").toLowerCase();

const RULES: { when: RegExp; add: string[] }[] = [
  { when: /(?:اسقاط|إسقاط)\s*(?:ال)?(?:ملك|املاك)|ملك\s*(?:بلدي\s*)?عام.*خاص/, add: ["إسقاط الملك البلدي العام إلى ملك بلدي خاص", "انتفاء التخصيص للمنفعة العامة المجلس البلدي", "الأملاك العامة البلدية والأملاك الخاصة البلدية قانون البلديات المادة 49", "تصديق سلطة الوصاية على قرارات المجلس البلدي المتعلقة بالأملاك"] },
  { when: /تلزيم|مناقصه|مناقصة|استدراج|شراء/, add: ["قانون الشراء العام وأصول التلزيم البلدي"] },
  { when: /رخصه بناء|رخصة بناء|مخالفه بناء|مخالفة بناء/, add: ["رخص البناء والمخالفات في نطاق البلدية"] },
];

/** Original query first, then up to 4 extra search phrasings. Always municipal-anchored. */
export function expandQuery(q: string): string[] {
  const n = norm(q);
  const out = [q];
  for (const r of RULES) if (r.when.test(n) || r.when.test(q)) out.push(...r.add);
  if (!/بلدي|بلديه|بلدية/.test(n)) out.push(`${q} في البلدية`);
  return [...new Set(out)].slice(0, 5);
}

export const wantsTemplate = (q: string) => /نموذج|قالب|صيغه|صيغة|مسوده|مسودة|اكتب\s+(?:لي\s+)?قرار|انشئ|أنشئ|اعد|أعد/.test(norm(q) + " " + q) && /قرار|محضر|كتاب|عقد/.test(q);

/** Best library template for the question: every ≥3-letter word of its title must be covered. */
export function matchTemplate(q: string): LibTemplate | null {
  const nq = norm(q);
  let best: { t: LibTemplate; s: number } | null = null;
  for (const t of TEMPLATES) {
    const words = norm(t.title_ar).split(/\s+/).filter((w) => w.length >= 3 && !["الى", "من", "على"].includes(w));
    if (!words.length) continue;
    const hit = words.filter((w) => nq.includes(w.replace(/^ال/, ""))).length;
    const s = hit / words.length;
    if (s >= 0.75 && (!best || s > best.s)) best = { t, s };
  }
  return best?.t ?? null;
}

export function templateGrounding(t: LibTemplate): string {
  const refs = (t.legal_reference_candidates ?? []).map((r) => `${r.source_id}${r.article_candidates ? ` م.${r.article_candidates}` : ""}`).join("، ");
  return `=== قالب مرجعي من مكتبة القرارات البلدية (${t.id} — ${t.title_ar}) ===\nالجهة المصدِرة المرشحة: ${t.issuer_candidate === "municipal_council" ? "المجلس البلدي" : t.issuer_candidate ?? "—"}\nالحالة: ${t.status ?? "—"} (مسودة قيد المراجعة القانونية — ليست معتمدة)\nالسند المرشح: ${refs || "—"} (مرشح ويحتاج تحققاً)\nالوقائع: ${(t.facts_recitals_ar ?? []).join(" | ")}\nالمنطوق: ${(t.operative_clauses_ar ?? []).join(" | ")}\nاستخدم هذا القالب أساساً للنموذج، بترويسة البلدية وبتوقيع رئيس البلدية/المجلس البلدي، ولا تحوّله إلى قرار وزاري.`;
}
