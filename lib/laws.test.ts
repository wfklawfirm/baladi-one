import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { LAWS, getLaw, searchLaws } from "./laws";

describe("laws library", () => {
  it("has the four instruments with sequential article numbers", () => {
    expect(LAWS.map((l) => l.id).sort()).toEqual(["ACC-14969", "MACC-5595", "MUN-118", "PROC-244"]);
    for (const l of LAWS) {
      const ns = l.articles.map((a) => a.n);
      expect(ns).toEqual([...ns].sort((a, b) => a - b));
      expect(l.articles.every((a) => a.text.length > 0)).toBe(true);
    }
  });
  it("finds an article by number and by word", () => {
    expect(searchLaws("22", "PROC-244")[0].article.heading).toContain("صلاحية");
    expect(searchLaws("الشراء بالفاتورة", "PROC-244").length).toBeGreaterThan(0);
    expect(getLaw("mun-118")?.article_count).toBeGreaterThan(130);
  });
});
