"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Admin-only: silently completes loading the AI knowledge base (resumable) while the admin is on the page. */
export default function AutoIngest() {
  const [pct, setPct] = useState<number | null>(null); const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; ran.current = true;
    (async () => {
      try {
        let g = await (await fetch("/api/brain/ingest")).json();
        if (!g || g.error || g.done >= g.total) return;
        let offset = g.done;
        for (;;) {
          setPct(Math.round((offset / g.total) * 100));
          const r = await fetch("/api/brain/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offset }) });
          const j = await r.json(); if (!r.ok) return;
          if (j.next === null) break; offset = j.next;
        }
      } catch { /* retried on the next visit */ } finally { setPct(null); }
    })();
  }, []);
  if (pct === null) return null;
  return <p role="status" className="fixed bottom-3 start-3 z-40 flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs shadow-lg"><Loader2 className="size-4 animate-spin text-primary" />جاري تحديث قاعدة المعرفة {pct}%</p>;
}
