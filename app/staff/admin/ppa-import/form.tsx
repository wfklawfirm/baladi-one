"use client";
import { useActionState } from "react";
import { importPpa } from "./actions";

export default function ImportForm() {
  const [s, act, pending] = useActionState(importPpa, null);
  return (
    <form action={act} className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required className="size-5" /> أفهم أن النصوص قيد المراجعة وليست موثّقة قانونيًا</label>
      <button disabled={pending} className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-60">{pending ? "جارٍ الاستيراد… (قد يستغرق دقيقة)" : "استيراد / تحديث النصوص"}</button>
      {s && <p role="status" className={`rounded-xl p-3 text-sm ${s.ok ? "bg-accent text-primary" : "bg-destructive/10 text-destructive"}`}>{s.msg}</p>}
    </form>
  );
}
