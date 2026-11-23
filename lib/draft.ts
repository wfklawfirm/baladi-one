import "server-only";
import raw from "@/data/catalog_draft_slim.json";
import links from "@/data/law_links.json";
import weakLinks from "@/data/law_links_weak.json";
import { getLaw } from "./laws";
import type { Service } from "./types";

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
const W = weakLinks as Record<string, Record<string, number[]>>;

export const getTx = (id: string) => TX.find((t) => t.id === id);

/** Articles that govern a transaction, resolved against the law library. */
export function lawsFor(id: string) {
  const out: { lawId: string; short: string; n: number; heading: string; weak: boolean }[] = [];
  for (const [weak, src] of [[false, L[id]], [true, W[id]]] as const) for (const [lawId, ns] of Object.entries(src ?? {})) {
    const law = getLaw(lawId); if (!law) continue;
    for (const n of ns) { const a = law.articles.find((x) => x.n === n); if (a) out.push({ lawId, short: law.short, n, heading: a.heading, weak }); }
  }
  return out;
}

/** Transactions that cite a given article. */
export function txForArticle(lawId: string, n: number) {
  return [...Object.entries(L), ...Object.entries(W)].filter(([, m]) => m[lawId]?.includes(n)).map(([id]) => getTx(id)).filter(Boolean) as Tx[];
}

/** Portal groups (same mapping as scripts/gen_catalog_drafts.py). */
export type PortalCat = "licenses" | "certificates" | "shops" | "public_works" | "reports";
export function portalCategory(c: string): PortalCat {
  if (/شكاو|مخالفات/.test(c)) return "reports";
  if (/اقتصاد|مهنية/.test(c)) return "shops";
  if (/بناء|البناء|رخص|تراخيص|إشغال|تنظيم|التنظيم|تخطيط|التخطيط/.test(c)) return "licenses";
  if (/أملاك|الأملاك|بنية|سير|بيئة|نظافة|سلامة|فنية|الفنية|مشاع|الأشغال|الأراضي/.test(c)) return "public_works";
  return "certificates";
}

/** Citizen-facing draft transactions in the kiosk/portal Service shape (unapproved: demo=true, never any fees). */
export function draftServices(): Service[] {
  return TX.filter((x) => x.audience === "citizen").map((x) => {
    const uniq = (xs: Item[]) => [...new Set(xs.map((d) => d.t.trim()).filter(Boolean))].map((ar) => ({ ar }));
    const tl = [...new Set(x.timeline.map((d) => d.value.trim()).filter(Boolean))].slice(0, 3).join(" / ");
    return {
      slug: x.id.toLowerCase(), category: portalCategory(x.category), onlineEnabled: false,
      title: { ar: x.title }, summary: { ar: x.category },
      documents: uniq(x.documents), steps: uniq(x.stages),
      authority: x.authority ? { ar: x.authority } : undefined,
      processingTime: tl ? { ar: tl } : undefined,
      sources: [], demo: true, phonePath: `/catalog/${x.id}`,
    } satisfies Service;
  });
}
