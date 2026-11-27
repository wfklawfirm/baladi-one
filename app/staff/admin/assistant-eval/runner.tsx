"use client";
import { useState } from "react";

type Case = { id: string; q: string; must_match?: string[]; must_not_match?: string[] };
type Res = { id: string; q: string; ok: boolean; why: string[]; answer: string };
const nz = (t: string) => t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, "");

async function run(q: string): Promise<string> {
  const r = await fetch("/api/brain/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, history: [], noClarify: true }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return String(j.answer ?? (j.clarify ? `[توضيح] ${j.clarify.join(" / ")}` : ""));
}
function check(c: Case, a: string): string[] {
  const why: string[] = [], t = nz(a);
  for (const m of c.must_match ?? []) if (!new RegExp(nz(m)).test(t)) why.push(`لم يرد المطلوب: ${m}`);
  for (const m of c.must_not_match ?? []) if (new RegExp(nz(m), "m").test(t)) why.push(`ورد المحظور: ${m}`);
  return why;
}

export default function EvalRunner({ cases }: { cases: Case[] }) {
  const [res, setRes] = useState<Res[]>([]), [busy, setBusy] = useState(false), [free, setFree] = useState(""), [freeAns, setFreeAns] = useState("");
  async function all() {
    setBusy(true); setRes([]);
    for (const c of cases) {
      try { const a = await run(c.q); const why = check(c, a); setRes((p) => [...p, { id: c.id, q: c.q, ok: !why.length, why, answer: a }]); }
      catch (e) { setRes((p) => [...p, { id: c.id, q: c.q, ok: false, why: [(e as Error).message], answer: "" }]); }
    }
    setBusy(false);
  }
  async function one() { if (!free.trim()) return; setBusy(true); setFreeAns("…"); try { setFreeAns(await run(free)); } catch (e) { setFreeAns((e as Error).message); } setBusy(false); }
  const pass = res.filter((r) => r.ok).length;
  return (
    <div className="space-y-4">
      <button disabled={busy} onClick={all} className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-60">{busy ? "جارٍ التشغيل…" : `شغّل ${cases.length} حالات`}</button>
      {res.length > 0 && <p role="status" className="rounded-xl bg-muted p-3 text-sm">النتيجة: <b>{pass}</b> نجاح / <b>{res.length - pass}</b> فشل من {cases.length}</p>}
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
