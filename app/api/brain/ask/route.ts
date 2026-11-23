import { guard } from "@/lib/brain/guard";
import { ask, type Turn } from "@/lib/brain/rag";

export const maxDuration = 60;
export async function POST(req: Request) {
  const g = await guard(); if (!g.ok) return g.res;
  const b = await req.json().catch(() => null);
  const query = String(b?.query ?? "").trim().slice(0, 2000);
  if (!query) return Response.json({ error: "اكتب سؤالك" }, { status: 400 });
  const history: Turn[] = Array.isArray(b?.history) ? b.history.filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h.content === "string").slice(-6) : [];
  try { return Response.json(await ask(query, history)); } catch { return Response.json({ error: "تعذّر الوصول إلى المساعد، حاول مجدداً" }, { status: 502 }); }
}
