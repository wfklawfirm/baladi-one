import "server-only";
import raw from "@/data/catalog_draft_slim.json";
import links from "@/data/law_links.json";
import { getLaw } from "./laws";

type Item = { t: string; s: string };
export type Tx = {
  id: string; title: string; category: string; authority: string; legal_basis: string;
  documents: Item[]; stages: Item[]; timeline: { src: string; value: string }[];
  extra: Item[]; extra_stages: Item[]; extra_timeline: { src: string; value: string }[];
  notes: string; sources: string[]; confidence: string; audience: "citizen" | "municipality_ministry" | "internal";
};
export const TX = (raw as unknown as { catalog: Tx[] }).catalog;
export const AUDIENCE_LABELS: Record<string, string> = (raw as any).audience_labels;
const L = links as Record<string, Record<string, number[]>>;

export const getTx = (id: string) => TX.find((t) => t.id === id);

/** Articles that govern a transaction, resolved against the law library. */
export function lawsFor(id: string) {
  const out: { lawId: string; short: string; n: number; heading: string }[] = [];
  for (const [lawId, ns] of Object.entries(L[id] ?? {})) {
    const law = getLaw(lawId); if (!law) continue;
    for (const n of ns) { const a = law.articles.find((x) => x.n === n); if (a) out.push({ lawId, short: law.short, n, heading: a.heading }); }
  }
  return out;
}

/** Transactions that cite a given article. */
export function txForArticle(lawId: string, n: number) {
  return Object.entries(L).filter(([, m]) => m[lawId]?.includes(n)).map(([id]) => getTx(id)).filter(Boolean) as Tx[];
}
