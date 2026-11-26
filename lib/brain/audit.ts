// Pure, deterministic checks run on every draft BEFORE it reaches the user. No network, no model.
export type AuditChunk = { title: string; text: string };

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

/** Is the question/answer about a municipality (the default for this product)? */
export const isMunicipalContext = (t: string) => /بلدي|بلدية|بلديات|المجلس البلدي|رئيس البلدية/.test(t);

const MINISTERIAL_MARKERS: [RegExp, string][] = [
  [/الوزير\s+المختص/, "توقيع «الوزير المختص» — القرار في الملك البلدي يصدر عن المجلس البلدي/رئيس البلدية لا عن وزير"],
  [/بناءً?\s+على\s+اقتراح\s+الوزير/, "ديباجة «بناءً على اقتراح الوزير» لا تنطبق على قرار بلدي"],
  [/وزارة\s*\[[^\]]*(?:الوزارة|المختصة)[^\]]*\]/, "ترويسة «وزارة [اسم الوزارة المختصة]» بدل ترويسة البلدية"],
  [/الدراسة\s+الفنية\s+المعدة\s+من\s+قبل\s+الوزارة/, "إسناد الدراسة إلى الوزارة بدل البلدية"],
];

/** The assistant's own heading template always starts with the municipality; flag decision drafts lacking it. */
function extractTemplates(answer: string): string[] {
  const out: string[] = [];
  const re = /<TEMPLATE:[^>]*>([\s\S]*?)<\/TEMPLATE>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer))) out.push(m[1]);
  return out;
}

export function citedArticles(text: string): string[] {
  const t = westernDigits(text);
  const out = new Set<string>();
  const re = /(?:المادة|المادتين|المواد|مادة)\s*(?:رقم\s*)?(\d{1,4})(?:\s*(?:و|،|,)\s*(\d{1,4}))*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    for (const n of m[0].match(/\d{1,4}/g) ?? []) out.add(n);
  }
  return [...out];
}

function articleInChunks(n: string, chunks: AuditChunk[]): boolean {
  const re = new RegExp(`(?:المادة|مادة|المواد|م\\.?)\\s*(?:رقم\\s*)?${n}(?!\\d)|(?:^|[^\\d])${n}\\s*[-–:.)ـ]`, "m");
  return chunks.some((c) => re.test(westernDigits(`${c.title}\n${c.text}`)));
}

export type AuditResult = { ok: boolean; issues: string[] };

export function auditDraft(answer: string, chunks: AuditChunk[], query = ""): AuditResult {
  const issues: string[] = [];
  const municipal = isMunicipalContext(query) || isMunicipalContext(answer);
  const templates = extractTemplates(answer);
  const scan = templates.length ? templates.join("\n") : answer;
  if (municipal) {
    for (const [re, why] of MINISTERIAL_MARKERS) if (re.test(scan)) issues.push(why);
    for (const t of templates) {
      if (!/بلدية|المجلس البلدي|رئيس البلدية/.test(t)) issues.push("نموذج القرار لا يذكر البلدية/المجلس البلدي/رئيس البلدية");
    }
    // property-drop questions: «الملك العام» must be framed as municipal property
    if (/إسقاط|اسقاط/.test(query) && /ملك/.test(query) && /(?:الملك|ملك)\s+العام/.test(answer) && !/بلدي/.test(answer)) issues.push("إسقاط الملك العام ورد دون تقييده بالملك البلدي");
  }
  // cited article numbers must be present in the retrieved sources
  const cited = citedArticles(answer);
  const unsupported = cited.filter((n) => !articleInChunks(n, chunks));
  if (cited.length && !chunks.length) issues.push(`ذُكرت مواد (${cited.join("، ")}) دون أي مصدر مسترجع للتحقق منها`);
  else if (unsupported.length) issues.push(`مواد غير واردة في المصادر المسترجعة: ${unsupported.join("، ")}`);
  return { ok: issues.length === 0, issues };
}
