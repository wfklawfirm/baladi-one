import { describe, expect, it } from "vitest";
import { arrears, budgetTotals, collectionRate, errCodeOf, financeError, lineStats, monthlyFlow, parseAmount, pct, totalsByCurrency, type Line } from "./finance";
import { parsePeriod } from "./ops";

const L = (id: string, kind: "revenue" | "expense", cur: "LBP" | "USD", amt: number): Line => ({ id, code: id, title_ar: id, kind, sector: null, original_amount: amt, current_amount: amt, currency: cur });

describe("lineStats", () => {
  it("separates execution (paid) from commitment ratio and computes availability", () => {
    const l = L("a", "expense", "LBP", 1000);
    const s = lineStats(l, [{ line_id: "a", amount: 400 }], [{ line_id: "a", commitment_id: "c1", amount: 100, paid_on: "2026-11-01" }, { line_id: "a", commitment_id: null, amount: 100, paid_on: "2026-11-02" }]);
    expect(s.paid).toBe(200);
    expect(s.execution).toBe(20);
    expect(s.committed).toBe(500); // 400 commitments + 100 direct payment; the 100 paid under the commitment is not counted twice
    expect(s.commitRatio).toBe(50);
    expect(s.available).toBe(500);
  });
  it("returns null rates (not 0) when the appropriation is 0, and no rates for revenue lines", () => {
    expect(lineStats(L("z", "expense", "LBP", 0), [], []).execution).toBeNull();
    expect(lineStats(L("z", "expense", "LBP", 0), [], []).commitRatio).toBeNull();
    expect(lineStats(L("r", "revenue", "LBP", 100), [], []).execution).toBeNull();
  });
  it("avoids float drift", () => {
    const s = lineStats(L("a", "expense", "USD", 1), [], [{ line_id: "a", commitment_id: null, amount: 0.1, paid_on: "x" }, { line_id: "a", commitment_id: null, amount: 0.2, paid_on: "x" }]);
    expect(s.paid).toBe(0.3);
  });
});

describe("budgetTotals", () => {
  it("keeps currencies apart and omits absent ones", () => {
    const t = budgetTotals([L("a", "expense", "LBP", 1000), L("b", "expense", "USD", 100), L("c", "revenue", "LBP", 5)], [], [{ line_id: "b", commitment_id: null, amount: 25, paid_on: "x" }]);
    expect(t.map((x) => x.currency)).toEqual(["LBP", "USD"]);
    expect(t[0].execution).toBe(0);
    expect(t[1].execution).toBe(25);
    expect(budgetTotals([], [], [])).toEqual([]);
  });
});

describe("collectionRate", () => {
  const rv = (id: string, amount: number, due: string, currency: "LBP" | "USD" = "LBP", status = "open") => ({ id, fee_type: "x", amount, currency, due_on: due, status });
  it("is collected linked to due receivables / due receivables", () => {
    const r = collectionRate([rv("1", 100, "2026-11-01"), rv("2", 100, "2026-11-10"), rv("3", 100, "2026-12-30")], [{ receivable_id: "1", amount: 100, currency: "LBP", created_at: "" }, { receivable_id: null, amount: 999, currency: "LBP", created_at: "" }], "2026-11-25");
    expect(r).toEqual([{ currency: "LBP", count: 2, due: 200, collected: 100, rate: 50 }]);
  });
  it("is null (not 0%) when nothing is due, ignores cancelled and wrong-currency entries, caps over-collection", () => {
    expect(collectionRate([rv("1", 100, "2026-12-30")], [], "2026-11-25")).toEqual([]);
    expect(collectionRate([rv("1", 100, "2026-11-01", "LBP", "cancelled")], [], "2026-11-25")).toEqual([]);
    const r = collectionRate([rv("1", 100, "2026-11-01")], [{ receivable_id: "1", amount: 50, currency: "USD", created_at: "" }, { receivable_id: "1", amount: 500, currency: "LBP", created_at: "" }], "2026-11-25");
    expect(r[0].collected).toBe(100);
  });
  it("reports 0 only when something is due and nothing collected", () => {
    expect(collectionRate([rv("1", 100, "2026-11-01")], [], "2026-11-25")[0].rate).toBe(0);
  });
  it("filters by due-date range", () => {
    const r = collectionRate([rv("1", 100, "2026-10-01"), rv("2", 50, "2026-11-05")], [], "2026-11-25", { from: "2026-11-01", to: "2026-11-30" });
    expect(r[0].due).toBe(50);
  });
});

describe("arrears", () => {
  it("counts only open, overdue, with remaining balance, bucketed by age and per currency", () => {
    const rv = (id: string, amount: number, due: string, currency: "LBP" | "USD" = "LBP", status = "open") => ({ id, fee_type: "x", amount, currency, due_on: due, status });
    const a = arrears([rv("1", 100, "2026-11-15"), rv("2", 100, "2026-06-01"), rv("3", 100, "2026-11-25"), rv("4", 100, "2026-11-01", "USD"), rv("5", 100, "2026-11-01", "LBP", "settled"), rv("6", 100, "2026-11-01")],
      [{ receivable_id: "6", amount: 100, currency: "LBP", created_at: "" }, { receivable_id: "1", amount: 40, currency: "LBP", created_at: "" }], "2026-11-25");
    const lbp = a.find((x) => x.currency === "LBP")!;
    expect(lbp.count).toBe(2);
    expect(lbp.total).toBe(160);
    expect(lbp.buckets.map((b) => b.count)).toEqual([1, 0, 1]);
    expect(a.find((x) => x.currency === "USD")!.total).toBe(100);
    expect(arrears([], [], "2026-11-25")).toEqual([]);
  });
});

describe("misc", () => {
  it("pct guards division by zero", () => { expect(pct(1, 0)).toBeNull(); expect(pct(1, 3)).toBe(33.3); });
  it("totalsByCurrency never mixes", () => { expect(totalsByCurrency([{ amount: 1, currency: "LBP" }, { amount: "2.5", currency: "USD" }, { amount: 3, currency: "LBP" }])).toEqual([{ currency: "LBP", total: 4, count: 2 }, { currency: "USD", total: 2.5, count: 1 }]); });
  it("parseAmount", () => {
    expect(parseAmount("1,500.50")).toBe(1500.5);
    expect(parseAmount("١٢٣")).toBe(123);
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("-5", { signed: true })).toBe(-5);
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
  it("maps errors", () => {
    expect(errCodeOf("exceeds_available")).toBe("exceeds_available");
    expect(financeError("exceeds_commitment")).toContain("الالتزام");
    expect(financeError("weird")).toContain("تعذّر");
  });
  it("monthlyFlow separates currencies and returns [] without data", () => {
    const rg = parsePeriod("month", undefined, undefined, new Date("2026-11-25T10:00:00Z"));
    const lines = [L("a", "expense", "LBP", 100)];
    expect(monthlyFlow([], [], lines, rg)).toEqual([]);
    const f = monthlyFlow([{ receivable_id: null, amount: 10, currency: "USD", created_at: "2026-11-10T10:00:00Z" }], [{ line_id: "a", commitment_id: null, amount: 7, paid_on: "2026-11-11" }], lines, rg);
    expect(f.map((x) => [x.currency, x.revenue, x.expense])).toEqual([["LBP", 0, 7], ["USD", 10, 0]]);
  });
});
