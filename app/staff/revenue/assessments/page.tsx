import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Intro } from "@/components/simple/kit";
import { loadRevenue } from "@/lib/revenueData";
import { ASSESS_STATUS, NA, NOT_LOADED, pickRule, PICK_TEXT, referenceAmount, showMoney } from "@/lib/revenue";
import { money } from "@/lib/finance";
import { btn, btnSm, field, Flash, LegalNote, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";
import { addAssessment, cancelAssessment, issueOrder } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "التكليف — BALADI ONE", referrer: "no-referrer" as const };

export default async function Assessments({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const admin = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const sp = await searchParams;
  const d = await loadRevenue(sb);
  const back = <input type="hidden" name="back" value="/staff/revenue/assessments" />;
  const year = new Date().getFullYear();
  return (
    <><StaffHeader back="/staff/revenue" backLabel="الإيرادات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Intro title="تكليف المواطنين بالرسوم">التكليف هو تحديد المبلغ الذي يدين به المكلّف للبلدية. بعده تُصدرون «أمر القبض» الذي يطلب الدفع.</Intro>
      <RevenueNav current="assessments" />
      <Flash ok={sp.ok} err={sp.err} />
      <LegalNote />
      {d.error ? <Pending missing={d.missing} /> : <>
        {admin && <Panel fold title="تسجيل تكليف جديد" sub="يُدخل الموظف المبلغ يدويًا. إن وُجدت قاعدة متحقَّق منها لسنة التكليف تُحفظ مرجعًا ويُحتسب مبلغ مرجعي للمقارنة فقط؛ وإلا يُسجَّل التكليف بلا قاعدة. التكرار (المكلّف + الرسم + السنة + مرجع الموضوع) ممنوع.">
          <form action={addAssessment} className="grid gap-3 sm:grid-cols-2">{back}
            <label className="block space-y-1 text-base font-semibold">المكلّف<span className="block text-sm font-normal leading-6 text-muted-foreground">اختاروا المكلّف من القائمة.</span><select name="taxpayer" required className={field}>{d.taxpayers.filter((t) => t.status === "active").map((t) => <option key={t.id} value={t.id}>{t.taxpayer_ref}{t.name_ar ? ` — ${t.name_ar}` : ""}</option>)}</select></label>
<label className="block space-y-1 text-base font-semibold">نوع الرسم<span className="block text-sm font-normal leading-6 text-muted-foreground">نوع الرسم أو الضريبة كما يرد في القرار.</span><input name="fee_type" required maxLength={200} list="fees" className={field} /><datalist id="fees">{[...new Set(d.rules.map((r) => r.fee_type))].map((f) => <option key={f} value={f} />)}</datalist><span className="block text-xs font-normal text-muted-foreground">مثال: رسم إشغال الأملاك</span></label>
<label className="block space-y-1 text-base font-semibold">سنة التكليف<span className="block text-sm font-normal leading-6 text-muted-foreground">السنة التي يخصّها الرسم.</span><input name="year" type="number" required defaultValue={year} min={1990} max={2100} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">المبلغ المكلَّف به<span className="block text-sm font-normal leading-6 text-muted-foreground">المبلغ بالأرقام، دون فواصل.</span><input name="amount" inputMode="decimal" required className={field} /></label>
<label className="block space-y-1 text-base font-semibold">العملة<select name="currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
<label className="block space-y-1 text-base font-semibold">تاريخ الاستحقاق<span className="block text-sm font-normal leading-6 text-muted-foreground">آخر يوم للدفع دون تأخير.</span><input name="due_on" type="date" required className={field} /></label>
<details className="rounded-2xl border p-3 sm:col-span-2"><summary className="cursor-pointer text-base font-semibold">حقول إضافية (اختيارية)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-base font-semibold">مرجع الموضوع (عقار/نشاط، رمز)<span className="block text-sm font-normal leading-6 text-muted-foreground">رمز العقار أو النشاط المعني.</span><input name="object_ref" maxLength={60} dir="ltr" className={field} /></label>
<label className="block space-y-1 text-base font-semibold">وصف الأساس<input name="basis_label" maxLength={200} placeholder="مثال: المساحة" className={field} /></label>
<label className="block space-y-1 text-base font-semibold">قيمة الأساس<input name="basis_value" inputMode="decimal" className={field} /></label>
<label className="block space-y-1 text-base font-semibold">القرار البلدي المرتبط<span className="block text-sm font-normal leading-6 text-muted-foreground">اربطوا الأمر بقرار البلدية الذي أقرّه إن وُجد.</span><select name="decision" className={field}><option value="">— غير مرتبط —</option>{d.decisions.map((x) => <option key={x.id} value={x.id}>{x.decision_no}/{x.year} — {x.title.slice(0, 60)}</option>)}</select></label>
<label className="block space-y-1 text-base font-semibold sm:col-span-2">ملاحظة<span className="block text-sm font-normal leading-6 text-muted-foreground">ملاحظة تساعد من يقرأ السجل لاحقًا.</span><input name="note" maxLength={500} className={field} /></label></div></details>
<button className={`${btn} sm:col-span-2`} disabled={d.taxpayers.length === 0}>تسجيل التكليف</button>
          
</form></Panel>}
        <Panel title={`التكاليف (${d.assessments.length})`}>
          {d.assessments.length === 0 ? <p className="text-sm text-muted-foreground">لا تكاليف بعد.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>المكلّف</th><th>الرسم</th><th>السنة</th><th>المبلغ</th><th>مرجعي من القاعدة</th><th>القرار</th><th>الحالة</th><th></th></tr></thead>
            <tbody className="divide-y">{d.assessments.slice(0, 150).map((a) => { const t = d.taxpayers.find((x) => x.id === a.taxpayer_id); const rule = d.rules.find((r) => r.id === a.rule_id) ?? null; const pick = pickRule(d.rules, a.fee_type, a.fiscal_year);
              const ref = a.computed_amount !== null ? Number(a.computed_amount) : referenceAmount(rule, a.basis_value === null ? null : Number(a.basis_value), a.currency);
              return <tr key={a.id} className="[&>td]:px-2 [&>td]:py-2.5"><td dir="ltr" className="text-start font-mono text-xs">{t?.taxpayer_ref}</td><td className="font-medium">{a.fee_type}{a.object_ref ? <span dir="ltr" className="block font-mono text-xs text-muted-foreground">{a.object_ref}</span> : null}</td><td>{a.fiscal_year}</td><td>{money(Number(a.amount), a.currency)}<div className="text-xs text-muted-foreground">استحقاق {a.due_on}</div></td>
                <td title={PICK_TEXT[pick.reason]}>{a.rule_id ? (ref === null ? NA : <>{showMoney(ref, a.currency)}{Math.abs(ref - Number(a.amount)) > 0.005 && <span className="block text-xs font-bold text-destructive">يختلف عن المكلَّف به</span>}</>) : <span className="text-xs text-muted-foreground">{NOT_LOADED}</span>}</td>
                <td className="text-xs">{a.decision_id ? "مرتبط" : <span className="text-destructive">غير مرتبط</span>}</td><td>{ASSESS_STATUS[a.status] ?? a.status}</td>
                <td>{admin && a.status === "assessed" && <div className="flex flex-wrap gap-2"><form action={issueOrder}>{back}<input type="hidden" name="id" value={a.id} /><button className={btnSm}>إصدار أمر قبض</button></form>
                  <form action={cancelAssessment} className="flex gap-1">{back}<input type="hidden" name="id" value={a.id} /><input name="reason" required minLength={5} placeholder="سبب الإلغاء" className="min-h-11 w-32 rounded-xl border-2 px-2 text-xs" /><button className={btnSm}>إلغاء</button></form></div>}</td></tr>; })}</tbody></table></div>}
        </Panel>
      </>}
    </main></>
  );
}
