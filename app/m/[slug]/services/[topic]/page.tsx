import Link from "next/link";
import { notFound } from "next/navigation";
import PortalFooter from "@/components/PortalFooter";
import { SUB_ICON, TOPIC_ICON } from "@/components/TopicIcons";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { CATEGORIES, catLabel, pick, t } from "@/lib/i18n";
import { TX, portalCategory } from "@/lib/draft";
import { countAr, subTopicOf, subTopics } from "@/lib/topics";
import type { CategoryId } from "@/lib/types";

export const dynamic = "force-dynamic";
const PREVIEW = 6;

export default async function TopicPage({ params, searchParams }: { params: Promise<{ slug: string; topic: string }>; searchParams: Promise<{ s?: string; lang?: string }> }) {
  const { slug, topic } = await params;
  const sp = await searchParams;
  const lang = sp.lang === "en" ? "en" : "ar";
  if (!CATEGORIES.includes(topic as CategoryId)) notFound();
  const tp = topic as CategoryId;
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const { services, demo } = await loadCatalog();
  const approved = services.length > 0 && !demo;
  const all = approved
    ? services.filter((s) => s.category === tp).map((s) => ({ href: `/s/${slug}/${s.slug}?lang=${lang}`, title: pick(lang, s.title), sub: "all" }))
    : TX.filter((x) => x.audience === "citizen" && portalCategory(x.category) === tp).map((x) => ({ href: `/catalog/${x.id}`, title: x.title, sub: subTopicOf(tp, x.category).id }));
  const subs = approved ? [{ id: "all", label: catLabel(lang, tp) }] : subTopics(tp);
  const Icon = TOPIC_ICON[tp];
  const only = subs.find((x) => x.id === sp.s);
  const base = `/m/${slug}/services/${tp}`;

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <section className="border-b bg-background px-4 pb-6 pt-6">
        <div className="mx-auto max-w-3xl space-y-4 lg:max-w-7xl">
          <Link href={only ? base : `/m/${slug}/services`} className="text-sm text-muted-foreground hover:text-primary">← {only ? catLabel(lang, tp) : t(lang, "transactions")}</Link>
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Icon className="size-9" aria-hidden /></span>
            <div><h1 className="text-2xl font-bold leading-snug">{only ? only.label : catLabel(lang, tp)}</h1><p className="text-sm text-muted-foreground">{countAr(only ? all.filter((x) => x.sub === only.id).length : all.length)}</p></div>
          </div>
          {!only && subs.length > 1 && (
            <nav aria-label="المجموعات" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {subs.map((s) => <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border bg-background px-4 py-2 text-sm font-medium active:bg-muted">{s.label}</a>)}
            </nav>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-8 px-4 pt-6 lg:max-w-7xl lg:pt-10">
        {(only ? [only] : subs).map((s) => {
          const list = all.filter((x) => x.sub === s.id);
          const shown = only ? list : list.slice(0, PREVIEW);
          const SubIcon = SUB_ICON[s.id] ?? Icon;
          return (
            <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
              {!only && (
                <h2 className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><SubIcon className="size-5" aria-hidden /></span>
                  <span className="flex-1 font-bold leading-snug">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{countAr(list.length)}</span>
                </h2>
              )}
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                {shown.map((x) => (
                  <li key={x.href}><Link href={x.href} className="elev elev-hover flex h-full min-h-36 flex-col items-center justify-start gap-3 rounded-2xl border bg-background px-3 pb-4 pt-5 text-center active:bg-muted">
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><SubIcon className="size-6" aria-hidden /></span>
                    <span className="line-clamp-3 text-sm font-semibold leading-6">{x.title}</span></Link></li>
                ))}
              </ul>
              {!only && list.length > PREVIEW && (
                <Link href={`${base}?s=${s.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">عرض كل المعاملات ({list.length}) ←</Link>
              )}
            </section>
          );
        })}
      </div>
      <PortalFooter />
    </main>
  );
}
