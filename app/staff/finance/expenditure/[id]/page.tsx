import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { curName, money } from "@/lib/finance";
import { commitmentChain, hasFn, liquidationNet, liquidationRemaining, METHODS, newKey, nextAction, orderNet, orderRemaining, paymentNet, reconState, sodBlocked } from "@/lib/expenditure";
import { Panel } from "@/components/finance/Parts";
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
    <details className="mt-1"><summary className={`${btnSm} inline-flex cursor-pointer list-none items-center`}>عكس / تصحيح</summary>
      <form action={reverse} className="mt-2 grid gap-2 sm:grid-cols-3">{back}<input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={rid} /><input type="hidden" name="key" value={newKey()} />
        <label className={lbl}>المبلغ المعكوس (فارغ = الكل، الحد {money(max, cur)})<input name="amount" inputMode="decimal" className={field} /></label>
        <label className={`${lbl} sm:col-span-2`}>سبب العكس (إلزامي)<input name="reason" required maxLength={500} className={field} /></label>
        <button className={`${btn} sm:col-span-3`}>تسجيل قيد العكس</button>
        <p className="text-xs text-muted-foreground sm:col-span-3">لا يُعدَّل السجل الأصلي ولا يُحذف؛ يُضاف قيد عكسي ويبقى الأثر في السجل.</p></form></details>);

  return (
    <><StaffHeader back="/staff/finance/expenditure" backLabel="دورة الإنفاق" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <ExpNav current="main" />
      <div><h1 className="text-2xl font-bold">{c.commitment_no ?? "التزام"} — {c.description}</h1>
        <p className="text-xs text-muted-foreground">{line ? `${line.code} · ${line.title_ar} (${curName(cur)})` : ""} · أنشأه {who(c.actor)} · مستند الالتزام: {c.basis_ref ?? "—"}{c.doc_currency && c.doc_currency !== cur && <> · بعملة المستند {c.doc_currency}، سعر {String(c.exchange_rate)} ({c.rate_source ?? "بلا مصدر"})</>}</p></div>
      <StageStrip done={stage} />
      <ExpFlash ok={sp.ok} err={sp.err} />
      <section className="elev fill-odd grid gap-2 rounded-2xl border bg-background p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <span>صافي الالتزام <b>{money(ch.net, cur)}</b></span><span>مصفّى <b>{money(ch.liquidated, cur)}</b></span><span>مأمور بصرفه <b>{money(ch.ordered, cur)}</b></span>
        <span>مدفوع <b>{money(ch.paid, cur)}</b></span><span>رصيد الالتزام <b className="text-primary">{money(ch.balance, cur)}</b></span><span>قابل للعكس <b>{money(ch.reversible, cur)}</b></span>
        <p className="sm:col-span-3 lg:col-span-6"><b>الإجراء التالي:</b> {nextAction(ch)}</p>
      </section>

      <div className="fill-odd grid gap-4 lg:grid-cols-2">
        <Panel title="التصفية (فاتورة/إيصال + إثبات تسليم أو قبول)" sub="مرحلة إلزامية قبل أمر الصرف. يجوز تصفية جزئية على دفعات.">
          {liqs.length === 0 ? <p className="text-sm text-muted-foreground">لا تصفية بعد.</p> : <ul className="mb-3 divide-y text-sm">{liqs.map((l) => (
            <li key={l.id} className="py-2"><b className={Number(l.amount) < 0 ? "text-destructive" : ""}>{money(Number(l.amount), cur)}</b> · {l.liquidation_no}{l.entry_kind === "reversal" ? <> <Flag>قيد عكس</Flag> {l.reason}</> : <> · فاتورة {l.invoice_no} ({l.invoice_date}) · مستند: {l.evidence_ref} · تسليم/قبول: {l.delivery_ref} · {who(l.actor)}{l.entry_kind === "liquidation" && liquidationRemaining(l, liqs, orders) > 0 && can("liquidate") && <Rev kind="liquidation" rid={l.id} max={liquidationRemaining(l, liqs, orders)} />}</>}</li>))}</ul>}
          {can("liquidate") ? (ch.toLiquidate > 0 ? <form action={liquidate} className="grid gap-3">{back}<input type="hidden" name="key" value={newKey()} /><input type="hidden" name="commitment" value={id} />
            {sodBlocked(c.actor, user.id, hasSod) && <p className="rounded-lg border border-destructive/40 p-2 text-xs">أنت منشئ الالتزام: لا يجوز أن تصفّيه (فصل المهام) إلا باستثناء موثَّق.</p>}
            <MoneyFields /><div className="grid gap-3 sm:grid-cols-2"><label className={lbl}>رقم الفاتورة/الإيصال<input name="invoice_no" required maxLength={100} className={field} /></label><label className={lbl}>تاريخها<input name="invoice_date" type="date" required defaultValue={today()} className={field} /></label></div>
            <label className={lbl}>مرجع المستند (ملف/رقم قيد)<input name="evidence_ref" required maxLength={500} className={field} /></label>
            <label className={lbl}>إثبات التسليم أو القبول (محضر/رقم)<input name="delivery_ref" required maxLength={500} className={field} /></label>
            <label className={lbl}>تاريخ التسليم<input name="delivered_on" type="date" className={field} /></label>
            <label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label>
            <button className={btn}>تسجيل التصفية</button></form> : <p className="text-sm text-muted-foreground">لا متبقٍ للتصفية.</p>) : <p className="text-xs text-muted-foreground">ليست لديك وظيفة التصفية.</p>}
        </Panel>

        <Panel title="أوامر الصرف" sub="يُصدر الأمر على تصفية قائمة: رقم، تاريخ، مبلغ، مستفيد. لا يتجاوز المصفّى.">
          {orders.length === 0 ? <p className="text-sm text-muted-foreground">لا أوامر صرف بعد.</p> : <ul className="mb-3 divide-y text-sm">{orders.map((o) => (
            <li key={o.id} className="py-2"><b className={Number(o.amount) < 0 ? "text-destructive" : ""}>{money(Number(o.amount), cur)}</b> · {o.order_no} · {o.order_date} · {o.beneficiary} {o.is_exceptional && <Flag>مسار استثنائي</Flag>}{o.entry_kind === "reversal" ? <> <Flag>قيد عكس</Flag> {o.reason}</> : <> · {who(o.actor)}{orderRemaining(o, orders, pays) > 0 && can("order") && <Rev kind="order" rid={o.id} max={orderRemaining(o, orders, pays)} />}</>}</li>))}</ul>}
          {can("order") ? (openLiqs.length ? <form action={order} className="grid gap-3">{back}<input type="hidden" name="key" value={newKey()} />
            <label className={lbl}>التصفية<select name="liquidation" required className={field}>{openLiqs.map((l) => <option key={l.id} value={l.id}>{l.liquidation_no} — متبقٍ {money(liquidationRemaining(l, liqs, orders), cur)} (فاتورة {l.invoice_no})</option>)}</select></label>
            <MoneyFields /><label className={lbl}>المستفيد<input name="beneficiary" required maxLength={200} className={field} /></label>
            <label className={lbl}>تاريخ الأمر<input name="order_date" type="date" defaultValue={today()} className={field} /></label>
            <label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label>
            <button className={btn}>إصدار أمر الصرف</button></form> : <p className="text-sm text-muted-foreground">لا تصفية متبقية لإصدار أمر عليها. الإجراء: سجّل تصفية أولًا.</p>) : <p className="text-xs text-muted-foreground">ليست لديك وظيفة إصدار أوامر الصرف.</p>}
        </Panel>
      </div>

      <Panel title="الدفعات والمطابقة" sub="الدفع يتطلب أمر صرف، وإثباتًا (رقم شيك/حوالة/إيصال) لا يتكرر، ومفتاح منع تكرار. يجوز الدفع على دفعات.">
        {pays.length === 0 ? <p className="mb-3 text-sm text-muted-foreground">لا دفعات بعد.</p> : <ul className="mb-3 divide-y text-sm">{pays.map((p) => { const rs = p.entry_kind === "payment" ? reconState(p.id, d.recs) : null; return (
          <li key={p.id} className="space-y-1 py-2"><b className={Number(p.amount) < 0 ? "text-destructive" : ""}>{money(Number(p.amount), cur)}</b> · {p.payment_no ?? "قديمة"} · {p.paid_on} · {p.beneficiary}{p.payment_method && <> · {METHODS[p.payment_method]}</>}{p.proof_ref && <> · إثبات: {p.proof_ref}</>} {p.exception_id && <Flag>مسار استثنائي</Flag>}
            {p.entry_kind === "reversal" ? <> <Flag>قيد عكس</Flag> {p.reason}</> : <> · {who(p.actor)} · {rs === "matched" ? <Flag tone="ok">مطابَقة</Flag> : rs === "discrepancy" ? <Flag>فرق في المطابقة</Flag> : <Flag tone="info">بلا مطابقة</Flag>}
              {p.cycle_entry && paymentNet(p, pays) > 0 && can("pay") && <Rev kind="payment" rid={p.id} max={paymentNet(p, pays)} />}
              {p.cycle_entry && paymentNet(p, pays) > 0 && can("reconcile") && <details className="mt-1"><summary className={`${btnSm} inline-flex cursor-pointer list-none items-center`}>مطابقة مع كشف الحساب</summary>
                <form action={reconcile} className="mt-2 grid gap-2 sm:grid-cols-2">{back}<input type="hidden" name="payment" value={p.id} />
                  <label className={lbl}>مرجع الكشف<input name="statement_ref" required className={field} /></label><label className={lbl}>تاريخ الكشف<input name="statement_date" type="date" required defaultValue={today()} className={field} /></label>
                  <label className={lbl}>المبلغ في الكشف<input name="amount" inputMode="decimal" required className={field} /></label><label className={lbl}>عملة الكشف<select name="doc_currency" defaultValue={p.doc_currency ?? cur} className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
                  <label className={`${lbl} sm:col-span-2`}>ملاحظة (إلزامية عند وجود فرق)<input name="note" maxLength={1000} className={field} /></label><button className={`${btn} sm:col-span-2`}>تسجيل المطابقة</button></form></details>}</>}</li>); })}</ul>}
        {can("pay") ? (openOrders.length ? <form action={pay} className="grid gap-3 sm:grid-cols-2">{back}<input type="hidden" name="key" value={newKey()} />
          <label className={`${lbl} sm:col-span-2`}>أمر الصرف<select name="order" required className={field}>{openOrders.map((o) => <option key={o.id} value={o.id}>{o.order_no} — {o.beneficiary} — متبقٍ {money(orderRemaining(o, orders, pays), cur)}</option>)}</select></label>
          <div className="space-y-3 sm:col-span-2"><MoneyFields label="المبلغ المدفوع بعملة الدفع" /></div>
          <label className={lbl}>طريقة الدفع<select name="method" required className={field}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={lbl}>تاريخ الدفع<input name="paid_on" type="date" required defaultValue={today()} className={field} /></label>
          <label className={`${lbl} sm:col-span-2`}>إثبات الدفع (رقم الشيك / مرجع الحوالة / رقم الإيصال)<input name="proof_ref" required maxLength={200} className={field} /></label>
          <label className={`${lbl} sm:col-span-2`}>ملاحظة<input name="note" maxLength={1000} className={field} /></label>
          <button className={`${btn} sm:col-span-2`}>تسجيل الدفعة</button></form> : <p className="text-sm text-muted-foreground">لا أمر صرف مفتوح للدفع. الإجراء: أصدر أمر صرف أولًا.</p>) : <p className="text-xs text-muted-foreground">ليست لديك وظيفة الدفع.</p>}
      </Panel>

      {can("commit") && ch.reversible > 0 && <Panel title="عكس الالتزام" sub="يُحرَّر الجزء غير المستعمل فقط؛ ما صُفّي أو أُمر بصرفه أو دُفع يجب عكسه أولًا."><Rev kind="commitment" rid={id} max={ch.reversible} /></Panel>}
      <p className="text-xs text-muted-foreground"><Link href="/staff/finance/expenditure" className="underline">← كل الالتزامات</Link> · السجلات المعتمدة غير قابلة للتعديل أو الحذف؛ التصحيح بقيد عكس فقط.</p>
    </main></>
  );
}
