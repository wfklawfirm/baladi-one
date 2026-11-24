import Link from "next/link";
import { AUDIENCE_LABELS, TX } from "@/lib/draft";
import { normalizeArabic } from "@/lib/i18n";
import Mic from "@/components/Mic";

export const metadata = { title: "كتالوج المعاملات (مسودة) — BALADI ONE" };

export default async function CatalogHome({ searchParams }: { searchParams: Promise<{ q?: string; a?: string }> }) {
  const sp = await searchParams;
  const q = normalizeArabic((sp.q ?? "").trim()), aud = sp.a && AUDIENCE_LABELS[sp.a] ? sp.a : "citizen";
  const words = q.split(/\s+/).filter(Boolean);
  const list = TX.filter((t) => t.audience === aud && words.every((w) => normalizeArabic(`${t.title} ${t.category}`).includes(w)));
  const byCat = new Map<string, typeof list>();
  for (const t of list) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">كتالوج المعاملات البلدية</h1>
        <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">مسودة بحثية غير معتمدة من البلدية، ولا تتضمن أي مبالغ. المعتمد وحده يظهر للمواطنين.</p>
      </header>
      <nav className="flex flex-wrap gap-2">
        {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
          <Link key={k} href={`/catalog?a=${k}`} className={`rounded-full border px-4 py-2 text-sm font-semibold ${k === aud ? "bg-primary text-primary-foreground" : "bg-background"}`}>{v}</Link>
        ))}
      </nav>
      <form className="flex gap-2"><input type="hidden" name="a" value={aud} />
        <input id="q-catalog" name="q" defaultValue={sp.q ?? ""} placeholder="ابحث عن معاملة…" className="min-h-12 min-w-0 flex-1 rounded-xl border bg-background px-4" />
        <Mic target="q-catalog" mode="replace" submit />
        <button className="min-h-12 rounded-xl bg-primary px-6 font-semibold text-primary-foreground">بحث</button></form>
      <p className="text-sm text-muted-foreground">{list.length} معاملة</p>
      {[...byCat].map(([cat, items]) => (
        <section key={cat} className="space-y-2">
          <h2 className="text-sm font-bold text-primary">{cat}</h2>
          <ul className="divide-y rounded-xl border bg-background">
            {items.map((t) => <li key={t.id}><Link href={`/catalog/${t.id}`} className="flex gap-3 p-3 hover:bg-muted"><span className="min-w-14 font-bold">{t.id}</span><span className="text-sm leading-7">{t.title}</span></Link></li>)}
          </ul>
        </section>
      ))}
    </main>
  );
}
