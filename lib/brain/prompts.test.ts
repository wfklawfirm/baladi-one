import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, TEMPLATE_RULES, DYNAMIC_STRUCTURE } from "./prompts";
describe("prompts", () => {
  it("base prompt no longer forces a template or a jurisprudence table", () => {
    expect(SYSTEM_PROMPT).not.toContain("<TEMPLATE"); expect(SYSTEM_PROMPT).not.toContain("إلزامي في كل إجابة"); expect(SYSTEM_PROMPT).not.toContain("| الرقم والتاريخ |");
    expect(SYSTEM_PROMPT).toContain("استنتاج"); expect(DYNAMIC_STRUCTURE).toContain("إلا إذا طلبه المستخدم صراحة");
  });
  it("template rules survive for draft mode only", () => { expect(TEMPLATE_RULES).toContain("<TEMPLATE"); expect(TEMPLATE_RULES.length).toBeGreaterThan(500); });
});
