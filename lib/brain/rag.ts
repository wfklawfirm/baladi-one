import "server-only";
import { SYSTEM_PROMPT, ANALYSIS_SYSTEM_PROMPT } from "./prompts";
import { supabaseServer } from "@/lib/supabase-server";

// Port of baladi-api (BALADI AI): same prompts and ranking rules; the legal knowledge lives in Supabase (pgvector) instead of Qdrant.
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const CHAT_MODEL = "gpt-4o";
const CHAT_MODEL_MINI = "gpt-4o-mini";
const MIN_SCORE = 0.22, MAX_CONTEXT = 15, MAX_CONTEXT_JUR = 5;
const JUR_SOURCE = "استشارات_هيئة_التشريع_البلديات";
const LEGAL_DOMAINS = new Set(["D01", "D07", "D09", "D13"]);
export const DOMAIN_NAMES: Record<string, string> = {
  D01: "القوانين والتشريعات", D02: "الشؤون المالية", D03: "المعاملات والإجراءات", D05: "خدمات المواطنين",
  D07: "الحوكمة البلدية", D09: "الشراء والتلزيم", D10: "إدارة الأملاك", D12: "التراخيص والرخص", D13: "الرقابة الإدارية",
};
const COMPLEX = ["نموذج", "قالب", "عقد", "قرار", "مرسوم", "دفتر شروط", "مناقصة", "تحليل", "اجتهاد", "حكم", "طعن", "مخالفة", "صلاحية", "اختصاص", "استثناء", "شرح", "فرق", "مقارنة", "هل يجوز", "ما مدى", "كيف يمكن", "ما هي إجراءات", "أعدّ", "أنشئ", "اكتب"];
export const REFUSAL = "لا أملك مرجعاً كافياً في قاعدة المعرفة للإجابة بدقة على هذا السؤال. يُنصح بمراجعة القائمقامية أو وزارة الداخلية أو مستشار قانوني متخصص.";

export type Hit = { chunk_id: string; title: string; text: string; domain: string; source: string; score: number };
export type Msg = { role: "system" | "user" | "assistant"; content: string | unknown[] };

export const brainConfigured = () => !!process.env.OPENAI_API_KEY;

export function normalizeArabic(t: string) {
  return t.replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g, "").replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
}
export const classify = (q: string): "mini" | "full" => (q.trim().length > 120 || COMPLEX.some((k) => q.toLowerCase().includes(k)) ? "full" : "mini");

