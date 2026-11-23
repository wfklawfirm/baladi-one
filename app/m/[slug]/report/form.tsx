"use client";
import { useActionState } from "react";
import { sendReport } from "./actions";
import { REPORT_TYPES } from "@/lib/reports-client";

export function ReportForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(sendReport.bind(null, slug), null);
  return (
    <form action={action} className="space-y-4">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 font-semibold">نوع المشكلة</legend>
        {REPORT_TYPES.map(([k, label], i) => (
          <label key={k} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border bg-background px-3 has-[:checked]:border-primary has-[:checked]:bg-muted">
            <input type="radio" name="type" value={k} required defaultChecked={i === 0} />{label}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1"><span className="font-semibold">وصف المشكلة</span>
        <textarea name="description" required minLength={10} maxLength={1000} rows={5} className="w-full rounded-xl border bg-background p-3" placeholder="مثال: عمود الإنارة أمام المدرسة مطفأ منذ أسبوع" /></label>
      <label className="block space-y-1"><span className="font-semibold">الموقع</span>
        <input name="location" maxLength={300} className="min-h-12 w-full rounded-xl border bg-background px-3" placeholder="الشارع / أقرب معلم" /></label>
      <label className="block space-y-1"><span className="font-semibold">هاتف للتواصل (اختياري)</span>
        <input name="phone" inputMode="tel" maxLength={20} className="min-h-12 w-full rounded-xl border bg-background px-3" dir="ltr" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state?.error && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-60">{pending ? "جارٍ الإرسال…" : "إرسال البلاغ"}</button>
      <p className="text-xs text-muted-foreground">لا نطلب اسمك. تُستعمل بياناتك لمعالجة البلاغ فقط، وسيظهر لك رمز تتبع سري بعد الإرسال.</p>
    </form>
  );
}
