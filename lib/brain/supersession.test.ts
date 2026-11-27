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
import { ppaExcerpts, searchTerms } from "./supersession";
describe("ppa excerpts", () => {
  it("extracts content terms and drops stop-words", () => { expect(searchTerms("هل يحق لرئيس البلدية أن يكون عضوا في لجنة الشراء؟")).toEqual(expect.arrayContaining(["لرئيس", "البلدية", "لجنة", "الشراء"])); expect(searchTerms("هل ما")).toEqual([]); });
  it("newest first, flags OCR, always pending review", () => {
    const e = ppaExcerpts([
      { title: "قديم", category: "مذكرات", published_on: "2022-08-11", source_url: "u1", text_quality: "text", label: null, body: "a" },
      { title: "جديد", category: "قرارات", published_on: "2024-10-09", source_url: "u2", text_quality: "ocr", label: null, body: "b" }])!;
    expect(e.indexOf("جديد")).toBeLessThan(e.indexOf("قديم")); expect(e).toContain("مقروء ضوئيًا"); expect(e).toContain("قيد المراجعة");
    expect(ppaExcerpts([])).toBeUndefined();
  });
});
