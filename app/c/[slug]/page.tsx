import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardList, FileSearch, Globe, Search, Siren } from "lucide-react";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { BRAND, OFFICIAL } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { TX } from "@/lib/draft";
import { countAr } from "@/lib/topics";
import Emblem from "@/components/Emblem";
import Mic from "@/components/Mic";
import PortalMark from "@/components/PortalMark";

export const dynamic = "force-dynamic";
export const metadata = { title: "خدمات المواطن — بلدية خريبة الجندي", robots: { index: false } };

/** Citizen-only entry: services, reporting, tracking and fee inquiry. No staff or mayor entries, no role choice. */
export default async function CitizenOnly({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const lang = sp.lang === "en" ? "en" : "ar";
  const ar = lang === "ar";
  const muni = await loadMunicipality(slug);
  if (!muni) { if (slug !== BRAND.slug) redirect(`/c/${BRAND.slug}`); notFound(); }
  const { services, demo } = await loadCatalog();
  const total = services.length > 0 && !demo ? services.length : TX.filter((x) => x.audience === "citizen").length;
  const q = `?lang=${lang}`;
  const tiles = [
    { h: `/m/${slug}/services${q}`, Icon: FileSearch, l: t(lang, "transactions"), d: ar ? "المستندات والشروط والخطوات لكل معاملة" : "Documents, conditions and steps", sub: countAr(total), main: true },
    { h: `/m/${slug}/report${q}`, Icon: Siren, l: t(lang, "report"), d: ar ? "أبلغ عن عطل أو مخالفة في منطقتك" : "Report a fault or violation" },
    { h: `/m/${slug}/track${q}`, Icon: ClipboardList, l: t(lang, "track"), d: ar ? "تابع حالة طلبك برقم المتابعة" : "Follow your request with its code" },
  ];
  return (
    <div dir={ar ? "rtl" : "ltr"} lang={lang} className="flex min-h-dvh flex-col bg-background">
      <PortalMark />
      <style>{"header[data-site-nav]{display:none!important}"}</style>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Emblem size={64} />
          <Link href={`/c/${slug}?lang=${ar ? "en" : "ar"}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-primary"><Globe className="size-4" aria-hidden />{ar ? "English" : "عربي"}</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8 lg:space-y-10 lg:py-12">
        <section className="mx-auto max-w-3xl space-y-4 text-center">
          <h1 className="text-3xl font-bold leading-snug md:text-4xl lg:text-5xl">{t(lang, "heroTitle")}</h1>
          <p className="text-muted-foreground">{t(lang, "heroSub")}</p>
          <form action={`/m/${slug}/services`} role="search" className="flex items-center gap-2 rounded-2xl border-2 bg-background p-2 focus-within:border-primary">
            <input type="hidden" name="lang" value={lang} />
            <Search aria-hidden className="mx-2 size-5 shrink-0 text-muted-foreground" />
            <input id="q-c" name="q" placeholder={t(lang, "searchPlaceholder")} aria-label={t(lang, "heroSub")} className="min-h-12 min-w-0 flex-1 bg-transparent outline-none" />
            <Mic target="q-c" mode="replace" submit />
            <button className="min-h-12 shrink-0 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90">{t(lang, "open")}</button>
          </form>
        </section>

        <section aria-label={ar ? "الخدمات" : "Services"} className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-5">
          {tiles.map(({ h, Icon, l, d, sub, main, ext }) => (
            <Link key={h} href={h} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="elev elev-hover flex min-h-44 flex-col items-center justify-center gap-2 rounded-3xl border bg-background p-5 text-center active:bg-muted">
              <span className={`grid size-16 place-items-center rounded-2xl ${main ? "bg-primary text-primary-foreground" : "bg-accent text-primary"}`}><Icon className="size-8" aria-hidden /></span>
              <b className="text-xl leading-snug">{l}{ext ? " ↗" : ""}</b>
              <span className="text-sm text-muted-foreground">{d}</span>
              {sub && <span className="text-xs font-semibold text-primary">{sub}</span>}
            </Link>
          ))}
        </section>

        <section className="flex flex-wrap items-center justify-center gap-3">
          <a href={OFFICIAL.home} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-primary px-6 font-bold text-primary"><Globe className="size-5" aria-hidden />{ar ? "الموقع الرسمي للبلدية" : "Official website"} ↗</a>
        </section>
      </main>

      <footer className="border-t bg-muted/40 px-4 py-6 text-center">
        <p className="font-bold">{BRAND.nameAr}</p>
        <p className="mt-1 text-sm text-muted-foreground">{ar ? "من تطوير AIJUR" : "Powered by AIJUR"}</p>
      </footer>
    </div>
  );
}
