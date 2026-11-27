"use client";
import { useState } from "react";

type Case = { id: string; q: string; must_match?: string[]; must_not_match?: string[]; group?: string; verdict?: string; needs_citation?: boolean };
type Src = { preview?: string; excerpt?: string; url?: string | null; status?: string };
type Out = { answer: string; sources: Src[]; confidence?: string };
type Res = { id: string; q: string; ok: boolean; why: string[]; answer: string; group?: string; v?: string };
const verdictOf = (a: string) => (/^\s*(?:\*\*)?(?:الجواب:\s*)?(?:لا\b|محظور|يحظر|يستثن)/.test(nz(a)) ? "deny" : /^\s*(?:\*\*)?(?:الجواب:\s*)?(?:نعم|يحق|يجوز)/.test(nz(a)) ? "yes" : "other");
const nz = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, "");

async function run(q: string): Promise<Out> {
  const r = await fetch("/api/brain/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, history: [], noClarify: true }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return { answer: String(j.answer ?? (j.clarify ? `[توضيح] ${j.clarify.join(" / ")}` : "")), sources: Array.isArray(j.sources) ? j.sources : [], confidence: j.confidence };
}
function check(c: Case, o: Out): string[] {
  const a = o.answer, why: string[] = [], t = nz(a);
  if (o.sources.some((x) => !(x.excerpt ?? x.preview ?? "").trim())) why.push("مصدر فارغ");
  if (c.needs_citation && !o.sources.some((x) => x.url && x.status && (x.excerpt ?? x.preview))) why.push("لا مصدر بمقتطف ورابط وحالة مراجعة");
  if (c.verdict && verdictOf(a) !== c.verdict) why.push(`الحكم المتوقع ${c.verdict} لكن الجواب ${verdictOf(a)}`);
  for (const m of c.must_match ?? []) if (!new RegExp(nz(m)).test(t)) why.push(`لم يرد المطلوب: ${m}`);
  for (const m of c.must_not_match ?? []) if (new RegExp(nz(m), "m").test(t)) why.push(`ورد المحظور: ${m}`);
  return why;
}

export default function EvalRunner({ cases }: { cases: Case[] }) {
  const [res, setRes] = useState<Res[]>([]), [busy, setBusy] = useState(false), [free, setFree] = useState(""), [freeAns, setFreeAns] = useState("");
  async function all() {
    setBusy(true); setRes([]);
    for (const c of cases) {
      try { const o = await run(c.q); const why = check(c, o); setRes((p) => [...p, { id: c.id, q: c.q, ok: !why.length, why, answer: o.answer, group: c.group, v: verdictOf(o.answer) }]); }
      catch (e) { setRes((p) => [...p, { id: c.id, q: c.q, ok: false, why: [(e as Error).message], answer: "" }]); }
    }
    setBusy(false);
  }
  async function one() { if (!free.trim()) return; setBusy(true); setFreeAns("…"); try { setFreeAns((await run(free)).answer); } catch (e) { setFreeAns((e as Error).message); } setBusy(false); }
  const pass = res.filter((r) => r.ok).length;
  const groups = [...new Set(res.filter((r) => r.group).map((r) => r.group!))].map((g) => ({ g, vs: [...new Set(res.filter((r) => r.group === g).map((r) => r.v))] }));
  return (
    <div className="space-y-4">
      <button disabled={busy} onClick={all} className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-60">{busy ? "جارٍ التشغيل…" : `شغّل ${cases.length} حالات`}</button>
      {res.length > 0 && <p role="status" className="rounded-xl bg-muted p-3 text-sm">النتيجة: <b>{pass}</b> نجاح / <b>{res.length - pass}</b> فشل من {cases.length}</p>}
      {groups.map((x) => <p key={x.g} className={`rounded-xl p-3 text-sm ${x.vs.length === 1 ? "bg-muted" : "border border-destructive text-destructive"}`}>اتساق المجموعة «{x.g}»: {x.vs.length === 1 ? `متسق (${x.vs[0]})` : `غير متسق (${x.vs.join(" / ")})`}</p>)}
      <ul className="space-y-2">{res.map((r) => (
        <li key={r.id} className={`rounded-xl border p-3 text-sm ${r.ok ? "" : "border-destructive"}`}>
          <p className="font-bold">{r.ok ? "✅" : "❌"} {r.q}</p>
          {r.why.map((w) => <p key={w} className="text-destructive">{w}</p>)}
          <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">الجواب</summary><pre className="whitespace-pre-wrap leading-6">{r.answer}</pre></details>
        </li>))}</ul>
      <div className="space-y-2 rounded-xl border p-3">
        <label className="text-sm font-bold" htmlFor="free">سؤال حر (للتجربة اليدوية)</label>
        <textarea id="free" value={free} onChange={(e) => setFree(e.target.value)} rows={2} className="w-full rounded-lg border p-2 text-sm" />
        <button disabled={busy} onClick={one} className="min-h-11 rounded-xl border px-4 font-bold disabled:opacity-60">اسأل</button>
        {freeAns && <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-6">{freeAns}</pre>}
      </div>
    </div>
  );
}
