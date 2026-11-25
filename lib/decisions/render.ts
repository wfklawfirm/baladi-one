import { labelOf, RECITAL_KINDS, type DraftData, type Recital, type TemplateContent } from "./model";

/** Official layout of the document (from the library's rendering block). The municipality's letterhead is never altered or decorated. */
export const RENDER = {
  header: ["الجمهورية اللبنانية", "وزارة الداخلية والبلديات", "محافظة {{governorate}} — قضاء {{district}}", "بلدية {{municipality}}"],
  title: "{{document_title}} رقم {{decision_number}} تاريخ {{decision_date}}",
  councilOpening: "إن مجلس بلدية {{municipality}}،",
  execOpening: "إن رئيس بلدية {{municipality}}،",
  resolvedOpening: "{{verified_competent_authority}}،",
  councilProcedure: ["بناءً على الدعوة رقم {{invitation_ref}} تاريخ {{invitation_date}}،", "وبعد الاطلاع على محضر الجلسة {{session_ref}} المنعقدة بتاريخ {{session_date}} وبيانات النصاب والتصويت المثبتة فيه،"],
  transition: "يقرر ما يأتي:",
  watermark: "مسودة — غير صالحة للإصدار الرسمي",
  signatureNote: "التوقيع والختم يضعهما صاحب الاختصاص على النسخة المطبوعة؛ لا يُحاكى توقيع ولا ختم رقميًا.",
} as const;

export type Block =
  | { t: "hdr"; lines: string[] } | { t: "title"; text: string } | { t: "subject"; text: string } | { t: "p"; text: string } | { t: "recital"; text: string; flag?: string }
  | { t: "transition"; text: string } | { t: "clause"; n: number | null; text: string } | { t: "closing"; text: string; flag?: string } | { t: "fin"; text: string }
  | { t: "sigs"; items: { role: string; name: string }[]; note: string } | { t: "attach"; items: string[] } | { t: "pending"; text: string };
export type Rendered = { blocks: Block[]; missing: string[]; draft: boolean; watermark: string | null; logo?: string | null };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const fmtDate = (v: string) => (ISO.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);
export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => fmtValue(x)).filter(Boolean).join("، ");
  if (typeof v === "string") return fmtDate(v.trim());
  if (typeof v === "number") return String(v);
  return "";
}
/** Replaces {{key}} tokens. Draft mode marks missing values visibly; final mode leaves them empty (and reports them so finalization can be refused). */
export function fill(text: string, data: Record<string, unknown>, draft: boolean, missing: Set<string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = fmtValue(data[k]);
    if (v) return v;
    missing.add(k);
    return draft ? `【ناقص: ${labelOf(k)}】` : "";
  });
}

const FIN_KEYS = ["amount", "revenue_total", "expense_total", "balance", "budget_line", "from_budget_line", "to_budget_line", "funding_source", "currency", "rate"];
export function financialLine(data: Record<string, unknown>): string {
  const g = (k: string) => fmtValue(data[k]);
  const parts: string[] = [];
  if (g("amount")) parts.push(`المبلغ ${g("amount")} ${g("currency")}`.trim());
  if (g("revenue_total")) parts.push(`إجمالي الواردات ${g("revenue_total")} ${g("currency")}`.trim());
  if (g("expense_total")) parts.push(`إجمالي النفقات ${g("expense_total")} ${g("currency")}`.trim());
  if (g("balance")) parts.push(`الرصيد ${g("balance")} ${g("currency")}`.trim());
  if (g("budget_line")) parts.push(`على بند الموازنة ${g("budget_line")}`);
  if (g("from_budget_line")) parts.push(`من بند ${g("from_budget_line")}`);
  if (g("to_budget_line")) parts.push(`إلى بند ${g("to_budget_line")}`);
  if (g("funding_source")) parts.push(`مصدر التمويل: ${g("funding_source")}`);
  if (g("rate")) parts.push(`المعدل: ${g("rate")}`);
  return parts.join("؛ ");
}
export const hasFinancial = (snap: Pick<TemplateContent, "fields">) => snap.fields.some((f) => FIN_KEYS.includes(f.key));

/** Orders recitals by legal nature (instruments, then procedure evidence, then facts, then reasoning) and joins them with the right connective. */
export function composeRecitals(rs: Recital[]): { text: string; flag?: string; r: Recital }[] {
  const inc = rs.filter((r) => r.included && r.text.trim()).map((r, i) => ({ r, i })).sort((a, b) => RECITAL_KINDS[a.r.kind].rank - RECITAL_KINDS[b.r.kind].rank || a.i - b.i);
  return inc.map(({ r }, idx) => {
    const p = RECITAL_KINDS[r.kind].prefix;
    const lead = idx === 0 ? p : p.startsWith("و") ? p : p.startsWith("ب") ? "و" + p : "و" + p;
    const flag = r.ref && !r.ref.verified ? "مرجع غير متحقق منه — يُستبعد من النسخة الرسمية" : r.origin === "ai" ? "اقتراح المساعد — يراجعه صاحب الاختصاص" : undefined;
    return { text: `${lead} ${r.text.trim()}${/[،.؛]$/.test(r.text.trim()) ? "" : "،"}`, flag, r };
  });
}

export type RenderInput = { snap: TemplateContent; data: DraftData; title: string; mode: "draft" | "official"; logo?: string | null };

