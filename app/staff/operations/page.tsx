import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { REPORT_TYPES, STATUS_AR } from "@/lib/reports";
import { computeOps, FIRST_RESPONSE_H, SLA_DAYS, type Coll, type Hist, type Person, type Req } from "@/lib/ops";
import { C, Columns, Donut, HBars, IntakeChart } from "@/components/ops/Charts";
import { assignRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "لوحة الأداء — BALADI ONE", referrer: "no-referrer" as const };
const STATUS_COLOR: Record<string, string> = { received: C.amber, in_progress: C.blue, needs_info: C.grey, done: C.green, rejected: C.primary, cancelled: "#d1d5db" };
const ROLE_AR: Record<string, string> = { staff: "موظف", mayor: "رئيس", admin: "مدير" };
const nf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const money = (n: number, c: string) => `${nf(Math.round(n))} ${c === "USD" ? "$" : "ل.ل."}`;
const typeLabel = (r: { kind: string; report_type: string | null }) => REPORT_TYPES.find(([k]) => k === r.report_type)?.[1] ?? (r.kind === "service_request" ? "طلب خدمة" : "بلاغ");

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return <section className={`elev rounded-2xl border bg-background p-4 md:p-5 ${className}`}><h2 className="font-bold">{title}</h2>{sub && <p className="mb-3 text-xs text-muted-foreground">{sub}</p>}<div className={sub ? "" : "mt-3"}>{children}</div></section>;
}
function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" }) {
  return <div className="elev rounded-2xl border bg-background p-4 text-center"><b className={`block text-3xl ${tone === "bad" ? "text-destructive" : "text-primary"}`}>{value}</b><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</div>;
}

