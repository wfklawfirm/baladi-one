import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { PERIODS, parsePeriod } from "@/lib/ops";
import { budgetTotals, collectionRate, curName, lineStats, money, NA } from "@/lib/finance";
import { arrearsOf, financeCards, flowOf, loadFinance } from "@/lib/financeData";
import { loadExp } from "./expenditure/data";
import { commitmentChain } from "@/lib/expenditure";
import { loadLifecycle } from "@/lib/budgetCycleData";
import { CYCLE_LABEL, nextStage, type CycleStage } from "@/lib/budgetCycle";
import { C, Columns, HBars } from "@/components/ops/Charts";
import { FinanceNav, Panel } from "@/components/finance/Parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "المالية والموازنة والتحصيل — BALADI ONE", referrer: "no-referrer" as const };

export default async function Finance({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; fy?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const range = parsePeriod(sp.p, sp.from, sp.to);
  const fyYear = /^\d{4}$/.test(sp.fy ?? "") ? Number(sp.fy) : undefined;
  const d = await loadFinance(sb, range, fyYear);
  const q = (p: string) => `/staff/finance?p=${p}${fyYear ? `&fy=${fyYear}` : ""}`;

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">المالية</h1>
      <form action="/staff/finance" className="flex flex-wrap items-center gap-2">
        {fyYear && <input type="hidden" name="fy" value={fyYear} />}
        <label className="text-sm font-medium">الفترة
          <select name="p" defaultValue={range.key === "custom" ? "month" : range.key} className="ms-2 min-h-11 rounded-xl border-2 bg-background px-3">
            {PERIODS.filter(([k]) => k !== "custom").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">عرض</button>
        <span className="text-xs text-muted-foreground">{range.label}</span>
      </form>
      <details className="text-sm"><summary className="min-h-10 cursor-pointer py-2 text-primary">فترة مخصصة</summary>
        <form action="/staff/finance" className="flex flex-wrap items-center gap-1.5 pt-1">
          <input type="hidden" name="p" value="custom" />
          <input type="date" name="from" required defaultValue={sp.from} aria-label="من" className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" />
          <input type="date" name="to" required defaultValue={sp.to} aria-label="إلى" className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" />
          <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">تطبيق</button>
        </form></details>
    </div>
  );

  if (d.error) {
    return <><StaffHeader back="/staff/operations" backLabel="مركز القيادة" /><main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><FinanceNav current="overview" />{header}<p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">{NA}: وحدة المالية غير مفعّلة بعد في قاعدة البيانات.</p></main></>;
  }

  const cards = await financeCards(sb, range);
  const exp = budgetTotals(d.lines, d.commits, d.exps, "expense");
  const rev = budgetTotals(d.lines, d.commits, d.exps, "revenue");
  const flow = flowOf(d, range);
  const arr = arrearsOf(d);
  const rate = collectionRate(d.recvs, d.linked, d.toKey < d.today ? d.toKey : d.today, { from: d.fromKey, to: d.toKey });
  const stats = d.lines.filter((l) => l.kind === "expense").map((l) => ({ l, s: lineStats(l, d.commits, d.exps) }));
  const rateText = (x: number | null) => (x === null ? NA : `${x}%`);

  // "المطلوب منك": real counts from the registers; each row only appears when something is actually waiting.
  const ex = await loadExp(sb).catch(() => null);
  let expWaiting = 0;
  if (ex && ex.state === "ok") {
    for (const c of ex.commits.filter((c) => c.entry_kind === "commitment" && c.cycle_entry)) {
      const ch = commitmentChain(c, ex.commits, ex.liqs, ex.orders, ex.pays);
      if (ch.net > 0 && (ch.toLiquidate > 0 || ch.toOrder > 0 || ch.toPay > 0)) expWaiting++;
    }
  }
  const lc = d.fy ? await loadLifecycle(sb, d.fy.id).catch(() => null) : null;
  const cycle = lc && !("missing" in lc && lc.missing) ? (lc as { cycle?: { status: string } | null }).cycle ?? null : null;
  const nxt = cycle ? nextStage(cycle.status) : null;
  const amendWaiting = d.amendments.filter((a) => !a.applied && !a.validated_on).length;
  const arrCount = arr.reduce((n, a) => n + a.count, 0);
  const todo: { text: string; href: string; cta: string }[] = [];
  if (expWaiting) todo.push({ text: `${expWaiting} نفقة بانتظار خطوتها التالية (تصفية أو أمر صرف أو دفع)`, href: "/staff/finance/expenditure", cta: "متابعة النفقات" });
  if (arrCount) todo.push({ text: `${arrCount} مستحق تجاوز موعده ولم يُسدَّد`, href: "/staff/finance/receivables", cta: "عرض المتأخرات" });
  if (nxt && cycle) todo.push({ text: `الموازنة الآن في مرحلة «${CYCLE_LABEL[cycle.status as CycleStage] ?? cycle.status}» وخطوتها التالية «${CYCLE_LABEL[nxt]}»`, href: "/staff/finance/lifecycle", cta: "فتح دورة الموازنة" });
  if (amendWaiting) todo.push({ text: `${amendWaiting} تعديل اعتماد بانتظار التصديق`, href: "/staff/finance/lifecycle", cta: "مراجعة التعديلات" });
  const arrText = !d.recvs.length ? NA : arr.length ? arr.map((a) => money(a.total, a.currency)).join(" + ") : "لا متأخرات";
  const headline = todo.length ? `لديكم ${todo.length} ${todo.length === 1 ? "أمر" : "أمور"} تحتاج متابعتكم في المالية.` : "لا شيء ينتظر قراركم في المالية الآن.";
  const keyNums: [string, string, string | undefined][] = [["تنفيذ الموازنة", cards.BUDGET_EXEC.value ?? NA, cards.BUDGET_EXEC.value === null ? cards.BUDGET_EXEC.reason : "نسبة المدفوع من الاعتماد"], ["نسبة التحصيل", cards.COLLECTION_RATE.value ?? NA, cards.COLLECTION_RATE.value === null ? cards.COLLECTION_RATE.reason : `المحصّل من مستحقات ${range.label}`], ["المتأخرات", arrText, "مستحقات تجاوزت موعدها"]];

  return (
    <><StaffHeader back="/staff/operations" backLabel="مركز القيادة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <FinanceNav current="overview" />
      {header}
      <section aria-label="الملخص" className="space-y-4">
        <p className="text-lg font-bold">{headline}</p>
        <div className="grid gap-3 sm:grid-cols-3">{keyNums.map(([t, v, sub]) => <div key={t} className="elev rounded-2xl border bg-background p-4"><span className="text-sm font-semibold">{t}</span><b className={`mt-2 block ${v === NA ? "text-base text-muted-foreground" : "text-2xl text-primary"}`}>{v}</b>{sub && <span className="mt-1 block text-xs text-muted-foreground">{sub}</span>}</div>)}</div>
        {todo.length > 0 && <div className="space-y-2"><h2 className="font-bold text-primary">المطلوب منك</h2><ul className="space-y-2">{todo.map((t, i) => <li key={t.href + i} className="elev flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background p-3"><span className="min-w-0 flex-1 text-sm">{t.text}</span><Link href={t.href} className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "border active:bg-muted"}`}>{t.cta}</Link></li>)}</ul></div>}
      </section>
      {d.partial && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تعذّر تحميل جزء من البيانات؛ قد تكون الأرقام ناقصة.</p>}
      <p className="text-xs text-muted-foreground">السنة المالية: {d.fy ? d.fy.year : NA}{d.years.length > 1 && <> · {d.years.map((y) => <Link key={y.id} href={`/staff/finance?p=${range.key}&fy=${y.year}`} className={`mx-1 underline ${y.year === d.fy?.year ? "font-bold text-primary" : ""}`}>{y.year}</Link>)}</>} · تنفيذ الموازنة تراكمي للسنة ولا يتأثر باختيار الفترة.</p>

      <details className="group rounded-2xl border p-3 md:p-4"><summary className="min-h-11 cursor-pointer list-none py-2 font-bold text-primary">عرض التفاصيل (الاعتمادات والرسوم البيانية والمستحقات)</summary>
      <div className="space-y-5 pt-3">
      <section aria-label="المؤشرات" className="fill-odd grid gap-3 sm:grid-cols-2">
        {([["نسبة التحصيل", cards.COLLECTION_RATE, "المحصّل المرتبط بمستحقات ÷ المستحقات التي حلّ موعدها في الفترة"], ["تنفيذ الموازنة", cards.BUDGET_EXEC, "المدفوع ÷ الاعتماد الحالي (الالتزامات مؤشر منفصل)"]] as const).map(([t, c, f]) => (
          <div key={t} className="elev rounded-2xl border bg-background p-4">
            <span className="text-sm font-semibold">{t}</span>
            {c.value !== null ? <b className="mt-2 block text-3xl text-primary">{c.value}</b> : <b className="mt-2 block text-base text-muted-foreground">{NA}</b>}
            {c.value === null && <span className="mt-1 block text-xs text-muted-foreground">{c.reason}</span>}
            {c.lines?.map((l) => <span key={l} className="block text-xs text-muted-foreground">{l}</span>)}
            <span className="mt-2 block text-[11px] text-muted-foreground">{f}</span>
          </div>
        ))}
      </section>

      <Panel title="الاعتمادات والتنفيذ" sub="الاعتماد الحالي، المدفوع، الملتزم به، والمتاح (= الاعتماد − الالتزامات − المدفوعات غير المرتبطة بالتزام). لكل عملة على حدة.">
        {exp.length === 0 && rev.length === 0 ? <p className="text-sm text-muted-foreground">لا بنود موازنة مسجّلة بعد. <Link href="/staff/finance/budget" className="font-semibold text-primary">إضافة بند ←</Link></p> : (
          <div className="fill-odd grid gap-4 md:grid-cols-2">
            {exp.map((t) => (
              <div key={t.currency} className="space-y-1 rounded-xl border p-3 text-sm">
                <b>نفقات ({curName(t.currency)}) — {t.lines} بند</b>
                <div className="flex justify-between"><span>الاعتماد</span><b>{money(t.appropriation, t.currency)}</b></div>
                <div className="flex justify-between"><span>المدفوع</span><b>{money(t.paid, t.currency)}</b></div>
                <div className="flex justify-between"><span>الملتزم به</span><b>{money(t.committed, t.currency)}</b></div>
                <div className="flex justify-between"><span>المتاح</span><b>{money(t.available, t.currency)}</b></div>
                <div className="flex justify-between"><span>نسبة التنفيذ (المدفوع)</span><b className="text-primary">{rateText(t.execution)}</b></div>
                <div className="flex justify-between"><span>نسبة الالتزام</span><b>{rateText(t.commitRatio)}</b></div>
              </div>
            ))}
            {rev.map((t) => (
              <div key={t.currency} className="space-y-1 rounded-xl border p-3 text-sm">
                <b>إيرادات مقدّرة ({curName(t.currency)}) — {t.lines} بند</b>
                <div className="flex justify-between"><span>التقدير الحالي</span><b>{money(t.appropriation, t.currency)}</b></div>
                <p className="text-xs text-muted-foreground">لا تُربط الإيرادات الفعلية ببنود الإيراد؛ التحصيل الفعلي يظهر أدناه.</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="fill-odd grid gap-4 md:grid-cols-2">
        {(["LBP", "USD"] as const).map((cur) => {
          const rows = stats.filter((x) => x.l.currency === cur);
          if (!rows.length) return null;
          const withRate = rows.filter((x) => x.s.execution !== null);
          return (
            <Panel key={cur} title={`تنفيذ بنود النفقات (${curName(cur)})`} sub="طول الشريط = نسبة المدفوع من الاعتماد الحالي">
              {withRate.length ? <HBars items={withRate.map((x) => ({ label: `${x.l.code} · ${x.l.title_ar} (${money(x.s.paid, cur)} / ${money(x.s.current, cur)})`, n: x.s.execution as number }))} /> : null}
              {rows.length > withRate.length && <p className="mt-2 text-xs text-muted-foreground">{NA} لبنود اعتمادها صفر: {rows.filter((x) => x.s.execution === null).map((x) => x.l.code).join("، ")}</p>}
            </Panel>
          );
        })}
      </div>

      <Panel title="الإيرادات مقابل النفقات" sub={`إيصالات التحصيل (كلها) مقابل النفقات المدفوعة خلال ${range.label}، لكل عملة على حدة`}>
        {flow.length === 0 ? <p className="text-sm text-muted-foreground">لا إيصالات ولا نفقات في الفترة.</p> : (
          <div className="fill-odd grid gap-5 md:grid-cols-2">
            {flow.map((f) => (
              <div key={f.currency} className="space-y-2">
                <div className="flex flex-wrap justify-between gap-2 text-sm"><b>{curName(f.currency)}</b><span>إيرادات <b className="text-primary">{money(f.revenue, f.currency)}</b> · نفقات <b>{money(f.expense, f.currency)}</b></span></div>
                <Columns label={`الإيرادات (${f.currency})`} data={f.series.map((x) => ({ key: x.key, label: x.label, v: x.revenue }))} />
                <p className="text-xs text-muted-foreground">النفقات</p>
                <Columns label={`النفقات (${f.currency})`} data={f.series.map((x) => ({ key: x.key, label: x.label, v: x.expense }))} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="fill-odd grid gap-4 md:grid-cols-2">
        <Panel title="المستحقات مقابل المحصّل" sub="المستحقات التي حلّ موعدها خلال الفترة، والمحصّل المرتبط بها">
          {rate.length === 0 ? <p className="text-sm text-muted-foreground">لا مستحقات حلّ موعدها في الفترة ({NA}).</p> : rate.map((r) => (
            <div key={r.currency} className="mb-4 space-y-2"><div className="flex justify-between text-sm"><b>{curName(r.currency)} · {r.count} مستحق</b><b className="text-primary">{rateText(r.rate)}</b></div>
              <HBars items={[{ label: `المستحق (${r.currency})`, n: r.due }, { label: `المحصّل (${r.currency})`, n: r.collected }]} color={C.green} /></div>
          ))}
          <Link href="/staff/finance/receivables" className="text-sm font-semibold text-primary">إدارة المستحقات ←</Link>
        </Panel>
        <Panel title="المتأخرات" sub="مستحقات مفتوحة تجاوزت موعدها وما زال عليها رصيد (حتى اليوم، بغض النظر عن الفترة)">
          {arr.length === 0 ? <p className="text-sm text-muted-foreground">لا متأخرات مسجّلة.</p> : arr.map((a) => (
            <div key={a.currency} className="mb-4 space-y-2"><div className="flex justify-between text-sm"><b>{curName(a.currency)} · {a.count} مستحق</b><b className="text-destructive">{money(a.total, a.currency)}</b></div>
              <HBars items={a.buckets.map((b) => ({ label: `${b.label} (${b.count})`, n: b.amount }))} color={C.amber} /></div>
          ))}
        </Panel>
      </div>
      </div></details>
    </main></>
  );
}
