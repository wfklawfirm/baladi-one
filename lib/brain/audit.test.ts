import { describe, it, expect } from "vitest";
import { auditDraft, citedArticles, westernDigits } from "./audit";
import { expandQuery, matchTemplate, wantsTemplate } from "./expand";

const WRONG = `<TEMPLATE:نموذج قرار>\nالجمهورية اللبنانية\nوزارة [اسم الوزارة المختصة]\nقرار\nبناءً على اقتراح الوزير المختص، وبعد الاطلاع على الدراسة الفنية المعدة من قبل الوزارة المختصة، تقرر: إسقاط الملك العام\nالوزير المختص\n</TEMPLATE>`;
const GOOD = `<TEMPLATE:نموذج قرار>\nالجمهورية اللبنانية\nوزارة الداخلية والبلديات\nبلدية [___]\nقرار المجلس البلدي: إسقاط الملك البلدي العام\nرئيس البلدية\n</TEMPLATE>`;

describe("auditDraft", () => {
  it("rejects the ministerial draft for a municipal question (the reported bug)", () => {
    const r = auditDraft(WRONG, [], "اعطني نموذج قرار إسقاط الملك البلدي");
    expect(r.ok).toBe(false);
    expect(r.hard.length).toBeGreaterThanOrEqual(3);
  });
  it("accepts a municipal draft", () => expect(auditDraft(GOOD, [], "نموذج قرار إسقاط الملك البلدي").ok).toBe(true));
  it("flags a template without municipality as hard", () => expect(auditDraft("<TEMPLATE:x>قرار عام\nالمدير</TEMPLATE>", [], "قرار بلدي").hard.length).toBe(1));
  it("does not hard-block prose that mentions the minister or article numbers", () => { const r = auditDraft("يصدّق الوزير المختص وفق المادة 77 من القانون", [], "بلدية"); expect(r.hard).toEqual([]); expect(r.soft.length).toBeGreaterThan(0); });
  it("normalises Arabic digits", () => { expect(westernDigits("المادة ٤٩")).toBe("المادة 49"); expect(citedArticles("وفق المادة ٤٩ والمادة 12")).toEqual(["49", "12"]); });
  it("flags cited articles missing from sources and passes supported ones", () => {
    const chunks = [{ title: "قانون البلديات", text: "المادة 49 - يتولى المجلس البلدي" }];
    expect(auditDraft("وفق المادة 49", chunks, "بلدية").ok).toBe(true);
    expect(auditDraft("وفق المادة 77", chunks, "بلدية").ok).toBe(false);
  });
  it("flags cited articles when there are no sources at all", () => expect(auditDraft("المادة 49", [], "بلدية").ok).toBe(false));
});

describe("expand/match", () => {
  it("expands property-drop questions toward municipal material", () => expect(expandQuery("نموذج قرار اسقاط الملك البلدي").some((x) => x.includes("ملك بلدي خاص"))).toBe(true));
  it("finds ASSET05 for the reported question", () => expect(matchTemplate("اعطني نموذج قرار إسقاط ملك عام بلدي إلى ملك خاص")?.id).toBe("ASSET05"));
  it("does not match an unrelated question", () => expect(matchTemplate("كم رسم الاشتراك بالمياه")).toBeNull());
  it("detects template intent", () => expect(wantsTemplate("اعطني نموذج قرار")).toBe(true));
});
