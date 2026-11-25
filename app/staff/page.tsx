import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Banknote, FileSignature, Landmark, Wallet, HardHat, LayoutGrid, ScanSearch, LogOut } from "lucide-react";
import { requireStaff } from "@/lib/supabase-server";
import { BRAND } from "@/lib/brand";
import { brainConfigured } from "@/lib/brain/rag";
import Emblem from "@/components/Emblem";
import AutoIngest from "@/components/brain/AutoIngest";
import Inboxx from "@/components/mayor/Inbox";
import QuickNumbers, { type QuickNumber } from "@/components/mayor/QuickNumbers";
import BigButtons, { type BigButton } from "@/components/mayor/BigButtons";
import { loadMayorInbox } from "@/lib/mayorInbox";
import { buildCards, loadOps } from "@/lib/opsData";
import { parsePeriod } from "@/lib/ops";

const ROLE_AR: Record<string, string> = { staff: "موظف البلدية", mayor: "رئيس البلدية", admin: "مدير النظام" };
export const dynamic = "force-dynamic";
export const metadata = { title: "اليوم — BALADI ONE", referrer: "no-referrer" as const };

async function signOut() { "use server"; const { supabaseServer } = await import("@/lib/supabase-server"); await (await supabaseServer()).auth.signOut(); redirect(`/m/${BRAND.slug}`); }

export default async function StaffHome() {
  const { sb, memberships } = await requireStaff();
  const top = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const admin = memberships.some((m) => m.role === "admin");
  const isDemo = memberships.some((m) => m.is_demo);
  const on = brainConfigured();
  const today = new Intl.DateTimeFormat("ar-LB", { dateStyle: "full", timeZone: "Asia/Beirut" }).format(new Date());
  const roleTxt = memberships.map((m) => ROLE_AR[m.role] ?? m.role).filter((v, i, a) => a.indexOf(v) === i).join("، ");

  let inbox: Awaited<ReturnType<typeof loadMayorInbox>> = { items: [], total: 0 };
  let quick: QuickNumber[] = [];
  let newReqs: number | null = null;
  try { const r = await sb.from("citizen_request").select("id", { count: "exact", head: true }).eq("status", "received"); if (!r.error) newReqs = r.count ?? 0; } catch { /* unavailable */ }
  if (top) {
    inbox = await loadMayorInbox(sb);
    let ops: Awaited<ReturnType<typeof loadOps>> | null = null;
    try { ops = await loadOps(sb, parsePeriod("month", undefined, undefined)); } catch { ops = null; }
    const cards = ops ? buildCards(ops) : [];
    const val = (id: string) => cards.find((c) => c.def.id === id)?.value ?? null;
    quick = [
      { label: "طلبات جديدة", value: newReqs === null ? null : String(newReqs), href: "/staff/requests?s=received" },
      { label: "طلبات متأخرة", value: ops ? String(ops.o.overdue.length) : null, href: "/staff/requests", note: ops ? "مفتوحة أكثر من 7 أيام" : undefined },
      { label: "تحصيل هذا الشهر", value: val("REV_COLLECTED"), href: "/staff/collections" },
      { label: "نسبة صرف الموازنة", value: val("BUDGET_EXEC"), href: "/staff/finance" },
    ];
  }

  const buttons: BigButton[] = top
    ? [
        { href: "/staff/requests", title: "الطلبات", Icon: Inbox },
        { href: "/staff/decisions", title: "القرارات", Icon: FileSignature },
        { href: "/staff/council", title: "المجلس", Icon: Landmark },
        { href: "/staff/finance", title: "المالية", Icon: Wallet },
        { href: "/staff/projects", title: "المشاريع", Icon: HardHat },
        { href: "/staff/more", title: "المزيد", Icon: LayoutGrid },
      ]
    : [
        { href: "/staff/requests", title: "الطلبات", Icon: Inbox },
        { href: "/staff/collections", title: "التحصيل", Icon: Banknote },
        { href: "/staff/analyze", title: "قراءة المعاملة", Icon: ScanSearch },
        { href: "/staff/more", title: "المزيد", Icon: LayoutGrid },
      ];

  return (
    <>
      <header className="border-b bg-background"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Emblem size={44} />
        <p className="text-sm font-bold text-primary">اليوم</p>
        <img src="/aijur-logo.png" alt="AIJUR" className="h-10 w-auto" />
      </div></header>
      <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-6 px-4 py-5 md:py-8">
        {admin && on && <AutoIngest />}
        <section className="rounded-3xl bg-primary px-5 py-5 text-primary-foreground shadow-sm sm:px-7">
          <p className="text-xs opacity-80">{today}</p>
          <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">{memberships[0]?.municipality?.name_ar}</h1>
          <p className="text-sm opacity-90">{roleTxt}{isDemo ? " · نسخة تجريبية" : ""}</p>
        </section>
        {top ? (
          <>
            <Inboxx items={inbox.items} total={inbox.total} />
            <QuickNumbers items={quick} />
          </>
        ) : (
          <Link href="/staff/requests?s=received" className="elev elev-hover flex min-h-20 items-center justify-between gap-3 rounded-2xl border bg-background px-5 py-4 active:bg-muted">
            <span className="text-base font-bold">طلبات جديدة بانتظار المعالجة</span><b className="text-3xl text-primary">{newReqs ?? "غير متاح"}</b>
          </Link>
        )}
        <BigButtons items={buttons} />
        <form action={signOut} className="text-center"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 text-sm active:bg-muted"><LogOut className="size-4" />خروج</button></form>
      </main>
    </>
  );
}
