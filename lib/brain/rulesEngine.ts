// V3 phase 6: deterministic rules engine. Numbers come ONLY from data/legal_rules.json after human verification; null → needs_verification.
import cfg from "@/data/legal_rules.json";
export type Rule = { id: string; label: string; source_hint: string; kind: string; value: number | null; status: "pending_review" | "verified" };
export type RuleResult = { rule: string; outcome: "met" | "not_met" | "needs_verification"; reason: string; verified: boolean };
const RULES = cfg.rules as Rule[];
const get = (id: string, rules: Rule[] = RULES) => rules.find((r) => r.id === id);
const nv = (r: Rule | undefined, id: string): RuleResult => ({ rule: id, outcome: "needs_verification", verified: false, reason: r ? `القاعدة «${r.label}» لم تُعتمد بعد من مراجع بشري (${r.source_hint})` : "قاعدة غير معرّفة" });
const usable = (r?: Rule): r is Rule & { value: number } => !!r && r.value !== null && r.status === "verified";

export function checkQuorum(total: number, present: number, rules?: Rule[]): RuleResult {
  const r = get("council_quorum", rules);
  if (!usable(r)) return nv(r, "council_quorum");
  const need = Math.ceil(total * r.value);
  return present >= need ? { rule: r.id, outcome: "met", verified: true, reason: `الحضور ${present} ≥ ${need}` } : { rule: r.id, outcome: "not_met", verified: true, reason: `الحضور ${present} < ${need}` };
}
export function checkMajority(present: number, yes: number, rules?: Rule[]): RuleResult {
  const r = get("council_majority", rules);
  if (!usable(r)) return nv(r, "council_majority");
  const need = Math.floor(present * r.value) + 1;
  return yes >= need ? { rule: r.id, outcome: "met", verified: true, reason: `الموافقون ${yes} ≥ ${need}` } : { rule: r.id, outcome: "not_met", verified: true, reason: `الموافقون ${yes} < ${need}` };
}
export function checkInvitationNotice(daysGiven: number, rules?: Rule[]): RuleResult {
  const r = get("invitation_notice_days", rules);
  if (!usable(r)) return nv(r, "invitation_notice_days");
  return daysGiven >= r.value ? { rule: r.id, outcome: "met", verified: true, reason: `المهلة ${daysGiven} ≥ ${r.value}` } : { rule: r.id, outcome: "not_met", verified: true, reason: `المهلة ${daysGiven} < ${r.value}` };
}
export const unverifiedRules = (rules: Rule[] = RULES) => rules.filter((r) => !usable(r)).map((r) => r.id);
