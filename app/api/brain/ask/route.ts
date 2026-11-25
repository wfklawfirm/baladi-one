import { guard } from "@/lib/brain/guard";
import { ask, type Turn } from "@/lib/brain/rag";
import { supabaseServer } from "@/lib/supabase-server";
import { parsePeriod } from "@/lib/ops";
import { loadOps, opsFacts } from "@/lib/opsData";
import { buildLegalPrompt, isLegalQuestion, selectRules, type RuleCtx } from "@/lib/legalContext";

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
  // Legal/financial/procedural questions: load matching rows of the legal_rule registry (tolerates a missing table) and constrain how the model may use them.
  let legalPrompt: string | undefined;
  const path = typeof ctx?.path === "string" ? ctx.path.slice(0, 120) : undefined;
  if (isLegalQuestion(query, path)) {
    try {
      const sb = await supabaseServer();
      const { data, error } = await sb.from("legal_rule").select("rule_id,instrument,instrument_no,article,topic,summary_ar,conditions_ar,exceptions_ar,deadline_ar,required_docs_ar,enforcement,review_status,original_text_loaded,workflow").limit(200);
      legalPrompt = buildLegalPrompt(error ? null : selectRules(query, (data ?? []) as RuleCtx[], path));
    } catch { legalPrompt = buildLegalPrompt(null); }
  }
  try { return Response.json(await ask(query, history, { noClarify: b?.noClarify === true || facts !== undefined, facts, legalPrompt })); } catch { return Response.json({ error: "تعذّر الوصول إلى المساعد، حاول مجدداً" }, { status: 502 }); }
}
