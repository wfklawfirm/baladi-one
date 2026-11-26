import Link from "next/link";
import { portalHome } from "@/lib/portalHome";
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
    <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      {!reportsEnabled() ? <ComingSoon title="أبلغ عن مشكلة" slug={slug} /> : (
        <>
          <Link href={await portalHome(slug)} className="text-sm text-primary">← {muni.nameAr}</Link>
          <h1 className="text-2xl font-bold">أبلغ عن مشكلة</h1>
          <ReportForm slug={slug} />
        </>
      )}
    </main>
  );
}
