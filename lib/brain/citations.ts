import type { AuthMeta } from "./claims";
// Structured citations: only sources that carry a real supporting excerpt are shown. No empty or unrelated sources.
export type Citation = { title: string; kind: string; year: number | null; url: string | null; status: string; quality: string | null; excerpt: string; domain: string; preview: string; score: number };
const nz = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْـ]/g, "");
/** The sentence of `body` that shares the most query terms (null when none shares any). */
export function bestSentence(body: string, terms: string[]): string | null {
  const ts = terms.map(nz).filter((t) => t.length >= 3);
  let best: { s: string; n: number } | null = null;
  for (const s of body.split(/(?<=[.؟!؛\n])\s+/)) {
    const t = nz(s); const hit = ts.filter((x) => t.includes(x)).length;
    if (hit > 0 && s.trim().length >= 25 && (!best || hit > best.n)) best = { s: s.trim(), n: hit };
  }
  return best ? best.s.replace(/\s+/g, " ").slice(0, 280) : null;
}
const STATUS_AR: Record<string, string> = { pending_review: "قيد المراجعة", verified: "موثّق", rejected: "مرفوض", superseded: "منسوخ" };
export function authorityCitations(docs: AuthMeta[], terms: string[]): Citation[] {
  return docs.flatMap((d) => {
    const ex = bestSentence(d.excerpt, terms); if (!ex) return [];
    return [{ title: d.title, kind: d.kindAr, year: d.year, url: d.url || null, status: STATUS_AR[d.status] ?? d.status, quality: d.quality, excerpt: ex, domain: d.kindAr, preview: ex, score: 1 }];
  });
}
