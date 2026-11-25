import Link from "next/link";
import { cycleError, NEEDS_REVIEW, PENDING_ACTIVATION, checkLabel, type Check } from "@/lib/budgetCycle";

export const OK_MSG: Record<string, string> = {
  opened: "فُتح مسار دورة الموازنة.", advanced: "سُجّلت المرحلة وحُفظ أثرها في سجل التدقيق.", settings: "حُفظت الإعدادات.", amended: "سُجّل تعديل الاعتماد.", transferred: "سُجّل نقل الاعتماد.",
  validated: "صُدِّق التعديل وطُبّق على الاعتماد.", released: "رُفع التعليق عن الاعتماد.", started: "بدأ مسار الإقفال.", supp: "حُفظت المدة المتممة.", resolved: "سُجّلت معالجة الالتزام.",
  final: "سُجّل قطع الحساب.", closed: "أُقفلت السنة المالية.", reopened: "أُعيد فتح السنة بمسار تصحيحي موثّق.",
};

export function CycleNav({ current, year }: { current: "lifecycle" | "closing"; year?: number }) {
  const q = year ? `?fy=${year}` : "";
  const tabs = [["lifecycle", `/staff/finance/lifecycle${q}`, "دورة الموازنة والاعتمادات"], ["closing", `/staff/finance/closing${q}`, "إقفال السنة وقطع الحساب"]] as const;
  return (
    <nav aria-label="دورة الموازنة" className="flex flex-wrap gap-2">
      <Link href="/staff/finance/budget" className="min-h-11 rounded-full border bg-background px-4 py-2.5 text-sm active:bg-muted">الموازنة</Link>
      {tabs.map(([k, href, t]) => <Link key={k} href={href} aria-current={current === k ? "page" : undefined} className={`min-h-11 rounded-full border px-4 py-2.5 text-sm font-semibold ${current === k ? "border-primary bg-accent text-primary" : "bg-background active:bg-muted"}`}>{t}</Link>)}
    </nav>
  );
}

export function CycleFlash({ ok, err }: { ok?: string; err?: string }) {
  if (ok && OK_MSG[ok]) return <p role="status" className="rounded-xl border border-primary/40 bg-accent p-3 text-sm font-medium">{OK_MSG[ok]}</p>;
  if (err) return <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{cycleError(err)}</p>;
  return null;
}

export const PendingNotice = () => <p role="status" className="rounded-xl border border-primary/40 bg-accent p-4 text-sm font-medium">{PENDING_ACTIVATION}</p>;
export const ReviewBadge = ({ children = NEEDS_REVIEW }: { children?: React.ReactNode }) => <span className="ms-1 rounded-full border border-destructive/50 px-2 py-0.5 text-[11px] font-semibold text-destructive">{children}</span>;

export function YearPicker({ years, current, base }: { years: { id: string; year: number; status: string }[]; current: number | null; base: string }) {
  if (!years.length) return null;
  return <p className="text-xs text-muted-foreground">السنة المالية: {years.map((y) => <Link key={y.id} href={`${base}?fy=${y.year}`} className={`mx-1 underline ${y.year === current ? "font-bold text-primary" : ""}`}>{y.year}{y.status === "closed" ? " (مقفلة)" : ""}</Link>)}</p>;
}

/** Checklist rows from closing_check: blockers first, then warnings, then passed items. */
export function CheckList({ checks }: { checks: Check[] }) {
  const order = { block: 0, warn: 1, ok: 2 } as const;
  const rows = [...checks].sort((a, b) => order[a.level] - order[b.level]);
  const mark = { block: ["✕", "text-destructive", "يمنع الإقفال"], warn: ["!", "text-amber-700", "تنبيه"], ok: ["✓", "text-[#2f7d4f]", "مستوفى"] } as const;
  return (
    <ul className="divide-y text-sm">
      {rows.map((c) => { const l = checkLabel(c.code); const [sym, cls, lab] = mark[c.level]; return (
        <li key={c.code} className="flex gap-3 py-2.5"><span aria-hidden className={`mt-0.5 w-5 shrink-0 text-center font-bold ${cls}`}>{sym}</span>
          <span className="flex-1"><b className={c.level === "ok" ? "font-medium" : ""}>{l.title}</b>{c.count > 0 && c.level !== "ok" && <span className="ms-2 text-xs text-muted-foreground">({c.count})</span>}
            {c.level !== "ok" && l.fix && <span className="block text-xs text-muted-foreground">{l.fix}</span>}</span>
          <span className={`shrink-0 text-xs ${cls}`}>{lab}</span></li>); })}
    </ul>
  );
}

/** Horizontal lifecycle stepper (wraps on mobile). */
export function Stepper({ stages, current, dates }: { stages: { key: string; label: string }[]; current: string; dates: Record<string, string | null> }) {
  const idx = stages.findIndex((s) => s.key === current);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="مراحل دورة الموازنة">
      {stages.map((s, i) => { const done = i < idx || (current === "closed" && s.key === "closed"), now = i === idx;
        return <li key={s.key} aria-current={now ? "step" : undefined} className={`rounded-xl border p-2.5 text-center text-xs ${now ? "border-primary bg-accent font-bold text-primary" : done ? "border-[#2f7d4f]/50" : "text-muted-foreground"}`}>
          <span className="block text-base" aria-hidden>{done ? "✓" : now ? "●" : "○"}</span>{s.label}{dates[s.key] && <span className="block text-[11px] text-muted-foreground">{dates[s.key]}</span>}</li>; })}
    </ol>
  );
}
