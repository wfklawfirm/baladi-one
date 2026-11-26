import "server-only";
import { SYSTEM_PROMPT, ANALYSIS_SYSTEM_PROMPT, MUNICIPAL_LOCK } from "./prompts";
import { auditDraft } from "./audit";
import { expandQuery, matchTemplate, templateGrounding, wantsTemplate } from "./expand";
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
  const queries = expandQuery(query);
  const vecs = await embedTexts(queries);
  const per = complexity === "mini" ? 8 : topK;
  const lists = await Promise.all(vecs.map((v) => search(v, per)));
  const best = new Map<string, Hit>();
  for (const h of lists.flat()) { const o = best.get(h.chunk_id); if (!o || h.score > o.score) best.set(h.chunk_id, h); }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, per + 6);
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

const CLARIFY_PROMPT = `أنت مساعد قانوني للبلديات اللبنانية. مهمتك الوحيدة الآن: تقرير ما إذا كان السؤال يحتاج إلى توضيح قبل الإجابة.
اطرح أسئلة توضيحية فقط إذا كان غياب المعلومة يغيّر الجواب القانوني أو الإجرائي جوهرياً (مثل: نوع الطلب أو المعاملة، صفة صاحب الطلب، الواقعة الأساسية، هل صدر قرار أو بوشرت إجراءات، نوع العقار أو الاستعمال).
القواعد:
- حدّ أقصى 3 أسئلة، وغالباً سؤال واحد أو اثنان يكفيان، كل سؤال قصير ويمكن الإجابة عنه بجملة.
- إن كان السؤال واضحاً أو عاماً ويمكن الإجابة عنه مباشرة من القانون، أو كان متابعة لحوار سبق فيه توضيح، فلا تسأل.
- لا تسأل عمّا سبق ذكره في السؤال أو في المحادثة.
- لا تسأل عن الرسوم أو المبالغ، ولا عن بيانات شخصية.
أجب بـ JSON فقط: {"questions": []} أو {"questions": ["...", "..."]}.`;

/** Up to 3 short clarifying questions, or [] when the question can be answered directly. Never blocks an answer on failure. */
export async function clarify(query: string, history: Turn[]): Promise<string[]> {
  try {
    const ctx = history.slice(-4).map((h) => `${h.role === "user" ? "المستخدم" : "المساعد"}: ${h.content.slice(0, 500)}`).join("\n");
    const j = await openai("chat/completions", {
      model: CHAT_MODEL_MINI, temperature: 0, max_tokens: 300, response_format: { type: "json_object" },
      messages: [{ role: "system", content: CLARIFY_PROMPT }, { role: "user", content: `${ctx ? `=== المحادثة السابقة ===\n${ctx}\n\n` : ""}=== السؤال الحالي ===\n${query.slice(0, 1500)}` }],
    });
    const qs = JSON.parse(j.choices[0].message.content || "{}").questions;
    return Array.isArray(qs) ? qs.map((x: unknown) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 3) : [];
  } catch { return []; }
}

