import Link from "next/link";
import { expError, NOT_ACTIVE, OK, STAGES } from "@/lib/expenditure";

export const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
export const btn = "min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 disabled:opacity-50";
export const btnSm = "min-h-10 rounded-lg border px-3 text-sm font-semibold active:bg-muted";
export const lbl = "space-y-1 text-sm font-medium";

export function ExpNav({ current }: { current: "main" | "settings" }) {
  const tabs = [["main", "/staff/finance/expenditure", "دورة الإنفاق"], ["settings", "/staff/finance/expenditure/settings", "الوظائف والاستثناءات"]] as const;
  return (
    <nav aria-label="أقسام دورة الإنفاق" className="flex flex-wrap gap-2">
      {tabs.map(([k, href, t]) => <Link key={k} href={href} aria-current={current === k ? "page" : undefined} className={`min-h-11 rounded-full border px-4 py-2.5 text-sm font-semibold ${current === k ? "border-primary bg-accent text-primary" : "bg-background active:bg-muted"}`}>{t}</Link>)}
      <Link href="/staff/finance" className="min-h-11 rounded-full border bg-background px-4 py-2.5 text-sm active:bg-muted">المالية</Link>
    </nav>
  );
}

export function ExpFlash({ ok, err }: { ok?: string; err?: string }) {
  if (ok && OK[ok]) return <p role="status" className="rounded-xl border border-primary/40 bg-accent p-3 text-sm font-medium">{OK[ok]}</p>;
  if (err === "not_active") return <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{NOT_ACTIVE}</p>;
  if (err) return <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{expError(err)}</p>;
  return null;
}

/** Shown instead of the page when migration 0021 is not applied (no crash). */
export function NotActive({ detail }: { detail?: string }) {
  return (
    <section role="status" className="rounded-2xl border border-primary/40 bg-accent p-5 text-sm">
      <b className="block text-base text-primary">قيد التفعيل</b>
      <p className="mt-1">{NOT_ACTIVE}</p>
      {detail === "error" && <p className="mt-1 text-xs text-muted-foreground">تعذّر قراءة بيانات الوحدة حاليًا؛ أعد المحاولة بعد قليل.</p>}
      <p className="mt-2 text-xs text-muted-foreground">إلى حين التفعيل تبقى شاشات «الموازنة» الحالية تعمل كما هي.</p>
    </section>
  );
}

export function Flag({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "info" | "ok" }) {
  const c = tone === "warn" ? "border-destructive/50 text-destructive" : tone === "ok" ? "border-[#2f7d4f]/50 text-[#2f7d4f]" : "border-primary/40 text-primary";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}

/** Stage strip: highlights the stage a chain is waiting for. */
export function StageStrip({ done }: { done: number }) {
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="مراحل الدورة">
      {STAGES.map((st, i) => <li key={st.key} className={`rounded-full border px-2.5 py-1 ${i < done ? "border-primary bg-accent font-semibold text-primary" : i === done ? "border-primary/60 border-dashed" : "text-muted-foreground"}`}>{i + 1}. {st.label}</li>)}
    </ol>
  );
}

/** Amount + document currency + documented exchange rate (required only when the currency differs from the budget line's). */
export function MoneyFields({ label = "المبلغ بعملة المستند" }: { label?: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className={lbl}>{label}<input name="amount" inputMode="decimal" required className={field} /></label>
        <label className={lbl}>عملة المستند<select name="doc_currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
      </div>
      <fieldset className="space-y-2 rounded-xl border border-dashed p-3">
        <legend className="px-1 text-xs font-semibold">سعر الصرف الموثَّق</legend>
        <p className="text-xs text-muted-foreground">يُترك فارغًا إذا كانت عملة المستند هي عملة بند الموازنة. عند اختلافهما يلزم السعر وتاريخه ومصدره؛ يُحسب «القيمة المحاسبية» بعملة البند = المبلغ × السعر (عدد وحدات عملة البند لكل وحدة من عملة المستند). لا تُجمع عملتان دون تحويل موثَّق.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={lbl}>السعر<input name="rate" inputMode="decimal" className={field} /></label>
          <label className={lbl}>تاريخ السعر<input name="rate_date" type="date" className={field} /></label>
          <label className={lbl}>مصدر السعر<input name="rate_source" maxLength={200} className={field} /></label>
        </div>
      </fieldset>
    </>
  );
}
