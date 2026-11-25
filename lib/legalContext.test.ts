import { describe, it, expect } from "vitest";
import { buildLegalPrompt, isLegalQuestion, selectRules, workflowsFor, type RuleCtx } from "./legalContext";

const r = (o: Partial<RuleCtx>): RuleCtx => ({ rule_id: "X", instrument: "مرسوم", instrument_no: "118/1977", article: "63", topic: "التصديق الحكمي", summary_ar: "مهلة شهر", conditions_ar: null, exceptions_ar: null, deadline_ar: null, required_docs_ar: null, enforcement: "BLOCK", review_status: "pending_review", original_text_loaded: false, workflow: "decisions", ...o });
const rules = [r({ rule_id: "A" }), r({ rule_id: "B", article: "34", topic: "النصاب", summary_ar: "أكثر من النصف", workflow: "council" }), r({ rule_id: "C", article: "الاعتراضات", topic: "هيئة الاعتراضات", workflow: "procurement", instrument_no: "244/2021" })];

describe("legal context for the copilot", () => {
  it("detects legal/financial/procedural questions, not KPI questions", () => {
    expect(isLegalQuestion("هل يجوز توقيع العقد قبل انتهاء فترة التجميد؟")).toBe(true);
    expect(isLegalQuestion("ما هي مهلة إرسال القرار؟")).toBe(true);
    expect(isLegalQuestion("كم بلغ التحصيل هذا الشهر؟")).toBe(false);
  });
  it("selects by workflow and article number; none when unrelated", () => {
    expect(selectRules("ما نصاب الجلسة؟", rules)[0].rule_id).toBe("B");
    expect(selectRules("ماذا تقول المادة 63؟", rules)[0].rule_id).toBe("A");
    expect(selectRules("سؤال عن الطقس", rules)).toEqual([]);
    expect(workflowsFor("x", "/staff/projects")).toContain("procurement");
  });
  it("prompt carries review status, text-loaded flag and the four constraints", () => {
    const p = buildLegalPrompt([rules[0]]);
    expect(p).toMatch(/بانتظار المراجعة القانونية/);
    expect(p).toMatch(/غير محمَّل/);
    expect(p).toMatch(/لا تقتبس إلا نصًا وارد/);
    expect(p).toMatch(/وقائع متحقَّق منها/);
    expect(p).toMatch(/لا تعتمد ولا توقّع ولا تدفع ولا تنشر/);
  });
  it("tolerates a missing registry and empty selection", () => {
    expect(buildLegalPrompt(null)).toMatch(/غير متاح/);
    expect(buildLegalPrompt([])).toMatch(/لم تُسترجع/);
    expect(buildLegalPrompt(null)).toMatch(/لا تقتبس/);
  });
});

describe("waste workflow", () => {
  it("routes waste questions and revenue pages to the waste rules", () => {
    expect(isLegalQuestion("ما رسم جمع النفايات بحسب القانون 38/2026؟")).toBe(true);
    expect(workflowsFor("رسم النفايات")).toContain("waste");
    expect(workflowsFor("كم الوارد؟", "/staff/revenue")).toContain("waste");
  });
});
