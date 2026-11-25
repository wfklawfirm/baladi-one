import Link from "next/link";
import { ChevronLeft, FileSignature, Inbox as InboxIcon, Landmark, ClipboardCheck } from "lucide-react";
import type { InboxItem } from "@/lib/mayorInboxCore";

const ICON = { request: InboxIcon, decision: FileSignature, minutes: Landmark, service: ClipboardCheck } as const;
const MAX = 8;

/** "بانتظار قرارك": one row per item, one action each. Empty state is explicit. */
export default function Inbox({ items, total }: { items: InboxItem[]; total: number }) {
  const shown = items.slice(0, MAX);
  return (
    <section aria-label="بانتظار قرارك" className="space-y-3">
      <h2 className="flex items-center gap-2 px-1 text-lg font-extrabold text-primary"><span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />بانتظار قرارك{total > 0 && <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm text-primary-foreground">{total}</span>}</h2>
      {shown.length === 0 ? (
        <p className="rounded-2xl border bg-background p-6 text-center text-base text-muted-foreground">لا شيء ينتظر قراركم الآن.</p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((it, i) => { const Icon = ICON[it.kind]; return (
            <li key={`${it.kind}-${i}`}>
              <Link href={it.href} className="elev elev-hover flex min-h-[4.5rem] items-center gap-3.5 rounded-2xl border bg-background px-4 py-3 active:bg-muted">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span>
                <span className="min-w-0 flex-1"><b className="block text-base leading-snug">{it.title}</b>{it.age && <span className="block text-xs text-muted-foreground">{it.age}</span>}</span>
                <span className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">{it.actionLabel}</span>
                <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>); })}
        </ul>
      )}
      {total > MAX && <p className="px-1 text-sm text-muted-foreground">و{total - MAX} بنودًا أخرى — تظهر بعد إنجاز ما فوقها.</p>}
    </section>
  );
}
