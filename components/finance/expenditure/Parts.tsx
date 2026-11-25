import Link from "next/link";
import { expError, NOT_ACTIVE, OK, STAGES } from "@/lib/expenditure";

export const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
export const btn = "min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 disabled:opacity-50";
export const btnSm = "min-h-11 rounded-lg border-2 px-4 text-base font-semibold active:bg-muted";
export const lbl = "space-y-1 text-base font-semibold";

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
  if (ok && OK[ok]) return <p role="status" className="rounded-2xl border-2 border-green-600/40 bg-green-50 p-4 text-base font-medium leading-7">{OK[ok]}</p>;
  if (err === "not_active") return <p role="alert" className="rounded-2xl border-2 border-destructive/40 p-4 text-base leading-7">{NOT_ACTIVE}</p>;
  if (err) return <p role="alert" className="rounded-2xl border-2 border-destructive/40 p-4 text-base leading-7">{expError(err)}</p>;
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
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="مراحل الدورة">
      {STAGES.map((st, i) => <li key={st.key} className={`rounded-full border px-3 py-1.5 ${i < done ? "border-primary bg-accent font-semibold text-primary" : i === done ? "border-primary/60 border-dashed" : "text-muted-foreground"}`}>{i + 1}. {st.label}</li>)}
    </ol>
  );
}

/** Amount + document currency + documented exchange rate (required only when the currency differs from the budget line's). */
export function MoneyFields({ label = "المبلغ بعملة المستند" }: { label?: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className={lbl}>{label}<span className="block text-sm font-normal text-muted-foreground">بالأرقام كما في المستند</span><input name="amount" inputMode="decimal" required className={field} /></label>
        <label className={lbl}>عملة المستند<span className="block text-sm font-normal text-muted-foreground">العملة المكتوبة في الفاتورة</span><select name="doc_currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
      </div>
      <details className="rounded-xl border border-dashed p-3">
        <summary className="min-h-10 cursor-pointer text-base font-semibold">سعر الصرف (فقط إذا اختلفت عملة المستند عن عملة البند)</summary>
        <p className="mt-2 text-sm text-muted-foreground">يُترك فارغًا إذا كانت عملة المستند هي عملة بند الموازنة. عند اختلافهما يلزم السعر وتاريخه ومصدره؛ يُحسب «القيمة المحاسبية» بعملة البند = المبلغ × السعر (عدد وحدات عملة البند لكل وحدة من عملة المستند). لا تُجمع عملتان دون تحويل موثَّق.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={lbl}>السعر<input name="rate" inputMode="decimal" className={field} /></label>
          <label className={lbl}>تاريخ السعر<input name="rate_date" type="date" className={field} /></label>
          <label className={lbl}>مصدر السعر<input name="rate_source" maxLength={200} className={field} /></label>
        </div>
      </details>
    </>
  );
}
