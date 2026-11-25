import "server-only";
import { buildInbox, type InboxItem } from "./mayorInboxCore";

type Sb = { from: (t: string) => any };
const safe = async <T,>(p: PromiseLike<{ data: T | null; error: unknown; count?: number | null }>): Promise<{ data: T | null; count: number | null }> => {
  try { const r = await p; return r.error ? { data: null, count: null } : { data: r.data, count: r.count ?? null }; } catch { return { data: null, count: null }; }
};

/** Real items waiting for the mayor, from the registers the caller's RLS lets them see. Unavailable source → just no items. */
export async function loadMayorInbox(sb: Sb): Promise<{ items: InboxItem[]; total: number }> {
  const [reqs, decs, mins, vers] = await Promise.all([
    safe<unknown[]>(sb.from("citizen_request").select("id", { count: "exact", head: true }).eq("status", "received")),
    safe<{ id: string; decision_no: string; year: number; title: string; created_at: string; template_snapshot: unknown }[]>(sb.from("municipal_decision").select("id,decision_no,year,title,created_at,template_snapshot").in("legal_status", ["draft", "pending_completion"]).order("created_at").limit(20)),
    safe<{ id: string; session_no: string | null; title: string; held_on: string | null; created_at: string }[]>(sb.from("council_session").select("id,session_no,title,held_on,created_at").eq("status", "minutes_draft").order("created_at").limit(10)),
    safe<{ id: string; title_ar: string; created_at: string }[]>(sb.from("service_version").select("id,title_ar,created_at").eq("status", "in_review").order("created_at").limit(10)),
  ]);
  return buildInbox({ newRequests: reqs.count ?? 0, decisions: decs.data ?? [], minutes: mins.data ?? [], services: vers.data ?? [] }, Date.now());
}
