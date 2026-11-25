import { describe, expect, it } from "vitest";
import { amendMissing, appliesNow, availability, availabilityTotals, blockers, canClose, canExecute, cycleErrCode, cycleError, executionMissing, isMissingObject, nextStage, noTacit, openCommitments, signedDelta, supplementaryEnd, supplementaryOver, type Check } from "./budgetCycle";

const line = { id: "L1", kind: "expense" as const, original_amount: 1000, current_amount: 1000, currency: "LBP" };

describe("lifecycle", () => {
  it("steps forward one stage and never reaches closed through the stepper", () => {
    expect(nextStage("preparation")).toBe("draft");
    expect(nextStage("validated")).toBe("executing");
    expect(nextStage("executing")).toBeNull();
    expect(nextStage("closed")).toBeNull();
    expect(nextStage("bogus")).toBeNull();
  });
  it("cannot execute without adoption + validation evidence and says what is missing", () => {
    expect(executionMissing(null)[0]).toContain("لم يُفتح");
    const m = executionMissing({ status: "adopted" });
    expect(m.length).toBe(4);
    expect(canExecute({ status: "validated", adoption_decision_id: "d", adopted_on: "2026-01-10", validated_on: "2026-01-20", validation_authority: "المحافظ" }, { legal_status: "effective", category: "budget" })).toBe(true);
  });
  it("rejects a decision that is not a budget decision or was annulled", () => {
    const c = { status: "validated", adoption_decision_id: "d", adopted_on: "2026-01-10", validated_on: "2026-01-20", validation_authority: "x" };
    expect(executionMissing(c, { legal_status: "annulled", category: "budget" })).toHaveLength(1);
    expect(executionMissing(c, { legal_status: "adopted", category: "general" })).toHaveLength(1);
    expect(executionMissing({ ...c, validated_on: "2026-01-05" }).some((x) => x.includes("سابق"))).toBe(true);
  });
  it("budget and transfer decisions are never tacit", () => { expect(noTacit("budget")).toBe(true); expect(noTacit("transfer")).toBe(true); expect(noTacit("general")).toBe(false); });
});

describe("amendment types", () => {
  it("requires funding source for opening/additional/supplementary/exceptional but not for transfer", () => {
    for (const t of ["opening", "additional", "supplementary", "exceptional"] as const)
      expect(amendMissing(t, { reason: "x", decision: "d", effectiveOn: "2026-02-01" })).toContain("مصدر التمويل");
    expect(amendMissing("transfer", { reason: "x", decision: "d", effectiveOn: "2026-02-01" })).toEqual([]);
  });
  it("reason is always required; authority only when it takes effect", () => {
    expect(amendMissing("lapsed", {})).toEqual(["السبب", "تاريخ النفاذ"]);
    expect(amendMissing("additional", { reason: "r", decision: "d", funding: "f", effectiveOn: "2026-02-01" })).toEqual([]);          // pending: authority not yet needed
    expect(amendMissing("additional", { reason: "r", decision: "d", funding: "f", effectiveOn: "2026-02-01", validatedOn: "2026-02-02" })).toEqual(["جهة التصديق/المرجع"]);
  });
  it("applies at once only when no validation is required or an explicit date exists (no tacit)", () => {
    expect(appliesNow("additional", null)).toBe(false);
    expect(appliesNow("additional", "2026-02-02")).toBe(true);
    expect(appliesNow("suspended", null)).toBe(true);
  });
  it("derives the sign from the type", () => {
    expect(signedDelta("lapsed", 50)).toBe(-50);
    expect(signedDelta("opening", 50)).toBe(50);
    expect(signedDelta("opening", -50)).toBeNull();
    expect(signedDelta("amended", -50)).toBe(-50);
    expect(signedDelta("transfer", 50)).toBeNull();
    expect(signedDelta("amended", 0)).toBeNull();
  });
});

