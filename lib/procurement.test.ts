import { describe, expect, it } from "vitest";
import { ART29_NOT_LOADED, NO_THRESHOLD_MSG, SPLIT_MSG, amendmentSummary, buildFile, detectSplitPurchases, isMissingErr, methodMismatch, procErrCode, publicationComplete, recommendMethod, subjectSimilarity, type Threshold } from "./procurement";

const T = (o: Partial<Threshold>): Threshold => ({ method: "quotations", min_value: 0, max_value: 100, currency: "USD", effective_from: "2026-01-01", effective_to: null, source: "test fixture", review_status: "pending_review", ...o });

describe("recommendMethod (table-driven, no hard-coded thresholds)", () => {
  it("answers 'data unavailable' when the table is empty and blocks nothing", () => {
    const r = recommendMethod(1_000_000, "USD", [], "2026-11-25");
    expect(r.status).toBe("no_data"); expect(r.message).toBe(NO_THRESHOLD_MSG); expect(r.methods).toEqual([]);
    expect(methodMismatch("open_tender", r)).toBeNull();
  });
  it("uses only loaded rows in force for the currency and date", () => {
    const ts = [T({ method: "quotations", min_value: 0, max_value: 100 }), T({ method: "open_tender", min_value: 100.01, max_value: null }), T({ method: "invoice", currency: "LBP", max_value: 5 })];
    expect(recommendMethod(50, "USD", ts, "2026-11-25")).toMatchObject({ status: "matched", methods: [{ method: "quotations" }] });
    expect(recommendMethod(500, "USD", ts, "2026-11-25")).toMatchObject({ status: "matched", methods: [{ method: "open_tender" }] });
    expect(recommendMethod(50, "USD", [T({ effective_from: "2027-01-01" })], "2026-11-25").status).toBe("no_data");
    expect(recommendMethod(50, "USD", [T({ effective_to: "2026-06-01" })], "2026-11-25").status).toBe("no_data");
    expect(recommendMethod(50, "USD", [T({ review_status: "rejected" })], "2026-11-25").status).toBe("no_data");
    expect(recommendMethod(5000, "USD", [T({})], "2026-11-25").status).toBe("no_match");
  });
  it("flags boundary overlaps and unreviewed thresholds, and reports mismatch informationally", () => {
    const ts = [T({ method: "quotations", max_value: 100 }), T({ method: "open_tender", min_value: 100, max_value: null, review_status: "verified" })];
    const r = recommendMethod(100, "USD", ts, "2026-11-25");
    expect(r.status === "matched" && r.methods.length).toBe(2);
    expect(r.status === "matched" && r.methods[0].note).toContain("المراجعة");
    expect(methodMismatch("negotiated", r)).toBe(true); expect(methodMismatch("quotations", r)).toBe(false);
  });
});

describe("detectSplitPurchases (heuristic warning)", () => {
  const base = { currency: "USD" };
  it("groups similar subjects inside the window and uses cautious wording", () => {
    const g = detectSplitPurchases([
      { id: "a", subject: "توريد أعمدة إنارة للطريق العام", contractor: "س", value: 40, date: "2026-03-01", ...base },
      { id: "b", subject: "توريد أعمدة الإنارة للطريق العام", contractor: "ص", value: 45, date: "2026-03-20", ...base },
      { id: "c", subject: "صيانة آليات", contractor: "ع", value: 10, date: "2026-03-05", ...base },
    ], { windowDays: 90, minSimilarity: 0.5 });
    expect(g).toHaveLength(1); expect(g[0].ids.sort()).toEqual(["a", "b"]); expect(g[0].total).toBe(85); expect(g[0].message).toBe(SPLIT_MSG);
    expect(g[0].message).not.toMatch(/تحايل|مخالفة/);
  });
  it("respects the window, currency and missing dates", () => {
    const mk = (id: string, date: string | null, currency = "USD") => ({ id, subject: "ترميم مبنى البلدية", contractor: "س", value: 10, currency, date });
    expect(detectSplitPurchases([mk("a", "2026-01-01"), mk("b", "2026-09-01")], { windowDays: 90, minSimilarity: 0.5 })).toEqual([]);
    expect(detectSplitPurchases([mk("a", "2026-01-01"), mk("b", "2026-01-10", "LBP")], { windowDays: 90, minSimilarity: 0.5 })).toEqual([]);
    expect(detectSplitPurchases([mk("a", null), mk("b", "2026-01-10")], { windowDays: 90, minSimilarity: 0.5 })).toEqual([]);
    expect(detectSplitPurchases([mk("a", "2026-01-01"), mk("b", "2026-01-10")], { windowDays: 90, minSimilarity: 0.5 })).toHaveLength(1);
  });
  it("does not link unrelated purchases from the same supplier", () => {
    expect(detectSplitPurchases([{ id: "a", subject: "حفر آبار", contractor: "س", value: 1, currency: "USD", date: "2026-01-01" }, { id: "b", subject: "طباعة لافتات", contractor: "س", value: 1, currency: "USD", date: "2026-01-02" }], { windowDays: 90, minSimilarity: 0.5 })).toEqual([]);
  });
  it("reports band change only when thresholds are loaded", () => {
    const ts = [T({ method: "invoice", max_value: 50 }), T({ method: "quotations", min_value: 50.01, max_value: 1000 })];
    const items = [{ id: "a", subject: "طلاء جدران المدرسة", value: 40, currency: "USD", date: "2026-01-01" }, { id: "b", subject: "طلاء جدران المدرسة", value: 40, currency: "USD", date: "2026-01-05" }];
    expect(detectSplitPurchases(items, { windowDays: 30, minSimilarity: 0.5, thresholds: ts, today: "2026-11-25" })[0].band_changes).toBe(true);
    expect(detectSplitPurchases(items, { windowDays: 30, minSimilarity: 0.5 })[0].band_changes).toBeUndefined();
  });
  it("normalises Arabic spelling in similarity", () => { expect(subjectSimilarity("إنارة الشوارع", "انارة شوارع")).toBe(1); });
});

