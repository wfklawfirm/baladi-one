import { describe, expect, it } from "vitest";
import { filterServices } from "./search";
import type { Service } from "./types";

const mk = (slug: string, ar: string, category: Service["category"]): Service => ({
  slug, category, onlineEnabled: false, title: { ar }, summary: { ar: "" }, documents: [], steps: [], sources: [], demo: false,
});
const list = [mk("a", "رخصة البناء", "licenses"), mk("b", "شهادة إشغال المبنى", "certificates"), mk("c", "ترخيص محل تجاري", "shops")];

describe("filterServices", () => {
  it("matches Arabic regardless of hamza/ta-marbuta spelling", () => {
    expect(filterServices(list, "رخصه البناء", "all", "ar").map((s) => s.slug)).toEqual(["a"]);
    expect(filterServices(list, "اشغال", "all", "ar").map((s) => s.slug)).toEqual(["b"]);
  });
  it("filters by category and returns all on empty query", () => {
    expect(filterServices(list, "", "shops", "ar").map((s) => s.slug)).toEqual(["c"]);
    expect(filterServices(list, "", "all", "ar")).toHaveLength(3);
  });
  it("returns nothing when no word matches", () => {
    expect(filterServices(list, "سيارة", "all", "ar")).toEqual([]);
  });
});