export function renderDecision({ snap, data, title, mode, logo }: RenderInput): Rendered {
  const draft = mode === "draft";
  const miss = new Set<string>();
  const d = data as Record<string, unknown>;
  const f = (t: string) => fill(t, d, draft, miss);
  const kind = snap.document_kind ?? "decision_draft";
  const isDecision = kind === "decision_draft";
  const issuer = snap.issuer_candidate;
  const blocks: Block[] = [];
  const word = kind === "notice" ? "إعلان" : kind === "letter" ? "كتاب" : kind === "official_form_mapping" ? "نموذج" : "قرار";

  blocks.push({ t: "hdr", lines: RENDER.header.map(f) });
  blocks.push({ t: "title", text: f(RENDER.title.replace("{{document_title}}", word)) });
  blocks.push({ t: "subject", text: `الموضوع: ${title}` });

  if (isDecision) {
    blocks.push({ t: "p", text: f(issuer === "municipal_council" ? RENDER.councilOpening : issuer === "executive_authority" ? RENDER.execOpening : RENDER.resolvedOpening) });
    if (issuer === "municipal_council") {
      for (const l of RENDER.councilProcedure) blocks.push({ t: "p", text: f(l) });
      const qv = [fmtValue(d.quorum_record) ? `النصاب: ${fmtValue(d.quorum_record)}` : "", fmtValue(d.vote_record) ? `التصويت: ${fmtValue(d.vote_record)}` : ""].filter(Boolean).join(" — ");
      if (qv) blocks.push({ t: "p", text: qv + "،" }); else if (draft) blocks.push({ t: "pending", text: "【ناقص: بيانات النصاب والتصويت — تُستكمل من الجلسة】" });
      else { miss.add("quorum_record"); miss.add("vote_record"); }
    }
  }

  const recs = composeRecitals((data.recitals ?? []) as Recital[]);
  for (const x of recs) {
    if (!draft && x.r.ref && !x.r.ref.verified) { miss.add("verified_legal_recitals"); continue; }
    const text = x.r.origin === "template" || x.r.origin === "related" || x.r.origin === "procedure" ? f(x.text) : x.text;
    blocks.push({ t: "recital", text, flag: draft ? x.flag : undefined });
  }

  if (isDecision) blocks.push({ t: "transition", text: RENDER.transition });
  const clauses = (data.clauses ?? []).filter((c) => c.include !== false && c.text.trim());
  clauses.forEach((c, i) => blocks.push({ t: "clause", n: isDecision ? i + 1 : null, text: f(c.text) }));
  if (!clauses.length && draft) blocks.push({ t: "pending", text: "【ناقص: المنطوق — لم تُدرج مواد تنفيذية】" });

  if (isDecision && hasFinancial(snap)) {
    const fl = financialLine(d);
    if (fl) blocks.push({ t: "fin", text: `الأثر المالي: ${fl}.` });
  }
  const eff = snap.legal_effect;
  if (eff && eff.effective_clause !== null) {
    const t = fmtValue(d.effective_clause);
    if (t) blocks.push({ t: "closing", text: t }); else if (draft) blocks.push({ t: "pending", text: "【ناقص: صيغة النفاذ — تُستخرج من القاعدة المعتمدة ونوع القرار】" }); else miss.add("effective_clause");
  }
  if (eff?.notification_clause !== null) {
    const t = fmtValue(d.notification_clause);
    if (t) blocks.push({ t: "closing", text: t }); else if (draft) blocks.push({ t: "pending", text: "【ناقص: صيغة التبليغ والنشر】" }); else miss.add("notification_clause");
  }

  const issuerName = fmtValue(d.issuer_name);
  const sigs = issuer === "municipal_council"
    ? [{ role: "رئيس المجلس البلدي", name: issuerName }]
    : issuer === "executive_authority" ? [{ role: f("رئيس بلدية {{municipality}}"), name: issuerName }]
    : [{ role: fmtValue(d.verified_competent_authority) || "【الجهة المختصة — تُحدَّد بعد التحقق】", name: issuerName }];
  blocks.push({ t: "sigs", items: sigs, note: RENDER.signatureNote });

  const att = (data.attachments ?? (snap.supporting_documents_ar ?? []).map((text) => ({ text }))).map((a) => a.text).filter(Boolean);
  if (att.length) blocks.push({ t: "attach", items: att });

  // required fields still empty (relevant for finalization)
  for (const fd of snap.fields) if (fd.required_for_finalization) {
    const v = d[fd.key];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0)) miss.add(fd.key);
  }
  return { blocks, missing: [...miss], draft, watermark: draft ? RENDER.watermark : null, logo: logo ?? null };
}

/** Plain-text version (stored in municipal_decision.body so the register keeps the full text). */
export function blocksToText(r: Rendered): string {
  const out: string[] = [];
  for (const b of r.blocks) {
    if (b.t === "hdr") out.push(b.lines.join("\n"), "");
    else if (b.t === "title") out.push(b.text);
    else if (b.t === "subject" || b.t === "p" || b.t === "transition" || b.t === "closing" || b.t === "fin" || b.t === "pending") out.push(b.text);
    else if (b.t === "recital") out.push(b.text);
    else if (b.t === "clause") out.push(b.n ? `المادة ${b.n}: ${b.text}` : b.text);
    else if (b.t === "sigs") out.push("", ...b.items.map((s) => `${s.role}${s.name ? "\n" + s.name : ""}`), b.note);
    else if (b.t === "attach") out.push("", "المرفقات:", ...b.items.map((x, i) => `${i + 1}. ${x}`));
  }
  return out.join("\n");
}
