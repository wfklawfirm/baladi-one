import { supabaseServer } from "@/lib/supabase-server";
import { uuidOk } from "@/lib/council";
import { loadDocInput, contentHash } from "@/lib/procurementDocs/load";
import { TEMPLATE_VERSION, generateDoc } from "@/lib/procurementDocs/generate";
import { comparisonToXlsx } from "@/lib/procurementDocs/xlsx";
import { isDocKey } from "@/lib/procurementDocs/types";

export const dynamic = "force-dynamic";
/** POST (it records the generation through the audited RPC, so it is not a safe GET). */
export async function POST(req: Request, { params }: { params: Promise<{ item: string; key: string }> }) {
  const { item, key } = await params;
  if (!uuidOk(item) || !isDocKey(key)) return new Response("bad request", { status: 400 });
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { data: m } = await sb.from("staff_member").select("role").eq("user_id", user.id);
  if (!(m ?? []).some((x) => x.role === "mayor" || x.role === "admin")) return new Response("forbidden", { status: 403 });
  const bid = new URL(req.url).searchParams.get("bid");
  const input = await loadDocInput(sb, item, bid && uuidOk(bid) ? bid : null);
  if (!input) return new Response("not found", { status: 404 });
  const doc = generateDoc(key, input);
  if (key !== "bid_comparison") return new Response("xlsx only for bid_comparison", { status: 400 });
  if (!doc.ok) return new Response(doc.message, { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } });
  const buf = await comparisonToXlsx(doc);
  const { error } = await sb.rpc("procurement_document_record", { p_item: item, p_key: key, p_version: TEMPLATE_VERSION[key], p_format: "xlsx",
    p_sources: doc.sources, p_autofilled: doc.autofilled.map((a) => ({ label: a.label, source_table: a.source.table, source_id: a.source.id })), p_hash: await contentHash(JSON.stringify(doc.blocks)) });
  if (error) return new Response("record failed", { status: 500 });
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="procurement-${key}-draft.xlsx"`, "cache-control": "no-store" } });
}
