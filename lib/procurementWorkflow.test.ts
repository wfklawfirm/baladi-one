import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CHECK_STATUSES, CHECK_STATUS_LABEL, WF_METHODS, WF_PENDING_NOTE, applicableTabs, buildChecklist, canAdvance, canCancel, canFinish, canRestart, canReturn,
  checkSatisfied, effectiveStatus, isFinalStage, nextAction, progress, validateCheck, validateWorkflow, wfErr, wfErrCode, type FileCheck, type WfStage, type WfTransition,
} from "./procurementWorkflow";

// Build the seeded workflows by parsing the DRAFT migration itself, so tests cover exactly what would be loaded.
const sql = readFileSync(path.join(__dirname, "../supabase/migrations/0044_procurement_workflow.sql"), "utf8");
const seedSql = sql.slice(sql.indexOf("-- 3) Seed"), sql.indexOf("-- 4) RPCs"));
const rowsOf = (block: string) => [...block.matchAll(/'([a-z_]+\|[^']*)'/g)].map((m) => m[1].split("|"));
const section = (name: string) => { const i = seedSql.indexOf(`${name} text[] := array[`); return seedSql.slice(i, seedSql.indexOf("];", i)); };
const HEAD = rowsOf(section("head")), TAIL = rowsOf(section("tail"));
const midBlock = seedSql.slice(seedSql.indexOf("mid jsonb"), seedSql.indexOf("m text; wid uuid"));
const MID: Record<string, string[][]> = {};
for (const m of WF_METHODS) { const i = midBlock.indexOf(`'${m}', array[`); MID[m] = rowsOf(midBlock.slice(i, midBlock.indexOf("]", i))); }
const row = (r: string[], ord: number): WfStage => ({ key: r[0], label_ar: r[1], ord, required: r[2] === "1", conditional_on: r[3] || null, who_ar: r[4] || null, why_ar: r[5] || null, document_ar: r[6] || null, review_status: "pending_review" });
function build(method: string): { stages: WfStage[]; ts: WfTransition[] } {
  const stages = [...HEAD, ...MID[method], ...TAIL].map((r, i) => row(r, i + 1));
  const ts: WfTransition[] = [];
  stages.forEach((a, i) => {
    const b = stages[i + 1], c = stages[i + 2];
    if (b) { ts.push({ from_key: a.key, to_key: b.key, kind: "forward", guard: "current_complete" }); ts.push({ from_key: b.key, to_key: a.key, kind: "return", guard: "reason_required" }); }
    if (b && !b.required && c) ts.push({ from_key: a.key, to_key: c.key, kind: "forward", guard: "current_complete" });
  });
  return { stages, ts };
}
const ok = (key: string, ev = "مستند 1"): FileCheck => ({ stage_key: key, status: "complete", evidence_ref: ev, note: null, due_on: null });

describe("seed content", () => {
  it("covers exactly the 7 methods allowed by the check constraints", () => {
    for (const m of WF_METHODS) expect(MID[m].length).toBeGreaterThan(0);
    expect(sql).toContain("'open_tender','two_stage','quotations','proposals','negotiated','invoice','framework'");
  });
  it("seeds the generic structural stages in every method, in order", () => {
    for (const m of WF_METHODS) {
      const keys = build(m).stages.map((s) => s.key);
      for (const k of ["need", "estimate", "funding_check", "method_decision", "documents_prepared", "award_decision", "contract", "execution", "acceptance", "payment", "closing"]) expect(keys).toContain(k);
      expect(keys.indexOf("method_decision")).toBeLessThan(keys.indexOf("award_decision"));
      expect(keys[keys.length - 1]).toBe("closing");
    }
  });
  it("methods differ (not one linear model for all)", () => {
    const sig = new Set(WF_METHODS.map((m) => build(m).stages.map((s) => s.key).join(",")));
    expect(sig.size).toBe(WF_METHODS.length);
  });
  it("contains no digits, deadlines, thresholds, counts or article references in seeded text", () => {
    const text = [...HEAD, ...TAIL, ...Object.values(MID).flat()].flatMap((r) => [r[1], r[3], r[4], r[5], r[6]]).join(" ");
    expect(text).not.toMatch(/[0-9٠-٩]/);
    expect(text).not.toMatch(/مادة|المادة|يوم|أيام|ايام|مهلة|سقف|ساعة|عدد|نسبة|تجميد/);
  });
  it("marks all seeded rows pending_review and links no legal source", () => {
    expect(seedSql).not.toMatch(/review_status[^;]*verified/);
    expect(seedSql).not.toMatch(/insert into procurement_workflow_stage \([^)]*(legal_source_id|provision_id)/);
    expect(sql).toMatch(/review_status text not null default 'pending_review'/);
  });
  it("every workflow is structurally valid", () => { for (const m of WF_METHODS) { const w = build(m); expect(validateWorkflow(w.stages, w.ts), m).toEqual([]); } });
  it("UI note constant is the mandated text", () => expect(WF_PENDING_NOTE).toBe("تسلسل المراحل مقترح بانتظار المراجعة القانونية"));
});

