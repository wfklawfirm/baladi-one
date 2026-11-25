import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import LegalPanel from "@/components/legal/LegalPanel";
import { CATEGORY, EXEC_STATUS, LEGAL_STATUS, VALIDATION_LEVEL, decisionAlerts, isLate, uuidOk } from "@/lib/council";
import { BTN_PRIMARY, BTN_SECONDARY, CONTROL, Chip, Empty, Explain, Field, Intro, Notice, StepCard } from "@/components/simple/kit";
import { addTask, setDecisionStatus, setReview, toggleTask } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ملف القرار — BALADI ONE", referrer: "no-referrer" as const };
const fd = (d: string | null) => (d ? new Intl.DateTimeFormat("ar-LB", { dateStyle: "long", timeZone: "Asia/Beirut" }).format(new Date(d)) : "—");
const ft = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));
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
  const NO_TACIT = "قرارات التخطيط والموازنة ونقل الاعتمادات والقروض";
  const objected = d.legal_status === "objected" || d.legal_status === "rejected" || d.legal_status === "annulled";
  const tl = [
    { k: "decided", label: "اتُّخذ القرار", on: d.decided_on, done: !!d.decided_on },
    { k: "sent", label: "أُرسل للتصديق", on: d.sent_on, done: !!d.sent_on },
    { k: "valid", label: objected ? "اعتُرض عليه" : "صُدّق", on: d.validated_on, done: !!d.validated_on || objected },
    { k: "pub", label: "نُشر أو بُلّغ", on: d.published_on ?? d.notified_on, done: !!(d.published_on || d.notified_on) },
  ];
  const nextIdx = tl.findIndex((x) => !x.done);
  const next = !d.sent_on
    ? { text: "أرسلوا القرار إلى سلطة الرقابة وسجّلوا تاريخ الإرسال.", href: "#send", btn: "سجّلوا الإرسال" }
    : !d.validated_on && !objected
      ? { text: "بانتظار تصديق سلطة الرقابة. عند وصوله سجّلوا تاريخه.", href: "#send", btn: "سجّلوا التصديق" }
      : d.execution_status !== "done" && d.execution_status !== "completed"
        ? { text: "حدّثوا حالة التنفيذ أو أضيفوا مهمة للمتابعة.", href: "#tasks", btn: "تابعوا التنفيذ" }
        : null;
  const done = !next;
  return (
    <><StaffHeader back="/staff/council/decisions" backLabel="السجل" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <Intro title={`قرار ${d.decision_no}/${d.year}: ${d.title}`}>هنا ترون أين وصل هذا القرار: هل أُرسل؟ هل صُدّق؟ هل نُفّذ؟ وما الخطوة الواحدة المطلوبة منكم الآن.</Intro>
      {d.template_snapshot && <p><Link href={`/staff/decisions/${d.id}`} className={BTN_SECONDARY}>فتح في منشئ القرارات (المحرر والطباعة والتصدير)</Link></p>}
      <p className="flex flex-wrap gap-2"><Chip tone={d.legal_status === "effective" ? "ok" : objected ? "bad" : "wait"}>قانونيًا: {LEGAL_STATUS[d.legal_status]}</Chip><Chip tone="info">تنفيذًا: {EXEC_STATUS[d.execution_status]}</Chip>{late && <Chip tone="bad">متأخر</Chip>}</p>
      {sp.err && <Notice tone="bad">{sp.err === "date" ? "حدّد تاريخ النفاذ الوارد في المستند الرسمي." : sp.err === "validation" ? "لا يمكن تسجيل النفاذ قبل تسجيل تاريخ تصديق سلطة الرقابة، أو انقضاء مهلة الشهر من تاريخ استلامها للقرار (للفئات التي تسري عليها)." : "تعذّر تنفيذ العملية."}</Notice>}

      <StepCard title="أين وصل القرار؟">
        <ol className="space-y-3">{tl.map((x, i) => (
          <li key={x.k} className="flex flex-wrap items-center gap-3"><Chip tone={x.done ? (x.k === "valid" && objected ? "bad" : "ok") : i === nextIdx ? "wait" : "info"}>{x.done ? "تم" : i === nextIdx ? "الآن" : "لاحقًا"}</Chip><b>{x.label}</b>{x.on && <span className="text-sm text-muted-foreground">{fd(x.on)}</span>}</li>))}</ol>
        {next ? <div className="space-y-2 rounded-2xl bg-accent p-4"><p className="font-bold">ما الخطوة التالية؟</p><p>{next.text}</p><a href={next.href} className={BTN_PRIMARY}>{next.btn}</a></div>
          : <Notice>اكتملت مراحل هذا القرار. لا شيء مطلوب منكم الآن.</Notice>}
      </StepCard>

      {alerts.length > 0 && <ul className="space-y-1 rounded-2xl border-2 border-amber-400/60 bg-amber-50 p-4 leading-7 text-amber-950">{alerts.map((a) => <li key={a}>⚠ {a}</li>)}</ul>}

      <StepCard title="بيانات القرار">
        <div className="grid gap-3 text-base sm:grid-cols-2">
          <p><span className="text-muted-foreground">تاريخ الاتخاذ</span><br /><b>{fd(d.decided_on)}</b></p>
          <p><span className="text-muted-foreground">الأصوات (مع / ضد / امتناع)</span><br /><b>{d.vote_for ?? "—"} / {d.vote_against ?? "—"} / {d.vote_abstain ?? "—"}</b></p>
          <p><span className="text-muted-foreground">الجهة الرقابية</span><br /><b>{d.review_authority || "—"}</b></p>
          <p><span className="text-muted-foreground">تاريخ النفاذ (من المستند الرسمي)</span><br /><b>{fd(d.effective_on)}</b></p>
          <p><span className="text-muted-foreground">موعد التنفيذ</span><br /><b>{fd(d.execution_due)}</b></p>
          <p><span className="text-muted-foreground">المسؤول عن التنفيذ</span><br /><b>{d.responsible || "—"}</b></p>
        </div>
        {d.legal_basis && <p><span className="text-muted-foreground">الأساس القانوني</span><br />{d.legal_basis}</p>}
        {d.body && <p className="whitespace-pre-wrap leading-7"><span className="text-muted-foreground">نص القرار</span><br />{d.body}</p>}
      </StepCard>

      <div id="send"><StepCard n={1} title="الإرسال والتصديق" hint="سجّلوا هنا متى أُرسل القرار ومتى صدّقته السلطة. النظام يذكّركم ولا يغيّر أي حالة قانونية وحده.">
        <Explain term="مهلة الإرسال">يُرسل القرار إلى سلطة الرقابة خلال ثمانية أيام من اتخاذه (م.58 من المرسوم الاشتراعي 118/1977).</Explain>
        <Explain term="التصديق الحكمي">بعض القرارات تحتاج تصديق القائمقام أو المحافظ أو الوزير (م.60–62). وإن مضى شهر دون ردّ تُعدّ مصدَّقة حكمًا بشرط أن يبلّغ الرئيس السلطة بذلك (م.63). هذا لا ينطبق على {NO_TACIT}. تحققوا من النص الرسمي النافذ وتعديلاته.</Explain>
        <form action={setReview} className="space-y-4"><input type="hidden" name="id" value={id} />
          <Field label="تاريخ الإرسال إلى السلطة" hint="اليوم الذي سُلّم فيه القرار للسلطة."><input type="date" name="sent" defaultValue={d.sent_on ?? ""} className={CONTROL} /></Field>
          <Field label="تاريخ التصديق الخطي" hint="من كتاب السلطة الذي صدّق القرار."><input type="date" name="validated" defaultValue={d.validated_on ?? ""} className={CONTROL} /></Field>
          <details className="rounded-2xl border-2 p-3"><summary className="cursor-pointer text-base font-bold text-primary">حقول إضافية</summary>
            <div className="mt-4 space-y-4">
              <Field label="نوع القرار"><select name="category" defaultValue={d.category} className={CONTROL}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="من يصدّق القرار"><select name="level" defaultValue={d.validation_level} className={CONTROL}>{Object.entries(VALIDATION_LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="تاريخ استلام السلطة للقرار" hint="تبدأ منه مهلة الشهر."><input type="date" name="received" defaultValue={d.received_on ?? ""} className={CONTROL} /></Field>
              <label className="flex min-h-11 items-center gap-2 font-medium"><input type="checkbox" name="audit" defaultChecked={d.audit_bureau_required} className="size-5" />القرار خاضع لديوان المحاسبة</label>
              <Field label="تاريخ إبلاغ موافقة ديوان المحاسبة"><input type="date" name="audit_notice" defaultValue={d.audit_bureau_notice_on ?? ""} className={CONTROL} /></Field>
              <Field label="تاريخ إبلاغكم السلطة بالتصديق الحكمي" hint="يُملأ فقط إن انقضى الشهر دون ردّ."><input type="date" name="tacit" defaultValue={d.tacit_notified_on ?? ""} className={CONTROL} /></Field>
              <Field label="ملاحظة"><input name="note" defaultValue={d.validation_note ?? ""} maxLength={1000} className={CONTROL} /></Field>
            </div></details>
          <button className={BTN_PRIMARY}>حفظ الإرسال والتصديق</button></form>
        <p className="text-sm text-muted-foreground">النوع: <b>{CATEGORY[d.category]}</b> · من يصدّق: <b>{VALIDATION_LEVEL[d.validation_level]}</b>{d.validated_on ? <> · صُدّق في <b>{fd(d.validated_on)}</b></> : null}</p>
      </StepCard></div>

      <StepCard n={2} title="تحديث الحالة" hint="غيّروا الحالة عندما يتغير الواقع فقط.">
        <form action={setDecisionStatus} className="space-y-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value="legal" />
          <Field label="الحالة القانونية"><select name="value" defaultValue={d.legal_status} className={CONTROL}>{Object.entries(LEGAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="تاريخ النفاذ" hint="مطلوب عند اختيار «نافذ». انقلوه من المستند الرسمي."><input type="date" name="date" defaultValue={d.effective_on ?? ""} className={CONTROL} /></Field>
          <Field label="ملاحظة" hint="اختياري"><input name="note" maxLength={500} className={CONTROL} /></Field>
          <button className={BTN_SECONDARY}>حفظ الحالة القانونية</button></form>
        <form action={setDecisionStatus} className="space-y-3 border-t pt-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value="execution" />
          <Field label="حالة التنفيذ على الأرض"><select name="value" defaultValue={d.execution_status} className={CONTROL}>{Object.entries(EXEC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="سبب أو دليل التنفيذ" hint="اختياري"><input name="note" maxLength={500} className={CONTROL} /></Field>
          <button className={BTN_SECONDARY}>حفظ حالة التنفيذ</button></form>
      </StepCard>

      <div id="tasks"><StepCard n={3} title="مهام التنفيذ" hint="قسّموا التنفيذ إلى مهام صغيرة، لكل مهمة مسؤول وموعد.">
        {(tk.data ?? []).length === 0 && <Empty>لا مهام بعد. أضيفوا أول مهمة من النموذج أدناه.</Empty>}
        <ul className="divide-y">{(tk.data ?? []).map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
            <form action={toggleTask}><input type="hidden" name="task" value={k.id} /><input type="hidden" name="id" value={id} /><input type="hidden" name="done" value={k.done ? "0" : "1"} />
              <button aria-label={k.done ? "إلغاء الإنجاز" : "تحديد كمنجزة"} className={`grid size-10 place-items-center rounded-lg border-2 ${k.done ? "border-primary bg-primary text-primary-foreground" : ""}`}>{k.done ? "✓" : ""}</button></form>
            <span className={k.done ? "text-muted-foreground line-through" : "font-medium"}>{k.title}</span>
            <span className="text-sm text-muted-foreground">{who(k.assignee)}{k.due_on ? ` · حتى ${fd(k.due_on)}` : ""}</span>
            {!k.done && k.due_on && k.due_on < t && <Chip tone="bad">متأخرة</Chip>}
          </li>))}</ul>
        <form action={addTask} className="space-y-3 border-t pt-4"><input type="hidden" name="id" value={id} />
          <Field label="المهمة الجديدة" required example="إرسال كتاب إلى المتعهد"><input name="title" required maxLength={300} className={CONTROL} /></Field>
          <Field label="المسؤول" hint="اختياري"><select name="to" className={CONTROL}><option value="">دون إسناد</option>{people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name || p.role}</option>)}</select></Field>
          <Field label="الموعد" hint="اختياري"><input type="date" name="due" className={CONTROL} /></Field>
          <button className={BTN_PRIMARY}>إضافة المهمة</button></form>
      </StepCard></div>

      <StepCard title="سجل ما جرى">
        {(ev.data ?? []).length === 0 && <p className="text-muted-foreground">لا أحداث مسجّلة بعد.</p>}
        <ol className="space-y-2">{(ev.data ?? []).map((e) => <li key={e.id} className="flex flex-wrap gap-x-3"><span className="text-sm text-muted-foreground">{ft(e.created_at)}</span><b>{EV[e.kind] ?? "تحديث"}</b><span>{e.from_value ? `${label(e.kind, e.from_value)} ← ` : ""}{label(e.kind, e.to_value)}</span>{e.note && <span className="text-muted-foreground">({e.note})</span>}</li>)}</ol>
      </StepCard>
      {d.session_id && <Link href={`/staff/council/${d.session_id}`} className={BTN_SECONDARY}>← جلسة المجلس المرتبطة</Link>}
      <LegalPanel workflow="decisions" />
    </main></>
  );
}
