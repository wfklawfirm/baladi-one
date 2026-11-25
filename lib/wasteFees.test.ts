import { describe, it, expect } from "vitest";
import { FEE_BANDS, monthlyBounds, parseWage, withinBounds } from "./wasteFees";

describe("waste fee bands (law 38/2026)", () => {
  it("has 30 bands, every max above its min", () => {
    expect(FEE_BANDS.length).toBe(30);
    expect(FEE_BANDS.every((b) => b.max_pct > b.min_pct && b.min_pct > 0)).toBe(true);
  });
  it("parses Arabic digits and refuses empty or non-positive input", () => {
    expect(parseWage("٢٬٠٠٠")).toBe(2000);
    expect(parseWage("")).toBeNull();
    expect(parseWage("-5")).toBeNull();
    expect(parseWage("abc")).toBeNull();
  });
  it("computes bounds from the entered wage only", () => {
    const homes = FEE_BANDS.find((b) => b.key === "homes")!;
    expect(monthlyBounds(homes, 1000)).toEqual({ min: 10, max: 40 });
    expect(withinBounds(homes, 1000, 41)).toBe(false);
    expect(withinBounds(homes, 1000, 25)).toBe(true);
  });
});
