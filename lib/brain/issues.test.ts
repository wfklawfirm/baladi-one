import { describe, it, expect } from "vitest";
import { decompose, coverageMatrix, uncoveredIssues } from "./issues";
describe("issue decomposition", () => {
  it("splits a mixed question into several issues", () => {
    const ids = decompose("هل يحق لرئيس البلدية ان يكون عضوا في لجنة المناقصة وما هو النصاب لجلسة المجلس؟").map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["committee_composition", "incompatibility", "council_quorum", "mayor_powers"]));
  });
  it("returns nothing for an unrelated question", () => expect(decompose("ما هو الطقس اليوم")).toEqual([]));
});
describe("coverage matrix", () => {
  it("flags issues whose required statute was not retrieved", () => {
    const m = coverageMatrix(decompose("ما هو النصاب لجلسة المجلس"), ["bk01:3", "PROC-244:100"]);
    expect(m[0].status).toBe("uncovered");
    expect(uncoveredIssues(m)).toContain("نصاب جلسات المجلس البلدي");
  });
  it("marks covered when the statute is present", () => {
    expect(coverageMatrix(decompose("النصاب"), ["MUN-118:34"])[0].status).toBe("covered");
  });
});
