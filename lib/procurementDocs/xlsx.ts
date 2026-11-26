// Excel (.xlsx) export of the bid comparison table (reuses the style and the formula-injection guard of the reports exporter).
import ExcelJS from "exceljs";
import { safeCell } from "@/lib/reportBuild";
import { SRC_LABEL } from "./generate";
import type { Doc } from "./types";

const INK = "FF7A1F2E";
const rtl = { horizontal: "right" as const, vertical: "top" as const, wrapText: true, readingOrder: "rtl" as never };
export const XLSX_REFUSAL = "جدول Excel متاح لمستند «جدول مقارنة العروض» فقط.";

export async function comparisonToXlsx(d: Doc): Promise<Buffer> {
  if (d.key !== "bid_comparison" || !d.comparison) throw new Error("not_comparison");
  const wb = new ExcelJS.Workbook(); wb.creator = "BALADI ONE"; wb.title = d.title; wb.created = new Date();
  const ws = wb.addWorksheet("مقارنة العروض", { views: [{ rightToLeft: true, state: "frozen", ySplit: 4 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const put = (vals: (string | number)[], style?: (c: ExcelJS.Cell) => void) => { const r = ws.addRow(vals.map((v) => safeCell(v))); r.eachCell((c) => { c.alignment = typeof c.value === "number" ? { ...rtl, horizontal: "left" } : rtl; style?.(c); }); return r; };
  put([d.title]).getCell(1).font = { bold: true, size: 15 };
  put([`بلدية ${d.municipality} — ${d.watermark} — لم تُعتمد`]).getCell(1).font = { bold: true, color: { argb: "FFB91C1C" } };
  put([d.comparison.note]).getCell(1).font = { size: 10 };
  put(d.comparison.columns, (c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } }; });
  for (const r of d.comparison.rows) put(r);
  d.comparison.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(50, Math.max(10, c.length + 4, ...d.comparison!.rows.map((r) => String(r[i] ?? "").length + 2))); });
  const s = wb.addWorksheet("المصادر", { views: [{ rightToLeft: true }] });
  s.addRow(["الحقل", "القيمة", "السجل المصدر"]).font = { bold: true };
  for (const a of d.autofilled) s.addRow([safeCell(a.label), safeCell(a.value), safeCell(`${SRC_LABEL[a.source.table] ?? a.source.table} · ${a.source.label} (${a.source.id.slice(0, 8)})`)]);
  s.columns = [{ width: 30 }, { width: 40 }, { width: 60 }];
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
