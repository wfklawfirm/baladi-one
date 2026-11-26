import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Kiosk } from "@/components/Kiosk";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { draftServices } from "@/lib/draft";
import { BRAND } from "@/lib/brand";
import { kioskAllowed } from "@/lib/kioskAccess";

export const dynamic = "force-dynamic";

export default async function KioskPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  // Private kiosk: only admins and listed viewers (set KIOSK_OPEN=1 to open it to everyone).
  if (!(await kioskAllowed())) {
    const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
    redirect(`/kiosk-login?next=${encodeURIComponent(`/kiosk/${slug}${qs ? `?${qs}` : ""}`)}`);
  }
  // Phones get the mobile portal; the kiosk layout is built for large touch screens (?force=1 overrides).
  const ua = (await headers()).get("user-agent") ?? "";
  if (/iPhone|iPod|Android.+Mobile|Mobile.+Firefox/i.test(ua) && sp.force !== "1") redirect(`/m/${slug}${sp.lang === "en" ? "?lang=en" : ""}`);
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const cat = await loadCatalog();
  const approved = cat.services.length > 0 && !cat.demo;
  const services = approved ? cat.services : draftServices();
  const demo = !approved;
  const idle = Number(Array.isArray(sp.idle) ? sp.idle[0] : sp.idle);
  return (
    <>
    {/* rem scales with the screen so 1920 = 16px, 4K = 32px; floor keeps small windows legible */}
    <style>{"html{font-size:clamp(14px,0.8333vw,32px)}"}</style>
    <Kiosk
      muni={{ ...muni, logoUrl: muni.logoUrl ?? (muni.slug === BRAND.slug ? BRAND.logo ?? undefined : undefined) }}
      services={services}
      demo={demo || muni.isDemo}
      reportsEnabled={process.env.REPORTS_ENABLED === "1"}
      idleSeconds={Number.isFinite(idle) && idle >= 30 ? idle : 90}
      initialLang={sp.lang === "en" ? "en" : "ar"}
    />
    </>
  );
}
