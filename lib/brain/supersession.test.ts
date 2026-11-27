import { describe, it, expect } from "vitest";
import { supersessionNote } from "./supersession";
const src = [
  { instrument_type: "law", instrument_number: "244", instrument_date: "2021-07-19", verification_status: "pending_review" },
  { instrument_type: "memo", instrument_number: "8/2026", instrument_date: "2026-09-24", verification_status: "pending_review" },
  { instrument_type: "law", instrument_number: "old", instrument_date: "2030-01-01", verification_status: "superseded" },
];
describe("supersession note", () => {
  it("only for procurement questions", () => {
    expect(supersessionNote("ما صلاحيات رئيس البلدية في الرخص؟", src)).toBeUndefined();
    expect(supersessionNote("هل يحق لرئيس البلدية أن يكون عضوا في لجنة الشراء؟", src)).toBeDefined();
  });
  it("lists newest first, excludes superseded, never states approval", () => {
    const n = supersessionNote("لجنة التلزيم", src)!;
    expect(n.indexOf("8/2026")).toBeLessThan(n.indexOf("قانون 244"));
    expect(n).not.toContain("old");
    expect(n).not.toContain("Legally Verified");
  });
  it("tolerates a missing register", () => { expect(supersessionNote("مناقصة", null)).toContain("غير متاح"); });
});
