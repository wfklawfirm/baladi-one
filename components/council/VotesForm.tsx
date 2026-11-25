"use client";
import { useState } from "react";
import { MAJORITY_LABEL, PROBLEM_AR, RESULT, VOTE, checkResult, checkVotes, defaultResult, tally, type VoteRow } from "@/lib/votes";

type Rule = { category: string; majority_kind: string | null; verification: string };
const CAT: Record<string, string> = { general: "عام", budget: "موازنة", accounts: "حسابات", planning: "تنظيم مدني/تخطيط", loan: "قرض", transfer: "نقل اعتمادات", tax: "رسوم وضرائب", contract: "عقد/لزمة", property: "أملاك/إيجار", other: "أخرى" };
const field = "min-h-11 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

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
    <form action={action} className="space-y-3">
      <input type="hidden" name="session" value={sessionId} /><input type="hidden" name="agenda" value={agendaId} />
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[2fr_1.2fr_2fr_auto]">
            <input name="member" value={r.member} onChange={(e) => set(i, { member: e.target.value })} maxLength={200} placeholder="اسم العضو" aria-label="اسم العضو" className={field} />
            <select name="vote" value={r.vote} onChange={(e) => set(i, { vote: e.target.value })} aria-label="التصويت" className={field}>{Object.entries(VOTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="reason" value={r.reason ?? ""} onChange={(e) => set(i, { reason: e.target.value })} maxLength={500} placeholder={r.vote === "recused" ? "سبب التنحي (مطلوب)" : "ملاحظة (للتنحي فقط)"} aria-label="سبب التنحي" disabled={r.vote !== "recused"} className={`${field} disabled:opacity-40`} />
            <button type="button" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, k) => k !== i) : x))} className="min-h-11 rounded-xl border px-3 text-sm active:bg-muted" aria-label="حذف الصف">حذف</button>
          </li>))}
      </ul>
      <button type="button" onClick={() => setRows((x) => [...x, { member: "", vote: "for" }])} className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">+ عضو</button>
      <p className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-3 py-1">مع {t.for}</span><span className="rounded-full bg-muted px-3 py-1">ضد {t.against}</span><span className="rounded-full bg-muted px-3 py-1">امتناع {t.abstain}</span><span className="rounded-full bg-muted px-3 py-1">متنحٍّ {t.recused}</span><span className="rounded-full bg-muted px-3 py-1">غائب {t.absent}</span><span className="rounded-full bg-accent px-3 py-1 font-bold text-primary">الحاضرون في البند {t.present}{present !== null ? ` / ${present} مسجَّل للجلسة` : ""}{total !== null ? ` · الأعضاء ${total}` : ""}</span></p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">نوع القرار (للأغلبية المطلوبة)
          <select name="category" value={cat} onChange={(e) => setCat(e.target.value)} className={field}><option value="">غير محدد</option>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="space-y-1 text-sm font-medium">النتيجة المعلنة
          <select name="result" value={result} onChange={(e) => setResult(e.target.value)} className={field}><option value="">تلقائي ({RESULT[defaultResult(t, tie)]})</option>{Object.entries(RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="flex items-end gap-2 pb-3 text-sm font-medium"><input type="checkbox" name="tie_break" checked={tie} onChange={(e) => setTie(e.target.checked)} className="size-5" />حُسم التعادل بترجيح الرئيس (م.42 — يلزم تحقق)</label>
      </div>
      <p className="text-xs text-muted-foreground">الأغلبية المطلوبة: <b>{MAJORITY_LABEL(rule?.majority_kind, rule?.verification)}</b>. لا يحتسب النظام اتخاذ القرار تلقائيًا؛ النتيجة المعلنة يحسمها المجلس ويسجّلها المختص.</p>
      <input name="note" defaultValue={initialNote ?? ""} maxLength={1000} placeholder="ملاحظة على النتيجة (اختياري)" aria-label="ملاحظة" className={field} />
      {problems.length > 0 && <ul role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{problems.map((p) => <li key={p}>{PROBLEM_AR[p]}</li>)}</ul>}
      <button disabled={problems.length > 0} className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50 active:opacity-90">حفظ التصويت</button>
    </form>
  );
}
