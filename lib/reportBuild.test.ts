import { describe, expect, it } from "vitest";
import { computeOps, parsePeriod } from "./ops";
import { KPI_REGISTRY } from "./kpi";
import { NA, REVIEW_STATUS, buildReport, fmtMoney, isReportKind, periodTag, safeCell, safeFileName, validatePeriod, REPORT_KINDS, type ReportInput } from "./reportBuild";

const now = new Date("2026-11-25T10:00:00Z");
const RG = parsePeriod("month", undefined, undefined, now);
const iso = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const R = (id: string, status: string, age: number, assigned: string | null = null) => ({ id, kind: "report", report_type: "roads", status, assigned_to: assigned, created_at: iso(age), updated_at: iso(0) });
const reqs = [R("a", "received", 10), R("b", "done", 3, "u1")];
const people = [{ user_id: "u1", display_name: "علي", role: "staff" }];
const o = computeOps(reqs, [], people, [{ amount: 100, currency: "USD", method: "cash", collected_by: "u1", created_at: iso(1) }], RG, now);
const card = { def: KPI_REGISTRY[1], value: null, delta: null, spark: null, reason: "يتطلب سجل مستحقات" };
const dec = (n: string, legal: string, exec: string, due: string | null) => ({ id: n, decision_no: n, year: 2026, title: n === "3" ? "=HYPERLINK(\"x\")" : `قرار ${n}`, legal_status: legal, execution_status: exec, execution_due: due, responsible: null, decided_on: "2026-01-01" });
const decisions = [dec("1", "effective", "completed", "2026-05-01"), dec("2", "effective", "in_progress", "2026-06-01"), dec("3", "draft", "not_started", null)];
const input: ReportInput = {
  o, people, cards: [card], now, municipality: "بلدية",
  ds: { total: 3, due: 2, done: 1, rate: 50, late: [decisions[1]] }, decisions, requests: reqs,
  receipts: [{ amount: 100, currency: "USD", method: "cash", collected_by: "u1", created_at: iso(1), service_label: "رسم", receipt_no: "7" }],
};

describe("report builders", () => {
  it("every kind carries the mandatory sections", () => {
    for (const k of REPORT_KINDS) {
      const d = buildReport(k, input);
      expect(d.reviewStatus).toBe(REVIEW_STATUS);
      expect(d.municipality).toBe("بلدية");
      expect(d.sources.length).toBeGreaterThan(0);
      expect(d.limits.length).toBeGreaterThan(0);
      expect(d.kpis.length).toBeGreaterThan(0);
      expect(d.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    }
  });
  it("executive shows 'data unavailable' for missing KPIs with the reason", () => {
    const k = buildReport("executive", input).kpis[0];
    expect(k.value).toBe(NA); expect(k.note).toBe("يتطلب سجل مستحقات");
  });
  it("requests report omits citizen personal data columns and counts the period", () => {
    const d = buildReport("requests", input);
    const log = d.tables.find((t) => t.title.startsWith("سجل"))!;
    expect(log.columns.join()).not.toMatch(/هاتف|اسم|وصف/);
    expect(log.rows).toHaveLength(2);
    expect(log.rows[0][0]).toBe("طرق وحفر");
  });
  it("collections keep currencies separate", () => {
    const d = buildReport("collections", input);
    expect(d.kpis.some((k) => k.value === fmtMoney(100, "USD"))).toBe(true);
    expect(d.kpis.filter((k) => k.label.includes("ليرة"))).toHaveLength(0);
  });
  it("decisions keep legal and execution status in separate tables and mark late ones", () => {
    const d = buildReport("decisions", input);
    const titles = d.tables.map((t) => t.title);
    expect(titles).toContain("الوضع القانوني"); expect(titles).toContain("حالة التنفيذ");
    const reg = d.tables.find((t) => t.title === "سجل القرارات")!;
    const late = reg.columns.indexOf("متأخر");
    expect(reg.rows.filter((r) => r[late] === "نعم")).toHaveLength(1);
    expect(d.tables.find((t) => t.title.startsWith("القرارات المتأخرة"))!.rows).toHaveLength(1);
  });
  it("decisions report degrades when the registry is missing", () => {
    const d = buildReport("decisions", { ...input, decisions: null, ds: null });
    expect(d.kpis[0].value).toBe(NA);
  });
  it("staff report states the formula and marks insufficient data", () => {
    const d = buildReport("staff", input);
    expect(d.formulaNote).toContain("٥٠٪"); expect(d.formulaNote).toContain("خلال 7 أيام"); expect(d.formulaNote).toContain("48 ساعة");
    expect(d.tables[0].rows[0][8]).toBe("بيانات غير كافية");
  });
});

describe("helpers", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(safeCell("=1+1")).toBe("'=1+1"); expect(safeCell("@x")).toBe("'@x"); expect(safeCell("عادي")).toBe("عادي"); expect(safeCell(5)).toBe(5);
  });
  it("whitelists kinds and validates periods", () => {
    expect(isReportKind("staff")).toBe(true); expect(isReportKind("../x")).toBe(false); expect(isReportKind(undefined)).toBe(false);
    expect(validatePeriod(null, null, null, now).ok).toBe(true);
    expect(validatePeriod("decade", null, null, now).ok).toBe(false);
    expect(validatePeriod("custom", "2026-02-01", null, now).ok).toBe(false);
    expect(validatePeriod("custom", "2026-03-01", "2026-02-01", now).ok).toBe(false);
    const ok = validatePeriod("custom", "2026-01-01", "2026-02-01", now);
    expect(ok.ok && periodTag(ok.range)).toBe("custom:2026-01-01..2026-02-01");
  });
  it("builds safe file names", () => { expect(safeFileName("staff", "cu/../stom", now, "xlsx")).toBe("baladi-staff-custom-2026-11-25.xlsx"); });
});
