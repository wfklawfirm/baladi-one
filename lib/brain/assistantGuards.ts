import cfg from "@/data/assistant_guards.json";
// Layered safety for the assistant. Nothing here states a legal rule: every guard fires only when the retrieved in-force text contains its trigger phrase.
// Layers: (1) source tiers  (2) drop superseded sources when in-force texts exist  (3) generic guard engine  (4) ruling-question policy.
const n = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْـ]/g, "");
const re = (s: string) => new RegExp(n(s));

export type Guard = { id: string; when_source: string; subject: string; context: string; member: string; unless: string; affirm_answer?: string; message: string; safe_note: string };
export const GUARDS = cfg.guards as Guard[];

/** (1) What kind of source is this? chunk_id looks like `bk03:12` / `CHK-018:1` / `circ004:2`. */
export function sourceTier(chunkId: string): { tier: string; label: string } {
  const id = chunkId.split(":")[0];
  for (const t of cfg.tiers) if (new RegExp(t.match, "i").test(id)) return { tier: t.tier, label: t.label };
  return { tier: "law", label: "نص" };
}
export const isSecondary = (chunkId: string) => ["secondary", "summary"].includes(sourceTier(chunkId).tier);

/** (2) For a procurement-topic question, when in-force PPA texts were found, older books/summaries are dropped: they cannot compete with the newer text. */
export function dropSuperseded<T extends { chunk_id: string }>(chunks: T[], query: string, hasAuthority: boolean): T[] {
  if (!hasAuthority || !new RegExp(n(cfg.superseded_topic)).test(n(query))) return chunks;
  const pre = new RegExp(`^(?:${cfg.superseded_source_prefixes.join("|")})$`, "i");
  return chunks.filter((c) => !pre.test(c.chunk_id.split(":")[0]));
}

/** (3) Generic engine: the first violated guard, or null. */
export function auditGuards(answer: string, sourcesText: string, guards: Guard[] = GUARDS): Guard | null {
  const src = n(sourcesText), a = n(answer), lines = a.split("\n");
  for (const g of guards) {
    if (!re(g.when_source).test(src)) continue;
    const subject = re(g.subject), ctxRe = re(g.context), member = re(g.member), unless = re(g.unless);
    if (!ctxRe.test(a)) continue;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!subject.test(l) || unless.test(l)) continue;
      const near = `${lines[i - 2] ?? ""} ${lines[i - 1] ?? ""} ${l}`;
      if (member.test(near) && ctxRe.test(lines.slice(Math.max(0, i - 8), i + 1).join(" "))) return g;
    }
    // a categorical «نعم/يحق» opening on a ruling about the guarded subject
    if (g.affirm_answer && re(g.affirm_answer).test(a.trim()) && subject.test(a) && !unless.test(a)) return g;
  }
  return null;
}

/** (4) Ruling questions («هل يحق/يجوز…») on a procurement topic. */
export const isRulingQuestion = (q: string) => re(cfg.ruling_question).test(n(q));
export const isProcurementTopic = (q: string) => new RegExp(n(cfg.superseded_topic)).test(n(q));
export const NO_AUTHORITY_NOTE = "لا أستطيع إعطاء حكم قاطع في هذه المسألة الآن: لم أعثر في المنصة على نص نافذ حديث (قانون الشراء العام 244/2021 بتعديلاته أو قرارات/مذكرات هيئة الشراء العام) يتناولها، والكتب والملخصات القديمة لا تصلح مرجعًا للحكم. راجع هيئة الشراء العام أو مستشارًا قانونيًا. (لم يُستخدم أي نص قديم لتجنّب حكم خاطئ.)";
/** Policy: a categorical ruling on a procurement topic needs authority text; otherwise the model is not asked at all. */
export const mustRefuseRuling = (q: string, hasAuthority: boolean) => isRulingQuestion(q) && isProcurementTopic(q) && !hasAuthority;

export const RULING_FORMAT = `قاعدة الأسئلة الحكمية (يحق/يجوز/يمنع): ابدأ بـ «الحكم المعتمد (الأحدث النافذ):» ثم اذكر اسم النص وسنته وأنه «قيد المراجعة» إن كان كذلك، ثم الاستثناءات والتحفظات. لا تبدأ بـ «نعم» أو «لا» إلا إذا كان نص حديث مرفق يقرر ذلك صراحة. لا تعتمد على الكتب القديمة للحكم.`;
