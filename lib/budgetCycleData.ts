import "server-only";
import { availability, isMissingObject, type Availability, type AvAmend, type Check } from "./budgetCycle";

export type CycleFull = {
  id: string; fiscal_year_id: string; status: string; draft_on: string | null; report_on: string | null; presented_on: string | null; presented_session_id: string | null;
  adoption_decision_id: string | null; adopted_on: string | null; validation_authority: string | null; validated_on: string | null; validation_note: string | null; executing_on: string | null; closed_on: string | null;
};
export type Closing = {
  id: string; status: string; year_end: string; supplementary_days: number | null; supplementary_ends_on: string | null; supplementary_verified: boolean; supplementary_note: string | null; started_on: string;
  final_account_decision_id: string | null; final_account_ref: string | null; final_account_prepared_on: string | null; final_account_validated_on: string | null; final_account_authority: string | null;
  closed_on: string | null; close_note: string | null; reopen_count: number;
};
export type DecisionRow = { id: string; decision_no: string; year: number; title: string; legal_status: string; category: string };
export type CycleLine = { id: string; code: string; title_ar: string; kind: "revenue" | "expense"; original_amount: number | string; current_amount: number | string; currency: string };
export type CycleAmend = AvAmend & { id: string; reason: string; amended_on: string; validated_on: string | null; amendment_type: string; funding_source: string | null; authority: string | null; effective_on: string | null; transfer_group: string | null; decision_id: string | null };

const LIM = 5000;

/** Years visible to the user (RLS-scoped). `missing` = the 0023 tables are not reachable yet. */
export async function loadYears(sb: any) {
  const r = await sb.from("fiscal_year").select("id,year,status").order("year", { ascending: false }).limit(50);
  if (r.error) return { error: true as const };
  return { error: false as const, years: (r.data ?? []) as { id: string; year: number; status: string }[] };
}

export async function loadDecisions(sb: any): Promise<DecisionRow[]> {
  const { data } = await sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,category").in("legal_status", ["adopted", "under_review", "effective"]).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as DecisionRow[];
}

/** Lifecycle + amendments + availability for one fiscal year. Never throws: reports `missing` when 0023 is not applied. */
export async function loadLifecycle(sb: any, fyId: string) {
  const cy = await sb.from("budget_cycle").select("*").eq("fiscal_year_id", fyId).maybeSingle();
  if (cy.error && isMissingObject(cy.error)) return { missing: true as const };
  const lnq = await sb.from("budget_line").select("id,code,title_ar,kind,original_amount,current_amount,currency").eq("fiscal_year_id", fyId).order("code").limit(LIM);
  const lines = (lnq.data ?? []) as CycleLine[];
  const ids = lines.map((l) => l.id);
  const empty = { data: [], error: null };
  const [cm, ex, am, ev, st, od, pd] = await Promise.all([
    ids.length ? sb.from("financial_commitment").select("id,line_id,amount").in("line_id", ids).limit(LIM) : empty,
    ids.length ? sb.from("expenditure").select("id,line_id,commitment_id,amount").in("line_id", ids).limit(LIM) : empty,
    ids.length ? sb.from("budget_amendment").select("id,line_id,delta,reason,amended_on,applied,validated_on,amendment_type,funding_source,authority,effective_on,transfer_group,decision_id,suspension_released_on").in("line_id", ids).order("created_at", { ascending: false }).limit(500) : empty,
    cy.data ? sb.from("budget_cycle_event").select("id,from_status,to_status,event_date,note,created_at").eq("cycle_id", cy.data.id).order("id", { ascending: true }).limit(100) : empty,
    sb.from("budget_cycle_setting").select("require_cycle_for_execution,supplementary_period_days,supplementary_verified,freeze_new_commitments").maybeSingle(),
    // optional (0021): unpaid direct payment orders still reserve credit; ignored when those objects do not exist
    ids.length ? sb.from("exp_payment_order").select("line_id,amount").in("line_id", ids).is("commitment_id", null).limit(LIM) : empty,
    ids.length ? sb.from("expenditure").select("line_id,amount").in("line_id", ids).is("commitment_id", null).not("payment_order_id", "is", null).limit(LIM) : empty,
  ]);
  const sumBy = (rows: { line_id: string; amount: number | string }[] | null, id: string) => (rows ?? []).filter((r) => r.line_id === id).reduce((s, r) => s + Number(r.amount), 0);
  const unpaid = (id: string) => (od.error || pd.error ? 0 : sumBy(od.data, id) - sumBy(pd.data, id));
  const commits = (cm.data ?? []) as { id: string; line_id: string; amount: number }[];
  const exps = (ex.data ?? []) as { line_id: string; commitment_id: string | null; amount: number }[];
  const amendments = (am.data ?? []) as CycleAmend[];
  const av: Availability[] = lines.map((l) => availability(l as any, commits, exps, amendments, unpaid(l.id)));
  let adoption: DecisionRow | null = null;
  if (cy.data?.adoption_decision_id) {
    const d = await sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,category").eq("id", cy.data.adoption_decision_id).maybeSingle();
    adoption = (d.data ?? null) as DecisionRow | null;
  }
  const rules = await sb.from("credit_amendment_rule").select("amendment_type,review_status").limit(30);
  return {
    missing: false as const, cycle: (cy.data ?? null) as CycleFull | null, lines, amendments, av, adoption, events: (ev.data ?? []) as { id: number; from_status: string | null; to_status: string; event_date: string | null; note: string | null }[],
    setting: (st.data ?? null) as { require_cycle_for_execution: boolean; supplementary_period_days: number | null; supplementary_verified: boolean; freeze_new_commitments: boolean } | null,
    rulesPending: ((rules.data ?? []) as { review_status: string }[]).some((r) => r.review_status !== "verified"),
    partial: Boolean(lnq.error || cm.error || ex.error || am.error),
  };
}

