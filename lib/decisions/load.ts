import "server-only";
import { getLaw } from "@/lib/laws";
import { SOURCE_META, type SourceRow, type TemplateContent, type TemplateRow } from "./model";
import type { RefView, RuleLite } from "./engine";

export const TPL_COLS = "id,template_id,seq,version,status,title_ar,category_ar,issuer,document_kind,domain,nature,risk,effective_from,effective_to,review_note,submitted_at,approved_at,updated_at";
type Sb = { from: (t: string) => any };

export async function loadTemplates(sb: Sb): Promise<{ rows: TemplateRow[]; ok: boolean }> {
  try {
    const { data, error } = await sb.from("decision_template_version").select(TPL_COLS).order("template_id").order("seq", { ascending: false }).limit(1000);
    return { rows: error ? [] : ((data ?? []) as TemplateRow[]), ok: !error };
  } catch { return { rows: [], ok: false }; }
}
export async function loadTemplate(sb: Sb, id: string): Promise<TemplateRow | null> {
  try { const { data } = await sb.from("decision_template_version").select(`${TPL_COLS},content`).eq("id", id).maybeSingle(); return (data as TemplateRow) ?? null; } catch { return null; }
}
export async function loadSources(sb: Sb): Promise<SourceRow[]> {
  try { const { data } = await sb.from("decision_source").select("source_id,title,url,kind,instrument_no,law_id,effective_from"); return (data ?? []) as SourceRow[]; } catch { return []; }
}
export async function loadRules(sb: Sb): Promise<RuleLite[]> {
  try { const { data } = await sb.from("legal_rule").select("rule_id,instrument_no,article,review_status,topic,source_url").limit(1000); return (data ?? []) as RuleLite[]; } catch { return []; }
}

/** Latest usable version per template (approved first, then the newest pending one). */
export function bestVersions(rows: TemplateRow[]): TemplateRow[] {
  const by = new Map<string, TemplateRow[]>();
  for (const r of rows) by.set(r.template_id, [...(by.get(r.template_id) ?? []), r]);
  const out: TemplateRow[] = [];
  for (const list of by.values()) {
    const ok = list.filter((r) => r.status === "approved" || r.status === "pending_legal_review" || r.status === "draft");
    const pick = ok.find((r) => r.status === "approved") ?? ok.sort((a, b) => b.seq - a.seq)[0];
    if (pick) out.push(pick);
  }
  return out.sort((a, b) => a.template_id.localeCompare(b.template_id, "en", { numeric: true }));
}

/** Adds the article heading from the local law library (informational only: the library text is not an approved source). */
export function withLibrary(refs: RefView[]): RefView[] {
  return refs.map((r) => {
    const lawId = SOURCE_META[r.source_id]?.law_id;
    const law = lawId ? getLaw(lawId) : undefined;
    const n = /^\d+$/.test(r.article) ? Number(r.article) : null;
    const a = law && n !== null ? law.articles.find((x) => x.n === n) : undefined;
    return { ...r, inLibrary: !!a, heading: a?.heading ?? null };
  });
}
export const snapshotOf = (c: unknown) => c as TemplateContent;