export default async function Operations() {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const since = new Date(Date.now() - 62 * 86_400_000).toISOString();
  const [rq, hs, rs, cl] = await Promise.all([
    sb.from("citizen_request").select("id,kind,report_type,status,assigned_to,created_at,updated_at").order("created_at", { ascending: false }).limit(3000),
    sb.from("request_status_history").select("request_id,from_status,to_status,actor,created_at").order("created_at", { ascending: true }).limit(8000),
    sb.rpc("ops_roster"),
    sb.from("collection_entry").select("amount,currency,method,collected_by,created_at").gte("created_at", since).limit(5000),
  ]);
  const people = ((rs.data ?? []) as Person[]).map((p) => ({ ...p, display_name: p.display_name || ROLE_AR[p.role] || "موظف" }));
  const name = (id: string | null) => people.find((p) => p.user_id === id)?.display_name ?? "—";
  const o = computeOps((rq.data ?? []) as Req[], (hs.data ?? []) as Hist[], people, (cl.data ?? []) as Coll[]);
  const byType = Object.values(o.openList.concat([]).reduce<Record<string, { label: string; n: number }>>((m, r) => { const l = typeLabel(r); (m[l] ??= { label: l, n: 0 }).n++; return m; }, {})).sort((a, b) => b.n - a.n);
  const hasColl = o.collections.some((c) => c.count > 0);

  return (
    <><StaffHeader back="/staff" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">لوحة الأداء والعمليات</h1><p className="text-sm text-muted-foreground">مؤشرات حيّة من الطلبات وسجلّ المعالجة. المعاملة المتأخرة: مفتوحة أكثر من {SLA_DAYS} أيام.</p></div>
        <Link href="/staff/requests" className="rounded-xl border px-4 py-2 text-sm active:bg-muted">كل الطلبات ←</Link>
      </div>

      <section aria-label="المؤشرات" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="طلبات مفتوحة" value={String(o.open)} hint={`من ${o.total} إجمالًا`} />
        <Kpi label="واردة (٣٠ يومًا)" value={String(o.last30)} />
        <Kpi label="متأخرة" value={String(o.overdue.length)} hint={`> ${SLA_DAYS} أيام`} tone={o.overdue.length ? "bad" : undefined} />
        <Kpi label="غير مُسندة" value={String(o.unassigned)} tone={o.unassigned ? "bad" : undefined} />
        <Kpi label="نسبة الإنجاز" value={o.completionRate === null ? "—" : `${o.completionRate}%`} />
        <Kpi label="متوسط زمن المعالجة" value={o.resolutionDays === null ? "—" : nf(o.resolutionDays)} hint="يوم" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="الوارد والمنجز يوميًا" sub="أعمدة: واردة · خط: منجزة (آخر ٣٠ يومًا)" className="lg:col-span-2"><IntakeChart data={o.series} /></Card>
        <Card title="توزيع الحالات"><Donut parts={o.status.map(({ s, n }) => ({ label: STATUS_AR[s], n, color: STATUS_COLOR[s] }))} /></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="أعمار الطلبات المفتوحة" sub="كم مضى على الطلبات التي لم تُنجز"><HBars items={o.aging.map((a) => ({ label: a.label, n: a.n }))} /></Card>
        <Card title="المفتوح حسب النوع">{byType.length ? <HBars items={byType} color={C.blue} /> : <p className="text-sm text-muted-foreground">لا طلبات مفتوحة.</p>}</Card>
      </div>

      <Card title="تتبّع المعاملات" sub="الأقدم أولًا. يمكن إسناد كل طلب إلى موظف ومتابعته.">
        {o.openList.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات مفتوحة.</p> : (
          <ul className="divide-y">
            {o.openList.slice(0, 15).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.age > SLA_DAYS ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{r.age} يوم</span>
                <Link href={`/staff/r/${r.id}`} className="font-medium hover:text-primary">{typeLabel(r)}</Link>
                <span className="text-muted-foreground">{STATUS_AR[r.status]}</span>
                <form action={assignRequest} className="ms-auto flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="to" defaultValue={r.assigned_to ?? ""} aria-label="الموظف المسؤول" className="min-h-10 rounded-lg border bg-background px-2 text-sm"><option value="">غير مُسند</option>{people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select>
                  <button className="min-h-10 rounded-lg border px-3 text-sm active:bg-muted">حفظ</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {o.openList.length > 15 && <Link href="/staff/requests" className="mt-2 inline-block text-sm font-semibold text-primary">عرض الباقي ({o.openList.length - 15}) ←</Link>}
      </Card>

      <Card title="أداء الموظفين" sub={`مؤشر من ١٠٠: ٥٠٪ نسبة الإنجاز مما عالجه · ٣٠٪ الإنجاز خلال ${SLA_DAYS} أيام · ٢٠٪ أول استجابة خلال ${FIRST_RESPONSE_H} ساعة. لا يُحتسب قبل ٣ طلبات معالَجة.`}>
        {o.perf.length === 0 ? <p className="text-sm text-muted-foreground">لا موظفين مسجّلين.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-start text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>الموظف</th><th>عالج</th><th>أنجز</th><th>في الموعد</th><th>استجابة سريعة</th><th>مفتوح عنده</th><th>متأخر</th><th>المؤشر</th></tr></thead>
            <tbody className="divide-y">{o.perf.map((p) => (
              <tr key={p.user_id} className="[&>td]:px-2 [&>td]:py-2.5"><td className="font-medium">{p.display_name}<span className="ms-2 text-xs text-muted-foreground">{ROLE_AR[p.role]}</span></td><td>{p.handled}</td><td>{p.closed}</td><td>{p.onTime === null ? "—" : `${p.onTime}%`}</td><td>{p.fast === null ? "—" : `${p.fast}%`}</td><td>{p.openAssigned}</td><td className={p.overdueAssigned ? "font-bold text-destructive" : ""}>{p.overdueAssigned}</td>
                <td>{p.score === null ? <span className="text-xs text-muted-foreground">بيانات غير كافية</span> : <span className="inline-flex items-center gap-2"><b>{p.score}</b><span className="h-2 w-16 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${p.score}%`, background: p.score >= 70 ? C.green : p.score >= 40 ? C.amber : C.primary }} /></span></span>}</td></tr>
            ))}</tbody></table></div>
        )}
      </Card>

      <Card title="التحصيل" sub="إيصالات مسجّلة من الموظفين. الشهر الحالي مقارنة بالسابق.">
        <div className="mb-3 flex justify-end"><Link href="/staff/collections" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground active:opacity-90">تسجيل إيصال</Link></div>
        {!hasColl ? <p className="text-sm text-muted-foreground">لم تُسجَّل مبالغ بعد.</p> : (
          <div className="grid gap-5 md:grid-cols-2">
            {o.collections.filter((c) => c.count > 0).map((c) => (
              <div key={c.currency} className="space-y-3">
                <div className="flex items-baseline justify-between"><b className="text-2xl text-primary">{money(c.month, c.currency)}</b><span className="text-xs text-muted-foreground">الشهر الماضي: {money(c.prev, c.currency)}</span></div>
                <Columns data={c.series} label={`التحصيل اليومي بـ${c.currency === "USD" ? "الدولار" : "الليرة"}`} />
                {c.byCollector.length > 0 && <HBars items={c.byCollector.map((x) => ({ label: name(x.id), n: x.v }))} color={C.green} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </main></>
  );
}
