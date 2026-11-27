import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: async () => ({}) }));
import { filterAndRank, type Hit } from "./rag";
const h = (id: string, source: string, score: number, title = id): Hit => ({ chunk_id: id, title, text: "x", domain: "D01", source, score });
describe("filterAndRank: statutes outrank books", () => {
  it("puts a lower-scoring statute before a higher-scoring book", () => {
    const out = filterAndRank([h("bk01:1", "book", 0.6, "كتاب"), h("MUN-118:67", "law_library", 0.4, "قانون البلديات")]);
    expect(out[0].source).toBe("law_library");
  });
  it("still keeps books to fill remaining slots", () => {
    const out = filterAndRank([h("bk01:1", "book", 0.6, "كتاب"), h("MUN-118:67", "law_library", 0.4, "قانون")]);
    expect(out.length).toBe(2);
  });
});
