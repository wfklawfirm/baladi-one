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

export type Range = { key: string; label: string; from: Date; to: Date };
export const PERIODS = [["month", "هذا الشهر"], ["quarter", "هذا الربع"], ["year", "هذه السنة"], ["custom", "فترة مخصصة"]] as const;
/** Period from the URL (month | quarter | year | custom with from/to). Defaults to the current month. Dates are Beirut calendar days. */
export function parsePeriod(p: string | undefined, from: string | undefined, to: string | undefined, now = new Date()): Range {
  const [y, m] = dayKey(now).split("-").map(Number);
  const at = (yy: number, mm: number, dd = 1) => new Date(Date.UTC(yy, mm - 1, dd, -2));  // 00:00 Beirut ≈ UTC-2 (fixed offset is fine for day buckets here)
  const end = new Date(now);
  if (p === "year") return { key: "year", label: `سنة ${y}`, from: at(y, 1), to: end };
  if (p === "quarter") { const q = Math.floor((m - 1) / 3) * 3 + 1; return { key: "quarter", label: `الربع ${Math.floor((m - 1) / 3) + 1} من ${y}`, from: at(y, q), to: end }; }
  if (p === "custom" && from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const f = new Date(`${from}T00:00:00+02:00`), t = new Date(`${to}T23:59:59+02:00`);
    if (+t >= +f && +t - +f <= 800 * DAY) return { key: "custom", label: `${from} → ${to}`, from: f, to: t };
  }
  return { key: "month", label: "هذا الشهر", from: at(y, m), to: end };
}
export const previousRange = (r: Range): Range => { const len = +r.to - +r.from; return { key: "prev", label: "الفترة السابقة", from: new Date(+r.from - len), to: new Date(+r.from) }; };
const inR = (d: string | Date | number, r: Range) => { const x = +new Date(d); return x >= +r.from && x < +r.to + 1; };
/** Daily buckets for ranges up to ~2 months, otherwise monthly. */
export function buckets(r: Range) {
  const days = Math.ceil((+r.to - +r.from) / DAY) + 1;
  if (days <= 62) {
    const out: { key: string; label: string }[] = [];
    for (let t = +r.from; t <= +r.to + DAY - 1 && out.length < 63; t += DAY) { const k = dayKey(t); if (!out.some((o) => o.key === k)) out.push({ key: k, label: k.slice(5).replace("-", "/") }); }
    return { monthly: false, list: out };
  }
  const out: { key: string; label: string }[] = []; const d = new Date(r.from);
  while (+d <= +r.to && out.length < 30) { const k = dayKey(d).slice(0, 7); if (!out.some((o) => o.key === k)) out.push({ key: k, label: k.slice(2).replace("-", "/") }); d.setUTCDate(d.getUTCDate() + 20); }
  const last = dayKey(r.to).slice(0, 7); if (!out.some((o) => o.key === last)) out.push({ key: last, label: last.slice(2).replace("-", "/") });
  return { monthly: true, list: out };
}

export function computeOps(reqs: Req[], hist: Hist[], people: Person[], colls: Coll[], range: Range, now = new Date()) {
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

  const prev = previousRange(range);
  const bk = buckets(range);
  const keyOf = (d: string | number) => (bk.monthly ? dayKey(d).slice(0, 7) : dayKey(d));
  const intake: Record<string, number> = Object.fromEntries(bk.list.map((x) => [x.key, 0]));
  const closed: Record<string, number> = { ...intake };
  for (const r of reqs) { if (inR(r.created_at, range)) { const k = keyOf(r.created_at as string); if (k in intake) intake[k]++; } }
  for (const r of terminal) { const c = closedAt(r); if (inR(c, range)) { const k = keyOf(c); if (k in closed) closed[k]++; } }
  const series = bk.list.map((x) => ({ key: x.key, label: x.label, intake: intake[x.key], closed: closed[x.key] }));
  const cohort = (r: Range) => { const c = reqs.filter((q) => inR(q.created_at, r)); return { total: c.length, done: c.filter((q) => q.status === "done").length }; };
  const processedIn = (r: Range) => terminal.filter((q) => inR(closedAt(q), r)).length;
  const cNow = cohort(range), cPrev = cohort(prev);

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

  // Collections (never sums different currencies)
  const sumIn = (r: Range, cur: string, who?: string) => colls.filter((c) => c.currency === cur && inR(c.created_at, r) && (!who || c.collected_by === who)).reduce((s, c) => s + Number(c.amount), 0);
  const collections = (["LBP", "USD"] as const).map((cur) => ({
    currency: cur,
    month: sumIn(range, cur),
    prev: sumIn(prev, cur),
    count: colls.filter((c) => c.currency === cur).length,
    series: bk.list.map((x) => ({ key: x.key, label: x.label, v: colls.filter((c) => c.currency === cur && keyOf(c.created_at) === x.key && inR(c.created_at, range)).reduce((s, c) => s + Number(c.amount), 0) })),
    byCollector: people.map((p) => ({ name: p.display_name ?? "", id: p.user_id, v: sumIn(range, cur, p.user_id) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v),
  }));

  const statusCount = (s: string) => reqs.filter((r) => r.status === s).length;
  return {
    total: reqs.length, open: open.length, overdue, unassigned: unassigned.length,
    intakeNow: cNow.total, intakePrev: cPrev.total,
    processedNow: processedIn(range), processedPrev: processedIn(prev),
    // complaint processing rate = done / all requests created in the period (cohort); null when the denominator is 0
    completionRate: cNow.total ? Math.round((100 * cNow.done) / cNow.total) : null,
    completionPrev: cPrev.total ? Math.round((100 * cPrev.done) / cPrev.total) : null,
    cohort: cNow, range, prev,
    resolutionDays, series, aging, perf, collections,
    status: ["received", "in_progress", "needs_info", "done", "rejected", "cancelled"].map((s) => ({ s, n: statusCount(s) })),
    openList: [...open].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)).map((r) => ({ ...r, age: Math.floor(ageDays(r)) })),
  };
}
