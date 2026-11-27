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
