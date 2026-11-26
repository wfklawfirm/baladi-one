"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Emblem from "./Emblem";
import { BRAND, OFFICIAL } from "@/lib/brand";

const home = `/m/${BRAND.slug}`;
const cHome = `/c/${BRAND.slug}`;

export default function SiteNav() {
  const path = usePathname() ?? "";
  const [viaC, setViaC] = useState(false);
  useEffect(() => { try { setViaC(/(?:^|; )portal=c(?:;|$)/.test(document.cookie)); } catch { /* keep default */ } }, [path]);
  const LINKS = [[viaC ? cHome : home, "الرئيسية"], [`${home}/services`, "المعاملات البلدية"], ...(viaC ? [] : [["/laws", "القوانين"]]), [`${home}/track`, "تتبّع طلب"]] as unknown as readonly (readonly [string, string])[];
  // A new page can open slightly scrolled (the browser clamps the old offset on a shorter page), leaving its heading under this sticky bar.
  useEffect(() => { if (window.scrollY > 0 && window.scrollY < 140 && !window.location.hash) window.scrollTo(0, 0); }, [path]);
  // The role chooser is a single decision with its own logo block; the other links live inside the citizen portal.
  const chooser = path === home;
  if (chooser || path.startsWith("/c/") || path.startsWith("/kiosk") || path.startsWith("/staff")) return null;
  return (
    <header data-site-nav className="sticky top-0 z-30 border-b bg-background">
      <div className={`mx-auto flex ${"max-w-3xl lg:max-w-7xl"} items-center justify-between gap-3 px-4 py-2`}>
        <Link href={viaC ? cHome : home} className="flex items-center gap-2.5">
          <Emblem size={56} />
        </Link>
        {!chooser && <nav className="hidden items-center gap-1 text-sm sm:flex lg:text-lg">
          {LINKS.map(([href, label]) => {
            const active = href === (viaC ? cHome : home) ? path === href || path === `${home}/citizen` : path.startsWith(href) || (href.endsWith("/services") && path.startsWith("/catalog"));
            return <Link key={href} href={href} className={`rounded-lg px-3 py-2 ${active ? "font-bold text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>;
          })}
          <a href={OFFICIAL.home} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground">الموقع الرسمي</a>
        </nav>}
        <img src="/aijur-logo.png" alt="AIJUR" className={`h-12 w-auto`} />
      </div>
      {!chooser && <nav className="flex justify-around border-t text-xs sm:hidden">
        {LINKS.map(([href, label]) => <Link key={href} href={href} className={`flex-1 py-2 text-center ${(href === (viaC ? cHome : home) ? path === href || path === `${home}/citizen` : path.startsWith(href) || (href.endsWith("/services") && path.startsWith("/catalog"))) ? "font-bold text-primary" : "text-muted-foreground"}`}>{label}</Link>)}
        <a href={OFFICIAL.home} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 text-center text-muted-foreground">الموقع الرسمي</a>
      </nav>}
    </header>
  );
}
