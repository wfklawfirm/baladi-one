import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { loadRevenue } from "@/lib/revenueData";
import { NA, reconcileDay, type EntryRow } from "@/lib/revenue";
import { money } from "@/lib/finance";
import { dayKey } from "@/lib/ops";
import { btn, field, Flash, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";
import { closeCash } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "مطابقة الصندوق — BALADI ONE", referrer: "no-referrer" as const };

export default async function Cash({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; date?: string }> }) {
  const { sb, user } = await requireStaff();
  const sp = await searchParams;
  const today = dayKey(new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! <= today ? sp.date! : today;
  const d = await loadRevenue(sb);
  let entries: EntryRow[] = [], entriesErr = false;
  if (!d.error) {
    const from = new Date(`${date}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(`${date}T00:00:00Z`); to.setUTCDate(to.getUTCDate() + 2);
    const r = await sb.from("collection_entry").select("id,amount,currency,method,created_at,receipt_no").gte("created_at", from.toISOString()).lte("created_at", to.toISOString()).limit(5000);
    if (r.error) entriesErr = true; else entries = (r.data ?? []) as EntryRow[];
  }
  const rec = d.error ? [] : reconcileDay(date, d.receipts, entries, d.closes);
  const back = <input type="hidden" name="back" value="/staff/revenue/cash" />;
  return (
    <><StaffHeader back="/staff/revenue" backLabel="الإيرادات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <h1 className="text-2xl font-bold">مطابقة الصندوق اليومية</h1>
      <RevenueNav current="cash" />
      <Flash ok={sp.ok} err={sp.err} />
      {d.error ? <Pending missing={d.missing} /> : <>
        <form className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm font-medium">اليوم<input name="date" type="date" defaultValue={date} max={today} className={field} /></label><button className="min-h-12 rounded-xl border-2 border-primary px-5 font-bold text-primary">عرض</button></form>
        {entriesErr && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تعذّر تحميل قيود دفتر التحصيل: {NA} للمقارنة مع الدفتر.</p>}
        <Panel title={`مجاميع ${date}`} sub="إيصالات الإيرادات الصادرة مقابل دفتر التحصيل العام (صافي العكس). قيود الدفتر غير المسندة إلى إيصال إيرادات (تحصيل قديم/يدوي) تُعرض للمراجعة.">
          {rec.length === 0 ? <p className="text-sm text-muted-foreground">لا حركة في هذا اليوم.</p> : <div className="grid gap-3 md:grid-cols-2">{rec.map((x) => (
            <div key={x.currency} className="rounded-xl border p-3 text-sm"><b>{x.currency === "USD" ? "دولار" : "ليرة"}</b>
              <div>إيصالات صادرة: {x.receipts} — {money(x.receiptTotal, x.currency)}</div>
              <div className="text-muted-foreground">نقدًا {money(x.cash, x.currency)} · حوالة {money(x.transfer, x.currency)} · شيك {money(x.cheque, x.currency)}</div>
              <div>دفتر التحصيل (صافٍ): {entriesErr ? NA : money(x.ledgerTotal, x.currency)}</div>
              {!entriesErr && x.ledgerGap !== 0 && <div className="font-bold text-destructive">فرق الدفتر عن الإيصالات: {money(x.ledgerGap, x.currency)} ({x.legacyCount} قيد غير مسند إلى إيصال إيرادات)</div>}
              {x.closes > 0 && <div className="mt-1 border-t pt-1">أُقفل: المعدود {money(x.counted, x.currency)} · الفرق {money(x.difference, x.currency)}{x.driftAfterClose !== null && x.driftAfterClose !== 0 && <span className="block font-bold text-destructive">تغيّر النقد المسجَّل بعد الإقفال بمقدار {money(x.driftAfterClose, x.currency)} (عكس إيصال؟)</span>}</div>}
            </div>))}</div>}
        </Panel>
        <Panel fold title="إقفال صندوقي لهذا اليوم" sub="يُقارن النقد المعدود بإيصالاتك النقدية الصادرة في اليوم؛ عند وجود فرق تُطلب ملاحظة. الإقفال لا يُعدَّل.">
          <form action={closeCash} className="grid gap-3 sm:grid-cols-2">{back}<input type="hidden" name="date" value={date} />
            <label className="space-y-1 text-sm font-medium">العملة<select name="currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
            <label className="space-y-1 text-sm font-medium">النقد المعدود فعليًا<input name="counted" inputMode="decimal" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">ملاحظة (إلزامية عند وجود فرق)<input name="note" maxLength={500} className={field} /></label>
            <button className={`${btn} sm:col-span-2`}>إقفال الصندوق</button></form></Panel>
        <Panel title="عمليات الإقفال السابقة">
          {d.closes.length === 0 ? <p className="text-sm text-muted-foreground">لا إقفالات.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>اليوم</th><th>العملة</th><th>المسجَّل</th><th>المعدود</th><th>الفرق</th><th>إيصالات</th><th></th></tr></thead>
            <tbody className="divide-y">{d.closes.slice(0, 60).map((c, i) => <tr key={i} className="[&>td]:px-2 [&>td]:py-2.5"><td>{c.business_date}</td><td>{c.currency}</td><td>{money(Number(c.recorded_amount), c.currency)}</td><td>{money(Number(c.counted_amount), c.currency)}</td><td className={Number(c.difference) !== 0 ? "font-bold text-destructive" : ""}>{money(Number(c.difference), c.currency)}</td><td>{c.receipt_count}</td><td className="text-xs">{c.cashier === user.id ? "أنا" : ""}</td></tr>)}</tbody></table></div>}
        </Panel>
      </>}
    </main></>
  );
}
