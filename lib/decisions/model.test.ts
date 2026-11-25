import { describe, expect, it } from "vitest";
import { CLASSES, classesOf, suggestClassification } from "./model";
import { seedPayload } from "./seed";

describe("seed library", () => {
  const p = seedPayload();
  it("has 80 unique templates and every source", () => {
    expect(p.items).toHaveLength(80);
    expect(new Set(p.items.map((t) => t.id)).size).toBe(80);
    expect(p.sources.length).toBeGreaterThanOrEqual(18);
  });
  it("classification is always inside the database enums", () => {
    for (const t of p.items) {
      expect(["finance", "procurement", "property", "personnel", "projects", "other"]).toContain(t.classification.domain);
      expect(["regulatory", "individual", "administrative"]).toContain(t.classification.nature);
      expect(["general", "budget", "accounts", "planning", "loan", "transfer", "tax", "contract", "property", "other"]).toContain(t.classification.category);
      expect(["municipal_council", "executive_authority", "resolve_competent_authority"]).toContain(t.issuer_candidate);
    }
  });
  it("credit transfers are not eligible for tacit approval (category transfer)", () => {
    expect(suggestClassification("FIN02").category).toBe("transfer");
    expect(suggestClassification("FIN10").category).toBe("loan");
  });
  it("every template belongs to at least one class", () => {
    expect(CLASSES).toHaveLength(11); // the ten requested classes + competent-authority-to-be-resolved
    for (const t of p.items) expect(classesOf({ issuer: t.issuer_candidate, document_kind: t.document_kind ?? "decision_draft", domain: t.classification.domain, nature: t.classification.nature }).length).toBeGreaterThan(0);
  });
  it("no template is imported as approved or production-enabled", () => {
    for (const t of p.items) expect((t as unknown as { production_enabled: boolean }).production_enabled).toBe(false);
  });
});
