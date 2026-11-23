import { guard } from "@/lib/brain/guard";
import { analyze, extractFile } from "@/lib/brain/rag";

export const maxDuration = 60;
export async function POST(req: Request) {
  const g = await guard(); if (!g.ok) return g.res;
  const f = await req.formData().catch(() => null);
  if (!f) return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  const question = String(f.get("question") ?? "").slice(0, 1000);
  const pasted = String(f.get("text") ?? "").slice(0, 12000);
  const file = f.get("file");
  let input: Parameters<typeof analyze>[0] = { text: pasted, question, name: String(f.get("name") ?? "") };
  if (file instanceof File && file.size) {
    if (file.size > 8_000_000) return Response.json({ error: "الملف كبير (الحد 8 ميغابايت)" }, { status: 413 });
    try { input = { ...input, ...(await extractFile(file)), name: file.name }; } catch { return Response.json({ error: "تعذّرت قراءة الملف" }, { status: 422 }); }
  }
  if (!input.text?.trim() && !input.imageDataUrl) return Response.json({ error: "أرفق ملفاً أو الصق نص المعاملة" }, { status: 400 });
  try { return Response.json(await analyze(input)); } catch { return Response.json({ error: "تعذّر تحليل المعاملة، حاول مجدداً" }, { status: 502 }); }
}
