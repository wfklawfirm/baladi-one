import { auditGuards, GUARDS } from "./assistantGuards";
// Kept as a thin wrapper: the mayor-committee rule now lives in data/assistant_guards.json and runs through the generic engine.
const g = GUARDS.find((x) => x.id === "mayor-procurement-committee")!;
const n = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْـ]/g, "");
export const mayorExcludedBySources = (sourcesText: string) => new RegExp(n(g.when_source)).test(n(sourcesText));
export const auditCommitteeMayor = (answer: string, sourcesText: string): string | null => auditGuards(answer, sourcesText, [g])?.message ?? null;
export const SAFE_COMMITTEE_NOTE = g.safe_note;
