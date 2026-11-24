import { guard } from "@/lib/brain/guard";
import { ask, type Turn } from "@/lib/brain/rag";
import { supabaseServer } from "@/lib/supabase-server";
import { parsePeriod } from "@/lib/ops";
import { loadOps, opsFacts } from "@/lib/opsData";

export const maxDuration = 60;
export async function POST(req: Request) {
  const g = await guard(); if (!g.ok) return g.res;
  const b = await req.json().catch(() => null);
  const query = String(b?.query ?? "").trim().slice(0, 2000);
  if (!query) return Response.json({ error: "اكتب سؤالك" }, { status: 400 });
  const history: Turn[] = Array.isArray(b?.history) ? b.history.filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h.content === "string").slice(-6) : [];
  // Page context is only a hint: facts are recomputed here from the caller's own authorised data (RLS), never trusted from the browser.
  let facts: string | undefined;
  const ctx = b?.ctx;
  if (ctx && typeof ctx.path === "string" && ctx.path.startsWith("/staff/operations")) {
    try {
      const sb = await supabaseServer();
      const { data: m } = await sb.from("staff_member").select("role").limit(10);
      if ((m ?? []).some((x: any) => x.role === "mayor" || x.role === "admin")) {
        const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 12) : undefined);
        facts = opsFacts(await loadOps(sb, parsePeriod(str(ctx.p), str(ctx.from), str(ctx.to))));
      }
    } catch { /* answer without operational facts */ }
  }
  try { return Response.json(await ask(query, history, { noClarify: b?.noClarify === true || facts !== undefined, facts })); } catch { return Response.json({ error: "تعذّر الوصول إلى المساعد، حاول مجدداً" }, { status: 502 }); }
}
