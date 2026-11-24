import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaw } from "@/lib/laws";
import { txForArticle } from "@/lib/draft";

export default async function ArticlePage({ params }: { params: Promise<{ law: string; n: string }> }) {
  const { law: id, n } = await params;
  const law = getLaw(id);
  const num = Number(n);
  const idx = law ? law.articles.findIndex((a) => a.n === num) : -1;
  if (!law || idx < 0) notFound();
  const rel = txForArticle(law.id, num);
  const a = law.articles[idx], prev = law.articles[idx - 1], next = law.articles[idx + 1];
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-8 lg:max-w-5xl">
      <Link href={`/laws/${law.id}`} className="text-sm text-primary">← {law.short}</Link>
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{law.title}</p>
        {a.part && <p className="text-sm font-semibold text-primary">{a.part}</p>}
        <h1 className="text-2xl font-bold">المادة {a.n}{a.heading ? ` — ${a.heading}` : ""}</h1>
      </header>
      {a.note && <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{a.note}</p>}
      <article className="whitespace-pre-line rounded-2xl border bg-background p-5 text-lg leading-9">{a.text || "—"}</article>
      {rel.length > 0 && (
        <section className="space-y-2"><h2 className="font-bold">معاملات ترتبط بهذه المادة</h2>
          <ul className="divide-y rounded-xl border bg-background">{rel.map((t) => <li key={t.id}><Link href={`/catalog/${t.id}`} className="flex gap-3 p-3 hover:bg-muted"><span className="min-w-14 font-bold">{t.id}</span><span className="text-sm leading-7">{t.title}</span></Link></li>)}</ul></section>)}
      <nav className="flex justify-between gap-3">
        {next ? <Link href={`/laws/${law.id}/${next.n}`} className="rounded-xl border px-4 py-3 font-semibold">← المادة {next.n}</Link> : <span />}
        {prev ? <Link href={`/laws/${law.id}/${prev.n}`} className="rounded-xl border px-4 py-3 font-semibold">المادة {prev.n} →</Link> : <span />}
      </nav>
      <p className="text-sm text-muted-foreground">{law.source_note}</p>
    </main>
  );
}
