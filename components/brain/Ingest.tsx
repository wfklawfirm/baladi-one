"use client";
import { useState } from "react";
import { Loader2, DatabaseZap } from "lucide-react";

export default function Ingest({ done: d0, total }: { done: number; total: number }) {
  const [done, setDone] = useState(d0); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr(""); let offset = done >= total ? 0 : done;
    try {
      for (;;) {
        const r = await fetch("/api/brain/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offset }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || "خطأ");
        const g = await (await fetch("/api/brain/ingest")).json(); setDone(g.done ?? 0);
        if (j.next === null) break; offset = j.next;
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4 rounded-2xl border bg-background p-5">
      <p className="text-lg"><b className="text-primary">{done}</b> من {total} مقطعًا جاهز للبحث الذكي</p>
      <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((done / Math.max(total, 1)) * 100)}%` }} /></div>
      <button onClick={run} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="size-5 animate-spin" /> : <DatabaseZap className="size-5" />}{busy ? "جاري التحميل…" : done >= total ? "إعادة التحميل" : "تحميل المكتبة"}</button>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
