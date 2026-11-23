import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceBody } from "@/components/ServiceBody";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { catLabel, pick, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function MobileService({
  params, searchParams,
}: { params: Promise<{ slug: string; service: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug, service } = await params;
  const lang = (await searchParams).lang === "en" ? "en" : "ar";
  const muni = await loadMunicipality(slug);
  const { services, demo } = await loadCatalog();
  const s = services.find((x) => x.slug === service);
  if (!muni || !s) notFound();
  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">B</span>
        <div><p className="font-bold leading-tight">{lang === "en" && muni.nameEn ? muni.nameEn : muni.nameAr}</p><p className="text-xs text-muted-foreground">BALADI ONE</p></div>
      </header>
      {(demo || s.demo) && <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{t(lang, "demoBadge")} — {t(lang, "draftNote")}</p>}
      <p className="text-sm text-primary">{catLabel(lang, s.category)}</p>
      <h1 className="text-2xl font-bold">{pick(lang, s.title)}</h1>
      <p className="text-muted-foreground">{pick(lang, s.summary)}</p>
      <ServiceBody s={s} lang={lang} scale="mobile" />
      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t(lang, "notOnline")}</p>
      <Link href={`/m/${slug}?lang=${lang}`} className="inline-flex min-h-12 items-center rounded-xl border bg-background px-5 font-semibold">{t(lang, "mobileTitle")}</Link>
    </main>
  );
}
