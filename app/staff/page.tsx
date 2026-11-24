import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, DatabaseZap, ScanSearch, FileSignature, Inbox, ClipboardCheck, UsersRound, LogOut, Scale, BookOpen, Users, MonitorSmartphone, Globe, ListChecks, Gauge, Banknote, Landmark, Wallet, HardHat, FileBarChart } from "lucide-react";
import { requireStaff } from "@/lib/supabase-server";
import { STATUS_AR } from "@/lib/reports";
import { BRAND, OFFICIAL } from "@/lib/brand";
import { brainConfigured } from "@/lib/brain/rag";
import Emblem from "@/components/Emblem";
import AutoIngest from "@/components/brain/AutoIngest";

const ROLE_AR: Record<string, string> = { staff: "موظف البلدية", mayor: "رئيس البلدية", admin: "مدير النظام" };
export const dynamic = "force-dynamic";
export const metadata = { title: "مساحة العمل — BALADI ONE", referrer: "no-referrer" as const };

async function signOut() { "use server"; const { supabaseServer } = await import("@/lib/supabase-server"); await (await supabaseServer()).auth.signOut(); redirect(`/m/${BRAND.slug}`); }

export default async function StaffHome() {
  const { sb, memberships } = await requireStaff();
  const { data } = await sb.from("citizen_request").select("status").limit(500);
  const rows = data ?? [];
  const isDemo = memberships.some((m) => m.is_demo);
  const top = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const admin = memberships.some((m) => m.role === "admin");
  const on = brainConfigured();
  const tools = [
    { href: "/staff/assistant", Icon: Bot, title: "المساعد الذكي", sub: "اسأل في القوانين والاجتهادات" },
    { href: "/staff/analyze", Icon: ScanSearch, title: "قراءة المعاملة", sub: "ملاحظات وخيارات قرار جاهزة" },
    { href: "/staff/decisions", Icon: FileSignature, title: "مولّد القرارات", sub: "قرارات وكتب ومحاضر للتوقيع" },
    { href: "/staff/requests", Icon: Inbox, title: "الطلبات الواردة", sub: `${rows.filter((r) => r.status === "received").length} جديدة` },
    ...(top ? [{ href: "/staff/operations", Icon: Gauge, title: "مركز القيادة", sub: "مؤشرات وتتبع وتقييم" }, { href: "/staff/council", Icon: Landmark, title: "المجلس والقرارات", sub: "جلسات وسجل قرارات" }, { href: "/staff/finance", Icon: Wallet, title: "المالية والموازنة", sub: "اعتمادات ومستحقات وتحصيل" }, { href: "/staff/projects", Icon: HardHat, title: "المشاريع والعقود", sub: "إنجاز وتأخر وعقود" }, { href: "/staff/reports", Icon: FileBarChart, title: "التقارير والتصدير", sub: "Excel وطباعة PDF" }] : []),
    { href: "/staff/collections", Icon: Banknote, title: "التحصيل", sub: "تسجيل الإيصالات" },
    ...(top ? [{ href: "/staff/services", Icon: ClipboardCheck, title: "اعتماد الخدمات", sub: "مراجعة المعاملات المنشورة" }] : []),
    ...(admin ? [{ href: "/staff/brain", Icon: DatabaseZap, title: "قاعدة معرفة الذكاء", sub: "تحميل مكتبة القوانين" }] : []),
    ...(admin ? [{ href: "/staff/accounts", Icon: UsersRound, title: "الحسابات", sub: "إدارة المستخدمين" }] : []),
  ];
  const links = [
    { href: "/laws", Icon: Scale, title: "القوانين والأنظمة", sub: "نصوص وبحث سريع" },
    { href: "/catalog", Icon: BookOpen, title: "دليل المعاملات", sub: "شروط ومستندات ورسوم" },
    { href: `/m/${BRAND.slug}/services`, Icon: ListChecks, title: "خدمات البلدية", sub: "كما يراها المواطن" },
    { href: `/m/${BRAND.slug}/citizen`, Icon: Users, title: "بوابة المواطن", sub: "معاينة الواجهة العامة" },
    { href: `/kiosk/${BRAND.slug}`, Icon: MonitorSmartphone, title: "شاشة الكشك", sub: "عرض اللمس" },
    { href: OFFICIAL.home, Icon: Globe, title: "الموقع الرسمي", sub: "khreibeteljundi.gov.lb", external: true },
  ];
  return (
    <>
      <header className="border-b bg-background"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Emblem size={44} />
        <div className="text-center"><p className="font-bold">{memberships.map((m) => ROLE_AR[m.role] ?? m.role).filter((v, i, a) => a.indexOf(v) === i).join("، ")}</p><p className="text-xs text-muted-foreground">{memberships[0]?.municipality?.name_ar}</p></div>
        <img src="/aijur-logo.png" alt="AIJUR" className="h-10 w-auto" />
      </div></header>
      <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:py-8">
        {admin && on && <AutoIngest />}
        {(
          <section aria-label="نظرة عامة" className="grid grid-cols-4 gap-2 sm:gap-3">
            {(["received", "in_progress", "needs_info", "done"] as const).map((k) => (
              <Link key={k} href={`/staff/requests?s=${k}`} className="elev rounded-2xl border bg-background p-3 text-center active:bg-muted"><b className="block text-2xl text-primary sm:text-3xl">{rows.filter((r) => r.status === k).length}</b><span className="block text-[11px] leading-tight text-muted-foreground sm:text-sm">{STATUS_AR[k]}</span></Link>
            ))}
          </section>
        )}
        <h2 className="text-center text-sm font-bold text-muted-foreground">أدوات العمل</h2>
        <section className="-mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {tools.map(({ href, Icon, title, sub }) => (
            <Link key={href} href={href} className="elev elev-hover flex min-h-40 flex-col items-center justify-center gap-2.5 rounded-3xl border bg-background p-4 text-center active:bg-muted sm:min-h-44">
              <span className="grid size-14 place-items-center rounded-2xl bg-accent text-primary sm:size-16"><Icon className="size-7 sm:size-8" aria-hidden /></span>
              <b className="text-base sm:text-lg">{title}</b>
              <span className="text-xs text-muted-foreground sm:text-sm">{!on && ["/staff/assistant", "/staff/analyze", "/staff/decisions"].includes(href) ? "قريبًا" : sub}</span>
            </Link>
          ))}
        </section>
        <h2 className="text-center text-sm font-bold text-muted-foreground">مراجع وروابط سريعة</h2>
        <section className="-mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {links.map(({ href, Icon, title, sub, external }) => (
            <Link key={href} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="elev elev-hover flex min-h-20 items-center gap-3 rounded-2xl border bg-background px-4 py-3 text-start active:bg-muted max-sm:flex-col max-sm:text-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-5" aria-hidden /></span>
              <span className="min-w-0"><b className="block text-base">{title}</b><span className="block truncate text-xs text-muted-foreground sm:text-sm">{sub}</span></span>
            </Link>
          ))}
        </section>
        <form action={signOut} className="text-center"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 text-sm active:bg-muted"><LogOut className="size-4" />خروج</button></form>
      </main>
    </>
  );
}
