import Link from "next/link";
import type { Check } from "@/lib/compliance";

/** الامتثال — collapsed by default. Counts come from lib/compliance.ts (server-side); unknown data is shown as «بيانات غير متوفرة», never as zero. */
export default function ComplianceSection({ checks }: { checks: Check[] | null }) {
  const total = (checks ?? []).reduce((n, c) => n + (c.count ?? 0), 0);
  const unknown = (checks ?? []).filter((c) => c.count === null).length;
  return (
    <details className="elev rounded-2xl border bg-background p-4 md:p-5">
      <summary className="cursor-pointer font-bold">الامتثال والمتابعة القانونية{checks && <span className="ms-2 text-xs font-normal text-muted-foreground">{total} بند للمتابعة{unknown ? ` · ${unknown} مصدر غير متوفر` : ""}</span>}</summary>
      <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs leading-6 text-amber-950">تذكيرات محسوبة من السجلات وفق قواعد بانتظار المراجعة القانونية؛ ليست حكمًا قانونيًا ولا تغيّر أي حالة. افتح السجل للتحقق.</p>
      {!checks ? <p className="mt-3 text-sm text-muted-foreground">بيانات غير متوفرة</p> : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {checks.map((c) => (
            <li key={c.id} className="rounded-xl border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={c.href} className="font-semibold hover:text-primary">{c.title}</Link>
                {c.count === null ? <b className="text-xs text-muted-foreground">بيانات غير متوفرة</b> : <b className={`text-2xl ${c.count > 0 ? "text-primary" : "text-muted-foreground"}`}>{c.count}</b>}
              </div>
              {c.count === null ? <p className="mt-1 text-xs text-muted-foreground">{c.reason}</p> : (
                <>
                  {c.lines.map((l) => <p key={l.label} className="mt-1 text-xs text-muted-foreground">{l.label}: <b className="text-foreground">{l.count}</b></p>)}
                  {c.note && <p className="mt-1 text-xs text-destructive">{c.note}</p>}
                  {c.items.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                      {c.items.map((i) => <li key={i.id}><Link href={i.href} className="hover:text-primary hover:underline">{i.label}</Link></li>)}
                      {c.count > c.items.length && <li><Link href={c.href} className="font-semibold text-primary">عرض الكل ←</Link></li>}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
