import { describe, it, expect } from "vitest";
import { checkFile, sniffMime, cleanFileName, MAX_FILE_BYTES } from "./reportFiles";
const pad = (h: number[], n = 20) => Uint8Array.from([...h, ...new Array(n).fill(0)]);
describe("report attachment rules", () => {
  it("detects real types from bytes", () => {
    expect(sniffMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(pad([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffMime(pad([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
    expect(sniffMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });
  it("rejects scripts/html/exe disguised by name, empty and oversize files", () => {
    expect(checkFile(new TextEncoder().encode("<script>alert(1)</script>")).ok).toBe(false);
    expect(checkFile(pad([0x4d, 0x5a])).ok).toBe(false);
    expect(checkFile(new Uint8Array(0)).ok).toBe(false);
    expect(checkFile(new Uint8Array(MAX_FILE_BYTES + 1)).ok).toBe(false);
  });
  it("enforces the total", () => expect(checkFile(pad([0xff, 0xd8, 0xff]), 4 * 1024 * 1024 - 5).ok).toBe(false));
  it("cleans names", () => expect(cleanFileName("../../a\u0000b.jpg")).toBe(".._.._a_b.jpg"));
});
