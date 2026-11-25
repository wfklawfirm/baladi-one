import "server-only";
import { isMissing, type OrderRow, type ReceiptRow, type Rule, type Close } from "./revenue";

export type Taxpayer = { id: string; taxpayer_ref: string; name_ar: string | null; kind: string; status: string };
export type Series = { id: string; code: string; name_ar: string; prefix: string | null; is_active: boolean; legal_scope_verified: boolean };
export type Exemption = { id: string; taxpayer_id: string; fee_type: string; reason_ar: string; instrument: string | null; article: string | null; decision_id: string | null; document_ref: string | null; valid_from: string; valid_to: string | null; status: string };
export type Assessment = { id: string; taxpayer_id: string; fee_type: string; fiscal_year: number; object_ref: string | null; basis_label: string | null; basis_value: number | string | null; rule_id: string | null; computed_amount: number | string | null; amount: number | string; currency: "LBP" | "USD"; due_on: string; decision_id: string | null; status: string };
export type Order = OrderRow & { assessment_id: string; notification_method: string | null; notification_proof: string | null; issued_on: string };
export type Objection = { id: string; order_id: string; filed_on: string; grounds_ar: string; status: string; resolved_on: string | null; resolution_note: string | null; amount_before: number | string | null; amount_after: number | string | null };
export type Receipt = ReceiptRow & { series_id: string; fiscal_year: number; receipt_no: string; reversal_reason: string | null; reversal_document_ref: string | null };
export type DecisionRef = { id: string; decision_no: string; year: number; title: string };

const LIM = 2000;

/** Loads the revenue module through the caller's RLS client. `error` = tables not reachable (migration 0022 not applied yet or other failure). */
export async function loadRevenue(sb: any) {
  const first = await sb.from("revenue_taxpayer").select("id,taxpayer_ref,name_ar,kind,status").order("taxpayer_ref").limit(LIM);
  if (first.error) return { error: true as const, missing: isMissing(first.error) };
  const [rl, se, ex, asm, od, ob, rc, cc, dc] = await Promise.all([
    sb.from("revenue_rule").select("id,fee_type,instrument,instrument_no,article,basis_ar,rate,rate_unit,rate_currency,exemptions_ar,penalties_ar,applicability_ar,effective_from,effective_to,review_status").order("fee_type").order("effective_from", { ascending: false }).limit(LIM),
    sb.from("revenue_receipt_series").select("id,code,name_ar,prefix,is_active,legal_scope_verified").order("code").limit(100),
    sb.from("revenue_exemption").select("id,taxpayer_id,fee_type,reason_ar,instrument,article,decision_id,document_ref,valid_from,valid_to,status").order("created_at", { ascending: false }).limit(LIM),
    sb.from("revenue_assessment").select("id,taxpayer_id,fee_type,fiscal_year,object_ref,basis_label,basis_value,rule_id,computed_amount,amount,currency,due_on,decision_id,status").order("created_at", { ascending: false }).limit(LIM),
    sb.from("revenue_order").select("id,assessment_id,order_no,amount,currency,due_on,issued_on,status,notified_on,notification_method,notification_proof").order("created_at", { ascending: false }).limit(LIM),
    sb.from("revenue_objection").select("id,order_id,filed_on,grounds_ar,status,resolved_on,resolution_note,amount_before,amount_after").order("created_at", { ascending: false }).limit(LIM),
    sb.from("revenue_receipt").select("id,order_id,series_id,fiscal_year,receipt_no,amount,currency,method,collected_on,cashier,status,reversal_reason,reversal_document_ref").order("created_at", { ascending: false }).limit(LIM),
    sb.from("revenue_cash_close").select("business_date,currency,cashier,recorded_amount,counted_amount,difference,receipt_count").order("business_date", { ascending: false }).limit(500),
    sb.from("municipal_decision").select("id,decision_no,year,title").order("created_at", { ascending: false }).limit(300),
  ]);
  return {
    error: false as const,
    partial: Boolean([rl, se, ex, asm, od, ob, rc, cc].some((x) => x.error)),
    taxpayers: (first.data ?? []) as Taxpayer[], rules: (rl.data ?? []) as Rule[], series: (se.data ?? []) as Series[], exemptions: (ex.data ?? []) as Exemption[],
    assessments: (asm.data ?? []) as Assessment[], orders: (od.data ?? []) as Order[], objections: (ob.data ?? []) as Objection[], receipts: (rc.data ?? []) as Receipt[],
    closes: (cc.data ?? []) as Close[], decisions: (dc.data ?? []) as DecisionRef[],
  };
}
export type RevenueData = Exclude<Awaited<ReturnType<typeof loadRevenue>>, { error: true }>;
