import { COMPETITIVE, quorumState, summonsOk } from "./council";

/** Compliance analytics for the command center. Counts are computed server-side from the caller's RLS-scoped data.
 *  A source that could not be read yields count = null ("بيانات غير متوفرة"), never 0. These are reminders for follow-up, not legal findings:
 *  every underlying rule is pending lawyer review (see docs/LEGAL_RULES_REGISTRY.md). */
export type DecisionRow = { id: string; decision_no: string; year: number; title: string; decided_on: string | null; sent_on: string | null; received_on: string | null; validated_on: string | null; validation_level: string; legal_status: string };
export type SessionRow = { id: string; session_no: string | null; title: string; held_on: string; status: string; members_total: number | null; members_present: number | null; summoned_on: string | null; is_second_meeting: boolean };
export type ContractRow = { id: string; contractor: string; subject: string; status: string; procurement_method: string | null; published_on: string | null; award_notice_on: string | null; ppa_notice_on: string | null };
export type RuleRow = { rule_id: string; topic: string; review_status: string };
export type ComplianceInput = { decisions: DecisionRow[] | null; sessions: SessionRow[] | null; contracts: ContractRow[] | null; rules: RuleRow[] | null; truncated?: Partial<Record<"decisions" | "sessions" | "contracts" | "rules", boolean>> };

export type Item = { id: string; label: string; href: string };
export type Check = { id: "decisions_dates" | "decisions_validation" | "sessions" | "contracts" | "rules"; title: string; count: number | null; lines: { label: string; count: number }[]; items: Item[]; href: string; note?: string; reason?: string };

