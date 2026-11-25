import { NO_TACIT, VALIDATION_LEVEL } from "@/lib/council";
import { RECITAL_BASE, type DraftData, type Recital, type RecitalKind, type SourceRow, type TemplateContent } from "./model";

/** Legal rule as stored in legal_rule (only the columns the engine needs). */
export type RuleLite = { rule_id: string; instrument_no: string | null; article: string | null; review_status: string; topic: string; source_url: string | null };

export type RefView = {
  key: string; source_id: string; article: string; title: string; url: string | null; sourceKind: string;
  /** Can this source be cited as a legal basis (an instrument), or is it only a form / guidance / historical index? */
  eligible: boolean;
  status: "verified" | "pending" | "unmatched";
  ruleId: string | null; effectiveFrom: string | null; heading?: string | null; inLibrary?: boolean;
  recitalText: string | null;
};

export const parseArticles = (s: string | null | undefined): string[] => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Candidate legal references of a template, each checked against the legal_rule registry. Nothing is "verified" unless a rule row says so. */
export function candidateRefs(snap: Pick<TemplateContent, "legal_reference_candidates">, sources: SourceRow[], rules: RuleLite[]): RefView[] {
  const bySrc = new Map(sources.map((s) => [s.source_id, s]));
  const out: RefView[] = [];
  for (const c of snap.legal_reference_candidates ?? []) {
    const s = bySrc.get(c.source_id);
    const baseId = RECITAL_BASE[c.source_id] ?? c.source_id;
    const base = bySrc.get(baseId) ?? s;
    const title = s?.title ?? c.source_id;
    const arts = parseArticles(c.article_candidates);
    const eligible = !!base && base.kind === "legal_text" && !!s?.instrument_no;
    const list = arts.length ? arts : [""];
    for (const a of list) {
      const rule = a && s?.instrument_no ? rules.find((r) => r.instrument_no === s.instrument_no && r.article === a) : undefined;
      const status: RefView["status"] = rule ? (rule.review_status === "verified" ? "verified" : "pending") : "unmatched";
      const head = (base?.title ?? title).split(" — ")[0];
      out.push({
        key: `${c.source_id}:${a}`, source_id: c.source_id, article: a, title, url: s?.url ?? null, sourceKind: s?.kind ?? "unknown", eligible: eligible && !!a, status,
        ruleId: rule?.rule_id ?? null, effectiveFrom: base?.effective_from ?? s?.effective_from ?? null,
        recitalText: eligible && a ? `${head} (المادة ${a})` : null,
      });
    }
  }
  return out;
}

const RELATED_KIND: Record<string, { kind: RecitalKind; text: string }> = {
  request_ref: { kind: "request", text: "الطلب المقدم {{request_ref}}" },
  report_ref: { kind: "report", text: "التقرير {{report_ref}}" },
  valuation_ref: { kind: "report", text: "تقرير التخمين {{valuation_ref}}" },
  evaluation_ref: { kind: "report", text: "تقرير التقييم {{evaluation_ref}}" },
  assessment_ref: { kind: "report", text: "تقرير التخمين {{assessment_ref}}" },
  prior_decision: { kind: "decision", text: "القرار السابق {{prior_decision}}" },
  legal_opinion_ref: { kind: "reviewed", text: "الرأي القانوني {{legal_opinion_ref}}" },
};

/** Default recitals for a draft: selected legal references (always flagged unless verified), template fact recitals, and related documents the template asks for. */
export function defaultRecitals(snap: TemplateContent, refs: RefView[], selected: { source_id: string; article: string }[]): Recital[] {
  const out: Recital[] = [];
  for (const r of refs) {
    if (!r.eligible || !r.recitalText) continue;
    if (!selected.some((s) => s.source_id === r.source_id && s.article === r.article)) continue;
    out.push({ id: `law:${r.key}`, kind: "law", text: r.recitalText, included: true, origin: "legal", ref: { source_id: r.source_id, article: r.article, verified: r.status === "verified", url: r.url, rule_id: r.ruleId } });
  }
  (snap.facts_recitals_ar ?? []).forEach((t, i) => out.push({ id: `tpl:${i}`, kind: "reviewed", text: t, included: true, origin: "template" }));
  const keys = new Set((snap.fields ?? []).map((f) => f.key));
  for (const [k, v] of Object.entries(RELATED_KIND)) if (keys.has(k)) out.push({ id: `rel:${k}`, kind: v.kind, text: v.text, included: true, origin: "related" });
  return out;
}

