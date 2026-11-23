import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCatalog, loadMunicipality } from "@/lib/catalog";
import { catLabel, pick, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function CitizenHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const lang = (await searchParams).lang === "en" ? "en" : "ar";
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  const { services, demo } = await loadCatalog();
  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">{lang === "en" && muni.nameEn ? muni.nameEn : muni.nameAr}</h1>
      {demo && <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{t(lang, "demoBadge")}</p>}
      <h2 className="text-lg font-semibold">{t(lang, "transactions")}</h2>
      {services.length === 0 && <p className="text-muted-foreground">{t(lang, "noCatalog")}</p>}
      <ul className="space-y-2">
        {services.map((s) => (
          <li key={s.slug}>
            <Link href={`/s/${slug}/${s.slug}?lang=${lang}`} className="elev block rounded-2xl border bg-background p-4">
              <span className="block font-bold">{pick(lang, s.title)}</span>
              <span className="text-sm text-primary">{catLabel(lang, s.category)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
