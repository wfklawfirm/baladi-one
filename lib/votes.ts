/** Council voting helpers. They mirror the database checks (council_agenda_result constraints) so the UI can warn early; the database remains the authority. */
export const VOTE: Record<string, string> = { for: "مع", against: "ضد", abstain: "امتناع", absent: "غائب", recused: "متنحٍّ (تعارض مصالح)" };
export const VOTE_KEYS = Object.keys(VOTE);
export const RESULT: Record<string, string> = { carried: "اتُّخذ القرار", not_carried: "لم يُتَّخذ", tie: "تعادل", unverified: "النتيجة غير محسومة / يلزم تحقق" };
export const MAJORITY_KIND: Record<string, string> = { simple: "أغلبية بسيطة", absolute: "أغلبية مطلقة", two_thirds: "ثلثا الأعضاء", other: "أخرى (انظر الملاحظة)" };
export const NEEDS_VERIFICATION = "يلزم تحقق";
export const MAJORITY_LABEL = (kind: string | null | undefined, verification: string | null | undefined) =>
  kind ? `${MAJORITY_KIND[kind] ?? kind}${verification === "verified" ? "" : ` — ${NEEDS_VERIFICATION}`}` : `غير محدد — ${NEEDS_VERIFICATION}`;

export type VoteRow = { member: string; vote: string; reason?: string | null };
export type Tally = { for: number; against: number; abstain: number; recused: number; absent: number; rows: number; present: number };

export function tally(rows: VoteRow[]): Tally {
  const t: Tally = { for: 0, against: 0, abstain: 0, recused: 0, absent: 0, rows: rows.length, present: 0 };
  for (const r of rows) if (r.vote in t && VOTE_KEYS.includes(r.vote)) (t as any)[r.vote]++;
  t.present = t.rows - t.absent;
  return t;
}

export type VoteProblem = "attendance_required" | "empty" | "bad_vote" | "empty_name" | "duplicate_member" | "recusal_reason_required" | "too_many_members" | "present_exceeds_session" | "result_contradicts_counts" | "tie_break_needs_tie";
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Consistency: for+against+abstain+recused <= present <= total, present never above the session's recorded attendance, unique members, recusal needs a reason. */
export function checkVotes(session: { total: number | null; present: number | null }, rows: VoteRow[]): VoteProblem[] {
  const out = new Set<VoteProblem>();
  if (session.total === null || session.present === null) out.add("attendance_required");
  if (rows.length === 0) out.add("empty");
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.member.trim()) out.add("empty_name");
    else { const k = norm(r.member); if (seen.has(k)) out.add("duplicate_member"); seen.add(k); }
    if (!VOTE_KEYS.includes(r.vote)) out.add("bad_vote");
    if (r.vote === "recused" && !(r.reason ?? "").trim()) out.add("recusal_reason_required");
  }
  const t = tally(rows);
  if (session.total !== null && t.rows > session.total) out.add("too_many_members");
  if (session.present !== null && t.present > session.present) out.add("present_exceeds_session");
  return [...out];
}

/** A declared result may not contradict the counts. A tie is only decided with the chair's tie-break flag (art. 42, pending legal review). */
export function checkResult(result: string, t: Pick<Tally, "for" | "against">, tieBreak: boolean): VoteProblem[] {
  const tied = t.for === t.against && t.for > 0;
  const out: VoteProblem[] = [];
  if (tieBreak && !tied) out.push("tie_break_needs_tie");
  const ok = result === "unverified"
    || (result === "carried" && (t.for > t.against || (tied && tieBreak)))
    || (result === "not_carried" && (t.for < t.against || (tied && tieBreak)))
    || (result === "tie" && tied && !tieBreak);
  if (!ok) out.push("result_contradicts_counts");
  return out;
}

/** Result suggested to the user when none is declared: only a tie is derivable without a verified majority rule. */
export const defaultResult = (t: Pick<Tally, "for" | "against">, tieBreak: boolean) => (t.for === t.against && t.for > 0 && !tieBreak ? "tie" : "unverified");

export const PROBLEM_AR: Record<VoteProblem, string> = {
  attendance_required: "سجّل الحضور (عدد الأعضاء والحاضرين) في صفحة الجلسة أولًا.",
  empty: "أضف عضوًا واحدًا على الأقل.",
  bad_vote: "نوع تصويت غير صالح.",
  empty_name: "اسم العضو مطلوب.",
  duplicate_member: "اسم عضو مكرّر في البند نفسه.",
  recusal_reason_required: "سبب التنحي (تعارض المصالح) مطلوب.",
  too_many_members: "عدد المصوّتين المسجّلين يتجاوز عدد أعضاء المجلس.",
  present_exceeds_session: "عدد الحاضرين في البند يتجاوز الحضور المسجّل للجلسة.",
  result_contradicts_counts: "النتيجة المعلنة تناقض عدد الأصوات.",
  tie_break_needs_tie: "ترجيح الرئيس يصحّ عند التعادل فقط.",
};
/** Maps a database/RPC error message to a stable code for redirects. */
export function errCode(message: string | undefined | null): string {
  const m = message ?? "";
  for (const c of ["attendance_required", "session_locked", "too_many_members", "present_exceeds_session", "recusal_reason_required", "minutes_locked", "minutes_not_approved", "minutes_still_draft", "original_text_required", "note_required", "already_decided", "unknown_rule", "no_change", "forbidden", "result_matches_counts", "tie_break_needs_tie"]) if (m.includes(c)) return c;
  if (m.includes("council_vote_member_uq") || m.includes("duplicate key")) return "duplicate_member";
  if (/does not exist|schema cache|Could not find the function/i.test(m)) return "unavailable";
  return "1";
}
