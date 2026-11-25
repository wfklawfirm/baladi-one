import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Intro } from "@/components/simple/kit";
import { loadRevenue } from "@/lib/revenueData";
import { btn, field, Flash, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";
import { addTaxpayer } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "المكلّفون — BALADI ONE", referrer: "no-referrer" as const };
const KIND: Record<string, string> = { individual: "فرد", company: "شركة", institution: "مؤسسة", other: "أخرى" };

export default async function Taxpayers({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const admin = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const sp = await searchParams;
  const d = await loadRevenue(sb);
  const back = <input type="hidden" name="back" value="/staff/revenue/taxpayers" />;
  return (
    <><StaffHeader back="/staff/revenue" backLabel="الإيرادات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Intro title="المكلّفون">المكلّف هو من يدفع رسمًا للبلدية (مواطن أو مؤسسة). سجّلوه مرة واحدة هنا، ثم تنتقلون إلى «التكليف».</Intro>
      <RevenueNav current="taxpayers" />
      <Flash ok={sp.ok} err={sp.err} />
      {d.error ? <Pending missing={d.missing} /> : <>
        {admin && <Panel fold title="إضافة مكلّف جديد" sub="اكتبوا رقم ملف أو رمزًا فقط. لا تُدخلوا بيانات شخصية لا حاجة لها.">
          <form action={addTaxpayer} className="grid gap-3 sm:grid-cols-2">{back}
            <label className="block space-y-1 text-base font-semibold">رمز المكلّف<span className="block text-sm font-normal leading-6 text-muted-foreground">رقم الملف أو رمز يعرّف المكلّف، بأحرف وأرقام.</span><input name="ref" required maxLength={60} dir="ltr" className={field} /><span className="block text-xs font-normal text-muted-foreground">مثال: T-0012</span></label>
<label className="block space-y-1 text-base font-semibold">النوع<select name="kind" className={field}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
<details className="rounded-2xl border p-3 sm:col-span-2"><summary className="cursor-pointer text-base font-semibold">حقول إضافية (اختيارية)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-base font-semibold">الاسم (اختياري)<span className="block text-sm font-normal leading-6 text-muted-foreground">اسم المكلّف، اختياري.</span><input name="name" maxLength={200} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">ملاحظة<span className="block text-sm font-normal leading-6 text-muted-foreground">ملاحظة تساعد من يقرأ السجل لاحقًا.</span><input name="note" maxLength={500} className={field} /></label></div></details>
<button className={`${btn} sm:col-span-2`}>تسجيل</button>
          
</form></Panel>}
        <Panel title={`المكلّفون (${d.taxpayers.length})`}>
          {d.taxpayers.length === 0 ? <p className="text-sm text-muted-foreground">لا مكلّفين مسجَّلين بعد.</p> :
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>الرمز</th><th>الاسم</th><th>النوع</th><th>الحالة</th><th>تكاليف</th></tr></thead>
              <tbody className="divide-y">{d.taxpayers.map((t) => <tr key={t.id} className="[&>td]:px-2 [&>td]:py-2.5"><td dir="ltr" className="text-start font-mono text-xs">{t.taxpayer_ref}</td><td>{t.name_ar ?? "—"}</td><td>{KIND[t.kind] ?? t.kind}</td><td>{t.status === "active" ? "فعّال" : "غير فعّال"}</td><td>{d.assessments.filter((a) => a.taxpayer_id === t.id && a.status !== "cancelled").length}</td></tr>)}</tbody></table></div>}
        </Panel>
        {!admin && <p className="text-xs text-muted-foreground">التسجيل لرئيس البلدية أو المدير فقط.</p>}
      </>}
    </main></>
  );
}
