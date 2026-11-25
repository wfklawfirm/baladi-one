// Pure, client-safe model of the Municipal Decision Builder: types, labels, classification, field labels.
// Nothing here asserts a legal fact; classification is a suggestion pending legal review (see docs/DECISION_BUILDER.md).

export type Issuer = "municipal_council" | "executive_authority" | "resolve_competent_authority";
export type DocKind = "decision_draft" | "notice" | "letter" | "official_form_mapping";
export type Domain = "finance" | "procurement" | "property" | "personnel" | "projects" | "other";
export type Nature = "regulatory" | "individual" | "administrative";
export type TplStatus = "draft" | "pending_legal_review" | "approved" | "superseded" | "archived";

export type FieldDef = { key: string; type: string; required_for_finalization?: boolean };
export type RefCandidate = { source_id: string; article_candidates: string | null; status?: string };
export type TemplateContent = {
  id?: string; version?: string; title_ar: string; category_ar?: string; issuer_candidate: Issuer; document_kind?: DocKind; risk?: "standard" | "high";
  classification?: { domain: Domain; nature: Nature; category?: string; basis?: string };
  legal_reference_candidates?: RefCandidate[]; illustrative_source_ids?: string[];
  facts_recitals_ar?: string[]; operative_clauses_ar?: string[]; fields: FieldDef[];
  supporting_documents_ar?: string[]; validation_checks_ar?: string[];
  legal_effect?: { approval_route?: string; effective_clause?: string | null; notification_clause?: string | null; auto_effective?: boolean };
  signature_mode?: string; required_review_gate?: string;
};
export type TemplateRow = {
  id: string; template_id: string; seq: number; version: string; status: TplStatus; title_ar: string; category_ar: string | null;
  issuer: Issuer; document_kind: DocKind; domain: Domain; nature: Nature; risk: "standard" | "high"; content?: TemplateContent;
  effective_from: string | null; effective_to: string | null; review_note: string | null; submitted_at: string | null; approved_at: string | null; updated_at: string;
};
export type SourceRow = { source_id: string; title: string; url: string | null; kind: string; instrument_no: string | null; law_id: string | null; effective_from: string | null };

export const STATUS_LABEL: Record<TplStatus, string> = { draft: "مسودة", pending_legal_review: "بانتظار المراجعة القانونية", approved: "معتمد", superseded: "مُحَلّ محله", archived: "مؤرشف" };
export const ISSUER_LABEL: Record<Issuer, string> = { municipal_council: "المجلس البلدي", executive_authority: "رئيس السلطة التنفيذية", resolve_competent_authority: "الجهة المختصة (تُحدَّد بعد التحقق)" };
export const KIND_LABEL: Record<DocKind, string> = { decision_draft: "قرار", notice: "إعلان / إنذار", letter: "كتاب / مراسلة", official_form_mapping: "ربط بنموذج رسمي" };
export const DOMAIN_LABEL: Record<Domain, string> = { finance: "مالي", procurement: "شراء عام", property: "عقاري", personnel: "وظيفي", projects: "مشاريع", other: "عام" };
export const NATURE_LABEL: Record<Nature, string> = { regulatory: "تنظيمي", individual: "فردي", administrative: "إداري عام" };

/** The ten requested library classes plus one for documents whose competent authority must be resolved after verification. A template can belong to several (they are facets, not one tree). */
export const CLASSES: { id: string; label: string; test: (t: Pick<TemplateRow, "issuer" | "document_kind" | "domain" | "nature">) => boolean }[] = [
  { id: "council", label: "قرارات المجلس البلدي", test: (t) => t.issuer === "municipal_council" && t.document_kind === "decision_draft" },
  { id: "exec", label: "قرارات رئيس السلطة التنفيذية", test: (t) => t.issuer === "executive_authority" && t.document_kind === "decision_draft" },
  { id: "regulatory", label: "القرارات التنظيمية", test: (t) => t.nature === "regulatory" },
  { id: "individual", label: "القرارات الفردية", test: (t) => t.nature === "individual" },
  { id: "finance", label: "القرارات المالية", test: (t) => t.domain === "finance" },
  { id: "procurement", label: "قرارات الشراء العام", test: (t) => t.domain === "procurement" },
  { id: "property", label: "القرارات العقارية", test: (t) => t.domain === "property" },
  { id: "personnel", label: "القرارات الوظيفية", test: (t) => t.domain === "personnel" },
  { id: "projects", label: "القرارات المتعلقة بالمشاريع", test: (t) => t.domain === "projects" },
  { id: "notices", label: "الإعلانات والإنذارات والمراسلات", test: (t) => t.document_kind !== "decision_draft" },
  { id: "resolve", label: "الجهة المختصة تُحدَّد بعد التحقق", test: (t) => t.issuer === "resolve_competent_authority" },
];
export const classesOf = (t: Pick<TemplateRow, "issuer" | "document_kind" | "domain" | "nature">) => CLASSES.filter((c) => c.test(t)).map((c) => c.id);

