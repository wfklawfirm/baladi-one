import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { curName, money } from "@/lib/finance";
import { commitmentChain, hasFn, liquidationNet, liquidationRemaining, METHODS, newKey, nextAction, orderNet, orderRemaining, paymentNet, reconState, sodBlocked } from "@/lib/expenditure";
import { Panel } from "@/components/finance/Parts";
import { Extra } from "@/components/finance/simple";
import { Empty, Explain, Intro } from "@/components/simple/kit";
import { btn, btnSm, ExpFlash, ExpNav, field, Flag, lbl, MoneyFields, NotActive, StageStrip } from "@/components/finance/expenditure/Parts";
import { loadExp, nameOf } from "../data";
import { liquidate, order, pay, reconcile, reverse } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "تفاصيل دورة الإنفاق — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export default async function Chain({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb, user, memberships } = await requireStaff();
  const sp = await searchParams;
  const d = await loadExp(sb);
  if (d.state !== "ok") return <><StaffHeader back="/staff/finance/expenditure" backLabel="دورة الإنفاق" /><main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><ExpNav current="main" /><NotActive detail={d.detail} /></main></>;
  const priv = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  if (!priv && !d.assignments.some((a) => a.user_id === user.id && a.active)) redirect("/staff");
  const c = d.commits.find((x) => x.id === id && x.entry_kind === "commitment");
  if (!c) notFound();
  const line = d.lines.find((l) => l.id === c.line_id);
  const cur = line?.currency ?? "LBP";
  const ch = commitmentChain(c, d.commits, d.liqs, d.orders, d.pays);
  const liqs = d.liqs.filter((x) => x.commitment_id === id), orders = d.orders.filter((x) => x.commitment_id === id), pays = d.pays.filter((x) => x.commitment_id === id);
  const origLiqs = liqs.filter((x) => x.entry_kind === "liquidation"), origOrders = orders.filter((x) => x.entry_kind === "order"), origPays = pays.filter((x) => x.entry_kind === "payment");
  const sodIds = d.sods.filter((s) => s.user_id === user.id && s.line_id === c.line_id && (s.commitment_id === null || s.commitment_id === id));
  const hasSod = sodIds.length > 0;
  const can = (fn: "commit" | "liquidate" | "order" | "pay" | "reconcile") => hasFn(d.assignments, user.id, fn);
  const back = <input type="hidden" name="back" value={`/staff/finance/expenditure/${id}`} />;
  const who = (a: string | null) => nameOf(d.people, a);
  const stage = ch.paid > 0 ? 5 : ch.ordered > 0 ? 4 : ch.liquidated > 0 ? 3 : 2;
  const openLiqs = origLiqs.filter((l) => liquidationRemaining(l, liqs, orders) > 0);
  const openOrders = origOrders.filter((o) => orderRemaining(o, orders, pays) > 0);
  const Rev = ({ kind, rid, max }: { kind: string; rid: string; max: number }) => (
    <details className="mt-1"><summary className={`${btnSm} inline-flex cursor-pointer list-none items-center`}>إلغاء أو تصحيح</summary>
      <form action={reverse} className="mt-2 grid gap-2 sm:grid-cols-3">{back}<input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={rid} /><input type="hidden" name="key" value={newKey()} />
        <label className={lbl}>المبلغ المراد إلغاؤه (اتركوه فارغًا لإلغاء الكل، الحد {money(max, cur)})<input name="amount" inputMode="decimal" className={field} /></label>
        <label className={`${lbl} sm:col-span-2`}>سبب الإلغاء (إلزامي)<input name="reason" required maxLength={500} className={field} /></label>
        <button className={`${btn} sm:col-span-3`}>سجّل الإلغاء</button>
        <p className="text-xs text-muted-foreground sm:col-span-3">لا يُحذف السجل الأصلي ولا يُعدَّل؛ يُضاف قيد يُلغي أثره ويبقى كل شيء ظاهرًا للمراجعة.</p></form></details>);

  return (
    <><StaffHeader back="/staff/finance/expenditure" backLabel="دورة الإنفاق" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <ExpNav current="main" />
      <div className="space-y-2"><Intro title={`${c.commitment_no ?? "مبلغ محجوز"} — ${c.description}`}>هذه صفحة متابعة مبلغ حُجز لغرض معيّن. تمرّ العملية بثلاث خطوات: التحقق من الاستلام، ثم أمر الصرف، ثم الدفع. الصفحة تبيّن الخطوة التالية المطلوبة.</Intro>
        <p className="text-sm leading-6 text-muted-foreground">{line ? `${line.code} · ${line.title_ar} (${curName(cur)})` : ""} · أنشأه {who(c.actor)} · مستند الالتزام: {c.basis_ref ?? "—"}{c.doc_currency && c.doc_currency !== cur && <> · بعملة المستند {c.doc_currency}، سعر {String(c.exchange_rate)} ({c.rate_source ?? "بلا مصدر"})</>}</p></div>
      <StageStrip done={stage} />
      <ExpFlash ok={sp.ok} err={sp.err} />
      <section className="elev fill-odd grid gap-3 rounded-2xl border bg-background p-4 text-base sm:grid-cols-3 lg:grid-cols-6">
        <span>المبلغ المحجوز <b className="block text-lg">{money(ch.net, cur)}</b></span><span>تم التحقق من استلامه <b className="block text-lg">{money(ch.liquidated, cur)}</b></span><span>صدر أمر بدفعه <b className="block text-lg">{money(ch.ordered, cur)}</b></span>
        <span>تم دفعه <b className="block text-lg">{money(ch.paid, cur)}</b></span><span>المتبقي من المحجوز <b className="block text-lg text-primary">{money(ch.balance, cur)}</b></span><span>يمكن إلغاؤه <b className="block text-lg">{money(ch.reversible, cur)}</b></span>
        <p className="rounded-xl bg-accent p-3 text-base sm:col-span-3 lg:col-span-6"><b>الخطوة التالية: </b>{nextAction(ch)}</p>
      </section>

      <div className="fill-odd grid gap-4 lg:grid-cols-2">
        <Panel title="الخطوة 1: التحقق من الاستلام (التصفية)" sub="قبل أي دفع يجب إثبات أن السلعة أو الخدمة وصلت فعلًا: فاتورة ومستند استلام. يمكن التحقق على دفعات.">
          <div className="mb-3"><Explain term="التصفية">التصفية هي التأكد من أن ما اشتريناه وصل فعلًا والفاتورة صحيحة، قبل السماح بدفع ثمنه.</Explain></div>
          {liqs.length === 0 ? <div className="mb-3"><Empty>لم يُتحقق من أي استلام بعد. ابدأوا بالنموذج أدناه.</Empty></div> : <ul className="mb-3 divide-y text-sm">{liqs.map((l) => (
            <li key={l.id} className="py-2"><b className={Number(l.amount) < 0 ? "text-destructive" : ""}>{money(Number(l.amount), cur)}</b> · {l.liquidation_no}{l.entry_kind === "reversal" ? <> <Flag>ملغى بقيد عكسي</Flag> {l.reason}</> : <> · فاتورة {l.invoice_no} ({l.invoice_date}) · مستند: {l.evidence_ref} · تسليم/قبول: {l.delivery_ref} · {who(l.actor)}{l.entry_kind === "liquidation" && liquidationRemaining(l, liqs, orders) > 0 && can("liquidate") && <Rev kind="liquidation" rid={l.id} max={liquidationRemaining(l, liqs, orders)} />}</>}</li>))}</ul>}
          {can("liquidate") ? (ch.toLiquidate > 0 ? <form action={liquidate} className="grid gap-3">{back}<input type="hidden" name="key" value={newKey()} /><input type="hidden" name="commitment" value={id} />
            {sodBlocked(c.actor, user.id, hasSod) && <p className="rounded-xl border-2 border-destructive/40 p-3 text-sm leading-6">أنتم من أنشأ هذا الحجز، ولا يجوز أن تتحققوا منه بأنفسكم (يجب أن يقوم بذلك شخص آخر) إلا باستثناء موثَّق.</p>}
            <MoneyFields /><div className="grid gap-3 sm:grid-cols-2"><label className={lbl}>رقم الفاتورة أو الإيصال<input name="invoice_no" required maxLength={100} className={field} /></label><label className={lbl}>تاريخ الفاتورة<input name="invoice_date" type="date" required defaultValue={today()} className={field} /></label></div>
            <label className={lbl}>رقم أو اسم ملف المستند<input name="evidence_ref" required maxLength={500} className={field} /></label>
            <label className={lbl}>ما يثبت الاستلام<span className="block text-sm font-normal text-muted-foreground">رقم محضر الاستلام أو إيصال التسليم</span><input name="delivery_ref" required maxLength={500} className={field} /></label>
            <Extra><label className={lbl}>تاريخ التسليم<input name="delivered_on" type="date" className={field} /></label>
            <label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label></Extra>
            <button className={btn}>سجّل التحقق من الاستلام</button></form> : <p className="text-base text-muted-foreground">تم التحقق من كل المبلغ المحجوز؛ لا شيء متبقٍ في هذه الخطوة.</p>) : <p className="text-base text-muted-foreground">هذه الخطوة ليست من صلاحياتكم؛ يقوم بها الموظف المكلَّف بالتحقق من الاستلام.</p>}
        </Panel>

        <Panel title="الخطوة 2: أمر الصرف" sub="بعد التحقق من الاستلام يصدر أمر بدفع مبلغ لمستفيد محدد، ولا يزيد عمّا تم التحقق منه.">
          <div className="mb-3"><Explain term="أمر الصرف">وثيقة رسمية تأمر الصندوق بدفع مبلغ معيّن لشخص أو شركة معيّنة.</Explain></div>
          {orders.length === 0 ? <div className="mb-3"><Empty>لا توجد أوامر صرف بعد.</Empty></div> : <ul className="mb-3 divide-y text-sm">{orders.map((o) => (
            <li key={o.id} className="py-2"><b className={Number(o.amount) < 0 ? "text-destructive" : ""}>{money(Number(o.amount), cur)}</b> · {o.order_no} · {o.order_date} · {o.beneficiary} {o.is_exceptional && <Flag>مسار استثنائي</Flag>}{o.entry_kind === "reversal" ? <> <Flag>ملغى بقيد عكسي</Flag> {o.reason}</> : <> · {who(o.actor)}{orderRemaining(o, orders, pays) > 0 && can("order") && <Rev kind="order" rid={o.id} max={orderRemaining(o, orders, pays)} />}</>}</li>))}</ul>}
          {can("order") ? (openLiqs.length ? <form action={order} className="grid gap-3">{back}<input type="hidden" name="key" value={newKey()} />
            <label className={lbl}>التحقق من الاستلام المراد الصرف عليه<select name="liquidation" required className={field}>{openLiqs.map((l) => <option key={l.id} value={l.id}>{l.liquidation_no} — متبقٍ {money(liquidationRemaining(l, liqs, orders), cur)} (فاتورة {l.invoice_no})</option>)}</select></label>
            <MoneyFields /><label className={lbl}>المستفيد<input name="beneficiary" required maxLength={200} className={field} /></label>
            <Extra><label className={lbl}>تاريخ الأمر<input name="order_date" type="date" defaultValue={today()} className={field} /></label>
            <label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label></Extra>
            <button className={btn}>أصدر أمر الصرف</button></form> : <p className="text-base text-muted-foreground">لا يوجد ما يمكن إصدار أمر عليه الآن. سجّلوا أولًا التحقق من الاستلام (الخطوة 1).</p>) : <p className="text-base text-muted-foreground">هذه الخطوة ليست من صلاحياتكم؛ يقوم بها الموظف المكلَّف بإصدار أوامر الصرف.</p>}
        </Panel>
      </div>

      <Panel title="الخطوة 3: الدفع ومطابقته مع كشف الحساب" sub="لا دفع بلا أمر صرف. اكتبوا ما يثبت الدفع (رقم الشيك أو الحوالة أو الإيصال) ولا يُقبل تكراره. يمكن الدفع على دفعات.">
        {pays.length === 0 ? <div className="mb-3"><Empty>لا توجد دفعات بعد.</Empty></div> : <ul className="mb-3 divide-y text-sm">{pays.map((p) => { const rs = p.entry_kind === "payment" ? reconState(p.id, d.recs) : null; return (
          <li key={p.id} className="space-y-1 py-2"><b className={Number(p.amount) < 0 ? "text-destructive" : ""}>{money(Number(p.amount), cur)}</b> · {p.payment_no ?? "قديمة"} · {p.paid_on} · {p.beneficiary}{p.payment_method && <> · {METHODS[p.payment_method]}</>}{p.proof_ref && <> · إثبات: {p.proof_ref}</>} {p.exception_id && <Flag>مسار استثنائي</Flag>}
            {p.entry_kind === "reversal" ? <> <Flag>ملغى بقيد عكسي</Flag> {p.reason}</> : <> · {who(p.actor)} · {rs === "matched" ? <Flag tone="ok">✓ مطابِقة للكشف</Flag> : rs === "discrepancy" ? <Flag>! فرق عن الكشف</Flag> : <Flag tone="info">لم تُطابَق بعد</Flag>}
              {p.cycle_entry && paymentNet(p, pays) > 0 && can("pay") && <Rev kind="payment" rid={p.id} max={paymentNet(p, pays)} />}
              {p.cycle_entry && paymentNet(p, pays) > 0 && can("reconcile") && <details className="mt-1"><summary className={`${btnSm} inline-flex cursor-pointer list-none items-center`}>طابِقها مع كشف الحساب</summary>
                <form action={reconcile} className="mt-2 grid gap-2 sm:grid-cols-2">{back}<input type="hidden" name="payment" value={p.id} />
                  <label className={lbl}>رقم كشف الحساب<input name="statement_ref" required className={field} /></label><label className={lbl}>تاريخ كشف الحساب<input name="statement_date" type="date" required defaultValue={today()} className={field} /></label>
                  <label className={lbl}>المبلغ الظاهر في الكشف<input name="amount" inputMode="decimal" required className={field} /></label><label className={lbl}>عملة الكشف<select name="doc_currency" defaultValue={p.doc_currency ?? cur} className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
                  <label className={`${lbl} sm:col-span-2`}>ملاحظة (إلزامية إذا وُجد فرق)<input name="note" maxLength={1000} className={field} /></label><button className={`${btn} sm:col-span-2`}>سجّل المطابقة</button></form></details>}</>}</li>); })}</ul>}
        {can("pay") ? (openOrders.length ? <form action={pay} className="grid gap-3 sm:grid-cols-2">{back}<input type="hidden" name="key" value={newKey()} />
          <label className={`${lbl} sm:col-span-2`}>أمر الصرف المراد الدفع عليه<select name="order" required className={field}>{openOrders.map((o) => <option key={o.id} value={o.id}>{o.order_no} — {o.beneficiary} — متبقٍ {money(orderRemaining(o, orders, pays), cur)}</option>)}</select></label>
          <div className="space-y-3 sm:col-span-2"><MoneyFields label="المبلغ المدفوع بعملة الدفع" /></div>
          <label className={lbl}>كيف دُفع المبلغ؟<select name="method" required className={field}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={lbl}>تاريخ الدفع<input name="paid_on" type="date" required defaultValue={today()} className={field} /></label>
          <label className={`${lbl} sm:col-span-2`}>ما يثبت الدفع<span className="block text-sm font-normal text-muted-foreground">رقم الشيك أو مرجع الحوالة أو رقم الإيصال</span><input name="proof_ref" required maxLength={200} className={field} /></label>
          <div className="sm:col-span-2"><Extra><label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label></Extra></div>
          <button className={`${btn} sm:col-span-2`}>سجّل الدفعة</button></form> : <p className="text-base text-muted-foreground">لا يوجد أمر صرف مفتوح للدفع. أصدروا أمر صرف أولًا (الخطوة 2).</p>) : <p className="text-base text-muted-foreground">هذه الخطوة ليست من صلاحياتكم؛ يقوم بها الموظف المكلَّف بالدفع.</p>}
      </Panel>

      {can("commit") && ch.reversible > 0 && <Panel title="إلغاء الحجز" sub="يُفرَج فقط عن الجزء غير المستعمل. ما تم التحقق منه أو صدر أمر بدفعه أو دُفع يجب إلغاؤه أولًا."><Rev kind="commitment" rid={id} max={ch.reversible} /></Panel>}
      <p className="text-xs text-muted-foreground"><Link href="/staff/finance/expenditure" className="underline">← كل المبالغ المحجوزة</Link> · السجلات المعتمدة لا تُعدَّل ولا تُحذف؛ يُصحَّح الخطأ بإضافة قيد إلغاء.</p>
    </main></>
  );
}
