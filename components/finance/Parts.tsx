import Link from "next/link";
import { financeError } from "@/lib/finance";

export const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
export const btn = "min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90";
const OK: Record<string, string> = { line: "أُضيف بند الموازنة.", amend: "سُجّل تعديل الاعتماد.", amend_validated: "صُدِّق التعديل وطُبّق على الاعتماد.", commit: "سُجّل الالتزام.", pay: "سُجّلت النفقة.", recv: "أُضيف المستحق.", settle: "سُجّل التحصيل على المستحق." };

export function FinanceNav({ current }: { current: "overview" | "budget" | "receivables" }) {
  const tabs = [["overview", "/staff/finance", "نظرة عامة"], ["budget", "/staff/finance/budget", "الموازنة"], ["receivables", "/staff/finance/receivables", "المستحقات"]] as const;
  return (
    <nav aria-label="أقسام المالية" className="flex flex-wrap gap-2">
      {tabs.map(([k, href, t]) => <Link key={k} href={href} aria-current={current === k ? "page" : undefined} className={`min-h-11 rounded-full border px-4 py-2.5 text-sm font-semibold ${current === k ? "border-primary bg-accent text-primary" : "bg-background active:bg-muted"}`}>{t}</Link>)}
      <Link href="/staff/collections" className="min-h-11 rounded-full border bg-background px-4 py-2.5 text-sm active:bg-muted">تسجيل إيصال</Link>
    </nav>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (ok && OK[ok]) return <p role="status" className="rounded-xl border border-primary/40 bg-accent p-3 text-sm font-medium">{OK[ok]}</p>;
  if (err) return <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{financeError(err)}</p>;
  return null;
}

export function Panel({ title, sub, children, className = "", fold = false }: { title: string; sub?: string; children: React.ReactNode; className?: string; fold?: boolean }) {
  if (fold) return <details className={`elev group rounded-2xl border bg-background p-4 md:p-5 ${className}`}><summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold text-primary"><span>{title}</span><span className="text-xl leading-none transition group-open:rotate-45" aria-hidden>+</span></summary>{sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}<div className="mt-3">{children}</div></details>;
  return <section className={`elev rounded-2xl border bg-background p-4 md:p-5 ${className}`}><h2 className="font-bold">{title}</h2>{sub && <p className="mb-3 text-xs text-muted-foreground">{sub}</p>}<div className={sub ? "" : "mt-3"}>{children}</div></section>;
}

/** Fires when the staff user is not mayor/admin (checked in each page). */
export const Unavailable = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
