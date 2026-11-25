import type { ReactNode } from "react";

/** Shared building blocks for the "plain & guided" mayor experience. Server-safe (no client state). */

/** A page intro in 1–2 short sentences: what this page is for and what the person should do now. */
export function Intro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h1 className="text-2xl font-extrabold leading-snug">{title}</h1>
      <p className="text-base leading-7 text-muted-foreground">{children}</p>
    </section>
  );
}

/** One thing to do, in a card: numbered title, a plain sentence, then the content. Use instead of long multi-section forms. */
export function StepCard({ n, title, hint, children }: { n?: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-3xl border bg-background p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {n !== undefined && <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground">{n}</span>}
        <div className="min-w-0"><h2 className="text-lg font-bold leading-snug">{title}</h2>{hint && <p className="text-sm leading-6 text-muted-foreground">{hint}</p>}</div>
      </div>
      {children}
    </section>
  );
}

/** A form field: big label, optional plain-language hint and example, the control underneath. */
export function Field({ label, hint, example, required, children }: { label: string; hint?: string; example?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-base font-semibold">{label}{required && <b className="text-destructive"> *</b>}</span>
      {hint && <span className="block text-sm leading-6 text-muted-foreground">{hint}</span>}
      {children}
      {example && <span className="block text-xs text-muted-foreground">مثال: {example}</span>}
    </label>
  );
}
export const CONTROL = "min-h-12 w-full rounded-xl border-2 bg-background px-3 text-base outline-none focus:border-primary";
export const BTN_PRIMARY = "inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground active:opacity-90";
export const BTN_SECONDARY = "inline-flex min-h-12 items-center justify-center rounded-xl border-2 px-5 text-base font-semibold active:bg-muted";

/** "ما معنى هذا؟" — a plain explanation of a term, collapsed by default. Replace jargon with a plain word and add this when the term matters. */
export function Explain({ term, children }: { term: string; children: ReactNode }) {
  return (
    <details className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">ما معنى «{term}»؟</summary>
      <div className="pt-2 leading-7 text-muted-foreground">{children}</div>
    </details>
  );
}

/** Status chip: one word, a colour AND a symbol (never colour alone). */
const TONE = { ok: "bg-green-100 text-green-900", wait: "bg-amber-100 text-amber-900", bad: "bg-red-100 text-red-900", info: "bg-muted text-foreground" } as const;
const MARK = { ok: "✓", wait: "…", bad: "!", info: "•" } as const;
export function Chip({ tone = "info", children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${TONE[tone]}`}><span aria-hidden>{MARK[tone]}</span>{children}</span>;
}

/** Friendly empty state: says what is empty AND what to do next. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="space-y-3 rounded-2xl border-2 border-dashed p-6 text-center text-base text-muted-foreground"><p>{children}</p>{action}</div>;
}

/** Result banner after an action (saved / failed) in plain words, with what to do next. */
export function Notice({ tone = "ok", children }: { tone?: "ok" | "bad"; children: ReactNode }) {
  return <p role={tone === "bad" ? "alert" : "status"} className={`rounded-2xl border-2 p-4 text-base leading-7 ${tone === "bad" ? "border-destructive/50" : "border-green-600/40 bg-green-50"}`}>{children}</p>;
}
