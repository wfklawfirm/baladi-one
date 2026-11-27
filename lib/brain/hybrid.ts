// V3 phase 5: exact article lookup + full-text legs for hybrid retrieval (vector leg stays in rag.ts).
export type ArticleRef = { law: string; article: number };
const nz = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
// law-name → law_id in the platform library (identifiers only; no legal values)
const LAWS: { re: RegExp; id: string }[] = [
  { re: /قانون\s+البلديات|قانون\s+118|118\/1977|البلديات/, id: "MUN-118" },
  { re: /قانون\s+الشراء|الشراء\s+العام|244\/2021/, id: "PROC-244" },
  { re: /المحاسبه\s+العموميه|5595|محاسبه\s+عموميه/, id: "MACC-5595" },
];
export function parseArticleRefs(query: string): ArticleRef[] {
  const q = toLatin(nz(query));
  const out: ArticleRef[] = [];
  for (const m of q.matchAll(/(?:المادة|المادع|مادة|ماده|المــاده|الماده)\s*(\d{1,4})([^.؟?\n]{0,60})/g)) {
    const tail = m[2];
    const law = LAWS.find((l) => l.re.test(tail));
    if (law) out.push({ law: law.id, article: Number(m[1]) });
  }
  return out;
}

// topic → extra instruments that must be fetched by id (the vector index has no embedding for text added later)
const TOPIC_LAWS: { re: RegExp; ref: ArticleRef }[] = [
  { re: /سقف|السقوف|مليار|ضمان\s+العرض|بالفاتوره|طلب\s+عروض|خطه\s+الشراء|دفع\s+قيمه\s+العقد/, ref: { law: "PROC-14063", article: 1 } },
];
export const topicRefs = (query: string): ArticleRef[] => TOPIC_LAWS.filter((t) => t.re.test(nz(query))).map((t) => t.ref);
