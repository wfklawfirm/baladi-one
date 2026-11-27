import { ask, brainConfigured, type Turn } from "@/lib/brain/rag";
import { readTrial } from "@/lib/trialServer";
import { supabaseServer } from "@/lib/supabase-server";

export const maxDuration = 60;
const ipHits = new Map<string, number[]>();
/** Public trial endpoint: no staff data, no page context, no facts. One question = one use against the visitor's daily quota (checked in the database). */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "x";
  const now = Date.now(), list = (ipHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 12) return Response.json({ error: "طلبات كثيرة، حاول بعد قليل" }, { status: 429 });
  list.push(now); ipHits.set(ip, list);
  if (!brainConfigured()) return Response.json({ error: "المساعد غير مفعّل بعد" }, { status: 503 });
  const t = await readTrial();
  if (t.status !== "ok") return Response.json({ error: t.status === "expired" ? "انتهت مدة التجربة (3 أيام)" : "سجّل رقمك لبدء التجربة" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const query = String(b?.query ?? "").trim().slice(0, 1500);
  if (!query) return Response.json({ error: "اكتب سؤالك" }, { status: 400 });
  const history: Turn[] = Array.isArray(b?.history) ? b.history.filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h.content === "string").slice(-4) : [];
  const sb = await supabaseServer();
  const { data: use } = await sb.rpc("trial_use", { p_token_hash: t.hash });
  if (use === "limit") return Response.json({ error: "بلغت الحد اليومي للتجربة (25 سؤالًا)، عُد غدًا" }, { status: 429 });
  if (use !== "ok") return Response.json({ error: "انتهت الجلسة" }, { status: 401 });
  try { return Response.json(await ask(query, history, { noClarify: b?.noClarify === true })); }
  catch { return Response.json({ error: "تعذّر الوصول إلى المساعد، حاول مجدداً" }, { status: 502 }); }
}
