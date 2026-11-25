"use client";
import { useState } from "react";
import { BTN_PRIMARY, BTN_SECONDARY, CONTROL, Chip, Explain, Field } from "@/components/simple/kit";
import { MAJORITY_LABEL, PROBLEM_AR, RESULT, VOTE, checkResult, checkVotes, defaultResult, tally, type VoteRow } from "@/lib/votes";

type Rule = { category: string; majority_kind: string | null; verification: string };
const CAT: Record<string, string> = { general: "عام", budget: "موازنة", accounts: "حسابات", planning: "تنظيم مدني/تخطيط", loan: "قرض", transfer: "نقل اعتمادات", tax: "رسوم وضرائب", contract: "عقد/لزمة", property: "أملاك/إيجار", other: "أخرى" };

/** Per-agenda-item vote entry by member. Client-side checks mirror the database constraints (which stay authoritative). */
export default function VotesForm({ action, sessionId, agendaId, total, present, initial, rules, initialCategory, initialResult, initialTieBreak, initialNote }: {
  action: (fd: FormData) => void | Promise<void>; sessionId: string; agendaId: string; total: number | null; present: number | null;
  initial: (VoteRow & { reason?: string | null })[]; rules: Rule[]; initialCategory: string | null; initialResult: string | null; initialTieBreak: boolean; initialNote: string | null;
}) {
  const [rows, setRows] = useState<VoteRow[]>(initial.length ? initial : [{ member: "", vote: "for" }]);
  const [cat, setCat] = useState(initialCategory ?? "");
  const [result, setResult] = useState(initialResult ?? "");
  const [tie, setTie] = useState(initialTieBreak);
  const filled = rows.filter((r) => r.member.trim() || r.reason?.trim());
  const t = tally(filled);
  const problems = [...checkVotes({ total, present }, filled), ...(result ? checkResult(result, t, tie) : [])];
  const rule = rules.find((r) => r.category === cat);
  const set = (i: number, p: Partial<VoteRow>) => setRows((x) => x.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="session" value={sessionId} /><input type="hidden" name="agenda" value={agendaId} />
      <section className="space-y-3"><h3 className="text-base font-bold">١) رأي كل عضو</h3>
        <p className="text-sm text-muted-foreground">اكتبوا اسم العضو واختاروا رأيه. أضيفوا صفًّا لكل عضو.</p>
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-[2fr_1.4fr_auto]">
              <input name="member" value={r.member} onChange={(e) => set(i, { member: e.target.value })} maxLength={200} placeholder="اسم العضو" aria-label="اسم العضو" className={CONTROL} />
              <select name="vote" value={r.vote} onChange={(e) => set(i, { vote: e.target.value })} aria-label="رأي العضو" className={CONTROL}>{Object.entries(VOTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button type="button" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, k) => k !== i) : x))} className={`${BTN_SECONDARY} min-h-12`} aria-label="احذفوا هذا العضو">احذفوا</button>
              {r.vote === "recused"
                ? <input name="reason" value={r.reason ?? ""} onChange={(e) => set(i, { reason: e.target.value })} maxLength={500} placeholder="لماذا تنحّى؟ (مطلوب)" aria-label="سبب التنحي" className={`${CONTROL} sm:col-span-3`} />
                : <input type="hidden" name="reason" value="" />}
            </li>))}
        </ul>
        <button type="button" onClick={() => setRows((x) => [...x, { member: "", vote: "for" }])} className={BTN_SECONDARY}>+ أضيفوا عضوًا</button>
        <p className="flex flex-wrap gap-2"><Chip tone="info">مع {t.for}</Chip><Chip tone="info">ضد {t.against}</Chip><Chip tone="info">امتناع {t.abstain}</Chip><Chip tone="info">متنحٍّ {t.recused}</Chip><Chip tone="info">غائب {t.absent}</Chip></p>
      </section>

      <section className="space-y-3"><h3 className="text-base font-bold">٢) نتيجة البند</h3>
        <Field label="ماذا قرّر المجلس؟" hint="إن تركتموها «تلقائي» يقترح النظام النتيجة من عدد الأصوات، والمجلس هو من يحسمها.">
          <select name="result" value={result} onChange={(e) => setResult(e.target.value)} className={CONTROL}><option value="">تلقائي ({RESULT[defaultResult(t, tie)]})</option>{Object.entries(RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <details className="rounded-xl bg-muted/40 p-3"><summary className="cursor-pointer text-base font-semibold">حقول إضافية: نوع القرار، ترجيح الرئيس، ملاحظة</summary>
          <div className="mt-3 space-y-4">
            <Field label="نوع القرار" hint="يحدّد عدد الأصوات المطلوب لاتخاذه.">
              <select name="category" value={cat} onChange={(e) => setCat(e.target.value)} className={CONTROL}><option value="">غير محدد</option>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <p className="text-sm">الأغلبية المطلوبة لهذا النوع: <b>{MAJORITY_LABEL(rule?.majority_kind, rule?.verification)}</b></p>
            <label className="flex items-start gap-3 text-base font-semibold"><input type="checkbox" name="tie_break" checked={tie} onChange={(e) => setTie(e.target.checked)} className="mt-1 size-6" />تعادلت الأصوات فحسمها الرئيس بصوته</label>
            <Explain term="ترجيح الرئيس">عند تعادل الأصوات قد يكون لصوت الرئيس أثر مرجِّح (المادة 42). هذا الحكم يحتاج تأكيدًا من مختص قانوني قبل الاعتماد عليه.</Explain>
            <Field label="ملاحظة على النتيجة" hint="اختيارية."><input name="note" defaultValue={initialNote ?? ""} maxLength={1000} className={CONTROL} /></Field>
          </div>
        </details>
      </section>

      {problems.length > 0 && <ul role="alert" className="space-y-1 rounded-2xl border-2 border-destructive/50 p-4 text-base text-destructive">{problems.map((p) => <li key={p}>{PROBLEM_AR[p]}</li>)}</ul>}
      <button disabled={problems.length > 0} className={`${BTN_PRIMARY} disabled:opacity-50`}>احفظوا التصويت</button>
    </form>
  );
}
