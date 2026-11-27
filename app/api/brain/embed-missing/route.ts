import { supabaseServer } from "@/lib/supabase-server";
import { embedTexts, brainConfigured } from "@/lib/brain/rag";

export const maxDuration = 60;
const BATCH = 40;

/**
 * Admin-only: embeds law_chunk rows that are new or whose text changed after the last embedding
 * (embedded_checksum <> checksum). GET = backlog size; POST = embed the next batch.
 * Source of truth is the database row (so consolidated/versioned text is never replaced by data/laws.json).
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("admin_embedding_backlog");
  if (data === null || data === undefined) return Response.json({ error: "غير مصرّح" }, { status: 403 });
  return Response.json({ backlog: Number(data) });
}
export async function POST() {
  if (!brainConfigured()) return Response.json({ error: "مفتاح OpenAI غير مضبوط" }, { status: 503 });
  const sb = await supabaseServer();
  const { data: rows, error } = await sb.rpc("admin_chunks_needing_embedding", { p_limit: BATCH });
  if (error) return Response.json({ error: "غير مصرّح" }, { status: 403 });
  const part = (rows ?? []) as { id: number; title: string; body: string }[];
  if (!part.length) return Response.json({ embedded: 0, backlog: 0 });
  try {
    const emb = await embedTexts(part.map((r) => r.title + "\n" + r.body));
    for (let i = 0; i < part.length; i++) {
      const { error: e } = await sb.rpc("admin_set_chunk_embedding", { p_id: part[i].id, p_embedding: JSON.stringify(emb[i]) });
      if (e) throw new Error(e.message);
    }
  } catch (e: any) { return Response.json({ error: String(e.message ?? e).slice(0, 200) }, { status: 502 }); }
  const { data: left } = await sb.rpc("admin_embedding_backlog");
  return Response.json({ embedded: part.length, backlog: Number(left ?? 0) });
}
