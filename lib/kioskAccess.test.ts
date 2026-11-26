import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: async () => ({}) }));
import { safeKioskNext } from "./kioskAccess";

describe("safeKioskNext", () => {
  it("keeps kiosk paths and the force flag", () => {
    expect(safeKioskNext("/kiosk/khreibet-al-jundi")).toBe("/kiosk/khreibet-al-jundi");
    expect(safeKioskNext("/kiosk/khreibet-al-jundi?force=1")).toBe("/kiosk/khreibet-al-jundi?force=1");
  });
  it("rejects anything else (open-redirect safe)", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/staff", "/kiosk/../staff", "javascript:alert(1)", undefined, 5]) expect(safeKioskNext(bad)).toBe("/");
  });
});
