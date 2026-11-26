// Server-side loader: reads the records a document is generated from, through the caller's own RLS-bound client (sealed bids stay sealed).
import { loadLetterhead } from "@/lib/decisions/letterhead";
import type { BidIn, DocInput, LegalRef } from "./types";

type Sb = { from: (t: string) => any };
const INSTR: Record<string, string> = { law: "قانون", decree: "مرسوم", legislative_decree: "مرسوم اشتراعي", decision: "قرار", memo: "مذكرة", circular: "تعميم", template: "نموذج", other: "نص" };
const RULE_IDS = ["PPL-244-STANDSTILL", "PPL-244-OBJ"];

export const todayBeirut = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export async function loadDocInput(sb: Sb, itemId: string, bidderBidId: string | null): Promise<DocInput | null> {
  const { data: it } = await sb.from("procurement_plan_item").select("id,municipality_id,title,need_description,estimated_value,currency,fiscal_year,planned_method,funding_note,responsible,planned_publish_on,planned_award_on,planned_start_on,bids_open_on,budget_line_id").eq("id", itemId).maybeSingle();
  if (!it) return null;
  const lh = await loadLetterhead(sb, it.municipality_id);
  const opened = !!it.bids_open_on && new Date(it.bids_open_on) <= new Date();
  const [bl, bidsQ, comQ, provQ, ruleQ] = await Promise.all([
    it.budget_line_id ? sb.from("budget_line").select("id,code,title_ar").eq("id", it.budget_line_id).maybeSingle() : Promise.resolve({ data: null }),
    opened ? sb.from("procurement_bid").select("id,supplier_id,received_on,currency,total_value,delivery_days,warranty_note,technical_compliant,evaluation_note").eq("plan_item_id", itemId).order("received_on").limit(500) : Promise.resolve({ data: [] }),
    sb.from("procurement_committee").select("id,kind,formed_on,formation_decision_id,report_text,report_on").eq("plan_item_id", itemId).eq("kind", "award").order("created_at", { ascending: false }).limit(1),
    sb.from("procurement_provision").select("id,article_number,paragraph_number,topic,original_arabic_text,verification_status,source:procurement_legal_source(instrument_type,instrument_number,verification_status)").eq("verification_status", "verified").limit(500),
    sb.from("legal_rule").select("rule_id,instrument,instrument_no,article,summary_ar,review_status").eq("review_status", "verified").in("rule_id", RULE_IDS),
  ]);
  const rawBids = (bidsQ.data ?? []) as any[];
  const supIds = [...new Set(rawBids.map((b) => b.supplier_id))];
  const { data: sups } = supIds.length ? await sb.from("procurement_supplier").select("id,name,contact").in("id", supIds) : { data: [] };
  const sname = new Map<string, { name: string; contact: string | null }>((sups ?? []).map((s: any) => [s.id, { name: s.name, contact: s.contact }]));
  const bids: BidIn[] = rawBids.map((b) => ({ ...b, total_value: Number(b.total_value), supplier_name: sname.get(b.supplier_id)?.name ?? "", supplier_contact: sname.get(b.supplier_id)?.contact ?? null }));
  const com = ((comQ.data ?? []) as any[])[0] ?? null;
  const [mem, dec] = await Promise.all([
    com ? sb.from("procurement_committee_member").select("id,name,role_ar,has_conflict,declaration_on").eq("committee_id", com.id).order("created_at") : Promise.resolve({ data: [] }),
    com?.formation_decision_id ? sb.from("municipal_decision").select("id,decision_no,year,title,decided_on").eq("id", com.formation_decision_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const legal: LegalRef[] = [
    ...((provQ.data ?? []) as any[]).filter((p) => p.source?.verification_status === "verified").map((p): LegalRef => ({ kind: "provision", id: p.id, topic: p.topic, label: `${INSTR[p.source.instrument_type] ?? "نص"} ${p.source.instrument_number} — المادة ${p.article_number}${p.paragraph_number ? ` فقرة ${p.paragraph_number}` : ""}`, text: p.original_arabic_text ?? null, verified: true })),
    ...((ruleQ.data ?? []) as any[]).map((r): LegalRef => ({ kind: "rule", id: r.rule_id, ruleId: r.rule_id, topic: null, label: `${r.instrument} ${r.instrument_no ?? ""} — ${r.article ?? ""}`.trim(), text: r.summary_ar, verified: r.review_status === "verified" })),
  ];
  return {
    today: todayBeirut(),
    muni: { id: it.municipality_id, name: lh.name || null, governorate: lh.fields.governorate ?? null, district: lh.fields.district ?? null },
    item: { id: it.id, title: it.title, need_description: it.need_description, estimated_value: it.estimated_value === null ? null : Number(it.estimated_value), currency: it.currency, fiscal_year: it.fiscal_year, planned_method: it.planned_method, funding_note: it.funding_note, responsible: it.responsible, planned_publish_on: it.planned_publish_on, planned_award_on: it.planned_award_on, planned_start_on: it.planned_start_on, bids_open_on: it.bids_open_on },
    budgetLine: bl.data ? { id: bl.data.id, code: bl.data.code, title: bl.data.title_ar } : null,
    bids, bidsOpened: opened,
    committee: com ? { ...com, members: (mem.data ?? []) as any[] } : null,
    formationDecision: dec.data ?? null,
    legal, bidderBidId,
  };
}

/** Stable short hash of the generated content (audit only; not a signature). */
export async function contentHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
