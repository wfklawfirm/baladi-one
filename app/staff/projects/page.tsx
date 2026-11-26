import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import ProgressBars from "@/components/projects/ProgressBars";
import { PRIORITY, PROJECT_STATUS as PS_RAW, expiringContracts, financialConsumption, isDelayed, overdueContracts, physicalProgress, plannedProgress } from "@/lib/projects";
import PageSummary, { type Todo } from "@/components/council/PageSummary";

/** Plain-language display labels (DB values unchanged). */
const PROJECT_STATUS: Record<string, string> = { ...PS_RAW, proposed: "مقترح، لم يبدأ", approved: "معتمد، لم يبدأ", active: "قيد التنفيذ" };
import { createProject } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "المشاريع والعقود — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
const money = (n: number | null, c: string) => (n === null ? "—" : `${Number(n).toLocaleString("en-US")} ${c === "LBP" ? "ل.ل." : "$"}`);

export default async function Projects({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  let q = sb.from("project").select("id,title,location_text,priority,status,responsible,start_on,due_on,budget_amount,currency,spent_amount,is_demo").order("created_at", { ascending: false }).limit(300);
  if (sp.s && PROJECT_STATUS[sp.s]) q = q.eq("status", sp.s);
  const [pr, ms, dec, all, ct] = await Promise.all([
    q,
    sb.from("project_milestone").select("project_id,weight,progress_pct,planned_pct").limit(20000),
    sb.from("municipal_decision").select("id,decision_no,year,title").order("year", { ascending: false }).limit(300),
    sb.from("project").select("id,title,status,due_on,budget_amount,spent_amount").limit(500),
    sb.from("contract").select("id,contractor,subject,status,end_on").limit(1000),
  ]);
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = (pr.data ?? []).filter((p) => !needle || p.title.toLowerCase().includes(needle) || (p.location_text ?? "").toLowerCase().includes(needle));
  const t = today();
  const everyProject = all.data ?? [], contracts = ct.data ?? [];
  const failed = !!all.error || !!ct.error;
  const delayed = everyProject.filter((p) => isDelayed(p, t));
  const running = everyProject.filter((p) => p.status === "active").length;
  const overdue = overdueContracts(contracts, t), expiring = expiringContracts(contracts, t, 30);
  const draftContracts = contracts.filter((c) => c.status === "draft");
  const todos: Todo[] = [
    ...delayed.map((p) => ({ key: `p${p.id}`, text: `مشروع «${p.title}» تجاوز موعده`, sub: `الموعد ${p.due_on}`, href: `/staff/projects/${p.id}`, cta: "افتح", tone: "bad" as const })),
    ...overdue.map((c) => ({ key: `o${c.id}`, text: `عقد ${c.contractor} انتهت مدته ولم يُغلق`, sub: c.subject.slice(0, 80), href: "/staff/projects/contracts", cta: "راجع", tone: "bad" as const })),
    ...expiring.map((c) => ({ key: `e${c.id}`, text: `عقد ${c.contractor} ينتهي ${c.end_on}`, sub: c.subject.slice(0, 80), href: "/staff/projects/contracts", cta: "راجع", tone: "warn" as const })),
    ...draftContracts.map((c) => ({ key: `c${c.id}`, text: `عقد ${c.contractor} مسودة لم يُوقَّع`, sub: c.subject.slice(0, 80), href: "/staff/projects/contracts", cta: "افتح", tone: "info" as const })),
  ];
  const needs = overdue.length + expiring.length + draftContracts.length;
  const chip = (href: string, on: boolean, label: string) => <Link key={href} href={href} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{label}</Link>;
  return (
    <><StaffHeader />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-bold">المشاريع والعقود</h1><a href="#new-project" className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground active:opacity-90">+ مشروع جديد</a></div>
      <PageSummary headline={failed ? "تعذّر تحميل بيانات المشاريع." : todos.length ? `${todos.length} ${todos.length === 1 ? "بند" : "بنود"} في المشاريع والعقود تحتاج انتباهكم.` : "المشاريع والعقود تسير دون بنود متأخرة."} todos={todos} stats={[
        { label: "مشاريع قيد التنفيذ", value: failed ? "غير متاح" : running },
        { label: "مشاريع متأخرة", value: failed ? "غير متاح" : delayed.length, tone: delayed.length ? "bad" : "ok" },
        { label: "عقود تحتاج إجراء", value: failed ? "غير متاح" : needs, tone: needs ? "warn" : "ok", href: "/staff/projects/contracts" },
      ]} />
      <details open={!!(sp.s || sp.q)} className="rounded-2xl border bg-background p-4"><summary className="min-h-11 cursor-pointer py-2 font-bold text-primary">عرض التفاصيل: كل المشاريع والبحث</summary><div className="mt-3 space-y-4">
      <div className="flex flex-wrap gap-2"><span className="flex flex-wrap gap-2"><Link href="/staff/procurement" className="rounded-xl border px-4 py-2 text-sm font-semibold active:bg-muted">الشراء العام ←</Link><Link href="/staff/projects/contracts" className="rounded-xl border px-4 py-2 text-sm font-semibold active:bg-muted">سجل العقود ←</Link></span></div>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تحقق من الحقول المطلوبة (العنوان، الموازنة، التواريخ).</p>}
      <form className="flex flex-wrap gap-2"><input name="q" defaultValue={sp.q} placeholder="بحث بالعنوان أو الموقع" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" />
        {sp.s && <input type="hidden" name="s" value={sp.s} />}<button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">بحث</button></form>
      <div className="flex flex-wrap gap-2" aria-label="الحالة">{chip("/staff/projects", !sp.s, "الكل")}{Object.entries(PROJECT_STATUS).map(([k, v]) => chip(`/staff/projects?s=${k}`, sp.s === k, v))}</div>
      <p className="text-sm text-muted-foreground">{rows.length} مشروع</p>
      {rows.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا مشاريع مسجّلة بعد.</p> : (
        <ul className="fill-odd grid gap-3 md:grid-cols-2">
          {rows.map((p) => {
            const mm = (ms.data ?? []).filter((m) => m.project_id === p.id);
            const actual = physicalProgress(mm);
            return (
              <li key={p.id} className="elev space-y-3 rounded-2xl border bg-background p-4">
                <Link href={`/staff/projects/${p.id}`} className="block space-y-1.5">
                  <b className="block text-base text-primary">{p.title}</b>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-accent px-2.5 py-0.5 font-bold text-primary">{PROJECT_STATUS[p.status]}</span>
                    {isDelayed(p, t) && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 font-bold text-destructive">تجاوز الموعد</span>}
                    <span className="rounded-full bg-muted px-2.5 py-0.5 font-bold">أولوية {PRIORITY[p.priority]}</span>
                    {p.is_demo && <span className="rounded bg-muted px-2">تجريبي</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{[p.location_text, p.responsible, p.due_on ? `الموعد ${p.due_on}` : null].filter(Boolean).join(" · ") || "—"}</span>
                </Link>
                <ProgressBars actual={actual} planned={plannedProgress(mm, p, t)} financial={financialConsumption(p.spent_amount, p.budget_amount)} />
                {actual === null && <p className="text-xs text-muted-foreground">لا مراحل مسجّلة بعد، فلا يُحتسب الإنجاز الفعلي.</p>}
                <p className="text-xs text-muted-foreground">الموازنة: {money(p.budget_amount, p.currency)} · المصروف: {money(p.spent_amount, p.currency)}</p>
              </li>);
          })}
        </ul>
      )}
      </div></details>
      <details id="new-project" className="elev rounded-2xl border bg-background p-4"><summary className="min-h-11 cursor-pointer py-2 font-bold text-primary">مشروع جديد</summary>
        <form action={createProject} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-medium sm:col-span-3">عنوان المشروع<input name="title" required maxLength={300} className={field} /></label>
          <label className="space-y-1 text-sm font-medium sm:col-span-3">الوصف<textarea name="description" rows={3} maxLength={10000} className="w-full rounded-xl border-2 bg-background p-3 outline-none focus:border-primary" /></label>
          <label className="space-y-1 text-sm font-medium">الموقع<input name="location" maxLength={300} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">المسؤول<input name="responsible" maxLength={200} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">الأولوية<select name="priority" defaultValue="normal" className={field}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">تاريخ البدء<input type="date" name="start" className={field} /></label>
          <label className="space-y-1 text-sm font-medium">الموعد المتوقع للإنجاز<input type="date" name="due" className={field} /></label>
          <label className="space-y-1 text-sm font-medium">القرار المرتبط (اختياري)<select name="decision" className={field}><option value="">دون قرار</option>{(dec.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.decision_no}/{d.year} — {d.title}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">الموازنة (اختياري)<input name="budget" inputMode="decimal" className={field} /></label>
          <label className="space-y-1 text-sm font-medium">العملة<select name="currency" className={field}><option value="USD">دولار</option><option value="LBP">ليرة لبنانية</option></select></label>
          <p className="text-xs text-muted-foreground sm:col-span-3">يُسجَّل المشروع بحالة «مقترح». الأرقام المدخلة هي ما تُعرض؛ لا تقديرات تلقائية.</p>
          <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 sm:col-span-3">تسجيل المشروع</button>
        </form></details>
    </main></>
  );
}
