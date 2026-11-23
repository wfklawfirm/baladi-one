import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { TX, lawsFor, txForArticle } from "./draft";

describe("draft catalog links", () => {
  it("has no amounts and resolves law links both ways", () => {
    expect(TX.length).toBeGreaterThan(300);
    expect(JSON.stringify(TX)).not.toMatch(/ل\.ل|رسم مقطوع|مليون/);
    const l = lawsFor("T-136");
    expect(l.some((x) => x.lawId === "MUN-118" && x.n === 53)).toBe(true);
    expect(txForArticle("MUN-118", 74).length).toBeGreaterThan(5);
    expect(TX.filter((t) => lawsFor(t.id).length).length).toBeGreaterThan(230);
  });
});
