import Link from "next/link";
import { OK_TEXT, PENDING, revenueError } from "@/lib/revenue";

export const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
export const btn = "min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 disabled:opacity-50";
export const btnSm = "min-h-11 rounded-xl border-2 border-primary px-4 text-sm font-bold text-primary active:bg-accent";

const TABS = [["home", "/staff/revenue", "نظرة عامة"], ["taxpayers", "/staff/revenue/taxpayers", "المكلّفون"], ["rules", "/staff/revenue/rules", "سجل القواعد"], ["exemptions", "/staff/revenue/exemptions", "الإعفاءات"], ["assessments", "/staff/revenue/assessments", "التكليف"], ["orders", "/staff/revenue/orders", "أوامر القبض"], ["collect", "/staff/revenue/collect", "التحصيل والإيصالات"], ["cash", "/staff/revenue/cash", "مطابقة الصندوق"]] as const;
export type Tab = (typeof TABS)[number][0];

export function RevenueNav({ current }: { current: Tab }) {
  return (
    <nav aria-label="أقسام الإيرادات" className="flex flex-wrap gap-2">
      {TABS.map(([k, href, t]) => <Link key={k} href={href} aria-current={current === k ? "page" : undefined} className={`min-h-11 rounded-full border px-4 py-2.5 text-sm font-semibold ${current === k ? "border-primary bg-accent text-primary" : "bg-background active:bg-muted"}`}>{t}</Link>)}
      <Link href="/staff/collections" className="min-h-11 rounded-full border bg-background px-4 py-2.5 text-sm active:bg-muted">سجل التحصيل القديم</Link>
    </nav>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (ok && OK_TEXT[ok]) return <p role="status" className="rounded-xl border border-primary/40 bg-accent p-3 text-sm font-medium">{OK_TEXT[ok]}</p>;
  if (err) return <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{revenueError(err)}</p>;
  return null;
}

export function Panel({ title, sub, children, className = "", fold = false }: { title: string; sub?: string; children: React.ReactNode; className?: string; fold?: boolean }) {
  if (fold) return <details className={`elev group rounded-2xl border bg-background p-4 md:p-5 ${className}`}><summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold text-primary"><span>{title}</span><span className="text-xl leading-none transition group-open:rotate-45" aria-hidden>+</span></summary>{sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}<div className="mt-3">{children}</div></details>;
  return <section className={`elev rounded-2xl border bg-background p-4 md:p-5 ${className}`}><h2 className="font-bold">{title}</h2>{sub && <p className="mb-3 text-xs text-muted-foreground">{sub}</p>}<div className={sub ? "" : "mt-3"}>{children}</div></section>;
}

/** Shown instead of the page body when migration 0022 has not been applied (or the tables are unreachable). Never throws. */
export function Pending({ missing }: { missing: boolean }) {
  return <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm"><b>{PENDING}</b>: {missing ? "وحدة الإيرادات لم تُفعَّل بعد في قاعدة البيانات (الترحيل 0022)." : "تعذّر تحميل بيانات الإيرادات الآن، حاول لاحقًا."}</p>;
}

export const LegalNote = () => <p className="rounded-xl border border-primary/30 bg-accent p-3 text-xs leading-6">تنبيه قانوني: لا تحتوي هذه الوحدة على أي نسبة أو غرامة أو إعفاء أو مادة قانونية جاهزة. تُحمَّل القواعد يدويًا بحالة «بانتظار المراجعة»، ولا يُحتسب شيء منها قبل التحقق القانوني. نطاق ترقيم الإيصالات (بلدية/سلسلة/سنة مالية) والمهل القانونية للتبليغ والاعتراض: <b>يلزم تحقق</b>.</p>;

export const Select = ({ name, children, required = true }: { name: string; children: React.ReactNode; required?: boolean }) => <select name={name} required={required} className={field}>{children}</select>;
