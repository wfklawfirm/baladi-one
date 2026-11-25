import raw from "@/data/municipal_decision_templates.json";
import { SOURCE_META, suggestClassification, type TemplateContent } from "./model";

type Seed = { sources: Record<string, { title: string; url?: string; kind: string }>; templates: (TemplateContent & { id: string; version: string })[]; status?: string; as_of?: string };
const S = raw as unknown as Seed;

/** Seed library prepared for the dt_import RPC. Classification is a suggestion; every template is imported as pending_legal_review, never approved. */
export function seedPayload() {
  const sources = Object.entries(S.sources).map(([source_id, s]) => ({ source_id, title: s.title, url: s.url ?? null, kind: s.kind, instrument_no: SOURCE_META[source_id]?.instrument_no ?? null, law_id: SOURCE_META[source_id]?.law_id ?? null }));
  const items = S.templates.map((t) => ({ ...t, classification: { ...suggestClassification(t.id), basis: "suggested_pending_review" } }));
  return { sources, items, total: items.length, asOf: S.as_of ?? null };
}
