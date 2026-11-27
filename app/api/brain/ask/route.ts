import { guard } from "@/lib/brain/guard";
import { ask, type Turn } from "@/lib/brain/rag";
import { supabaseServer } from "@/lib/supabase-server";
import { parsePeriod } from "@/lib/ops";
import { loadOps, opsFacts } from "@/lib/opsData";
import { procurementItemFacts } from "@/lib/procurementAuditData";
import { procurementOverviewFacts } from "@/lib/procurementStatsData";
import { supersessionNote } from "@/lib/brain/supersession";
import { platformFacts } from "@/lib/brain/platformFacts";
import { buildLegalPrompt, isLegalQuestion, selectRules, type RuleCtx } from "@/lib/legalContext";

export const maxDuration = 60;
const PROC_LIMITS = "\n\n## حدود التحقق\n- اعتمدتُ على السجلات المقروءة وفق صلاحياتك وقت السؤال؛ ما لم يُسجَّل في النظام لا أعرفه.\n- السقوف والمهل والمواد القانونية الواردة في النظام بانتظار المراجعة القانونية؛ لا أعدّ أي مهلة أو سقف مؤكَّدًا.\n- أنا أقترح وأصوغ مسودات فقط؛ الاعتماد واختيار الفائز والتوقيع للجهات المختصة من البشر.";
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
  // Procurement pages: facts are recomputed here under the caller's RLS (mayor/admin only). Bid prices and conflict declarations are never put into the prompt.
  const isProc = typeof ctx?.path === "string" && ctx.path.startsWith("/staff/procurement");
  if (isProc) {
    try {
      const sb = await supabaseServer();
      const { data: m } = await sb.from("staff_member").select("role,municipality(name_ar)").limit(10);
      if ((m ?? []).some((x: any) => x.role === "mayor" || x.role === "admin")) {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
        const item = typeof ctx.item === "string" && /^[0-9a-f-]{36}$/i.test(ctx.item) ? ctx.item : null;
        facts = (item ? await procurementItemFacts(sb, item, (m as any)?.[0]?.municipality?.name_ar ?? "—") : null) ?? await procurementOverviewFacts(sb, Number(today.slice(0, 4)), today);
      }
    } catch { /* answer without procurement facts */ }
  }
  // Any other question about the municipality's own data (requests, decisions, projects, contracts, finance, admin...): facts from the caller's RLS-visible rows.
  if (facts === undefined) {
    try {
      const sb = await supabaseServer();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
      facts = await platformFacts(sb, query, today, { procurement: () => procurementOverviewFacts(sb, Number(today.slice(0, 4)), today) });
    } catch { /* answer without platform facts */ }
  }
  // Legal/financial/procedural questions: load matching rows of the legal_rule registry (tolerates a missing table) and constrain how the model may use them.
  let legalPrompt: string | undefined;
  const path = typeof ctx?.path === "string" ? ctx.path.slice(0, 120) : undefined;
  // /staff/procurement/* is a procurement workflow page (the path table in legalContext only knows /staff/projects/*)
  if (isLegalQuestion(query, isProc ? "/staff/projects/procurement" : path)) {
    try {
      const sb = await supabaseServer();
      const { data, error } = await sb.from("legal_rule").select("rule_id,instrument,instrument_no,article,topic,summary_ar,conditions_ar,exceptions_ar,deadline_ar,required_docs_ar,enforcement,review_status,original_text_loaded,workflow").limit(200);
      legalPrompt = buildLegalPrompt(error ? null : selectRules(query, (data ?? []) as RuleCtx[], isProc ? "/staff/projects/procurement" : path));
    } catch { legalPrompt = buildLegalPrompt(null); }
  }
  // Procurement questions: the newest in-force instruments prevail over older municipal-law-era sources.
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from("procurement_legal_source").select("instrument_type,instrument_number,instrument_date,verification_status,effective_to").limit(100);
    const note = supersessionNote(query, (data ?? null) as any);
    if (note) legalPrompt = `${legalPrompt ?? ""}\n\n${note}`.trim();
  } catch { /* note is optional */ }
  try {
    const r = await ask(query, history, { noClarify: b?.noClarify === true || facts !== undefined, facts, legalPrompt });
    // procurement answers must always carry the verification limits, whatever the model wrote
    if (isProc && "answer" in r && typeof r.answer === "string" && !r.answer.includes("حدود التحقق")) r.answer += PROC_LIMITS;
    return Response.json(r);
  } catch { return Response.json({ error: "تعذّر الوصول إلى المساعد، حاول مجدداً" }, { status: 502 }); }
}
