import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { arrears, money, NA, receivableState } from "@/lib/finance";
import { loadFinance } from "@/lib/financeData";
import { parsePeriod } from "@/lib/ops";
import { btn, field, Flash, FinanceNav, Panel } from "@/components/finance/Parts";
import { addReceivable, settleReceivable } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "المستحقات — BALADI ONE", referrer: "no-referrer" as const };
const STATUS: Record<string, string> = { open: "مفتوح", settled: "مسدَّد", cancelled: "ملغى" };

export default async function Receivables({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const d = await loadFinance(sb, parsePeriod("year", undefined, undefined));
  const back = <input type="hidden" name="back" value="/staff/finance/receivables" />;
  const recvs = d.error ? [] : d.recvs;
  const arr = d.error ? [] : arrears(d.recvs, d.linked, d.today);
  const rows = recvs.map((r) => ({ r, ...receivableState(r, d.error ? [] : d.linked) }));
  const open = rows.filter((x) => x.r.status === "open");

  return (
    <><StaffHeader back="/staff/finance" backLabel="المالية" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <FinanceNav current="receivables" />
      <h1 className="text-2xl font-bold">المستحقات والتحصيل</h1>
      <Flash ok={sp.ok} err={sp.err} />
      {d.error && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">{NA}: وحدة المالية غير مفعّلة بعد في قاعدة البيانات.</p>}
      {arr.length > 0 && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">متأخرات: {arr.map((a) => `${a.count} مستحق بقيمة ${money(a.total, a.currency)}`).join(" · ")}</p>}

      <div className="fill-odd grid gap-4 md:grid-cols-2">
        <Panel title="إضافة مستحق" sub="مرجع المكلّف رمز (رقم ملف أو معاملة) فقط: لا أسماء ولا أرقام هواتف.">
          <form action={addReceivable} className="grid gap-3 sm:grid-cols-2">{back}
            <label className="space-y-1 text-sm font-medium sm:col-span-2">نوع الرسم<input name="fee_type" required maxLength={200} placeholder="مثال: رسم رخصة بناء" className={field} /></label>
            <label className="space-y-1 text-sm font-medium">المبلغ<input name="amount" inputMode="decimal" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">العملة<select name="currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
            <label className="space-y-1 text-sm font-medium">تاريخ الاستحقاق<input name="due_on" type="date" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">مرجع المكلّف (رمز)<input name="payer_ref" maxLength={60} dir="ltr" className={field} /></label>
            <button className={`${btn} sm:col-span-2`}>إضافة</button>
          </form>
        </Panel>
        <Panel title="تسديد مستحق" sub="يُنشئ إيصال تحصيل مرتبطًا بالمستحق بعملته؛ التسديد الجزئي مسموح ولا يتجاوز المتبقي.">
          <form action={settleReceivable} className="grid gap-3">{back}
            <label className="space-y-1 text-sm font-medium">المستحق<select name="receivable" required className={field}>{open.map(({ r, remaining }) => <option key={r.id} value={r.id}>{r.fee_type}{r.payer_ref ? ` · ${r.payer_ref}` : ""} — متبقٍ {money(remaining, r.currency)}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium">المبلغ المحصّل<input name="amount" inputMode="decimal" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">طريقة الدفع<select name="method" className={field}><option value="cash">نقدًا</option><option value="transfer">حوالة</option><option value="cheque">شيك</option></select></label>
            <label className="space-y-1 text-sm font-medium">رقم الإيصال<input name="receipt" maxLength={60} className={field} /></label>
            <button className={btn} disabled={open.length === 0}>تسجيل التحصيل</button>
          </form>
        </Panel>
      </div>

      <Panel title="سجل المستحقات">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا مستحقات مسجّلة بعد.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>الرسم</th><th>المرجع</th><th>الاستحقاق</th><th>المبلغ</th><th>المحصّل</th><th>المتبقي</th><th>الحالة</th></tr></thead>
            <tbody className="divide-y">{rows.slice(0, 100).map(({ r, amount, collected, remaining }) => { const late = r.status === "open" && remaining > 0 && r.due_on < d.today!;
              return <tr key={r.id} className="[&>td]:px-2 [&>td]:py-2.5"><td className="font-medium">{r.fee_type}</td><td dir="ltr" className="text-start font-mono text-xs">{r.payer_ref ?? "—"}</td><td className={late ? "font-bold text-destructive" : ""}>{r.due_on}{late && " (متأخر)"}</td><td>{money(amount, r.currency)}</td><td>{money(collected, r.currency)}</td><td>{money(remaining, r.currency)}</td><td>{STATUS[r.status] ?? r.status}</td></tr>; })}</tbody></table></div>
        )}
      </Panel>
    </main></>
  );
}
