import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ListChecks, Clock, Building2, Scale } from "lucide-react";
import { getTx, lawsFor } from "@/lib/draft";
import { BRAND, OFFICIAL } from "@/lib/brand";
import PortalFooter from "@/components/PortalFooter";

const Card = ({ icon, title, items, ordered }: { icon: React.ReactNode; title: string; items: string[]; ordered?: boolean }) => {
  if (!items.length) return null;
  const Tag = ordered ? "ol" : "ul";
  return (
    <section className="elev space-y-3 rounded-2xl border bg-background p-5">
      <h2 className="flex items-center gap-2 font-bold"><span className="grid size-8 place-items-center rounded-lg bg-accent text-primary">{icon}</span>{title}</h2>
      <Tag className={`space-y-1.5 ps-6 leading-8 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</Tag>
    </section>
  );
};

export default async function TxPage({ params }: { params: Promise<{ id: string }> }) {
  const t = getTx((await params).id);
  if (!t) notFound();
  const laws = lawsFor(t.id);
  const extra = [...t.extra, ...t.extra_stages].map((d) => d.t).concat(t.extra_timeline.map((d) => d.value));
  return (
    <main className="pb-16">
      <section className="border-b bg-background px-4 pb-8 pt-8">
        <div className="mx-auto max-w-3xl space-y-3 lg:max-w-7xl">
          <Link href={`/m/${BRAND.slug}/services`} className="text-sm text-muted-foreground hover:text-primary">← المعاملات البلدية</Link>
          <p className="text-sm font-semibold text-primary">{t.category}</p>
          <h1 className="text-3xl font-bold leading-snug text-foreground lg:text-4xl">{t.title}</h1>
          {t.authority && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="size-4" />{t.authority}</p>}
        </div>
      </section>
      <div className="mx-auto mt-6 max-w-3xl space-y-4 px-4 lg:max-w-7xl lg:columns-2 lg:gap-6 lg:space-y-0 [&>*]:break-inside-avoid lg:[&>*]:mb-6">
        <Card icon={<FileText className="size-4" />} title="المستندات المطلوبة" items={t.documents.map((d) => d.t)} />
        <Card icon={<ListChecks className="size-4" />} title="المراحل" items={t.stages.map((d) => d.t)} ordered />
        <Card icon={<Clock className="size-4" />} title="المهل" items={[...new Set(t.timeline.map((d) => d.value))]} />
        {laws.length > 0 && (
          <section className="elev space-y-3 rounded-2xl border bg-background p-5">
            <h2 className="flex items-center gap-2 font-bold"><span className="grid size-8 place-items-center rounded-lg bg-accent text-primary"><Scale className="size-4" /></span>المواد القانونية ذات الصلة</h2>
            <div className="flex flex-wrap gap-2">{laws.map((l) => <Link key={l.lawId + l.n} href={`/laws/${l.lawId}/${l.n}`} className={`rounded-full border bg-background px-3 py-1 text-sm hover:border-primary ${l.weak ? "border-dashed text-muted-foreground" : ""}`}>{l.short} م.{l.n}{l.weak ? " (مرجَّح)" : ""}</Link>)}</div>
            {laws.some((l) => l.weak) && <p className="text-xs text-muted-foreground">الروابط المنقّطة مرجَّحة وتحتاج مراجعة قانونية.</p>}
            {t.legal_basis && <p className="text-sm text-muted-foreground">الأساس القانوني: {t.legal_basis}</p>}
          </section>)}
        {laws.length === 0 && t.legal_basis && <p className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">الأساس القانوني: {t.legal_basis}</p>}
        <Card icon={<FileText className="size-4" />} title="تفاصيل إضافية (غير محققة)" items={extra} />
        <a href={OFFICIAL.forms} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">النماذج الرسمية على موقع البلدية ↗</a>
        {t.notes && <p className="whitespace-pre-line rounded-2xl bg-muted p-4 text-sm leading-7">{t.notes}</p>}
      </div>
      <PortalFooter />
    </main>
  );
}
