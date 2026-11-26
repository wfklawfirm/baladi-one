import { describe, expect, it } from "vitest";
import { DOC_KEYS, type DocInput, type LegalRef } from "./types";
import { NEEDS_LEGAL, generateDoc } from "./generate";
import { renderHtml, esc } from "./html";
import { comparisonToXlsx } from "./xlsx";
import { docToDocx } from "./docx";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = (): DocInput => ({
  today: "2026-11-26",
  muni: { id: ID(1), name: "حلبا", governorate: null, district: null },
  item: { id: ID(2), title: "توريد معدات <نظافة>", need_description: "حاجة إلى آليات", estimated_value: 1000, currency: "USD", fiscal_year: 2026, planned_method: "quotations", funding_note: null, responsible: "مصلحة الأشغال", planned_publish_on: null, planned_award_on: null, planned_start_on: null, bids_open_on: "2026-11-01T10:00:00Z" },
  budgetLine: { id: ID(3), code: "6131", title: "معدات" },
  bids: [
    { id: ID(10), supplier_id: ID(20), supplier_name: "شركة ب", supplier_contact: "b@x", received_on: "2026-10-30", currency: "USD", total_value: 900, delivery_days: 10, warranty_note: null, technical_compliant: true, evaluation_note: null },
    { id: ID(11), supplier_id: ID(21), supplier_name: "شركة أ", supplier_contact: null, received_on: "2026-10-29", currency: "USD", total_value: 800, delivery_days: null, warranty_note: "سنة", technical_compliant: null, evaluation_note: "=cmd" },
  ],
  bidsOpened: true,
  committee: { id: ID(30), kind: "award", formed_on: "2026-10-01", formation_decision_id: ID(40), report_text: null, report_on: null, members: [{ id: ID(31), name: "عضو 1", role_ar: "رئيس", has_conflict: false, declaration_on: "2026-10-02" }, { id: ID(32), name: "عضو 2", role_ar: null, has_conflict: null, declaration_on: null }] },
  formationDecision: { id: ID(40), decision_no: "7", year: 2026, title: "تأليف لجنة", decided_on: "2026-09-30" },
  legal: [], bidderBidId: ID(10),
});

describe("procurement documents", () => {
  it("generates all 7 documents with watermark, sources and legal placeholder", () => {
    for (const k of DOC_KEYS) {
      const r = generateDoc(k, base());
      expect(r.ok, k).toBe(true);
      if (!r.ok) continue;
      expect(r.watermark).toBe("مسودة");
      expect(r.autofilled.length).toBeGreaterThan(0);
      expect(r.sources.length).toBeGreaterThan(0);
      const html = renderHtml(r, { full: true });
      expect(html).toContain('dir="rtl"'); expect(html).toContain('lang="ar"'); expect(html).toContain("size:A4"); expect(html).toContain("مسودة"); expect(html).toContain(NEEDS_LEGAL);
      expect(html).not.toContain("<نظافة>");
    }
  });
  it("refuses with an Arabic message when mandatory fields are missing", () => {
    const i = base(); i.item.need_description = " "; i.item.responsible = null;
    const r = generateDoc("purchase_request", i);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.missing.map((m) => m.key)).toEqual(expect.arrayContaining(["need_description", "responsible"])); expect(r.message).toContain("حقول إلزامية ناقصة"); expect(r.message).toContain("وصف الحاجة"); }
  });
  it("refuses bid documents while bids are sealed or absent", () => {
    const sealed = { ...base(), bidsOpened: false, bids: [] };
    for (const k of ["bid_register", "bid_comparison", "committee_minutes", "bidder_notification"] as const) expect(generateDoc(k, sealed).ok, k).toBe(false);
    expect(generateDoc("bid_register", { ...base(), bids: [] }).ok).toBe(false);
  });
  it("committee minutes need a committee, members and do not invent a result", () => {
    expect(generateDoc("committee_minutes", { ...base(), committee: null }).ok).toBe(false);
    const r = generateDoc("committee_minutes", base());
    expect(r.ok).toBe(true);
    if (r.ok) { const h = renderHtml(r); expect(h).toContain("لم يُصرَّح بعد"); expect(h).toContain("لا يقترحها النظام"); expect(h).toContain("القرار رقم 7/2026"); }
  });
  it("legal references appear only when verified", () => {
    const ref = (verified: boolean): LegalRef => ({ kind: "provision", id: ID(50), topic: "evaluation", label: "قانون 244/2021 — المادة X", text: null, verified });
    const un = generateDoc("bid_comparison", { ...base(), legal: [ref(false)] }); const ok = generateDoc("bid_comparison", { ...base(), legal: [ref(true)] });
    expect(un.ok && renderHtml(un)).not.toContain("المادة X"); expect(ok.ok && renderHtml(ok)).toContain("المادة X");
  });
  it("bid comparison: ranks by price within one currency, never across currencies", () => {
    const r = generateDoc("bid_comparison", base()); expect(r.ok).toBe(true);
    if (r.ok) { expect(r.comparison!.rows[0][1]).toBe("شركة أ"); expect(r.comparison!.rows[0][0]).toBe(1); }
    const mixed = base(); mixed.bids[0].currency = "LBP";
    const m = generateDoc("bid_comparison", mixed);
    if (m.ok) { expect(m.comparison!.rows.every((x) => x[0] === "—")).toBe(true); expect(m.comparison!.note).toContain("غير قابلة للمقارنة"); }
  });
  it("exports docx and xlsx (formula text neutralised)", async () => {
    const r = generateDoc("bid_comparison", base()); if (!r.ok) throw new Error("x");
    const x = await comparisonToXlsx(r); expect(x.length).toBeGreaterThan(1000); expect(x.subarray(0, 2).toString()).toBe("PK");
    const w = await docToDocx(r); expect(w.subarray(0, 2).toString()).toBe("PK");
    const p = generateDoc("purchase_request", base()); if (p.ok) await expect(comparisonToXlsx(p)).rejects.toThrow();
  });
  it("escapes html", () => { expect(esc('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;"); });
  it("contains no hard-coded legal thresholds", () => {
    const r = generateDoc("bidder_notification", base()); expect(r.ok).toBe(true);
    if (r.ok) expect(renderHtml(r)).toContain(NEEDS_LEGAL);
  });
});
