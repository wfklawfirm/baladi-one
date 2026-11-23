import "server-only";
import fs from "node:fs";
import path from "node:path";
import { LAWS } from "@/lib/laws";

export type Row = { law_id: string; article: number; title: string; body: string; source: string; domain: string };
let cache: Row[] | null = null;

/** Everything the AI can search: law library, municipal transactions, and the reference books (data/kb). Deterministic order. */
export function corpus(): Row[] {
  if (cache) return cache;
  const laws: Row[] = LAWS.flatMap((l) => l.articles.filter((a) => a.text?.trim()).map((a) => ({
    law_id: l.id, article: a.n, source: "law_library", domain: "D01",
    title: `${l.title} — المادة ${a.n}${a.heading ? ` (${a.heading})` : ""}`,
    body: `${l.title}${l.number ? ` (${l.number})` : ""}\nالمادة ${a.n}${a.heading ? ` — ${a.heading}` : ""}\n${a.text}`.slice(0, 6000),
  })));
  const dir = path.join(process.cwd(), "data", "kb");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  // services and official forms first (small, high value), then books
  const head = ["services.json", "forms.json"]; files.sort((a, b) => (head.indexOf(a) < 0 ? 99 : head.indexOf(a)) - (head.indexOf(b) < 0 ? 99 : head.indexOf(b)) || a.localeCompare(b));
  const kb = files.flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as Row[]).map((r) => ({ ...r, domain: r.domain ?? "D01", body: r.body.slice(0, 6000) }));
  return (cache = [...laws, ...kb]);
}
