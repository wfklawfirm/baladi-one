import { describe, it, expect } from "vitest";
import { parseArticleRefs } from "./hybrid";
describe("article references", () => {
  it("resolves article + law", () => expect(parseArticleRefs("ماذا تقول المادة 67 من قانون البلديات؟")).toEqual([{ law: "MUN-118", article: 67 }]));
  it("handles Arabic-Indic digits", () => expect(parseArticleRefs("المادة ٣٤ من قانون البلديات")).toEqual([{ law: "MUN-118", article: 34 }]));
  it("ignores an article with no law named", () => expect(parseArticleRefs("المادة 5")).toEqual([]));
});
