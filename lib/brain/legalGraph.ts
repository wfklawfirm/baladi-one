import g from "@/data/legal_graph.json";
// Generic concept graph: finds the legal concepts a question touches and the relations (with basis, status, caveats) between them.
// Concepts are NOT absolute synonyms; relations carry a type and a source. Used for (1) topic detection, (2) retrieval expansion, (3) prompt notes.
const n = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْـ]/g, "");
type Concept = { id: string; ar: string; match: string; topic: string; search: string[] };
type Edge = { from: string; to: string; relation: string; absolute: boolean; basis: string[]; status: string; caveats: string[] };
const CONCEPTS = g.concepts as Concept[], EDGES = g.edges as Edge[];
const RES = CONCEPTS.map((c) => ({ c, re: new RegExp(n(c.match)) }));

export const detectConcepts = (q: string): Concept[] => { const t = n(q); return RES.filter((x) => x.re.test(t)).map((x) => x.c); };
/** Procurement topic = any procurement concept present. */
export const isProcurementQuery = (q: string) => detectConcepts(q).some((c) => c.topic === "procurement");
/** Alternative legal phrasing for a second retrieval attempt (concept search phrases). */
export const altSearchTerms = (q: string): string[] => [...new Set(detectConcepts(q).flatMap((c) => c.search).flatMap((s) => s.split(/\s+/)).filter((w) => w.length >= 3))].slice(0, 16);

const REL: Record<string, string> = {
  typically_holder_of: "يتولاها عادةً (ليس مرادفًا مطلقًا)", prohibited_from_chairing_or_membership: "محظور عليه رئاسة أو عضوية",
  excluded_when_council_members_are_used: "يُستثنى عند الاستعانة بأعضاء المجلس البلدي", composition_rules_set_by: "تحكم تأليفها قواعد",
  approves_annual_lists_in_municipalities: "يقرّ لوائحها السنوية في البلديات", appoints_per_procurement_from_lists: "يعيّنها لكل عملية من اللوائح",
};
/** Prompt block: only edges whose both ends (or either) are relevant to the question; always says concepts are not absolute synonyms. */
export function graphNotes(q: string): string | undefined {
  const ids = new Set(detectConcepts(q).map((c) => c.id));
  if (!ids.size) return undefined;
  const name = (id: string) => CONCEPTS.find((c) => c.id === id)?.ar ?? id;
  const edges = EDGES.filter((e) => ids.has(e.from) || ids.has(e.to));
  const dist = (g.distinctions as { ids: string[]; ar: string }[]).filter((d) => d.ids.some((i) => ids.has(i)));
  if (!edges.length && !dist.length) return undefined;
  const lines = edges.map((e) => `- ${name(e.from)} ← ${REL[e.relation] ?? e.relation} → ${name(e.to)} | السند: ${e.basis.join("؛ ")} | الحالة: ${e.status === "needs_source_reading" ? "النص لم يُقرأ آليًا" : "قيد المراجعة"}${e.caveats.length ? ` | تنبيهات: ${e.caveats.join("؛ ")}` : ""}`);
  return `=== خريطة المفاهيم (للاسترشاد وليست نصًا نافذًا؛ المصطلحات ليست مترادفات مطلقة) ===\n${lines.join("\n")}${dist.length ? `\n${dist.map((d) => `- تمييز: ${d.ar}`).join("\n")}` : ""}\nقاعدة: لا تعتمد علاقة هنا حكمًا إلا إذا أيّدها نص مسترجع؛ وأي استنتاج يربط بين نصوص سمّه «استنتاج».`;
}
