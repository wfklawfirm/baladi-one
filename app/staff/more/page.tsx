import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, DatabaseZap, ScanSearch, FileSignature, Inbox, ClipboardCheck, UsersRound, LogOut, Scale, BookOpen, Users, MonitorSmartphone, Globe, ListChecks, Gauge, Banknote, Landmark, Wallet, HardHat, FileBarChart, ChevronLeft, ShieldCheck, ShoppingCart } from "lucide-react";
import { requireStaff } from "@/lib/supabase-server";
import { BRAND, OFFICIAL } from "@/lib/brand";
import { brainConfigured } from "@/lib/brain/rag";
import StaffHeader from "@/components/StaffHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "المزيد — BALADI ONE", referrer: "no-referrer" as const };
type Item = { href: string; Icon: typeof Bot; title: string; sub: string; external?: boolean };
type Group = { title: string; items: Item[] };

async function signOut() { "use server"; const { supabaseServer } = await import("@/lib/supabase-server"); await (await supabaseServer()).auth.signOut(); redirect(`/m/${BRAND.slug}`); }

export default async function More({ searchParams }: { searchParams: Promise<{ full?: string }> }) {
  const { memberships } = await requireStaff();
  const sp = await searchParams;
  const full = sp.full === "1";
  const top = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const admin = memberships.some((m) => m.role === "admin");
  const on = brainConfigured();
  const aiOff = (h: string) => !on && ["/staff/assistant", "/staff/analyze", "/staff/decisions"].includes(h);

  const daily: Item[] = [
    { href: "/staff/requests", Icon: Inbox, title: "الطلبات الواردة", sub: "الطلبات والشكاوى" },
    { href: "/staff/collections", Icon: Banknote, title: "التحصيل", sub: "تسجيل الإيصالات" },
    { href: "/staff/decisions", Icon: FileSignature, title: "مولّد القرارات", sub: "قرارات وكتب ومحاضر للتوقيع" },
    { href: "/staff/analyze", Icon: ScanSearch, title: "قراءة المعاملة", sub: "ملاحظات وخيارات قرار جاهزة" },
    { href: "/staff/assistant", Icon: Bot, title: "المساعد الذكي", sub: "اسأل في القوانين والاجتهادات" },
  ];
  const lead: Item[] = [
    { href: "/staff/council", Icon: Landmark, title: "المجلس والقرارات", sub: "جلسات وسجل قرارات" },
    { href: "/staff/finance", Icon: Wallet, title: "المالية والموازنة", sub: "اعتمادات ومستحقات وتحصيل" },
    { href: "/staff/projects", Icon: HardHat, title: "المشاريع والعقود", sub: "إنجاز وتأخر وعقود" },
    { href: "/staff/procurement", Icon: ShoppingCart, title: "الشراء العام", sub: "خطة الشراء والعروض واللجان والاعتراضات والملف الرقابي" },
    { href: "/staff/admin", Icon: ClipboardCheck, title: "الإدارة البلدية", sub: "مراسلات وأملاك وشؤون قانونية ورقابة وشفافية" },
    { href: "/staff/legal", Icon: Scale, title: "المرجعية القانونية", sub: "سجل القواعد وحالة مراجعتها" },
    { href: "/staff/services", Icon: ClipboardCheck, title: "اعتماد الخدمات", sub: "مراجعة المعاملات المنشورة" },
  ];
  const system: Item[] = [
    { href: "/staff/brain", Icon: DatabaseZap, title: "قاعدة معرفة الذكاء", sub: "تحميل مكتبة القوانين" },
    { href: "/staff/accounts", Icon: UsersRound, title: "الحسابات", sub: "إدارة المستخدمين" },
  ];
  const links: Item[] = [
    { href: "/laws", Icon: Scale, title: "القوانين والأنظمة", sub: "نصوص وبحث سريع" },
    { href: "/catalog", Icon: BookOpen, title: "دليل المعاملات", sub: "شروط ومستندات ورسوم" },
    { href: `/m/${BRAND.slug}/services`, Icon: ListChecks, title: "خدمات البلدية", sub: "كما يراها المواطن" },
    { href: `/m/${BRAND.slug}/citizen`, Icon: Users, title: "بوابة المواطن", sub: "معاينة الواجهة العامة" },
    { href: `/kiosk/${BRAND.slug}`, Icon: MonitorSmartphone, title: "شاشة الكشك", sub: "عرض اللمس" },
    { href: OFFICIAL.home, Icon: Globe, title: "الموقع الرسمي", sub: "khreibeteljundi.gov.lb", external: true },
  ];
  const watch: Item[] = [
    { href: "/staff/operations", Icon: Gauge, title: "مركز القيادة", sub: "مؤشرات وتحليل" },
    { href: "/staff/reports", Icon: FileBarChart, title: "التقارير", sub: "تقارير جاهزة للطباعة" },
  ];

  const groups: Group[] = full
    ? [{ title: "العمل اليومي", items: daily }, ...(top ? [{ title: "القيادة والإدارة", items: [...watch, ...lead] }] : []), ...(admin ? [{ title: "إدارة النظام", items: system }] : []), { title: "مراجع وروابط سريعة", items: links }]
    : [
        { title: "الإدارة البلدية", items: top ? [...watch, daily[1], lead[3], lead[5], lead[4], daily[3], daily[4]] : [daily[3], daily[4]] },
        { title: "المراجع والروابط", items: links },
        ...(admin ? [{ title: "إدارة النظام", items: system }] : []),
      ];

  return (
    <>
      <StaffHeader />
      <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-6 px-4 py-5 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="size-6 text-primary" aria-hidden />المزيد</h1>
          <Link href={full ? "/staff/more" : "/staff/more?full=1"} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold active:bg-muted">{full ? "العرض المبسّط" : "العرض الكامل"}</Link>
        </div>
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="space-y-3">
            <h2 className="flex items-center gap-2 px-1 text-base font-extrabold text-primary"><span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />{g.title}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {g.items.map(({ href, Icon, title, sub, external }) => (
                <Link key={href} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="elev elev-hover flex min-h-[4.5rem] items-center gap-3.5 rounded-2xl border bg-background px-4 py-3 active:bg-muted">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span>
                  <span className="min-w-0 flex-1"><b className="block text-base leading-snug">{title}</b><span className="block text-xs leading-5 text-muted-foreground sm:text-sm">{aiOff(href) ? "قريبًا" : sub}</span></span>
                  <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ))}
        <form action={signOut} className="text-center"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 text-sm active:bg-muted"><LogOut className="size-4" />خروج</button></form>
      </main>
    </>
  );
}
