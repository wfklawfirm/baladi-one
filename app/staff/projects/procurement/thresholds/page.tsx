import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { METHOD } from "@/lib/council";
import { ART29_NOT_LOADED, NO_THRESHOLD_MSG, REVIEW_STATUS, type Threshold } from "@/lib/procurement";
import { Empty, Explain, Field, Intro } from "@/components/simple/kit";
import { addThreshold, setProcurementSettings, setThresholdReview } from "../actions";
import { ErrNotice, PendingNotice } from "@/components/projects/procurement/Notice";
import { btn, fld, money, safe } from "@/components/projects/procurement/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "سقوف الشراء — BALADI ONE", referrer: "no-referrer" as const };
const KIND: Record<string, string> = { method: "أسلوب شراء", competence: "صلاحية الجهة", admin_approval: "تصديق إداري", financial_control: "رقابة مالية" };
type Setting = { split_window_days: number; split_min_similarity: number; art29_limit_pct: number | null; art29_source: string | null; art29_review_status: string };

export default async function Thresholds({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const [th, st] = await Promise.all([
    safe<Threshold & { id: string; applies_to?: string | null; conditions?: string | null }>(sb.from("procurement_threshold").select("id,method,min_value,max_value,currency,effective_from,effective_to,source,review_status,threshold_kind,applies_to,conditions").order("effective_from", { ascending: false }).limit(500)),
    safe<Setting>(sb.from("procurement_setting").select("split_window_days,split_min_similarity,art29_limit_pct,art29_source,art29_review_status").limit(1)),
  ]);
  const cfg = st.data[0] ?? { split_window_days: 90, split_min_similarity: 0.5, art29_limit_pct: null, art29_source: null, art29_review_status: "pending_review" };
  return (
    <><StaffHeader back="/staff/projects/procurement" backLabel="الشراء العام" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <Intro title="حدود قيمة الشراء">لكل أسلوب شراء حدّ أدنى وأعلى لقيمة العقد. هنا تُسجَّل هذه الحدود من النص القانوني النافذ، فيستعملها النظام للتنبيه وتوصية الأسلوب المناسب.</Intro>
      <Explain term="السقف">أعلى قيمة (أو مدى قيمة) يجوز عندها استعمال أسلوب شراء معيّن، مثل استدراج الأسعار أو المناقصة العامة. تحدّدها النصوص القانونية وتتغير بتعديلها.</Explain>
      <ErrNotice err={sp.err} />
      {th.missing && <PendingNotice what="جدول السقوف" />}
      <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">لا سقوف مدمجة في النظام. تُحمَّل من النصوص النافذة (قانون/مرسوم/تعميم) مع ذكر المصدر، وتبقى «بانتظار المراجعة» إلى أن يعتمدها مختص قانوني. {th.data.length === 0 && NO_THRESHOLD_MSG}</p>
      <section className="elev space-y-2 rounded-2xl border bg-background p-4"><h2 className="text-lg font-bold text-primary">الحدود المسجّلة ({th.data.length})</h2>
        {th.data.length === 0 ? <Empty>لم تُسجَّل حدود بعد. سجّلوا أول حدّ من الأسفل.</Empty> : (
          <ul className="space-y-2 text-sm">{th.data.map((x) => (
            <li key={x.id} className="space-y-1 rounded-xl border p-3"><p><span className="me-2 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{KIND[x.threshold_kind ?? "method"] ?? x.threshold_kind}</span><b>{x.method ? (METHOD[x.method] ?? x.method) : (x.applies_to ?? "—")}</b> · من {money(Number(x.min_value), x.currency)} إلى {x.max_value === null ? "بلا حد أعلى" : money(Number(x.max_value), x.currency)}</p>
              {x.conditions && <p className="text-sm leading-6 text-amber-900">ملاحظة: {x.conditions}</p>}
              <p className="text-sm text-muted-foreground">نافذ من {x.effective_from}{x.effective_to ? ` إلى ${x.effective_to}` : ""} · {REVIEW_STATUS[x.review_status]} · المصدر: {x.source}</p>
              <form action={setThresholdReview} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={x.id} />
                <select name="value" defaultValue={x.review_status} aria-label="حالة المراجعة" className={fld}>{Object.entries(REVIEW_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <label className="text-sm">تاريخ الانتهاء<input type="date" name="to" defaultValue={x.effective_to ?? ""} className={`${fld} block`} /></label><button className={btn}>حفظ</button></form></li>))}</ul>)}</section>
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer text-lg font-bold text-primary">+ تسجيل حدّ جديد</summary>
        <form action={addThreshold} className="mt-3 space-y-4">
          <Field label="نوع الحدّ" hint="الحدود غير الخاصة بالأسلوب لا تؤثر على توصية الأسلوب."><select name="kind" defaultValue="method" className={`${fld} w-full`}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="أي أسلوب شراء؟" hint="لنوع «أسلوب شراء» فقط." required><select name="method" className={`${fld} w-full`}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="من قيمة" hint="أقل قيمة تدخل في هذا الحدّ." required example="0"><input name="min" required defaultValue="0" inputMode="decimal" className={`${fld} w-full`} /></Field>
            <Field label="إلى قيمة" hint="اتركوه فارغًا إن لم يوجد حدّ أعلى."><input name="max" inputMode="decimal" className={`${fld} w-full`} /></Field>
          </div>
          <Field label="من أين أخذتم هذا الحدّ؟" required hint="اكتبوا اسم النص ورقمه وتاريخه." example="تعميم هيئة الشراء العام رقم … تاريخ …"><input name="source" required maxLength={1000} className={`${fld} w-full`} /></Field>
          <details className="rounded-2xl border px-3 py-2"><summary className="cursor-pointer text-base font-semibold">حقول إضافية (العملة والتواريخ)</summary>
            <div className="grid gap-3 pt-3 sm:grid-cols-3">
              <Field label="العملة"><select name="currency" className={`${fld} w-full`}><option value="LBP">ليرة</option><option value="USD">دولار</option></select></Field>
              <Field label="ساري من" required><input type="date" name="from" required className={`${fld} w-full`} /></Field>
              <Field label="ساري حتى" hint="اختياري"><input type="date" name="to" className={`${fld} w-full`} /></Field>
            </div></details>
          <button className="min-h-12 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground">حفظ الحدّ (ينتظر مراجعة المختص)</button></form></details>
      <section className="elev space-y-3 rounded-2xl border bg-background p-4"><h2 className="text-lg font-bold text-primary">إعدادات الكشف ونسبة زيادة العقد</h2>
        <form action={setProcurementSettings} className="space-y-4">
          <Field label="مدة البحث عن مشتريات متشابهة (بالأيام)" hint="يتتبّع النظام المشتريات المتشابهة خلال هذه المدة ليكشف تجزئة شراء كبير إلى مشتريات صغيرة." example="90"><input name="days" defaultValue={cfg.split_window_days} inputMode="numeric" className={`${fld} w-full`} /></Field>
          <Field label="درجة التشابه المطلوبة (من 0.1 إلى 1)" hint="كلما ارتفعت صار الكشف أدق وأقل تنبيهًا." example="0.5"><input name="similarity" defaultValue={cfg.split_min_similarity} inputMode="decimal" className={`${fld} w-full`} /></Field>
          <Field label="النسبة القصوى لزيادة العقد بملحق (٪) — المادة 29" hint={`إن تركتموها فارغة: ${ART29_NOT_LOADED}`}><input name="art29" defaultValue={cfg.art29_limit_pct ?? ""} inputMode="decimal" className={`${fld} w-full`} /></Field>
          <Field label="من أين أخذتم هذه النسبة؟"><input name="art29_source" defaultValue={cfg.art29_source ?? ""} className={`${fld} w-full`} /></Field>
          <Field label="هل راجعها مختص؟"><select name="art29_status" defaultValue={cfg.art29_review_status} className={`${fld} w-full`}><option value="pending_review">بانتظار المراجعة</option><option value="verified">راجعها مختص</option></select></Field>
          <button className="min-h-12 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground">حفظ الإعدادات</button></form>
        <p className="text-sm text-muted-foreground">القيمتان الأوليتان (نافذة التجزئة وحد التشابه) معلمتان تقنيتان للكشف الاسترشادي وليستا قاعدة قانونية.</p></section>
    </main></>
  );
}
