import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { formatCode, trackReport } from "./reports";

describe("reports helpers", () => {
  it("formats codes in groups of four", () => expect(formatCode("d79h6wp7wx3m")).toBe("D79H-6WP7-WX3M"));
  it("rejects malformed codes without calling the database", async () => expect(await trackReport("abc")).toBeNull());
});
