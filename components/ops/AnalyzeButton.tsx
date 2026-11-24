"use client";
import { Sparkles } from "lucide-react";

/** Opens the executive copilot with a prompt about one chart/indicator; the server recomputes the numbers itself. */
export default function AnalyzeButton({ prompt, label = "حلّل المؤشر" }: { prompt: string; label?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("copilot:ask", { detail: { prompt } }))} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold text-primary active:bg-muted" title={label}>
      <Sparkles className="size-3.5" aria-hidden />{label}
    </button>
  );
}
