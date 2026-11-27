import { describe, it, expect } from "vitest";
import { normalizePhone, csvCell } from "./trial";
describe("trial helpers", () => {
  it("normalises phones", () => {
    expect(normalizePhone("+961 71 123 456")).toBe("96171123456");
    expect(normalizePhone("71-123-456")).toBe("71123456");
    expect(normalizePhone("00961 3 123456")).toBe("9613123456");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("1".repeat(16))).toBeNull();
  });
  it("neutralises spreadsheet formulas in CSV", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});
