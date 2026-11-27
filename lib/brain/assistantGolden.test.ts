import { describe, it, expect } from "vitest";
import golden from "@/data/assistant_golden.json";
describe("golden cases file", () => {
  it("is well-formed and every regex compiles", () => {
    const ids = new Set<string>();
    for (const c of golden.cases as any[]) {
      expect(ids.has(c.id)).toBe(false); ids.add(c.id);
      expect(c.q.length).toBeGreaterThan(5);
      for (const r of [...(c.must_match ?? []), ...(c.must_not_match ?? [])]) expect(() => new RegExp(r)).not.toThrow();
    }
  });
});
