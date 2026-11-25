export type InboxItem = { kind: "request" | "decision" | "minutes" | "service"; title: string; href: string; age: string | null; ageDays: number | null; actionLabel: string };

export function ageDays(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null;
}
export function ageLabel(d: number | null): string | null {
  if (d === null) return null;
  if (d === 0) return "اليوم";
  if (d === 1) return "منذ يوم";
  if (d === 2) return "منذ يومين";
  return d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يومًا`;
}
type In = {
  newRequests: number;
  decisions: { id: string; decision_no: string; year: number; title: string; created_at: string; template_snapshot: unknown }[];
  minutes: { id: string; session_no: string | null; title: string; held_on: string | null; created_at: string }[];
  services: { id: string; title_ar: string; created_at: string }[];
};
/** Oldest first inside each kind; requests first (the citizen is waiting), then decisions, minutes, services. */
export function buildInbox(i: In, now: number): { items: InboxItem[]; total: number } {
  const items: InboxItem[] = [];
  if (i.newRequests > 0) items.push({ kind: "request", title: i.newRequests === 1 ? "طلب جديد بانتظار المعالجة" : `${i.newRequests} طلبات جديدة بانتظار المعالجة`, href: "/staff/requests?s=received", age: null, ageDays: null, actionLabel: "افتح الطلبات" });
  for (const d of i.decisions) { const a = ageDays(d.created_at, now); items.push({ kind: "decision", title: `قرار ${d.decision_no}/${d.year}: ${d.title}`, href: d.template_snapshot ? `/staff/decisions/${d.id}` : `/staff/council/decisions/${d.id}`, age: ageLabel(a), ageDays: a, actionLabel: "أكمل القرار" }); }
  for (const m of i.minutes) { const a = ageDays(m.created_at, now); items.push({ kind: "minutes", title: `محضر الجلسة ${m.session_no ?? ""} ${m.title}`.replace(/\s+/g, " ").trim(), href: `/staff/council/${m.id}/votes/minutes`, age: ageLabel(a), ageDays: a, actionLabel: "راجع المحضر" }); }
  for (const s of i.services) { const a = ageDays(s.created_at, now); items.push({ kind: "service", title: `خدمة بانتظار الاعتماد: ${s.title_ar}`, href: `/staff/services/${s.id}`, age: ageLabel(a), ageDays: a, actionLabel: "راجع الخدمة" }); }
  return { items, total: items.length };
}
