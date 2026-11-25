"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import DecisionDoc from "./DecisionDoc";
import ShareButton from "./ShareButton";
import { adoptBuilder, saveBuilder } from "@/app/staff/decisions/actions";
import { defaultRecitals, effectSuggestion, mergeRecitals, notificationSuggestion, verifiedRecitalList, type RefView, type RuleLite } from "@/lib/decisions/engine";
import { missingRequired } from "@/lib/decisions/data";
import { renderDecision } from "@/lib/decisions/render";
import { ENGINE_KEYS, RECITAL_KINDS, isAutoKey, labelOf, type DraftData, type Recital, type RecitalKind, type TemplateContent } from "@/lib/decisions/model";

type Meta = { category: string; level: string; issuer: string; categoryLabel: string; levelLabel: string; decidedOn: string | null };
const inp = "min-h-11 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
const AI: [string, string][] = [["improve", "تحسين الصياغة"], ["recitals", "اقتراح حيثيات"], ["legal_basis", "مراجعة الأساس القانوني"], ["competence", "التحقق من الاختصاص"], ["documents", "اقتراح مستندات"], ["conflicts", "كشف التعارض"], ["effect", "مراجعة شروط النفاذ"], ["compare", "مقارنة بقرارات سابقة"]];
const BADGE = { verified: "bg-green-100 text-green-900", pending: "bg-amber-100 text-amber-900", unmatched: "bg-red-100 text-red-900" } as const;
const BADGE_T = { verified: "متحقق منه", pending: "بانتظار تحقق المحامي", unmatched: "غير موجود في سجل القواعد" } as const;