export const SEND_DEADLINE_DAYS = 8; // art. 58 (pending legal review: MUN-118-58)
const MAX_ITEMS = 8;
const days = (a: string, b: string) => Math.floor((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
export const todayBeirut = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
const unavailable = (id: Check["id"], title: string, href: string, reason: string): Check => ({ id, title, count: null, lines: [], items: [], href, reason });
const trunc = (on?: boolean) => (on ? "عدد السجلات بلغ حد القراءة؛ قد تكون الأرقام ناقصة." : undefined);
const dlabel = (d: DecisionRow) => `قرار ${d.decision_no}/${d.year}: ${d.title}`;
const slabel = (s: SessionRow) => `${s.title}${s.session_no ? ` (${s.session_no})` : ""} — ${s.held_on}`;

export function computeCompliance(input: ComplianceInput, today: string): Check[] {
  const out: Check[] = [];
  const T = input.truncated ?? {};

  // 1) decisions: sending / registration dates past 8 days
  const dHref = "/staff/council/decisions";
  if (!input.decisions) out.push(unavailable("decisions_dates", "قرارات بلا تاريخ إرسال/تسجيل بعد 8 أيام", dHref, "سجل القرارات غير متاح"));
  else {
    const dated = input.decisions.filter((d) => d.decided_on);
    const undated = input.decisions.length - dated.length;
    const late = dated.filter((d) => days(d.decided_on!, today) > SEND_DEADLINE_DAYS);
    const sentMissing = late.filter((d) => !d.sent_on);
    const regMissing = late.filter((d) => d.validation_level !== "none" && d.sent_on && !d.received_on);
    const ids = new Set([...sentMissing, ...regMissing].map((d) => d.id));
    out.push({ id: "decisions_dates", title: "قرارات بلا تاريخ إرسال/تسجيل بعد 8 أيام", count: ids.size, href: dHref, note: trunc(T.decisions),
      lines: [{ label: "بلا تاريخ إرسال إلى سلطة الرقابة (م.58)", count: sentMissing.length }, { label: "مُرسلة وخاضعة للتصديق بلا تاريخ تسجيل/استلام", count: regMissing.length }, ...(undated ? [{ label: "غير قابلة للتقييم (بلا تاريخ اتخاذ)", count: undated }] : [])],
      items: late.filter((d) => ids.has(d.id)).slice(0, MAX_ITEMS).map((d) => ({ id: d.id, label: dlabel(d), href: `${dHref}/${d.id}` })) });
  }

  // 2) decisions awaiting validation
  if (!input.decisions) out.push(unavailable("decisions_validation", "قرارات بانتظار التصديق", dHref, "سجل القرارات غير متاح"));
  else {
    const w = input.decisions.filter((d) => d.validation_level !== "none" && !d.validated_on && !["draft", "annulled", "effective"].includes(d.legal_status));
    out.push({ id: "decisions_validation", title: "قرارات بانتظار التصديق", count: w.length, href: dHref, note: trunc(T.decisions),
      lines: [{ label: "لم يُرسَل بعد", count: w.filter((d) => !d.sent_on).length }, { label: "مُرسل بلا تصديق مسجَّل", count: w.filter((d) => d.sent_on).length }],
      items: w.slice(0, MAX_ITEMS).map((d) => ({ id: d.id, label: dlabel(d), href: `${dHref}/${d.id}` })) });
  }

  // 3) sessions
  const sHref = "/staff/council";
  if (!input.sessions) out.push(unavailable("sessions", "جلسات فيها خلل في الدعوة أو النصاب أو الحضور", sHref, "سجل الجلسات غير متاح"));
  else {
    const ss = input.sessions.filter((s) => s.status !== "cancelled");
    const short = ss.filter((s) => summonsOk(s.summoned_on, s.held_on) === false);
    const noQuorum = ss.filter((s) => quorumState(s.members_total, s.members_present, s.is_second_meeting).ok === false);
    const noAttendance = ss.filter((s) => s.held_on <= today && (s.members_total === null || s.members_present === null));
    const ids = new Set([...short, ...noQuorum, ...noAttendance].map((s) => s.id));
    out.push({ id: "sessions", title: "جلسات فيها خلل في الدعوة أو النصاب أو الحضور", count: ids.size, href: sHref, note: trunc(T.sessions),
      lines: [{ label: "الدعوة قبل أقل من 3 أيام (م.33؛ يجوز التقصير للضرورة)", count: short.length }, { label: "النصاب غير مكتمل (م.34)", count: noQuorum.length }, { label: "الحضور غير مسجَّل لجلسة انعقدت", count: noAttendance.length }],
      items: ss.filter((s) => ids.has(s.id)).slice(0, MAX_ITEMS).map((s) => ({ id: s.id, label: slabel(s), href: `${sHref}/${s.id}` })) });
  }

  // 4) draft contracts without publication / notice dates
  const cHref = "/staff/projects/contracts";
  if (!input.contracts) out.push(unavailable("contracts", "عقود مسودة بلا تواريخ نشر/إشعار", cHref, "سجل العقود غير متاح"));
  else {
    const dr = input.contracts.filter((c) => c.status === "draft");
    const comp = dr.filter((c) => c.procurement_method && COMPETITIVE.includes(c.procurement_method));
    const noPub = comp.filter((c) => !c.published_on);
    const noPpa = dr.filter((c) => c.procurement_method === "negotiated" && !c.ppa_notice_on);
    const noAward = comp.filter((c) => !c.award_notice_on);
    const unknown = dr.filter((c) => !c.procurement_method);
    const ids = new Set([...noPub, ...noPpa].map((c) => c.id));
    out.push({ id: "contracts", title: "عقود مسودة بلا تواريخ نشر/إشعار", count: ids.size, href: cHref, note: trunc(T.contracts),
      lines: [{ label: "تنافسي بلا تاريخ نشر", count: noPub.length }, { label: "رضائي بلا تاريخ إشعار هيئة الشراء", count: noPpa.length }, { label: "تنافسي بلا تاريخ نشر قبول العرض (يلزم قبل التوقيع)", count: noAward.length }, ...(unknown.length ? [{ label: "غير قابلة للتقييم (طريقة التلزيم غير مسجّلة)", count: unknown.length }] : [])],
      items: dr.filter((c) => ids.has(c.id)).slice(0, MAX_ITEMS).map((c) => ({ id: c.id, label: `${c.contractor} — ${c.subject}`.slice(0, 120), href: cHref })) });
  }

  // 5) legal rules pending review
  const lHref = "/staff/legal";
  if (!input.rules) out.push(unavailable("rules", "قواعد قانونية بانتظار المراجعة", lHref, "سجل القواعد القانونية غير مفعّل بعد"));
  else {
    const p = input.rules.filter((r) => r.review_status === "pending_review");
    out.push({ id: "rules", title: "قواعد قانونية بانتظار المراجعة", count: p.length, href: lHref, note: trunc(T.rules), lines: [{ label: "من أصل قواعد مسجّلة", count: input.rules.length }],
      items: p.slice(0, MAX_ITEMS).map((r) => ({ id: r.rule_id, label: `${r.rule_id} — ${r.topic}`, href: lHref })) });
  }
  return out;
}

const LIMIT = 2000;
/** Reads each source through the caller's own RLS-scoped client; a failed read marks only that source unavailable. */
export async function loadCompliance(sb: any, today = todayBeirut()): Promise<Check[]> {
  const q = async <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> => { try { const r = await p; return r.error ? null : r.data ?? []; } catch { return null; } };
  const [decisions, sessions, contracts, rules] = await Promise.all([
    q<DecisionRow>(sb.from("municipal_decision").select("id,decision_no,year,title,decided_on,sent_on,received_on,validated_on,validation_level,legal_status").order("decided_on", { ascending: true, nullsFirst: false }).limit(LIMIT)),
    q<SessionRow>(sb.from("council_session").select("id,session_no,title,held_on,status,members_total,members_present,summoned_on,is_second_meeting").order("held_on", { ascending: false }).limit(LIMIT)),
    q<ContractRow>(sb.from("contract").select("id,contractor,subject,status,procurement_method,published_on,award_notice_on,ppa_notice_on").limit(LIMIT)),
    q<RuleRow>(sb.from("legal_rule").select("rule_id,topic,review_status").limit(LIMIT)),
  ]);
  const full = (a: unknown[] | null) => !!a && a.length >= LIMIT;
  return computeCompliance({ decisions, sessions, contracts, rules, truncated: { decisions: full(decisions), sessions: full(sessions), contracts: full(contracts), rules: full(rules) } }, today);
}