describe("statuses", () => {
  it("has exactly the 7 Arabic labels", () => {
    expect(CHECK_STATUSES).toHaveLength(7);
    expect(Object.values(CHECK_STATUS_LABEL)).toEqual(["مكتمل", "يحتاج إلى استكمال", "ينتظر موافقة", "لم يستحق بعد", "متأخر", "غير منطبق", "يحتاج إلى مراجعة قانونية"]);
  });
  it("migration check constraint lists the same 7", () => { for (const s of CHECK_STATUSES) expect(sql).toContain(`'${s}'`); });
});

describe("evidence", () => {
  const w = build("quotations"), st = w.stages[0];
  it("complete needs evidence", () => {
    expect(validateCheck(st, { status: "complete" })).toEqual({ ok: false, code: "evidence_required" });
    expect(validateCheck(st, { status: "complete", evidence: "   " })).toEqual({ ok: false, code: "evidence_required" });
    expect(validateCheck(st, { status: "complete", evidence: "كتاب 5" })).toEqual({ ok: true });
  });
  it("not_applicable needs note and a non-mandatory stage", () => {
    const opt = w.stages.find((s) => !s.required) ?? { ...st, required: false };
    expect(validateCheck(st, { status: "not_applicable", note: "سبب" })).toEqual({ ok: false, code: "not_applicable_refused" });
    expect(validateCheck(opt, { status: "not_applicable" })).toEqual({ ok: false, code: "not_applicable_refused" });
    expect(validateCheck(opt, { status: "not_applicable", note: "سبب" })).toEqual({ ok: true });
    expect(validateCheck({ ...st, conditional_on: "شرط" }, { status: "not_applicable", note: "x" })).toEqual({ ok: true });
  });
  it("rejects unknown status and stage", () => {
    expect(validateCheck(st, { status: "done" })).toEqual({ ok: false, code: "bad_input" });
    expect(validateCheck(undefined, { status: "complete", evidence: "x" })).toEqual({ ok: false, code: "bad_stage" });
  });
  it("checkSatisfied", () => {
    expect(checkSatisfied(undefined)).toBe(false);
    expect(checkSatisfied(ok("a"))).toBe(true);
    expect(checkSatisfied({ ...ok("a"), evidence_ref: " " })).toBe(false);
    expect(checkSatisfied({ stage_key: "a", status: "not_applicable", evidence_ref: null, note: "تعليل", due_on: null })).toBe(true);
    expect(checkSatisfied({ stage_key: "a", status: "not_applicable", evidence_ref: null, note: null, due_on: null })).toBe(false);
    expect(checkSatisfied({ stage_key: "a", status: "awaiting_approval", evidence_ref: "x", note: null, due_on: null })).toBe(false);
  });
});

