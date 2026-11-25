/** Context for the AI copilot: picks relevant rows of the legal_rule registry and builds the prompt block that constrains how they may be used. Pure (testable); the route does the I/O. */
export type RuleCtx = { rule_id: string; instrument: string; instrument_no: string | null; article: string | null; topic: string; summary_ar: string; conditions_ar: string | null; exceptions_ar: string | null; deadline_ar: string | null; required_docs_ar: string | null; enforcement: string; review_status: string; original_text_loaded: boolean; workflow: string | null };

const norm = (t: string) => t.replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, "").replace(/\u0640/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
const WORKFLOW_KEYS: Record<string, string[]> = {
  council: ["جلسه", "جلسات", "مجلس", "نصاب", "دعوه", "محضر", "تصويت", "اصوات", "جدول اعمال", "اجتماع"],
  decisions: ["قرار", "تصديق", "مصدق", "سلطه الرقابه", "قائمقام", "محافظ", "ديوان المحاسبه", "نفاذ", "ارسال", "مهله", "موازنه", "نقل اعتمادات", "قرض", "تنظيم مدني", "رسوم", "ضريبه"],
  waste: ["نفايات", "نفايه", "كنس", "رسم جمع", "رسم النفايات", "الرسم البيئي", "80/2018", "38/2026", "استرداد الكلفه", "طمر", "فرز", "مكب", "نظافه"],
  procurement: ["عقد", "مناقصه", "شراء", "تلزيم", "لزمه", "تجميد", "اعتراض", "عرض", "استدراج", "رضائي", "دفتر شروط", "مورد", "متعهد", "244", "تعديل قيمه", "صرف", "دفع", "فاتوره"],
};
const PATH_WORKFLOW: [string, string[]][] = [["/staff/council", ["council", "decisions"]], ["/staff/projects", ["procurement"]], ["/staff/finance", ["decisions", "procurement"]], ["/staff/revenue", ["waste"]], ["/staff/legal", ["council", "decisions", "procurement", "waste"]]];
const GENERIC = ["قانون", "قانوني", "مادة", "المادة", "يجوز", "هل يحق", "مرسوم", "اجراء", "اجراءات", "مخالفه", "صلاحيه", "اختصاص", "مالي", "ماليه", "ميزانيه"].map(norm);

/** Legal, financial or procedural question? Operational/number questions (KPIs) are left untouched. */
export function isLegalQuestion(query: string, path?: string): boolean {
  const q = norm(query);
  if (Object.values(WORKFLOW_KEYS).some((ks) => ks.some((k) => q.includes(k)))) return true;
  if (GENERIC.some((k) => q.includes(k))) return true;
  return !!path && PATH_WORKFLOW.some(([p]) => path.startsWith(p)) && /\?|؟|هل|كيف|ما |متى|كم/.test(query);
}

export function workflowsFor(query: string, path?: string): string[] {
  const q = norm(query), out = new Set<string>();
  for (const [w, ks] of Object.entries(WORKFLOW_KEYS)) if (ks.some((k) => q.includes(k))) out.add(w);
  if (path) for (const [p, ws] of PATH_WORKFLOW) if (path.startsWith(p)) ws.forEach((w) => out.add(w));
  return [...out];
}

/** Ranks rules: workflow match, then article number / topic words present in the question. Returns at most `max`. */
export function selectRules(query: string, rules: RuleCtx[], path?: string, max = 8): RuleCtx[] {
  const q = norm(query), ws = workflowsFor(query, path);
  const words = q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  const nums = q.match(/\d{2,4}/g) ?? [];
  const scored = rules.map((r) => {
    let s = r.workflow && ws.includes(r.workflow) ? 2 : 0;
    const topic = norm(`${r.topic} ${r.summary_ar}`);
    s += Math.min(3, words.filter((w) => topic.includes(w)).length);
    if (r.article && nums.some((n) => (r.article ?? "").includes(n))) s += 3;
    if (r.instrument_no && nums.some((n) => (r.instrument_no ?? "").includes(n))) s += 1;
    return { r, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.r.rule_id.localeCompare(b.r.rule_id));
  return scored.slice(0, max).map((x) => x.r);
}

const REVIEW_AR: Record<string, string> = { verified: "مراجَع قانونيًا", pending_review: "بانتظار المراجعة القانونية", superseded: "معدَّل/مستبدل", repealed: "ملغى", not_applicable: "غير منطبق" };
const field = (l: string, v: string | null) => (v ? `\n  ${l}: ${v}` : "");

/** The block added to the system prompt for legal/financial/procedural questions. */
export function buildLegalPrompt(rules: RuleCtx[] | null): string {
  const head = `=== سجل القواعد القانونية (مصدر داخلي للنظام) ===
قواعد الاستخدام الإلزامية:
1) لا تقتبس إلا نصًا وارد حرفيًا في المصادر المقدّمة في هذه الرسالة. ما يلي هو «ملخص» وليس النص الأصلي للمادة ما لم يُذكر أن النص الأصلي محمَّل.
2) افصل في إجابتك بين ثلاثة أقسام بعناوين صريحة: «وقائع متحقَّق منها» (ما ورد في المصادر أو بيانات النظام فقط)، «تفسير» (استنتاجك، ويُوسَم بأنه اجتهاد)، «توصية» (اقتراح إجراء).
3) إن كان النص الأصلي غير محمَّل أو كانت حالة القاعدة «بانتظار المراجعة القانونية» فقل ذلك صراحة، ولا تعامل القاعدة كمؤكَّدة. وإن لم تجد قاعدة ذات صلة فقل إن النص غير محمَّل ولا تخمّن رقم مادة أو مهلة أو سقفًا ماليًا.
4) أنت لا تعتمد ولا توقّع ولا تدفع ولا تنشر ولا تُصدر قرارًا ولا تغيّر حالة أي سجل: تصيغ مسودات وتقترح فقط، والقرار والتوقيع والاعتماد لأصحاب الصلاحية من البشر.`;
  if (!rules) return `${head}\nسجل القواعد غير متاح الآن: لا قواعد محمَّلة، فاعتبر كل ما تذكره غير مؤكَّد ونبّه إلى مراجعة النص الرسمي.`;
  if (rules.length === 0) return `${head}\nلم تُسترجع قواعد ذات صلة بهذا السؤال من السجل: لا نص محمَّل للاستناد إليه.`;
  const body = rules.map((r, i) => `[ق${i + 1}] ${r.rule_id} — ${r.topic} (${r.instrument} ${r.instrument_no ?? ""}${r.article ? ` م.${r.article}` : ""})
  حالة المراجعة: ${REVIEW_AR[r.review_status] ?? r.review_status} · النص الأصلي: ${r.original_text_loaded ? "محمَّل" : "غير محمَّل"} · الإنفاذ: ${r.enforcement}
  الملخص: ${r.summary_ar}${field("الشروط", r.conditions_ar)}${field("الاستثناءات", r.exceptions_ar)}${field("المهلة", r.deadline_ar)}${field("المستندات", r.required_docs_ar)}`).join("\n");
  return `${head}\n\nالقواعد المسترجعة (${rules.length}):\n${body}`;
}
