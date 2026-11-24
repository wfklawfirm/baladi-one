import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { SESSION_STATUS } from "@/lib/council";
import { createSession } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "المجلس والحوكمة — BALADI ONE", referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "long", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default async function Council({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data, error } = await sb.from("council_session").select("id,session_no,title,held_on,status,is_demo").order("held_on", { ascending: false }).limit(100);
  const rows = data ?? [];
  return (
    <><StaffHeader back="/staff/operations" backLabel="مركز القيادة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-bold">المجلس والحوكمة</h1>
        <Link href="/staff/council/decisions" className="rounded-xl border px-4 py-2 text-sm font-semibold text-primary active:bg-muted">سجل القرارات ←</Link></div>
      {error && <p role="alert" className="rounded-xl border p-3 text-sm">تعذّر تحميل الجلسات.</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تحقق من العنوان والتاريخ ثم أعد المحاولة.</p>}
      <form action={createSession} className="elev grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-4">
        <label className="space-y-1 text-sm font-medium sm:col-span-2">عنوان الجلسة<input name="title" required maxLength={200} placeholder="مثال: الجلسة الاعتيادية الشهرية" className={field} /></label>
        <label className="space-y-1 text-sm font-medium">التاريخ<input type="date" name="held_on" required className={field} /></label>
        <label className="space-y-1 text-sm font-medium">رقم الجلسة<input name="no" maxLength={40} className={field} /></label>
        <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 sm:col-span-4">إنشاء جلسة</button>
      </form>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا جلسات مسجّلة بعد.</p> : (
        <ul className="divide-y rounded-xl border bg-background">
          {rows.map((r) => <li key={r.id}><Link href={`/staff/council/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted"><b>{r.title}</b>{r.session_no && <span className="text-xs text-muted-foreground">({r.session_no})</span>}<span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary">{SESSION_STATUS[r.status]}</span>{r.is_demo && <span className="rounded bg-muted px-2 text-xs">تجريبي</span>}<span className="ms-auto text-sm text-muted-foreground">{fmt(r.held_on)}</span></Link></li>)}
        </ul>
      )}
    </main></>
  );
}
