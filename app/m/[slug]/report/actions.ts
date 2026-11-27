"use server";
import { redirect } from "next/navigation";
import { REPORT_TYPES, attachReportFile, reportsEnabled, submitReport } from "@/lib/reports";
import { MAX_FILES, checkFile, cleanFileName } from "@/lib/reportFiles";

export async function sendReport(slug: string, _prev: { error?: string } | null, form: FormData): Promise<{ error?: string }> {
  if (!reportsEnabled()) return { error: "الخدمة غير مفعّلة بعد." };
  if (form.get("website")) return { error: "تعذّر إرسال البلاغ." }; // honeypot
  const type = String(form.get("type") ?? ""), description = String(form.get("description") ?? "").trim();
  const location = String(form.get("location") ?? "").trim().slice(0, 300), phone = String(form.get("phone") ?? "").trim();
  if (!REPORT_TYPES.some(([k]) => k === type)) return { error: "اختر نوع المشكلة." };
  if (description.length < 10) return { error: "اكتب وصفاً من 10 أحرف على الأقل." };
  if (description.length > 1000) return { error: "الوصف طويل (الحد الأقصى 1000 حرف)." };
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return { error: `الحد الأقصى ${MAX_FILES} ملفات.` };
  // validate every file BEFORE filing the report, so a bad file does not leave a half-filed report
  const ready: { name: string; mime: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const c = checkFile(bytes, total);
    if (!c.ok) return { error: `${cleanFileName(f.name)}: ${c.error}` };
    total += bytes.length; ready.push({ name: cleanFileName(f.name), mime: c.mime, bytes });
  }
  const r = await submitReport(slug, { type, description, location, phone });
  if (!r.ok) return { error: r.error === "rate_limited" ? "محاولات كثيرة، أعد المحاولة لاحقاً." : r.error === "invalid" ? "تحقق من البيانات (رقم الهاتف مثلاً) وأعد المحاولة." : "تعذّر الإرسال حالياً، أعد المحاولة لاحقاً." };
  let failed = 0;
  for (const f of ready) if (!(await attachReportFile(r.code, f.name, f.mime, f.bytes))) failed++;
  redirect(`/m/${slug}/track?code=${r.code}&new=1${failed ? "&att=partial" : ""}`);
}
