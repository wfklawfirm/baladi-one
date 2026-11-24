import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { isReportKind, validatePeriod } from "@/lib/reportBuild";
import { loadReport, logExport } from "@/lib/reportData";
import ReportView from "@/components/reports/ReportView";
import PrintButton from "@/components/reports/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "تقرير — BALADI ONE", referrer: "no-referrer" as const };

export default async function PrintReport({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const { kind } = await params;
  if (!isReportKind(kind)) notFound();
  const sp = await searchParams;
  const per = validatePeriod(sp.p, sp.from, sp.to);
  if (!per.ok) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const doc = await loadReport(sb, kind, per.range);
  await logExport(sb, kind, "print", per.range);
  return (
    <main className="min-h-screen bg-gray-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print, [data-copilot] { display: none !important; } body { background: #fff !important; } .report { max-width: none !important; } thead { display: table-header-group; } }`}</style>
      <div dir="rtl" className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <a href="/staff/reports" className="rounded-xl border bg-white px-4 py-2 text-sm">← مركز التقارير</a>
        <p className="text-xs text-muted-foreground">في نافذة الطباعة اختر «حفظ كـ PDF». يُنصح بتفعيل «الرسومات الخلفية».</p>
        <PrintButton />
      </div>
      <ReportView doc={doc} />
    </main>
  );
}