/** Regenerates engine-owned recitals but keeps what the user wrote or accepted from the assistant. */
export function mergeRecitals(existing: Recital[] | undefined, fresh: Recital[]): Recital[] {
  const keep = (existing ?? []).filter((r) => r.origin === "custom" || r.origin === "ai");
  const prev = new Map((existing ?? []).map((r) => [r.id, r]));
  return [...fresh.map((r) => (prev.has(r.id) ? { ...r, included: prev.get(r.id)!.included } : r)), ...keep];
}

/** Recitals are the "verified legal recitals" field: only included, verified, legal-origin items. */
export const verifiedRecitalList = (rs: Recital[] | undefined): string[] => (rs ?? []).filter((r) => r.origin === "legal" && r.included && r.ref?.verified).map((r) => r.text);

// ---------------------------------------------------------------------------------------------------------------------------------
// Effective / notification clause suggestions, derived from the decision type (category, validation level) and the legal-rule registry.
export type ClauseSuggestion = { text: string; basis: string[]; verified: boolean; note: string };
const ruleOk = (rules: RuleLite[], ids: string[]) => ids.every((id) => rules.find((r) => r.rule_id === id)?.review_status === "verified");

export function effectSuggestion(a: { category: string; level: string; issuer: string }, rules: RuleLite[]): ClauseSuggestion {
  const authority = VALIDATION_LEVEL[a.level] ?? "سلطة الرقابة";
  if (a.level !== "none") {
    const basis = ["MUN-118-59-62", "MUN-118-63"];
    const explicit = NO_TACIT.includes(a.category);
    return {
      text: explicit ? `لا يُعمل بهذا القرار إلا بعد تصديقه خطيًا وصراحةً من ${authority} وفق الأصول.` : `لا يُعمل بهذا القرار إلا بعد تصديقه من ${authority} أو اعتباره مصدّقًا وفق الأصول القانونية النافذة.`,
      basis, verified: ruleOk(rules, basis),
      note: explicit ? "فئة القرار مستثناة من التصديق الحكمي: التصديق الصريح مطلوب." : "قد يُعدّ القرار مصدّقًا بانقضاء المهلة عند توفر شروطها؛ تُراجع القاعدة قبل الاعتماد.",
    };
  }
  const basis = ["MUN-118-59-62"];
  return { text: "يُعمل بهذا القرار اعتبارًا من تاريخ تبليغه أو نشره وفق الأصول.", basis, verified: ruleOk(rules, basis), note: "القرار مصنَّف غير خاضع للتصديق: تحقق من ذلك بالمادتين 59–62 قبل الاعتماد." };
}

export function notificationSuggestion(a: { issuer: string; level: string }, rules: RuleLite[]): ClauseSuggestion {
  if (a.issuer === "municipal_council") {
    const basis = ["MUN-118-58"];
    return { text: "يُرسل هذا القرار إلى سلطة الرقابة المختصة، ويُبلَّغ إلى من يعنيهم الأمر، ويُنشر وفق الأصول.", basis, verified: ruleOk(rules, basis), note: "إرسال قرارات المجلس إلى سلطة الرقابة ضمن مهلة المادة 58 (قيد المراجعة)." };
  }
  return { text: "يُبلَّغ هذا القرار إلى من يعنيهم الأمر ويُنشر وفق الأصول.", basis: [], verified: false, note: "لا قاعدة تبليغ معتمدة لهذا النوع بعد: صيغة عامة تحتاج مراجعة." };
}

/** Suggested executive articles: the template's own operative clauses, kept verbatim with their tokens. */
export const defaultClauses = (snap: TemplateContent): NonNullable<DraftData["clauses"]> => (snap.operative_clauses_ar ?? []).map((text) => ({ text }));
