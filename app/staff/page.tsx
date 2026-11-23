import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, DatabaseZap, ScanSearch, FileSignature, Inbox, ClipboardCheck, UsersRound, LogOut } from "lucide-react";
import { requireStaff } from "@/lib/supabase-server";
import { STATUS_AR } from "@/lib/reports";
import { BRAND } from "@/lib/brand";
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
    ...(top ? [{ href: "/staff/services", Icon: ClipboardCheck, title: "اعتماد الخدمات", sub: "مراجعة المعاملات المنشورة" }] : []),
    ...(admin ? [{ href: "/staff/brain", Icon: DatabaseZap, title: "قاعدة معرفة الذكاء", sub: "تحميل مكتبة القوانين" }] : []),
    ...(admin ? [{ href: "/staff/accounts", Icon: UsersRound, title: "الحسابات", sub: "إدارة المستخدمين" }] : []),
  ];
  return (
    <>
      <header className="border-b bg-background"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Emblem size={44} />
        <div className="text-center"><p className="font-bold">{memberships.map((m) => ROLE_AR[m.role] ?? m.role).filter((v, i, a) => a.indexOf(v) === i).join("، ")}</p><p className="text-xs text-muted-foreground">{memberships[0]?.municipality?.name_ar}</p></div>
        <img src="/aijur-logo.png" alt="AIJUR" className="h-10 w-auto" />
      </div></header>
      <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:py-10">
        {admin && on && <AutoIngest />}
        {isDemo && <p className="rounded-xl bg-accent p-3 text-center text-sm text-accent-foreground">حساب عرض — البيانات تجريبية.</p>}
        {top && (
          <section aria-label="نظرة عامة" className="grid grid-cols-4 gap-2 sm:gap-3">
            {(["received", "in_progress", "needs_info", "done"] as const).map((k) => (
              <Link key={k} href={`/staff/requests?s=${k}`} className="elev rounded-2xl border bg-background p-3 text-center active:bg-muted"><b className="block text-2xl text-primary sm:text-3xl">{rows.filter((r) => r.status === k).length}</b><span className="block text-[11px] leading-tight text-muted-foreground sm:text-sm">{STATUS_AR[k]}</span></Link>
            ))}
          </section>
        )}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
          {tools.map(({ href, Icon, title, sub }) => (
            <Link key={href} href={href} className="elev elev-hover flex min-h-44 flex-col items-center justify-center gap-3 rounded-3xl border bg-background p-4 text-center active:bg-muted sm:min-h-52">
              <span className="grid size-16 place-items-center rounded-2xl bg-accent text-primary sm:size-20"><Icon className="size-8 sm:size-10" aria-hidden /></span>
              <b className="text-base sm:text-lg">{title}</b>
              <span className="text-xs text-muted-foreground sm:text-sm">{!on && ["/staff/assistant", "/staff/analyze", "/staff/decisions"].includes(href) ? "قريبًا" : sub}</span>
            </Link>
          ))}
        </section>
        <form action={signOut} className="text-center"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 text-sm active:bg-muted"><LogOut className="size-4" />خروج</button></form>
      </main>
    </>
  );
}
