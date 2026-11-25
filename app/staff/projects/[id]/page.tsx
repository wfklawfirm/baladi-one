import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import ProgressBars from "@/components/projects/ProgressBars";
import ContractForm from "@/components/projects/ContractForm";
import ContractControls from "@/components/projects/ContractControls";
import { uuidOk } from "@/lib/council";
import { CONTRACT_STATUS, PRIORITY, PROJECT_STATUS, financialConsumption, fmtPct, isDelayed, physicalProgress, plannedProgress, scheduleVariance, contractErr } from "@/lib/projects";
import { Chip, Empty, Explain, Field, Intro, Notice, StepCard, CONTROL, BTN_PRIMARY, BTN_SECONDARY } from "@/components/simple/kit";
import { addMilestone, setMilestoneProgress, setProjectStatus, setSpend } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ملف المشروع — BALADI ONE", referrer: "no-referrer" as const };
const fd = (d: string | null) => (d ? new Intl.DateTimeFormat("ar-LB", { dateStyle: "long", timeZone: "Asia/Beirut" }).format(new Date(d)) : "—");
const ft = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = CONTROL;
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
    sb.from("contract").select("id,contractor,subject,value,currency,start_on,end_on,status,procurement_method,published_on,award_notice_on,ppa_notice_on,signed_on,decision_id,justification,objection_pending,objection_resolved_on").eq("project_id", id).order("created_at"),
    p.decision_id ? sb.from("municipal_decision").select("id,decision_no,year,title").eq("id", p.decision_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const mm = ms.data ?? [];
  const actual = physicalProgress(mm), planned = plannedProgress(mm, p, t), fin = financialConsumption(p.spent_amount, p.budget_amount), variance = scheduleVariance(actual, planned);
  const cu = p.currency === "LBP" ? "ل.ل." : "$";
  const label = (kind: string, v: string | null) => (v ? (kind === "status" ? PROJECT_STATUS[v] ?? v : kind === "contract" ? CONTRACT_STATUS[v] ?? v : kind === "progress" ? `${v}%` : v) : "");
  const rel = variance === null ? null : variance >= 0 ? `متقدّم بمقدار ${Math.round(variance)} نقطة عن الخطة` : `متأخر بمقدار ${Math.abs(Math.round(variance))} نقطة عن الخطة`;
  return (
    <><StaffHeader back="/staff/projects" backLabel="المشاريع" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <Intro title={p.title}>هذه صفحة المشروع كاملة: حالته، وتقدّم الأعمال، والمبالغ المصروفة، وعقوده. حدّثوا ما تغيّر ثم اضغطوا «حفظ» تحت كل بطاقة.</Intro>
      <p className="flex flex-wrap gap-2"><Chip tone="info">{PROJECT_STATUS[p.status]}</Chip><Chip tone="info">الأولوية: {PRIORITY[p.priority]}</Chip>
        {isDelayed(p, t) && <Chip tone="bad">تجاوز الموعد المحدد</Chip>}{p.is_demo && <Chip tone="info">تجريبي</Chip>}</p>
      {sp.err && <Notice tone="bad">{sp.err === "pct" ? "النسبة يجب أن تكون رقمًا بين 0 و100." : contractErr(sp.err)}</Notice>}

      <section className="grid gap-3 rounded-3xl border bg-background p-4 text-base sm:grid-cols-2">
        <p><span className="text-muted-foreground">أين؟</span><br /><b>{p.location_text || "غير مسجّل"}</b></p>
        <p><span className="text-muted-foreground">من المسؤول؟</span><br /><b>{p.responsible || "غير مسجّل"}</b></p>
        <p><span className="text-muted-foreground">من متى إلى متى؟</span><br /><b>{fd(p.start_on)} ← {fd(p.due_on)}</b></p>
        <p><span className="text-muted-foreground">المخصّص للمشروع</span><br /><b>{p.budget_amount === null ? "غير محدد" : `${Number(p.budget_amount).toLocaleString("en-US")} ${cu}`}</b></p>
        <p><span className="text-muted-foreground">ما صُرف حتى الآن</span><br /><b>{Number(p.spent_amount).toLocaleString("en-US")} {cu}</b></p>
        <p><span className="text-muted-foreground">هل نحن على الجدول؟</span><br /><b>{rel ?? "غير محسوب بعد"}</b></p>
        {p.description && <p className="whitespace-pre-wrap leading-7 sm:col-span-2"><span className="text-muted-foreground">عن المشروع</span><br />{p.description}</p>}
        <div className="sm:col-span-2"><ProgressBars actual={actual} planned={planned} financial={fin} />
          {planned !== null && !mm.some((m) => m.planned_pct !== null) && <p className="mt-2 text-sm text-muted-foreground">الخطة محسوبة بالتساوي بين تاريخ البدء والموعد المتوقع، لأنكم لم تدخلوا نسبًا مخططة للمراحل.</p>}</div>
        {dec.data && <Link href={`/staff/council/decisions/${dec.data.id}`} className="font-semibold text-primary sm:col-span-2">← القرار المرتبط بالمشروع: {dec.data.decision_no}/{dec.data.year} — {dec.data.title}</Link>}
      </section>

      <StepCard n={1} title="كيف حال المشروع؟" hint="اختاروا الحالة الحالية. لا تتغير الحالة وحدها؛ التأخر يظهر تنبيهًا فقط.">
        <form action={setProjectStatus} className="space-y-3"><input type="hidden" name="id" value={id} />
          <Field label="الحالة"><select name="value" defaultValue={p.status} className={field}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="ملاحظة أو سبب" hint="اختياري"><input name="note" maxLength={500} className={field} /></Field>
          <button className={BTN_PRIMARY}>حفظ الحالة</button></form>
      </StepCard>

      <StepCard n={2} title={`تقدّم الأعمال (${fmtPct(actual)} منجز)`} hint="كل مرحلة جزء من المشروع. اكتبوا نسبة ما أُنجز منها ثم اضغطوا «تحديث».">
        <ul className="space-y-3">{mm.map((m) => (
          <li key={m.id} className="space-y-2 rounded-2xl border p-3">
            <div className="flex flex-wrap items-center gap-2"><b className="text-base">{m.title}</b><span className="text-sm text-muted-foreground">{m.due_on ? `حتى ${fd(m.due_on)}` : ""}{m.planned_pct !== null ? ` · المخطط ${Number(m.planned_pct)}%` : ""}</span></div>
            <form action={setMilestoneProgress} className="space-y-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="milestone" value={m.id} />
              <Field label="كم أُنجز من هذه المرحلة؟ (٪)" example="60"><input name="pct" required inputMode="decimal" defaultValue={Number(m.progress_pct)} className={`${field} sm:w-40`} /></Field>
              <Field label="ملاحظة" hint="اختياري"><input name="note" maxLength={500} className={field} /></Field>
              <button className={BTN_SECONDARY}>تحديث</button></form>
          </li>))}</ul>
        {mm.length === 0 && <Empty>لا توجد مراحل بعد. أضيفوا أول مرحلة من الأسفل ليُحسب التقدّم.</Empty>}
        <form action={addMilestone} className="space-y-3 rounded-2xl bg-muted/40 p-3"><input type="hidden" name="id" value={id} />
          <b className="block">إضافة مرحلة جديدة</b>
          <Field label="اسم المرحلة" required example="تمديد الشبكة"><input name="title" required maxLength={300} className={field} /></Field>
          <Field label="موعد انتهائها" hint="اختياري"><input type="date" name="due" className={field} /></Field>
          <details className="rounded-xl border bg-background px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">حقول إضافية</summary>
            <div className="space-y-3 pt-3">
              <Field label="وزن المرحلة" hint="كم تساوي من المشروع؟ إن تركتموه فارغًا تُعدّ المراحل متساوية." example="2"><input name="weight" inputMode="decimal" className={field} /></Field>
              <Field label="النسبة المخططة (٪)" hint="كم كان يجب أن يُنجز منها الآن؟"><input name="planned" inputMode="decimal" className={field} /></Field>
            </div></details>
          <button className={BTN_PRIMARY}>إضافة المرحلة</button></form>
      </StepCard>

      <StepCard n={3} title="المبالغ المصروفة" hint={`اكتبوا مجموع ما صُرف على المشروع حتى اليوم (${cu}).`}>
        <form action={setSpend} className="space-y-3"><input type="hidden" name="id" value={id} />
          <Field label="إجمالي المصروف حتى الآن" required><input name="spent" required inputMode="decimal" defaultValue={Number(p.spent_amount)} className={`${field} sm:w-56`} /></Field>
          <Field label="مرجع الدفعة أو ملاحظة" hint="اختياري"><input name="note" maxLength={500} className={field} /></Field>
          <button className={BTN_PRIMARY}>حفظ المبلغ</button></form>
      </StepCard>

      <StepCard n={4} title="العقود" hint="العقود المرتبطة بهذا المشروع، وما تحتاجه من إجراء.">
        <ul className="space-y-3">{(cs.data ?? []).map((c) => (
          <li key={c.id} className="space-y-1 rounded-2xl border p-3"><div className="flex flex-wrap items-center gap-2"><b className="text-base">{c.contractor}</b><Chip tone="info">{CONTRACT_STATUS[c.status]}</Chip></div>
            <p>{c.subject}</p><p className="text-sm text-muted-foreground">{Number(c.value).toLocaleString("en-US")} {c.currency === "LBP" ? "ل.ل." : "$"} · من {c.start_on ?? "—"} إلى {c.end_on ?? "—"}</p>
            <ContractControls c={c} back={id} decisions={decOpts} /></li>))}</ul>
        {(cs.data ?? []).length === 0 && <Empty>لا عقود مرتبطة بهذا المشروع بعد.</Empty>}
        <details className="rounded-2xl border px-3 py-2"><summary className="cursor-pointer text-base font-bold text-primary">+ تسجيل عقد لهذا المشروع</summary><div className="pt-3"><ContractForm project={id} /></div></details>
        <Explain term="العقد">اتفاق مكتوب مع مقاول أو مورّد لتنفيذ عمل أو توريد مواد لقاء مبلغ ومدة محددين.</Explain>
      </StepCard>

      <StepCard n={5} title="سجل ما جرى" hint="كل تغيير على المشروع مع وقته، من الأحدث إلى الأقدم.">
        <ol className="space-y-2 text-base">{(ev.data ?? []).map((e) => <li key={e.id} className="flex flex-wrap gap-x-3"><span className="text-xs text-muted-foreground">{ft(e.created_at)}</span><b>{EV[e.kind]}</b><span>{e.from_value ? `${label(e.kind, e.from_value)} ← ` : ""}{label(e.kind, e.to_value)}</span>{e.note && <span className="text-muted-foreground">({e.note})</span>}</li>)}</ol>
        {(ev.data ?? []).length === 0 && <Empty>لا أحداث مسجّلة بعد.</Empty>}
      </StepCard>
    </main></>
  );
}
