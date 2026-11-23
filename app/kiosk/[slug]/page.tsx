import { notFound } from "next/navigation";
import { Kiosk } from "@/components/Kiosk";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function KioskPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const { services, demo } = await loadCatalog();
  const idle = Number(Array.isArray(sp.idle) ? sp.idle[0] : sp.idle);
  return (
    <Kiosk
      muni={muni}
      services={services}
      demo={demo || muni.isDemo}
      reportsEnabled={process.env.REPORTS_ENABLED === "1"}
      idleSeconds={Number.isFinite(idle) && idle >= 30 ? idle : 90}
      initialLang={sp.lang === "en" ? "en" : "ar"}
    />
  );
}
