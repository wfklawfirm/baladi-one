import Link from "next/link";
import { LAWS, searchLaws, snippet } from "@/lib/laws";
import Mic from "@/components/Mic";

export const metadata = { title: "المكتبة القانونية — BALADI ONE" };

export default async function LawsHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const hits = q ? searchLaws(q) : [];
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">المكتبة القانونية البلدية</h1>
        <p className="text-muted-foreground">قانون البلديات، قانون المحاسبة العمومية، قانون الشراء العام، ومرسوم أصول المحاسبة في البلديات — مادة بمادة وقابلة للبحث.</p>
      </header>
      <form action="/laws" className="flex gap-2">
        <input id="q-laws" name="q" defaultValue={q} placeholder="ابحث بكلمة أو برقم مادة…" className="min-h-12 min-w-0 flex-1 rounded-xl border bg-background px-4" />
        <Mic target="q-laws" mode="replace" submit />
        <button className="min-h-12 rounded-xl bg-primary px-6 font-semibold text-primary-foreground">بحث</button>
      </form>

      {q ? (
        <section className="space-y-3" aria-label="نتائج البحث">
          <p className="text-sm text-muted-foreground">{hits.length ? `${hits.length} نتيجة` : "لا توجد نتائج مطابقة."}</p>
          {hits.map((h) => (
            <Link key={`${h.law.id}-${h.article.n}`} href={`/laws/${h.law.id}/${h.article.n}`} className="block rounded-xl border bg-background p-4 hover:border-primary">
              <p className="text-sm font-semibold text-primary">{h.law.short} — المادة {h.article.n}{h.article.heading ? ` | ${h.article.heading}` : ""}</p>
              <p className="mt-1 text-sm leading-7">{snippet(h.article.text, q)}</p>
            </Link>
          ))}
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {LAWS.map((l) => (
            <li key={l.id}>
              <Link href={`/laws/${l.id}`} className="block h-full rounded-2xl border bg-background p-5 hover:border-primary">
                <p className="text-lg font-bold">{l.short}</p>
                <p className="mt-1 text-sm text-muted-foreground">{l.title}</p>
                <p className="mt-3 text-sm">{l.article_count} مادة · {l.date}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">النصوص مستخرجة آلياً من الملفات الرسمية ومصحَّحة لغوياً، وهي للاطلاع. للاستناد القانوني يُرجع إلى الجريدة الرسمية.</p>
    </main>
  );
}
