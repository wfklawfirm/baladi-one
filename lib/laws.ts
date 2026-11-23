import "server-only";
import raw from "@/data/laws.json";
import { normalizeArabic } from "./i18n";

export type Article = { n: number; heading: string; part: string; text: string; note: string };
export type Law = {
  id: string; title: string; short: string; number: string; date: string; url: string; source: string;
  article_count: number; missing: number[]; note: string; source_note: string; articles: Article[];
};

export const LAWS = raw as unknown as Law[];

export function getLaw(id: string): Law | undefined {
  return LAWS.find((l) => l.id.toLowerCase() === id.toLowerCase());
}

export type Hit = { law: Law; article: Article; score: number };

/** Every query word must appear in the article; a number-only query matches article numbers exactly. */
export function searchLaws(query: string, lawId?: string, limit = 60): Hit[] {
  const q = normalizeArabic(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const num = /^\d+$/.test(q) ? Number(q) : null;
  const hits: Hit[] = [];
  for (const law of LAWS) {
    if (lawId && law.id !== lawId) continue;
    for (const a of law.articles) {
      if (num !== null) { if (a.n === num) hits.push({ law, article: a, score: 100 }); continue; }
      const head = normalizeArabic(`${a.heading} ${a.part}`);
      const body = normalizeArabic(a.text);
      if (!words.every((w) => head.includes(w) || body.includes(w))) continue;
      const score = words.reduce((s, w) => s + (head.includes(w) ? 5 : 0) + Math.min(5, body.split(w).length - 1), 0);
      hits.push({ law, article: a, score });
    }
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, limit);
}

export function snippet(text: string, query: string, len = 220): string {
  const words = normalizeArabic(query).split(/\s+/).filter(Boolean);
  const norm = normalizeArabic(text);
  let at = -1;
  for (const w of words) { at = norm.indexOf(w); if (at >= 0) break; }
  const start = Math.max(0, at - 60);
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + (start + len < text.length ? "…" : "");
}
