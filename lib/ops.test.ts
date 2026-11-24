import { describe, expect, it } from "vitest";
import { computeOps, parsePeriod, buckets } from "./ops";

const now = new Date("2026-11-25T10:00:00Z");
const RG = parsePeriod("month", undefined, undefined, now);
const iso = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const R = (id: string, status: string, age: number, assigned: string | null = null) => ({ id, kind: "report", report_type: null, status, assigned_to: assigned, created_at: iso(age), updated_at: iso(0) });

describe("computeOps", () => {
  it("flags overdue, unassigned and ages open requests", () => {
    const o = computeOps([R("a", "received", 10), R("b", "in_progress", 1, "u1"), R("c", "done", 5)], [], [], [], RG, now);
    expect(o.open).toBe(2);
    expect(o.overdue.map((r) => r.id)).toEqual(["a"]);
    expect(o.unassigned).toBe(1);
    expect(o.openList[0].id).toBe("a");
    expect(o.completionRate).toBe(33);  // 1 done of 3 created this month
  });
  it("scores staff only with enough handled requests and rewards on-time closure", () => {
    const reqs = ["1", "2", "3"].map((id) => R(id, "done", 3));
    const hist = reqs.flatMap((r) => [{ request_id: r.id, from_status: "received", to_status: "done", actor: "u1", created_at: iso(2) }]);
    const people = [{ user_id: "u1", display_name: "علي", role: "staff" }, { user_id: "u2", display_name: "سارة", role: "staff" }];
    const o = computeOps(reqs, hist, people, [], RG, now);
    const ali = o.perf.find((p) => p.user_id === "u1")!;
    expect(ali.handled).toBe(3); expect(ali.closed).toBe(3); expect(ali.score).toBe(100);
    expect(o.perf.find((p) => p.user_id === "u2")!.score).toBeNull();
  });
  it("totals collections per currency for the month", () => {
    const o = computeOps([], [], [{ user_id: "u1", display_name: "علي", role: "staff" }], [
      { amount: "1500000", currency: "LBP", method: "cash", collected_by: "u1", created_at: iso(1) },
      { amount: 20, currency: "USD", method: "cash", collected_by: "u1", created_at: iso(0) },
    ], RG, now);
    expect(o.collections[0].month).toBe(1_500_000);
    expect(o.collections[1].month).toBe(20);
    expect(o.collections[1].byCollector[0].name).toBe("علي");
  });
  it("returns null (not 0) for rates with an empty denominator", () => {
    const o = computeOps([], [], [], [], RG, now);
    expect(o.completionRate).toBeNull();
  });
  it("uses monthly buckets for long ranges and a prior period of equal length", () => {
    const y = parsePeriod("year", undefined, undefined, now);
    expect(buckets(y).monthly).toBe(true);
    expect(buckets(RG).monthly).toBe(false);
    expect(parsePeriod("custom", "2026-11-10", "2026-11-01", now).key).toBe("month");  // invalid custom falls back
  });
});
