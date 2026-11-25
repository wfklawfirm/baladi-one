import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { VERSION_STATUS_AR } from "@/lib/review";
import { Chip, Empty, Intro } from "@/components/simple/kit";

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
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 p-4 md:p-8 lg:max-w-7xl">
      <Link href="/staff" className="inline-flex min-h-11 items-center text-base font-semibold text-primary">← الرئيسية</Link>
      <Intro title="اعتماد خدمات البلدية">هنا صفحات الخدمات التي يراها المواطن. «قيد المراجعة» تنتظر قراركم: افتحوها واقرؤوها ثم اعتمدوها أو أعيدوها.</Intro>
      <nav className="flex flex-wrap gap-2">
        <Link href="/staff/services" className={`min-h-11 rounded-full border px-4 py-2.5 text-base ${!filter ? "bg-primary text-primary-foreground" : "bg-background"}`}>الكل</Link>
        {Object.entries(VERSION_STATUS_AR).map(([k, v]) => <Link key={k} href={`/staff/services?s=${k}`} className={`min-h-11 rounded-full border px-4 py-2.5 text-base ${filter === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{v}</Link>)}
      </nav>
      <ul className="divide-y rounded-xl border bg-background">
        {rows.map((r) => (
          <li key={r.id}><Link href={`/staff/services/${r.id}`} className="flex flex-wrap items-center gap-2 p-3 hover:bg-muted">
            <Chip tone={r.status === "approved" ? "ok" : r.status === "in_review" ? "wait" : "info"}>{VERSION_STATUS_AR[r.status]}</Chip><span className="text-base font-semibold">{r.title_ar}</span>
            <span className="text-xs text-muted-foreground">v{r.version_no}{r.municipal_service?.category ? ` · ${r.municipal_service.category}` : ""}</span></Link></li>
        ))}
        {!rows.length && <li className="p-4"><Empty>لا توجد خدمات في هذه القائمة.</Empty></li>}
      </ul>
    </main>
  );
}
