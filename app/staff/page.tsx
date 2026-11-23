import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { REPORT_TYPES, STATUS_AR } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const metadata = { title: "مساحة الموظفين — BALADI ONE", referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));

async function signOut() { "use server"; const { supabaseServer } = await import("@/lib/supabase-server"); await (await supabaseServer()).auth.signOut(); redirect("/staff/login"); }

export default async function StaffHome({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const filter = (await searchParams).s;
  let q = sb.from("citizen_request").select("id,kind,report_type,description,location_text,status,is_demo,created_at,updated_at").order("created_at", { ascending: false }).limit(200);
  if (filter && STATUS_AR[filter]) q = q.eq("status", filter);
  const { data } = await q;
  const rows = data ?? [];
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-primary">BALADI ONE</p><h1 className="text-2xl font-bold">طلبات وبلاغات المواطنين</h1>
          <p className="text-sm text-muted-foreground">{memberships.map((m) => m.municipality?.name_ar).join("، ")}</p></div>
        <form action={signOut}><button className="rounded-xl border px-4 py-2 text-sm">خروج</button></form>
      </header>
      <nav className="flex flex-wrap gap-2">
        <Link href="/staff" className={`rounded-full border px-4 py-2 text-sm ${!filter ? "bg-primary text-primary-foreground" : "bg-background"}`}>الكل</Link>
        {Object.entries(STATUS_AR).map(([k, v]) => <Link key={k} href={`/staff?s=${k}`} className={`rounded-full border px-4 py-2 text-sm ${filter === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{v}</Link>)}
      </nav>
      <p className="text-sm text-muted-foreground">{rows.length} نتيجة</p>
      <ul className="divide-y rounded-xl border bg-background">
        {rows.map((r) => (
          <li key={r.id}><Link href={`/staff/r/${r.id}`} className="block space-y-1 p-3 hover:bg-muted">
            <p className="flex flex-wrap items-center gap-2 text-sm"><b className="text-primary">{STATUS_AR[r.status]}</b><span>{REPORT_TYPES.find(([k]) => k === r.report_type)?.[1] ?? r.kind}</span>{r.is_demo && <span className="rounded bg-accent px-2 text-xs">تجريبي</span>}<span className="text-muted-foreground">{fmt(r.created_at)}</span></p>
            <p className="line-clamp-2 text-sm leading-7">{r.description}</p></Link></li>
        ))}
        {!rows.length && <li className="p-6 text-center text-muted-foreground">لا توجد طلبات.</li>}
      </ul>
    </main>
  );
}