/** Closing state for one fiscal year (checks come from the database function closing_check). */
export async function loadClosing(sb: any, year: number, fyId: string) {
  const cl = await sb.from("fiscal_year_closing").select("*").eq("fiscal_year_id", fyId).maybeSingle();
  if (cl.error && isMissingObject(cl.error)) return { missing: true as const };
  const closing = (cl.data ?? null) as Closing | null;
  const lnq = await sb.from("budget_line").select("id,code,title_ar,kind,currency").eq("fiscal_year_id", fyId).limit(LIM);
  const lines = (lnq.data ?? []) as { id: string; code: string; title_ar: string; kind: string; currency: string }[];
  const ids = lines.map((l) => l.id);
  const empty = { data: [], error: null };
  const [cm, ex, rs, cy, re, rv] = await Promise.all([
    ids.length ? sb.from("financial_commitment").select("id,line_id,amount,description,committed_on").in("line_id", ids).limit(LIM) : empty,
    ids.length ? sb.from("expenditure").select("line_id,commitment_id,amount").in("line_id", ids).limit(LIM) : empty,
    sb.from("commitment_resolution").select("commitment_id,resolution,remaining_amount").limit(LIM),
    sb.from("budget_cycle").select("status").eq("fiscal_year_id", fyId).maybeSingle(),
    sb.from("fiscal_year_reopening").select("id,reason,created_at,decision_id").eq("fiscal_year_id", fyId).order("created_at", { ascending: false }).limit(20),
    // optional (0021): commitment reversal rows; ignored when the column does not exist
    ids.length ? sb.from("financial_commitment").select("reverses_id,amount").in("line_id", ids).not("reverses_id", "is", null).limit(LIM) : empty,
  ]);
  const reversed = new Map<string, number>();
  if (!rv.error) for (const r of (rv.data ?? []) as { reverses_id: string; amount: number | string }[]) reversed.set(r.reverses_id, (reversed.get(r.reverses_id) ?? 0) + Number(r.amount));
  let checks: Check[] = [], totals: { currency: string; credit: number; committed: number; paid: number; available: number }[] = [], checkError = false;
  if (closing) {
    const r = await sb.rpc("closing_check", { p_year: year });
    if (r.error) checkError = true;
    else { checks = (r.data?.checks ?? []) as Check[]; totals = (r.data?.totals ?? []) as typeof totals; }
  }
  let finalDecision: DecisionRow | null = null;
  if (closing?.final_account_decision_id) {
    const d = await sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,category").eq("id", closing.final_account_decision_id).maybeSingle();
    finalDecision = (d.data ?? null) as DecisionRow | null;
  }
  return {
    missing: false as const, closing, lines, checks, totals, checkError, finalDecision, cycleStatus: (cy.data?.status ?? null) as string | null,
    commitments: (cm.data ?? []) as { id: string; line_id: string; amount: number; description: string; committed_on: string }[],
    exps: (ex.data ?? []) as { line_id: string; commitment_id: string | null; amount: number }[],
    reversed,
    resolutions: (rs.data ?? []) as { commitment_id: string; resolution: string; remaining_amount: number }[],
    reopenings: (re.data ?? []) as { id: string; reason: string; created_at: string; decision_id: string }[],
  };
}
