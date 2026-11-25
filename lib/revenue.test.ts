import { describe, expect, it } from "vitest";
import { arrearsByCurrency, collectGuard, duplicateReceiptNos, formatReceiptNo, isMissing, netCollected, orderState, pickRule, reconcileDay, referenceAmount, revenueError, ruleCoversYear, type OrderRow, type ReceiptRow, type Rule } from "./revenue";

const R = (o: Partial<Rule> & { id: string }): Rule => ({ fee_type: "F", instrument: "X", rate: 10, rate_unit: "per_unit", rate_currency: "LBP", effective_from: "2020-01-01", effective_to: null, review_status: "verified", ...o });
const O = (o: Partial<OrderRow> = {}): OrderRow => ({ id: "o1", order_no: "2026/00001", amount: 1000, currency: "LBP", due_on: "2026-06-01", status: "issued", ...o });
const Rc = (o: Partial<ReceiptRow> = {}): ReceiptRow => ({ id: "r1", order_id: "o1", amount: 400, currency: "LBP", method: "cash", collected_on: "2026-11-25", status: "issued", series_id: "s", fiscal_year: 2026, receipt_no: "2026/000001", ...o });

describe("rule selection by assessment-year period", () => {
  it("never applies today's rate to an earlier year", () => {
    const rules = [R({ id: "old", rate: 5, effective_from: "2020-01-01", effective_to: "2023-12-31" }), R({ id: "new", rate: 9, effective_from: "2024-01-01" })];
    expect(pickRule(rules, "F", 2022).rule?.id).toBe("old");
    expect(pickRule(rules, "F", 2026).rule?.id).toBe("new");
    expect(pickRule(rules, "F", 2019)).toEqual({ rule: null, reason: "none" });
  });
  it("returns nothing when only unverified rules exist or periods overlap within the year", () => {
    expect(pickRule([R({ id: "a", review_status: "pending_review" })], "F", 2025).reason).toBe("unverified_only");
    expect(pickRule([R({ id: "a", effective_to: "2025-06-30" }), R({ id: "b", effective_from: "2025-07-01" })], "F", 2025).reason).toBe("ambiguous");
    expect(pickRule([], "F", 2025).reason).toBe("none");
  });
  it("matches period boundaries inclusively", () => {
    expect(ruleCoversYear({ effective_from: "2025-12-31", effective_to: null }, 2025)).toBe(true);
    expect(ruleCoversYear({ effective_from: "2026-01-01", effective_to: null }, 2025)).toBe(false);
    expect(ruleCoversYear({ effective_from: "2020-01-01", effective_to: "2024-12-31" }, 2025)).toBe(false);
  });
});

describe("referenceAmount (computes nothing from unloaded data)", () => {
  it("is null without a rule, rate, basis or matching currency", () => {
    expect(referenceAmount(null, 10, "LBP")).toBeNull();
    expect(referenceAmount(R({ id: "a", rate: null }), 10, "LBP")).toBeNull();
    expect(referenceAmount(R({ id: "a" }), null, "LBP")).toBeNull();
    expect(referenceAmount(R({ id: "a" }), 10, "USD")).toBeNull();
  });
  it("computes by rate unit", () => {
    expect(referenceAmount(R({ id: "a", rate_unit: "per_unit", rate: 2.5 }), 10, "LBP")).toBe(25);
    expect(referenceAmount(R({ id: "a", rate_unit: "percent", rate: 5, rate_currency: null }), 200, "USD")).toBe(10);
    expect(referenceAmount(R({ id: "a", rate_unit: "fixed", rate: 7 }), null, "LBP")).toBe(7);
  });
});

describe("order state, partial collection, reversal", () => {
  it("counts only issued receipts and tracks remaining", () => {
    const rs = [Rc(), Rc({ id: "r2", amount: 100, status: "reversed" })];
    expect(netCollected("o1", rs)).toBe(400);
    const s = orderState(O(), rs, "2026-11-25");
    expect(s).toMatchObject({ collected: 400, remaining: 600, partial: true, open: true });
  });
  it("flags overdue days only for open orders", () => {
    expect(orderState(O({ due_on: "2026-11-15" }), [], "2026-11-25").overdueDays).toBe(10);
    expect(orderState(O({ due_on: "2026-11-15" }), [Rc({ amount: 1000 })], "2026-11-25").overdue).toBe(false);
    expect(orderState(O({ due_on: "2026-11-15", status: "cancelled" }), [], "2026-11-25").overdue).toBe(false);
  });
});

