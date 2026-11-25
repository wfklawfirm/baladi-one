import { METHOD } from "@/lib/council";
import { recommendMethod, type Threshold } from "@/lib/procurement";
import { parseAmount } from "@/lib/projects";
import { btn, fld } from "./data";

/** Table-driven method recommender. GET form (no server action). Never blocks; with no thresholds loaded it says so. */
export default function RecommenderCard({ thresholds, today, value, currency }: { thresholds: Threshold[]; today: string; value?: string; currency?: string }) {
  const v = value ? parseAmount(value) : null, cu = currency === "LBP" ? "LBP" : "USD";
  const rec = v !== null ? recommendMethod(v, cu, thresholds, today) : null;
  return (
    <section className="elev space-y-3 rounded-2xl border bg-background p-4">
      <h2 className="font-bold text-primary">محرك توصية أسلوب الشراء</h2>
      <form className="flex flex-wrap items-end gap-2" action="/staff/projects/procurement">
        <label className="text-xs">القيمة التقديرية<input name="value" defaultValue={value} inputMode="decimal" required className={`${fld} block`} /></label>
        <label className="text-xs">العملة<select name="currency" defaultValue={cu} className={`${fld} block`}><option value="USD">دولار</option><option value="LBP">ليرة</option></select></label>
        <button className={btn}>اقتراح</button>
      </form>
      {value && v === null && <p className="text-xs text-destructive">قيمة غير صالحة.</p>}
      {rec && (
        <div role="status" className="space-y-1 rounded-xl border p-3 text-sm">
          <p className={rec.status === "matched" ? "font-semibold" : "font-bold text-amber-900"}>{rec.message}</p>
          {rec.status === "matched" && <ul className="list-disc pr-5 text-xs leading-6">{rec.methods.map((m) => <li key={m.method}><b>{METHOD[m.method] ?? m.method}</b>{m.note ? ` — ${m.note}` : ""} <span className="text-muted-foreground">(المصدر: {m.source})</span></li>)}</ul>}
        </div>)}
      <p className="text-[11px] leading-5 text-muted-foreground">لا سقوف مدمجة في الكود: تُقرأ من جدول السقوف المحمَّل (بانتظار المراجعة القانونية). التوصية استرشادية ولا تمنع أي إجراء.</p>
    </section>
  );
}
