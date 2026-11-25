import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaw, searchLaws, snippet } from "@/lib/laws";
import Mic from "@/components/Mic";

export default async function LawPage({ params, searchParams }: { params: Promise<{ law: string }>; searchParams: Promise<{ q?: string }> }) {
  const law = getLaw((await params).law);
  if (!law) notFound();
  const q = ((await searchParams).q ?? "").trim();
  const hits = q ? searchLaws(q, law.id) : [];
  const groups: { part: string; items: typeof law.articles }[] = [];
  for (const a of law.articles) {
    const last = groups[groups.length - 1];
    if (last && last.part === a.part) last.items.push(a); else groups.push({ part: a.part, items: [a] });
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8 lg:max-w-7xl">
      <Link href="/laws" className="text-sm text-primary">← المكتبة القانونية</Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{law.title}</h1>
        <p className="text-sm text-muted-foreground">{law.article_count} مادة · تاريخ {law.date} · المصدر: {law.source}</p>
        {law.note && <p className="text-sm">{law.note}</p>}
        <a href={law.url} className="text-sm text-primary underline" target="_blank" rel="noreferrer">الملف الرسمي (PDF)</a>
      </header>
      <form className="flex gap-2">
        <input id="q-law" name="q" defaultValue={q} placeholder={`ابحث داخل ${law.short}…`} className="min-h-12 min-w-0 flex-1 rounded-xl border bg-background px-4" />
        <Mic target="q-law" mode="replace" submit />
        <button className="min-h-12 rounded-xl bg-primary px-6 font-semibold text-primary-foreground">بحث</button>
      </form>
      {q ? (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">{hits.length ? `${hits.length} نتيجة` : "لا توجد نتائج."}</p>
          {hits.map((h) => (
            <Link key={h.article.n} href={`/laws/${law.id}/${h.article.n}`} className="block rounded-xl border bg-background p-4 hover:border-primary">
              <p className="text-sm font-semibold text-primary">المادة {h.article.n}{h.article.heading ? ` | ${h.article.heading}` : ""}</p>
              <p className="mt-1 text-sm leading-7">{snippet(h.article.text, q)}</p>
            </Link>
          ))}
        </section>
      ) : (
        <div className="space-y-6">
          {groups.map((g, i) => (
            <section key={i} className="space-y-2">
              {g.part && <h2 className="text-sm font-bold text-primary">{g.part}</h2>}
              <ul className="divide-y rounded-xl border bg-background">
                {g.items.map((a) => (
                  <li key={a.n}>
                    <Link href={`/laws/${law.id}/${a.n}`} className="flex gap-3 p-3 hover:bg-muted">
                      <span className="min-w-14 font-bold">م.{a.n}</span>
                      <span className="text-sm leading-7">{a.heading || a.text.slice(0, 110) + (a.text.length > 110 ? "…" : "")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
