import { amendmentSummary } from "@/lib/procurement";
import { money } from "./data";
export type Amend = { delta: number; reason: string; decision_id: string | null; created_at: string };

export default function AmendmentSection({ currentValue, currency, rows, limitPct, limitStatus }: { currentValue: number; currency: string; rows: Amend[]; limitPct: number | null; limitStatus?: string | null }) {
  const a = amendmentSummary(currentValue, rows.map((r) => r.delta), limitPct);
  return (
    <section className="elev space-y-2 rounded-2xl border bg-background p-4">
      <h2 className="font-bold text-primary">الملاحق والقيمة التراكمية</h2>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><dt className="text-sm text-muted-foreground">القيمة الأصلية</dt><dd className="font-bold">{money(a.original, currency)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">القيمة الحالية</dt><dd className="font-bold">{money(a.current, currency)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">التغيير التراكمي</dt><dd className="font-bold">{money(a.cumulativeDelta, currency)}{a.cumulativePct !== null ? ` (${a.cumulativePct.toFixed(1)}%)` : ""}</dd></div>
        <div><dt className="text-sm text-muted-foreground">حد المادة 29</dt><dd className="font-bold">{a.limitLabel}{a.limitPct !== null && limitStatus !== "verified" ? " · بانتظار المراجعة" : ""}</dd></div>
      </dl>
      {a.overLimit === true && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-2 text-sm font-semibold">تنبيه: التغيير التراكمي يتجاوز النسبة المحمَّلة — يلزم تحقق من النص والشروط (لا منع آلي).</p>}
      {a.limitPct === null && <p className="text-sm text-muted-foreground">لم تُحمَّل نسبة المادة 29؛ لا يُحتسب أي سقف. تُحمَّل من صفحة السقوف والإعدادات بعد التحقق.</p>}
      {rows.length > 0 && <ul className="list-disc space-y-0.5 pr-5 text-sm">{rows.map((r, k) => <li key={k}>{money(r.delta, currency)} — {r.reason}{r.decision_id ? " (بقرار)" : " (دون قرار مربوط)"} · {r.created_at.slice(0, 10)}</li>)}</ul>}
    </section>
  );
}