async function openai(path: string, body: unknown) {
  const r = await fetch(`https://api.openai.com/v1/${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  return r.json();
}
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const j = await openai("embeddings", { model: EMBED_MODEL, input: texts.map((t) => normalizeArabic(t).slice(0, 8000)), dimensions: EMBED_DIMS });
  return j.data.map((d: any) => d.embedding);
}
async function search(vec: number[], limit: number): Promise<Hit[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("match_law_chunks", { p_embedding: JSON.stringify(vec), p_limit: limit, p_min: MIN_SCORE });
  if (error) throw new Error(error.message);
  return (data ?? []).map((x: any) => ({ chunk_id: x.chunk_id, title: x.title, text: x.body, domain: x.domain, source: x.source, score: x.score }));
}

export async function retrieve(query: string, complexity: "mini" | "full", topK = 20): Promise<Hit[]> {
  const [vec] = await embedTexts([query]);
  return search(vec, complexity === "mini" ? 8 : topK);
}

export function filterAndRank(hits: Hit[]): Hit[] {
  const ok = hits.filter((h) => h.score >= MIN_SCORE);
  const key = (h: Hit) => (LEGAL_DOMAINS.has(h.domain) ? 1 : 0) * 10 + h.score;
  const jur = ok.filter((h) => h.source === JUR_SOURCE).sort((a, b) => key(b) - key(a));
  const reg = ok.filter((h) => h.source !== JUR_SOURCE).sort((a, b) => key(b) - key(a));
  const seen: Record<string, number> = {}, out: Hit[] = [];
  const add = (h: Hit) => { if ((seen[h.title] ?? 0) < 3) { out.push(h); seen[h.title] = (seen[h.title] ?? 0) + 1; } };
  jur.slice(0, MAX_CONTEXT_JUR).forEach(add);
  for (const h of reg) { if (out.length >= MAX_CONTEXT) break; add(h); }
  return out;
}
export function buildContext(chunks: Hit[], complexity: "mini" | "full" = "full") {
  const max = complexity === "mini" ? 1500 : 3500;
  return chunks.map((c, i) => `[${i + 1}] **${c.title}**${c.source === JUR_SOURCE ? " [استشارة هيئة التشريع]" : ""}\n${c.text.slice(0, max)}`).join("\n\n---\n\n");
}
export function confidence(chunks: Hit[]): "high" | "medium" | "low" {
  if (!chunks.length) return "low";
  const top = Math.max(...chunks.map((c) => c.score)), domains = new Set(chunks.map((c) => c.domain)).size;
  if (top >= 0.5 && domains >= 2 && chunks.length >= 3) return "high";
  if (top >= 0.38 || (top >= 0.33 && chunks.length >= 2)) return "medium";
  return "low";
}
export const makeSources = (chunks: Hit[]) => chunks.map((c) => ({ title: c.title, preview: c.text.slice(0, 220), domain: DOMAIN_NAMES[c.domain] ?? c.domain, score: Math.round(c.score * 1000) / 1000 }));

export type Turn = { role: "user" | "assistant"; content: string };
export async function ask(query: string, history: Turn[]) {
  const complexity = classify(query);
  let chunks: Hit[] = [];
  try { chunks = filterAndRank(await retrieve(query, complexity, 20)); } catch { /* answer from legal knowledge without sources */ }
  const NONE = "لا توجد مصادر مطابقة في قاعدة المعرفة. استند إلى معرفتك بالقانون اللبناني (قانون البلديات 118/1977 وسائر القوانين ذات الصلة)، وصرّح بأن هذا النص مسودة أولية وفق المعايير القانونية المعتمدة، وأنشئ النموذج كاملاً. لا تقتبس نص أي مادة حرفياً ولا تنسب صياغة إلى مادة بعينها: اذكر اسم القانون ورقمه، ورقم المادة فقط حين تكون متأكداً منه، ونبّه إلى وجوب مراجعة النص الرسمي.";
  const HINT = chunks.length ? "[تلميح: استخدم الهيكل الكامل — اذكر نصوص المواد حرفياً وكل الاجتهادات الواردة في المصادر]" : "[تلميح: لا مصادر مسترجعة — استخدم الهيكل الكامل دون اقتباس حرفي لنصوص المواد]";
  const msgs: Msg[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const h of history.slice(-6)) if (h.content.trim()) msgs.push({ role: h.role, content: h.content.slice(0, 6000) });
  msgs.push({ role: "user", content: `${HINT}\n\n=== وثائق المصادر المسترجعة ===\n(استخدم هذه الوثائق في إجابتك)\n\n${chunks.length ? buildContext(chunks, complexity) : NONE}\n\n=== السؤال ===\n${query}` });
  const j = await openai("chat/completions", { model: complexity === "mini" ? CHAT_MODEL_MINI : CHAT_MODEL, messages: msgs, temperature: 0.1, max_tokens: complexity === "mini" ? 2000 : 6000 });
  return { answer: (j.choices[0].message.content as string) || REFUSAL, sources: makeSources(chunks), confidence: confidence(chunks) };
}

/** Read a citizen request / uploaded document against the law and produce findings + ready-to-sign decision options. */
export async function analyze(input: { text?: string; imageDataUrl?: string; name?: string; question?: string }) {
  const searchText = ((input.question ?? "") + " " + (input.text ?? "طلب بلدي وثيقة تحليل")).trim().slice(0, 2000);
  let chunks: Hit[] = [];
  try { chunks = filterAndRank(await retrieve(searchText, "full", 20)); } catch { /* answer without sources */ }
  const ctx = chunks.length ? buildContext(chunks) : "لا توجد مصادر متاحة في قاعدة المعرفة. استند إلى معرفتك بالقانون اللبناني دون اقتباس حرفي لنصوص المواد: اذكر اسم القانون ورقمه، ورقم المادة فقط حين تكون متأكداً منه.";
  let intro = `المستند المُحمَّل: ${input.name || "وثيقة"}\n`;
  if (input.question) intro += `سؤال المستخدم: ${input.question}\n`;
  const legal = `\n\n=== قاعدة المعرفة القانونية ===\n${ctx}`;
  const content = input.imageDataUrl
    ? [{ type: "text", text: intro + "حلّل الوثيقة في الصورة وأجب بـ JSON وفق الهيكل المطلوب." + legal }, { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } }]
    : intro + `\n=== نص الوثيقة ===\n${(input.text ?? "").slice(0, 4000)}` + legal + "\n\nحلّل هذه الوثيقة وأجب بـ JSON وفق الهيكل المطلوب بالضبط.";
  const j = await openai("chat/completions", { model: CHAT_MODEL, messages: [{ role: "system", content: ANALYSIS_SYSTEM_PROMPT }, { role: "user", content }], temperature: 0.1, max_tokens: 4000, response_format: { type: "json_object" } });
  const d = JSON.parse(j.choices[0].message.content || "{}");
  return { ...d, sources: makeSources(chunks), confidence: confidence(chunks) } as Analysis;
}

export type Analysis = {
  doc_type?: string; request_category?: string; summary?: string; validity?: string; validity_reason?: string; legal_basis?: string; authority?: string;
  decision_maker?: string; urgency?: string; required_signatures?: string[]; required_docs?: string[]; risks?: string;
  options?: { id: string; type: string; title: string; description: string; pros?: string; cons?: string; template: string }[];
  recommended_option?: string; next_steps?: string[]; time_limits?: string; recommendations?: string;
  sources: ReturnType<typeof makeSources>; confidence: string;
};

export async function extractFile(file: File): Promise<{ text?: string; imageDataUrl?: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase(), ct = (file.type || "").toLowerCase();
  if (ct === "application/pdf" || name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: String(text).trim() };
  }
  if (name.endsWith(".docx")) { const m = await import("mammoth"); return { text: (await m.extractRawText({ buffer: buf })).value }; }
  if (ct.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(name)) return { imageDataUrl: `data:${ct || "image/jpeg"};base64,${buf.toString("base64")}` };
  return { text: buf.toString("utf-8") };
}
