import { describe, it, expect } from "vitest";
import { issueYear, newestFirst, yearLabel } from "./recency";
describe("recency", () => {
  it("reads the highest year in the title (amendments count)", () => {
    expect(issueYear("قانون الشراء العام رقم 244 تاريخ 19 تموز 2021 (مع تعديلاته 2024)")).toBe(2024);
    expect(issueYear("قرار رقم 9/هـ.ش.ع/2023: أسس")).toBe(2023);
    expect(issueYear("قانون البلديات 118/1977")).toBe(1977);
    expect(issueYear("دليل بلا تاريخ")).toBeNull();
    expect(issueYear("دليل بلا تاريخ", "2026-11-05")).toBe(2026);
    expect(issueYear("مرسوم 14969 (رقم 1234567)")).toBeNull();
  });
  it("sorts newest first, undated last, stable on ties", () => {
    const r = newestFirst([{ n: "a", y: 1977 }, { n: "b", y: null }, { n: "c", y: 2024 }, { n: "d", y: 2024 }, { n: "e", y: 2021 }], (x) => x.y).map((x) => x.n);
    expect(r).toEqual(["c", "d", "e", "a", "b"]);
  });
  it("labels undated sources as such", () => { expect(yearLabel(null)).toBe("التاريخ غير محدد"); expect(yearLabel(2023)).toContain("2023"); });
});
