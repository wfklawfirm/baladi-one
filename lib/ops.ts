// Pure computation for the mayor's operations dashboard (no I/O, unit-tested).
export const SLA_DAYS = 7;          // an open request older than this is "overdue"
export const FIRST_RESPONSE_H = 48; // first staff action expected within this window
export const OPEN = ["received", "in_progress", "needs_info"] as const;
export const TERMINAL = ["done", "rejected", "cancelled"] as const;

export type Req = { id: string; kind: string; report_type: string | null; status: string; assigned_to: string | null; created_at: string; updated_at: string };
export type Hist = { request_id: string; from_status: string | null; to_status: string; actor: string | null; created_at: string };
export type Person = { user_id: string; display_name: string | null; role: string };
export type Coll = { amount: number | string; currency: string; method: string; collected_by: string | null; created_at: string };

const DAY = 86_400_000;
export const dayKey = (d: Date | string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date(d));
const isOpen = (s: string) => (OPEN as readonly string[]).includes(s);
const isTerminal = (s: string) => (TERMINAL as readonly string[]).includes(s);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function lastDays(n: number, now: Date): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(now.getTime() - (n - 1 - i) * DAY));
}

export function computeOps(reqs: Req[], hist: Hist[], people: Person[], colls: Coll[], now = new Date()) {
  const t = now.getTime();
  const byReq = new Map<string, Hist[]>();
  for (const h of hist) (byReq.get(h.request_id) ?? byReq.set(h.request_id, []).get(h.request_id)!).push(h);
  for (const l of byReq.values()) l.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const open = reqs.filter((r) => isOpen(r.status));
  const ageDays = (r: Req) => (t - +new Date(r.created_at)) / DAY;
  const overdue = open.filter((r) => ageDays(r) > SLA_DAYS);
  const unassigned = open.filter((r) => !r.assigned_to);
  const closedAt = (r: Req) => {
    const h = (byReq.get(r.id) ?? []).find((x) => isTerminal(x.to_status));
    return h ? +new Date(h.created_at) : +new Date(r.updated_at);
  };
  const terminal = reqs.filter((r) => isTerminal(r.status));
  const resolutionDays = avg(terminal.map((r) => Math.max(0, (closedAt(r) - +new Date(r.created_at)) / DAY)));

  const days = lastDays(30, now);
  const intake = Object.fromEntries(days.map((d) => [d, 0])) as Record<string, number>;
  const closed = { ...intake };
  for (const r of reqs) { const k = dayKey(r.created_at); if (k in intake) intake[k]++; }
  for (const r of terminal) { const k = dayKey(closedAt(r)); if (k in closed) closed[k]++; }
  const series = days.map((d) => ({ day: d, intake: intake[d], closed: closed[d] }));

  const aging = [
    { label: "٠–٢ يوم", n: open.filter((r) => ageDays(r) <= 2).length },
    { label: "٣–٧ أيام", n: open.filter((r) => ageDays(r) > 2 && ageDays(r) <= 7).length },
    { label: "٨–١٤ يومًا", n: open.filter((r) => ageDays(r) > 7 && ageDays(r) <= 14).length },
    { label: "أكثر من ١٤", n: open.filter((r) => ageDays(r) > 14).length },
  ];

  // Staff indicators (from the status history: who handled / closed / answered first).
  const perf = people.map((p) => {
    const handledIds = new Set<string>(); let closedN = 0, closedOnTime = 0, first = 0, firstFast = 0;
    for (const r of reqs) {
      const l = byReq.get(r.id) ?? [];
      if (l.some((h) => h.actor === p.user_id)) handledIds.add(r.id);
      const f = l.find((h) => h.actor);
      if (f && f.actor === p.user_id) { first++; if (+new Date(f.created_at) - +new Date(r.created_at) <= FIRST_RESPONSE_H * 3_600_000) firstFast++; }
      const c = l.find((h) => h.actor === p.user_id && h.to_status === "done");
      if (c) { closedN++; if (+new Date(c.created_at) - +new Date(r.created_at) <= SLA_DAYS * DAY) closedOnTime++; }
    }
    const mine = open.filter((r) => r.assigned_to === p.user_id);
    const handled = handledIds.size;
    const enough = handled >= 3;
    const score = enough ? Math.round(50 * (closedN / handled) + 30 * (closedN ? closedOnTime / closedN : 0) + 20 * (first ? firstFast / first : 0)) : null;
    return { ...p, handled, closed: closedN, onTime: closedN ? Math.round((100 * closedOnTime) / closedN) : null, fast: first ? Math.round((100 * firstFast) / first) : null, openAssigned: mine.length, overdueAssigned: mine.filter((r) => ageDays(r) > SLA_DAYS).length, score };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.closed - a.closed);

  // Collections
  const month = dayKey(now).slice(0, 7);
  const prevMonth = dayKey(new Date(now.getFullYear(), now.getMonth() - 1, 15)).slice(0, 7);
  const sum = (f: (c: Coll) => boolean, cur: string) => colls.filter((c) => c.currency === cur && f(c)).reduce((s, c) => s + Number(c.amount), 0);
  const collections = (["LBP", "USD"] as const).map((cur) => ({
    currency: cur,
    month: sum((c) => dayKey(c.created_at).startsWith(month), cur),
    prev: sum((c) => dayKey(c.created_at).startsWith(prevMonth), cur),
    count: colls.filter((c) => c.currency === cur).length,
    series: days.map((d) => ({ day: d, v: sum((c) => dayKey(c.created_at) === d, cur) })),
    byCollector: people.map((p) => ({ name: p.display_name ?? "", id: p.user_id, v: sum((c) => c.collected_by === p.user_id && dayKey(c.created_at).startsWith(month), cur) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v),
  }));

  const statusCount = (s: string) => reqs.filter((r) => r.status === s).length;
  return {
    total: reqs.length, open: open.length, overdue, unassigned: unassigned.length,
    last30: series.reduce((s, d) => s + d.intake, 0),
    completionRate: reqs.length ? Math.round((100 * statusCount("done")) / reqs.length) : null,
    resolutionDays, series, aging, perf, collections,
    status: ["received", "in_progress", "needs_info", "done", "rejected", "cancelled"].map((s) => ({ s, n: statusCount(s) })),
    openList: [...open].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)).map((r) => ({ ...r, age: Math.floor(ageDays(r)) })),
  };
}
