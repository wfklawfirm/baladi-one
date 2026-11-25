import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Intro } from "@/components/simple/kit";
import { loadRevenue } from "@/lib/revenueData";
import { NEEDS_LEGAL, NOT_LOADED, RATE_UNIT, rateText, REVIEW_STATUS } from "@/lib/revenue";
import { btn, btnSm, field, Flash, LegalNote, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";
import { addRule, reviewRule } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل قواعد الإيراد — BALADI ONE", referrer: "no-referrer" as const };

export default async function Rules({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const admin = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const sp = await searchParams;
  const d = await loadRevenue(sb);
  const back = <input type="hidden" name="back" value="/staff/revenue/rules" />;
  return (
    <><StaffHeader back="/staff/revenue" backLabel="الإيرادات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Intro title="قواعد الرسوم">هنا تُسجَّل الرسوم والنسب كما وردت في النصوص الرسمية. لا يُستعمل أي رقم للحساب قبل أن يراجعه ويؤكده محامٍ.</Intro>
      <RevenueNav current="rules" />
      <Flash ok={sp.ok} err={sp.err} />
      <LegalNote />
      {d.error ? <Pending missing={d.missing} /> : <>
        {admin && <Panel fold title="إضافة قاعدة رسم جديدة" sub="انقلوا ما ورد في النص الرسمي كما هو، ولا تكتبوا رقمًا من الذاكرة. ستبقى القاعدة «بانتظار المراجعة» حتى يؤكدها محامٍ.">
          <form action={addRule} className="grid gap-3 sm:grid-cols-2">{back}
            <label className="block space-y-1 text-base font-semibold">نوع الرسم<span className="block text-sm font-normal leading-6 text-muted-foreground">نوع الرسم أو الضريبة كما يرد في القرار.</span><input name="fee_type" required maxLength={200} className={field} /><span className="block text-xs font-normal text-muted-foreground">مثال: رسم إشغال الأملاك</span></label>
<label className="block space-y-1 text-base font-semibold">الصك القانوني<span className="block text-sm font-normal leading-6 text-muted-foreground">اسم النص القانوني كما هو مكتوب في المصدر.</span><input name="instrument" required maxLength={200} placeholder="قانون / مرسوم / قرار" className={field} /><span className="block text-xs font-normal text-muted-foreground">مثال: قانون / مرسوم / قرار</span></label>
<label className="block space-y-1 text-base font-semibold">سريان من<span className="block text-sm font-normal leading-6 text-muted-foreground">أول يوم يسري فيه.</span><input name="from" type="date" required className={field} /></label>
<details className="rounded-2xl border p-3 sm:col-span-2"><summary className="cursor-pointer text-base font-semibold">حقول إضافية (اختيارية)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-base font-semibold">رقمه<span className="block text-sm font-normal leading-6 text-muted-foreground">رقم النص إن وُجد.</span><input name="instrument_no" maxLength={60} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">المادة<span className="block text-sm font-normal leading-6 text-muted-foreground">رقم المادة كما في المصدر.</span><input name="article" maxLength={60} className={field} /></label>
<label className="block space-y-1 text-base font-semibold sm:col-span-2">أساس الاحتساب<span className="block text-sm font-normal leading-6 text-muted-foreground">على ماذا يُحتسب الرسم (مساحة، عدد…).</span><input name="basis" maxLength={500} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">النسبة / المعدل (اختياري)<span className="block text-sm font-normal leading-6 text-muted-foreground">اتركه فارغًا إن لم تتأكدوا من الرقم من المصدر.</span><input name="rate" inputMode="decimal" className={field} /></label>
<label className="block space-y-1 text-base font-semibold">نوع المعدل<select name="rate_unit" className={field}>{Object.entries(RATE_UNIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
<label className="block space-y-1 text-base font-semibold">عملة المعدل<select name="rate_currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
<label className="block space-y-1 text-base font-semibold">ينطبق على<input name="applicability" maxLength={1000} className={field} /></label>
<label className="block space-y-1 text-base font-semibold sm:col-span-2">الإعفاءات (نص المصدر)<textarea name="exemptions" rows={2} maxLength={2000} className={`${field} py-2`} /></label>
<label className="block space-y-1 text-base font-semibold sm:col-span-2">الغرامات (نص المصدر)<textarea name="penalties" rows={2} maxLength={2000} className={`${field} py-2`} /></label>
<label className="block space-y-1 text-base font-semibold sm:col-span-2">رابط المصدر<span className="block text-sm font-normal leading-6 text-muted-foreground">رابط الصفحة الرسمية التي أخذتم منها النص.</span><input name="source_url" dir="ltr" maxLength={500} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">سريان حتى (اختياري)<span className="block text-sm font-normal leading-6 text-muted-foreground">آخر يوم يسري فيه، أو اتركه فارغًا.</span><input name="to" type="date" className={field} /></label></div></details>
<button className={`${btn} sm:col-span-2`}>إضافة</button>
          
</form></Panel>}
        <Panel title={`القواعد (${d.rules.length})`} sub="تُختار القاعدة بفترة سريانها مقابل سنة التكليف لا بتاريخ اليوم. لا يُحتسب شيء من قاعدة غير متحقَّق منها.">
          {d.rules.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm"><b>{NOT_LOADED}</b>: لم تُحمَّل أي قاعدة إيراد بعد. الاحتساب الآلي معطَّل، ويُدخل الموظف المبلغ يدويًا مع ربطه بالقرار البلدي.</p> : (
            <ul className="space-y-3">{d.rules.map((r) => (
              <li key={r.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b>{r.fee_type}</b><span className={`rounded-full border px-2 py-0.5 text-xs ${r.review_status === "verified" ? "border-primary text-primary" : "border-destructive/40"}`}>{REVIEW_STATUS[r.review_status] ?? r.review_status}</span><span className="text-xs text-muted-foreground">{r.effective_from} ← {r.effective_to ?? "مفتوح"}</span></div>
                <div className="mt-1 text-muted-foreground">{r.instrument}{r.instrument_no ? ` ${r.instrument_no}` : ""}{r.article ? ` — م.${r.article}` : ""} <span className="text-xs">({NEEDS_LEGAL} من النص الرسمي)</span></div>
                <div className="mt-1">المعدل: <b>{rateText(r)}</b> · الأساس: {r.basis_ar ?? NOT_LOADED}</div>
                {r.exemptions_ar && <div className="mt-1">الإعفاءات: {r.exemptions_ar}</div>}
                {r.penalties_ar && <div className="mt-1">الغرامات: {r.penalties_ar}</div>}
                {admin && <form action={reviewRule} className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">{back}<input type="hidden" name="id" value={r.id} />
                  <select name="status" defaultValue={r.review_status} className={field}>{Object.entries(REVIEW_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <input name="note" placeholder="من راجع ومقابل أي مصدر (إلزامي عند التحقق)" maxLength={500} className={field} /><button className={btnSm}>حفظ</button></form>}
              </li>))}</ul>)}
        </Panel>
      </>}
    </main></>
  );
}
