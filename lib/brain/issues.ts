// V3 phase 3: multi-issue decomposition + coverage matrix. Deterministic, data-driven; no legal values.
import cfg from "@/data/legal_issues.json";

type IssueDef = { id: string; label: string; match: string; requires: string[]; only_with?: string[] };
const DEFS = cfg.issues as IssueDef[];
const nz = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْـ]/g, "");

export type Issue = { id: string; label: string; requires: string[] };
export type Coverage = { issue: Issue; covered: string[]; missing: string[]; status: "covered" | "partial" | "uncovered" };

export function decompose(question: string): Issue[] {
  const q = nz(question);
  const hit = new Set<string>();
  for (const d of DEFS) if (!d.only_with && new RegExp(nz(d.match)).test(q)) hit.add(d.id);
  for (const d of DEFS) if (d.only_with && d.only_with.some((x) => hit.has(x)) && new RegExp(nz(d.match)).test(q)) hit.add(d.id);
  return DEFS.filter((d) => hit.has(d.id)).map(({ id, label, requires }) => ({ id, label, requires }));
}

/** A required source counts as covered when any retrieved chunk id / authority title starts with it. */
export function coverageMatrix(issues: Issue[], retrievedIds: string[], authorityTitles: string[] = []): Coverage[] {
  const hay = [...retrievedIds.map((i) => i.split(":")[0]), ...authorityTitles.map(() => "PPA")];
  return issues.map((issue) => {
    const covered = issue.requires.filter((r) => hay.some((h) => h.startsWith(r)));
    const missing = issue.requires.filter((r) => !covered.includes(r));
    return { issue, covered, missing, status: !missing.length ? "covered" : covered.length ? "partial" : "uncovered" };
  });
}
export const uncoveredIssues = (m: Coverage[]) => m.filter((c) => c.status === "uncovered").map((c) => c.issue.label);
