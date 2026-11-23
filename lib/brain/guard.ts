import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { brainConfigured } from "./rag";

const hits = new Map<string, number[]>();
/** Staff-only gate for the AI routes: signed-in staff member, configured keys, and a small per-user rate limit (protects the API budget). */
export async function guard(): Promise<{ ok: true } | { ok: false; res: Response }> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, res: Response.json({ error: "سجّل الدخول أولاً" }, { status: 401 }) };
  const { data: rows } = await sb.from("staff_member").select("must_change_password").eq("user_id", user.id);
  if (!rows?.length || rows.some((r) => r.must_change_password)) return { ok: false, res: Response.json({ error: "غير مصرّح" }, { status: 403 }) };
  if (!brainConfigured()) return { ok: false, res: Response.json({ error: "المساعد غير مفعّل بعد" }, { status: 503 }) };
  const now = Date.now(), list = (hits.get(user.id) ?? []).filter((t) => now - t < 600_000);
  if (list.length >= 30) return { ok: false, res: Response.json({ error: "طلبات كثيرة، حاول بعد قليل" }, { status: 429 }) };
  list.push(now); hits.set(user.id, list);
  return { ok: true };
}
