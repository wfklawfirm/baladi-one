import Link from "next/link";
import { NO_DATA, type CurTotals, type Stats } from "@/lib/procurementStats";
import { fmtMoney } from "@/lib/procurementAudit";

const card = "flex min-h-32 flex-col justify-between gap-2 rounded-2xl border bg-background p-4 hover:bg-muted active:opacity-90";
const empty = <span className="text-muted-foreground">{NO_DATA}</span>;

function Money({ t }: { t: CurTotals }) {
  const k = Object.keys(t).sort();
  if (!k.length) return empty;
  return <span className="block space-y-0.5">{k.map((c) => <span key={c} className="block" dir="ltr">{fmtMoney(t[c], c)}</span>)}</span>;
}
function Kpi({ href, title, note, children }: { href: string; title: string; note?: string; children: React.ReactNode }) {
  return <li><Link href={href} className={card}><span className="text-sm font-semibold text-muted-foreground">{title}</span><b className="text-2xl">{children}</b>{note && <span className="text-xs leading-5 text-muted-foreground">{note}</span>}</Link></li>;
}
function Tile({ title, value, note, href }: { title: string; value: number | null; note: string; href?: string }) {
  const body = <><span className="text-sm font-semibold">{title}</span><b className="text-2xl">{value === null ? <span className="text-base font-normal text-muted-foreground">لا بيانات (المصدر غير متاح)</span> : value}</b><span className="text-xs leading-5 text-muted-foreground">{note}</span></>;
  return <li className="rounded-2xl border bg-background">{href ? <Link href={href} className="flex min-h-28 flex-col justify-between gap-1 p-4 hover:bg-muted">{body}</Link> : <div className="flex min-h-28 flex-col justify-between gap-1 p-4">{body}</div>}</li>;
}

