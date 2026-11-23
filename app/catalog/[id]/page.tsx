import Link from "next/link";
import { notFound } from "next/navigation";
import { getTx, lawsFor } from "@/lib/draft";

const List = ({ title, items }: { title: string; items: string[] }) => items.length ? (
  <section className="space-y-2"><h2 className="font-bold">{title}</h2>
    <ul className="list-disc space-y-1 ps-6 leading-8">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></section>) : null;

export default async function TxPage({ params }: { params: Promise<{ id: string }> }) {
  const t = getTx((await params).id);
  if (!t) notFound();
  const laws = lawsFor(t.id);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <Link href="/catalog" className="text-sm text-primary">← الكتالوج</Link>
      <header className="space-y-1"><p className="text-sm font-semibold text-primary">{t.category} · {t.id}</p><h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">الجهة: {t.authority || "—"} · الثقة: {t.confidence}</p></header>
      <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">مسودة غير معتمدة من البلدية — للمراجعة فقط.</p>
      {laws.length > 0 && (
        <section className="space-y-2"><h2 className="font-bold">المواد القانونية ذات الصلة</h2>
          <div className="flex flex-wrap gap-2">{laws.map((l) => <Link key={l.lawId + l.n} href={`/laws/${l.lawId}/${l.n}`} className={`rounded-full border bg-background px-3 py-1 text-sm hover:border-primary ${l.weak ? "border-dashed text-muted-foreground" : ""}`}>{l.short} م.{l.n}{l.weak ? " (مرجَّح)" : ""}</Link>)}</div>
          {laws.some((l) => l.weak) && <p className="text-xs text-muted-foreground">الروابط المنقّطة مرجَّحة وتحتاج مراجعة قانونية.</p>}</section>)}
      {t.legal_basis && <p className="text-sm text-muted-foreground">الأساس القانوني: {t.legal_basis}</p>}
      <List title="المستندات المطلوبة" items={t.documents.map((d) => d.t)} />
      <List title="المراحل" items={t.stages.map((d) => d.t)} />
      <List title="المهل" items={t.timeline.map((d) => d.value)} />
      <List title="تفاصيل إضافية (غير محققة)" items={[...t.extra, ...t.extra_stages].map((d) => d.t).concat(t.extra_timeline.map((d) => d.value))} />
      {t.notes && <p className="whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{t.notes}</p>}
    </main>
  );
}
