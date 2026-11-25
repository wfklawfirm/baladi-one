import Link from "next/link";

export type Stat = { label: string; value: string | number; tone?: "ok" | "warn" | "bad"; href?: string };
export type Todo = { key: string; text: string; sub?: string; href: string; cta: string; tone?: "warn" | "bad" | "info" };

const TONE: Record<string, string> = { ok: "text-primary", warn: "text-amber-800", bad: "text-destructive" };
const DOT: Record<string, string> = { info: "bg-primary", warn: "bg-amber-500", bad: "bg-destructive" };

/** Summary-first block: one headline sentence, up to three numbers, and the list of things that need the mayor. */
export default function PageSummary({ headline, stats, todos, empty = "لا شيء ينتظر قراركم الآن." }: { headline: string; stats: Stat[]; todos: Todo[]; empty?: string }) {
  return (
    <section className="space-y-4" aria-label="الملخص">
      <p className="text-base font-semibold leading-7">{headline}</p>
      <div className="grid grid-cols-3 gap-2.5">
        {stats.slice(0, 3).map((s) => {
          const inner = <><b className={`block text-2xl leading-none sm:text-3xl ${TONE[s.tone ?? "ok"]}`}>{s.value}</b><span className="mt-1.5 block text-xs leading-5 text-muted-foreground sm:text-sm">{s.label}</span></>;
          const cls = "elev block rounded-2xl border bg-background p-3 text-center sm:p-4";
          return s.href ? <Link key={s.label} href={s.href} className={`${cls} active:bg-muted`}>{inner}</Link> : <div key={s.label} className={cls}>{inner}</div>;
        })}
      </div>
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-primary"><span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />المطلوب منك{todos.length > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{todos.length}</span>}</h2>
        {todos.length === 0 ? <p className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">{empty}</p> : (
          <ul className="space-y-2">
            {todos.slice(0, 8).map((t) => (
              <li key={t.key} className="elev flex min-h-16 items-center gap-3 rounded-2xl border bg-background px-4 py-3">
                <span className={`size-2.5 shrink-0 rounded-full ${DOT[t.tone ?? "info"]}`} aria-hidden />
                <span className="min-w-0 flex-1"><b className="block text-sm leading-6">{t.text}</b>{t.sub && <span className="block text-xs leading-5 text-muted-foreground">{t.sub}</span>}</span>
                <Link href={t.href} className="min-h-11 shrink-0 rounded-xl border-2 border-primary px-4 py-2.5 text-sm font-bold text-primary active:bg-accent">{t.cta}</Link>
              </li>))}
            {todos.length > 8 && <li className="px-1 text-xs text-muted-foreground">و{todos.length - 8} بنود أخرى في «عرض التفاصيل».</li>}
          </ul>)}
      </div>
    </section>
  );
}
