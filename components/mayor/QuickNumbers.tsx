import Link from "next/link";

export type QuickNumber = { label: string; value: string | null; href: string; note?: string };
/** Exactly the numbers passed in; a missing value is shown honestly as «غير متاح». */
export default function QuickNumbers({ items }: { items: QuickNumber[] }) {
  return (
    <section aria-label="صورة سريعة" className="space-y-3">
      <h2 className="flex items-center gap-2 px-1 text-lg font-extrabold text-primary"><span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />صورة سريعة</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((n) => (
          <Link key={n.label} href={n.href} className="elev elev-hover rounded-2xl border bg-background p-4 active:bg-muted">
            <span className="block text-sm text-muted-foreground">{n.label}</span>
            <b className={`mt-1 block leading-tight ${n.value ? "text-2xl text-primary" : "text-base text-muted-foreground"}`}>{n.value ?? "غير متاح"}</b>
            {n.note && <span className="mt-0.5 block text-xs text-muted-foreground">{n.note}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
