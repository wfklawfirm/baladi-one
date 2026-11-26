import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { safe, fld, money } from "@/components/projects/procurement/data";
import { ErrNotice } from "@/components/projects/procurement/Notice";
import { uuidOk } from "@/lib/council";
import { addBid, evaluateBid, setBidsOpen } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "العروض — BALADI ONE", referrer: "no-referrer" as const };
type Item = { id: string; title: string; estimated_value: number; currency: string; bids_open_on: string | null };
type Bid = { id: string; supplier_id: string; received_on: string; currency: string; total_value: number; delivery_days: number | null; warranty_note: string | null; bid_note: string | null; technical_compliant: boolean | null; evaluation_note: string | null };

export default async function Bids({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { id } = await params, sp = await searchParams;
  if (!uuidOk(id)) notFound();
  const { data: item } = await sb.from("procurement_plan_item").select("id,title,estimated_value,currency,bids_open_on").eq("id", id).maybeSingle<Item>();
  if (!item) notFound();
  const opened = !!item.bids_open_on && new Date(item.bids_open_on) <= new Date();
  const [sup, bids, cnt] = await Promise.all([
    safe<{ id: string; name: string }>(sb.from("procurement_supplier").select("id,name").order("name").limit(500)),
    opened ? safe<Bid>(sb.from("procurement_bid").select("*").eq("plan_item_id", id).order("total_value")) : Promise.resolve({ data: [] as Bid[], missing: false }),
    sb.rpc("procurement_bid_count", { p_item: id }),
  ]);
  const name = (sid: string) => sup.data.find((x) => x.id === sid)?.name ?? "—";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const count = typeof cnt.data === "number" ? cnt.data : null;
  const cur = new Set(bids.data.map((b) => b.currency)).size > 1;
  return (
    <><StaffHeader back="/staff/projects/procurement" backLabel="خطة الشراء" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">عروض: {item.title}</h1>
      <p className="text-sm text-muted-foreground">القيمة التقديرية {money(item.estimated_value, item.currency)} · عروض مستلمة: {count ?? "—"}</p>
      <ErrNotice err={sp.err} />
      <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold text-primary">موعد فتح العروض</h2>
        {item.bids_open_on ? <p className="text-sm">{opened ? "فُتحت العروض في" : "العروض مختومة حتى"} {new Intl.DateTimeFormat("ar-LB-u-nu-latn", { timeZone: "Asia/Beirut", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.bids_open_on))}</p>
          : <p className="text-sm text-amber-900">لم يُحدَّد موعد الفتح: لا يمكن الاطلاع على العروض قبل تحديده وحلوله.</p>}
        {!opened && <form action={setBidsOpen} className="flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={id} />
          <label className="text-sm">{item.bids_open_on ? "تعديل الموعد" : "تحديد الموعد"}<input type="datetime-local" name="open" required className={`${fld} block`} /></label>
          <button className="min-h-12 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ</button></form>}
      </section>
      {!opened && <section className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold text-primary">تسجيل عرض مستلم</h2>
        <p className="text-sm text-muted-foreground">يُحفظ العرض مختومًا ولا يُعدَّل بعد استلامه ولا يُعرض قبل الفتح.</p>
        {sup.data.length === 0 ? <p className="text-sm">أضيفوا مورّدًا أولًا من صفحة الموردين.</p> :
        <form action={addBid} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="item" value={id} />
          <label className="space-y-1 text-sm sm:col-span-2">العارض<select name="supplier" required className={`${fld} w-full`}>{sup.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="space-y-1 text-sm">تاريخ الاستلام<input type="date" name="received" required defaultValue={today} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">السعر الإجمالي<input name="total" required inputMode="decimal" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">العملة<select name="currency" defaultValue={item.currency} className={`${fld} w-full`}><option value="USD">دولار</option><option value="LBP">ليرة</option></select></label>
          <label className="space-y-1 text-sm">مدة التسليم (أيام)<input name="days" inputMode="numeric" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-3">الضمان<input name="warranty" maxLength={500} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-3">ملاحظات<input name="note" maxLength={1000} className={`${fld} w-full`} /></label>
          <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground sm:col-span-3">تسجيل العرض</button></form>}
      </section>}
      {opened && <section className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold text-primary">مقارنة العروض</h2>
        {bids.data.length === 0 ? <p className="text-sm text-muted-foreground">لم يُستلم أي عرض.</p> : <>
          {cur && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">العروض بعملات مختلفة وغير قابلة للمقارنة المباشرة؛ لم يُرتَّب بينها.</p>}
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2">العارض</th><th className="p-2">السعر</th><th className="p-2">التسليم</th><th className="p-2">الضمان</th><th className="p-2">المطابقة الفنية</th></tr></thead>
            <tbody>{bids.data.map((b) => (<tr key={b.id} className="border-b align-top"><td className="p-2 font-semibold">{name(b.supplier_id)}</td><td className="p-2">{money(b.total_value, b.currency)}</td><td className="p-2">{b.delivery_days !== null ? `${b.delivery_days} يوم` : "—"}</td><td className="p-2">{b.warranty_note ?? "—"}</td>
              <td className="p-2"><form action={evaluateBid} className="space-y-1"><input type="hidden" name="bid" value={b.id} /><input type="hidden" name="item" value={id} />
                <select name="compliant" defaultValue={b.technical_compliant === null ? "" : b.technical_compliant ? "yes" : "no"} required className={`${fld} w-full`}><option value="" disabled>لم يُقيَّم</option><option value="yes">مطابق</option><option value="no">غير مطابق</option></select>
                <input name="note" defaultValue={b.evaluation_note ?? ""} placeholder="ملاحظة" maxLength={1000} className={`${fld} w-full`} /><button className="min-h-10 rounded-xl border px-3 text-sm font-semibold active:bg-muted">حفظ التقييم</button></form></td></tr>))}</tbody></table></div>
          <p className="text-sm text-muted-foreground">الترتيب بالسعر للاستئناس فقط. اختيار العرض الفائز واعتماد نتيجة التقييم من اختصاص اللجنة المختصة؛ لا يتخذهما النظام ولا الذكاء الاصطناعي.</p></>}
      </section>}
    </main></>
  );
}
