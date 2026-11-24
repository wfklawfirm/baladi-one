import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { EXEC_STATUS, LEGAL_STATUS, SESSION_STATUS, uuidOk } from "@/lib/council";
import DecisionForm from "@/components/council/DecisionForm";
import { addAgenda, setSession } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "جلسة المجلس — BALADI ONE", referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "full", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data: s } = await sb.from("council_session").select("id,session_no,title,held_on,status,minutes_text,is_demo").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [ag, dc] = await Promise.all([
    sb.from("agenda_item").select("id,position,title,description").eq("session_id", id).order("position"),
    sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,execution_status").eq("session_id", id).order("created_at"),
  ]);
  return (
    <><StaffHeader back="/staff/council" backLabel="الجلسات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <div><h1 className="text-2xl font-bold">{s.title}{s.session_no ? ` (${s.session_no})` : ""}</h1><p className="text-sm text-muted-foreground">{fmt(s.held_on)}{s.is_demo ? " · تجريبي" : ""}</p></div>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{sp.err === "dup" ? "رقم القرار مستخدم في هذه السنة." : "تحقق من الحقول المطلوبة."}</p>}

      <section className="elev space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">حالة الجلسة</h2>
        <form action={setSession} className="flex flex-wrap items-center gap-2"><input type="hidden" name="session" value={id} />
          <select name="status" defaultValue={s.status} aria-label="حالة الجلسة" className="min-h-11 rounded-xl border-2 bg-background px-3">{Object.entries(SESSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ الحالة</button></form>
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
    </main></>
  );
}
