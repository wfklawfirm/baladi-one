import { describe, it, expect } from "vitest";
import { checkQuorum, checkMajority, checkInvitationNotice, unverifiedRules, type Rule } from "./rulesEngine";
const mk = (id: string, value: number | null, status: Rule["status"]): Rule => ({ id, label: id, source_hint: "test", kind: "x", value, status });
describe("rules engine never invents numbers", () => {
  it("shipped rules are all unverified → needs_verification", () => {
    expect(checkQuorum(9, 5).outcome).toBe("needs_verification");
    expect(checkMajority(9, 5).outcome).toBe("needs_verification");
    expect(checkInvitationNotice(3).outcome).toBe("needs_verification");
    expect(unverifiedRules().length).toBe(3);
  });
  it("a pending rule with a value is still not used", () => {
    expect(checkQuorum(9, 9, [mk("council_quorum", 0.5, "pending_review")]).outcome).toBe("needs_verification");
  });
  it("verified test rules compute deterministically", () => {
    expect(checkQuorum(9, 5, [mk("council_quorum", 0.5, "verified")]).outcome).toBe("met");
    expect(checkQuorum(9, 4, [mk("council_quorum", 0.5, "verified")]).outcome).toBe("not_met");
    expect(checkMajority(7, 4, [mk("council_majority", 0.5, "verified")]).outcome).toBe("met");
    expect(checkInvitationNotice(2, [mk("invitation_notice_days", 3, "verified")]).outcome).toBe("not_met");
  });
});
