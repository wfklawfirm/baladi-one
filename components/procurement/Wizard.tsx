"use client";
import { useEffect, useMemo, useState } from "react";
import { METHOD } from "@/lib/council";
import { recommendMethod, type Threshold } from "@/lib/procurement";
import { addPlanItem } from "@/app/staff/projects/procurement/actions";

type S = { kind: string; title: string; need: string; dept: string; qty: string; due: string; value: string; currency: string; basis: string; related: string; funded: string; line: string; funding_note: string; inPlan: string; exceptional: boolean; urgent: boolean; competition: string; technical: string };
const EMPTY: S = { kind: "", title: "", need: "", dept: "", qty: "", due: "", value: "", currency: "USD", basis: "", related: "", funded: "", line: "", funding_note: "", inPlan: "", exceptional: false, urgent: false, competition: "", technical: "" };
const KINDS = ["لوازم", "أشغال", "خدمات", "خدمات استشارية"];
const KEY = "baladi-proc-wizard-v1";
const fld = "min-h-12 w-full rounded-xl border-2 bg-background px-3";
const words = (s: string) => new Set(s.split(/\s+/).filter((w) => w.length > 2));

/** Four-step guided purchase wizard. Answers autosave in this browser; the last step only records a plan item through the existing audited RPC. It never decides anything. */
export default function Wizard({ thresholds, today, year, lines, plan }: { thresholds: Threshold[]; today: string; year: number; lines: { id: string; code: string; title_ar: string }[]; plan: { id: string; title: string; estimated_value: number; currency: string }[] }) {
  const [step, setStep] = useState(1); const [s, setS] = useState<S>(EMPTY); const [ready, setReady] = useState(false);
  useEffect(() => { try { const r = localStorage.getItem(KEY); if (r) setS({ ...EMPTY, ...JSON.parse(r) }); } catch {} setReady(true); }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }, [s, ready]);
  const up = <K extends keyof S>(k: K, v: S[K]) => setS((p) => ({ ...p, [k]: v }));
  const value = Number(s.value.replace(/[,\s]/g, ""));
  const valueOk = s.value.trim() !== "" && Number.isFinite(value) && value >= 0;
  const similar = useMemo(() => { const w = words(s.title + " " + s.need); return plan.filter((p) => [...words(p.title)].some((x) => w.has(x))); }, [plan, s.title, s.need]);
  const rec = useMemo(() => (valueOk ? recommendMethod(value, s.currency, thresholds, today) : null), [valueOk, value, s.currency, thresholds, today]);
  const ok1 = !!s.kind && s.title.trim().length > 2, ok2 = valueOk && s.related !== "", ok3 = s.funded !== "" && s.inPlan !== "";
  const next = step === 1 ? ok1 : step === 2 ? ok2 : step === 3 ? ok3 : false;
  const needText = [`النوع: ${s.kind}`, s.need, s.dept && `القسم المستفيد: ${s.dept}`, s.qty && `الكمية: ${s.qty}`, s.due && `الموعد المطلوب: ${s.due}`, s.basis && `أساس التقدير: ${s.basis}`].filter(Boolean).join("\n");
  const fundNote = [s.funded === "yes" ? "اعتماد متوفر بحسب المستخدم" : s.funded === "no" ? "لا اعتماد بعد" : "الاعتماد غير مؤكد", s.funding_note, s.inPlan === "yes" ? "مدرج في الخطة" : s.inPlan === "no" ? "غير مدرج في الخطة" : "", s.exceptional ? "ظروف استثنائية (تحتاج توثيقًا)" : "", s.urgent ? "حاجة ملحّة (لا تكفي وحدها)" : ""].filter(Boolean).join(" · ");
  const Step = (n: number, t: string) => <li aria-current={step === n ? "step" : undefined} className={`flex-1 rounded-full border px-2 py-2 text-center text-sm ${step === n ? "bg-primary font-bold text-primary-foreground" : n < step ? "bg-accent text-primary" : "text-muted-foreground"}`}>{n}. {t}</li>;
  return (
    <div className="space-y-4">
      <ol className="flex gap-2">{Step(1, "الحاجة")}{Step(2, "القيمة")}{Step(3, "التمويل")}{Step(4, "المسار")}</ol>
      <p className="text-sm text-muted-foreground">تُحفظ إجاباتكم تلقائيًا في هذا المتصفح فلا تُعاد كتابتها.</p>
      {step === 1 && <section className="space-y-3 rounded-2xl border p-4"><h2 className="text-lg font-bold">ماذا تريد أن تشتري؟</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع الشراء">{KINDS.map((k) => <button type="button" role="radio" aria-checked={s.kind === k} key={k} onClick={() => up("kind", k)} className={`min-h-16 rounded-2xl border-2 text-base font-bold ${s.kind === k ? "border-primary bg-primary text-primary-foreground" : ""}`}>{k}</button>)}</div>
        <label className="block space-y-1 text-sm">موضوع الشراء<input value={s.title} onChange={(e) => up("title", e.target.value)} maxLength={300} className={fld} /></label>
        <label className="block space-y-1 text-sm">وصف الحاجة<textarea value={s.need} onChange={(e) => up("need", e.target.value)} rows={3} maxLength={2000} className="w-full rounded-xl border-2 bg-background p-3" /></label>
        <div className="grid gap-2 sm:grid-cols-3"><label className="space-y-1 text-sm">القسم المستفيد<input value={s.dept} onChange={(e) => up("dept", e.target.value)} className={fld} /></label>
          <label className="space-y-1 text-sm">الكمية<input value={s.qty} onChange={(e) => up("qty", e.target.value)} className={fld} /></label>
          <label className="space-y-1 text-sm">الموعد المطلوب<input type="date" value={s.due} onChange={(e) => up("due", e.target.value)} className={fld} /></label></div>
      </section>}
      {step === 2 && <section className="space-y-3 rounded-2xl border p-4"><h2 className="text-lg font-bold">ما القيمة التقديرية؟</h2>
        <div className="grid grid-cols-3 gap-2"><label className="col-span-2 space-y-1 text-sm">القيمة الإجمالية التقديرية<input inputMode="decimal" value={s.value} onChange={(e) => up("value", e.target.value)} className={fld} /></label>
          <label className="space-y-1 text-sm">العملة<select value={s.currency} onChange={(e) => up("currency", e.target.value)} className={fld}><option value="USD">دولار</option><option value="LBP">ليرة</option></select></label></div>
        <label className="block space-y-1 text-sm">أساس التقدير (دراسة سوق، عروض استرشادية…)<input value={s.basis} onChange={(e) => up("basis", e.target.value)} className={fld} /></label>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">هل توجد مشتريات أخرى مرتبطة بهذه الحاجة؟</legend>
          <div className="flex gap-2">{[["yes", "نعم"], ["no", "لا"], ["unknown", "لا أعرف"]].map(([v, l]) => <button type="button" key={v} aria-pressed={s.related === v} onClick={() => up("related", v)} className={`min-h-12 flex-1 rounded-xl border-2 font-semibold ${s.related === v ? "border-primary bg-accent text-primary" : ""}`}>{l}</button>)}</div>
          {(s.related === "unknown" || s.related === "yes") && <div className="rounded-xl bg-muted p-3 text-sm">{similar.length ? <><p className="font-semibold">بنود في خطة {year} قد تكون مرتبطة (مطابقة كلمات فقط، تحقّقوا منها):</p><ul className="list-disc pr-5">{similar.map((p) => <li key={p.id}>{p.title} — {Number(p.estimated_value).toLocaleString("en-US")} {p.currency}</li>)}</ul></> : "لم نجد في الخطة بنودًا متشابهة بالعنوان. هذا لا يثبت عدم وجود ارتباط؛ راجعوا المشتريات السابقة."}</div>}</fieldset>
      </section>}
      {step === 3 && <section className="space-y-3 rounded-2xl border p-4"><h2 className="text-lg font-bold">التمويل وظروف الشراء</h2>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">هل يوجد اعتماد مالي؟</legend><div className="flex gap-2">{[["yes", "نعم"], ["no", "لا"], ["unknown", "لا أعرف"]].map(([v, l]) => <button type="button" key={v} aria-pressed={s.funded === v} onClick={() => up("funded", v)} className={`min-h-12 flex-1 rounded-xl border-2 font-semibold ${s.funded === v ? "border-primary bg-accent text-primary" : ""}`}>{l}</button>)}</div></fieldset>
        <label className="block space-y-1 text-sm">بند الموازنة<select value={s.line} onChange={(e) => up("line", e.target.value)} className={fld}><option value="">غير مربوط</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.title_ar}</option>)}</select></label>
        <label className="block space-y-1 text-sm">مصدر التمويل<input value={s.funding_note} onChange={(e) => up("funding_note", e.target.value)} className={fld} /></label>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">هل الشراء مدرج في خطة الشراء؟</legend><div className="flex gap-2">{[["yes", "نعم"], ["no", "لا"], ["unknown", "لا أعرف"]].map(([v, l]) => <button type="button" key={v} aria-pressed={s.inPlan === v} onClick={() => up("inPlan", v)} className={`min-h-12 flex-1 rounded-xl border-2 font-semibold ${s.inPlan === v ? "border-primary bg-accent text-primary" : ""}`}>{l}</button>)}</div></fieldset>
        <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" checked={s.exceptional} onChange={(e) => up("exceptional", e.target.checked)} className="size-5" />توجد ظروف استثنائية</label>
        <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" checked={s.urgent} onChange={(e) => up("urgent", e.target.checked)} className="size-5" />توجد حاجة ملحّة</label>
        {s.urgent && <p className="rounded-xl bg-muted p-3 text-sm">الحاجة الملحّة وحدها لا تبرّر الاتفاق الرضائي؛ يلزم توثيق الشروط القانونية والواقعية.</p>}
        <div className="grid gap-2 sm:grid-cols-2"><label className="space-y-1 text-sm">هل تتوافر منافسة فعلية؟<select value={s.competition} onChange={(e) => up("competition", e.target.value)} className={fld}><option value="">—</option><option value="yes">نعم</option><option value="no">لا</option><option value="unknown">لا أعرف</option></select></label>
          <label className="space-y-1 text-sm">متطلبات فنية خاصة؟<select value={s.technical} onChange={(e) => up("technical", e.target.value)} className={fld}><option value="">—</option><option value="yes">نعم</option><option value="no">لا</option></select></label></div>
      </section>}
      {step === 4 && <section className="space-y-3 rounded-2xl border p-4"><h2 className="text-lg font-bold">المسار القانوني المقترح</h2>
        {rec?.status === "matched" ? <div className="space-y-2 text-sm"><p className="font-semibold">{rec.message}</p><ul className="list-disc space-y-1 pr-5">{rec.methods.map((m) => <li key={m.method}><b>{m.label}</b>{m.note ? ` — ${m.note}` : ""} <span className="text-muted-foreground">(المصدر: {m.source})</span></li>)}</ul></div>
          : <div role="status" className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">نحتاج إلى استكمال المعلومات التالية لتحديد المسار.</p><p>{rec?.message ?? "أدخلوا القيمة التقديرية."}</p><p>يتطلب تحققًا قانونيًا: لا يعرض النظام طريقة شراء أو اختصاصًا أو تصديقًا قبل تحميل سقوف نافذة متحقَّق منها.</p></div>}
        <dl className="grid gap-1 rounded-xl bg-muted p-3 text-sm"><div><dt className="inline font-semibold">الشراء: </dt><dd className="inline">{s.kind} — {s.title}</dd></div><div><dt className="inline font-semibold">القيمة: </dt><dd className="inline">{valueOk ? `${value.toLocaleString("en-US")} ${s.currency === "LBP" ? "ل.ل." : "$"}` : "—"}</dd></div><div><dt className="inline font-semibold">التمويل: </dt><dd className="inline">{fundNote}</dd></div></dl>
        <p className="text-sm text-muted-foreground">الاختصاص والتصديق والمهل والمستندات تُحدَّد بعد تحميل القواعد المتحقَّق منها. النظام يقترح فقط، والاعتماد لدى صاحب الاختصاص.</p>
        <form action={addPlanItem} className="space-y-2">
          <input type="hidden" name="title" value={s.title} /><input type="hidden" name="year" value={year} /><input type="hidden" name="need" value={needText} />
          <input type="hidden" name="value" value={valueOk ? String(value) : ""} /><input type="hidden" name="currency" value={s.currency} /><input type="hidden" name="method" value="" />
          <input type="hidden" name="budget_line" value={s.line} /><input type="hidden" name="funding_note" value={fundNote} /><input type="hidden" name="responsible" value={s.dept} />
          <button onClick={() => { try { localStorage.removeItem(KEY); } catch {} }} disabled={!valueOk || !ok1} className="min-h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-40">سجّل الحاجة في خطة الشراء</button>
          <p className="text-xs text-muted-foreground">يُنشئ بندًا في خطة الشراء السنوية فقط، دون اختيار طريقة ولا إطلاق إجراء رسمي.</p></form>
      </section>}
      <div className="flex gap-2">{step > 1 && <button type="button" onClick={() => setStep(step - 1)} className="min-h-12 flex-1 rounded-xl border-2 font-semibold">رجوع</button>}
        {step < 4 && <button type="button" disabled={!next} onClick={() => setStep(step + 1)} className="min-h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-40">متابعة</button>}</div>
      {step === 4 && <button type="button" onClick={() => { setS(EMPTY); setStep(1); try { localStorage.removeItem(KEY); } catch {} }} className="text-sm text-muted-foreground underline">بدء شراء آخر ومسح المسودة</button>}
    </div>
  );
}