/** Suggested classification of the seed library (by template id). Marked "suggested_pending_review" in each template. */
type Cls = { domain: Domain; nature: Nature; category: string };
const FIN_CAT: Record<string, string> = { FIN01: "budget", FIN02: "transfer", FIN03: "transfer", FIN04: "budget", FIN05: "budget", FIN06: "accounts", FIN07: "budget", FIN08: "other", FIN09: "other", FIN10: "loan", FIN11: "accounts", FIN12: "accounts", FIN13: "accounts" };
const REGULATORY = new Set(["REV01", "REV02", "HR01", "REG01", "REG02", "REG08"]);
const INDIVIDUAL = new Set(["REV04", "REV05", "REV09", "ASSET08", "HR02", "HR03", "HR04", "HR05", "HR06", "HR07", "HR08", "HR09", "HR10", "HR11", "HR12", "REG03", "REG04", "REG05", "REG06", "REG07", "LAW03", "LAW05"]);
const PLANNING = new Set(["REG04", "REG05", "REG07"]);
export function suggestClassification(id: string): Cls {
  const p = id.replace(/\d+$/, "");
  const domain: Domain = p === "FIN" || p === "REV" ? "finance" : p === "PROC" ? "procurement" : p === "ASSET" ? "property" : p === "HR" ? "personnel" : p === "DEV" ? "projects" : "other";
  const category = FIN_CAT[id] ?? (p === "REV" ? "tax" : p === "PROC" ? "contract" : p === "ASSET" ? "property" : PLANNING.has(id) ? "planning" : "general");
  const nature: Nature = REGULATORY.has(id) ? "regulatory" : INDIVIDUAL.has(id) ? "individual" : "administrative";
  return { domain, nature, category };
}

/** Which instrument a recital cites, and the base source whose title is used. COUNCIL/EXEC/REG/CONTROL are sections of Decree-Law 118/1977. */
export const RECITAL_BASE: Record<string, string> = { COUNCIL: "MUN", EXEC: "MUN", REG: "MUN", CONTROL: "MUN" };
export const SOURCE_META: Record<string, { instrument_no: string | null; law_id: string | null }> = {
  MUN: { instrument_no: "118/1977", law_id: "MUN-118" }, COUNCIL: { instrument_no: "118/1977", law_id: "MUN-118" }, EXEC: { instrument_no: "118/1977", law_id: "MUN-118" },
  REG: { instrument_no: "118/1977", law_id: "MUN-118" }, CONTROL: { instrument_no: "118/1977", law_id: "MUN-118" },
  ACC: { instrument_no: "5595/1982", law_id: "MACC-5595" }, ACC_PUBLIC: { instrument_no: "14969/1963", law_id: "ACC-14969" },
  FEE: { instrument_no: "60/1988", law_id: null }, PPA_LAW: { instrument_no: "244/2021", law_id: "PROC-244" },
};

