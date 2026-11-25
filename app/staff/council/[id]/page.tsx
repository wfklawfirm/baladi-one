import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import LegalPanel from "@/components/legal/LegalPanel";
import { EXEC_STATUS, LEGAL_STATUS, SESSION_STATUS, quorumState, summonsOk, uuidOk } from "@/lib/council";
import DecisionForm from "@/components/council/DecisionForm";
import { addAgenda, setAttendance, setSession } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "جلسة المجلس — BALADI ONE", referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "full", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data: s } = await sb.from("council_session").select("id,session_no,title,held_on,status,minutes_text,is_demo,members_total,members_present,summoned_on,is_second_meeting").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [ag, dc] = await Promise.all([
    sb.from("agenda_item").select("id,position,title,description").eq("session_id", id).order("position"),
    sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,execution_status").eq("session_id", id).order("created_at"),
  ]);
  const q = quorumState(s.members_total, s.members_present, s.is_second_meeting);
  const so = summonsOk(s.summoned_on, s.held_on);
  return (
    <><StaffHeader back="/staff/council" backLabel="الجلسات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div><h1 className="text-2xl font-bold">{s.title}{s.session_no ? ` (${s.session_no})` : ""}</h1><p className="text-sm text-muted-foreground">{fmt(s.held_on)}{s.is_demo ? " · تجريبي" : ""}</p></div>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{sp.err === "dup" ? "رقم القرار مستخدم في هذه السنة." : "تحقق من الحقول المطلوبة."}</p>}

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">حالة الجلسة</h2>
        <form action={setSession} className="flex flex-wrap items-center gap-2"><input type="hidden" name="session" value={id} />
          <select name="status" defaultValue={s.status} aria-label="حالة الجلسة" className="min-h-11 rounded-xl border-2 bg-background px-3">{Object.entries(SESSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ الحالة</button></form>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">النصاب والدعوة (م.33–34)</h2>
        <p className="text-xs leading-6 text-muted-foreground">يلزم حضور أكثر من نصف الأعضاء، وفي الجلسة الثانية بعد فقدان النصاب ثلث الأعضاء على الأقل، والدعوة خطية قبل ثلاثة أيام على الأقل. يُحتسب هنا للتنبيه فقط.</p>
        <form action={setAttendance} className="grid gap-3 sm:grid-cols-4"><input type="hidden" name="session" value={id} />
          <label className="space-y-1 text-sm font-medium">عدد أعضاء المجلس<input type="number" name="total" min={1} max={100} required defaultValue={s.members_total ?? ""} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">الحاضرون<input type="number" name="present" min={0} max={100} required defaultValue={s.members_present ?? ""} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ الدعوة الخطية<input type="date" name="summoned" defaultValue={s.summoned_on ?? ""} className={field} /></label>
          <label className="flex items-end gap-2 pb-3 text-sm font-medium"><input type="checkbox" name="second" value="1" defaultChecked={s.is_second_meeting} className="size-5" />جلسة ثانية (بعد فقدان النصاب)</label>
          <button className="min-h-12 rounded-xl border px-4 text-sm font-semibold active:bg-muted sm:col-span-4">حفظ</button></form>
        <p className="flex flex-wrap gap-2 text-sm">
          {q.ok === null ? <span className="rounded-full bg-muted px-3 py-1">النصاب: غير مسجَّل</span> : q.ok ? <span className="rounded-full bg-accent px-3 py-1 font-bold text-primary">النصاب مكتمل (المطلوب {q.need})</span> : <span className="rounded-full bg-destructive/10 px-3 py-1 font-bold text-destructive">النصاب غير مكتمل (المطلوب {q.need}) — القرارات المتخذة قد تكون باطلة شكلًا</span>}
          {so === false && <span className="rounded-full bg-destructive/10 px-3 py-1 font-bold text-destructive">الدعوة أقل من ثلاثة أيام</span>}
        </p>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">جدول الأعمال</h2>
        <ol className="list-decimal space-y-2 ps-5 text-sm">{(ag.data ?? []).map((a) => <li key={a.id}><b>{a.title}</b>{a.description && <p className="text-muted-foreground">{a.description}</p>}</li>)}</ol>
        {(ag.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">لم تُضف بنود بعد.</p>}
        <form action={addAgenda} className="grid gap-2 sm:grid-cols-3"><input type="hidden" name="session" value={id} />
          <input name="title" required maxLength={300} placeholder="بند جديد" aria-label="عنوان البند" className={field} />
          <input name="desc" maxLength={2000} placeholder="وصف مختصر (اختياري)" aria-label="الوصف" className={field} />
          <button className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground active:opacity-90">إضافة بند</button></form>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">المحضر</h2>
        <p className="text-xs text-muted-foreground">مسودة للتحرير. اعتماد المحضر إجراء رسمي يقوم به أصحاب الاختصاص خارج النظام؛ الحالة هنا للتتبع فقط.</p>
        <form action={setSession} className="space-y-2"><input type="hidden" name="session" value={id} />
          <textarea name="minutes" defaultValue={s.minutes_text ?? ""} rows={8} maxLength={60000} aria-label="نص المحضر" className="w-full rounded-xl border-2 bg-background p-3 leading-7 outline-none focus:border-primary" />
          <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ المحضر</button></form>
      </section>

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">قرارات هذه الجلسة</h2>
        <ul className="divide-y text-sm">{(dc.data ?? []).map((d) => <li key={d.id}><Link href={`/staff/council/decisions/${d.id}`} className="flex flex-wrap items-center gap-2 py-2 hover:text-primary"><b>{d.decision_no}/{d.year}</b><span>{d.title}</span><span className="ms-auto text-xs text-muted-foreground">{LEGAL_STATUS[d.legal_status]} · {EXEC_STATUS[d.execution_status]}</span></Link></li>)}</ul>
        <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold text-primary">تسجيل قرار جديد</summary>
          <DecisionForm session={id} />
        </details>
      </section>
      <LegalPanel workflow="council" />
    </main></>
  );
}
