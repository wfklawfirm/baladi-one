"use client";
import { useActionState } from "react";
import { sendReport } from "./actions";
import { REPORT_TYPES } from "@/lib/reports-client";
import Mic from "@/components/Mic";

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
      <div className="space-y-1"><label htmlFor="rp-desc" className="block font-semibold">وصف المشكلة</label>
        <div className="relative"><textarea id="rp-desc" name="description" required minLength={10} maxLength={1000} rows={5} className="w-full rounded-xl border bg-background p-3 pe-16" placeholder="مثال: عمود الإنارة أمام المدرسة مطفأ منذ أسبوع" />
          <Mic target="rp-desc" className="absolute bottom-3 end-2" /></div>
        <p className="text-xs text-muted-foreground">يمكنك الإملاء بالصوت: اضغط الميكروفون وتكلّم، فيُكتب كلامك في الحقل.</p></div>
      <div className="space-y-1"><label htmlFor="rp-loc" className="block font-semibold">الموقع</label>
        <div className="flex gap-2"><input id="rp-loc" name="location" maxLength={300} className="min-h-12 min-w-0 flex-1 rounded-xl border bg-background px-3" placeholder="الشارع / أقرب معلم" /><Mic target="rp-loc" /></div></div>
      <label className="block space-y-1"><span className="font-semibold">هاتف للتواصل (اختياري)</span>
        <input name="phone" inputMode="tel" maxLength={20} className="min-h-12 w-full rounded-xl border bg-background px-3" dir="ltr" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state?.error && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-60">{pending ? "جارٍ الإرسال…" : "إرسال البلاغ"}</button>
      <p className="text-xs text-muted-foreground">لا نطلب اسمك. تُستعمل بياناتك لمعالجة البلاغ فقط، وسيظهر لك رمز تتبع سري بعد الإرسال.</p>
    </form>
  );
}
