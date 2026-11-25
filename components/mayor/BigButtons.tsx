import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type BigButton = { href: string; title: string; Icon: LucideIcon };
export default function BigButtons({ items }: { items: BigButton[] }) {
  return (
    <nav aria-label="الأقسام" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(({ href, title, Icon }) => (
        <Link key={href} href={href} className="elev elev-hover flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border bg-background px-3 py-4 text-center active:bg-muted">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent text-primary"><Icon className="size-7" aria-hidden /></span>
          <b className="text-base">{title}</b>
        </Link>
      ))}
    </nav>
  );
}
