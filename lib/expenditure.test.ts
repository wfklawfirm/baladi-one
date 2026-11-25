import { describe, expect, it } from "vitest";
import { commitmentChain, convert, expCodeOf, expError, hasFn, isMissing, liquidationRemaining, nextAction, orderRemaining, parseRate, paymentNet, reconState, reviewLabel, sodBlocked, type CommitRow, type LiqRow, type OrderRow, type PayRow } from "./expenditure";

const C = (id: string, amount: number, extra: Partial<CommitRow> = {}): CommitRow => ({ id, line_id: "L", amount, entry_kind: amount < 0 ? "reversal" : "commitment", reverses_id: null, commitment_no: id, description: "x", committed_on: "2026-11-01", actor: "u1", cycle_entry: true, ...extra });
const Q = (id: string, commitment_id: string, amount: number, extra: Partial<LiqRow> = {}): LiqRow => ({ id, line_id: "L", commitment_id, liquidation_no: id, entry_kind: amount < 0 ? "reversal" : "liquidation", reverses_id: null, amount, invoice_no: "I", invoice_date: "2026-11-02", actor: "u2", created_at: "2026-11-02", ...extra });
const O = (id: string, commitment_id: string | null, liquidation_id: string | null, amount: number, extra: Partial<OrderRow> = {}): OrderRow => ({ id, line_id: "L", commitment_id, liquidation_id, order_no: id, order_date: "2026-11-03", entry_kind: amount < 0 ? "reversal" : "order", reverses_id: null, amount, beneficiary: "b", is_exceptional: false, exception_id: null, actor: "u3", created_at: "2026-11-03", ...extra });
const P = (id: string, commitment_id: string | null, payment_order_id: string | null, amount: number, extra: Partial<PayRow> = {}): PayRow => ({ id, line_id: "L", commitment_id, payment_order_id, entry_kind: amount < 0 ? "reversal" : "payment", reverses_id: null, amount, paid_on: "2026-11-04", beneficiary: "b", payment_no: id, payment_method: "transfer", proof_ref: "r", cycle_entry: true, exception_id: null, actor: "u4", ...extra });

describe("convert (currency handling)", () => {
  it("same currency needs no rate and USD alone is not a problem", () => {
    expect(convert("USD", "USD", 100)).toEqual({ ok: true, accounting: 100, rate: 1, documented: false });
    expect(convert("LBP", "LBP", 1500000.5)).toMatchObject({ ok: true, accounting: 1500000.5 });
  });
  it("different currency requires a documented rate, date and source", () => {
    expect(convert("LBP", "USD", 10)).toEqual({ ok: false, code: "rate_required" });
    expect(convert("LBP", "USD", 10, 89500)).toEqual({ ok: false, code: "rate_date_required" });
    expect(convert("LBP", "USD", 10, 89500, "2026-11-20", " ")).toEqual({ ok: false, code: "rate_source_required" });
    expect(convert("LBP", "USD", 10, 89500, "2026-11-20", "نشرة")).toEqual({ ok: true, accounting: 895000, rate: 89500, documented: true });
  });
  it("rejects bad amounts and currencies, rounds to 2 decimals", () => {
    expect(convert("LBP", "EUR", 1)).toEqual({ ok: false, code: "bad_currency" });
    expect(convert("LBP", "LBP", 0)).toEqual({ ok: false, code: "bad_amount" });
    expect(convert("USD", "LBP", 1, 0.0000111, "2026-11-20", "s")).toEqual({ ok: false, code: "bad_amount" });
    expect(convert("USD", "LBP", 100, 0.333333, "2026-11-20", "s")).toMatchObject({ ok: true, accounting: 33.33 });
  });
  it("parses rates with Arabic digits", () => { expect(parseRate("٨٩٥٠٠٫٥")).toBe(89500.5); expect(parseRate("0")).toBeNull(); expect(parseRate("abc")).toBeNull(); });
});

