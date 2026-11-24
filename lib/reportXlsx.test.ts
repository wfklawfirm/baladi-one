import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import ExcelJS from "exceljs";
import { reportToXlsx } from "./reportXlsx";
import { NA, REVIEW_STATUS, type ReportDoc } from "./reportBuild";

const doc: ReportDoc = {
  kind: "decisions", title: "تقرير القرارات", municipality: "بلدية", period: "هذا الشهر", periodKey: "month", generatedAt: "2026-11-25 12:00", reviewStatus: REVIEW_STATUS,
  sources: ["municipal_decision"], kpis: [{ label: "x", value: NA, note: "=cmd" }], limits: ["حد"], formulaNote: "معادلة",
  tables: [{ title: "سجل/القرارات؟", columns: ["أ", "ب"], rows: [["=SUM(1)", 3], ["نص", null]] }],
};
describe("reportToXlsx", () => {
  it("writes a readable RTL workbook with neutralised formulas", async () => {
    const buf = await reportToXlsx(doc);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["الملخص", "سجل القرارات؟"]);
    expect(wb.worksheets[1].views[0].rightToLeft).toBe(true);
    expect(wb.worksheets[1].getCell("A3").value).toBe("'=SUM(1)");
    expect(JSON.stringify(wb.worksheets[0].getSheetValues())).toContain(REVIEW_STATUS);
  });
});
