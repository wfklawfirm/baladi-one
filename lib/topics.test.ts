import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { TX, portalCategory } from "./draft";
import { CATEGORIES } from "./i18n";
import { countAr, subTopicOf, subTopics } from "./topics";

describe("citizen directory topics", () => {
  const citizen = TX.filter((x) => x.audience === "citizen");
  const count = (topic: string, sub: string) => citizen.filter((x) => portalCategory(x.category) === topic && subTopicOf(portalCategory(x.category), x.category).id === sub).length;

  it("places every citizen transaction in a sub-topic of its own topic, leaving none empty", () => {
    let total = 0;
    for (const topic of CATEGORIES) for (const s of subTopics(topic)) { const n = count(topic, s.id); expect(n, `${topic}/${s.id}`).toBeGreaterThan(0); total += n; }
    expect(total).toBe(citizen.length);
  });
  it("groups the scattered source categories as intended", () => {
    expect(count("licenses", "building")).toBe(26);
    expect(count("certificates", "finance")).toBe(31);
    expect(count("public_works", "property")).toBe(25);
    expect(subTopicOf("public_works", "إجراءات المحافظة على سلامة البيئة").id).toBe("environment");
  });
  it("uses Arabic number agreement", () => {
    expect([1, 2, 3, 10, 11, 103, 256].map(countAr)).toEqual(["معاملة واحدة", "معاملتان", "3 معاملات", "10 معاملات", "11 معاملة", "103 معاملات", "256 معاملة"]);
  });
});
