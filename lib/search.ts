import { normalizeArabic, pick } from "./i18n";
import type { CategoryId, Lang, Service } from "./types";

// Words that carry no search meaning in a citizen's question («ما المستندات المطلوبة لرخصة البناء؟»).
const STOP = new Set([
  "ما", "ماذا", "ماهي", "هي", "هو", "كيف", "أين", "متى", "هل", "من", "في", "على", "عن", "إلى", "أو", "أن",
  "أريد", "بدي", "أحتاج", "لدي", "عندي", "المستندات", "مستندات", "المستند", "المطلوبة", "المطلوب", "مطلوبة",
  "الأوراق", "أوراق", "اللازمة", "الشروط", "شروط", "الخطوات", "خطوات", "معاملة", "المعاملة", "طلب", "للحصول",
  "الحصول", "تقديم", "what", "how", "do", "does", "i", "the", "a", "an", "for", "to", "is", "are", "of", "need", "needs",
  "documents", "required",
].map(normalizeArabic));
const PUNCT = /[؟?!.,،؛:«»"'()[\]/\\\-–—]+/g;

/** A word plus its form without Arabic article/preposition prefixes, so «لرخصة» finds «رخصة» and «البناء» finds «بناء». */
function variants(w: string): string[] {
  const m = w.match(/^(?:و|ف|ب|ك|ل)?(?:ال|لل)(.{3,})$/) ?? w.match(/^(?:و|ف|ب|ل)(.{4,})$/);
  return m ? [w, m[1]] : [w];
}

export function queryTokens(query: string): string[][] {
  const words = normalizeArabic(query.replace(PUNCT, " ")).split(/\s+/).filter(Boolean);
  const content = words.filter((w) => !STOP.has(w));
  return (content.length ? content : words).map(variants);
}

/**
 * Keyword search that tolerates question wording. `exact` = every meaningful word matched;
 * otherwise the closest partial matches are returned, best first, so the caller can say so.
 */
export function search<T>(items: T[], query: string, text: (x: T) => string): { items: T[]; exact: boolean } {
  const tokens = queryTokens(query);
  if (!tokens.length) return { items, exact: true };
  const scored = items.map((x) => {
    const hay = normalizeArabic(text(x));
    return [x, tokens.filter((vs) => vs.some((v) => hay.includes(v))).length] as const;
  });
  const full = scored.filter(([, n]) => n === tokens.length);
  if (full.length) return { items: full.map(([x]) => x), exact: true };
  return { items: scored.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([x]) => x), exact: false };
}

export function searchServices(services: Service[], query: string, category: CategoryId | "all", lang: Lang) {
  const pool = category === "all" ? services : services.filter((s) => s.category === category);
  return search(pool, query, (s) => [s.title.ar, s.title.en ?? "", s.summary.ar, s.summary.en ?? "", pick(lang, s.authority)].join(" "));
}
export const filterServices = (services: Service[], query: string, category: CategoryId | "all", lang: Lang): Service[] =>
  searchServices(services, query, category, lang).items;
