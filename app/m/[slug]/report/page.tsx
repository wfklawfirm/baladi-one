import Link from "next/link";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ComingSoon";
import { loadMunicipality } from "@/lib/catalog";
import { reportsEnabled } from "@/lib/reports";
import { ReportForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-xl space-y-4 p-4">
      {!reportsEnabled() ? <ComingSoon title="أبلغ عن مشكلة" slug={slug} /> : (
        <>
          <Link href={`/m/${slug}`} className="text-sm text-primary">← {muni.nameAr}</Link>
          <h1 className="text-2xl font-bold">أبلغ عن مشكلة</h1>
          {muni.isDemo && <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">نسخة تجريبية — البلاغات لا تصل إلى أي بلدية.</p>}
          <ReportForm slug={slug} />
        </>
      )}
    </main>
  );
}