export async function ask(query: string, history: Turn[], opts: { noClarify?: boolean; facts?: string; legalPrompt?: string } = {}) {
  if (!opts.noClarify) {
    const questions = await clarify(query, history);
    if (questions.length) return { clarify: questions };
  }
  const complexity = classify(query);
  let chunks: Hit[] = [];
  try { chunks = filterAndRank(await retrieve(query, complexity, 20)); } catch { /* no sources → refuse below */ }
  const tpl = wantsTemplate(query) ? matchTemplate(query) : null;
  // Nothing to ground on (no sources, no library template, no system facts): refuse instead of improvising.
  if (!chunks.length && !tpl && !opts.facts) return { answer: REFUSAL, sources: [], confidence: "low" as const };
  const NONE = "لا توجد مصادر مطابقة في قاعدة المعرفة. لا تذكر أي مادة أو رقم قانون، ولا تؤلّف نموذجاً؛ استند فقط إلى بيانات النظام أو القالب المرفق إن وُجدا.";
  const HINT = chunks.length ? "[تلميح: استخدم الهيكل الكامل — اذكر من النصوص ما ورد في المصادر فقط]" : "[تلميح: لا مصادر مسترجعة — لا اقتباس ولا أرقام مواد]";
  const sys = `${opts.legalPrompt ? `${SYSTEM_PROMPT}\n\n${opts.legalPrompt}` : SYSTEM_PROMPT}${MUNICIPAL_LOCK}`;
  const msgs: Msg[] = [{ role: "system", content: sys }];
  for (const h of history.slice(-6)) if (h.content.trim()) msgs.push({ role: h.role, content: h.content.slice(0, 6000) });
  const FACTS = opts.facts ? `=== بيانات النظام الفعلية (محسوبة في الخادم من سجلات البلدية المصرّح بها) ===\n${opts.facts}\nقواعد: إن تعلّق السؤال بأرقام أو مؤشرات فاعتمد هذه البيانات حصرًا، ولا تختلق رقمًا أو مقارنة أو اتجاهًا غير وارد فيها، وصرّح بحدود البيانات والبنود «غير المتوفرة». لا تصف أي انحراف بأنه مخالفة أو فساد. أنت تقترح فقط ولا تنفّذ ولا تعتمد شيئًا.\n\n` : "";
  const TPL = tpl ? `${templateGrounding(tpl)}\n\n` : "";
  const userMsg = `${HINT}\n\n${FACTS}${TPL}=== وثائق المصادر المسترجعة ===\n(استخدم هذه الوثائق في إجابتك)\n\n${chunks.length ? buildContext(chunks, complexity) : NONE}\n\n=== السؤال ===\n${query}`;
  msgs.push({ role: "user", content: userMsg });
  const model = complexity === "mini" ? CHAT_MODEL_MINI : CHAT_MODEL;
  const gen = async (m: Msg[]) => ((await openai("chat/completions", { model, messages: m, temperature: 0.1, max_tokens: complexity === "mini" ? 2000 : 6000 })).choices[0].message.content as string) || "";
  const sourcesForAudit = [...chunks.map((c) => ({ title: c.title, text: c.text })), ...(tpl ? [{ title: tpl.title_ar, text: `${tpl.legal_reference_candidates?.map((r) => `المادة ${r.article_candidates ?? ""}`).join(" ") ?? ""} ${(tpl.operative_clauses_ar ?? []).join(" ")}` }] : [])];
  const verify = async (answer: string): Promise<string[]> => {
    const issues = auditDraft(answer, sourcesForAudit, query).issues;
    try {
      const j = await openai("chat/completions", { model: CHAT_MODEL_MINI, temperature: 0, max_tokens: 400, response_format: { type: "json_object" }, messages: [
        { role: "system", content: "أنت مدقق قانوني للبلديات اللبنانية. قارن المسودة بالسؤال والمصادر. أبلغ فقط عن: (1) خلط الجهة (وزير/وزارة بدل المجلس البلدي أو رئيس البلدية)، (2) ادعاء قانوني أو رقم مادة غير موجود في المصادر، (3) عدم الإجابة عن السؤال المطروح فعلاً. لا تُبلغ عن أسلوب أو صياغة. أجب JSON: {\"ok\":true|false,\"issues\":[\"...\"]}" },
        { role: "user", content: `السؤال:\n${query.slice(0, 1500)}\n\nالمصادر:\n${(chunks.length ? buildContext(chunks, "mini") : "") + (tpl ? `\n${templateGrounding(tpl)}` : "") || "لا مصادر"}\n\nالمسودة:\n${answer.slice(0, 7000)}` },
      ] });
      const v = JSON.parse(j.choices[0].message.content || "{}");
      if (v.ok === false && Array.isArray(v.issues)) issues.push(...v.issues.map((x: unknown) => String(x).slice(0, 200)).slice(0, 4));
    } catch { /* deterministic audit still applies */ }
    return issues;
  };
  let answer = await gen(msgs);
  let issues = await verify(answer);
  if (issues.length) {
    const retry = await gen([...msgs, { role: "assistant", content: answer }, { role: "user", content: `رفض المدقق المسودة للأسباب التالية:\n- ${issues.join("\n- ")}\nأعد كتابة الإجابة كاملة وصحّح هذه النقاط حصراً، والتزم بأن الجهة بلدية، ولا تذكر ما لا تسنده المصادر المرفقة. إن تعذّر ذلك فاعتذر بوضوح.` }]);
    const again = await verify(retry);
    if (again.length) return { answer: `${REFUSAL}\n\nتعذّر التحقق من مسودة دقيقة لهذا الطلب: ${again.slice(0, 3).join("؛ ")}.`, sources: makeSources(chunks), confidence: "low" as const };
    answer = retry;
  }
  return { answer: answer || REFUSAL, sources: makeSources(chunks), confidence: confidence(chunks) };
}

/** Read a citizen request / uploaded document against the law and produce findings + ready-to-sign decision options. */
export async function analyze(input: { text?: string; imageDataUrl?: string; name?: string; question?: string }) {
  const searchText = ((input.question ?? "") + " " + (input.text ?? "طلب بلدي وثيقة تحليل")).trim().slice(0, 2000);
  let chunks: Hit[] = [];
  try { chunks = filterAndRank(await retrieve(searchText, "full", 20)); } catch { /* answer without sources */ }
  const ctx = chunks.length ? buildContext(chunks) : "لا توجد مصادر متاحة في قاعدة المعرفة. لا تذكر رقم مادة ولا تنسب حكماً إلى نص بعينه؛ صرّح بأن التحليل أولي وغير متحقق منه، وأن الجهة المصدِرة بلدية (المجلس البلدي/رئيس البلدية) ما لم يثبت خلافه.";
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
