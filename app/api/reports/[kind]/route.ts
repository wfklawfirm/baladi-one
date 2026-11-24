import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isReportKind, safeFileName, validatePeriod } from "@/lib/reportBuild";
import { logExport, loadReport, mayorSession } from "@/lib/reportData";
import { reportToXlsx } from "@/lib/reportXlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

/** GET /api/reports/<kind>?p=month|quarter|year|custom[&from=YYYY-MM-DD&to=YYYY-MM-DD] → .xlsx (mayor/admin only, through the caller's own session). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!isReportKind(kind)) return err(404, "unknown_report");
  const q = req.nextUrl.searchParams;
  const per = validatePeriod(q.get("p"), q.get("from"), q.get("to"));
  if (!per.ok) return err(400, "bad_period");
  const sb = await supabaseServer();
  const auth = await mayorSession(sb);
  if (auth.status !== 200) return err(auth.status, auth.status === 401 ? "unauthenticated" : "forbidden");
  try {
    const doc = await loadReport(sb, kind, per.range);
    const file = await reportToXlsx(doc);
    await logExport(sb, kind, "xlsx", per.range);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName(kind, per.range.key, new Date(), "xlsx")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch { return err(500, "report_failed"); }
}
