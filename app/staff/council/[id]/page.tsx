import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import LegalPanel from "@/components/legal/LegalPanel";
import { EXEC_STATUS, LEGAL_STATUS, SESSION_STATUS, quorumState, summonsOk, uuidOk } from "@/lib/council";
import DecisionForm from "@/components/council/DecisionForm";
import { addAgenda, setAttendance, setSession } from "../actions";
import { BTN_PRIMARY, BTN_SECONDARY, CONTROL, Chip, Empty, Explain, Field, Intro, Notice, StepCard } from "@/components/simple/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "جلسة المجلس — BALADI ONE", referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "full", timeZone: "Asia/Beirut" }).format(new Date(d));

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data: s } = await sb.from("council_session").select("id,session_no,title,held_on,status,minutes_text,is_demo,members_total,members_present,summoned_on,is_second_meeting").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [ag, dc, rc] = await Promise.all([
    sb.from("agenda_item").select("id,position,title,description").eq("session_id", id).order("position"),
    sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,execution_status").eq("session_id", id).order("created_at"),
    sb.from("council_agenda_result").select("agenda_item_id", { count: "exact", head: true }).eq("session_id", id),
  ]);
  const q = quorumState(s.members_total, s.members_present, s.is_second_meeting);
  const so = summonsOk(s.summoned_on, s.held_on);
  const nAgenda = (ag.data ?? []).length, nDecisions = (dc.data ?? []).length, nVotes = rc.error ? 0 : rc.count ?? 0;
  const steps = [
    { k: "attendance", label: "الدعوة والنصاب", done: s.members_total !== null && s.members_present !== null, href: "#attendance", todo: "سجّلوا عدد أعضاء المجلس والحاضرين." },
    { k: "agenda", label: "جدول الأعمال", done: nAgenda > 0, href: "#agenda", todo: "أضيفوا بنود جدول الأعمال." },
    { k: "votes", label: "التصويت", done: nVotes > 0, href: `/staff/council/${id}/votes`, todo: "سجّلوا تصويت الأعضاء على البنود." },
    { k: "minutes", label: "المحضر", done: s.status === "minutes_approved", href: `/staff/council/${id}/votes/minutes`, todo: "اكتبوا المحضر ثم اعتمدوه." },
    { k: "decisions", label: "القرارات", done: nDecisions > 0, href: "#decisions", todo: "سجّلوا القرارات التي اتُّخذت في هذه الجلسة." },
  ];
  const next = steps.find((x) => !x.done);
  return (
    <><StaffHeader back="/staff/council" backLabel="الجلسات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <Intro title={`${s.title}${s.session_no ? ` (${s.session_no})` : ""}`}>جلسة المجلس البلدي بتاريخ {fmt(s.held_on)}{s.is_demo ? " (تجريبية)" : ""}. اتبعوا الخطوات بالترتيب: كل خطوة تُعلَّم ✓ حين تكتمل.</Intro>
      {sp.err && <Notice tone="bad">{sp.err === "dup" ? "رقم القرار هذا مستخدم في السنة نفسها. اختاروا رقمًا آخر." : "بعض الحقول المطلوبة ناقصة. راجعوها ثم أعيدوا المحاولة."}</Notice>}

      <section aria-label="ما الخطوة التالية؟" className="space-y-3 rounded-3xl border-2 border-primary/40 bg-accent/40 p-4 sm:p-5">
        <h2 className="text-lg font-extrabold">ما الخطوة التالية؟</h2>
        {next ? <p className="text-base leading-7"><b>{next.label}:</b> {next.todo} <a href={next.href} className={`${BTN_PRIMARY} ms-2 min-h-11 px-4 text-sm`}>انتقلوا إلى هذه الخطوة</a></p> : <p className="text-base font-bold text-primary">اكتملت كل الخطوات. تابعوا تنفيذ القرارات من قائمة القرارات.</p>}
        <ol className="grid gap-2 sm:grid-cols-5">{steps.map((x, i) => <li key={x.k}><a href={x.href} className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${x.done ? "border-green-600/40 bg-green-50" : x === next ? "border-primary bg-background" : "bg-background"}`}><span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs">{x.done ? "✓" : i + 1}</span>{x.label}</a></li>)}</ol>
      </section>

      <div id="attendance" />
      <StepCard n={1} title="الدعوة والنصاب" hint="النصاب هو العدد الأدنى من الأعضاء الذي يجعل الجلسة قانونية.">
        <form action={setAttendance} className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="session" value={id} />
          <Field label="عدد أعضاء المجلس" hint="الرقم الكلي لأعضاء المجلس البلدي." example="12" required><input type="number" name="total" min={1} max={100} required defaultValue={s.members_total ?? ""} className={CONTROL} /></Field>
          <Field label="عدد الحاضرين" hint="كم عضوًا حضر هذه الجلسة." example="7" required><input type="number" name="present" min={0} max={100} required defaultValue={s.members_present ?? ""} className={CONTROL} /></Field>
          <details className="rounded-xl bg-muted/40 p-3 sm:col-span-2"><summary className="cursor-pointer text-base font-semibold">حقول إضافية: تاريخ الدعوة والجلسة الثانية</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="تاريخ الدعوة الخطية" hint="اليوم الذي وُجِّهت فيه الدعوة المكتوبة للأعضاء."><input type="date" name="summoned" defaultValue={s.summoned_on ?? ""} className={CONTROL} /></Field>
              <label className="flex min-h-12 items-center gap-3 text-base font-semibold"><input type="checkbox" name="second" value="1" defaultChecked={s.is_second_meeting} className="size-6" />هذه جلسة ثانية (بعد أن فُقد النصاب في جلسة سابقة)</label>
            </div>
            <div className="pt-3"><Explain term="النصاب">يلزم حضور أكثر من نصف الأعضاء، وفي الجلسة الثانية بعد فقدان النصاب يكفي ثلث الأعضاء على الأقل. والدعوة تكون خطية قبل ثلاثة أيام على الأقل (المادتان 33 و34). النظام يحسب ويُنبّه فقط، ولا يحكم بصحة الجلسة.</Explain></div>
          </details>
          <button className={`${BTN_PRIMARY} sm:col-span-2`}>احفظوا الحضور</button></form>
        <p className="flex flex-wrap gap-2">
          {q.ok === null ? <Chip>النصاب: لم يُسجَّل بعد</Chip> : q.ok ? <Chip tone="ok">النصاب مكتمل (المطلوب {q.need})</Chip> : <Chip tone="bad">النصاب غير مكتمل (المطلوب {q.need})</Chip>}
          {so === false && <Chip tone="bad">الدعوة أقل من ثلاثة أيام</Chip>}
        </p>
      </StepCard>

      <div id="agenda" />
      <StepCard n={2} title="جدول الأعمال" hint="البنود التي سيناقشها المجلس، بالترتيب.">
        {(ag.data ?? []).length === 0 ? <Empty>لم تُضَف بنود بعد. اكتبوا البند الأول في الحقل أدناه.</Empty> : <ol className="list-decimal space-y-2 ps-6 text-base leading-7">{(ag.data ?? []).map((a) => <li key={a.id}><b>{a.title}</b>{a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}</li>)}</ol>}
        <form action={addAgenda} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="session" value={id} />
          <Field label="عنوان البند" example="الموافقة على نقل اعتماد" required><input name="title" required maxLength={300} className={CONTROL} /></Field>
          <Field label="شرح مختصر" hint="اختياري."><input name="desc" maxLength={2000} className={CONTROL} /></Field>
          <button className={`${BTN_PRIMARY} sm:col-span-2`}>أضيفوا البند</button></form>
      </StepCard>

      <StepCard n={3} title="التصويت" hint="تسجيل رأي كل عضو في كل بند، ثم يظهر النظام النتيجة.">
        <Link href={`/staff/council/${id}/votes`} className={BTN_PRIMARY}>{nVotes > 0 ? "راجعوا أو عدّلوا التصويت" : "سجّلوا التصويت"}</Link>
        {nVotes > 0 && <p className="text-sm text-muted-foreground">سُجِّلت نتيجة {nVotes} من {nAgenda} بنود.</p>}
      </StepCard>

      <StepCard n={4} title="المحضر" hint="وثيقة تُدوِّن ما جرى في الجلسة.">
        <form action={setSession} className="space-y-3"><input type="hidden" name="session" value={id} />
          <textarea name="minutes" defaultValue={s.minutes_text ?? ""} rows={8} maxLength={60000} aria-label="نص المحضر" placeholder="اكتبوا هنا ملخص ما جرى في الجلسة…" className="w-full rounded-xl border-2 bg-background p-3 text-base leading-8 outline-none focus:border-primary" />
          <button className={BTN_SECONDARY}>احفظوا المسودة</button></form>
        <p className="text-sm leading-6 text-muted-foreground">هذه مسودة. اعتماد المحضر الرسمي وحفظ نسخه وتصحيحاتها في الصفحة التالية. التوقيع يتم خارج النظام.</p>
        <Link href={`/staff/council/${id}/votes/minutes`} className={BTN_SECONDARY}>اعتمدوا المحضر وأدِيروا نسخه</Link>
      </StepCard>

      <div id="decisions" />
      <StepCard n={5} title="قرارات هذه الجلسة" hint="كل قرار اتخذه المجلس يُسجَّل ليُتابَع إرساله وتنفيذه.">
        {nDecisions === 0 ? <Empty>لا قرارات مسجَّلة لهذه الجلسة بعد.</Empty> : <ul className="divide-y text-base">{(dc.data ?? []).map((d) => <li key={d.id}><Link href={`/staff/council/decisions/${d.id}`} className="flex flex-wrap items-center gap-2 py-3 hover:text-primary"><b>{d.decision_no}/{d.year}</b><span>{d.title}</span><span className="ms-auto flex gap-2"><Chip tone={d.legal_status === "effective" ? "ok" : "wait"}>{LEGAL_STATUS[d.legal_status]}</Chip><Chip>{EXEC_STATUS[d.execution_status]}</Chip></span></Link></li>)}</ul>}
        <details className="rounded-xl border-2 p-3"><summary className="cursor-pointer text-base font-bold text-primary">+ سجّلوا قرارًا جديدًا</summary>
          <DecisionForm session={id} />
        </details>
        <p className="text-sm text-muted-foreground">تفضّلون صياغة القرار من قالب جاهز؟ <Link href="/staff/decisions" className="font-semibold text-primary underline">افتحوا منشئ القرارات</Link>.</p>
      </StepCard>

      <StepCard title="حالة الجلسة" hint="للتتبع فقط: تغيّرها يدويًا حين تتبدّل مرحلة الجلسة.">
        <form action={setSession} className="flex flex-wrap items-end gap-3"><input type="hidden" name="session" value={id} />
          <Field label="الحالة الحالية"><select name="status" defaultValue={s.status} className={`${CONTROL} min-w-56`}>{Object.entries(SESSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <button className={BTN_SECONDARY}>احفظوا الحالة</button></form>
      </StepCard>
      <LegalPanel workflow="council" />
    </main></>
  );
}
