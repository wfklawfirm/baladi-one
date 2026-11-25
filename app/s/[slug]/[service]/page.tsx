import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceBody } from "@/components/ServiceBody";
import { loadMunicipality } from "@/lib/catalog";
import { portalServices } from "@/lib/portal";
import { reportsEnabled } from "@/lib/reports";
import { catLabel, pick, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function StartButton({ slug, service, lang, enabled, compact }: { slug: string; service: string; lang: "ar" | "en"; enabled: boolean; compact?: boolean }) {
  if (!enabled) return compact ? null : <p className="rounded-xl bg-muted p-4 text-center font-semibold">{t(lang, "regSoon")}</p>;
  return (
    <Link href={`/s/${slug}/${service}/apply${lang === "en" ? "?lang=en" : ""}`}
      className="flex min-h-14 w-full flex-col items-center justify-center rounded-2xl bg-primary px-6 text-center font-bold text-primary-foreground shadow active:opacity-90">
      <span className="text-lg">{t(lang, "startTx")}</span>
      {!compact && <span className="text-sm font-normal opacity-90">{t(lang, "startTxSub")}</span>}
    </Link>
  );
}

export default async function MobileService({
  params, searchParams,
}: { params: Promise<{ slug: string; service: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug, service } = await params;
  const lang = (await searchParams).lang === "en" ? "en" : "ar";
  const muni = await loadMunicipality(slug);
  const s = (await portalServices()).find((x) => x.slug === service);
  if (!muni || !s) notFound();
  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">B</span>
        <div><p className="font-bold leading-tight">{lang === "en" && muni.nameEn ? muni.nameEn : muni.nameAr}</p></div>
      </header>
      <p className="text-sm text-primary">{catLabel(lang, s.category)}</p>
      <h1 className="text-2xl font-bold">{pick(lang, s.title)}</h1>
      <p className="text-muted-foreground">{pick(lang, s.summary)}</p>
      <StartButton slug={slug} service={service} lang={lang} enabled={reportsEnabled()} />
      <ServiceBody s={s} lang={lang} scale="mobile" />
      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t(lang, "applyNote")}</p>
      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 p-3 backdrop-blur"><StartButton slug={slug} service={service} lang={lang} enabled={reportsEnabled()} compact /></div>
      <Link href={`/m/${slug}?lang=${lang}`} className="inline-flex min-h-12 items-center rounded-xl border bg-background px-5 font-semibold">{t(lang, "mobileTitle")}</Link>
    </main>
  );
}
