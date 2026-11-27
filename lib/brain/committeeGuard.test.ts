import { describe, it, expect } from "vitest";
import { auditCommitteeMayor, mayorExcludedBySources } from "./committeeGuard";
const SRC = "… من أعضاء المجلس البلدي باستثناء رئيس البلدية …";
const BAD = `قرار

1. انتخاب الأعضاء التالية أسماؤهم كأعضاء في لجنة الشراء:
   - رئيس البلدية: [___]
   - عضو أصيل 1: [___]`;
describe("committee guard", () => {
  it("only applies when the retrieved sources contain the exclusion", () => {
    expect(mayorExcludedBySources(SRC)).toBe(true);
    expect(auditCommitteeMayor(BAD, "نص آخر")).toBeNull();
  });
  it("rejects a draft that seats the mayor on a procurement committee", () => { expect(auditCommitteeMayor(BAD, SRC)).toContain("رئيس البلدية"); });
  it("accepts drafts that exclude him or do not mention committees", () => {
    expect(auditCommitteeMayor("تتألف لجنة التلزيم من موظفين، ويُستثنى رئيس البلدية من عضويتها.", SRC)).toBeNull();
    expect(auditCommitteeMayor("يوقّع رئيس البلدية القرار.", SRC)).toBeNull();
    expect(auditCommitteeMayor("لا يجوز أن يكون رئيس البلدية عضوًا في لجنة التلزيم", SRC)).toBeNull();
  });
});
