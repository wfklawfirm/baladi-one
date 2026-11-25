import { describe, expect, it } from "vitest";
import { addDays, canPublish, corrNumber, deadlineState, errCode, formatValue, isMissingObject, loadList, refSchemeBad, safeRef, suggestedDue } from "./admin";

describe("admin helpers", () => {
  it("numbers correspondence per direction/year", () => {
    expect(corrNumber("in", 12, 2026)).toBe("وارد 12/2026");
    expect(corrNumber("out", 3, 2026)).toBe("صادر 3/2026");
  });
  it("deadline state", () => {
    expect(deadlineState(null, "2026-01-10")).toBeNull();
    expect(deadlineState("2026-01-01", "2026-01-10", true)).toBeNull();
    expect(deadlineState("2026-01-09", "2026-01-10")).toBe("overdue");
    expect(deadlineState("2026-01-10", "2026-01-10")).toBe("soon");
    expect(deadlineState("2026-01-17", "2026-01-10")).toBe("soon");
    expect(deadlineState("2026-01-18", "2026-01-10")).toBe("ok");
  });
  it("never shows zero for unknown value", () => {
    expect(formatValue(null, "USD")).toBe("غير مُدخل");
    expect(formatValue("", "USD")).toBe("غير مُدخل");
    expect(formatValue(1500, "USD")).toBe("1,500 $");
    expect(formatValue(0, "USD")).toBe("0 $");
  });
  it("adds days and only pre-fills a due date from a configured default", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(suggestedDue("2026-01-01", null)).toBeNull();
    expect(suggestedDue("2026-01-01", 0)).toBeNull();
    expect(suggestedDue("2026-01-01", 15)).toBe("2026-01-16");
  });
  it("publication requires redaction when needed", () => {
    expect(canPublish({ redaction_required: false, redaction_done: false })).toBe(true);
    expect(canPublish({ redaction_required: true, redaction_done: false })).toBe(false);
    expect(canPublish({ redaction_required: false, redaction_done: false, contains_personal_data: true })).toBe(false);
    expect(canPublish({ redaction_required: true, redaction_done: true, contains_personal_data: true })).toBe(true);
  });
  it("links only http(s) references", () => {
    expect(safeRef("https://example.org/a").href).toBe("https://example.org/a");
    expect(safeRef("javascript:alert(1)").href).toBeNull();
    expect(safeRef("data:text/html,x").href).toBeNull();
    expect(safeRef("ملف رقم 12 / أمانة السجل").href).toBeNull();
    expect(refSchemeBad("javascript:alert(1)")).toBe(true);
    expect(refSchemeBad("https://a.b")).toBe(false);
    expect(refSchemeBad("ملف 5")).toBe(false);
  });
  it("detects missing objects and maps error codes", () => {
    expect(isMissingObject({ code: "PGRST205" })).toBe(true);
    expect(isMissingObject({ message: 'relation "public.asset" does not exist' })).toBe(true);
    expect(isMissingObject({ code: "42501", message: "forbidden" })).toBe(false);
    expect(isMissingObject(null)).toBe(false);
    expect(errCode("evidence_required")).toBe("evidence_required");
    expect(errCode("boom")).toBe("1");
  });
  it("loadList tolerates a missing table and thrown errors", async () => {
    const mk = (res: any) => ({ from: () => ({ select: () => ({ limit: () => ({ order: () => Promise.resolve(res), then: (f: any) => f(res) }) }) }) });
    expect((await loadList(mk({ data: null, error: { code: "PGRST205" } }), "asset", "*", { col: "id" })).missing).toBe(true);
    expect(await loadList(mk({ data: [{ id: 1 }], error: null }), "asset", "*", { col: "id" })).toEqual({ rows: [{ id: 1 }], missing: false });
    expect((await loadList({ from: () => { throw new Error("x"); } }, "asset", "*")).missing).toBe(true);
  });
});
