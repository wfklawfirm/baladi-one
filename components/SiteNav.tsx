"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [["/m/demo", "الرئيسية"], ["/catalog", "المعاملات"], ["/laws", "القوانين"], ["/m/demo/track", "تتبّع طلب"]] as const;

export default function SiteNav() {
  const path = usePathname() ?? "";
  if (path.startsWith("/kiosk") || path.startsWith("/staff")) return null;
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-primary text-primary-foreground shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/m/demo" className="flex items-center gap-2 font-bold">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-white/15 text-sm">ب</span>
          <span>BALADI ONE</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map(([href, label]) => {
            const active = href === "/m/demo" ? path === href : path.startsWith(href);
            return <Link key={href} href={href} className={`rounded-lg px-3 py-2 ${active ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}>{label}</Link>;
          })}
        </nav>
      </div>
    </header>
  );
}