describe("amendments", () => {
  it("derives original and cumulative change; limit stays unloaded without a value", () => {
    const s = amendmentSummary(1100, [100], null);
    expect(s.original).toBe(1000); expect(s.cumulativePct).toBeCloseTo(10); expect(s.limitLabel).toBe(ART29_NOT_LOADED); expect(s.overLimit).toBeNull();
  });
  it("compares to a loaded limit only as a warning input", () => {
    expect(amendmentSummary(1300, [200, 100], 20).overLimit).toBe(true);
    expect(amendmentSummary(1300, [200, 100], 40).overLimit).toBe(false);
    expect(amendmentSummary(900, [-100], null).cumulativeDelta).toBe(-100);
  });
});

describe("procurement file", () => {
  const input = { contract: { procurement_method: "open_tender", published_on: null, award_notice_on: "2026-05-01", signed_on: "2026-05-20", status: "active", decision_id: null }, manual: [{ stage: "study", evidence_ref: "دراسة.pdf", evidence_on: null }],
    publications: [{ platform_url: "https://x", reference_no: "R1", published_on: "2026-04-01", proof_ref: null, document_ref: "d" }], committees: [], plan: null, today: "2026-11-25" };
  it("marks stages with evidence and leaves the rest missing; internal copy is not publication", () => {
    const f = Object.fromEntries(buildFile(input).map((s) => [s.stage, s]));
    expect(f.method.done).toBe(true); expect(f.study.source).toBe("manual"); expect(f.publication.done).toBe(false); expect(f.need.done).toBe(false); expect(f.acceptance.done).toBe(false); expect(f.contract.done).toBe(true);
    expect(buildFile(input)).toHaveLength(16);
  });
  it("accepts complete publication and positive acceptance", () => {
    const pub = { platform_url: "https://x", reference_no: "R1", published_on: "2026-04-01", proof_ref: "p", document_ref: null };
    expect(publicationComplete(pub)).toBe(true);
    const f = Object.fromEntries(buildFile({ ...input, publications: [pub], committees: [{ kind: "acceptance", result: "accepted", report_text: null, formed_on: null }] }).map((s) => [s.stage, s]));
    expect(f.publication.done).toBe(true); expect(f.acceptance.done).toBe(true);
    const rej = Object.fromEntries(buildFile({ ...input, committees: [{ kind: "acceptance", result: "rejected", report_text: null, formed_on: null }] }).map((s) => [s.stage, s]));
    expect(rej.acceptance.done).toBe(false);
  });
});

describe("error mapping", () => {
  it("detects a missing table/RPC and known codes", () => {
    expect(isMissingErr({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isMissingErr({ code: "42883", message: "function does not exist" })).toBe(true);
    expect(isMissingErr({ code: "22023", message: "reason_required" })).toBe(false);
    expect(procErrCode({ code: "22023", message: "reason_required" })).toBe("reason_required");
    expect(procErrCode({ code: "PGRST202", message: "x" })).toBe("pending");
    expect(procErrCode(null)).toBe("1");
  });
});

describe("recommendMethod ignores non-'method' threshold kinds", () => {
  const base = { method: "quotations", min_value: 0, max_value: 1000, currency: "USD", effective_from: "2026-01-01", effective_to: null, source: "unit-test", review_status: "pending_review" } as Threshold;
  it("a competence / approval / financial-control row never produces a method recommendation", () => {
    for (const k of ["competence", "admin_approval", "financial_control"]) {
      const r = recommendMethod(500, "USD", [{ ...base, threshold_kind: k }], "2026-11-25");
      expect(r.status).toBe("no_data");
    }
  });
  it("method rows (explicit or legacy without the field) still match", () => {
    expect(recommendMethod(500, "USD", [{ ...base, threshold_kind: "method" }], "2026-11-25").status).toBe("matched");
    expect(recommendMethod(500, "USD", [base], "2026-11-25").status).toBe("matched");
  });
});
