import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, Gauge, Gavel, Inbox, Printer, Users, Wallet } from "lucide-react";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Explain, Intro } from "@/components/simple/kit";
import { PERIODS } from "@/lib/ops";
import { KIND_META, REPORT_KINDS, REVIEW_STATUS } from "@/lib/reportBuild";

export const dynamic = "force-dynamic";
export const metadata = { title: "مركز التقارير والتصدير — BALADI ONE", referrer: "no-referrer" as const };
const ICON = { gauge: Gauge, inbox: Inbox, wallet: Wallet, gavel: Gavel, users: Users } as const;

export default async function Reports() {
  const { memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  return (
    <><StaffHeader back="/staff/operations" backLabel="مركز القيادة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div>
        <Intro title="التقارير">اختاروا الفترة، ثم اضغطوا «اعرض للطباعة» لقراءة التقرير أو حفظه PDF، أو «نزّل جدولًا» لفتحه في Excel. التقارير من بيانات النظام الفعلية.</Intro>
        <Explain term="حالة التقرير"><p>كل تقرير يُعدّ تلقائيًا ويبقى بحالة «{REVIEW_STATUS}» حتى يراجعه مسؤول، وتُسجَّل عمليات التصدير. الأرقام غير المتوفرة تظهر كما هي ولا تُقدَّر.</p></Explain>
      </div>
      <form id="rp" method="get" className="elev sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-background p-3">
        <label className="text-base font-bold" htmlFor="rp-p">عن أي فترة؟</label>
        <select id="rp-p" name="p" defaultValue="month" className="min-h-12 rounded-xl border-2 bg-background px-3 text-base">{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <span className="flex w-full items-center gap-2 sm:w-auto"><input type="date" name="from" aria-label="من (للفترة المخصصة)" className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" /><input type="date" name="to" aria-label="إلى (للفترة المخصصة)" className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" /></span>
        <span className="text-sm text-muted-foreground">التاريخان لاختيار «فترة مخصصة» فقط.</span>
      </form>
      <div className="fill-odd grid gap-4 md:grid-cols-2">
        {REPORT_KINDS.map((k) => {
          const m = KIND_META[k], Icon = ICON[m.icon as keyof typeof ICON];
          return (
            <div key={k} className="elev space-y-3 rounded-2xl border bg-background p-4 md:p-5">
              <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span><div><h2 className="text-lg font-bold">{m.title}</h2><p className="text-base text-muted-foreground">{m.description}</p></div></div>
              <div className="flex flex-wrap gap-2">
                <button form="rp" formAction={`/api/reports/${k}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 px-4 text-base font-bold active:bg-muted"><FileSpreadsheet className="size-5" aria-hidden />نزّل جدولًا (Excel)</button>
                <button form="rp" formAction={`/staff/reports/print/${k}`} formTarget="_blank" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground active:opacity-90"><Printer className="size-5" aria-hidden />اعرض للطباعة أو PDF</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground"><Link href="/staff/operations" className="font-semibold text-primary">← العودة إلى متابعة أداء البلدية</Link></p>
    </main></>
  );
}
