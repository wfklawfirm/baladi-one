import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, DatabaseZap, ScanSearch, FileSignature, Inbox, ClipboardCheck, UsersRound, LogOut, Scale, BookOpen, Users, MonitorSmartphone, Globe, ListChecks, Gauge, Banknote, Landmark, Wallet, HardHat, FileBarChart, ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/supabase-server";
import { STATUS_AR } from "@/lib/reports";
import { BRAND, OFFICIAL } from "@/lib/brand";
import { brainConfigured } from "@/lib/brain/rag";
import Emblem from "@/components/Emblem";
import KpiGrid from "@/components/ops/KpiGrid";
import { buildCards, loadOps } from "@/lib/opsData";
import { parsePeriod } from "@/lib/ops";
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
  const cards = top ? buildCards(await loadOps(sb, parsePeriod("month", undefined, undefined))) : null;
  const aiOff = (h: string) => !on && ["/staff/assistant", "/staff/analyze", "/staff/decisions"].includes(h);
  const groups: { title: string; items: { href: string; Icon: typeof Bot; title: string; sub: string }[] }[] = [
    { title: "العمل اليومي", items: [
      { href: "/staff/requests", Icon: Inbox, title: "الطلبات الواردة", sub: `${rows.filter((r) => r.status === "received").length} جديدة` },
      { href: "/staff/collections", Icon: Banknote, title: "التحصيل", sub: "تسجيل الإيصالات" },
      { href: "/staff/decisions", Icon: FileSignature, title: "مولّد القرارات", sub: "قرارات وكتب ومحاضر للتوقيع" },
      { href: "/staff/analyze", Icon: ScanSearch, title: "قراءة المعاملة", sub: "ملاحظات وخيارات قرار جاهزة" },
      { href: "/staff/assistant", Icon: Bot, title: "المساعد الذكي", sub: "اسأل في القوانين والاجتهادات" },
    ] },
    ...(top ? [{ title: "القيادة والإدارة", items: [
      { href: "/staff/council", Icon: Landmark, title: "المجلس والقرارات", sub: "جلسات وسجل قرارات" },
      { href: "/staff/finance", Icon: Wallet, title: "المالية والموازنة", sub: "اعتمادات ومستحقات وتحصيل" },
      { href: "/staff/projects", Icon: HardHat, title: "المشاريع والعقود", sub: "إنجاز وتأخر وعقود" },
      { href: "/staff/services", Icon: ClipboardCheck, title: "اعتماد الخدمات", sub: "مراجعة المعاملات المنشورة" },
    ] }] : []),
    ...(admin ? [{ title: "إدارة النظام", items: [
      { href: "/staff/brain", Icon: DatabaseZap, title: "قاعدة معرفة الذكاء", sub: "تحميل مكتبة القوانين" },
      { href: "/staff/accounts", Icon: UsersRound, title: "الحسابات", sub: "إدارة المستخدمين" },
    ] }] : []),
  ];
  const today = new Intl.DateTimeFormat("ar-LB", { dateStyle: "full", timeZone: "Asia/Beirut" }).format(new Date());
  const roleTxt = memberships.map((m) => ROLE_AR[m.role] ?? m.role).filter((v, i, a) => a.indexOf(v) === i).join("، ");
  const KP = [["received", "تم الاستلام"], ["in_progress", "قيد المعالجة"], ["needs_info", "بحاجة إلى معلومات"], ["done", "تمت المعالجة"]] as const;
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
      <header className="border-b bg-background"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
        <Emblem size={44} />
        <p className="text-sm font-bold text-primary">مساحة العمل</p>
        <img src="/aijur-logo.png" alt="AIJUR" className="h-10 w-auto" />
      </div></header>
      <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-6 px-4 py-5 md:py-8">
        {admin && on && <AutoIngest />}
        <section className="overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-sm">
          <div className="space-y-1 px-5 pb-4 pt-5 sm:px-7">
            <p className="text-xs opacity-80">{today}</p>
            <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">{memberships[0]?.municipality?.name_ar}</h1>
            <p className="text-sm opacity-90">{roleTxt}{isDemo ? " · نسخة تجريبية" : ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-white/15 sm:grid-cols-4">
            {KP.map(([k, label]) => (
              <Link key={k} href={`/staff/requests?s=${k}`} className="flex items-center justify-between gap-2 bg-primary px-4 py-3 active:bg-white/10 sm:flex-col sm:items-start sm:gap-0.5">
                <span className="text-xs opacity-85 sm:text-[13px]">{label}</span>
                <b className="text-2xl leading-none sm:text-3xl">{rows.filter((r) => r.status === k).length}</b>
              </Link>
            ))}
          </div>
        </section>
        {top && (
          <nav aria-label="وصول سريع" className="grid grid-cols-2 gap-3">
            <Link href="/staff/operations" className="elev elev-hover flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-accent px-4 py-3 text-primary active:opacity-90"><Gauge className="size-7 shrink-0" aria-hidden /><span><b className="block text-base sm:text-lg">مركز القيادة</b><span className="block text-xs opacity-80">الحالة والمؤشرات</span></span></Link>
            <Link href="/staff/reports" className="elev elev-hover flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-accent px-4 py-3 text-primary active:opacity-90"><FileBarChart className="size-7 shrink-0" aria-hidden /><span><b className="block text-base sm:text-lg">التقارير</b><span className="block text-xs opacity-80">Excel وطباعة PDF</span></span></Link>
          </nav>
        )}
        {cards && (
          <section aria-label="مركز القيادة" className="space-y-3">
            <h2 className="flex items-center gap-2 px-1 text-base font-extrabold text-primary"><span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden /><span className="flex-1">مؤشرات مركز القيادة</span><Link href="/staff/operations" className="text-sm font-semibold">التفاصيل ←</Link></h2>
            <KpiGrid cards={cards} />
          </section>
        )}
        <div className="grid items-start gap-5 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className={`rounded-3xl border bg-muted/40 p-3 sm:p-5 ${groups.length === 3 && g.title === "إدارة النظام" ? "lg:col-span-2" : ""}`}>
            <h2 className="mb-3 flex items-center gap-2 px-1 text-base font-extrabold text-primary"><span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />{g.title}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1">
              {g.items.map(({ href, Icon, title, sub }) => (
                <Link key={href} href={href} className="elev elev-hover flex min-h-[4.5rem] items-center gap-3.5 rounded-2xl border bg-background px-4 py-3 active:bg-muted sm:last:odd:col-span-2">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span>
                  <span className="min-w-0 flex-1"><b className="block text-base leading-snug">{title}</b><span className="block text-xs leading-5 text-muted-foreground sm:text-sm">{aiOff(href) ? "قريبًا" : sub}</span></span>
                  <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ))}
        </div>
        <h2 className="flex items-center gap-2 px-1 text-base font-extrabold text-primary"><span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />مراجع وروابط سريعة</h2>
        <section className="-mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {links.map(({ href, Icon, title, sub, external }) => (
            <Link key={href} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="elev elev-hover flex min-h-[4.5rem] items-center gap-3.5 rounded-2xl border bg-background px-4 py-3 text-start active:bg-muted">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span>
              <span className="min-w-0"><b className="block text-base">{title}</b><span className="block truncate text-xs text-muted-foreground sm:text-sm">{sub}</span></span>
            </Link>
          ))}
        </section>
        <form action={signOut} className="text-center"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 text-sm active:bg-muted"><LogOut className="size-4" />خروج</button></form>
      </main>
    </>
  );
}
