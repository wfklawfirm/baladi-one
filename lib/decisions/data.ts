import { quorumState } from "@/lib/council";
import { AUTO_KEYS, type DraftData, type TemplateContent } from "./model";
import { fmtDate } from "./render";

export type AutoCtx = {
  muni: { name_ar: string; governorate_ar: string | null; district_ar: string | null };
  decision: { decision_no: string; year: number; decided_on: string | null; vote_for: number | null; vote_against: number | null; vote_abstain: number | null };
  session: { session_no: string | null; title: string; held_on: string; members_total: number | null; members_present: number | null; summoned_on: string | null; is_second_meeting: boolean } | null;
  mayorName: string | null;
};

const num = (n: number | null) => (n === null ? null : String(n));
/** Values taken from the registers. Anything the registers do not hold is left out (never guessed) and reported as missing by the editor. */
export function autofill(snap: TemplateContent, c: AutoCtx): Record<string, string> {
  const o: Record<string, string> = {};
  const keys = new Set(snap.fields.map((f) => f.key));
  const put = (k: string, v: string | null | undefined) => { if (keys.has(k) && v) o[k] = v; };
  const s = c.session, d = c.decision;
  put("municipality", c.muni.name_ar.replace(/^بلدية\s+/, ""));
  put("governorate", c.muni.governorate_ar); put("district", c.muni.district_ar);
  put("decision_number", d.decision_no); put("decision_date", d.decided_on);
  put("issuer_name", c.mayorName);
  if (s) {
    put("session_ref", [s.session_no, s.title].filter(Boolean).join(" — ")); put("session_date", s.held_on); put("invitation_date", s.summoned_on);
    if (s.members_total !== null && s.members_present !== null) {
      const q = quorumState(s.members_total, s.members_present, s.is_second_meeting);
      put("quorum_record", `حضر ${s.members_present} من أصل ${s.members_total} أعضاء (النصاب المطلوب ${q.need}) — ${q.ok ? "النصاب مكتمل" : "النصاب غير مكتمل"}`);
    }
  }
  if (d.vote_for !== null || d.vote_against !== null) put("vote_record", `مع: ${num(d.vote_for) ?? "—"}، ضد: ${num(d.vote_against) ?? "—"}، ممتنع: ${num(d.vote_abstain) ?? "—"}`);
  return o;
}

/** Initial data of a new draft: register values first, then whatever the user already typed. */
export const mergeData = (snap: TemplateContent, ctx: AutoCtx, user: DraftData): DraftData => ({ ...user, ...autofill(snap, ctx) });

/** Mirror of the database function _dt_missing (the database re-checks at adoption). */
export function missingRequired(snap: Pick<TemplateContent, "fields">, data: DraftData): string[] {
  return snap.fields.filter((f) => f.required_for_finalization).map((f) => f.key).filter((k) => {
    const v = (data as Record<string, unknown>)[k];
    return v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
  });
}
export const isAuto = (k: string) => AUTO_KEYS.has(k);
export const shortDate = fmtDate;