/** Bars scaled per currency (each currency has its own scale): estimated and contracted are two separate bars, never added. */
function PlannedVsContracted({ rows }: { rows: Stats["charts"]["plannedVsContracted"] }) {
  if (!rows.length) return <p className="text-sm">{NO_DATA}</p>;
  return (
    <div className="space-y-4">{rows.map((r) => { const max = Math.max(r.planned, r.contracted, 1); return (
      <div key={r.currency} className="space-y-1.5"><p className="text-sm font-bold">{r.currency === "LBP" ? "الليرة اللبنانية" : r.currency === "USD" ? "الدولار" : r.currency}</p>
        {([["مخطَّط (تقديري)", r.planned, "bg-primary"], ["متعاقد عليه (عقود موقَّعة)", r.contracted, "bg-emerald-700"]] as const).map(([l, v, cl]) => (
          <div key={l} className="grid grid-cols-[9rem_1fr_auto] items-center gap-2 text-xs"><span>{l}</span><span className="h-4 rounded bg-muted" role="img" aria-label={`${l}: ${fmtMoney(v, r.currency)}`}><span className={`block h-4 rounded ${cl}`} style={{ width: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%` }} /></span><span dir="ltr">{fmtMoney(v, r.currency)}</span></div>))}
      </div>); })}
    </div>
  );
}
function Methods({ rows }: { rows: Stats["charts"]["methods"] }) {
  if (!rows.length) return <p className="text-sm">{NO_DATA}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return <div className="space-y-1.5">{rows.map((r) => <div key={r.method} className="grid grid-cols-[9rem_1fr_auto] items-center gap-2 text-xs"><span>{r.label}</span><span className="h-4 rounded bg-muted" role="img" aria-label={`${r.label}: ${r.count}`}><span className="block h-4 rounded bg-primary" style={{ width: `${(r.count / max) * 100}%` }} /></span><b>{r.count}</b></div>)}</div>;
}

export default function DashboardView({ s, year, unavailable }: { s: Stats; year: number; unavailable: string[] }) {
  const PLAN = `/staff/projects/procurement?year=${year}`;
  return (
    <div className="space-y-6">
      {unavailable.length > 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">تعذّرت قراءة: {unavailable.join("، ")}. الأرقام المتعلقة بها معروضة «لا بيانات» وليست صفرًا.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi href={PLAN} title="القيمة التقديرية الإجمالية (حسب العملة)" note={`${s.itemCount} بندًا غير ملغى · تقديرية فقط، لا تُجمع عملاتها`}><Money t={s.estimatedByCurrency} /></Kpi>
        <Kpi href={PLAN} title="البنود النشطة" note="مخطَّط أو قيد التنفيذ">{s.itemCount ? s.active : empty}</Kpi>
        <Kpi href={PLAN} title="نسبة تنفيذ الخطة" note={s.execution.total ? `${s.execution.done} منجز من ${s.execution.total} (بالعدد لا بالقيمة)` : undefined}>{s.execution.pct === null ? empty : `${s.execution.pct}%`}</Kpi>
        <Kpi href="/staff/projects/contracts" title="عقود لها تاريخ توقيع" note="عقود مربوطة ببنود الخطة وموقَّعة">{s.itemCount ? s.signedContracts : empty}</Kpi>
        <Kpi href="#followup" title="بنود تحتاج متابعة" note="تاريخ مخطَّط مرّ دون سجل مطابق؛ للتنبيه لا للحكم">{s.itemCount ? s.followUps.length : empty}</Kpi>
        {s.openObjections !== null && <Kpi href="/staff/procurement" title="اعتراضات مفتوحة">{s.openObjections}</Kpi>}
      </ul>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold text-primary">المخطَّط مقابل المتعاقد عليه</h2><PlannedVsContracted rows={s.charts.plannedVsContracted} /><p className="text-xs text-muted-foreground">لكل عملة مقياسها؛ لا يُدمج التقدير مع قيمة العقد ولا مع أي مبلغ مدفوع.</p></div>
        <div className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold text-primary">توزيع أسلوب الشراء المخطَّط</h2><Methods rows={s.charts.methods} /></div>
      </section>

      <section className="space-y-3"><h2 className="font-bold text-primary">مؤشرات الالتزام (سجلات ناقصة، وليست أحكامًا)</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          <Tile title="تصاريح تعارض مصالح ناقصة" value={s.compliance.missingDeclarations} note="أعضاء لجان بلا تاريخ تصريح أو بلا إجابة" href="/staff/projects/contracts" />
          <Tile title="مستندات مورّدين منتهية" value={s.compliance.expiredSupplierDocs} note="تاريخ انتهاء المستندات المسجَّل قبل اليوم" href="/staff/procurement/suppliers" />
          <Tile title="بنود بلا نشر رسمي مكتمل" value={s.itemCount ? s.compliance.unpublished : null} note="لا سجل نشر مكتمل (رابط + مرجع + تاريخ + إثبات)" href={PLAN} />
        </ul></section>

      <section id="followup" className="space-y-2"><h2 className="font-bold text-primary">البنود التي تحتاج متابعة</h2>
        {s.followUps.length === 0 ? <p className="rounded-xl border p-4 text-sm">{s.itemCount ? "لا بنود تحتاج متابعة وفق القواعد المطبَّقة." : NO_DATA}</p>
          : <ul className="space-y-2">{s.followUps.map((f) => <li key={f.id} className="rounded-2xl border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{f.title}</b><Link className="font-semibold text-primary underline" href={`/staff/procurement/audit-pack/${f.id}`}>الملف الرقابي</Link></div><ul className="list-disc ps-5 text-muted-foreground">{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul></li>)}</ul>}
      </section>
      <p className="text-xs leading-6 text-muted-foreground">حدود التحقق: أرقام اللوحة تُحسب من السجلات المقروءة وفق صلاحياتك؛ ما لم يُسجَّل لا يظهر. لا تعني مؤشرات الالتزام وجود مخالفة، ولا يحل أي رقم هنا محل المراجعة القانونية.</p>
    </div>
  );
}
