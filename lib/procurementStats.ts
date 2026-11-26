// Pure aggregation for the procurement executive dashboard. No I/O, no legal values.
// Rules: currencies are NEVER summed together; estimated / contracted figures are never merged; paid amounts are not part of this module.
import { METHOD } from "@/lib/council";
import { publicationComplete } from "@/lib/procurement";

export const NO_DATA = "لا بيانات";
export type Cur = string;
export type CurTotals = Record<Cur, number>;

export type DashPlan = { id: string; title: string; estimated_value: number | string | null; currency: string; status: string; planned_method: string | null; contract_id: string | null; planned_publish_on: string | null; planned_award_on: string | null };
export type DashContract = { id: string; value: number | string | null; currency: string; signed_on: string | null; status: string };
export type DashPub = { plan_item_id: string | null; contract_id: string | null; platform_url: string | null; reference_no: string | null; published_on: string | null; proof_ref: string | null };
export type DashCommittee = { id: string; plan_item_id: string | null; contract_id: string | null };
export type DashMember = { committee_id: string; declaration_on: string | null; has_conflict: boolean | null };
export type DashSupplier = { id: string; docs_expire_on: string | null };

const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Sums per currency; rows with an empty currency are ignored rather than guessed. Never returns a cross-currency total. */
export function sumByCurrency<T>(rows: T[], value: (r: T) => unknown, currency: (r: T) => string | null | undefined): CurTotals {
  const out: CurTotals = {};
  for (const r of rows) { const c = currency(r); if (!c) continue; out[c] = r2((out[c] ?? 0) + num(value(r))); }
  return out;
}

export const isActive = (p: { status: string }) => p.status === "planned" || p.status === "in_progress";

/** Execution % by item count: done ÷ (all items except cancelled). null (not 0) when there is nothing to measure. */
export function planExecution(plan: { status: string }[]): { done: number; total: number; pct: number | null } {
  const base = plan.filter((p) => p.status !== "cancelled");
  const done = base.filter((p) => p.status === "done").length;
  return { done, total: base.length, pct: base.length ? Math.round((done / base.length) * 1000) / 10 : null };
}

export type FollowUp = { id: string; title: string; reasons: string[] };
export const FOLLOW_PUBLISH = "تاريخ النشر المخطَّط مرّ دون نشر رسمي مكتمل مسجَّل";
export const FOLLOW_AWARD = "تاريخ الترسية المخطَّط مرّ دون عقد مربوط";

const hasPub = (p: DashPlan, pubs: DashPub[]) => pubs.some((x) => (x.plan_item_id === p.id || (!!p.contract_id && x.contract_id === p.contract_id)) && publicationComplete(x));

/** Active items whose own planned dates passed with no matching record. Informational; it never states a violation. */
export function followUps(plan: DashPlan[], pubs: DashPub[], today: string): FollowUp[] {
  const out: FollowUp[] = [];
  for (const p of plan.filter(isActive)) {
    const reasons: string[] = [];
    if (p.planned_publish_on && p.planned_publish_on < today && !hasPub(p, pubs)) reasons.push(FOLLOW_PUBLISH);
    if (p.planned_award_on && p.planned_award_on < today && !p.contract_id) reasons.push(FOLLOW_AWARD);
    if (reasons.length) out.push({ id: p.id, title: p.title, reasons });
  }
  return out;
}

export type MethodBar = { method: string; label: string; count: number };
export function methodDistribution(plan: { planned_method: string | null; status: string }[]): MethodBar[] {
  const m = new Map<string, number>();
  for (const p of plan.filter((x) => x.status !== "cancelled")) { const k = p.planned_method ?? ""; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([method, count]) => ({ method, label: method ? METHOD[method] ?? method : "غير محدد", count })).sort((a, b) => b.count - a.count);
}

export type CurBar = { currency: string; planned: number; contracted: number };
/** Planned (estimated value of non-cancelled items) vs contracted (value of SIGNED contracts linked to those items), side by side per currency; never summed across currencies. */
export function plannedVsContracted(plan: DashPlan[], contracts: DashContract[]): CurBar[] {
  const live = plan.filter((p) => p.status !== "cancelled");
  const planned = sumByCurrency(live, (p) => p.estimated_value, (p) => p.currency);
  const linked = new Set(live.map((p) => p.contract_id).filter(Boolean) as string[]);
  const signed = contracts.filter((c) => linked.has(c.id) && !!c.signed_on);
  const contracted = sumByCurrency(signed, (c) => c.value, (c) => c.currency);
  return [...new Set([...Object.keys(planned), ...Object.keys(contracted)])].sort().map((currency) => ({ currency, planned: planned[currency] ?? 0, contracted: contracted[currency] ?? 0 }));
}

export type Compliance = { missingDeclarations: number | null; expiredSupplierDocs: number | null; unpublished: number };
export function complianceTiles(i: { plan: DashPlan[]; pubs: DashPub[]; committees: DashCommittee[]; members: DashMember[]; suppliers: DashSupplier[] | null; today: string; membersAvailable: boolean }): Compliance {
  const live = i.plan.filter((p) => p.status !== "cancelled");
  const contractIds = new Set(live.map((p) => p.contract_id).filter(Boolean) as string[]), planIds = new Set(live.map((p) => p.id));
  const cids = new Set(i.committees.filter((c) => (c.plan_item_id && planIds.has(c.plan_item_id)) || (c.contract_id && contractIds.has(c.contract_id))).map((c) => c.id));
  return {
    // a member counts as missing when no declaration date or no yes/no answer is on file
    missingDeclarations: i.membersAvailable ? i.members.filter((m) => cids.has(m.committee_id) && (!m.declaration_on || m.has_conflict === null)).length : null,
    expiredSupplierDocs: i.suppliers === null ? null : i.suppliers.filter((s) => !!s.docs_expire_on && s.docs_expire_on < i.today).length,
    unpublished: live.filter((p) => !hasPub(p, i.pubs)).length,
  };
}

export type Stats = {
  itemCount: number;
  estimatedByCurrency: CurTotals;
  active: number;
  execution: ReturnType<typeof planExecution>;
  signedContracts: number;
  followUps: FollowUp[];
  charts: { plannedVsContracted: CurBar[]; methods: MethodBar[] };
  compliance: Compliance;
  openObjections: number | null; // null = table not available: the card is omitted
};

export function computeStats(i: { plan: DashPlan[]; contracts: DashContract[]; pubs: DashPub[]; committees: DashCommittee[]; members: DashMember[]; membersAvailable?: boolean; suppliers: DashSupplier[] | null; openObjections?: number | null; today: string }): Stats {
  const live = i.plan.filter((p) => p.status !== "cancelled");
  const linked = new Set(live.map((p) => p.contract_id).filter(Boolean) as string[]);
  return {
    itemCount: live.length,
    estimatedByCurrency: sumByCurrency(live, (p) => p.estimated_value, (p) => p.currency),
    active: live.filter(isActive).length,
    execution: planExecution(i.plan),
    signedContracts: i.contracts.filter((c) => linked.has(c.id) && !!c.signed_on).length,
    followUps: followUps(i.plan, i.pubs, i.today),
    charts: { plannedVsContracted: plannedVsContracted(i.plan, i.contracts), methods: methodDistribution(i.plan) },
    compliance: complianceTiles({ plan: i.plan, pubs: i.pubs, committees: i.committees, members: i.members, suppliers: i.suppliers, today: i.today, membersAvailable: i.membersAvailable ?? true }),
    openObjections: i.openObjections ?? null,
  };
}
