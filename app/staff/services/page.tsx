import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { VERSION_STATUS_AR } from "@/lib/review";

export const dynamic = "force-dynamic";
export const metadata = { title: "اعتماد الخدمات — BALADI ONE", referrer: "no-referrer" as const };

export default async function ServicesReview({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const filter = (await searchParams).s;
  let q = sb.from("service_version").select("id,version_no,status,title_ar,reviewed_on,municipal_service(slug,category)").order("created_at", { ascending: false }).limit(300);
  if (filter && VERSION_STATUS_AR[filter]) q = q.eq("status", filter);
  const { data } = await q;
  const rows = (data ?? []) as any[];
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8 lg:max-w-5xl">
      <Link href="/staff" className="text-sm text-primary">← الطلبات</Link>
      <h1 className="text-2xl font-bold">اعتماد الخدمات</h1>
      <nav className="flex flex-wrap gap-2">
        <Link href="/staff/services" className={`rounded-full border px-4 py-2 text-sm ${!filter ? "bg-primary text-primary-foreground" : "bg-background"}`}>الكل</Link>
        {Object.entries(VERSION_STATUS_AR).map(([k, v]) => <Link key={k} href={`/staff/services?s=${k}`} className={`rounded-full border px-4 py-2 text-sm ${filter === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{v}</Link>)}
      </nav>
      <ul className="divide-y rounded-xl border bg-background">
        {rows.map((r) => (
          <li key={r.id}><Link href={`/staff/services/${r.id}`} className="flex flex-wrap items-center gap-2 p-3 hover:bg-muted">
            <b className="text-primary">{VERSION_STATUS_AR[r.status]}</b><span>{r.title_ar}</span>
            <span className="text-xs text-muted-foreground">v{r.version_no}{r.municipal_service?.category ? ` · ${r.municipal_service.category}` : ""}</span></Link></li>
        ))}
        {!rows.length && <li className="p-6 text-center text-muted-foreground">لا توجد نسخ.</li>}
      </ul>
    </main>
  );
}
