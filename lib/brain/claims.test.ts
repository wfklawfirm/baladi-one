import { describe, it, expect } from "vitest";
import { parseClaims, blockingClaims, computeConfidence, type AuthMeta } from "./claims";
import { authorityCitations, bestSentence } from "./citations";
import { instrumentKind, RANK } from "./hierarchy";
import { detectConcepts, isProcurementQuery, graphNotes, altSearchTerms } from "./legalGraph";
const D = (o: Partial<AuthMeta> = {}): AuthMeta => ({ title: "قرار رقم 9/2023 لجان التلزيم", kind: "regulatory_decision", kindAr: "قرار تنظيمي", rank: 4, year: 2023, url: "https://x/1", quality: "text", status: "pending_review", excerpt: "يستعان بأعضاء من المجلس البلدي، باستثناء رئيس البلدية في لجان التلزيم.", category: "قرارات الرئيس", ...o });
describe("claim audit & confidence", () => {
  it("maps support to the five statuses", () => {
    const cs = parseClaims(JSON.stringify({ claims: [{ text: "a", support: "explicit", source: D().title, categorical: true }, { text: "b", support: "inference", source: "", categorical: false }, { text: "c", support: "none", source: "", categorical: true }, { text: "d", support: "conflict", source: "", categorical: true }] }), [D()])!;
    expect(cs.map((c) => c.status)).toEqual(["unreviewed", "inference", "insufficient", "conflict"]);
    expect(blockingClaims(cs)).toHaveLength(2);
    expect(parseClaims(JSON.stringify({ claims: [{ text: "a", support: "explicit", source: D().title }] }), [D({ status: "verified" })])![0].status).toBe("supported");
    expect(parseClaims("junk", [])).toBeNull();
  });
  it("confidence never exceeds review status or OCR quality, and is split in three", () => {
    const ok = [{ text: "a", status: "unreviewed" as const, source: D().title, categorical: true }];
    expect(computeConfidence([D()], ok)).toEqual({ extraction: "high", inference: "high", in_force: "medium", overall: "medium" });
    expect(computeConfidence([D({ quality: "ocr" })], ok).extraction).toBe("low");
    expect(computeConfidence([D({ status: "verified" })], ok).overall).toBe("high");
    expect(computeConfidence([D()], null).overall).toBe("low");
    expect(computeConfidence([D({ rank: 7 })], ok).in_force).toBe("low");
    expect(computeConfidence([D()], [{ text: "x", status: "conflict", source: "", categorical: true }]).inference).toBe("low");
  });
});
describe("citations", () => {
  it("drops sources with no supporting sentence", () => {
    expect(bestSentence("نص لا علاقة له إطلاقا بالموضوع المطروح هنا", ["رئيس البلدية"])).toBeNull();
    expect(authorityCitations([D({ excerpt: "قصير" })], ["لجان"])).toEqual([]);
    const c = authorityCitations([D()], ["رئيس", "البلدية", "لجان"]);
    expect(c).toHaveLength(1); expect(c[0].excerpt).toContain("باستثناء رئيس البلدية"); expect(c[0].url).toBe("https://x/1"); expect(c[0].status).toBe("قيد المراجعة");
  });
});
describe("hierarchy", () => {
  it("ranks by instrument kind, not date", () => {
    expect(instrumentKind("قوانين", "قانون الشراء")).toBe("law");
    expect(instrumentKind("قرارات الرئيس", "قرار")).toBe("regulatory_decision");
    expect(instrumentKind("دليل الأسئلة والأجوبة", "دليل")).toBe("guide");
    expect(RANK.law).toBeLessThan(RANK.regulatory_decision); expect(RANK.regulatory_decision).toBeLessThan(RANK.memo_circular); expect(RANK.memo_circular).toBeLessThan(RANK.guide);
  });
});
describe("legal graph", () => {
  const V = ["هل يحق لرئيس البلدية أن يكون عضوًا في لجنة الشراء؟", "هل يجوز لرئيس المجلس البلدي ترؤس لجنة التلزيم؟", "هل يمكن لرئيس السلطة التنفيذية أن يكون عضوا في لجنة الاستلام؟", "هل رئيس البلدية مسموح له بتقييم العروض؟", "هل يجوز للمرجع الصالح لعقد النفقة أن يرأس لجنة التلزيم؟", "من يعيّن لجنة التلزيم؟"];
  it("every equivalent phrasing is a procurement question with concept notes", () => { for (const q of V) { expect(isProcurementQuery(q)).toBe(true); expect(graphNotes(q)).toContain("ليست مترادفات مطلقة"); } });
  it("non-procurement questions are untouched", () => { expect(isProcurementQuery("كيف أسجل ولادة؟")).toBe(false); expect(graphNotes("كيف أسجل ولادة؟")).toBeUndefined(); });
  it("keeps mayor and executive authority distinct and flags special cases", () => {
    expect(detectConcepts("رئيس البلدية").map((c) => c.id)).toEqual(["mayor"]);
    const n = graphNotes("هل رئيس البلدية مسموح له بتقييم العروض؟")!; expect(n).toContain("بلدية بيروت"); expect(n).toContain("تمييز");
  });
  it("offers alternative legal phrasing for a second retrieval", () => { expect(altSearchTerms("هل رئيس البلدية مسموح له بتقييم العروض؟").length).toBeGreaterThan(3); });
});