describe("transitions", () => {
  for (const m of WF_METHODS) {
    it(`${m}: advance only along defined edges, guarded by evidence`, () => {
      const { stages, ts } = build(m);
      for (let i = 0; i < stages.length - 1; i++) {
        const a = stages[i].key, b = stages[i + 1].key;
        expect(canAdvance(ts, [], a, b)).toEqual({ ok: false, code: "stage_incomplete" });
        expect(canAdvance(ts, [ok(a)], a, b)).toEqual({ ok: true });
      }
      expect(canAdvance(ts, [ok(stages[0].key)], stages[0].key, stages[2].key).ok).toBe(stages[1].required ? false : true);
      expect(canAdvance(ts, [ok("closing")], "closing", "need")).toEqual({ ok: false, code: "transition_not_allowed" });
      expect(canAdvance(ts, [ok("need")], "need", "contract")).toEqual({ ok: false, code: "transition_not_allowed" });
      expect(isFinalStage(ts, "closing")).toBe(true);
    });
  }
  it("bare tick with no evidence cannot advance", () => {
    const { ts } = build("open_tender");
    expect(canAdvance(ts, [{ stage_key: "need", status: "complete", evidence_ref: null, note: null, due_on: null }], "need", "estimate")).toEqual({ ok: false, code: "stage_incomplete" });
  });
  it("optional stage can be skipped only when defined", () => {
    const { ts } = build("invoice");
    expect(canAdvance(ts, [ok("invoice_obtained")], "invoice_obtained", "invoice_review").ok).toBe(true);
    expect(canAdvance(ts, [ok("invoice_obtained")], "invoice_obtained", "award_decision").ok).toBe(true);
  });
  it("refuses everything when the file is not active", () => {
    const { ts } = build("invoice");
    for (const s of ["cancelled", "completed"] as const) {
      expect(canAdvance(ts, [ok("need")], "need", "estimate", s)).toEqual({ ok: false, code: "not_active" });
      expect(canReturn(ts, "estimate", "need", "سبب", s)).toEqual({ ok: false, code: "not_active" });
      expect(canFinish(ts, [ok("closing")], "closing", s)).toEqual({ ok: false, code: "not_active" });
      expect(canCancel(s, "سبب")).toEqual({ ok: false, code: "not_active" });
    }
  });
  it("return needs a reason and a defined edge", () => {
    const { ts } = build("framework");
    expect(canReturn(ts, "estimate", "need", "")).toEqual({ ok: false, code: "reason_required" });
    expect(canReturn(ts, "estimate", "need", "  ")).toEqual({ ok: false, code: "reason_required" });
    expect(canReturn(ts, "estimate", "need", "نقص")).toEqual({ ok: true });
    expect(canReturn(ts, "contract", "need", "نقص")).toEqual({ ok: false, code: "transition_not_allowed" });
    expect(canReturn(ts, "need", "estimate", "نقص")).toEqual({ ok: false, code: "transition_not_allowed" });
  });
  it("cancel / restart rules", () => {
    expect(canCancel("active", "")).toEqual({ ok: false, code: "reason_required" });
    expect(canCancel("active", "سبب")).toEqual({ ok: true });
    expect(canRestart("active", "سبب")).toEqual({ ok: false, code: "not_cancelled" });
    expect(canRestart("completed", "سبب")).toEqual({ ok: false, code: "not_cancelled" });
    expect(canRestart("cancelled", "")).toEqual({ ok: false, code: "reason_required" });
    expect(canRestart("cancelled", "سبب")).toEqual({ ok: true });
  });
  it("finish only at the final stage with evidence", () => {
    const { ts } = build("negotiated");
    expect(canFinish(ts, [ok("payment")], "payment")).toEqual({ ok: false, code: "transition_not_allowed" });
    expect(canFinish(ts, [], "closing")).toEqual({ ok: false, code: "stage_incomplete" });
    expect(canFinish(ts, [ok("closing")], "closing")).toEqual({ ok: true });
  });
});

describe("effective status / checklist", () => {
  const { stages } = build("open_tender"), s = stages[1];
  it("defaults by position", () => {
    expect(effectiveStatus(s, undefined, 1, "2026-01-01")).toBe("not_yet_due");
    expect(effectiveStatus(s, undefined, 2, "2026-01-01")).toBe("needs_completion");
  });
  it("overdue only from a staff-entered due date", () => {
    const c: FileCheck = { stage_key: s.key, status: "needs_completion", evidence_ref: null, note: null, due_on: "2026-01-01" };
    expect(effectiveStatus(s, c, 2, "2026-01-02")).toBe("overdue");
    expect(effectiveStatus(s, c, 2, "2026-01-01")).toBe("needs_completion");
    expect(effectiveStatus(s, { ...c, due_on: null }, 2, "2030-01-01")).toBe("needs_completion");
    expect(effectiveStatus(s, { ...ok(s.key), due_on: "2020-01-01" }, 2, "2030-01-01")).toBe("complete");
  });
  it("downgrades a complete status that lacks evidence", () => {
    expect(effectiveStatus(s, { stage_key: s.key, status: "complete", evidence_ref: "", note: null, due_on: null }, 2, "2026-01-01")).toBe("needs_completion");
  });
  it("passes through other stored statuses", () => {
    for (const st of ["awaiting_approval", "needs_legal_review"] as const) expect(effectiveStatus(s, { stage_key: s.key, status: st, evidence_ref: null, note: null, due_on: null }, 2, "2026-01-01")).toBe(st);
  });
  it("buildChecklist marks current and progress ignores n/a", () => {
    const rows = buildChecklist(stages, [ok("need"), { stage_key: "estimate", status: "not_applicable", evidence_ref: null, note: "x", due_on: null }], "funding_check", "2026-01-01");
    expect(rows).toHaveLength(stages.length);
    expect(rows.filter((r) => r.isCurrent).map((r) => r.stage.key)).toEqual(["funding_check"]);
    expect(rows[0].status).toBe("complete"); expect(rows[1].status).toBe("not_applicable"); expect(rows[2].status).toBe("needs_completion"); expect(rows[3].status).toBe("not_yet_due");
    expect(progress(rows)).toEqual({ done: 1, total: stages.length - 1 });
    expect(rows.every((r) => r.needsLegalReview)).toBe(true);
  });
});

