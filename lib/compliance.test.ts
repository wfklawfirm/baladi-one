import { describe, it, expect } from "vitest";
import { computeCompliance, loadCompliance, type ComplianceInput } from "./compliance";

const T = "2026-03-01";
const dec = (o: Record<string, any> = {}) => ({ id: "d1", decision_no: "1", year: 2026, title: "t", decided_on: "2026-02-01", sent_on: null, received_on: null, validated_on: null, validation_level: "none", legal_status: "adopted", ...o } as any);
const ses = (o: any = {}) => ({ id: "s1", session_no: null, title: "جلسة", held_on: "2026-02-10", status: "held", members_total: 9, members_present: 7, summoned_on: "2026-02-01", is_second_meeting: false, ...o });
const con = (o: any = {}) => ({ id: "c1", contractor: "x", subject: "y", status: "draft", procurement_method: "open_tender", published_on: "2026-01-01", award_notice_on: null, ppa_notice_on: null, ...o });
const none: ComplianceInput = { decisions: null, sessions: null, contracts: null, rules: null };
const get = (c: ReturnType<typeof computeCompliance>, id: string) => c.find((x) => x.id === id)!;

describe("compliance", () => {
  it("unknown sources are null with a reason, never zero", () => {
    for (const c of computeCompliance(none, T)) { expect(c.count).toBeNull(); expect(c.reason).toBeTruthy(); }
  });
  it("sent date: exactly 8 days is fine, 9 is late; sent and undated are not counted", () => {
    const c = get(computeCompliance({ ...none, decisions: [dec({ id: "a", decided_on: "2026-02-21" }), dec({ id: "b", decided_on: "2026-02-20" }), dec({ id: "c", sent_on: "2026-02-02" }), dec({ id: "d", decided_on: null })] }, T), "decisions_dates");
    expect(c.items.map((i) => i.id)).toEqual(["b"]);
    expect(c.count).toBe(1);
    expect(c.lines.find((l) => l.label.includes("غير قابلة"))?.count).toBe(1);
    expect(c.items[0].href).toBe("/staff/council/decisions/b");
  });
  it("registration date missing counted only for validated-type sent decisions", () => {
    const c = get(computeCompliance({ ...none, decisions: [dec({ id: "a", sent_on: "2026-02-02", validation_level: "qaimaqam" }), dec({ id: "b", sent_on: "2026-02-02" })] }, T), "decisions_dates");
    expect(c.count).toBe(1);
  });
  it("awaiting validation excludes draft, annulled, effective and validated", () => {
    const rows = [dec({ id: "a", validation_level: "mohafez" }), dec({ id: "b", validation_level: "mohafez", legal_status: "draft" }), dec({ id: "c", validation_level: "mohafez", validated_on: "2026-02-10" }), dec({ id: "d", validation_level: "mohafez", legal_status: "effective" }), dec({ id: "e" })];
    expect(get(computeCompliance({ ...none, decisions: rows }, T), "decisions_validation").count).toBe(1);
  });
  it("sessions: short summons, quorum, missing attendance; cancelled and future ignored", () => {
    const rows = [ses({ id: "ok" }), ses({ id: "short", summoned_on: "2026-02-09" }), ses({ id: "q", members_present: 4 }), ses({ id: "att", members_total: null }), ses({ id: "fut", held_on: "2026-04-01", members_total: null, members_present: null }), ses({ id: "x", status: "cancelled", members_present: 1 })];
    const c = get(computeCompliance({ ...none, sessions: rows }, T), "sessions");
    expect(c.items.map((i) => i.id).sort()).toEqual(["att", "q", "short"]);
    expect(c.count).toBe(3);
  });
  it("second meeting uses one third", () => {
    expect(get(computeCompliance({ ...none, sessions: [ses({ members_present: 3, is_second_meeting: true })] }, T), "sessions").count).toBe(0);
  });
  it("contracts: drafts missing the date their method needs", () => {
    const rows = [con({ id: "ok" }), con({ id: "nopub", published_on: null }), con({ id: "neg", procurement_method: "negotiated" }), con({ id: "negok", procurement_method: "negotiated", ppa_notice_on: "2026-01-01" }), con({ id: "inv", procurement_method: "invoice", published_on: null }), con({ id: "unk", procurement_method: null, published_on: null }), con({ id: "signed", status: "signed", published_on: null })];
    const c = get(computeCompliance({ ...none, contracts: rows }, T), "contracts");
    expect(c.items.map((i) => i.id).sort()).toEqual(["neg", "nopub"]);
    expect(c.lines.find((l) => l.label.includes("غير قابلة"))?.count).toBe(1);
  });
  it("rules pending review; empty table is a real zero", () => {
    const c = get(computeCompliance({ ...none, rules: [{ rule_id: "A", topic: "t", review_status: "pending_review" }, { rule_id: "B", topic: "t", review_status: "verified" }] }, T), "rules");
    expect(c.count).toBe(1);
    expect(get(computeCompliance({ ...none, rules: [] }, T), "rules").count).toBe(0);
  });
  it("loader marks a failing source unavailable only", async () => {
    const ok = (data: any[]) => ({ select: () => ({ order: () => ({ limit: async () => ({ data, error: null }) }), limit: async () => ({ data, error: null }) }) });
    const bad = { select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "relation does not exist" } }) }), limit: async () => ({ data: null, error: { message: "x" } }) }) };
    const sb = { from: (t: string) => (t === "legal_rule" ? bad : ok([])) };
    const r = await loadCompliance(sb, T);
    expect(get(r, "rules").count).toBeNull();
    expect(get(r, "decisions_validation").count).toBe(0);
  });
});
