import { describe, expect, it } from "vitest";
import { OBJECTION_BANNER, isClosedObjection, membersWithoutDeclaration, openObjectionCount } from "./procurementObjections";

describe("procurementObjections", () => {
  it("flags only members with no declaration", () => {
    const ms = [{ has_conflict: null, declaration_on: null }, { has_conflict: false, declaration_on: "2026-01-01" }, { has_conflict: true, declaration_on: null }];
    expect(membersWithoutDeclaration(ms)).toHaveLength(1);
  });
  it("closed statuses and open count", () => {
    expect(isClosedObjection("decided")).toBe(true); expect(isClosedObjection("answered")).toBe(false);
    expect(openObjectionCount([{ status: "open" }, { status: "withdrawn" }, { status: "answered" }])).toBe(2);
  });
  it("banner asserts no legal period", () => { expect(OBJECTION_BANNER).not.toMatch(/\d/); });
});
