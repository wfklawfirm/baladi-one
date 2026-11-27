// Legal source hierarchy (rank 1 = highest). Rank decides which text prevails on CONFLICT; within a rank the newest ISSUE year prevails.
// A special implementing text on point (e.g. a regulatory decision) is cited together with the higher law, never replaced by publication date alone.
export type Kind = "law" | "legislative_decree" | "decree" | "regulatory_decision" | "memo_circular" | "opinion" | "guide" | "template" | "book" | "other";
export const KIND_AR: Record<Kind, string> = { law: "قانون", legislative_decree: "مرسوم اشتراعي", decree: "مرسوم", regulatory_decision: "قرار تنظيمي", memo_circular: "مذكرة/تعميم", opinion: "اجتهاد/استشارة/توصية", guide: "دليل تفسيري/أسئلة وأجوبة", template: "نموذج", book: "كتاب مرجعي", other: "نص" };
export const RANK: Record<Kind, number> = { law: 1, legislative_decree: 2, decree: 3, regulatory_decision: 4, memo_circular: 5, opinion: 6, guide: 7, template: 8, book: 9, other: 9 };
const nz = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
export function instrumentKind(category: string, title = ""): Kind {
  const c = nz(category), t = nz(title);
  if (/مرسوم\s+اشتراعي/.test(t)) return "legislative_decree";
  if (/^قوانين|^انظمه وتشريعات/.test(c)) return /مرسوم\s+اشتراعي/.test(t) ? "legislative_decree" : "law";
  if (/^مراسيم/.test(c)) return "decree";
  if (/قرارات/.test(c)) return "regulatory_decision";
  if (/مذكرات|تعاميم/.test(c)) return "memo_circular";
  if (/توصيات|اجتهاد|استشار/.test(c)) return "opinion";
  if (/دليل|اسئله/.test(c)) return "guide";
  if (/نماذج|دفاتر/.test(c)) return "template";
  if (/كتب/.test(c)) return "book";
  return "other";
}
