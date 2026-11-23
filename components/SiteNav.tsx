"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Emblem from "./Emblem";
import { BRAND } from "@/lib/brand";

const home = `/m/${BRAND.slug}`;
const LINKS = [[home, "الرئيسية"], [`${home}/services`, "المعاملات"], ["/laws", "القوانين"], [`${home}/track`, "تتبّع طلب"]] as const;

export default function SiteNav() {
  const path = usePathname() ?? "";
  if (path.startsWith("/kiosk") || path.startsWith("/staff")) return null;
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href={home} className="flex items-center gap-2.5">
          <Emblem size={44} />
        </Link>
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {LINKS.map(([href, label]) => {
            const active = href === home ? path === href || path === `${href}/citizen` : path.startsWith(href) || (href.endsWith("/services") && path.startsWith("/catalog"));
            return <Link key={href} href={href} className={`rounded-lg px-3 py-2 ${active ? "font-bold text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>;
          })}
        </nav>
        <img src="/aijur-logo.png" alt="AIJUR" className="h-10 w-auto" />
      </div>
      <nav className="flex justify-around border-t text-xs sm:hidden">
        {LINKS.map(([href, label]) => <Link key={href} href={href} className={`flex-1 py-2 text-center ${(href === home ? path === href || path === `${href}/citizen` : path.startsWith(href) || (href.endsWith("/services") && path.startsWith("/catalog"))) ? "font-bold text-primary" : "text-muted-foreground"}`}>{label}</Link>)}
      </nav>
    </header>
  );
}
