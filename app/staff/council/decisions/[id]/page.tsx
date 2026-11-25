import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { CATEGORY, EXEC_STATUS, LEGAL_STATUS, VALIDATION_LEVEL, decisionAlerts, isLate, uuidOk } from "@/lib/council";
import { addTask, setDecisionStatus, setReview, toggleTask } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ملف القرار — BALADI ONE", referrer: "no-referrer" as const };
const fd = (d: string | null) => (d ? new Intl.DateTimeFormat("ar-LB", { dateStyle: "long", timeZone: "Asia/Beirut" }).format(new Date(d)) : "—");
const ft = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-11 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
const EV: Record<string, string> = { created: "إنشاء السجل", legal_status: "الحالة القانونية", execution_status: "حالة التنفيذ", task: "مهمة جديدة", note: "ملاحظة" };

export default async function DecisionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data: d } = await sb.from("municipal_decision").select("*").eq("id", id).maybeSingle();
  if (!d) notFound();
  const [ev, tk, rs] = await Promise.all([
    sb.from("decision_event").select("id,kind,from_value,to_value,note,created_at").eq("decision_id", id).order("created_at", { ascending: false }),
    sb.from("decision_task").select("id,title,assignee,due_on,done").eq("decision_id", id).order("created_at"),
    sb.rpc("ops_roster"),
  ]);
  const people = (rs.data ?? []) as { user_id: string; display_name: string | null; role: string }[];
  const who = (u: string | null) => people.find((p) => p.user_id === u)?.display_name ?? "—";
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const late = isLate(d, t);
  const alerts = decisionAlerts(d, t);
  const label = (kind: string, v: string | null) => (v ? (kind === "legal_status" ? LEGAL_STATUS[v] : kind === "execution_status" ? EXEC_STATUS[v] : v) : "");
  return (
    <><StaffHeader back="/staff/council/decisions" backLabel="السجل" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <div className="space-y-2"><h1 className="text-2xl font-bold">قرار {d.decision_no}/{d.year}: {d.title}</h1>
        <p className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-accent px-3 py-1 font-bold text-primary">قانونيًا: {LEGAL_STATUS[d.legal_status]}</span><span className="rounded-full bg-muted px-3 py-1 font-bold">تنفيذًا: {EXEC_STATUS[d.execution_status]}</span>{late && <span className="rounded-full bg-destructive/10 px-3 py-1 font-bold text-destructive">متأخر عن موعد التنفيذ</span>}{d.is_demo && <span className="rounded bg-muted px-2 py-1">تجريبي</span>}</p></div>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{sp.err === "date" ? "حدّد تاريخ النفاذ الوارد في المستند الرسمي." : sp.err === "validation" ? "لا يمكن تسجيل النفاذ قبل تسجيل تاريخ تصديق سلطة الرقابة، أو انقضاء مهلة الشهر من تاريخ استلامها للقرار (للفئات التي تسري عليها)." : "تعذّر تنفيذ العملية."}</p>}

      <section className="elev grid gap-3 rounded-2xl border bg-background p-4 text-sm sm:grid-cols-3">
        <p><span className="text-muted-foreground">تاريخ الاتخاذ</span><br /><b>{fd(d.decided_on)}</b></p>
        <p><span className="text-muted-foreground">التصويت (مع/ضد/امتناع)</span><br /><b>{d.vote_for ?? "—"} / {d.vote_against ?? "—"} / {d.vote_abstain ?? "—"}</b></p>
        <p><span className="text-muted-foreground">الجهة الرقابية</span><br /><b>{d.review_authority || "—"}</b></p>
        <p><span className="text-muted-foreground">تاريخ النفاذ (من المستند الرسمي)</span><br /><b>{fd(d.effective_on)}</b></p>
        <p><span className="text-muted-foreground">موعد التنفيذ</span><br /><b>{fd(d.execution_due)}</b></p>
        <p><span className="text-muted-foreground">المسؤول عن التنفيذ</span><br /><b>{d.responsible || "—"}</b></p>
        {d.legal_basis && <p className="sm:col-span-3"><span className="text-muted-foreground">الأساس القانوني</span><br />{d.legal_basis}</p>}
        {d.body && <p className="whitespace-pre-wrap leading-7 sm:col-span-3"><span className="text-muted-foreground">نص القرار</span><br />{d.body}</p>}
      </section>

      {alerts.length > 0 && <ul className="space-y-1 rounded-2xl border border-amber-400/60 bg-amber-50 p-4 text-sm leading-7 text-amber-950">{alerts.map((a) => <li key={a}>⚠ {a}</li>)}</ul>}

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">الإرسال والتصديق (المرسوم الاشتراعي 118/1977)</h2>
        <p className="text-xs leading-6 text-muted-foreground">ترسل قرارات المجلس إلى سلطة الرقابة خلال ثمانية أيام (م.58). بعض القرارات تحتاج تصديق القائمقام أو المحافظ أو الوزير (م.60–62)، وتُعدّ مصدَّقة حكمًا بانقضاء شهر من تسجيلها إلا قرارات الموازنة والحسابات والتنظيم المدني والقروض (م.63). النظام يذكّر فقط ولا يغيّر أي حالة قانونية تلقائيًا. تحقّق من النص الرسمي النافذ وتعديلاته.</p>
        <form action={setReview} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="id" value={id} />
          <label className="space-y-1 text-sm font-medium">فئة القرار<select name="category" defaultValue={d.category} className={`${field} w-full`}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">سلطة التصديق<select name="level" defaultValue={d.validation_level} className={`${field} w-full`}>{Object.entries(VALIDATION_LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">تاريخ الإرسال<input type="date" name="sent" defaultValue={d.sent_on ?? ""} className={`${field} w-full`} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ الاستلام لدى السلطة<input type="date" name="received" defaultValue={d.received_on ?? ""} className={`${field} w-full`} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ التصديق الخطي<input type="date" name="validated" defaultValue={d.validated_on ?? ""} className={`${field} w-full`} /></label>
          <label className="space-y-1 text-sm font-medium">ملاحظة<input name="note" defaultValue={d.validation_note ?? ""} maxLength={1000} className={`${field} w-full`} /></label>
          <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted sm:col-span-3">حفظ بيانات الإرسال والتصديق</button></form>
        <p className="text-xs text-muted-foreground">الفئة: <b>{CATEGORY[d.category]}</b> · السلطة: <b>{VALIDATION_LEVEL[d.validation_level]}</b>{d.validated_on ? <> · مصدَّق بتاريخ <b>{fd(d.validated_on)}</b></> : null}</p>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">تحديث الحالة</h2>
        <div className="fill-odd grid gap-4 md:grid-cols-2">
          <form action={setDecisionStatus} className="space-y-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value="legal" />
            <p className="text-sm font-semibold">الحالة القانونية والإجرائية</p>
            <select name="value" defaultValue={d.legal_status} aria-label="الحالة القانونية" className={`${field} w-full`}>{Object.entries(LEGAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <label className="block text-xs text-muted-foreground">تاريخ النفاذ (إلزامي عند اختيار «نافذ»، من المستند الرسمي)<input type="date" name="date" defaultValue={d.effective_on ?? ""} className={`${field} mt-1 w-full`} /></label>
            <input name="note" maxLength={500} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className={`${field} w-full`} />
            <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ</button></form>
          <form action={setDecisionStatus} className="space-y-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value="execution" />
            <p className="text-sm font-semibold">حالة التنفيذ الفعلي</p>
            <select name="value" defaultValue={d.execution_status} aria-label="حالة التنفيذ" className={`${field} w-full`}>{Object.entries(EXEC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="note" maxLength={500} placeholder="سبب أو دليل التنفيذ (اختياري)" aria-label="ملاحظة" className={`${field} w-full`} />
            <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ</button></form>
        </div>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">مهام التنفيذ والمهل</h2>
        <ul className="divide-y text-sm">{(tk.data ?? []).map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
            <form action={toggleTask}><input type="hidden" name="task" value={k.id} /><input type="hidden" name="id" value={id} /><input type="hidden" name="done" value={k.done ? "0" : "1"} />
              <button aria-label={k.done ? "إلغاء الإنجاز" : "تحديد كمنجزة"} className={`grid size-7 place-items-center rounded-md border-2 ${k.done ? "border-primary bg-primary text-primary-foreground" : ""}`}>{k.done ? "✓" : ""}</button></form>
            <span className={k.done ? "text-muted-foreground line-through" : "font-medium"}>{k.title}</span>
            <span className="text-xs text-muted-foreground">{who(k.assignee)}{k.due_on ? ` · حتى ${fd(k.due_on)}` : ""}</span>
            {!k.done && k.due_on && k.due_on < t && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">متأخرة</span>}
          </li>))}</ul>
        {(tk.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا مهام بعد.</p>}
        <form action={addTask} className="grid gap-2 sm:grid-cols-4"><input type="hidden" name="id" value={id} />
          <input name="title" required maxLength={300} placeholder="مهمة جديدة" aria-label="المهمة" className={`${field} sm:col-span-2`} />
          <select name="to" aria-label="المسؤول" className={field}><option value="">دون إسناد</option>{people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name || p.role}</option>)}</select>
          <input type="date" name="due" aria-label="المهلة" className={field} />
          <button className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground active:opacity-90 sm:col-span-4">إضافة مهمة</button></form>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">الخط الزمني</h2>
        <ol className="space-y-2 text-sm">{(ev.data ?? []).map((e) => <li key={e.id} className="flex flex-wrap gap-x-3"><span className="text-xs text-muted-foreground">{ft(e.created_at)}</span><b>{EV[e.kind]}</b><span>{e.from_value ? `${label(e.kind, e.from_value)} ← ` : ""}{label(e.kind, e.to_value)}</span>{e.note && <span className="text-muted-foreground">({e.note})</span>}</li>)}</ol>
      </section>
      {d.session_id && <Link href={`/staff/council/${d.session_id}`} className="inline-block text-sm font-semibold text-primary">← جلسة المجلس المرتبطة</Link>}
    </main></>
  );
}
