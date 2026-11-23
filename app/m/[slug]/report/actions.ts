"use server";
import { redirect } from "next/navigation";
import { REPORT_TYPES, reportsEnabled, submitReport } from "@/lib/reports";

export async function sendReport(slug: string, _prev: { error?: string } | null, form: FormData): Promise<{ error?: string }> {
  if (!reportsEnabled()) return { error: "الخدمة غير مفعّلة بعد." };
  if (form.get("website")) return { error: "تعذّر إرسال البلاغ." }; // honeypot
  const type = String(form.get("type") ?? ""), description = String(form.get("description") ?? "").trim();
  const location = String(form.get("location") ?? "").trim().slice(0, 300), phone = String(form.get("phone") ?? "").trim();
  if (!REPORT_TYPES.some(([k]) => k === type)) return { error: "اختر نوع المشكلة." };
  if (description.length < 10) return { error: "اكتب وصفاً من 10 أحرف على الأقل." };
  if (description.length > 1000) return { error: "الوصف طويل (الحد الأقصى 1000 حرف)." };
  const r = await submitReport(slug, { type, description, location, phone });
  if (!r.ok) return { error: r.error === "rate_limited" ? "محاولات كثيرة، أعد المحاولة لاحقاً." : r.error === "invalid" ? "تحقق من البيانات (رقم الهاتف مثلاً) وأعد المحاولة." : "تعذّر الإرسال حالياً، أعد المحاولة لاحقاً." };
  redirect(`/m/${slug}/track?code=${r.code}&new=1`);
}
