import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const ID = /^[0-9a-f-]{36}$/i;
/** Staff-only: RLS on report_attachment limits this to staff of the report's municipality. Served with a locked-down content policy. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await params;
  if (!ID.test(id) || !ID.test(aid)) return new Response("not found", { status: 404 });
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { data } = await sb.from("report_attachment").select("file_name,mime,data").eq("id", aid).eq("request_id", id).maybeSingle();
  if (!data) return new Response("not found", { status: 404 });
  const hex = String(data.data).replace(/^\\x/, "");
  const bytes = Buffer.from(hex, "hex");
  const safe = encodeURIComponent(String(data.file_name)).replace(/['()]/g, "");
  return new Response(bytes, { headers: {
    "content-type": data.mime, "content-disposition": `inline; filename*=UTF-8''${safe}`,
    "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    "x-content-type-options": "nosniff", "cache-control": "private, no-store",
  } });
}
