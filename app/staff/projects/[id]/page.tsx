import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import ProgressBars from "@/components/projects/ProgressBars";
import ContractForm from "@/components/projects/ContractForm";
import ContractControls from "@/components/projects/ContractControls";
import { uuidOk } from "@/lib/council";
import { CONTRACT_STATUS, PRIORITY, PROJECT_STATUS, financialConsumption, fmtPct, isDelayed, physicalProgress, plannedProgress, scheduleVariance, contractErr } from "@/lib/projects";
import { addMilestone, setMilestoneProgress, setProjectStatus, setSpend } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ملف المشروع — BALADI ONE", referrer: "no-referrer" as const };
const fd = (d: string | null) => (d ? new Intl.DateTimeFormat("ar-LB", { dateStyle: "long", timeZone: "Asia/Beirut" }).format(new Date(d)) : "—");
const ft = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-11 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
const EV: Record<string, string> = { created: "إنشاء المشروع", status: "الحالة", milestone: "مرحلة جديدة", progress: "تقدّم مرحلة", spend: "المصروف", contract: "عقد", note: "ملاحظة" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data: p } = await sb.from("project").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const { data: dd } = await sb.from("municipal_decision").select("id,decision_no,year,title").in("legal_status", ["adopted", "under_review", "effective"]).order("created_at", { ascending: false }).limit(100);
  const decOpts = ((dd ?? []) as { id: string; decision_no: string; year: number; title: string }[]).map((d) => ({ id: d.id, label: `${d.decision_no}/${d.year} — ${d.title}` }));
  const [ms, ev, cs, dec] = await Promise.all([
    sb.from("project_milestone").select("id,title,weight,progress_pct,planned_pct,due_on").eq("project_id", id).order("created_at"),
    sb.from("project_update").select("id,kind,from_value,to_value,note,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(200),
    sb.from("contract").select("id,contractor,subject,value,currency,start_on,end_on,status,procurement_method,published_on,award_notice_on,ppa_notice_on,signed_on,decision_id,justification").eq("project_id", id).order("created_at"),
    p.decision_id ? sb.from("municipal_decision").select("id,decision_no,year,title").eq("id", p.decision_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const mm = ms.data ?? [];
  const actual = physicalProgress(mm), planned = plannedProgress(mm, p, t), fin = financialConsumption(p.spent_amount, p.budget_amount), variance = scheduleVariance(actual, planned);
  const cu = p.currency === "LBP" ? "ل.ل." : "$";
  const label = (kind: string, v: string | null) => (v ? (kind === "status" ? PROJECT_STATUS[v] ?? v : kind === "contract" ? CONTRACT_STATUS[v] ?? v : kind === "progress" ? `${v}%` : v) : "");
  return (
    <><StaffHeader back="/staff/projects" backLabel="المشاريع" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div className="space-y-2"><h1 className="text-2xl font-bold">{p.title}</h1>
        <p className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-accent px-3 py-1 font-bold text-primary">{PROJECT_STATUS[p.status]}</span><span className="rounded-full bg-muted px-3 py-1 font-bold">أولوية {PRIORITY[p.priority]}</span>
          {isDelayed(p, t) && <span className="rounded-full bg-destructive/10 px-3 py-1 font-bold text-destructive">تجاوز الموعد المحدد</span>}{p.is_demo && <span className="rounded bg-muted px-2 py-1">تجريبي</span>}</p></div>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{sp.err === "pct" ? "النسبة يجب أن تكون بين 0 و100." : contractErr(sp.err)}</p>}

      <section className="elev grid gap-3 rounded-2xl border bg-background p-4 text-sm sm:grid-cols-3">
        <p><span className="text-muted-foreground">الموقع</span><br /><b>{p.location_text || "—"}</b></p>
        <p><span className="text-muted-foreground">المسؤول</span><br /><b>{p.responsible || "—"}</b></p>
        <p><span className="text-muted-foreground">الفترة</span><br /><b>{fd(p.start_on)} ← {fd(p.due_on)}</b></p>
        <p><span className="text-muted-foreground">الموازنة</span><br /><b>{p.budget_amount === null ? "—" : `${Number(p.budget_amount).toLocaleString("en-US")} ${cu}`}</b></p>
        <p><span className="text-muted-foreground">المصروف</span><br /><b>{Number(p.spent_amount).toLocaleString("en-US")} {cu}</b></p>
        <p><span className="text-muted-foreground">فرق الجدول (فعلي − مخطط)</span><br /><b>{variance === null ? "—" : `${variance > 0 ? "+" : ""}${Math.round(variance)} نقطة`}</b></p>
        {p.description && <p className="whitespace-pre-wrap leading-7 sm:col-span-3"><span className="text-muted-foreground">الوصف</span><br />{p.description}</p>}
        <div className="sm:col-span-3"><ProgressBars actual={actual} planned={planned} financial={fin} />
          {planned !== null && !mm.some((m) => m.planned_pct !== null) && <p className="mt-2 text-xs text-muted-foreground">المخطط محسوب خطيًا بين تاريخ البدء والموعد المتوقع لعدم إدخال نسب مخططة للمراحل.</p>}</div>
        {dec.data && <Link href={`/staff/council/decisions/${dec.data.id}`} className="font-semibold text-primary sm:col-span-3">← القرار المرتبط: {dec.data.decision_no}/{dec.data.year} — {dec.data.title}</Link>}
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">حالة المشروع</h2>
        <form action={setProjectStatus} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={id} />
          <select name="value" defaultValue={p.status} aria-label="الحالة" className={field}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="note" maxLength={500} placeholder="ملاحظة أو سبب (اختياري)" aria-label="ملاحظة" className={`${field} min-w-0 flex-1`} />
          <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ</button></form>
        <p className="text-xs text-muted-foreground">لا تتغير الحالة تلقائيًا؛ التأخر يُعرض كتنبيه مشتق من الموعد ولا يغيّر الحالة.</p>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">المراحل والتقدّم ({fmtPct(actual)})</h2>
        <ul className="divide-y text-sm">{mm.map((m) => (
          <li key={m.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-2"><b>{m.title}</b><span className="text-xs text-muted-foreground">الوزن {Number(m.weight)}{m.planned_pct !== null ? ` · المخطط ${Number(m.planned_pct)}%` : ""}{m.due_on ? ` · حتى ${fd(m.due_on)}` : ""}</span></div>
            <form action={setMilestoneProgress} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="milestone" value={m.id} />
              <label className="text-xs">الإنجاز %<input name="pct" required inputMode="decimal" defaultValue={Number(m.progress_pct)} className={`${field} ms-2 w-24`} /></label>
              <input name="note" maxLength={500} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className={`${field} min-w-0 flex-1`} />
              <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">تحديث</button></form>
          </li>))}</ul>
        {mm.length === 0 && <p className="text-sm text-muted-foreground">لا مراحل بعد؛ الإنجاز الفعلي غير محسوب حتى تُضاف مراحل.</p>}
        <form action={addMilestone} className="grid gap-2 sm:grid-cols-4"><input type="hidden" name="id" value={id} />
          <input name="title" required maxLength={300} placeholder="مرحلة جديدة" aria-label="المرحلة" className={`${field} sm:col-span-2`} />
          <input name="weight" inputMode="decimal" placeholder="الوزن (افتراضي 1)" aria-label="الوزن" className={field} />
          <input name="planned" inputMode="decimal" placeholder="المخطط % (اختياري)" aria-label="المخطط" className={field} />
          <input type="date" name="due" aria-label="موعد المرحلة" className={`${field} sm:col-span-2`} />
          <button className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground active:opacity-90 sm:col-span-2">إضافة مرحلة</button></form>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">الصرف</h2>
        <form action={setSpend} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={id} />
          <label className="text-xs">إجمالي المصروف حتى الآن ({cu})<input name="spent" required inputMode="decimal" defaultValue={Number(p.spent_amount)} className={`${field} ms-2 w-40`} /></label>
          <input name="note" maxLength={500} placeholder="مرجع الدفعة أو ملاحظة" aria-label="ملاحظة" className={`${field} min-w-0 flex-1`} />
          <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ</button></form>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">العقود</h2>
        <ul className="divide-y text-sm">{(cs.data ?? []).map((c) => (
          <li key={c.id} className="space-y-1 py-3"><div className="flex flex-wrap items-center gap-2"><b>{c.contractor}</b><span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary">{CONTRACT_STATUS[c.status]}</span></div>
            <p>{c.subject}</p><p className="text-xs text-muted-foreground">{Number(c.value).toLocaleString("en-US")} {c.currency === "LBP" ? "ل.ل." : "$"} · {c.start_on ?? "—"} ← {c.end_on ?? "—"}</p>
            <ContractControls c={c} back={id} decisions={decOpts} /></li>))}</ul>
        {(cs.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا عقود مرتبطة.</p>}
        <details><summary className="cursor-pointer text-sm font-bold text-primary">تسجيل عقد لهذا المشروع</summary><ContractForm project={id} /></details>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">الخط الزمني</h2>
        <ol className="space-y-2 text-sm">{(ev.data ?? []).map((e) => <li key={e.id} className="flex flex-wrap gap-x-3"><span className="text-xs text-muted-foreground">{ft(e.created_at)}</span><b>{EV[e.kind]}</b><span>{e.from_value ? `${label(e.kind, e.from_value)} ← ` : ""}{label(e.kind, e.to_value)}</span>{e.note && <span className="text-muted-foreground">({e.note})</span>}</li>)}</ol>
      </section>
    </main></>
  );
}
