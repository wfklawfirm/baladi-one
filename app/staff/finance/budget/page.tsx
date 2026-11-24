import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { curName, lineStats, money, NA } from "@/lib/finance";
import { loadFinance } from "@/lib/financeData";
import { parsePeriod } from "@/lib/ops";
import { btn, field, Flash, FinanceNav, Panel } from "@/components/finance/Parts";
import { addLine, amendLine, commitLine, payLine } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الموازنة — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export default async function Budget({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; fy?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const d = await loadFinance(sb, parsePeriod("year", undefined, undefined), /^\d{4}$/.test(sp.fy ?? "") ? Number(sp.fy) : undefined);
  const year = d.error ? new Date().getFullYear() : d.fy?.year ?? new Date().getFullYear();
  const f = d.error ? null : d;
  const lines = f ? f.lines : [];
  const commits = f ? f.commits : [], exps = f ? f.exps : [], amendments = f ? f.amendments : [];
  const expLines = lines.filter((l) => l.kind === "expense");
  const lineOpt = (l: (typeof lines)[number]) => <option key={l.id} value={l.id}>{l.code} · {l.title_ar} ({l.currency})</option>;
  const back = <input type="hidden" name="back" value="/staff/finance/budget" />;

  return (
    <><StaffHeader back="/staff/finance" backLabel="المالية" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <FinanceNav current="budget" />
      <h1 className="text-2xl font-bold">الموازنة والاعتمادات — {year}</h1>
      <Flash ok={sp.ok} err={sp.err} />
      {d.error && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">{NA}: وحدة المالية غير مفعّلة بعد في قاعدة البيانات.</p>}

      <Panel title="بنود الموازنة" sub="المتاح = الاعتماد الحالي − الالتزامات − المدفوعات غير المرتبطة بالتزام. لكل بند عملة واحدة.">
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">لا بنود موازنة لهذه السنة بعد. أضف أول بند من النموذج أدناه.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>الرمز</th><th>البند</th><th>النوع</th><th>الاعتماد الحالي</th><th>المدفوع</th><th>الملتزم به</th><th>المتاح</th><th>التنفيذ</th><th>الالتزام</th></tr></thead>
            <tbody className="divide-y">{lines.map((l) => { const s = lineStats(l, commits, exps); const r = (x: number | null) => x === null ? "—" : `${x}%`;
              return <tr key={l.id} className="[&>td]:px-2 [&>td]:py-2.5"><td className="font-mono text-xs">{l.code}</td><td className="font-medium">{l.title_ar}{l.sector && <span className="ms-2 text-xs text-muted-foreground">{l.sector}</span>}</td><td>{l.kind === "expense" ? "نفقة" : "إيراد"}</td><td>{money(s.current, l.currency)}{s.current !== s.original && <span className="block text-[11px] text-muted-foreground">الأصلي: {money(s.original, l.currency)}</span>}</td>
                <td>{l.kind === "expense" ? money(s.paid, l.currency) : "—"}</td><td>{l.kind === "expense" ? money(s.committed, l.currency) : "—"}</td><td>{l.kind === "expense" ? money(s.available, l.currency) : "—"}</td><td>{r(s.execution)}</td><td>{r(s.commitRatio)}</td></tr>; })}</tbody></table></div>
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="إضافة بند موازنة">
          <form action={addLine} className="grid gap-3 sm:grid-cols-2">{back}
            <label className="space-y-1 text-sm font-medium">السنة المالية<input name="year" type="number" min={1990} max={2100} defaultValue={year} required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">الرمز<input name="code" required maxLength={40} className={field} /></label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">اسم البند<input name="title" required maxLength={200} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">النوع<select name="kind" className={field}><option value="expense">نفقة</option><option value="revenue">إيراد</option></select></label>
            <label className="space-y-1 text-sm font-medium">القطاع<input name="sector" maxLength={100} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">الاعتماد<input name="amount" inputMode="decimal" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">العملة<select name="currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
            <button className={`${btn} sm:col-span-2`}>إضافة</button>
          </form>
        </Panel>
        <Panel title="تعديل اعتماد" sub="زيادة أو نقصان بقرار؛ السبب مطلوب ويُسجَّل في سجل التعديلات.">
          <form action={amendLine} className="grid gap-3">{back}
            <label className="space-y-1 text-sm font-medium">البند<select name="line" required className={field}>{lines.map(lineOpt)}</select></label>
            <label className="space-y-1 text-sm font-medium">التغيير (سالب للنقصان)<input name="delta" inputMode="decimal" required placeholder="مثال: -500000" className={field} /></label>
            <label className="space-y-1 text-sm font-medium">السبب / مرجع القرار<input name="reason" required maxLength={500} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">التاريخ<input name="date" type="date" defaultValue={today()} className={field} /></label>
            <button className={btn} disabled={lines.length === 0}>تسجيل التعديل</button>
          </form>
        </Panel>
        <Panel title="تسجيل التزام" sub="يحجز جزءًا من الاعتماد المتاح؛ لا يتجاوز المتاح.">
          <form action={commitLine} className="grid gap-3">{back}
            <label className="space-y-1 text-sm font-medium">بند النفقة<select name="line" required className={field}>{expLines.map(lineOpt)}</select></label>
            <label className="space-y-1 text-sm font-medium">المبلغ<input name="amount" inputMode="decimal" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">الوصف<input name="description" required maxLength={300} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">التاريخ<input name="date" type="date" defaultValue={today()} className={field} /></label>
            <button className={btn} disabled={expLines.length === 0}>تسجيل الالتزام</button>
          </form>
        </Panel>
        <Panel title="تسجيل دفعة (نفقة)" sub="مرتبطة بالتزام قائم (ضمن المتبقي منه) أو مباشرة (ضمن المتاح).">
          <form action={payLine} className="grid gap-3">{back}
            <label className="space-y-1 text-sm font-medium">بند النفقة<select name="line" required className={field}>{expLines.map(lineOpt)}</select></label>
            <label className="space-y-1 text-sm font-medium">الالتزام (اختياري)<select name="commitment" className={field}><option value="">دفعة مباشرة بلا التزام</option>{commits.map((c) => { const l = lines.find((x) => x.id === c.line_id); const paid = exps.filter((e) => e.commitment_id === c.id).reduce((s, e) => s + Number(e.amount), 0); return l ? <option key={c.id} value={c.id}>{l.code} · {c.description} — متبقٍ {money(Number(c.amount) - paid, l.currency)}</option> : null; })}</select></label>
            <label className="space-y-1 text-sm font-medium">المبلغ<input name="amount" inputMode="decimal" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">المستفيد<input name="beneficiary" required maxLength={200} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">تاريخ الدفع<input name="paid_on" type="date" defaultValue={today()} required className={field} /></label>
            <button className={btn} disabled={expLines.length === 0}>تسجيل الدفعة</button>
          </form>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="آخر الالتزامات">
          {commits.length === 0 ? <p className="text-sm text-muted-foreground">لا التزامات مسجّلة.</p> : <ul className="divide-y text-sm">{commits.slice(0, 10).map((c) => { const l = lines.find((x) => x.id === c.line_id); return <li key={c.id} className="flex flex-wrap gap-x-3 py-2"><b className="text-primary">{money(Number(c.amount), l?.currency ?? "")}</b><span>{c.description}</span><span className="text-muted-foreground">{l?.code} · {c.committed_on}</span></li>; })}</ul>}
        </Panel>
        <Panel title="آخر المدفوعات والتعديلات">
          {exps.length === 0 && amendments.length === 0 ? <p className="text-sm text-muted-foreground">لا حركات مسجّلة.</p> : <ul className="divide-y text-sm">
            {exps.slice(0, 8).map((e) => { const l = lines.find((x) => x.id === e.line_id); return <li key={e.id} className="flex flex-wrap gap-x-3 py-2"><b>{money(Number(e.amount), l?.currency ?? "")}</b><span>دفعة إلى {e.beneficiary}</span><span className="text-muted-foreground">{l?.code} · {e.paid_on}</span></li>; })}
            {amendments.slice(0, 5).map((a) => { const l = lines.find((x) => x.id === a.line_id); return <li key={a.id} className="flex flex-wrap gap-x-3 py-2"><b className={Number(a.delta) < 0 ? "text-destructive" : "text-[#2f7d4f]"}>{Number(a.delta) > 0 ? "+" : ""}{money(Number(a.delta), l?.currency ?? "")}</b><span>تعديل: {a.reason}</span><span className="text-muted-foreground">{l?.code} · {a.amended_on}</span></li>; })}
          </ul>}
        </Panel>
      </div>
      {!d.error && d.years.length > 1 && <p className="text-xs text-muted-foreground">سنوات أخرى: {d.years.map((y) => <a key={y.id} href={`/staff/finance/budget?fy=${y.year}`} className="mx-1 underline">{y.year}</a>)}</p>}
      <p className="text-xs text-muted-foreground">عملة البند ثابتة؛ {curName("LBP")} ولا تُجمع مع {curName("USD")}.</p>
    </main></>
  );
}
