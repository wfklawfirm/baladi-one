import Link from "next/link";
import { requireStaff } from "@/lib/supabase-server";
import { REPORT_TYPES, STATUS_AR } from "@/lib/reports";
import StaffHeader from "@/components/StaffHeader";


export const dynamic = "force-dynamic";
export const metadata = { title: "الطلبات الواردة — BALADI ONE", referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));


export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const filter = (await searchParams).s;
  let q = sb.from("citizen_request").select("id,kind,report_type,service_title,applicant_name,description,location_text,status,is_demo,created_at,updated_at").order("created_at", { ascending: false }).limit(200);
  if (filter && STATUS_AR[filter]) q = q.eq("status", filter);
  const { data } = await q;
  const rows = data ?? [];
  const isDemo = memberships.some((m) => m.is_demo);
  const oversight = memberships.some((m) => m.role === "mayor" || m.role === "admin") && !filter;
  return (
    <><StaffHeader back="/staff" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 p-4 md:p-8 lg:max-w-7xl">
      <h1 className="text-2xl font-bold">طلبات وبلاغات المواطنين</h1>
      {oversight && (
        <section aria-label="نظرة عامة" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["received", "in_progress", "needs_info", "done"] as const).map((k) => (
            <Link key={k} href={`/staff/requests?s=${k}`} className="elev rounded-2xl border bg-background p-4 text-center active:bg-muted"><b className="block text-3xl text-primary">{rows.filter((r) => r.status === k).length}</b><span className="text-sm text-muted-foreground">{STATUS_AR[k]}</span></Link>
          ))}
        </section>
      )}
      <nav className="flex flex-wrap gap-2">
        <Link href="/staff/requests" className={`rounded-full border px-4 py-2 text-sm ${!filter ? "bg-primary text-primary-foreground" : "bg-background"}`}>الكل</Link>
        {Object.entries(STATUS_AR).map(([k, v]) => <Link key={k} href={`/staff/requests?s=${k}`} className={`rounded-full border px-4 py-2 text-sm ${filter === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{v}</Link>)}
      </nav>
      <p className="text-sm text-muted-foreground">{rows.length} نتيجة</p>
      <ul className="divide-y rounded-xl border bg-background">
        {rows.map((r) => (
          <li key={r.id}><Link href={`/staff/r/${r.id}`} className="block space-y-1 p-3 hover:bg-muted">
            <p className="flex flex-wrap items-center gap-2 text-sm"><b className="text-primary">{STATUS_AR[r.status]}</b><span>{r.kind === "service_request" ? `معاملة: ${r.service_title ?? ""}` : (REPORT_TYPES.find(([k]) => k === r.report_type)?.[1] ?? r.kind)}</span>{r.is_demo && <span className="rounded bg-accent px-2 text-xs">تجريبي</span>}<span className="text-muted-foreground">{fmt(r.created_at)}</span></p>
            <p className="line-clamp-2 text-sm leading-7">{r.kind === "service_request" ? `${r.applicant_name ?? ""}${r.description ? " — " + r.description : ""}` : r.description}</p></Link></li>
        ))}
        {!rows.length && <li className="p-6 text-center text-muted-foreground">لا توجد طلبات.</li>}
      </ul>
    </main></>
  );
}
