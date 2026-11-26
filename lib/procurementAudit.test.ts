import { describe, expect, it } from "vitest";
import { ND, SEALED, buildAuditPack, type AuditInput } from "./procurementAudit";

const base = (o: Partial<AuditInput> = {}): AuditInput => ({
  variant: "internal", generatedAt: "2026-11-26T10:00:00Z", municipality: "بلدية تجريبية",
  item: { id: "i1", fiscal_year: 2026, title: "توريد", need_description: "حاجة", estimated_value: 1000, currency: "USD", budget_line_id: "b", funding_note: null, planned_method: "quotations", responsible: null, planned_publish_on: null, planned_award_on: null, planned_start_on: null, status: "planned", status_note: null, contract_id: "c1", bids_open_on: "2026-11-01T00:00:00Z" },
  budgetLine: { code: "1.1", title_ar: "بند" },
  contract: { id: "c1", contractor: "شركة", subject: "توريد", value: 900, currency: "USD", status: "signed", procurement_method: "quotations", published_on: "2026-10-01", award_notice_on: "2026-10-20", signed_on: "2026-11-05", decision_id: "d1" },
  decision: { id: "d1", decision_no: "12", year: 2026, title: "قرار", decided_on: "2026-09-01", legal_status: "effective" },
  committees: [{ id: "k1", kind: "award", formed_on: "2026-09-10", report_text: "تقرير", report_on: null, result: "pending", result_on: null, members: [{ name: "عضو أول", role_ar: "رئيس", declaration_on: "2026-09-10", has_conflict: true, declaration_note: "سرّي" }, { name: "عضو ثان", role_ar: null, declaration_on: null, has_conflict: null, declaration_note: null }] }],
  publications: [{ kind: "tender_notice", platform_url: "https://x", reference_no: "R1", published_on: "2026-10-01", document_ref: null, proof_ref: "p" }],
  stageEvidence: [], bids: { rows: [{ supplier: "مورد أ", received_on: "2026-10-30", currency: "USD", total_value: 777, delivery_days: 10, warranty_note: "ضمان-XYZ", technical_compliant: null, evaluation_note: null }], count: 1 },
  events: [{ id: 1, action: "procurement.plan_added", entity: "procurement_plan_item", created_at: "2026-09-01T08:00:00Z", actor: "abcdef12-0000", detail: { year: 2026 } }],
  unavailable: [], ...o,
});
const text = (p: ReturnType<typeof buildAuditPack>) => JSON.stringify(p);

describe("audit pack", () => {
  it("internal pack shows bid prices and conflict declarations", () => {
    const t = text(buildAuditPack(base()));
    expect(t).toContain("777"); expect(t).toContain("سرّي"); expect(t).toContain("abcdef12");
  });
  it("shareable pack omits bid financials, declarations, actors and raw details", () => {
    const p = buildAuditPack(base({ variant: "shareable" })), t = text(p);
    expect(t).not.toContain("777"); expect(t).not.toContain("سرّي"); expect(t).not.toContain("abcdef12"); expect(t).not.toContain("ضمان-XYZ");
    expect(t).toContain("مورد أ");
    expect(p.missing.some((m) => m.text.includes("عضو ثان"))).toBe(false);
    expect(p.missing.some((m) => m.section === "التصاريح")).toBe(true);
  });
  it("sealed bids are not included before opening; only the count", () => {
    const p = buildAuditPack(base({ item: { ...base().item, bids_open_on: "2026-12-30T00:00:00Z" }, bids: { rows: [], count: 3 } }));
    const t = text(p); expect(t).toContain(SEALED); expect(t).toContain("3"); expect(t).not.toContain("مورد أ");
    expect(p.missing.some((m) => m.section === "العروض")).toBe(false);
  });
  it("lists missing records explicitly, and unavailable sources separately from empty ones", () => {
    const p = buildAuditPack(base({ contract: null, decision: null, committees: [], publications: [], events: [], unavailable: ["العروض"], item: { ...base().item, need_description: null, budget_line_id: null, estimated_value: 0 } }));
    const m = p.missing.map((x) => x.text).join("|");
    for (const k of ["وصف الحاجة", "الكلفة التقديرية", "لا بند موازنة", "لا عقد مربوط", "لا لجنة تلزيم", "لا سجل نشر", "لا أحداث تدقيق", "تعذّرت قراءة: العروض"]) expect(m).toContain(k);
    expect(text(p)).toContain(ND);
  });
  it("complete file has no missing items except unevaluated bid", () => {
    const p = buildAuditPack(base({ committees: [{ ...base().committees[0], members: [{ name: "ع", role_ar: null, declaration_on: "2026-09-10", has_conflict: false, declaration_note: null }] }] }));
    expect(p.missing.map((x) => x.section)).toEqual(["التقييم"]);
  });
  it("never merges estimate and contract value", () => {
    const p = buildAuditPack(base()); const est = p.sections.find((s) => s.id === "estimate")!, con = p.sections.find((s) => s.id === "contract")!;
    expect(est.kv![0][1]).toContain("1,000"); expect(con.kv!.find((x) => x[0] === "قيمة العقد")![1]).toContain("900");
  });
});
