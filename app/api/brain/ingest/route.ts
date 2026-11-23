import { supabaseServer } from "@/lib/supabase-server";
import { corpus } from "@/lib/brain/corpus";
import { embedTexts, brainConfigured } from "@/lib/brain/rag";

export const maxDuration = 60;
const BATCH = 60;

/** Admin-only: embeds the law library (data/laws.json) into Supabase, one batch per call. GET = status, POST {offset} = next batch. */
export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("admin_law_chunk_count");
  if (data === null || data === undefined) return Response.json({ error: "غير مصرّح" }, { status: 403 });
  return Response.json({ done: Number(data), total: corpus().length });
}
export async function POST(req: Request) {
  if (!brainConfigured()) return Response.json({ error: "مفتاح OpenAI غير مضبوط" }, { status: 503 });
  const sb = await supabaseServer();
  const { data: cnt } = await sb.rpc("admin_law_chunk_count");
  if (cnt === null || cnt === undefined) return Response.json({ error: "غير مصرّح" }, { status: 403 });
  const offset = Math.max(0, Number((await req.json().catch(() => ({}))).offset) || 0);
  const part = corpus().slice(offset, offset + BATCH);
  if (!part.length) return Response.json({ next: null, total: corpus().length });
  try {
    const emb = await embedTexts(part.map((r) => r.title + "\n" + r.body));
    const { error } = await sb.rpc("admin_upsert_law_chunks", { p_rows: part.map((r, i) => ({ ...r, embedding: JSON.stringify(emb[i]) })) });
    if (error) throw new Error(error.message);
  } catch (e: any) { return Response.json({ error: String(e.message ?? e).slice(0, 200) }, { status: 502 }); }
  const next = offset + BATCH;
  return Response.json({ next: next < corpus().length ? next : null, total: corpus().length });
}
