import { describe, expect, it } from "vitest";
import raw from "../../data/municipal_decision_templates.json";
import { seedPayload } from "./seed";
import { candidateRefs, defaultRecitals, effectSuggestion, mergeRecitals, notificationSuggestion, verifiedRecitalList, type RuleLite } from "./engine";
import { autofill, missingRequired } from "./data";
import { blocksToText, renderDecision } from "./render";
import type { SourceRow, TemplateContent } from "./model";

const p = seedPayload();
const sources: SourceRow[] = p.sources.map((s) => ({ ...s, effective_from: null })) as SourceRow[];
const tpl = (id: string) => (p.items.find((i) => i.id === id) as unknown as TemplateContent);
const rule = (status: string): RuleLite => ({ rule_id: "R1", instrument_no: "118/1977", article: "49", review_status: status, topic: "t", source_url: null });
void raw;

describe("recitals engine", () => {
  const t = p.items.find((i) => (i as { legal_reference_candidates?: { source_id: string }[] }).legal_reference_candidates?.some((r) => r.source_id === "MUN")) as unknown as TemplateContent;
  it("never marks a reference verified without a verified rule", () => {
    const refs = candidateRefs(t, sources, [rule("pending_review")]);
    expect(refs.every((r) => r.status !== "verified")).toBe(true);
  });
  it("unverified legal recitals are excluded from the official text and reported", () => {
    const refs = candidateRefs(t, sources, []);
    const sel = refs.filter((r) => r.eligible).map((r) => ({ source_id: r.source_id, article: r.article }));
    const rs = defaultRecitals(t, refs, sel);
    const data = { recitals: rs, clauses: [{ text: "مادة" }], verified_legal_recitals: verifiedRecitalList(rs) };
    const off = renderDecision({ snap: t, data, title: "x", mode: "official" });
    expect(off.watermark).toBeNull();
    if (rs.some((r) => r.ref)) expect(off.missing).toContain("verified_legal_recitals");
    const dr = renderDecision({ snap: t, data, title: "x", mode: "draft" });
    expect(dr.watermark).toContain("مسودة");
  });
  it("official output never contains unresolved tokens or the default effective phrase", () => {
    const off = renderDecision({ snap: t, data: { clauses: [{ text: "مادة" }] }, title: "x", mode: "official" });
    const txt = blocksToText(off);
    expect(txt).not.toMatch(/\{\{|【/);
    expect(txt).not.toContain("يعمل بهذا القرار فور صدوره");
  });
  it("merge keeps custom recitals", () => {
    const m = mergeRecitals([{ id: "c1", kind: "whereas", text: "x", included: true, origin: "custom" }], []);
    expect(m).toHaveLength(1);
  });
});

describe("effect suggestions", () => {
  it("explicit validation for no-tacit categories, never 'فور صدوره'", () => {
    const e = effectSuggestion({ category: "budget", level: "mohafez", issuer: "municipal_council" }, []);
    expect(e.text).toContain("صراحةً");
    expect(e.verified).toBe(false);
    expect(e.text).not.toContain("فور صدوره");
  });
  it("verified only when all basis rules are verified", () => {
    const rules: RuleLite[] = ["MUN-118-59-62", "MUN-118-63"].map((id) => ({ ...rule("verified"), rule_id: id }));
    expect(effectSuggestion({ category: "general", level: "qaimaqam", issuer: "municipal_council" }, rules).verified).toBe(true);
    expect(notificationSuggestion({ issuer: "executive_authority", level: "none" }, rules).verified).toBe(false);
  });
});

describe("autofill / required", () => {
  it("fills only what the registers hold", () => {
    const t0 = tpl(p.items[0].id as string);
    const a = autofill(t0, { muni: { name_ar: "بلدية س", governorate_ar: null, district_ar: null }, decision: { decision_no: "5", year: 2026, decided_on: null, vote_for: null, vote_against: null, vote_abstain: null }, session: null, mayorName: null });
    expect(a.governorate).toBeUndefined();
    if ("municipality" in a) expect(a.municipality).toBe("س");
  });
  it("reports missing required fields", () => {
    expect(missingRequired({ fields: [{ key: "a", type: "text", required_for_finalization: true }] }, {})).toEqual(["a"]);
  });
});
