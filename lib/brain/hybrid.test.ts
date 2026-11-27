import { describe, it, expect } from "vitest";
import { parseArticleRefs } from "./hybrid";
describe("article references", () => {
  it("resolves article + law", () => expect(parseArticleRefs("ماذا تقول المادة 67 من قانون البلديات؟")).toEqual([{ law: "MUN-118", article: 67 }]));
  it("handles Arabic-Indic digits", () => expect(parseArticleRefs("المادة ٣٤ من قانون البلديات")).toEqual([{ law: "MUN-118", article: 34 }]));
  it("ignores an article with no law named", () => expect(parseArticleRefs("المادة 5")).toEqual([]));
});
import { topicRefs } from "./hybrid";
describe("topic refs", () => {
  it("pulls the thresholds decree for ceiling questions", () => expect(topicRefs("ما هو سقف طلب عروض الأسعار؟")).toEqual([{ law: "PROC-14063", article: 1 }]));
  it("nothing for unrelated", () => expect(topicRefs("نصاب الجلسة")).toEqual([]));
});
describe("new instruments", () => {
  it("fees law resolves before the generic municipal law", () => expect(parseArticleRefs("المادة 79 من قانون الرسوم والعلاوات البلدية")).toEqual([{ law: "MUN-60-1988", article: 79 }]));
  it("committee questions pull Law 309/2023", () => expect(topicRefs("هل يحق لرئيس البلدية ان يكون عضوا في لجنة التلزيم؟")).toContainEqual({ law: "PROC-309", article: 1 }));
  it("committee questions pull Court of Accounts opinion 46/2025", () => expect(topicRefs("تشكيل لجنة التلزيم في البلدية")).toContainEqual({ law: "COA-46-2025", article: 1 }));
  it("spending-limit questions pull Law 21/2025 art 3", () => expect(topicRefs("ما هو سقف عقد النفقة لرئيس البلدية؟")).toContainEqual({ law: "MUN-21-2025", article: 3 }));
});

describe("144/S, committees, invoice, amicable (retrieval routing)", () => {
  it("public-property occupation pulls 144/S arts 14/16/18", () => {
    const r = topicRefs("هل يحق للبلدية منح اجازة اشغال موقت للملك العام؟");
    for (const a of [14, 16, 18]) expect(r).toContainEqual({ law: "PUBPROP-144S-1925", article: a });
  });
  it("pavement occupation fines pull 144/S art 23", () => expect(topicRefs("غرامة اشغال الملك العام")).toContainEqual({ law: "PUBPROP-144S-1925", article: 23 }));
  it("invoice purchase pulls PROC-244 arts 47 and 60", () => {
    const r = topicRefs("كيف تتم عملية الشراء بالفاتورة؟");
    expect(r).toContainEqual({ law: "PROC-244", article: 47 });
    expect(r).toContainEqual({ law: "PROC-244", article: 60 });
  });
  it("amicable agreement pulls PROC-244 arts 46 and 62", () => {
    const r = topicRefs("شروط الاتفاق الرضائي");
    expect(r).toContainEqual({ law: "PROC-244", article: 46 });
    expect(r).toContainEqual({ law: "PROC-244", article: 62 });
  });
  it("committee questions pull PROC-244 arts 100/101", () => {
    const r = topicRefs("تشكيل لجنة التلزيم ولجنة الاستلام");
    expect(r).toContainEqual({ law: "PROC-244", article: 100 });
    expect(r).toContainEqual({ law: "PROC-244", article: 101 });
  });
  it("ratification powers pull Law 21/2025 art 3, not the procurement ceilings decree", () => {
    const r = topicRefs("ما هي صلاحية رئيس البلدية في الانفاق؟");
    expect(r).toContainEqual({ law: "MUN-21-2025", article: 3 });
    expect(r).not.toContainEqual({ law: "PROC-14063", article: 1 });
  });
});