/** Arabic labels for the dynamic fields of the library (key -> label). Unknown keys fall back to the key itself. */
export const FIELD_LABEL: Record<string, string> = {
  municipality: "البلدية", district: "القضاء", governorate: "المحافظة", decision_number: "رقم القرار", decision_date: "تاريخ القرار", issuer_name: "اسم الجهة المصدرة / الموقّع",
  verified_legal_recitals: "الأسانيد القانونية المتحققة", effective_clause: "صيغة النفاذ", notification_clause: "صيغة التبليغ والنشر", session_ref: "رقم الجلسة / المحضر",
  session_date: "تاريخ الجلسة", invitation_ref: "رقم الدعوة", invitation_date: "تاريخ الدعوة", quorum_record: "النصاب", vote_record: "التصويت", fiscal_year: "السنة المالية",
  revenue_total: "إجمالي الواردات", expense_total: "إجمالي النفقات", currency: "العملة", request_ref: "الطلب المقدم", amount: "المبلغ", from_budget_line: "من بند الموازنة",
  to_budget_line: "إلى بند الموازنة", purpose: "الغاية", funding_source: "مصدر التمويل", budget_line: "بند الموازنة", source_year: "السنة المرحّل منها", balance: "الرصيد",
  applicable_rule: "القاعدة المطبقة", period: "المدة", offer_ref: "العرض", donor: "الواهب", gift_description: "وصف الهبة", gift_conditions: "شروط الهبة", beneficiary: "المستفيد",
  project: "المشروع", employee: "الموظف", fee_type: "نوع الرسم", rate: "المعدل", assessment_basis: "أساس التخمين", effective_date: "تاريخ السريان", assessment_group: "فئة التخمين",
  assessment_ref: "مرجع التخمين", publication_plan: "خطة النشر", taxpayer_ref: "المكلَّف", installment_schedule: "جدول التقسيط", area: "المنطقة", nomination_refs: "الترشيحات",
  committee_members: "أعضاء اللجنة", scope: "النطاق", verified_competent_authority: "الجهة المختصة (بعد التحقق)", old_value: "القيمة القديمة", new_value: "القيمة الجديدة",
  correction_reason: "سبب التصحيح", recommendation: "التوصية", recipient: "الجهة المستلمة", prior_decision: "القرار السابق", reason: "السبب", clause_ref: "البند المعدَّل",
  new_text: "النص الجديد", action_type: "نوع الإجراء", member: "العضو", delegate: "المفوَّض", procurement_ref: "عملية الشراء", justification_ref: "مستند التبرير", contract_ref: "العقد",
  evaluation_ref: "تقرير التقييم", supplier: "المورّد", acceptance_ref: "قبول العرض", remedy: "المعالجة", property_ref: "العقار", lessor: "المؤجِّر", valuation_ref: "تقرير التخمين",
  owner_consents: "موافقات المالكين", location: "الموقع", applicant: "مقدّم الطلب", proposal_ref: "الاقتراح", proposed_name: "الاسم المقترح", partner: "الشريك",
  report_ref: "التقرير", draft_ref: "المشروع / المسودة", position: "الوظيفة", appointment_terms: "شروط التعيين (المرتبة والدرجة والراتب)", start_date: "تاريخ البدء",
  end_date: "تاريخ الانتهاء", from_department: "من المصلحة", to_department: "إلى المصلحة", competent_authority: "الجهة المختصة", dimensions: "الأبعاد", measure: "التدبير",
  establishment: "المؤسسة", opinion: "الرأي", violation: "المخالفة", facility: "المرفق", legal_opinion_ref: "الرأي القانوني", case_ref: "الدعوى / الملف", settlement_ref: "مشروع المصالحة",
  settlement_terms: "شروط المصالحة", lawyer: "المحامي",
};
export const labelOf = (k: string) => FIELD_LABEL[k] ?? k;

/** Fields filled by the system from the register (never typed twice). */
export const AUTO_KEYS = new Set(["municipality", "district", "governorate", "decision_number", "decision_date", "issuer_name", "session_ref", "session_date", "invitation_date", "quorum_record", "vote_record", "verified_legal_recitals"]);
/** Fields that the clause/recital engines own. */
export const isAutoKey = (k: string) => AUTO_KEYS.has(k);
export const ENGINE_KEYS = new Set(["verified_legal_recitals", "effective_clause", "notification_clause"]);

export type RecitalKind = "law" | "minutes" | "request" | "report" | "reviewed" | "whereas" | "public_interest" | "decision" | "circular";
export const RECITAL_KINDS: Record<RecitalKind, { label: string; prefix: string; rank: number }> = {
  law: { label: "قانون / مرسوم", prefix: "بناءً على", rank: 1 },
  decision: { label: "قرار", prefix: "بناءً على", rank: 2 },
  circular: { label: "تعميم", prefix: "بناءً على", rank: 3 },
  minutes: { label: "محضر الجلسة", prefix: "بناءً على", rank: 4 },
  request: { label: "الطلب المقدم", prefix: "بناءً على", rank: 5 },
  report: { label: "تقرير فني", prefix: "بناءً على", rank: 6 },
  reviewed: { label: "بعد الاطلاع", prefix: "بعد الاطلاع على", rank: 7 },
  whereas: { label: "وحيث إن", prefix: "وحيث إن", rank: 8 },
  public_interest: { label: "المصلحة العامة", prefix: "ولما كانت المصلحة العامة تقتضي", rank: 9 },
};
export type Recital = {
  id: string; kind: RecitalKind; text: string; included: boolean;
  origin: "legal" | "procedure" | "template" | "related" | "custom" | "ai";
  ref?: { source_id: string; article: string; verified: boolean; url?: string | null; rule_id?: string | null };
};
export type DraftData = Record<string, unknown> & {
  recitals?: Recital[]; selected_refs?: { source_id: string; article: string }[]; clauses?: { text: string; custom?: boolean; include?: boolean }[];
  attachments?: { text: string; ready?: boolean }[]; related?: { id: string; label: string }[];
};
