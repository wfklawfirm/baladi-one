import "server-only";
import { isMissing, type CommitRow, type LiqRow, type OrderRow, type PayRow, type RecRow } from "@/lib/expenditure";

const LIM = 3000;
export type ExpLine = { id: string; code: string; title_ar: string; currency: "LBP" | "USD"; current_amount: number | string; fiscal_year: { year: number; status: string } | null };
export type Assignment = { id: string; user_id: string; fn: string; active: boolean; basis_ref: string | null; created_at: string };
export type Exc = { id: string; line_id: string; commitment_id: string | null; scope: string; approved_amount: number | string; legal_justification: string; legal_reference: string; reference_review: string; created_at: string };
export type SodExc = { id: string; line_id: string; commitment_id: string | null; user_id: string; justification: string; legal_reference: string; reference_review: string };
export type Person = { user_id: string; display_name: string | null; role: string };

/** Loads the expenditure cycle through the caller's RLS client. Never throws: `state` is 'missing' when migration 0021 is not applied yet. */
export async function loadExp(sb: any) {
  try {
    const probe = await sb.from("exp_setting").select("enforce_cycle").limit(1);
    if (probe.error) return { state: "missing" as const, detail: isMissing(probe.error) ? "migration" : "error" };
    const [ln, cm, lq, po, ex, rc, as, ec, sd, st, pe] = await Promise.all([
      sb.from("budget_line").select("id,code,title_ar,currency,current_amount,fiscal_year(year,status)").eq("kind", "expense").order("code").limit(500),
      sb.from("financial_commitment").select("id,line_id,amount,entry_kind,reverses_id,commitment_no,description,committed_on,actor,cycle_entry,doc_currency,doc_amount,exchange_rate,rate_source,basis_ref,decision_id,contract_id,available_before").order("committed_on", { ascending: false }).limit(LIM),
      sb.from("exp_liquidation").select("id,line_id,commitment_id,liquidation_no,entry_kind,reverses_id,amount,doc_currency,doc_amount,invoice_no,invoice_date,evidence_ref,delivery_ref,actor,created_at,reason").order("created_at", { ascending: false }).limit(LIM),
      sb.from("exp_payment_order").select("id,line_id,commitment_id,liquidation_id,order_no,order_date,entry_kind,reverses_id,amount,doc_currency,doc_amount,beneficiary,is_exceptional,exception_id,actor,created_at,reason").order("created_at", { ascending: false }).limit(LIM),
      sb.from("expenditure").select("id,line_id,commitment_id,payment_order_id,entry_kind,reverses_id,amount,paid_on,beneficiary,payment_no,payment_method,proof_ref,doc_currency,doc_amount,cycle_entry,exception_id,actor,reason").order("paid_on", { ascending: false }).limit(LIM),
      sb.from("exp_reconciliation").select("id,payment_id,status,statement_ref,statement_date,statement_amount,statement_currency,expected_amount,note,created_at").order("created_at", { ascending: false }).limit(LIM),
      sb.from("exp_function_assignment").select("id,user_id,fn,active,basis_ref,created_at").order("created_at", { ascending: false }).limit(500),
      sb.from("exp_exception").select("id,line_id,commitment_id,scope,approved_amount,legal_justification,legal_reference,reference_review,created_at").order("created_at", { ascending: false }).limit(500),
      sb.from("exp_sod_exception").select("id,line_id,commitment_id,user_id,justification,legal_reference,reference_review").limit(500),
      sb.from("exp_setting").select("enforce_cycle").limit(1),
      sb.rpc("exp_staff_list"),
    ]);
    if (cm.error && isMissing(cm.error)) return { state: "missing" as const, detail: "migration" };
    return {
      state: "ok" as const,
      partial: Boolean(ln.error || cm.error || lq.error || po.error || ex.error || rc.error),
      lines: (ln.data ?? []) as ExpLine[],
      commits: (cm.data ?? []) as (CommitRow & { decision_id: string | null; contract_id: string | null; available_before: number | string | null })[],
      liqs: (lq.data ?? []) as LiqRow[], orders: (po.data ?? []) as OrderRow[], pays: (ex.data ?? []) as PayRow[], recs: (rc.data ?? []) as RecRow[],
      assignments: (as.data ?? []) as Assignment[], exceptions: (ec.data ?? []) as Exc[], sods: (sd.data ?? []) as SodExc[],
      enforce: Boolean(st.data?.[0]?.enforce_cycle), people: (pe.error ? [] : pe.data ?? []) as Person[],
    };
  } catch {
    return { state: "missing" as const, detail: "error" };
  }
}
export type ExpData = Exclude<Awaited<ReturnType<typeof loadExp>>, { state: "missing" }>;
export const nameOf = (people: Person[], id: string | null | undefined) => (id ? people.find((p) => p.user_id === id)?.display_name || `مستخدم ${id.slice(0, 6)}` : "—");