describe("availability engine", () => {
  it("never double-counts a payment made under a commitment", () => {
    const a = availability(line, [{ id: "C1", line_id: "L1", amount: 300 }], [{ line_id: "L1", commitment_id: "C1", amount: 300 }], []);
    expect(a.reserved).toBe(300); expect(a.available).toBe(700); expect(a.paidTotal).toBe(300); expect(a.commitmentsOutstanding).toBe(0);
  });
  it("counts a payment without commitment as reserved", () => {
    const a = availability(line, [{ id: "C1", line_id: "L1", amount: 300 }], [{ line_id: "L1", commitment_id: null, amount: 100 }], []);
    expect(a.reserved).toBe(400); expect(a.available).toBe(600);
  });
  it("excludes pending amendments from availability but reports them", () => {
    const a = availability({ ...line, current_amount: 1000 }, [], [], [{ line_id: "L1", delta: 500, applied: false, amendment_type: "additional" }]);
    expect(a.available).toBe(1000); expect(a.pendingAmendments).toBe(500); expect(a.pendingCount).toBe(1);
  });
  it("subtracts active suspensions only, and flags credit drift", () => {
    const am = [{ line_id: "L1", delta: 200, applied: true, amendment_type: "suspended", suspension_released_on: null }, { line_id: "L1", delta: 100, applied: true, amendment_type: "suspended", suspension_released_on: "2026-05-01" }];
    const a = availability(line, [], [], am);
    expect(a.suspended).toBe(200); expect(a.available).toBe(800); expect(a.drift).toBe(0);
    const d = availability({ ...line, current_amount: 1100 }, [], [], [{ line_id: "L1", delta: 50, applied: true, amendment_type: "additional" }]);
    expect(d.drift).toBe(50);
  });
  it("totals per currency, never mixed; revenue lines have no availability", () => {
    const rows = [availability(line, [], [], []), availability({ ...line, id: "L2", currency: "USD", current_amount: 10, original_amount: 10 }, [], [], []), availability({ ...line, id: "R", kind: "revenue" }, [], [], [])];
    expect(rows[2].available).toBeNull();
    const t = availabilityTotals(rows);
    expect(t.map((x) => x.currency)).toEqual(["LBP", "USD"]); expect(t[0].credit).toBe(1000); expect(t[1].credit).toBe(10);
  });
});

describe("closing", () => {
  it("supplementary period is never defaulted", () => {
    expect(supplementaryEnd("2026-12-31", null)).toBeNull();
    expect(supplementaryEnd("2026-12-31", undefined)).toBeNull();
    expect(supplementaryEnd("2026-12-31", 30)).toBe("2027-01-30");
    expect(supplementaryEnd("2026-12-31", 0)).toBe("2026-12-31");
    expect(supplementaryEnd("bad", 5)).toBeNull();
    expect(supplementaryOver(null, "2027-01-01")).toBeNull();
    expect(supplementaryOver("2027-01-30", "2027-01-30")).toBe(false);
    expect(supplementaryOver("2027-01-30", "2027-01-31")).toBe(true);
  });
  it("lists only open commitments and marks the resolved ones", () => {
    const cs = [{ id: "C1", line_id: "L1", amount: 100 }, { id: "C2", line_id: "L1", amount: 50 }];
    const es = [{ line_id: "L1", commitment_id: "C2", amount: 50 }, { line_id: "L1", commitment_id: "C1", amount: 40 }];
    const o = openCommitments(cs, es, new Set(["C1"]));
    expect(o).toHaveLength(1); expect(o[0]).toMatchObject({ id: "C1", remaining: 60, resolved: true });
  });
  it("ignores reversal rows and subtracts reversals from the commitment", () => {
    const cs = [{ id: "C1", line_id: "L1", amount: 100 }, { id: "R1", line_id: "L1", amount: -100 }, { id: "C2", line_id: "L1", amount: 80 }, { id: "R2", line_id: "L1", amount: -30 }];
    const o = openCommitments(cs, [], new Set(), new Map([["C1", -100], ["C2", -30]]));
    expect(o).toHaveLength(1); expect(o[0]).toMatchObject({ id: "C2", amount: 50, remaining: 50 });
  });
  it("close is allowed only with checks present and no blockers", () => {
    const ok: Check[] = [{ code: "a", level: "ok", count: 0 }, { code: "b", level: "warn", count: 2 }];
    expect(canClose(ok)).toBe(true);
    expect(canClose([])).toBe(false);
    expect(canClose([...ok, { code: "pending_amendments", level: "block", count: 1 }])).toBe(false);
    expect(blockers([...ok, { code: "x", level: "block", count: 1 }])).toHaveLength(1);
  });
});

describe("errors", () => {
  it("maps database codes to Arabic, longest key first", () => {
    expect(cycleErrCode("decision_not_budget")).toBe("decision_not_budget");
    expect(cycleError("closing_blocked: pending_amendments")).toContain("الإقفال ممنوع");
    expect(cycleError("decision_not_budget")).toContain("موازنة");
    expect(cycleError("weird")).toContain("تعذّر");
  });
  it("recognises missing tables/functions", () => {
    expect(isMissingObject({ code: "42P01" })).toBe(true);
    expect(isMissingObject({ message: "Could not find the function public.x in the schema cache" })).toBe(true);
    expect(isMissingObject({ code: "22023", message: "bad_input" })).toBe(false);
    expect(isMissingObject(null)).toBe(false);
  });
});

describe("availability with direct payment orders", () => {
  it("unpaid direct orders reserve credit and never go negative", () => {
    expect(availability(line, [], [], [], 150).available).toBe(850);
    expect(availability(line, [], [], [], -5).available).toBe(1000);
  });
});
