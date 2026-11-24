import "server-only";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BRAND } from "./brand";
import { safeCell, type ReportDoc } from "./reportBuild";

const INK = "FF7A1F2E";
const sheetName = (s: string, used: Set<string>) => {
  let n = s.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "ورقة";
  for (let k = 2; used.has(n); k++) n = `${n.slice(0, 26)} ${k}`;
  used.add(n); return n;
};

/** One workbook per report: a cover sheet (title, period, KPIs, sources, limits) + one right-to-left sheet per table. */
export async function reportToXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.nameAr; wb.title = doc.title; wb.created = new Date();
  const used = new Set<string>();
  const ws = wb.addWorksheet(sheetName("الملخص", used), { views: [{ rightToLeft: true }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 34 }, { width: 24 }, { width: 60 }];
  let row = 1;
  try {
    const png = await readFile(path.join(process.cwd(), "public", BRAND.logo ?? "logos/none.png"));
    const id = wb.addImage({ buffer: png as any, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 72, height: 72 } });
  } catch { /* logo file missing: continue without it */ }
  ws.getRow(1).height = 56;
  const put = (a: string, b?: string, c?: string, bold = false) => { const r = ws.getRow(row++); r.values = [a, b ?? "", c ?? ""]; r.eachCell((x) => { x.alignment = { horizontal: "right", vertical: "top", wrapText: true, readingOrder: "rtl" as any }; if (bold) x.font = { bold: true }; }); return r; };
  const heading = (t: string) => { const r = put(t, "", "", true); r.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } }; }); };
  const title = ws.getRow(row++); title.getCell(2).value = BRAND.nameAr; title.getCell(2).font = { bold: true, size: 13 }; title.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
  put(doc.title, "", "", true).getCell(1).font = { bold: true, size: 16 };
  put("الفترة", doc.period); put("تاريخ التوليد", doc.generatedAt); put("حالة المراجعة", doc.reviewStatus).getCell(2).font = { bold: true, color: { argb: "FFB7791F" } };
  put("مصادر البيانات", doc.sources.join("، "));
  row++;
  heading("المؤشرات");
  put("المؤشر", "القيمة", "ملاحظات", true);
  for (const k of doc.kpis) put(k.label, safeCell(k.value) as string, safeCell(k.note ?? "") as string);
  row++;
  heading("حدود البيانات");
  for (const l of doc.limits) { const r = put(l); ws.mergeCells(r.number, 1, r.number, 3); r.height = Math.max(18, Math.ceil(l.length / 95) * 16); }
  if (doc.formulaNote) { row++; heading("معادلة المؤشر"); const r = put(doc.formulaNote); ws.mergeCells(r.number, 1, r.number, 3); r.height = 52; }

  for (const t of doc.tables) {
    const s = wb.addWorksheet(sheetName(t.title, used), { views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }] });
    s.addRow([t.title]).font = { bold: true, size: 13 };
    const head = s.addRow(t.columns);
    head.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } }; c.alignment = { horizontal: "right", vertical: "middle", wrapText: true }; });
    for (const r of t.rows) s.addRow(r.map(safeCell)).eachCell((c) => { c.alignment = { horizontal: typeof c.value === "number" ? "left" : "right", vertical: "top", wrapText: true }; });
    t.columns.forEach((c, idx) => { s.getColumn(idx + 1).width = Math.min(60, Math.max(12, c.length + 4, ...t.rows.slice(0, 200).map((r) => String(r[idx] ?? "").length + 2))); });
    if (t.rows.length) s.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + t.rows.length, column: t.columns.length } };
    if (t.note) s.addRow([]), s.addRow([t.note]);
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
