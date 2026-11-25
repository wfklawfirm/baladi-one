import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { curName, money } from "@/lib/finance";
import { commitmentChain, FN_LABEL, hasFn, newKey, nextAction, type ExpFn } from "@/lib/expenditure";
import { Panel } from "@/components/finance/Parts";
import { btn, ExpFlash, ExpNav, field, Flag, lbl, MoneyFields, NotActive, StageStrip } from "@/components/finance/expenditure/Parts";
import { Extra } from "@/components/finance/simple";
import { Empty, Intro } from "@/components/simple/kit";
import { loadExp } from "./data";
import { commit } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "دورة الإنفاق — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export default async function Expenditure({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, user, memberships } = await requireStaff();
  const sp = await searchParams;
  const priv = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const d = await loadExp(sb);
  const mine = d.state === "ok" ? d.assignments.filter((a) => a.user_id === user.id && a.active).map((a) => a.fn as ExpFn) : [];
  if (!priv && d.state === "ok" && mine.length === 0) redirect("/staff");

  const head = <Intro title="الإنفاق: من الحجز إلى الدفع">كل مبلغ يُنفق يمرّ بخطوات ثابتة: حجز المبلغ من بند الموازنة، ثم التحقق من الاستلام، ثم أمر الصرف، ثم الدفع. اضغطوا على أي بند أدناه لترو الخطوة التالية.</Intro>;
  if (d.state !== "ok") return <><StaffHeader back="/staff/finance" backLabel="المالية" /><main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><ExpNav current="main" />{head}<NotActive detail={d.detail} /></main></>;

  const cycle = d.commits.filter((c) => c.entry_kind === "commitment" && c.cycle_entry);
  const legacy = d.commits.filter((c) => c.entry_kind === "commitment" && !c.cycle_entry);
  const rows = cycle.map((c) => ({ c, ch: commitmentChain(c, d.commits, d.liqs, d.orders, d.pays), line: d.lines.find((l) => l.id === c.line_id) }));
  const openLines = d.lines.filter((l) => l.fiscal_year?.status === "open");
  const flagged = d.orders.filter((o) => o.is_exceptional && o.entry_kind === "order").length;
  const totals = (["LBP", "USD"] as const).map((cur) => {
    const r = rows.filter((x) => x.line?.currency === cur);
    return r.length ? { cur, net: r.reduce((s, x) => s + x.ch.net, 0), paid: r.reduce((s, x) => s + x.ch.paid, 0), balance: r.reduce((s, x) => s + x.ch.balance, 0) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  const canCommit = hasFn(d.assignments, user.id, "commit");
  const lineOpt = (l: (typeof d.lines)[number]) => <option key={l.id} value={l.id}>{l.code} · {l.title_ar} ({l.currency})</option>;
  const back = <input type="hidden" name="back" value="/staff/finance/expenditure" />;
  const decisions = (await sb.from("municipal_decision").select("id,decision_no,year,title").in("legal_status", ["adopted", "under_review", "effective"]).order("created_at", { ascending: false }).limit(100)).data ?? [];
  const contracts = (await sb.from("contract").select("id,contractor,subject").order("created_at", { ascending: false }).limit(100)).data ?? [];

  return (
    <><StaffHeader back="/staff/finance" backLabel="المالية" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <ExpNav current="main" />
      {head}
      <ExpFlash ok={sp.ok} err={sp.err} />
      {d.partial && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تعذّر تحميل جزء من البيانات؛ قد تكون الأرقام ناقصة.</p>}

      <section className="elev flex flex-wrap items-center gap-3 rounded-2xl border bg-background p-4 text-sm">
        <span>مهامي في الإنفاق: {mine.length ? mine.map((f) => <Flag key={f} tone="info">{FN_LABEL[f]}</Flag>) : <Flag>لم تُسند إليكم مهمة</Flag>}</span>
        <span>الالتزام بالخطوات: {d.enforce ? <Flag tone="ok">✓ مفعّل: لا دفع قبل المرور بكل الخطوات</Flag> : <Flag>! غير مفعّل: ما زال الدفع المباشر القديم ممكنًا</Flag>}</span>
        {flagged > 0 && <span><Flag>{flagged} أمر صرف تمّ باستثناء</Flag></span>}
        {priv && <Link href="/staff/finance/expenditure/settings" className="font-semibold text-primary">تحديد من يقوم بكل مهمة ←</Link>}
      </section>

      {totals.length > 0 && <div className="fill-odd grid gap-3 sm:grid-cols-2">{totals.map((t) => (
        <div key={t.cur} className="elev space-y-1 rounded-2xl border bg-background p-4 text-sm"><b>المبالغ المحجوزة ({curName(t.cur)})</b>
          <div className="flex justify-between"><span>إجمالي المحجوز</span><b>{money(t.net, t.cur)}</b></div>
          <div className="flex justify-between"><span>ما دُفع فعلًا</span><b>{money(t.paid, t.cur)}</b></div>
          <div className="flex justify-between"><span>ما بقي من المحجوز</span><b className="text-primary">{money(t.balance, t.cur)}</b></div></div>))}</div>}

      <Panel title="حجز مبلغ لنفقة جديدة" sub="يتأكد النظام أن في البند مالًا كافيًا ثم يحجز المبلغ. لا بد من ذكر المستند الذي يجيز الإنفاق." fold>
        {!canCommit && <p className="mb-2 rounded-lg border border-destructive/40 p-2 text-sm">ليست من مهامكم «{FN_LABEL.commit}». اطلبوا من رئيس البلدية أو المدير أن يسندها إليكم.</p>}
        <form action={commit} className="grid gap-3 sm:grid-cols-2">{back}<input type="hidden" name="key" value={newKey()} />
          <label className={lbl}>من أي بند في الموازنة؟<select name="line" required className={field}>{openLines.map(lineOpt)}</select></label>
          
          <div className="space-y-3 sm:col-span-2"><MoneyFields /></div>
          <label className={`${lbl} sm:col-span-2`}>على ماذا سيُصرف المبلغ؟<input name="description" required maxLength={300} className={field} /></label>
          <label className={`${lbl} sm:col-span-2`}>المستند الذي يجيز الصرف<span className="block text-sm font-normal text-muted-foreground">رقم القرار أو العقد أو التفويض</span><input name="basis_ref" required maxLength={500} className={field} /></label>
          <div className="sm:col-span-2"><Extra><label className={lbl}>التاريخ<input name="date" type="date" defaultValue={today()} className={field} /></label>
          <label className={lbl}>قرار المجلس (اختياري)<select name="decision" className={field}><option value="">—</option>{(decisions as { id: string; decision_no: string; year: number; title: string }[]).map((x) => <option key={x.id} value={x.id}>{x.decision_no}/{x.year} — {x.title}</option>)}</select></label>
          <label className={lbl}>العقد (اختياري)<select name="contract" className={field}><option value="">—</option>{(contracts as { id: string; contractor: string; subject: string }[]).map((x) => <option key={x.id} value={x.id}>{x.contractor} — {x.subject}</option>)}</select></label>
</Extra></div>
          <button className={`${btn} sm:col-span-2`} disabled={!canCommit || openLines.length === 0}>احجز المبلغ</button>
          {openLines.length === 0 && <p className="text-xs text-destructive sm:col-span-2">لا توجد بنود نفقات في سنة مفتوحة. أضيفوا بندًا من صفحة الموازنة أولًا.</p>}
        </form>
      </Panel>

      <Panel title="المبالغ المحجوزة وأين وصلت" sub="كل بطاقة تبيّن الخطوة التالية. اضغطوا على العنوان لفتح التفاصيل.">
        {rows.length === 0 ? <Empty>لا توجد مبالغ محجوزة بعد. ابدؤوا بنموذج «حجز مبلغ لنفقة جديدة» أعلاه.</Empty> : (
          <ul className="space-y-3">{rows.map(({ c, ch, line }) => {
            const cur = line?.currency ?? "LBP";
            const stage = ch.paid > 0 ? 5 : ch.ordered > 0 ? 4 : ch.liquidated > 0 ? 3 : 2;
            return (
              <li key={c.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/staff/finance/expenditure/${c.id}`} className="font-bold text-primary underline">{c.commitment_no ?? c.id.slice(0, 8)} — {c.description}</Link><span>{line ? `${line.code} (${cur})` : ""}</span></div>
                <div className="my-2"><StageStrip done={stage} /></div>
                <div className="fill-odd grid gap-x-4 gap-y-1 sm:grid-cols-4"><span>المحجوز <b>{money(ch.net, cur)}</b></span><span>تم التحقق من استلامه <b>{money(ch.liquidated, cur)}</b></span><span>صدر أمر بدفعه <b>{money(ch.ordered, cur)}</b></span><span>مدفوع <b>{money(ch.paid, cur)}</b></span></div>
                <p className="mt-1 text-sm"><b>الخطوة التالية:</b> {nextAction(ch)} · المتبقي من المحجوز {money(ch.balance, cur)}</p>
              </li>);
          })}</ul>)}
      </Panel>

      {legacy.length > 0 && <p className="text-xs text-muted-foreground">{legacy.length} التزامًا سُجّل بالمسار القديم (خارج الدورة): يبقى ظاهرًا في «الموازنة»، ولا يُصفّى ولا يُصرف عبر هذه الدورة. {!d.enforce && "الإجراء: فعّل إلزام الدورة بعد الانتقال الكامل."}</p>}
    </main></>
  );
}
