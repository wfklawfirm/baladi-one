import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Landmark, Scale, Search, Store, Wrench, FileCheck2, Siren } from "lucide-react";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { catLabel, normalizeArabic, pick, t } from "@/lib/i18n";
import { TX, portalCategory, type PortalCat } from "@/lib/draft";

export const dynamic = "force-dynamic";
const CATS: { id: PortalCat; Icon: typeof Landmark }[] = [
  { id: "licenses", Icon: Landmark }, { id: "certificates", Icon: FileCheck2 }, { id: "shops", Icon: Store },
  { id: "public_works", Icon: Wrench }, { id: "reports", Icon: Siren },
];

export default async function CitizenHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string; q?: string; c?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const lang = sp.lang === "en" ? "en" : "ar";
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const { services, demo } = await loadCatalog();
  const approved = services.length > 0 && !demo;
  const name = lang === "en" && muni.nameEn ? muni.nameEn : muni.nameAr;

  const q = normalizeArabic((sp.q ?? "").trim()), words = q.split(/\s+/).filter(Boolean);
  const cat = CATS.find((c) => c.id === sp.c)?.id;
  const citizen = TX.filter((x) => x.audience === "citizen");
  const counts = Object.fromEntries(CATS.map((c) => [c.id, citizen.filter((x) => portalCategory(x.category) === c.id).length]));
  const list = citizen.filter((x) => (!cat || portalCategory(x.category) === cat) && words.every((w) => normalizeArabic(`${x.title} ${x.category} ${x.authority}`).includes(w)));
  const href = (extra: Record<string, string>) => `/m/${slug}?${new URLSearchParams({ lang, ...extra })}`;

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="pb-16">
      <section className="bg-gradient-to-b from-primary to-[#5e1623] px-4 pb-14 pt-10 text-primary-foreground">
        <div className="mx-auto max-w-3xl space-y-5 text-center">
          <p className="text-sm font-medium text-white/80">{name}</p>
          <h1 className="text-3xl font-bold leading-snug md:text-4xl">{t(lang, "heroTitle")}</h1>
          <form action={`/m/${slug}`} className="mx-auto flex max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-lg">
            <input type="hidden" name="lang" value={lang} />{cat && <input type="hidden" name="c" value={cat} />}
            <Search aria-hidden className="mx-2 my-auto size-5 shrink-0 text-muted-foreground" />
            <input name="q" defaultValue={sp.q ?? ""} placeholder={t(lang, "searchPlaceholder")} className="min-h-12 w-full bg-transparent text-foreground outline-none" />
            <button className="min-h-12 shrink-0 rounded-xl bg-primary px-6 font-semibold text-primary-foreground">بحث</button>
          </form>
          {(demo || !approved) && <p className="mx-auto inline-block rounded-full bg-white/15 px-4 py-1.5 text-xs">{t(lang, "demoBadge")}</p>}
        </div>
      </section>

      <div className="mx-auto -mt-8 max-w-3xl space-y-8 px-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { h: `/m/${slug}/report?lang=${lang}`, Icon: Siren, l: t(lang, "report"), s: t(lang, "reportHint") },
            { h: `/m/${slug}/track?lang=${lang}`, Icon: ClipboardList, l: t(lang, "track"), s: t(lang, "trackHint") },
            { h: "/laws", Icon: Scale, l: "القوانين", s: "البلديات والمحاسبة والشراء" },
          ].map(({ h, Icon, l, s }) => (
            <Link key={h} href={h} className="elev elev-hover flex flex-col items-center gap-1 rounded-2xl border bg-background p-4 text-center">
              <span className="grid size-11 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" /></span>
              <b className="text-sm">{l}</b><span className="hidden text-xs text-muted-foreground sm:block">{s}</span>
            </Link>
          ))}
        </div>

        {approved ? (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">{t(lang, "transactions")}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <li key={s.slug}><Link href={`/s/${slug}/${s.slug}?lang=${lang}`} className="elev elev-hover block h-full rounded-2xl border bg-background p-4">
                  <span className="block font-bold">{pick(lang, s.title)}</span><span className="text-sm text-primary">{catLabel(lang, s.category)}</span></Link></li>
              ))}
            </ul>
          </section>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-xl font-bold">{t(lang, "transactions")}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {CATS.map(({ id, Icon }) => (
                  <Link key={id} href={cat === id ? href({}) : href({ c: id, ...(sp.q ? { q: sp.q } : {}) })}
                    className={`elev flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-sm ${cat === id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary"}`}>
                    <Icon className="size-6" /><b>{catLabel(lang, id)}</b><span className={`text-xs ${cat === id ? "text-white/80" : "text-muted-foreground"}`}>{counts[id]} معاملة</span>
                  </Link>
                ))}
              </div>
            </section>
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">{list.length} معاملة{cat ? ` · ${catLabel(lang, cat)}` : ""}{sp.q ? ` · «${sp.q}»` : ""}</p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.slice(0, 60).map((x) => (
                  <li key={x.id}><Link href={`/catalog/${x.id}`} className="elev elev-hover flex h-full flex-col gap-1 rounded-2xl border bg-background p-4">
                    <span className="font-bold leading-7">{x.title}</span>
                    <span className="text-xs text-primary">{x.category}</span>
                    {x.authority && <span className="line-clamp-1 text-xs text-muted-foreground">{x.authority}</span>}</Link></li>
                ))}
              </ul>
              {list.length > 60 && <p className="text-center text-sm text-muted-foreground">يُعرض أول 60 نتيجة — حدّد البحث أو الفئة لتضييق النتائج.</p>}
              {list.length === 0 && <p className="rounded-2xl bg-muted p-6 text-center">{t(lang, "noResults")}</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