describe("next action and tabs", () => {
  it("returns who/why/document and forward targets", () => {
    const { stages, ts } = build("quotations");
    const a = nextAction(stages, ts, [], "need")!;
    expect(a.stageLabel).toBe("تحديد الحاجة"); expect(a.who).toBeTruthy(); expect(a.why).toBeTruthy(); expect(a.document).toBeTruthy();
    expect(a.missingEvidence).toBe(true); expect(a.nextKeys).toEqual(["estimate"]); expect(a.reviewPending).toBe(true);
    expect(nextAction(stages, ts, [ok("need")], "need")!.missingEvidence).toBe(false);
    expect(nextAction(stages, ts, [], "nope")).toBeNull();
  });
  it("falls back when texts are missing", () => {
    const a = nextAction([{ key: "k", label_ar: "ل", ord: 1, required: true, conditional_on: null, who_ar: null, why_ar: null, document_ar: null }], [], [], "k")!;
    expect(a.who).toBe("غير محدَّد في المسار");
  });
  it("shows the bids tab only for methods that receive offers", () => {
    for (const m of ["open_tender", "two_stage", "quotations", "proposals"]) expect(applicableTabs(build(m).stages).map((t) => t.id), m).toContain("bids");
    for (const m of ["negotiated", "invoice", "framework"]) expect(applicableTabs(build(m).stages).map((t) => t.id), m).not.toContain("bids");
    expect(applicableTabs(build("invoice").stages).map((t) => t.id)).toEqual(["overview", "checklist", "history"]);
  });
});

describe("validateWorkflow / errors", () => {
  it("detects defects", () => {
    const { stages, ts } = build("invoice");
    expect(validateWorkflow([], [])).toEqual(["no_stages"]);
    expect(validateWorkflow(stages, [...ts, { from_key: "zz", to_key: "need", kind: "forward", guard: null }])).toContain("dangling_transition");
    expect(validateWorkflow(stages, ts.filter((t) => !(t.from_key === "need" && t.kind === "forward")))).toContain("unreachable_stage");
    expect(validateWorkflow(stages.map((s, i) => (i === 3 ? { ...s, ord: 99 } : s)), ts)).toContain("order_not_contiguous");
  });
  it("error texts", () => {
    expect(wfErrCode({ message: "xx transition_not_allowed yy" })).toBe("transition_not_allowed");
    expect(wfErrCode(null)).toBe("1");
    expect(wfErr("evidence_required")).toContain("إثبات");
    expect(wfErr("zzz")).toContain("تعذّر");
  });
});

describe("migration safety", () => {
  it("header marks DRAFT and RPCs audit and refuse undefined transitions", () => {
    expect(sql.startsWith("-- 0044 (DRAFT — NOT APPLIED)")).toBe(true);
    for (const f of ["start", "check_set", "advance", "return", "finish", "cancel", "restart"]) expect(sql).toContain(`function public.procurement_file_${f}(`);
    expect((sql.match(/insert into audit_event/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(sql).toContain("transition_not_allowed");
    expect(sql).not.toMatch(/create policy [^;]* for (insert|update|delete)/);
    expect(sql).toContain("check (status <> 'complete' or btrim(coalesce(evidence_ref,'')) <> '')");
  });
});
