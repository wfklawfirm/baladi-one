import { describe, expect, it } from "vitest";
import { ageDays, ageLabel, buildInbox } from "./mayorInboxCore";

const now = Date.parse("2026-11-25T12:00:00Z");
describe("mayor inbox", () => {
  it("empty input gives no items (never fabricated)", () => { expect(buildInbox({ newRequests: 0, decisions: [], minutes: [], services: [] }, now)).toEqual({ items: [], total: 0 }); });
  it("orders requests, decisions, minutes, services and routes builder decisions to the editor", () => {
    const r = buildInbox({ newRequests: 3, decisions: [{ id: "a", decision_no: "5", year: 2026, title: "x", created_at: "2026-11-20T00:00:00Z", template_snapshot: {} }, { id: "b", decision_no: "6", year: 2026, title: "y", created_at: "2026-11-24T00:00:00Z", template_snapshot: null }], minutes: [{ id: "m", session_no: "12", title: "جلسة", held_on: null, created_at: "2026-11-25T00:00:00Z" }], services: [{ id: "s", title_ar: "رخصة", created_at: "2026-11-01T00:00:00Z" }] }, now);
    expect(r.items.map((i) => i.kind)).toEqual(["request", "decision", "decision", "minutes", "service"]);
    expect(r.items[1].href).toBe("/staff/decisions/a");
    expect(r.items[2].href).toBe("/staff/council/decisions/b");
    expect(r.items[0].title).toContain("3 طلبات");
  });
  it("age helpers", () => { expect(ageDays("2026-11-20T12:00:00Z", now)).toBe(5); expect(ageLabel(0)).toBe("اليوم"); expect(ageLabel(5)).toBe("منذ 5 أيام"); expect(ageDays("bad", now)).toBeNull(); expect(ageLabel(null)).toBeNull(); });
});
