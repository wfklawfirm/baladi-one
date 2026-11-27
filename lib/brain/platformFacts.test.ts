import { describe, it, expect } from "vitest";
import { detectDomains, platformFacts } from "./platformFacts";
const fake = (tables: Record<string, any[] | null>) => ({ from: (t: string) => { const b: any = { select: () => b, limit: () => b, then: (res: any) => res({ data: tables[t] ?? null, error: tables[t] ? null : { message: "x" } }) }; return b; } });
describe("platform facts", () => {
  it("detects domains", () => {
    expect(detectDomains("كم طلبًا متأخرًا؟")).toContain("requests");
    expect(detectDomains("ما حال المشاريع والعقود؟")).toEqual(expect.arrayContaining(["projects", "contracts"]));
    expect(detectDomains("ما هي المادة 49 من قانون البلديات؟")).toEqual([]);
  });
  it("computes from rows, keeps currencies apart, never invents zero for missing data", async () => {
    const sb = fake({ project: [{ title: "a", status: "in_progress", due_on: "2026-01-01", budget_amount: 100, spent_amount: 40, currency: "USD" }, { title: "b", status: "done", due_on: "2026-01-01", budget_amount: 5, spent_amount: 5, currency: "LBP" }] });
    const f = await platformFacts(sb, "ما حال المشاريع؟", "2026-11-27");
    expect(f).toContain("العدد: 2"); expect(f).toContain("متأخرة عن موعدها: 1"); expect(f).toContain("100 USD + 5 LBP");
    expect(await platformFacts(fake({}), "ما حال العقود؟", "2026-11-27")).toContain("غير متوفر");
    expect(await platformFacts(sb, "ما هي المادة 49 من قانون البلديات؟", "2026-11-27")).toBeUndefined();
  });
  it("never includes citizen identifiers", async () => {
    const f = await platformFacts(fake({ citizen_request: [{ status: "received", kind: "report", created_at: "2026-11-01", contact_phone: "7123", applicant_name: "فلان" }] }), "كم طلبًا؟", "2026-11-27");
    expect(f).not.toContain("فلان"); expect(f).not.toContain("7123");
  });
});
