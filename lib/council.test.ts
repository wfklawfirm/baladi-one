import { describe, it, expect } from "vitest";

import { decisionAlerts, quorumState, summonsOk, earliestSigning, addWorkingDays, NO_TACIT } from "./council";
const base = { decided_on: "2026-01-01", sent_on: null, received_on: null, validated_on: null, validation_level: "none", category: "general", legal_status: "adopted", vote_for: null, vote_against: null };
describe("municipal-act reminders", () => {
  it("flags missing sending after 8 days only", () => {
    expect(decisionAlerts(base, "2026-01-09")).toEqual([]);
    expect(decisionAlerts(base, "2026-01-10")[0]).toMatch(/ثمانية/);
    expect(decisionAlerts({ ...base, sent_on: "2026-01-05" }, "2026-03-01")).toEqual([]);
  });
  it("one-month silence flagged for ordinary categories, never for budget", () => {
    const v = { ...base, sent_on: "2026-01-02", received_on: "2026-01-05", validation_level: "qaimaqam" };
    expect(decisionAlerts(v, "2026-02-04").join()).toMatch(/بانتظار/);
    expect(decisionAlerts(v, "2026-02-05").join()).toMatch(/انقضت مهلة الشهر/);
    expect(decisionAlerts({ ...v, category: "budget" }, "2026-06-01").join()).toMatch(/صريحًا/);
  });
  it("tie votes noted; quorum and summons math", () => {
    expect(decisionAlerts({ ...base, sent_on: "2026-01-02", vote_for: 4, vote_against: 4 }, "2026-01-03").join()).toMatch(/تعادل/);
    expect(quorumState(15, 8, false)).toEqual({ ok: true, need: 8 });
    expect(quorumState(15, 7, false).ok).toBe(false);
    expect(quorumState(15, 5, true)).toEqual({ ok: true, need: 5 });
    expect(quorumState(null, 5, false).ok).toBeNull();
    expect(summonsOk("2026-03-01", "2026-03-04")).toBe(true);
    expect(summonsOk("2026-03-02", "2026-03-04")).toBe(false);
  });
  it("standstill counts 10 working days, skips weekends and loaded holidays", () => {
    expect(addWorkingDays("2026-03-01", 10)).toBe("2026-03-13");
    expect(addWorkingDays("2026-03-01", 10, ["2026-03-04"])).toBe("2026-03-16");
    expect(earliestSigning({ procurement_method: "open_tender", award_notice_on: "2026-03-01" })).toBe("2026-03-14");
    expect(earliestSigning({ procurement_method: "negotiated", award_notice_on: "2026-03-01" })).toBeNull();
    expect(earliestSigning({ procurement_method: "open_tender", award_notice_on: null })).toBeNull();
  });
  it("tacit approval: excluded categories, audit bureau base date, notification required", () => {
    expect(NO_TACIT).toEqual(["budget", "planning", "transfer", "loan"]);
    const v = { ...base, sent_on: "2026-01-02", received_on: "2026-01-05", validation_level: "qaimaqam" };
    expect(decisionAlerts({ ...v, category: "transfer" }, "2026-06-01").join()).toMatch(/صريحًا/);
    expect(decisionAlerts({ ...v, category: "accounts" }, "2026-02-06").join()).toMatch(/لا يُعتدّ/);
    expect(decisionAlerts({ ...v, tacit_notified_on: "2026-02-06" }, "2026-02-06").join()).toMatch(/يجوز اعتبار/);
    expect(decisionAlerts({ ...v, audit_bureau_required: true }, "2026-06-01").join()).toMatch(/ديوان المحاسبة/);
  });
});