export default function DecisionEditor({ id, initialTitle, snap, initial, refs, rules, canEdit, aiOn, meta, logo }: { logo: string | null; id: string; initialTitle: string; snap: TemplateContent; initial: DraftData; refs: RefView[]; rules: RuleLite[]; canEdit: boolean; aiOn: boolean; meta: Meta }) {
  const [title, setTitle] = useState(initialTitle);
  const [data, setData] = useState<DraftData>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [date, setDate] = useState(meta.decidedOn ?? "");
  const [ai, setAi] = useState<{ answer?: string; sources?: { title: string; preview: string; domain: string }[]; error?: string; busy?: boolean; action?: string } | null>(null);
  const [aiText, setAiText] = useState("");

  const set = (patch: Partial<DraftData>) => { setData((d) => ({ ...d, ...patch })); setDirty(true); };
  const withRecitals = (rs: Recital[]) => ({ recitals: rs, verified_legal_recitals: verifiedRecitalList(rs) });
  const toggleRef = (r: RefView) => {
    const sel = data.selected_refs ?? [];
    const on = sel.some((s) => s.source_id === r.source_id && s.article === r.article);
    const next = on ? sel.filter((s) => !(s.source_id === r.source_id && s.article === r.article)) : [...sel, { source_id: r.source_id, article: r.article }];
    const fresh = defaultRecitals(snap, refs, next);
    set({ selected_refs: next, ...withRecitals(mergeRecitals((data.recitals ?? []).filter((x) => x.origin !== "legal" || next.some((s) => x.id === `law:${s.source_id}:${s.article}`)), fresh)) });
  };
  const rec = (i: number, p: Partial<Recital>) => { const rs = (data.recitals ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)); set(withRecitals(rs)); };
  const clauses = data.clauses ?? [];
  const setClause = (i: number, p: Partial<{ text: string; include: boolean }>) => set({ clauses: clauses.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= clauses.length) return; const a = [...clauses]; [a[i], a[j]] = [a[j], a[i]]; set({ clauses: a }); };

  const eff = useMemo(() => effectSuggestion({ category: meta.category, level: meta.level, issuer: meta.issuer }, rules), [meta, rules]);
  const note = useMemo(() => notificationSuggestion({ issuer: meta.issuer, level: meta.level }, rules), [meta, rules]);
  const view = useMemo(() => renderDecision({ snap, data, title, mode: "draft", logo }), [snap, data, title, logo]);
  const missing = missingRequired(snap, data);
  const unverified = (data.recitals ?? []).filter((r) => r.included && r.ref && !r.ref.verified).length;

  const save = () => start(async () => { const r = await saveBuilder(id, title, data); setMsg({ ok: r.ok, t: r.ok ? `حُفظت المسودة (نسخة ${r.rev}).` : r.error ?? "تعذّر الحفظ." }); if (r.ok) setDirty(false); });
  const adopt = () => start(async () => {
    if (dirty) { const s = await saveBuilder(id, title, data); if (!s.ok) { setMsg({ ok: false, t: s.error ?? "تعذّر الحفظ." }); return; } setDirty(false); }
    const r = await adoptBuilder(id, date); setMsg({ ok: r.ok, t: r.ok ? "اتُّخذ القرار وسُجّل. صدر ملف الاتخاذ؛ تابع التصديق في ملف القرار." : r.error ?? "تعذّر الاعتماد." }); if (r.ok) location.reload();
  });
  const run = async (action: string) => {
    setAi({ busy: true, action });
    try { const res = await fetch("/api/decisions/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action, text: aiText }) }); const j = await res.json(); setAi(res.ok ? { answer: j.answer, sources: j.sources, action } : { error: j.error ?? "تعذّر", action }); } catch { setAi({ error: "تعذّر الاتصال", action }); }
  };

  const fields = snap.fields.filter((f) => !ENGINE_KEYS.has(f.key) && !isAutoKey(f.key));
  const autos = snap.fields.filter((f) => isAutoKey(f.key) && f.key !== "verified_legal_recitals");
  const att = data.attachments ?? (snap.supporting_documents_ar ?? []).map((text) => ({ text, ready: false }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">موضوع القرار</h2>
          <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} disabled={!canEdit} aria-label="الموضوع" className={inp} />
          <p className="text-xs text-muted-foreground">{meta.categoryLabel} · {meta.levelLabel}</p></section>

        <section className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold">الحقول</h2>
          {autos.length > 0 && <div className="flex flex-wrap gap-2 text-xs">{autos.map((f) => { const v = (data as Record<string, unknown>)[f.key]; return <span key={f.key} className={`rounded-full border px-2.5 py-1 ${v ? "" : "border-amber-400 bg-amber-50"}`}><b>{labelOf(f.key)}:</b> {v ? String(v) : "غير مسجّل في السجلات"}</span>; })}</div>}
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => {
              const v = (data as Record<string, unknown>)[f.key];
              const lbl = <span className="text-sm font-medium">{labelOf(f.key)}{f.required_for_finalization && <b className="text-destructive"> *</b>}</span>;
              if (f.type === "structured_list") return <label key={f.key} className="md:col-span-2">{lbl}<textarea disabled={!canEdit} rows={3} value={Array.isArray(v) ? (v as string[]).join("\n") : ""} onChange={(e) => set({ [f.key]: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} placeholder="عنصر في كل سطر" className={`${inp} py-2`} /></label>;
              return <label key={f.key}>{lbl}<input disabled={!canEdit} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "decimal" || f.type === "integer" ? "decimal" : undefined} value={typeof v === "string" || typeof v === "number" ? String(v) : ""} onChange={(e) => set({ [f.key]: e.target.value })} className={inp} /></label>;
            })}
          </div></section>

        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">المراجع القانونية</h2>
          <p className="text-xs text-muted-foreground">لا يدخل المرجع في الصيغة الرسمية إلا إذا طابق قاعدة «متحقق منها» في سجل القواعد بالمادة نفسها. الأرقام مأخوذة من القالب كمرشّحات ولم يتحقق منها النظام.</p>
          <ul className="space-y-2">{refs.map((r) => { const on = (data.selected_refs ?? []).some((s) => s.source_id === r.source_id && s.article === r.article);
            return <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
              {r.eligible ? <input type="checkbox" disabled={!canEdit} checked={on} onChange={() => toggleRef(r)} aria-label={r.title} className="size-5" /> : <span className="w-5" />}
              <span className="min-w-0 flex-1">{r.title}{r.article && <b> — المادة {r.article}</b>}{r.heading && <span className="text-xs text-muted-foreground"> ({r.heading})</span>}</span>
              {r.eligible ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[r.status]}`}>{BADGE_T[r.status]}</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">للاستئناس فقط (نموذج/تعميم)</span>}
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">المصدر</a>}</li>; })}</ul></section>

        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">الحيثيات</h2>
          <ol className="space-y-2">{(data.recitals ?? []).map((r, i) => (
            <li key={r.id} className={`space-y-1 rounded-xl border p-2 ${r.included ? "" : "opacity-50"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input type="checkbox" disabled={!canEdit} checked={r.included} onChange={(e) => rec(i, { included: e.target.checked })} aria-label="إدراج" className="size-5" />
                <select disabled={!canEdit} value={r.kind} onChange={(e) => rec(i, { kind: e.target.value as RecitalKind })} className="min-h-9 rounded-lg border px-1">{Object.entries(RECITAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                {r.ref && <span className={`rounded-full px-2 py-0.5 font-bold ${r.ref.verified ? BADGE.verified : BADGE.pending}`}>{r.ref.verified ? "متحقق منه" : "غير متحقق منه"}</span>}
                {r.origin === "ai" && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">اقتراح المساعد</span>}
                {r.origin === "custom" || r.origin === "ai" ? <button disabled={!canEdit} type="button" onClick={() => set(withRecitals((data.recitals ?? []).filter((_, j) => j !== i)))} className="ms-auto text-destructive underline">حذف</button> : null}
              </div>
              <textarea disabled={!canEdit || !!r.ref} rows={2} value={r.text} onChange={(e) => rec(i, { text: e.target.value })} className={`${inp} py-2`} /></li>))}</ol>
          {canEdit && <button type="button" onClick={() => set(withRecitals([...(data.recitals ?? []), { id: `c:${Date.now()}`, kind: "whereas", text: "", included: true, origin: "custom" }]))} className="min-h-10 rounded-xl border px-3 text-sm">+ حيثية</button>}</section>

        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">المنطوق (المواد)</h2>
          <ol className="space-y-2">{clauses.map((c, i) => <li key={i} className={`space-y-1 rounded-xl border p-2 ${c.include === false ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!canEdit} checked={c.include !== false} onChange={(e) => setClause(i, { include: e.target.checked })} aria-label="إدراج" className="size-5" /><b>مادة {i + 1}</b>
              {canEdit && <><button type="button" onClick={() => move(i, -1)} className="underline">أعلى</button><button type="button" onClick={() => move(i, 1)} className="underline">أسفل</button><button type="button" onClick={() => set({ clauses: clauses.filter((_, j) => j !== i) })} className="ms-auto text-destructive underline">حذف</button></>}</div>
            <textarea disabled={!canEdit} rows={2} value={c.text} onChange={(e) => setClause(i, { text: e.target.value })} className={`${inp} py-2`} /></li>)}</ol>
          {canEdit && <button type="button" onClick={() => set({ clauses: [...clauses, { text: "", custom: true }] })} className="min-h-10 rounded-xl border px-3 text-sm">+ مادة</button>}</section>

        <section className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold">النفاذ والتبليغ</h2>
          {([["effective_clause", "صيغة النفاذ", eff], ["notification_clause", "صيغة التبليغ والنشر", note]] as const).map(([k, l, s]) => (
            <div key={k} className="space-y-1"><b className="text-sm">{l}</b>
              <p className="text-xs text-muted-foreground">المقترح: {s.text}</p>
              <p className={`text-xs ${s.verified ? "text-green-800" : "text-amber-800"}`}>{s.verified ? "مستندة إلى قاعدة متحقق منها: " : "القاعدة غير متحقق منها بعد (" }{s.basis.join("، ") || "لا قاعدة"}{s.verified ? "" : ") — " }{s.note}</p>
              <textarea disabled={!canEdit} rows={2} value={String((data as Record<string, unknown>)[k] ?? "")} onChange={(e) => set({ [k]: e.target.value })} className={`${inp} py-2`} placeholder="فارغة: لا تُضاف أي صيغة نفاذ افتراضية" />
              {canEdit && <button type="button" onClick={() => set({ [k]: s.text })} className="min-h-9 rounded-lg border px-3 text-xs">استخدم المقترح</button>}</div>))}</section>

        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">المرفقات والتحقق قبل الاعتماد</h2>
          <ul className="space-y-1 text-sm">{att.map((a, i) => <li key={i} className="flex items-center gap-2"><input type="checkbox" disabled={!canEdit} checked={!!a.ready} onChange={(e) => set({ attachments: att.map((x, j) => (j === i ? { ...x, ready: e.target.checked } : x)) })} className="size-5" aria-label={a.text} />{a.text}</li>)}</ul>
          {(snap.validation_checks_ar ?? []).length > 0 && <><b className="text-sm">قائمة التحقق:</b><ul className="list-disc space-y-0.5 pe-5 text-sm">{snap.validation_checks_ar!.map((c, i) => <li key={i}>{c}</li>)}</ul></>}</section>
      </div>

      <div className="space-y-4 xl:sticky xl:top-2 xl:self-start">
        <section className="space-y-2 rounded-2xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && <button type="button" onClick={save} disabled={pending} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{pending ? "..." : "حفظ المسودة"}</button>}
            <Link href={`/staff/decisions/${id}/print`} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm">طباعة A4 / PDF</Link>
            <a href={`/api/decisions/${id}/docx`} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm">Word</a>
            <ShareButton id={id} title={title} />
            {!canEdit && <Link href={`/staff/decisions/${id}/print?mode=official`} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm">النسخة الرسمية</Link>}
            {dirty && <span className="text-xs text-amber-800">تعديلات غير محفوظة</span>}
          </div>
          {msg && <p role="status" className={`rounded-xl border p-2 text-sm ${msg.ok ? "" : "border-destructive/40"}`}>{msg.t}</p>}
          <p className="text-xs text-muted-foreground">{missing.length ? `حقول إلزامية ناقصة: ${missing.map(labelOf).join("، ")}` : "الحقول الإلزامية مكتملة."}{unverified ? ` — ${unverified} حيثية بمرجع غير متحقق منه (تُستبعد من الرسمي).` : ""}</p>
          {canEdit && <div className="flex flex-wrap items-end gap-2 border-t pt-2"><label className="text-sm">تاريخ اتخاذ القرار<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} mt-1`} /></label>
            <button type="button" onClick={adopt} disabled={pending || !date} className="min-h-11 rounded-xl border-2 border-primary px-4 font-semibold text-primary disabled:opacity-40">اعتماد واتخاذ القرار</button>
            <p className="w-full text-xs text-muted-foreground">الاعتماد يتم بيد المختص فقط، ويُرفض آليًا إن كان القالب غير معتمد أو الحقول ناقصة أو المراجع غير متحقق منها. لا شيء يُعتمد تلقائيًا.</p></div>}
        </section>
        <section className="rounded-2xl border bg-neutral-100 p-3"><h2 className="mb-2 font-bold">معاينة</h2><div className="max-h-[75vh] overflow-y-auto overflow-x-hidden"><DecisionDoc r={view} /></div></section>
        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">المساعد الذكي (يقترح فقط)</h2>
          {!aiOn ? <p className="text-sm text-muted-foreground">المساعد غير مفعّل في هذه البيئة.</p> : <>
            <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} rows={2} placeholder="اختياري: انسخ هنا الفقرة المراد تحسينها" className={`${inp} py-2`} />
            <div className="flex flex-wrap gap-2">{AI.map(([a, l]) => <button key={a} type="button" disabled={ai?.busy} onClick={() => run(a)} className="min-h-10 rounded-xl border px-3 text-xs disabled:opacity-50">{l}</button>)}</div>
            {ai?.busy && <p className="text-sm">جارٍ التحليل…</p>}{ai?.error && <p role="alert" className="text-sm text-destructive">{ai.error}</p>}
            {ai?.answer && <div className="space-y-2"><p className="whitespace-pre-wrap rounded-xl border bg-muted/40 p-3 text-sm">{ai.answer}</p>
              <p className="text-xs text-muted-foreground">اقتراح غير معتمد — لا يُنسب إليه أي رقم مادة أو قرار قبل التحقق منه.</p>
              {canEdit && ai.action === "recitals" && <button type="button" onClick={() => set(withRecitals([...(data.recitals ?? []), { id: `ai:${Date.now()}`, kind: "whereas", text: ai.answer!.slice(0, 600), included: false, origin: "ai" }]))} className="min-h-9 rounded-lg border px-3 text-xs">أضف كحيثية مقترحة (غير مدرجة، حرّرها قبل الإدراج)</button>}
              {(ai.sources?.length ?? 0) > 0 ? <details className="text-xs"><summary className="cursor-pointer font-semibold">المصادر ({ai.sources!.length})</summary><ul className="space-y-1 pt-1">{ai.sources!.map((s, i) => <li key={i}><b>{s.title}</b> <span className="text-muted-foreground">({s.domain})</span><br />{s.preview}</li>)}</ul></details> : <p className="text-xs text-amber-800">لا مصادر مسترجعة من قاعدة المعرفة: الإجابة غير موثّقة.</p>}</div>}</>}
        </section>
      </div>
    </div>
  );
}
