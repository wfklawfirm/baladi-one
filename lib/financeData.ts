import "server-only";
import { arrears, budgetTotals, collectionRate, curName, money, monthlyFlow, NA, type Coll, type Commit, type Exp, type Line, type Recv } from "./finance";
import { dayKey, type Range } from "./ops";

export type FinCard = { value: string | null; reason?: string; lines?: string[] };
export type FiscalYear = { id: string; year: number; status: string };
const MISSING = "وحدة المالية غير مفعّلة بعد (لم يُطبَّق الترحيل 0016)";
const LIM = 5000;

/** Loads finance data through the caller's RLS-scoped client. `error` is set when the tables are not reachable. */
export async function loadFinance(sb: any, range: Range, fyYear?: number) {
  const fyq = await sb.from("fiscal_year").select("id,year,status").order("year", { ascending: false }).limit(50);
  if (fyq.error) return { error: true as const };
  const years = (fyq.data ?? []) as FiscalYear[];
  const wanted = fyYear ?? Number(dayKey(range.to).slice(0, 4));
  const fy = years.find((y) => y.year === wanted) ?? (fyYear ? undefined : years[0]);
  const fromKey = dayKey(range.from), toKey = dayKey(range.to);
  const [ln, rc, cl, ac] = await Promise.all([
    fy ? sb.from("budget_line").select("id,code,title_ar,kind,sector,original_amount,current_amount,currency").eq("fiscal_year_id", fy.id).order("code").limit(LIM) : { data: [], error: null },
    sb.from("receivable").select("id,fee_type,amount,currency,due_on,status,payer_ref,created_at").order("due_on", { ascending: false }).limit(LIM),
    sb.from("collection_entry").select("receivable_id,amount,currency,created_at").not("receivable_id", "is", null).limit(LIM),
    sb.from("collection_entry").select("receivable_id,amount,currency,created_at").gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString()).limit(LIM),
  ]);
  const lines = (ln.data ?? []) as Line[];
  const ids = lines.map((l) => l.id);
  const [cm, ex, am] = ids.length
    ? await Promise.all([
        sb.from("financial_commitment").select("id,line_id,amount,description,committed_on").in("line_id", ids).order("committed_on", { ascending: false }).limit(LIM),
        sb.from("expenditure").select("id,line_id,commitment_id,amount,paid_on,beneficiary").in("line_id", ids).order("paid_on", { ascending: false }).limit(LIM),
        sb.from("budget_amendment").select("id,line_id,delta,reason,amended_on,applied,validated_on,decision_id").in("line_id", ids).order("amended_on", { ascending: false }).limit(200),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  return {
    error: false as const, years, fy, lines,
    commits: (cm.data ?? []) as (Commit & { id: string; description: string; committed_on: string })[],
    exps: (ex.data ?? []) as (Exp & { id: string; beneficiary: string })[],
    amendments: (am.data ?? []) as { id: string; line_id: string; delta: number | string; reason: string; amended_on: string; applied: boolean; validated_on: string | null; decision_id: string | null }[],
    recvs: (rc.error ? [] : rc.data ?? []) as (Recv & { created_at: string })[],
    linked: (cl.data ?? []) as Coll[],            // all collections linked to receivables (any date)
    periodColls: (ac.data ?? []) as Coll[],       // all collections within the period (linked or not)
    fromKey, toKey, today: dayKey(new Date()),
    partial: Boolean(ln.error || rc.error || cl.error || ac.error),
  };
}
export type FinanceData = Exclude<Awaited<ReturnType<typeof loadFinance>>, { error: true }>;

export function flowOf(d: FinanceData, range: Range) { return monthlyFlow(d.periodColls, d.exps, d.lines, range); }
export function arrearsOf(d: FinanceData) { return arrears(d.recvs, d.linked, d.today); }

/** Numbers for the KPI cards COLLECTION_RATE and BUDGET_EXEC. Plug into buildCards: value/reason/lines map directly onto Card. */
export async function financeCards(sb: any, range: Range): Promise<{ COLLECTION_RATE: FinCard; BUDGET_EXEC: FinCard }> {
  let d;
  try { d = await loadFinance(sb, range); } catch { return { COLLECTION_RATE: { value: null, reason: MISSING }, BUDGET_EXEC: { value: null, reason: MISSING } }; }
  if (d.error) return { COLLECTION_RATE: { value: null, reason: MISSING }, BUDGET_EXEC: { value: null, reason: MISSING } };

  // Collection rate: receivables whose due date falls in the period (and has arrived), per currency; main currency = largest due amount.
  const cr = collectionRate(d.recvs, d.linked, d.toKey < d.today ? d.toKey : d.today, { from: d.fromKey, to: d.toKey }).filter((x) => x.rate !== null);
  const crMain = [...cr].sort((a, b) => b.due - a.due)[0];
  const COLLECTION_RATE: FinCard = crMain
    ? { value: `${crMain.rate}%`, lines: [`${crMain.currency}: ${money(crMain.collected, crMain.currency)} من ${money(crMain.due, crMain.currency)} مستحق`, ...cr.filter((x) => x !== crMain).map((x) => `${curName(x.currency)}: ${x.rate}% (${money(x.collected, x.currency)} من ${money(x.due, x.currency)})`)] }
    : { value: null, reason: d.recvs.length ? "لا مستحقات حلّ موعدها في الفترة" : "لا مستحقات مسجّلة بعد" };

  const be = budgetTotals(d.lines, d.commits, d.exps, "expense").filter((x) => x.execution !== null);
  const beMain = [...be].sort((a, b) => b.appropriation - a.appropriation)[0];
  const BUDGET_EXEC: FinCard = beMain
    ? { value: `${beMain.execution}%`, lines: [`${beMain.currency}: مدفوع ${money(beMain.paid, beMain.currency)} من اعتماد ${money(beMain.appropriation, beMain.currency)} (سنة ${d.fy?.year})`, ...be.filter((x) => x !== beMain).map((x) => `${curName(x.currency)}: ${x.execution}% (${money(x.paid, x.currency)} من ${money(x.appropriation, x.currency)})`)] }
    : { value: null, reason: d.fy ? "لا بنود نفقات ذات اعتماد في السنة المالية" : "لا موازنة مسجّلة بعد" };
  return { COLLECTION_RATE, BUDGET_EXEC };
}
export { NA };
