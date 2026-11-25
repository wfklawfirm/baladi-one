import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { METHOD } from "@/lib/council";
import { ART29_NOT_LOADED, NO_THRESHOLD_MSG, REVIEW_STATUS, type Threshold } from "@/lib/procurement";
import { addThreshold, setProcurementSettings, setThresholdReview } from "../actions";
import { ErrNotice, PendingNotice } from "@/components/projects/procurement/Notice";
import { btn, fld, money, safe } from "@/components/projects/procurement/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "سقوف الشراء — BALADI ONE", referrer: "no-referrer" as const };
type Setting = { split_window_days: number; split_min_similarity: number; art29_limit_pct: number | null; art29_source: string | null; art29_review_status: string };

export default async function Thresholds({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const [th, st] = await Promise.all([
    safe<Threshold & { id: string }>(sb.from("procurement_threshold").select("id,method,min_value,max_value,currency,effective_from,effective_to,source,review_status").order("effective_from", { ascending: false }).limit(500)),
    safe<Setting>(sb.from("procurement_setting").select("split_window_days,split_min_similarity,art29_limit_pct,art29_source,art29_review_status").limit(1)),
  ]);
  const cfg = st.data[0] ?? { split_window_days: 90, split_min_similarity: 0.5, art29_limit_pct: null, art29_source: null, art29_review_status: "pending_review" };
  return (
    <><StaffHeader back="/staff/projects/procurement" backLabel="الشراء العام" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">سقوف الشراء وإعدادات الكشف</h1>
      <ErrNotice err={sp.err} />
      {th.missing && <PendingNotice what="جدول السقوف" />}
      <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-950">لا سقوف مدمجة في النظام. تُحمَّل من النصوص النافذة (قانون/مرسوم/تعميم) مع ذكر المصدر، وتبقى «بانتظار المراجعة» إلى أن يعتمدها مختص قانوني. {th.data.length === 0 && NO_THRESHOLD_MSG}</p>
      <section className="elev space-y-2 rounded-2xl border bg-background p-4"><h2 className="font-bold text-primary">السقوف المحمَّلة ({th.data.length})</h2>
        {th.data.length === 0 ? <p className="text-sm text-muted-foreground">فارغ.</p> : (
          <ul className="space-y-2 text-sm">{th.data.map((x) => (
            <li key={x.id} className="space-y-1 rounded-xl border p-3"><p><b>{METHOD[x.method] ?? x.method}</b> · من {money(Number(x.min_value), x.currency)} إلى {x.max_value === null ? "بلا حد أعلى" : money(Number(x.max_value), x.currency)}</p>
              <p className="text-xs text-muted-foreground">نافذ من {x.effective_from}{x.effective_to ? ` إلى ${x.effective_to}` : ""} · {REVIEW_STATUS[x.review_status]} · المصدر: {x.source}</p>
              <form action={setThresholdReview} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={x.id} />
                <select name="value" defaultValue={x.review_status} aria-label="حالة المراجعة" className={fld}>{Object.entries(REVIEW_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <label className="text-xs">تاريخ الانتهاء<input type="date" name="to" defaultValue={x.effective_to ?? ""} className={`${fld} block`} /></label><button className={btn}>حفظ</button></form></li>))}</ul>)}</section>
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold text-primary">تحميل سقف جديد</summary>
        <form action={addThreshold} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">الأسلوب<select name="method" required className={`${fld} w-full`}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-sm">من قيمة (شاملة)<input name="min" required defaultValue="0" inputMode="decimal" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">إلى قيمة (شاملة؛ فارغ = بلا حد)<input name="max" inputMode="decimal" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">العملة<select name="currency" className={`${fld} w-full`}><option value="LBP">ليرة</option><option value="USD">دولار</option></select></label>
          <label className="space-y-1 text-sm">نافذ من<input type="date" name="from" required className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">نافذ حتى<input type="date" name="to" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-3">المصدر (نص النص القانوني/المرسوم ورقمه وتاريخه) — إلزامي<input name="source" required maxLength={1000} className={`${fld} w-full`} /></label>
          <button className="min-h-11 rounded-xl bg-primary px-6 font-bold text-primary-foreground sm:col-span-3">حفظ (بانتظار المراجعة)</button></form></details>
      <section className="elev space-y-3 rounded-2xl border bg-background p-4"><h2 className="font-bold text-primary">إعدادات الكشف ونسبة المادة 29</h2>
        <form action={setProcurementSettings} className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">نافذة التجزئة (أيام) — ضبط استرشادي<input name="days" defaultValue={cfg.split_window_days} inputMode="numeric" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">حد التشابه (0.1–1) — ضبط استرشادي<input name="similarity" defaultValue={cfg.split_min_similarity} inputMode="decimal" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">نسبة م.29 (% — فارغ = {ART29_NOT_LOADED})<input name="art29" defaultValue={cfg.art29_limit_pct ?? ""} inputMode="decimal" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-2">مصدر النسبة<input name="art29_source" defaultValue={cfg.art29_source ?? ""} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">حالة المراجعة<select name="art29_status" defaultValue={cfg.art29_review_status} className={`${fld} w-full`}><option value="pending_review">بانتظار المراجعة</option><option value="verified">مراجَع</option></select></label>
          <button className="min-h-11 rounded-xl bg-primary px-6 font-bold text-primary-foreground sm:col-span-3">حفظ الإعدادات</button></form>
        <p className="text-[11px] text-muted-foreground">القيمتان الأوليتان (نافذة التجزئة وحد التشابه) معلمتان تقنيتان للكشف الاسترشادي وليستا قاعدة قانونية.</p></section>
    </main></>
  );
}
