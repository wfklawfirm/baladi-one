import { describe, expect, it } from "vitest";
import { complianceTiles, computeStats, followUps, methodDistribution, planExecution, plannedVsContracted, sumByCurrency, type DashPlan } from "./procurementStats";

const P = (o: Partial<DashPlan> & { id: string }): DashPlan => ({ title: "بند " + o.id, estimated_value: 100, currency: "USD", status: "planned", planned_method: null, contract_id: null, planned_publish_on: null, planned_award_on: null, ...o });
const base = { contracts: [], pubs: [], committees: [], members: [], suppliers: [] as { id: string; docs_expire_on: string | null }[], today: "2026-11-26" };

describe("procurement dashboard stats", () => {
  it("never sums different currencies", () => {
    const s = sumByCurrency([{ v: 10, c: "USD" }, { v: 5, c: "LBP" }, { v: 7, c: "USD" }], (r) => r.v, (r) => r.c);
    expect(s).toEqual({ USD: 17, LBP: 5 });
  });
  it("empty data gives empty totals and null percentage (not 0)", () => {
    const s = computeStats({ ...base, plan: [] });
    expect(s.estimatedByCurrency).toEqual({}); expect(s.execution.pct).toBeNull(); expect(s.active).toBe(0); expect(s.charts.plannedVsContracted).toEqual([]);
    expect(s.openObjections).toBeNull();
  });
  it("execution % excludes cancelled items", () => {
    expect(planExecution([{ status: "done" }, { status: "planned" }, { status: "cancelled" }, { status: "in_progress" }])).toEqual({ done: 1, total: 3, pct: 33.3 });
  });
  it("planned vs contracted stays separate per currency and counts only signed linked contracts", () => {
    const plan = [P({ id: "a", estimated_value: 1000, contract_id: "c1" }), P({ id: "b", estimated_value: 500, currency: "LBP", contract_id: "c2" }), P({ id: "x", estimated_value: 999, status: "cancelled" })];
    const contracts = [{ id: "c1", value: 900, currency: "USD", signed_on: "2026-05-01", status: "signed" }, { id: "c2", value: 400, currency: "LBP", signed_on: null, status: "draft" }, { id: "zz", value: 5, currency: "USD", signed_on: "2026-01-01", status: "signed" }];
    expect(plannedVsContracted(plan, contracts)).toEqual([{ currency: "LBP", planned: 500, contracted: 0 }, { currency: "USD", planned: 1000, contracted: 900 }]);
    expect(computeStats({ ...base, plan, contracts }).signedContracts).toBe(1);
  });
  it("method distribution labels missing method as undefined", () => {
    const d = methodDistribution([{ planned_method: "open_tender", status: "planned" }, { planned_method: null, status: "planned" }, { planned_method: null, status: "done" }, { planned_method: "invoice", status: "cancelled" }]);
    expect(d.find((x) => x.method === "")).toMatchObject({ label: "غير محدد", count: 2 }); expect(d.some((x) => x.method === "invoice")).toBe(false);
  });
  it("follow-ups only for active items with passed dates and no records", () => {
    const plan = [P({ id: "a", planned_publish_on: "2026-10-01", planned_award_on: "2026-11-01" }), P({ id: "b", planned_publish_on: "2026-10-01", status: "done" }), P({ id: "c", planned_publish_on: "2027-01-01" })];
    const f = followUps(plan, [], "2026-11-26"); expect(f).toHaveLength(1); expect(f[0].reasons).toHaveLength(2);
    const pubs = [{ plan_item_id: "a", contract_id: null, platform_url: "u", reference_no: "r", published_on: "2026-10-02", proof_ref: "p" }];
    expect(followUps(plan, pubs, "2026-11-26")[0].reasons).toHaveLength(1);
  });
  it("compliance tiles: declarations, expired docs, unpublished; null when source unavailable", () => {
    const plan = [P({ id: "a", contract_id: "c1" }), P({ id: "b" })];
    const t = complianceTiles({ plan, pubs: [], committees: [{ id: "m1", plan_item_id: "b", contract_id: null }, { id: "m2", plan_item_id: null, contract_id: "c1" }, { id: "m3", plan_item_id: "other", contract_id: null }], members: [{ committee_id: "m1", declaration_on: null, has_conflict: null }, { committee_id: "m2", declaration_on: "2026-01-01", has_conflict: false }, { committee_id: "m3", declaration_on: null, has_conflict: null }], suppliers: [{ id: "s", docs_expire_on: "2026-01-01" }, { id: "t", docs_expire_on: null }], today: "2026-11-26", membersAvailable: true });
    expect(t).toEqual({ missingDeclarations: 1, expiredSupplierDocs: 1, unpublished: 2 });
    expect(complianceTiles({ plan, pubs: [], committees: [], members: [], suppliers: null, today: "2026-11-26", membersAvailable: false })).toMatchObject({ missingDeclarations: null, expiredSupplierDocs: null });
  });
});
