import "server-only";
import { computeOps, type Coll, type Hist, type Person, type Range, type Req } from "./ops";
import { delta, KPI_REGISTRY, type Card } from "./kpi";
import { financeCards } from "./financeData";
import { projectStats } from "./projectsData";

const ROLE_AR: Record<string, string> = { staff: "موظف", mayor: "رئيس", admin: "مدير" };
export type Dec = { id: string; decision_no: string; year: number; title: string; legal_status: string; execution_status: string; execution_due: string | null; responsible: string | null };
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

/** Loads everything the executive dashboard needs through the caller's RLS-scoped client, then computes in the backend. */
export async function loadOps(sb: any, range: Range) {
  const since = new Date(+range.from - (+range.to - +range.from) - 86_400_000).toISOString();
  const [rq, hs, rs, cl, dc, ss] = await Promise.all([
    sb.from("citizen_request").select("id,kind,report_type,status,assigned_to,created_at,updated_at").order("created_at", { ascending: false }).limit(3000),
    sb.from("request_status_history").select("request_id,from_status,to_status,actor,created_at").order("created_at", { ascending: true }).limit(8000),
    sb.rpc("ops_roster"),
    sb.from("collection_entry").select("amount,currency,method,collected_by,created_at").gte("created_at", since).limit(5000),
    sb.from("municipal_decision").select("id,decision_no,year,title,legal_status,execution_status,execution_due,responsible").limit(2000),
    sb.from("council_session").select("id,session_no,title,held_on,status").gte("held_on", todayKey()).neq("status", "cancelled").order("held_on", { ascending: true }).limit(5),
  ]);
  const people = ((rs.data ?? []) as Person[]).map((p) => ({ ...p, display_name: p.display_name || ROLE_AR[p.role] || "موظف" }));
  const o = computeOps((rq.data ?? []) as Req[], (hs.data ?? []) as Hist[], people, (cl.data ?? []) as Coll[], range);
  const decisions: Dec[] | null = dc.error ? null : ((dc.data ?? []) as Dec[]);
  const collAll = ((cl.data ?? []) as Coll[]).length;
  const sessions = ss.error ? null : ((ss.data ?? []) as { id: string; session_no: string | null; title: string; held_on: string; status: string }[]);
  const [fin, proj] = await Promise.all([
    financeCards(sb, range).catch(() => null),
    projectStats(sb).catch(() => null),
  ]);
  return { o, people, decisions, collAll, sessions, fin, proj };
}

/** Decisions due = legally effective with an execution deadline that has arrived. Executed = completed. */
export function decisionStats(decs: Dec[] | null) {
  if (!decs) return null;
  const t = todayKey();
  const due = decs.filter((d) => d.legal_status === "effective" && d.execution_due && d.execution_due <= t);
  const done = due.filter((d) => d.execution_status === "completed");
  const late = decs.filter((d) => d.legal_status === "effective" && d.execution_due && d.execution_due < t && d.execution_status !== "completed" && d.execution_status !== "stopped");
  return { total: decs.length, due: due.length, done: done.length, late, rate: due.length ? Math.round((100 * done.length) / due.length) : null };
}

