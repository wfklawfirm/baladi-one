import type { CategoryId } from "./types";

/** Second level of the citizen directory: each main topic split into a few readable sub-topics. */
export type SubTopic = { id: string; label: string };
type Def = SubTopic & { match?: RegExp };

// Matched in order against the transaction's source category; the last entry of each topic is the fallback.
const DEFS: Record<CategoryId, Def[]> = {
  licenses: [
    { id: "building", label: "البناء والترميم", match: /بناء/ },
    { id: "planning", label: "التنظيم المدني والتخطيط", match: /التنظيم المدني|التخطيط/ },
    { id: "traffic", label: "السير والطرقات", match: /السير/ },
    { id: "permits", label: "رخص الإشغال والتراخيص الفنية", match: /إشغال|تراخيص/ },
    { id: "council", label: "المجلس البلدي والشؤون الإدارية" },
  ],
  certificates: [
    { id: "attest", label: "الإفادات والشهادات", match: /إفادات|شهادات/ },
    { id: "mukhtar", label: "معاملات المختار", match: /المختار/ },
    { id: "health", label: "الصحة العامة", match: /الصحة/ },
    { id: "finance", label: "الرسوم والشؤون المالية", match: /رسوم|المالية|جباية|إعفاءات|ضرائب/ },
    { id: "appeals", label: "الاعتراضات والرقابة", match: /اعتراض|طعون|القضاء|الرقابة/ },
    { id: "social", label: "التربية والثقافة والشؤون الاجتماعية", match: /التربوية|الاجتماعية/ },
    { id: "contracts", label: "العقود والمشتريات والعقارات", match: /مشتريات|عقود|التعاقد|بيوع|الاستملاك/ },
    { id: "general", label: "معاملات عامة" },
  ],
  shops: [{ id: "econ", label: "الأنشطة الاقتصادية والمهنية" }],
  public_works: [
    { id: "property", label: "الأملاك البلدية", match: /أملاك|الأراضي/ },
    { id: "safety", label: "السلامة العامة", match: /السلامة العامة/ },
    { id: "environment", label: "البيئة والنظافة", match: /البيئة|النظافة/ },
    { id: "technical", label: "الشؤون الفنية والصيانة" },
  ],
  reports: [{ id: "complaints", label: "الشكاوى والمخالفات" }],
};

export const subTopics = (topic: CategoryId): SubTopic[] => DEFS[topic].map(({ id, label }) => ({ id, label }));
export function subTopicOf(topic: CategoryId, sourceCategory: string): SubTopic {
  const defs = DEFS[topic];
  const d = defs.find((x) => x.match?.test(sourceCategory)) ?? defs[defs.length - 1];
  return { id: d.id, label: d.label };
}

/** Arabic count with correct number agreement: معاملة واحدة، معاملتان، 3 معاملات، 11 معاملة. */
export function countAr(n: number): string {
  if (n === 0) return "لا معاملات";
  if (n === 1) return "معاملة واحدة";
  if (n === 2) return "معاملتان";
  return n % 100 >= 3 && n % 100 <= 10 ? `${n} معاملات` : `${n} معاملة`;
}
