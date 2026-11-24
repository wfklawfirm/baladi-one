import Link from "next/link";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ComingSoon";
import { loadMunicipality } from "@/lib/catalog";
import { formatCode, REPORT_TYPES, reportsEnabled, STATUS_AR, trackReport } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const, title: "متابعة بلاغ" };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));

export default async function TrackPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string; new?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const code = (sp.code ?? "").trim();
  const result = reportsEnabled() && code ? await trackReport(code) : null;
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      {!reportsEnabled() ? <ComingSoon title="متابعة طلب" slug={slug} /> : (
        <>
          <Link href={`/m/${slug}`} className="text-sm text-primary">← {muni.nameAr}</Link>
          <h1 className="text-2xl font-bold">متابعة بلاغ</h1>
          {sp.new && result && (
            <div className="rounded-2xl border-2 border-primary bg-background p-4 text-center">
              <p className="font-bold">تم استلام بلاغك</p>
              <p className="mt-2 text-sm">احتفظ برمز التتبع، فهو الوحيد الذي يتيح لك متابعة البلاغ ولا يمكننا استرجاعه:</p>
              <p dir="ltr" className="mt-2 select-all text-2xl font-bold tracking-widest">{formatCode(code)}</p>
            </div>
          )}
          <form className="flex gap-2">
            <input name="code" defaultValue={sp.new ? "" : code} dir="ltr" placeholder="XXXX-XXXX-XXXX" autoComplete="off" className="min-h-12 flex-1 rounded-xl border bg-background px-4 tracking-widest" />
            <button className="min-h-12 rounded-xl bg-primary px-6 font-semibold text-primary-foreground">تتبّع</button>
          </form>
          {code && !result && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">لا يوجد بلاغ بهذا الرمز. تأكد من كتابته كما ظهر لك.</p>}
          {result && (
            <section className="space-y-3 rounded-2xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">{REPORT_TYPES.find(([k]) => k === result.reportType)?.[1] ?? "بلاغ"} · {fmt(result.createdAt)}</p>
              <p className="text-xl font-bold text-primary">{STATUS_AR[result.status] ?? result.status}</p>
              <ol className="space-y-2 border-s ps-4">
                {result.updates.map((u, i) => (
                  <li key={i}><p className="font-semibold">{STATUS_AR[u.status] ?? u.status}</p><p className="text-xs text-muted-foreground">{fmt(u.at)}</p>{u.note && <p className="text-sm">{u.note}</p>}</li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </main>
  );
}
