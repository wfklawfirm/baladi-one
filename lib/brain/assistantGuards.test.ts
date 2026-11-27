import { describe, it, expect } from "vitest";
import { auditGuards, dropSuperseded, isRulingQuestion, mustRefuseRuling, sourceTier, GUARDS } from "./assistantGuards";
const SRC = "تؤلف اللجنة من أعضاء المجلس البلدي باستثناء رئيس البلدية";
const BAD = "نعم، يحق لرئيس البلدية أن يكون عضوًا في لجنة الشراء.";
const BAD2 = "قرار\n1. انتخاب الأعضاء في لجنة الشراء:\n - رئيس البلدية: [___]\n - عضو أصيل: [___]";
describe("assistant guards", () => {
  it("rejects the exact historical failures only when the source excludes the mayor", () => {
    expect(auditGuards(BAD, SRC)?.id).toBe("mayor-procurement-committee");
    expect(auditGuards(BAD2, SRC)?.id).toBe("mayor-procurement-committee");
    expect(auditGuards(BAD, "نص لا علاقة له")).toBeNull();
  });
  it("accepts correct answers", () => {
    expect(auditGuards("لا يجوز أن يكون رئيس البلدية عضوًا في لجنة التلزيم", SRC)).toBeNull();
    expect(auditGuards("يوقّع رئيس البلدية القرار.", SRC)).toBeNull();
  });
  it("a new guard is just data", () => {
    const g = { ...GUARDS[0], id: "x", when_source: "يمنع الجمع", subject: "الموظف", context: "اللجنة", member: "عضو", unless: "لا يجوز", affirm_answer: undefined };
    expect(auditGuards("الموظف عضو في اللجنة", "يمنع الجمع", [g])?.id).toBe("x");
  });
  it("tiers books and summaries as non-citable", () => {
    expect(sourceTier("bk03:12").tier).toBe("secondary");
    expect(sourceTier("CHK-018:1").tier).toBe("summary");
    expect(sourceTier("ACC-14969:3").tier).toBe("law");
  });
  it("drops old books only for procurement topics with authority", () => {
    const cs = [{ chunk_id: "bk01:1" }, { chunk_id: "CHK-018:2" }, { chunk_id: "circ004:1" }, { chunk_id: "ACC-14969:1" }];
    expect(dropSuperseded(cs, "هل يحق لرئيس البلدية عضوية لجنة الشراء", true).map((c) => c.chunk_id)).toEqual(["circ004:1", "ACC-14969:1"]);
    expect(dropSuperseded(cs, "هل يحق لرئيس البلدية عضوية لجنة الشراء", false)).toHaveLength(4);
    expect(dropSuperseded(cs, "كيف أسجل مولودًا", true)).toHaveLength(4);
  });
  it("ruling questions on procurement without authority are refused without a model call", () => {
    expect(isRulingQuestion("هل يحق لرئيس البلدية أن يكون عضوا في لجنة الشراء")).toBe(true);
    expect(mustRefuseRuling("هل يحق لرئيس البلدية أن يكون عضوا في لجنة الشراء", false)).toBe(true);
    expect(mustRefuseRuling("هل يحق لرئيس البلدية أن يكون عضوا في لجنة الشراء", true)).toBe(false);
    expect(mustRefuseRuling("هل يحق لي تسجيل ولادة", false)).toBe(false);
  });
});
import { answerMode, stripDrafts, parseContradiction } from "./assistantGuards";
describe("answer mode & verifier", () => {
  it("drafts only when asked", () => {
    expect(answerMode("هل يحق لرئيس البلدية عضوية لجنة الشراء", false)).toBe("ruling");
    expect(answerMode("كيف تتألف لجنة التلزيم", false)).toBe("explain");
    expect(answerMode("اكتب قرار تأليف لجنة", true)).toBe("draft");
  });
  it("strips templates from non-draft answers", () => { expect(stripDrafts("شرح <TEMPLATE:x>قرار</TEMPLATE> نهاية")).toBe("شرح  نهاية"); });
  it("parses verifier output strictly", () => {
    expect(parseContradiction('{"contradicts":true,"reason":"r"}')?.contradicts).toBe(true);
    expect(parseContradiction("garbage")).toBeNull();
    expect(parseContradiction('{"x":1}')).toBeNull();
  });
});
