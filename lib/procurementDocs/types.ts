// Pure types for the procurement document factory. No I/O. Nothing here asserts a legal fact.
export const DOC_KEYS = ["purchase_request", "need_definition", "estimate_sheet", "bid_register", "bid_comparison", "committee_minutes", "bidder_notification"] as const;
export type DocKey = (typeof DOC_KEYS)[number];
export const isDocKey = (v: unknown): v is DocKey => typeof v === "string" && (DOC_KEYS as readonly string[]).includes(v);

export type Src = { table: string; id: string; label: string };
export type BidIn = { id: string; supplier_id: string; supplier_name: string; supplier_contact: string | null; received_on: string; currency: string; total_value: number; delivery_days: number | null; warranty_note: string | null; technical_compliant: boolean | null; evaluation_note: string | null };
export type MemberIn = { id: string; name: string; role_ar: string | null; has_conflict: boolean | null; declaration_on: string | null };
export type LegalRef = { kind: "provision" | "rule"; id: string; topic: string | null; ruleId?: string | null; label: string; text: string | null; verified: boolean };

export type DocInput = {
  today: string;
  muni: { id: string; name: string | null; governorate: string | null; district: string | null };
  item: { id: string; title: string; need_description: string | null; estimated_value: number | null; currency: string | null; fiscal_year: number | null; planned_method: string | null; funding_note: string | null; responsible: string | null; planned_publish_on: string | null; planned_award_on: string | null; planned_start_on: string | null; bids_open_on: string | null };
  budgetLine: { id: string; code: string; title: string } | null;
  bids: BidIn[];
  bidsOpened: boolean;
  committee: { id: string; kind: string; formed_on: string | null; formation_decision_id: string | null; report_text: string | null; report_on: string | null; members: MemberIn[] } | null;
  formationDecision: { id: string; decision_no: string; year: number; title: string; decided_on: string | null } | null;
  legal: LegalRef[];
  bidderBidId: string | null;
};

export type AutoField = { label: string; value: string; source: Src };
export type Block =
  | { t: "heading"; text: string }
  | { t: "para"; text: string }
  | { t: "kv"; rows: [string, string][] }
  | { t: "table"; columns: string[]; rows: string[][]; note?: string }
  | { t: "recital"; text: string; source: Src }
  | { t: "legal"; lines: { topic: string; status: "verified" | "needs_verification"; text: string; source?: Src }[] }
  | { t: "note"; text: string }
  | { t: "sign"; items: string[] };
export type Doc = {
  ok: true; key: DocKey; version: string; title: string; watermark: string; municipality: string;
  blocks: Block[]; autofilled: AutoField[]; sources: Src[]; footer: string;
  /** Bid comparison data kept structured so the Excel export does not re-parse strings. */
  comparison?: { columns: string[]; rows: (string | number)[][]; note: string };
};
export type Refusal = { ok: false; key: DocKey; missing: { key: string; label: string }[]; message: string };
export type GenResult = Doc | Refusal;