describe("collection guards (duplicate prevention)", () => {
  it("rejects over-collection, closed, cancelled and objected orders", () => {
    expect(collectGuard(O(), [Rc()], 601, false)).toBe("exceeds_remaining");
    expect(collectGuard(O(), [Rc()], 600, false)).toBeNull();
    expect(collectGuard(O(), [Rc({ amount: 1000 })], 1, false)).toBe("order_collected");
    expect(collectGuard(O({ status: "cancelled" }), [], 1, false)).toBe("order_cancelled");
    expect(collectGuard(O(), [], 1, true)).toBe("objection_pending");
    expect(collectGuard(O(), [], 0, false)).toBe("bad_amount");
  });
  it("a reversed receipt frees the remaining amount again", () => {
    expect(collectGuard(O(), [Rc({ amount: 1000, status: "reversed" })], 1000, false)).toBeNull();
  });
});

describe("receipt numbering is scoped, not global", () => {
  it("formats per series/year and detects duplicates only inside the same scope", () => {
    expect(formatReceiptNo("A", 2026, 7)).toBe("A-2026/000007");
    expect(formatReceiptNo(null, 2026, 7)).toBe("2026/000007");
    const a = Rc({ id: "1", series_id: "s1", fiscal_year: 2026, receipt_no: "2026/000001" });
    expect(duplicateReceiptNos([a, { ...a, id: "2", series_id: "s2" }, { ...a, id: "3", fiscal_year: 2027 }])).toEqual([]);
    expect(duplicateReceiptNos([a, { ...a, id: "2" }])).toHaveLength(1);
  });
});

describe("arrears", () => {
  it("groups by currency, ages the remainder and never invents a penalty", () => {
    const orders = [O({ id: "a", due_on: "2026-11-10" }), O({ id: "b", due_on: "2026-06-01", amount: 500 }), O({ id: "c", currency: "USD", due_on: "2026-11-24", amount: 50 }), O({ id: "d", due_on: "2027-01-01" })];
    const a = arrearsByCurrency(orders, [Rc({ order_id: "a", amount: 200 })], "2026-11-25");
    const lbp = a.find((x) => x.currency === "LBP")!, usd = a.find((x) => x.currency === "USD")!;
    expect(lbp).toMatchObject({ count: 2, total: 1300, d1_30: 800, d90p: 500, penalty: null });
    expect(usd.total).toBe(50);
  });
});

describe("daily reconciliation", () => {
  const day = "2026-11-25";
  it("matches receipts to the ledger and surfaces legacy entries and post-close drift", () => {
    const receipts = [Rc({ amount: 300 }), Rc({ id: "r2", receipt_no: "2026/000002", amount: 100, method: "transfer" })];
    const ledger = [{ amount: 300, currency: "LBP", method: "cash", created_at: `${day}T08:00:00Z`, receipt_no: "2026/000001" }, { amount: 100, currency: "LBP", method: "transfer", created_at: `${day}T09:00:00Z`, receipt_no: "2026/000002" }, { amount: 50, currency: "LBP", method: "cash", created_at: `${day}T10:00:00Z`, receipt_no: "legacy-9" }];
    const [x] = reconcileDay(day, receipts, ledger, [{ business_date: day, currency: "LBP", cashier: "u", recorded_amount: 500, counted_amount: 500, difference: 0, receipt_count: 2 }]);
    expect(x).toMatchObject({ receiptTotal: 400, cash: 300, transfer: 100, ledgerTotal: 450, ledgerGap: 50, legacyCount: 1, legacyTotal: 50, driftAfterClose: -200 });
  });
  it("returns nothing for an empty day", () => { expect(reconcileDay(day, [], [], [])).toEqual([]); });
});

describe("error mapping", () => {
  it("maps RPC codes to Arabic and detects a missing migration", () => {
    expect(revenueError("idempotency_conflict")).toContain("مفتاح");
    expect(revenueError("zzz")).toContain("تعذّر");
    expect(isMissing({ code: "42P01" })).toBe(true);
    expect(isMissing({ message: "Could not find the function public.revenue_collect in the schema cache" })).toBe(true);
    expect(isMissing(null)).toBe(false);
  });
});