export function buildCards(d: Awaited<ReturnType<typeof loadOps>>): Card[] {
  const { o, decisions, collAll, fin, proj } = d;
  const ds = decisionStats(decisions);
  const fmtMoney = (n: number, c: string) => `${Math.round(n).toLocaleString("en-US")} ${c === "USD" ? "$" : "ل.ل."}`;
  const cards: Card[] = [];
  const def = (id: string) => KPI_REGISTRY.find((k) => k.id === id)!;
  // 1. revenue collected: per currency, only when at least one receipt exists
  const colls = o.collections.filter((c) => c.count > 0);
  const main = [...colls].sort((a, b) => b.count - a.count)[0];
  cards.push(collAll > 0 && main
    ? { def: def("REV_COLLECTED"), value: fmtMoney(main.month, main.currency), lines: colls.filter((c) => c !== main).map((c) => fmtMoney(c.month, c.currency)), delta: delta(main.month, main.prev === 0 && main.month === 0 ? null : main.prev, "up", ""), spark: main.series.map((s) => s.v) }
    : { def: def("REV_COLLECTED"), value: null, delta: null, spark: null, reason: "لم تُسجَّل إيصالات بعد" });
  cards.push(fin
    ? { def: def("COLLECTION_RATE"), value: fin.COLLECTION_RATE.value, lines: fin.COLLECTION_RATE.lines, reason: fin.COLLECTION_RATE.reason, delta: null, spark: null }
    : { def: def("COLLECTION_RATE"), value: null, delta: null, spark: null, reason: "سجل المستحقات غير متاح" });
  cards.push(ds && ds.rate !== null
    ? { def: def("DECISIONS_EXEC_RATE"), value: `${ds.rate}%`, lines: [`${ds.done} من ${ds.due} مستحقة`], delta: null, spark: null }
    : { def: def("DECISIONS_EXEC_RATE"), value: null, delta: null, spark: null, reason: ds ? "لا قرارات نافذة مستحقة بعد" : "سجل القرارات غير مفعّل بعد" });
  cards.push(o.completionRate !== null
    ? { def: def("COMPLAINT_RATE"), value: `${o.completionRate}%`, lines: [`${o.cohort.done} من ${o.cohort.total} واردة`, `أُنجز في الفترة: ${o.processedNow}`], delta: delta(o.completionRate, o.completionPrev, "up", "%"), spark: o.series.map((s) => s.closed) }
    : { def: def("COMPLAINT_RATE"), value: null, delta: null, spark: null, reason: "لا طلبات واردة في الفترة" });
  cards.push(proj && proj.avgProgress !== null
    ? { def: def("PROJECT_PROGRESS"), value: `${proj.avgProgress}%`, lines: [`${proj.activeCount} مشروعًا قيد التنفيذ`, ...(proj.delayedList.length ? [`${proj.delayedList.length} متأخر`] : [])], delta: null, spark: null }
    : { def: def("PROJECT_PROGRESS"), value: null, delta: null, spark: null, reason: proj ? "لا مشاريع لها مراحل مسجّلة بعد" : "سجل المشاريع غير متاح" });
  cards.push(fin
    ? { def: def("BUDGET_EXEC"), value: fin.BUDGET_EXEC.value, lines: fin.BUDGET_EXEC.lines, reason: fin.BUDGET_EXEC.reason, delta: null, spark: null }
    : { def: def("BUDGET_EXEC"), value: null, delta: null, spark: null, reason: "سجل الموازنة غير متاح" });
  return cards;
}

/** Plain-text facts for the AI copilot: computed here from the caller's authorised data, never taken from the browser. */
export function opsFacts(d: Awaited<ReturnType<typeof loadOps>>): string {
  const { o, decisions } = d;
  const ds = decisionStats(decisions);
  const L = [
    `الفترة: ${o.range.label}`,
    `طلبات مفتوحة الآن: ${o.open} (متأخرة أكثر من 7 أيام: ${o.overdue.length}، غير مُسندة: ${o.unassigned})`,
    `واردة في الفترة: ${o.intakeNow} (السابقة: ${o.intakePrev})، أُنجز في الفترة: ${o.processedNow} (السابقة: ${o.processedPrev})`,
    `نسبة معالجة الواردة في الفترة: ${o.completionRate === null ? "غير متوفرة" : o.completionRate + "%"}`,
    `متوسط زمن المعالجة (أيام): ${o.resolutionDays === null ? "غير متوفر" : o.resolutionDays.toFixed(1)}`,
    `الحالات: ${o.status.map((s) => `${s.s}=${s.n}`).join("، ")}`,
    ...o.collections.filter((c) => c.count > 0).map((c) => `التحصيل ${c.currency} في الفترة: ${Math.round(c.month)} (السابقة: ${Math.round(c.prev)})`),
    ds ? `القرارات: الإجمالي ${ds.total}، نافذة مستحقة ${ds.due}، منفذة ${ds.done}، متأخرة ${ds.late.length}` : "سجل القرارات غير مفعّل",
    ...(d.fin ? [`نسبة التحصيل: ${d.fin.COLLECTION_RATE.value ?? "غير متوفرة (" + (d.fin.COLLECTION_RATE.reason ?? "") + ")"}`, `تنفيذ الموازنة: ${d.fin.BUDGET_EXEC.value ?? "غير متوفر (" + (d.fin.BUDGET_EXEC.reason ?? "") + ")"}`] : ["الموازنة والمستحقات غير متاحة"]),
    d.proj ? `المشاريع: قيد التنفيذ ${d.proj.activeCount}، متأخرة ${d.proj.delayedList.length}، متوسط الإنجاز ${d.proj.avgProgress === null ? "غير متوفر" : d.proj.avgProgress + "%"}` : "سجل المشاريع غير متاح",
  ];
  return L.join("\n");
}
