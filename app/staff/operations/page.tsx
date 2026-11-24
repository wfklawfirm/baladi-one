import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { REPORT_TYPES, STATUS_AR } from "@/lib/reports";
import { FIRST_RESPONSE_H, PERIODS, SLA_DAYS, parsePeriod } from "@/lib/ops";
import { buildCards, decisionStats, loadOps } from "@/lib/opsData";
import AnalyzeButton from "@/components/ops/AnalyzeButton";
import { C, Columns, Donut, HBars, IntakeChart, Spark } from "@/components/ops/Charts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { assignRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "مركز القيادة والأداء — BALADI ONE", referrer: "no-referrer" as const };
const STATUS_COLOR: Record<string, string> = { received: C.amber, in_progress: C.blue, needs_info: C.grey, done: C.green, rejected: C.primary, cancelled: "#d1d5db" };
const ROLE_AR: Record<string, string> = { staff: "موظف", mayor: "رئيس", admin: "مدير" };
const nf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const money = (n: number, c: string) => `${nf(Math.round(n))} ${c === "USD" ? "$" : "ل.ل."}`;
const typeLabel = (r: { kind: string; report_type: string | null }) => REPORT_TYPES.find(([k]) => k === r.report_type)?.[1] ?? (r.kind === "service_request" ? "طلب خدمة" : "بلاغ");

function Card({ title, sub, children, className = "", analyze }: { title: string; sub?: string; children: React.ReactNode; className?: string; analyze?: string }) {
  return <section className={`elev rounded-2xl border bg-background p-4 md:p-5 ${className}`}><div className="flex items-start justify-between gap-2"><h2 className="font-bold">{title}</h2>{analyze && <AnalyzeButton prompt={analyze} />}</div>{sub && <p className="mb-3 text-xs text-muted-foreground">{sub}</p>}<div className={sub ? "" : "mt-3"}>{children}</div></section>;
}

const MODULES = [
  { n: "01", t: "مركز القيادة", href: "/staff/operations", on: true },
  { n: "02", t: "المجلس والحوكمة", href: "/staff/council", on: true },
  { n: "03", t: "المالية والتحصيل", href: "/staff/collections", on: true },
  { n: "04", t: "التشغيل والتنفيذ", href: "/staff/requests", on: true },
  { n: "05", t: "المواطن والخدمات", href: "/staff/services", on: true },
  { n: "06", t: "التخطيط والتقارير", href: "", on: false },
];
const fmtDate = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeZone: "Asia/Beirut" }).format(new Date(d));

