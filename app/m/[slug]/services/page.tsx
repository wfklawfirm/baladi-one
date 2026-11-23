import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import PortalFooter from "@/components/PortalFooter";
import { TOPIC_ICON } from "@/components/TopicIcons";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { CATEGORIES, catLabel, pick, t } from "@/lib/i18n";
import { TX, portalCategory } from "@/lib/draft";
import { search } from "@/lib/search";
import { countAr } from "@/lib/topics";

export const dynamic = "force-dynamic";
export const metadata = { title: "المعاملات البلدية" };

type Item = { href: string; title: string; topic: (typeof CATEGORIES)[number]; note?: string };

export default async function ServicesHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; lang?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const lang = sp.lang === "en" ? "en" : "ar";
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const { services, demo } = await loadCatalog();
  const approved = services.length > 0 && !demo;
  const items: Item[] = approved
    ? services.map((s) => ({ href: `/s/${slug}/${s.slug}?lang=${lang}`, title: pick(lang, s.title), topic: s.category }))
    : TX.filter((x) => x.audience === "citizen").map((x) => ({ href: `/catalog/${x.id}`, title: x.title, topic: portalCategory(x.category), note: x.authority }));
  const q = (sp.q ?? "").trim();
  const found = q ? search(items, q, (x) => `${x.title} ${x.note ?? ""} ${catLabel("ar", x.topic)}`) : null;
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, items.filter((x) => x.topic === c).length]));

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <section className="border-b bg-background px-4 pb-6 pt-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Link href={`/m/${slug}${lang === "en" ? "?lang=en" : ""}`} className="text-sm text-muted-foreground hover:text-primary">← {lang === "ar" ? "الرئيسية" : "Home"}</Link>
          <h1 className="text-3xl font-bold">{t(lang, "transactions")}</h1>
          <form action={`/m/${slug}/services`} className="flex items-center gap-2 rounded-2xl border-2 bg-background p-2 focus-within:border-primary" role="search">
            <input type="hidden" name="lang" value={lang} />
            <Search aria-hidden className="mx-2 size-5 shrink-0 text-muted-foreground" />
            <input name="q" defaultValue={q} placeholder={t(lang, "searchPlaceholder")} aria-label={t(lang, "heroSub")} className="min-h-12 min-w-0 flex-1 bg-transparent outline-none" />
            <button className="min-h-12 shrink-0 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90">{t(lang, "open")}</button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
        {found ? (
          <section className="space-y-3" aria-label="نتائج البحث">
            <p className="text-sm text-muted-foreground">
              {found.items.length === 0 ? t(lang, "noResults") : found.exact ? `${countAr(found.items.length)} · «${q}»` : `لا توجد نتيجة مطابقة تمامًا لـ «${q}». هذه أقرب النتائج:`}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {found.items.slice(0, 40).map((x) => (
                <li key={x.href}><Link href={x.href} className="elev elev-hover flex h-full flex-col gap-1 rounded-2xl border bg-background p-4 active:bg-muted">
                  <span className="font-bold leading-7">{x.title}</span>
                  <span className="text-xs text-primary">{catLabel(lang, x.topic)}</span></Link></li>
              ))}
            </ul>
            {found.items.length > 40 && <p className="text-center text-sm text-muted-foreground">يُعرض أول 40 نتيجة — أضف كلمة لتضييق البحث.</p>}
            <Link href={`/m/${slug}/services`} className="inline-block text-sm font-semibold text-primary">← تصفح كل المحاور</Link>
          </section>
        ) : (
          <section className="space-y-3">
                        <div className="grid grid-cols-5 gap-1.5 sm:gap-4">
              {CATEGORIES.map((c) => {
                const Icon = TOPIC_ICON[c];
                return (
                  <Link key={c} href={`/m/${slug}/services/${c}${lang === "en" ? "?lang=en" : ""}`}
                    className="elev elev-hover flex min-h-36 flex-col items-center justify-start gap-2 rounded-2xl border bg-background px-1 py-4 text-center sm:min-h-52 sm:justify-center sm:gap-3 sm:rounded-3xl sm:px-3 sm:py-8 active:bg-muted">
                    <span className="grid size-11 place-items-center rounded-xl bg-accent text-primary sm:size-20 sm:rounded-2xl"><Icon className="size-6 sm:size-10" aria-hidden /></span>
                    <b className="text-[11px] leading-tight sm:text-lg sm:leading-snug">{catLabel(lang, c)}</b>
                    <span className="text-[10px] text-muted-foreground sm:text-sm">{countAr(counts[c])}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <PortalFooter />
    </main>
  );
}