describe("commitmentChain (partial stages, reversals, balance)", () => {
  const commits = [C("c1", 1000), C("r1", -100, { reverses_id: "c1" })];
  it("computes net, balance and what is left for each stage", () => {
    const liqs = [Q("q1", "c1", 400), Q("q2", "c1", 200)];
    const orders = [O("o1", "c1", "q1", 400)];
    const pays = [P("p1", "c1", "o1", 150)];
    const ch = commitmentChain(commits[0], commits, liqs, orders, pays);
    expect(ch).toMatchObject({ net: 900, liquidated: 600, ordered: 400, paid: 150, toLiquidate: 300, toOrder: 200, toPay: 250, balance: 750, reversible: 300 });
    expect(nextAction(ch)).toContain("التصفية");
  });
  it("reversal rows net out and next action follows the mandatory order", () => {
    const liqs = [Q("q1", "c1", 900), Q("rq", "c1", -900, { reverses_id: "q1" })];
    expect(commitmentChain(commits[0], commits, liqs, [], []).toLiquidate).toBe(900);
    const full = commitmentChain(commits[0], commits, [Q("q1", "c1", 900)], [O("o1", "c1", "q1", 900)], [P("p1", "c1", "o1", 900)]);
    expect(full.balance).toBe(0); expect(nextAction(full)).toContain("مكتملة");
    expect(nextAction(commitmentChain(commits[0], commits, [Q("q1", "c1", 900)], [], []))).toContain("أمر صرف");
    expect(nextAction(commitmentChain(commits[0], commits, [Q("q1", "c1", 900)], [O("o1", "c1", "q1", 900)], []))).toContain("الدفع");
  });
  it("a fully reversed commitment needs no action", () => {
    const cs = [C("c1", 100), C("r", -100, { reverses_id: "c1" })];
    expect(nextAction(commitmentChain(cs[0], cs, [], [], []))).toContain("مُلغى");
  });
});

describe("remaining helpers", () => {
  it("order and liquidation remaining honour reversals and partial payments", () => {
    const orders = [O("o1", "c1", "q1", 500), O("ro", "c1", "q1", -100, { reverses_id: "o1" })];
    expect(orderRemaining(orders[0], orders, [P("p1", "c1", "o1", 150)])).toBe(250);
    const liqs = [Q("q1", "c1", 600)];
    expect(liquidationRemaining(liqs[0], liqs, [O("o1", "c1", "q1", 500)])).toBe(100);
  });
  it("paymentNet subtracts reversals", () => {
    const pays = [P("p1", "c1", "o1", 100), P("rp", "c1", "o1", -40, { reverses_id: "p1" })];
    expect(paymentNet(pays[0], pays)).toBe(60);
  });
});

describe("segregation of duties and roles", () => {
  it("blocks the same user on consecutive stages unless a documented exception exists", () => {
    expect(sodBlocked("u1", "u1", false)).toBe(true);
    expect(sodBlocked("u1", "u1", true)).toBe(false);
    expect(sodBlocked("u1", "u2", false)).toBe(false);
    expect(sodBlocked(null, "u1", false)).toBe(false);
  });
  it("role matrix honours active assignments only", () => {
    const a = [{ user_id: "u1", fn: "pay", active: true }, { user_id: "u1", fn: "order", active: false }];
    expect(hasFn(a, "u1", "pay")).toBe(true); expect(hasFn(a, "u1", "order")).toBe(false); expect(hasFn(a, "u2", "pay")).toBe(false);
  });
});

describe("reconciliation, legal status, errors", () => {
  it("latest reconciliation entry wins", () => {
    const recs = [{ id: "1", payment_id: "p", status: "discrepancy", statement_ref: "a", statement_date: "", statement_amount: 1, statement_currency: "LBP", expected_amount: 2, note: null, created_at: "2026-11-01" }, { id: "2", payment_id: "p", status: "matched", statement_ref: "b", statement_date: "", statement_amount: 2, statement_currency: "LBP", expected_amount: 2, note: null, created_at: "2026-11-02" }];
    expect(reconState("p", recs)).toBe("matched"); expect(reconState("zz", recs)).toBe("none");
  });
  it("unverified legal references are shown as pending review, never confirmed", () => {
    expect(reviewLabel("pending_review")).toEqual({ text: "بانتظار المراجعة القانونية", verified: false });
    expect(reviewLabel(undefined).verified).toBe(false);
    expect(reviewLabel("verified").verified).toBe(true);
  });
  it("maps RPC codes to Arabic messages that include the next action, longest code first", () => {
    expect(expCodeOf("error: same_actor_consecutive")).toBe("same_actor_consecutive");
    expect(expCodeOf("exceeds_commitment")).toBe("exceeds_commitment");
    expect(expError("liquidation_required")).toContain("الإجراء");
    expect(expError("order_required")).toContain("أمر الصرف");
    expect(expError("zzz")).toContain("الإجراء");
    expect(expError(null)).toContain("الإجراء");
  });
  it("detects a missing migration", () => {
    expect(isMissing({ code: "42883" })).toBe(true);
    expect(isMissing({ message: "Could not find the function public.exp_pay in the schema cache" })).toBe(true);
    expect(isMissing({ message: "exceeds_commitment", code: "22023" })).toBe(false);
    expect(isMissing(null)).toBe(false);
  });
});
