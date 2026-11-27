import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: async () => ({ rpc: async () => ({ data: [{ chunk_id: "ACC-14969:1", title: "قانون الشراء العام 244/2021", body: "تؤلف لجان التلزيم من أهل الخبرة والاختصاص وفقا لأسس تضعها هيئة الشراء العام.", domain: "procurement", source: "reg", score: 0.7 }], error: null }) }) }));
import { ask } from "./rag";
import type { AuthMeta } from "./claims";
const AUTH = "=== نصوص هيئة الشراء العام ===\n### قرار رقم 9/هـ.ش.ع/2023: تحديد أسس تأليف لجان التلزيم والاستلام — [قرار تنظيمي · مرتبة 4 · 2023]\nالتصنيف: قرارات الرئيس | المصدر: https://www.ppa.gov.lb/ar/pages/details/1 | الحالة: قيد المراجعة\nيستعان بأعضاء من المجلس البلدي، باستثناء رئيس البلدية. يحظر على رئيس السلطة التنفيذية في البلديات أن يكون رئيسا أو عضوا في لجان التلزيم أو الاستلام.";
const META: AuthMeta[] = [{ title: "قرار رقم 9/هـ.ش.ع/2023: تحديد أسس تأليف لجان التلزيم والاستلام", kind: "regulatory_decision", kindAr: "قرار تنظيمي", rank: 4, year: 2023, url: "https://www.ppa.gov.lb/ar/pages/details/1", quality: "text", status: "pending_review", category: "قرارات الرئيس", excerpt: "يستعان بأعضاء من المجلس البلدي، باستثناء رئيس البلدية في لجان التلزيم والاستلام." }];
// scripted model: chat calls are answered by role of the system prompt
let script: { gen: string[]; claims: string };
const calls: string[] = [];
beforeEach(() => {
  process.env.OPENAI_API_KEY = "test"; calls.length = 0;
  globalThis.fetch = (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (String(url).endsWith("embeddings")) return new Response(JSON.stringify({ data: body.input.map(() => ({ embedding: [0.1] })) }));
    const sys = String(body.messages[0].content);
    if (sys.startsWith("أنت مدقق قانوني صارم")) { calls.push("claims"); return new Response(JSON.stringify({ choices: [{ message: { content: script.claims } }] })); }
    if (sys.startsWith("أنت مدقق قانوني للبلديات")) return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    calls.push("gen"); return new Response(JSON.stringify({ choices: [{ message: { content: script.gen.shift() ?? "" } }] }));
  }) as any;
});
const GOOD_CLAIMS = JSON.stringify({ claims: [{ text: "يستثنى رئيس البلدية", support: "explicit", source: META[0].title, categorical: true }] });
describe("ask() end-to-end with a scripted model", () => {
  it("a wrong 'نعم يحق' draft is rejected, regenerated, and the final answer is correct with structured citations", async () => {
    script = { gen: ["نعم، يحق لرئيس البلدية أن يكون عضوا في لجنة الشراء.", "لا. يستثنى رئيس البلدية من عضوية لجان التلزيم بحسب قرار الهيئة 9/2023 (قيد المراجعة)."], claims: GOOD_CLAIMS };
    const r: any = await ask("هل يحق لرئيس البلدية أن يكون عضوًا في لجنة الشراء؟", [], { noClarify: true, authority: AUTH, authorityMeta: META });
    expect(r.answer).toContain("يستثنى"); expect(r.answer).not.toMatch(/^\s*نعم/);
    expect(calls.filter((c) => c === "gen")).toHaveLength(2);
    expect(r.sources[0].url).toContain("ppa.gov.lb"); expect(r.sources[0].status).toBe("قيد المراجعة"); expect(r.sources.every((s: any) => s.preview.length >= 25)).toBe(true);
    expect(r.confidence).toBe("medium"); expect(r.confidence_detail.in_force).toBe("متوسطة");
  });
  it("two wrong drafts end in a grounded answer built from the text, never the wrong one", async () => {
    script = { gen: ["نعم يحق.", "نعم يجوز ذلك."], claims: GOOD_CLAIMS };
    const r: any = await ask("هل يجوز لرئيس المجلس البلدي ترؤس لجنة التلزيم؟", [], { noClarify: true, authority: AUTH, authorityMeta: META });
    expect(r.answer).toContain("الجواب: لا"); expect(r.answer).toContain("https://www.ppa.gov.lb/ar/pages/details/1");
  });
  it("a categorical claim without support blocks the answer; the fallback keeps only supported claims", async () => {
    script = { gen: ["يجوز التعاقد بلا لجنة.", "يجوز التعاقد بلا لجنة."], claims: JSON.stringify({ claims: [{ text: "يجوز التعاقد بلا لجنة", support: "none", source: "", categorical: true }] }) };
    const r: any = await ask("هل يجوز التعاقد دون لجنة التلزيم؟", [], { noClarify: true, authority: AUTH, authorityMeta: META });
    expect(r.answer).not.toContain("يجوز التعاقد بلا لجنة."); expect(r.answer).toContain("تعذّر التحقق");
  });
  it("no in-force text for a procurement ruling: no model call at all", async () => {
    script = { gen: ["x"], claims: "{}" };
    const r: any = await ask("هل يحق لرئيس البلدية أن يكون عضوًا في لجنة الشراء؟", [], { noClarify: true });
    expect(r.answer).toContain("لا أستطيع إعطاء حكم قاطع"); expect(calls).toEqual([]);
  });
  it("an explanatory question gets no template even if the model writes one", async () => {
    script = { gen: ["تتألف اللجنة من أهل الخبرة. <TEMPLATE:قرار>نص</TEMPLATE>"], claims: GOOD_CLAIMS };
    const r: any = await ask("كيف تتألف لجنة التلزيم؟", [], { noClarify: true, authority: AUTH, authorityMeta: META });
    expect(r.answer).not.toContain("TEMPLATE");
  });
});
