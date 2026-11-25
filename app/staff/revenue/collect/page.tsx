import { randomUUID } from "node:crypto";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Intro } from "@/components/simple/kit";
import { loadRevenue } from "@/lib/revenueData";
import { duplicateReceiptNos, METHOD, orderState } from "@/lib/revenue";
import { money } from "@/lib/finance";
import { dayKey } from "@/lib/ops";
import { btn, btnSm, field, Flash, LegalNote, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";
import { addSeries, collect, reverseReceipt, toggleSeries } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "التحصيل والإيصالات — BALADI ONE", referrer: "no-referrer" as const };

export default async function Collect({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const admin = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const sp = await searchParams;
  const d = await loadRevenue(sb);
  const today = dayKey(new Date());
  const back = <input type="hidden" name="back" value="/staff/revenue/collect" />;
  const key = randomUUID(); // one key per rendered form: a double click / retry re-sends the same key and returns the same receipt
  const dups = d.error ? [] : duplicateReceiptNos(d.receipts);
  return (
    <><StaffHeader back="/staff/revenue" backLabel="الإيرادات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Intro title="تسجيل الدفع وإصدار الإيصال">عندما يدفع المواطن، سجّلوا الدفع هنا فيصدر الإيصال تلقائيًا. الضغط مرتين لا يسجّل الدفع مرتين.</Intro>
      <RevenueNav current="collect" />
      <Flash ok={sp.ok} err={sp.err} />
      <LegalNote />
      {d.error ? <Pending missing={d.missing} /> : <>
        {dups.length > 0 && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تحذير سلامة: أرقام إيصالات مكرَّرة ضمن السلسلة والسنة نفسها ({dups.length}).</p>}
        {d.series.filter((s) => s.is_active).length === 0 && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">لا توجد سلسلة إيصالات فعّالة: {admin ? "أضف سلسلة أدناه قبل التحصيل." : "اطلب من رئيس البلدية أو المدير إضافتها."}</p>}
        <Panel fold title="تسجيل دفعة" sub="جزئي أو كامل، لا يتجاوز المتبقي. الإرسال المتكرر بالمفتاح نفسه يُعيد الإيصال نفسه ولا يحصّل مرتين. مدة الرجوع بالتاريخ محدودة بـ31 يومًا." >
          <form action={collect} className="grid gap-3 sm:grid-cols-2">{back}<input type="hidden" name="key" value={key} />
            <label className="block space-y-1 text-base font-semibold sm:col-span-2">أمر القبض<span className="block text-sm font-normal leading-6 text-muted-foreground">اختاروا الأمر الذي دُفع جزء منه أو كله.</span><select name="order" required className={field}>{d.orders.filter((o) => ["issued", "notified", "collected"].includes(o.status) && orderState(o, d.receipts, today).remaining > 0).map((o) => { const a = d.assessments.find((x) => x.id === o.assessment_id); const st = orderState(o, d.receipts, today); return <option key={o.id} value={o.id}>{o.order_no} — {a?.fee_type} — متبقٍ {money(st.remaining, o.currency)}</option>; })}</select></label>
<label className="block space-y-1 text-base font-semibold">المبلغ<span className="block text-sm font-normal leading-6 text-muted-foreground">المبلغ بالأرقام، دون فواصل.</span><input name="amount" inputMode="decimal" required className={field} /></label>
<label className="block space-y-1 text-base font-semibold">طريقة الدفع<span className="block text-sm font-normal leading-6 text-muted-foreground">كيف دفع المواطن.</span><select name="method" className={field}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
<label className="block space-y-1 text-base font-semibold">سلسلة الإيصالات<span className="block text-sm font-normal leading-6 text-muted-foreground">دفتر الإيصالات الذي يُصدر منه الإيصال.</span><select name="series" required className={field}>{d.series.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name_ar} ({s.code})</option>)}</select></label>
<details className="rounded-2xl border p-3 sm:col-span-2"><summary className="cursor-pointer text-base font-semibold">تاريخ الدفع (افتراضيًا اليوم)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-base font-semibold">تاريخ التحصيل<span className="block text-sm font-normal leading-6 text-muted-foreground">تاريخ اليوم أو اليوم الذي تمّ فيه الدفع.</span><input name="date" type="date" defaultValue={today} max={today} className={field} /></label></div></details>
<button className={`${btn} sm:col-span-2`}>تسجيل وإصدار إيصال</button>
          
</form></Panel>
        {admin && <Panel fold title="سلاسل الإيصالات" sub="الترقيم فريد ضمن (البلدية، السلسلة، السنة المالية) فقط، دون قيد فريد شامل. النطاق القانوني للترقيم والسنة المالية (تُفترض سنة ميلادية): يلزم تحقق.">
          <form action={addSeries} className="grid gap-3 sm:grid-cols-4">{back}
            <input name="code" required maxLength={20} dir="ltr" placeholder="رمز (A)" className={field} /><input name="name" required maxLength={200} placeholder="اسم السلسلة" className={field} /><input name="prefix" maxLength={10} dir="ltr" placeholder="بادئة (اختياري)" className={field} /><button className={btn}>إضافة</button></form>
          <ul className="mt-3 divide-y text-sm">{d.series.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-3 py-2"><b>{s.name_ar}</b><span dir="ltr" className="font-mono text-xs">{s.code}{s.prefix ? ` / ${s.prefix}` : ""}</span><span className="text-xs">{s.is_active ? "فعّالة" : "موقوفة"}</span><span className="text-xs text-destructive">{s.legal_scope_verified ? "" : "النطاق القانوني غير متحقَّق منه"}</span>
            <form action={toggleSeries} className="ms-auto">{back}<input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={s.is_active ? "0" : "1"} /><button className={btnSm}>{s.is_active ? "إيقاف" : "تفعيل"}</button></form></li>)}</ul></Panel>}
        <Panel title="آخر الإيصالات" sub="الإيصال لا يُحذف ولا يُعدَّل: الإلغاء بعكس موثَّق (سبب + مستند) يترك السجل الأصلي ويُنشئ قيدًا معاكسًا.">
          {d.receipts.length === 0 ? <p className="text-sm text-muted-foreground">لا إيصالات بعد.</p> : <ul className="divide-y rounded-xl border">{d.receipts.slice(0, 60).map((r) => (
            <li key={r.id} className="space-y-1 p-3 text-sm"><div className="flex flex-wrap items-center gap-x-4 gap-y-1"><b className={r.status === "reversed" ? "text-muted-foreground line-through" : "text-primary"}>{r.receipt_no}</b><b>{money(Number(r.amount), r.currency)}</b><span>{METHOD[r.method]}</span><span className="text-xs text-muted-foreground">{r.collected_on}</span>{r.status === "reversed" && <span className="rounded-full border border-destructive/40 px-2 text-xs">معكوس</span>}</div>
              {r.status === "reversed" && <p className="text-xs text-muted-foreground">{r.reversal_reason} — {r.reversal_document_ref}</p>}
              {admin && r.status === "issued" && <form action={reverseReceipt} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">{back}<input type="hidden" name="id" value={r.id} /><input name="reason" required minLength={10} maxLength={500} placeholder="سبب العكس (10 أحرف على الأقل)" className={field} /><input name="document_ref" required minLength={3} maxLength={200} placeholder="مرجع المستند" className={field} /><button className={btnSm}>عكس موثَّق</button></form>}
            </li>))}</ul>}
        </Panel>
      </>}
    </main></>
  );
}
