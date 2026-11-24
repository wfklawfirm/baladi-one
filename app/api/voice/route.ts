import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabase-server";

export const maxDuration = 60;

// OpenAI's current speech-to-text model, then the older one in case the account does not have the first.
const MODELS = ["gpt-transcribe", "gpt-4o-mini-transcribe"];
const CONTEXT = "إملاء صوتي بالعربية، وقد يكون باللهجة اللبنانية، داخل منصة بلدية: معاملات، رخص، إفادات، بلاغات، قرارات بلدية.";
const MAX_BYTES = 4_000_000; // about a minute of speech; also under the platform's request-size limit
const staffHits = new Map<string, number[]>();

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Voice dictation: one short recording in, its transcript out. Nothing is stored. Staff are limited per account;
 *  everyone else goes through voice_allow() in the database, which caps calls per caller and per day. */
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) return fail("التسجيل الصوتي غير مفعّل بعد", 503);
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size < 800) return fail("التسجيل قصير جداً، حاول مجدداً", 400);
  if (audio.size > MAX_BYTES) return fail("التسجيل طويل، اختصره إلى أقل من دقيقة", 413);
  const type = audio.type.toLowerCase();
  if (!/^(audio|video)\/(webm|mp4|ogg|mpeg|wav|x-wav|m4a|x-m4a|aac)/.test(type)) return fail("صيغة التسجيل غير مدعومة", 415);

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const staff = user ? ((await sb.from("staff_member").select("user_id").eq("user_id", user.id)).data?.length ?? 0) > 0 : false;
  if (staff && user) {
    const now = Date.now(), list = (staffHits.get(user.id) ?? []).filter((t) => now - t < 600_000);
    if (list.length >= 40) return fail("تسجيلات كثيرة، حاول بعد قليل", 429);
    list.push(now); staffHits.set(user.id, list);
  } else {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const caller = createHash("sha256").update(`baladi-voice:${ip}`).digest("hex");
    const { data: allowed, error } = await sb.rpc("voice_allow", { p_caller: caller });
    if (error) return fail("التسجيل الصوتي غير مفعّل بعد", 503);
    if (!allowed) return fail("تسجيلات كثيرة، حاول بعد قليل", 429);
  }

  const ext = /mp4|m4a|aac/.test(type) ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") ? "mp3" : "webm";
  for (const model of MODELS) {
    const body = new FormData();
    body.append("file", audio, `voice.${ext}`); body.append("model", model); body.append("prompt", CONTEXT);
    let r: Response;
    try { r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body }); }
    catch { break; }
    if (r.ok) {
      const text = String((await r.json()).text ?? "").trim();
      // on silence the model may hand the context line back; that is not speech
      return Response.json({ text: text.includes("إملاء صوتي بالعربية") ? "" : text.slice(0, 4000) });
    }
    console.error("voice transcription failed", model, r.status, (await r.text()).slice(0, 300));
    if (![400, 403, 404].includes(r.status)) break; // only a problem with the model itself is worth a second try
  }
  return fail("تعذّر تحويل الصوت إلى نص، حاول مجدداً", 502);
}
