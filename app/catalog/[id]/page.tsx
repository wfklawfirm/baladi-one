import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ListChecks, Clock, Building2, Scale } from "lucide-react";
import { getTx, lawsFor } from "@/lib/draft";

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
      <section className="bg-gradient-to-b from-primary to-[#5e1623] px-4 pb-10 pt-8 text-primary-foreground">
        <div className="mx-auto max-w-3xl space-y-3">
          <Link href="/m/demo" className="text-sm text-white/80 hover:text-white">← كل المعاملات</Link>
          <p className="text-sm text-white/80">{t.category}</p>
          <h1 className="text-3xl font-bold leading-snug">{t.title}</h1>
          {t.authority && <p className="flex items-center gap-2 text-sm text-white/90"><Building2 className="size-4" />{t.authority}</p>}
        </div>
      </section>
      <div className="mx-auto -mt-5 max-w-3xl space-y-4 px-4">
        <p className="rounded-xl border border-primary/20 bg-accent p-3 text-sm text-accent-foreground">مسودة غير معتمدة من البلدية — للمراجعة فقط، ولا تتضمن أي مبالغ.</p>
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
        {t.notes && <p className="whitespace-pre-line rounded-2xl bg-muted p-4 text-sm leading-7">{t.notes}</p>}
      </div>
    </main>
  );
}
