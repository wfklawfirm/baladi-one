// V3 phase 5: exact article lookup + full-text legs for hybrid retrieval (vector leg stays in rag.ts).
export type ArticleRef = { law: string; article: number };
const nz = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
// law-name → law_id in the platform library (identifiers only; no legal values)
const LAWS: { re: RegExp; id: string }[] = [
  { re: /الاملاك\s+العمومي[ةه]|الاملاك\s+العام[ةه]|144\/س|144\/1925/, id: "PUBPROP-144S-1925" },
  { re: /الرسوم\s+والعلاوات|قانون\s+الرسوم|60\/88|60\/1988|88\/60/, id: "MUN-60-1988" },
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
  // committee composition: PROC-244 now holds the consolidated text; Law 309/2023 and CoA opinion 46/2025 are still pulled alongside (art 11(3) caveat applies)
  { re: /لجن[ةه]\s+(التلزيم|الاستلام|الشراء|المناقص)|تشكيل\s+لجن|اعضاء\s+لجن/, ref: { law: "PROC-309", article: 1 } },
  { re: /لجن[ةه]\s+(التلزيم|الاستلام|الشراء|المناقص)|تشكيل\s+لجن|اعضاء\s+لجن/, ref: { law: "COA-46-2025", article: 1 } },
  // municipal public-property occupation: Decision 144/S arts 14, 16-18 (temporary occupation permits) + the 144/S fines article
  { re: /اشغال\s+(?:الملك|الاملاك)|اشغال\s+موقت|اجاز[ةه]\s+اشغال|الاملاك\s+(?:العمومي|العام)|تعدي\s+على\s+(?:الملك|الاملاك)|الرصيف|الشاطي/, ref: { law: "PUBPROP-144S-1925", article: 14 } },
  { re: /اشغال\s+(?:الملك|الاملاك)|اشغال\s+موقت|اجاز[ةه]\s+اشغال|الاملاك\s+(?:العمومي|العام)|تعدي\s+على\s+(?:الملك|الاملاك)|الرصيف/, ref: { law: "PUBPROP-144S-1925", article: 16 } },
  { re: /اشغال\s+(?:الملك|الاملاك)|اشغال\s+موقت|اجاز[ةه]\s+اشغال|الاملاك\s+(?:العمومي|العام)|تعدي\s+على\s+(?:الملك|الاملاك)|الرصيف/, ref: { law: "PUBPROP-144S-1925", article: 18 } },
  { re: /مخالف[ةه]\s+(?:على\s+)?(?:الملك|الاملاك)|غرام[ةه]\s+اشغال|محضر\s+ضبط.*(?:الملك|الاملاك)/, ref: { law: "PUBPROP-144S-1925", article: 23 } },
  // purchase by invoice / amicable agreement: the procurement-law method articles
  { re: /بالفاتوره|شراء\s+بفاتوره|فاتوره/, ref: { law: "PROC-244", article: 47 } },
  { re: /بالفاتوره|شراء\s+بفاتوره|فاتوره/, ref: { law: "PROC-244", article: 60 } },
  { re: /بالتراضي|اتفاق\s+رضائي|الرضائي|تراضي/, ref: { law: "PROC-244", article: 46 } },
  { re: /بالتراضي|اتفاق\s+رضائي|الرضائي|تراضي/, ref: { law: "PROC-244", article: 62 } },
  { re: /لجن[ةه]\s+(التلزيم|المناقص|الشراء)|تشكيل\s+لجن|اعضاء\s+لجن/, ref: { law: "PROC-244", article: 100 } },
  { re: /لجن[ةه]\s+(الاستلام)|تشكيل\s+لجن|اعضاء\s+لجن/, ref: { law: "PROC-244", article: 101 } },
  // Law 21/2025: spending limit of mayor/council, fee doubling, sewer fee, ×20 on arts 59–61 of the municipal law
  { re: /عقد\s+النفق|سقف\s+النفق|النفقه\s+المسموح|صلاحيه\s+(?:رئيس\s+البلديه\s+)?(?:في\s+)?الانفاق/, ref: { law: "MUN-21-2025", article: 3 } },
  { re: /رسم\s+صيانه\s+(?:المجارير|مجارير)|مجارير\s+وارصفه/, ref: { law: "MUN-21-2025", article: 2 } },
  { re: /تضاعف\s+الرسوم|الرسوم\s+المقطوعه/, ref: { law: "MUN-21-2025", article: 1 } },
];
export const topicRefs = (query: string): ArticleRef[] => TOPIC_LAWS.filter((t) => t.re.test(nz(query))).map((t) => t.ref);
