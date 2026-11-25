import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Intro } from "@/components/simple/kit";
import { loadRevenue } from "@/lib/revenueData";
import { OBJ_STATUS, ORDER_STATUS, orderState } from "@/lib/revenue";
import { money } from "@/lib/finance";
import { dayKey } from "@/lib/ops";
import { btnSm, field, Flash, LegalNote, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";
import { cancelOrder, fileObjection, notifyOrder, resolveObjection } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "أوامر القبض — BALADI ONE", referrer: "no-referrer" as const };

export default async function Orders({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const admin = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const sp = await searchParams;
  const d = await loadRevenue(sb);
  const today = dayKey(new Date());
  const back = <input type="hidden" name="back" value="/staff/revenue/orders" />;
  return (
    <><StaffHeader back="/staff/revenue" backLabel="الإيرادات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Intro title="أوامر القبض">أمر القبض هو الطلب الرسمي للدفع. بعد إصداره سجّلوا تبليغ المكلّف به، وإن اعترض سجّلوا اعتراضه وقرار البتّ فيه.</Intro>
      <RevenueNav current="orders" />
      <Flash ok={sp.ok} err={sp.err} />
      <LegalNote />
      {d.error ? <Pending missing={d.missing} /> : <>
        <p className="text-xs text-muted-foreground">لا تُحتسب هنا مهلة اعتراض ولا أثر قانوني للتبليغ: تُسجَّل الوقائع فقط (التاريخ، الطريقة، الإثبات). الاعتراض المفتوح يوقف التحصيل. تصحيح المبلغ يتم بقبول الاعتراض فقط وبسجل قبل/بعد.</p>
        {d.orders.length === 0 ? <p className="text-sm text-muted-foreground">لا أوامر قبض. أصدرها من صفحة التكليف.</p> : (
          <ul className="space-y-3">{d.orders.slice(0, 100).map((o) => {
            const st = orderState(o, d.receipts, today); const a = d.assessments.find((x) => x.id === o.assessment_id); const t = d.taxpayers.find((x) => x.id === a?.taxpayer_id);
            const objs = d.objections.filter((x) => x.order_id === o.id); const open = objs.find((x) => x.status === "filed");
            return (
              <li key={o.id} className="elev rounded-2xl border bg-background p-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><b className="text-primary">{o.order_no}</b><span>{a?.fee_type}</span><span dir="ltr" className="font-mono text-xs">{t?.taxpayer_ref}</span><span className="rounded-full border px-2 text-xs">{ORDER_STATUS[o.status] ?? o.status}</span>{st.overdue && <span className="text-xs font-bold text-destructive">متأخر {st.overdueDays} يومًا</span>}</div>
                <div className="mt-1">المبلغ {money(st.amount, o.currency)} · المحصَّل {money(st.collected, o.currency)}{st.partial && " (جزئي)"} · المتبقي {money(st.remaining, o.currency)} · الاستحقاق {o.due_on}</div>
                <div className="mt-1 text-xs text-muted-foreground">{o.notified_on ? `بُلِّغ في ${o.notified_on} — ${o.notification_method} — ${o.notification_proof}` : "لم يُبلَّغ بعد"}</div>
                {objs.length > 0 && <ul className="mt-2 space-y-1 rounded-xl bg-muted/40 p-2 text-xs">{objs.map((x) => <li key={x.id}>اعتراض {x.filed_on}: {x.grounds_ar} — <b>{OBJ_STATUS[x.status]}</b>{x.resolved_on && ` (${x.resolved_on}: ${x.resolution_note}${x.amount_after !== null && x.amount_before !== null && Number(x.amount_after) !== Number(x.amount_before) ? ` — ${Number(x.amount_before).toLocaleString("en-US")} ← ${Number(x.amount_after).toLocaleString("en-US")}` : ""})`}</li>)}</ul>}
                {admin && o.status !== "cancelled" && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <form action={notifyOrder} className="grid gap-2 sm:grid-cols-2">{back}<input type="hidden" name="id" value={o.id} />
                      <label className="block space-y-1 text-sm font-semibold"><span>تاريخ التبليغ</span><input name="date" type="date" required max={today} className={field} aria-label="تاريخ التبليغ" /></label><label className="block space-y-1 text-sm font-semibold"><span>طريقة التبليغ</span><input name="method" required maxLength={100} className={field} /></label>
                      <label className="block space-y-1 text-sm font-semibold sm:col-span-2"><span>إثبات التبليغ (رقم/مرجع)</span><input name="proof" required maxLength={300} className={`${field}`} /></label><button className={`${btnSm} sm:col-span-2`}>سجّل التبليغ</button></form>
                    {open ? (
                      <form action={resolveObjection} className="grid gap-2 sm:grid-cols-2">{back}<input type="hidden" name="id" value={open.id} />
                        <label className="block space-y-1 text-sm font-semibold"><span>نتيجة البتّ</span><select name="outcome" className={field}><option value="accepted">قبول (مع تصحيح المبلغ)</option><option value="rejected">رفض</option><option value="withdrawn">سحب</option></select></label>
                        <label className="block space-y-1 text-sm font-semibold"><span>المبلغ المصحَّح عند القبول</span><input name="corrected" inputMode="decimal" className={field} /></label>
                        <label className="block space-y-1 text-sm font-semibold sm:col-span-2"><span>أسباب البتّ</span><input name="note" required minLength={5} maxLength={1000} className={`${field}`} /></label><button className={`${btnSm} sm:col-span-2`}>البتّ بالاعتراض</button></form>
                    ) : (
                      <form action={fileObjection} className="grid gap-2 sm:grid-cols-2">{back}<input type="hidden" name="id" value={o.id} />
                        <label className="block space-y-1 text-sm font-semibold"><span>تاريخ الاعتراض</span><input name="date" type="date" required max={today} className={field} aria-label="تاريخ الاعتراض" /></label><label className="block space-y-1 text-sm font-semibold"><span>أسباب الاعتراض</span><input name="grounds" required minLength={5} maxLength={2000} className={field} /></label><button className={`${btnSm} sm:col-span-2`}>تسجيل اعتراض</button></form>
                    )}
                    {st.collected === 0 && <form action={cancelOrder} className="flex gap-2 lg:col-span-2">{back}<input type="hidden" name="id" value={o.id} /><label className="block space-y-1 text-sm font-semibold"><span>سبب إلغاء الأمر</span><input name="reason" required minLength={5} maxLength={500} className={field} /></label><button className={btnSm}>إلغاء الأمر</button></form>}
                  </div>)}
              </li>); })}</ul>)}
      </>}
    </main></>
  );
}
