"use client";
import { useEffect, useRef, useState } from "react";

export default function EmbedRunner() {
  const [backlog, setBacklog] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const stop = useRef(false);

  async function refresh() {
    const r = await fetch("/api/brain/embed-missing", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error ?? "تعذّر قراءة الحالة"); return; }
    setBacklog(j.backlog); setMsg("");
  }
  useEffect(() => { refresh(); }, []);

  async function run() {
    stop.current = false; setBusy(true); setMsg("");
    try {
      for (let i = 0; i < 100 && !stop.current; i++) {
        const r = await fetch("/api/brain/embed-missing", { method: "POST" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setMsg(j.error ?? "فشل التوليد"); break; }
        setDone((d) => d + (j.embedded ?? 0)); setBacklog(j.backlog);
        if (!j.embedded || j.backlog === 0) { setMsg(j.backlog === 0 ? "اكتمل التوليد." : ""); break; }
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-lg">المتبقي للتوليد: <b>{backlog ?? "…"}</b> · تمّ في هذه الجلسة: <b>{done}</b></p>
      {msg && <p role="status" className="rounded-lg bg-accent p-3 text-sm text-primary">{msg}</p>}
      <div className="flex gap-2">
        <button onClick={run} disabled={busy || backlog === 0} className="min-h-11 flex-1 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">{busy ? "جارٍ التوليد…" : "ابدأ التوليد"}</button>
        {busy && <button onClick={() => { stop.current = true; }} className="min-h-11 rounded-xl border px-4 font-bold">إيقاف</button>}
        <button onClick={refresh} disabled={busy} className="min-h-11 rounded-xl border px-4 font-bold">تحديث</button>
      </div>
    </div>
  );
}