export default async function Operations({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const range = parsePeriod(sp.p, sp.from, sp.to);
  const d = await loadOps(sb, range);
  const { o, people, decisions, sessions } = d;
  const cards = buildCards(d);
  const ds = decisionStats(decisions);
  const name = (id: string | null) => people.find((p) => p.user_id === id)?.display_name ?? "—";
  const byType = Object.values(o.openList.reduce<Record<string, { label: string; n: number }>>((m, r) => { const l = typeLabel(r); (m[l] ??= { label: l, n: 0 }).n++; return m; }, {})).sort((a, b) => b.n - a.n);
  const hasColl = o.collections.some((c) => c.count > 0);
  const updated = new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date());
  const actions = [
    ...o.overdue.slice(0, 5).map((r) => ({ key: `r${r.id}`, kind: "شكوى متأخرة", title: `${typeLabel(r)} — منذ ${Math.floor((Date.now() - +new Date(r.created_at)) / 86_400_000)} يومًا`, why: `تجاوزت مهلة المعالجة (${SLA_DAYS} أيام)`, who: name(r.assigned_to) === "—" ? "غير مُسند" : name(r.assigned_to), href: `/staff/r/${r.id}`, pri: "عالية" })),
    ...((ds?.late ?? []).slice(0, 5).map((x) => ({ key: `d${x.id}`, kind: "قرار متأخر", title: `قرار ${x.decision_no}/${x.year}: ${x.title}`, why: `انقضى موعد التنفيذ ${x.execution_due ? fmtDate(x.execution_due) : ""}`, who: x.responsible || "غير محدد", href: `/staff/council/decisions/${x.id}`, pri: "عالية" }))),
    ...((sessions ?? []).slice(0, 3).map((x) => ({ key: `s${x.id}`, kind: "جلسة مقبلة", title: `${x.title}${x.session_no ? ` (${x.session_no})` : ""}`, why: `بتاريخ ${fmtDate(x.held_on)}`, who: "رئيس البلدية", href: `/staff/council/${x.id}`, pri: "عادية" }))),
    ...(o.unassigned > 0 ? [{ key: "un", kind: "طلبات", title: `${o.unassigned} طلبًا مفتوحًا بلا مسؤول`, why: "لا يمكن المساءلة دون إسناد", who: "رئيس البلدية", href: "#tracking", pri: "متوسطة" }] : []),
  ];
  const q = (p: string) => `/staff/operations?p=${p}`;

  return (
    <><StaffHeader back="/staff" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <nav aria-label="وحدات مساحة الرئيس" className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {MODULES.map((m) => m.on
          ? <Link key={m.n} href={m.href} aria-current={m.n === "01" ? "page" : undefined} className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold active:bg-muted ${m.n === "01" ? "border-primary bg-accent text-primary" : "bg-background"}`}><span className="text-xs text-muted-foreground">{m.n}</span>{m.t}</Link>
          : <span key={m.n} aria-disabled className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed px-3 text-sm text-muted-foreground"><span className="text-xs">{m.n}</span>{m.t}<span className="ms-auto text-[10px]">قريبًا</span></span>)}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">مركز القيادة والأداء</h1><p className="text-xs text-muted-foreground">آخر تحديث: {updated} · المصدر: طلبات المواطنين، سجل المعالجة، إيصالات التحصيل، سجل القرارات · الفترة: {range.label}</p></div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="الفترة">
          {PERIODS.filter(([k]) => k !== "custom").map(([k, v]) => <Link key={k} href={q(k)} aria-current={range.key === k ? "true" : undefined} className={`min-h-10 rounded-full border px-4 py-2 text-sm ${range.key === k ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{v}</Link>)}
          <form action="/staff/operations" className="flex items-center gap-1.5">
            <input type="hidden" name="p" value="custom" />
            <input type="date" name="from" required defaultValue={sp.from} aria-label="من" className="min-h-10 rounded-lg border bg-background px-2 text-sm" />
            <input type="date" name="to" required defaultValue={sp.to} aria-label="إلى" className="min-h-10 rounded-lg border bg-background px-2 text-sm" />
            <button className={`min-h-10 rounded-full border px-4 text-sm ${range.key === "custom" ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>تطبيق</button>
          </form>
        </div>
      </div>

      <section aria-label="المؤشرات الرئيسية" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => {
          const D = c.delta;
          const Ar = D?.dir === "up" ? ArrowUpRight : D?.dir === "down" ? ArrowDownRight : Minus;
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{c.def.ar}</span>{c.spark && <Spark values={c.spark} />}</div>
              {c.value !== null ? <b className="mt-2 block text-3xl text-primary">{c.value}</b> : <b className="mt-2 block text-base text-muted-foreground">بيانات غير متوفرة</b>}
              {c.value !== null && c.lines?.map((l) => <span key={l} className="block text-xs text-muted-foreground">{l}</span>)}
              {c.value === null && <span className="mt-1 block text-xs text-muted-foreground">{c.reason}</span>}
              {D && <span className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${D.good === null ? "text-muted-foreground" : D.good ? "text-[#2f7d4f]" : "text-destructive"}`}><Ar className="size-4" aria-hidden />{D.text} عن الفترة السابقة</span>}
              {c.def.target !== null && <span className="mt-1 block text-xs text-muted-foreground">المستهدف: {c.def.target}{c.def.unit}</span>}
            </>
          );
          const cls = "elev block rounded-2xl border bg-background p-4";
          return c.def.href === "#" ? <div key={c.def.id} className={`${cls} opacity-80`}>{inner}</div> : <Link key={c.def.id} href={c.def.href} className={`${cls} elev-hover active:bg-muted`}>{inner}</Link>;
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="الوارد والمنجز" sub={`أعمدة: واردة · خط: منجزة (${range.label}، مقارنة بالسابقة: ${o.intakePrev} واردة / ${o.processedPrev} منجزة)`} className="lg:col-span-2" analyze="حلّل مؤشر الوارد والمنجز في الفترة المحددة: الاتجاه والانحرافات وحدود البيانات ثم اقترح إجراءات"><IntakeChart data={o.series} /></Card>
        <Card title="توزيع الحالات (الكل)" analyze="حلّل توزيع حالات الطلبات الحالي وما يستدعي تدخل الرئيس"><Donut parts={o.status.map(({ s, n }) => ({ label: STATUS_AR[s], n, color: STATUS_COLOR[s] }))} /></Card>
      </div>

      <Card title="مركز الإجراءات" sub="ما يستدعي تدخل رئيس البلدية الآن. كل بند يقود إلى سجله الأصلي.">
        {actions.length === 0 ? <p className="text-sm text-muted-foreground">لا بنود تستدعي تدخلًا حاليًا.</p> : (
          <ul className="divide-y">
            {actions.map((a) => (
              <li key={a.key}><Link href={a.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:text-primary">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${a.pri === "عالية" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{a.pri}</span>
                <b>{a.kind}</b><span>{a.title}</span><span className="text-muted-foreground">{a.why}</span><span className="ms-auto text-xs text-muted-foreground">المسؤول: {a.who}</span>
              </Link></li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="أعمار الطلبات المفتوحة" sub="كم مضى على الطلبات التي لم تُنجز" analyze="حلّل أعمار الطلبات المفتوحة وأسباب التأخير المحتملة"><HBars items={o.aging.map((a) => ({ label: a.label, n: a.n }))} /></Card>
        <Card title="المفتوح حسب النوع">{byType.length ? <HBars items={byType} color={C.blue} /> : <p className="text-sm text-muted-foreground">لا طلبات مفتوحة.</p>}</Card>
      </div>

      <Card title="تتبّع المعاملات" sub="الأقدم أولًا. يمكن إسناد كل طلب إلى موظف ومتابعته." className="scroll-mt-4"><div id="tracking" />
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

      <Card title="التحصيل" sub="إيصالات مسجّلة من الموظفين. الفترة المختارة مقارنة بالسابقة.">
        <div className="mb-3 flex justify-end"><Link href="/staff/collections" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground active:opacity-90">تسجيل إيصال</Link></div>
        {!hasColl ? <p className="text-sm text-muted-foreground">لم تُسجَّل مبالغ بعد.</p> : (
          <div className="grid gap-5 md:grid-cols-2">
            {o.collections.filter((c) => c.count > 0).map((c) => (
              <div key={c.currency} className="space-y-3">
                <div className="flex items-baseline justify-between"><b className="text-2xl text-primary">{money(c.month, c.currency)}</b><span className="text-xs text-muted-foreground">الفترة السابقة: {money(c.prev, c.currency)}</span></div>
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
