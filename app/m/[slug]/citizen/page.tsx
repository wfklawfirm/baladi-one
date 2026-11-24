import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardList, FileSearch, Scale, Search, Siren } from "lucide-react";
import PortalFooter from "@/components/PortalFooter";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { t } from "@/lib/i18n";
import { TX } from "@/lib/draft";
import { countAr } from "@/lib/topics";
import Mic from "@/components/Mic";
import { OFFICIAL } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function CitizenHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const lang = sp.lang === "en" ? "en" : "ar";
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const { services, demo } = await loadCatalog();
  const approved = services.length > 0 && !demo;
  const total = approved ? services.length : TX.filter((x) => x.audience === "citizen").length;

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="flex min-h-[calc(100dvh-5.5rem)] flex-col">
      <section className="px-4 pb-8 pt-12 lg:pb-12 lg:pt-20">
        <div className="mx-auto max-w-3xl space-y-6 text-center lg:space-y-8">
          <h1 className="pt-2 text-3xl font-bold leading-snug md:text-4xl lg:text-5xl">{t(lang, "heroTitle")}</h1>
          <p className="text-muted-foreground">{t(lang, "heroSub")}</p>
          <form action={`/m/${slug}/services`} className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border-2 lg:max-w-3xl lg:p-3 bg-background p-2 focus-within:border-primary" role="search">
            <input type="hidden" name="lang" value={lang} />
            <Search aria-hidden className="mx-2 size-5 shrink-0 text-muted-foreground" />
            <input id="q-citizen" name="q" placeholder={t(lang, "searchPlaceholder")} aria-label={t(lang, "heroSub")} className="min-h-12 min-w-0 flex-1 bg-transparent outline-none" />
            <Mic target="q-citizen" mode="replace" submit />
            <button className="min-h-12 shrink-0 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90">{t(lang, "open")}</button>
          </form>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 lg:max-w-5xl lg:space-y-6">
        <Link href={`/m/${slug}/services`} className="elev elev-hover flex min-h-28 items-center gap-4 rounded-3xl border border-primary/40 bg-accent/50 p-5 lg:min-h-36 lg:gap-6 lg:p-8 active:bg-accent">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><FileSearch className="size-8" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-xl">{t(lang, "transactions")}</b>
            <span className="text-sm text-muted-foreground">{t(lang, "transactionsHint")}</span>
            <span className="mt-1 block text-xs font-semibold text-primary">{countAr(total)}</span>
          </span>
          <ChevronLeft className={`size-7 shrink-0 text-primary ${lang === "en" ? "rotate-180" : ""}`} aria-hidden />
        </Link>

        <div className="grid grid-cols-3 gap-3 lg:gap-6">
          {[
            { h: `/m/${slug}/report?lang=${lang}`, Icon: Siren, l: t(lang, "report") },
            { h: `/m/${slug}/track?lang=${lang}`, Icon: ClipboardList, l: t(lang, "track") },
            { h: "/laws", Icon: Scale, l: lang === "ar" ? "القوانين" : "Laws" },
          ].map(({ h, Icon, l }) => (
            <Link key={h} href={h} className="elev flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border bg-background p-4 lg:min-h-44 lg:gap-4 lg:rounded-3xl text-center active:bg-muted">
              <span className="grid size-12 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span>
              <b className="text-sm leading-snug lg:text-xl">{l}</b>
            </Link>
          ))}
        </div>
        <p className="flex flex-wrap justify-center gap-x-6 text-sm text-muted-foreground">
          <a href={OFFICIAL.forms} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium hover:text-primary">{lang === "ar" ? "النماذج الرسمية" : "Official forms"} ↗</a>
          <a href={OFFICIAL.fees} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium hover:text-primary">{lang === "ar" ? "الاستعلام عن الرسوم" : "Fee inquiry"} ↗</a>
        </p>
        {muni.isDemo && <p className="pt-2 text-center"><Link href={`/m/${slug}`} className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-primary">{lang === "ar" ? "تغيير الدور" : "Change role"}</Link></p>}
      </div>
      <div className="mt-auto"><PortalFooter /></div>
    </main>
  );
}
