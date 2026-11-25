import { describe, it, expect } from "vitest";
import { tally, checkVotes, checkResult, defaultResult, errCode, MAJORITY_LABEL } from "./votes";

const rows = (...v: string[]) => v.map((vote, i) => ({ member: `m${i}`, vote }));
describe("votes", () => {
  it("tallies and derives present", () => {
    const t = tally(rows("for", "for", "against", "abstain", "absent", "recused"));
    expect(t).toMatchObject({ for: 2, against: 1, abstain: 1, absent: 1, recused: 1, rows: 6, present: 5 });
  });
  it("requires attendance, unique names, recusal reason", () => {
    expect(checkVotes({ total: null, present: null }, rows("for"))).toContain("attendance_required");
    expect(checkVotes({ total: 9, present: 9 }, [{ member: "أحمد", vote: "for" }, { member: " أحمد ", vote: "against" }])).toContain("duplicate_member");
    expect(checkVotes({ total: 9, present: 9 }, [{ member: "a", vote: "recused" }])).toContain("recusal_reason_required");
    expect(checkVotes({ total: 9, present: 9 }, [{ member: "a", vote: "recused", reason: "قرابة" }])).toEqual([]);
  });
  it("present never exceeds session attendance or total", () => {
    expect(checkVotes({ total: 5, present: 3 }, rows("for", "for", "for", "against"))).toContain("present_exceeds_session");
    expect(checkVotes({ total: 3, present: 3 }, rows("for", "for", "for", "absent"))).toContain("too_many_members");
    expect(checkVotes({ total: 5, present: 3 }, rows("for", "for", "against", "absent", "absent"))).toEqual([]);
  });
  it("result must not contradict counts", () => {
    expect(checkResult("carried", { for: 3, against: 2 }, false)).toEqual([]);
    expect(checkResult("carried", { for: 2, against: 3 }, false)).toContain("result_contradicts_counts");
    expect(checkResult("carried", { for: 2, against: 2 }, false)).toContain("result_contradicts_counts");
    expect(checkResult("carried", { for: 2, against: 2 }, true)).toEqual([]);
    expect(checkResult("tie", { for: 2, against: 2 }, false)).toEqual([]);
    expect(checkResult("tie", { for: 2, against: 1 }, false)).toContain("result_contradicts_counts");
    expect(checkResult("unverified", { for: 0, against: 0 }, true)).toContain("tie_break_needs_tie");
    expect(defaultResult({ for: 2, against: 2 }, false)).toBe("tie");
    expect(defaultResult({ for: 3, against: 2 }, false)).toBe("unverified");
  });
  it("majority is flagged for verification unless verified; never defaulted", () => {
    expect(MAJORITY_LABEL(null, "needs_verification")).toMatch(/يلزم تحقق/);
    expect(MAJORITY_LABEL("simple", "needs_verification")).toMatch(/يلزم تحقق/);
    expect(MAJORITY_LABEL("simple", "verified")).not.toMatch(/يلزم تحقق/);
  });
  it("maps RPC errors", () => {
    expect(errCode("attendance_required")).toBe("attendance_required");
    expect(errCode('duplicate key value violates unique constraint "council_vote_member_uq"')).toBe("duplicate_member");
    expect(errCode("Could not find the function public.council_record_votes")).toBe("unavailable");
  });
});
