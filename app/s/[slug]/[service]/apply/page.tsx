import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm } from "@/components/RequestForm";
import { loadMunicipality } from "@/lib/catalog";
import { pick, t } from "@/lib/i18n";
import { portalServices } from "@/lib/portal";
import { reportsEnabled } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const };

export default async function ApplyPage({ params, searchParams }: { params: Promise<{ slug: string; service: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug, service } = await params;
  const lang = (await searchParams).lang === "en" ? "en" : "ar";
  const muni = await loadMunicipality(slug);
  const s = (await portalServices()).find((x) => x.slug === service);
  if (!muni || !s) notFound();
  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto max-w-xl space-y-5 p-4 pb-10">
      <Link href={`/s/${slug}/${service}${lang === "en" ? "?lang=en" : ""}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">{lang === "ar" ? "→" : "←"} {t(lang, "back")}</Link>
      <header className="space-y-1"><p className="text-sm text-primary">{t(lang, "applyTitle")}</p><h1 className="text-2xl font-bold">{pick(lang, s.title)}</h1></header>
      {reportsEnabled() ? <RequestForm slug={slug} serviceSlug={service} channel="app" lang={lang} /> : <p className="rounded-xl bg-muted p-4">{t(lang, "regSoon")}</p>}
    </main>
  );
}
