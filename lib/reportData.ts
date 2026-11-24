import "server-only";
import type { Range, Req } from "./ops";
import { buildCards, decisionStats, loadOps } from "./opsData";
import { BRAND } from "./brand";
import { MAX_RECEIPTS, MAX_REQUESTS, buildReport, periodTag, type DecisionRow, type ReportDoc, type ReportInput, type ReportKind } from "./reportBuild";

/** Mayor/admin check through the caller's own session (RLS applies to every query below). Returns null when not allowed. */
export async function mayorSession(sb: any): Promise<{ status: 200 } | { status: 401 | 403 }> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { status: 401 };
  const { data } = await sb.from("staff_member").select("role,must_change_password").eq("user_id", user.id);
  const ok = (data ?? []).some((r: any) => (r.role === "mayor" || r.role === "admin") && !r.must_change_password);
  return ok ? { status: 200 } : { status: 403 };
}

/** Loads with the existing ops pipeline (never recomputes KPIs) plus the raw record lists a report needs, then builds the document. */
export async function loadReport(sb: any, kind: ReportKind, range: Range): Promise<ReportDoc> {
  const d = await loadOps(sb, range);
  const from = range.from.toISOString(), to = range.to.toISOString();
  const wantReq = kind === "requests", wantColl = kind === "collections", wantDec = kind === "decisions";
  const [rq, cl, dc] = await Promise.all([
    wantReq ? sb.from("citizen_request").select("id,kind,report_type,status,assigned_to,created_at,updated_at").gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(MAX_REQUESTS) : null,
    wantColl ? sb.from("collection_entry").select("amount,currency,method,collected_by,created_at,service_label,receipt_no").gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(MAX_RECEIPTS) : null,
    wantDec ? sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,execution_status,execution_due,responsible,decided_on").limit(2000) : null,
  ]);
  const decisions: DecisionRow[] | null = wantDec ? (dc.error ? null : (dc.data ?? [])) : d.decisions;
  const input: ReportInput = {
    o: d.o, people: d.people, cards: buildCards(d),
    ds: decisionStats(decisions) as ReportInput["ds"], decisions,
    requests: wantReq ? (rq.error ? null : (rq.data ?? []) as Req[]) : null,
    receipts: wantColl ? (cl.error ? null : cl.data ?? []) : null,
    municipality: BRAND.nameAr,
  };
  return buildReport(kind, input);
}

/** Audit trail. The RPC (migration 0018) may not exist yet: exporting must still work. */
export async function logExport(sb: any, kind: ReportKind, format: "xlsx" | "print", range: Range): Promise<void> {
  try { await sb.rpc("report_export_log", { p_kind: `${kind}.${format}`, p_period: periodTag(range) }); } catch { /* audit unavailable */ }
}
