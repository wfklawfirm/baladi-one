import { C } from "@/components/ops/Charts";
import { fmtPct } from "@/lib/projects";

const Bar = ({ label, v, color, over }: { label: string; v: number | null; color: string; over?: boolean }) => (
  <div className="space-y-0.5">
    <div className="flex justify-between text-sm"><span>{label}</span><b className={over ? "text-destructive" : ""}>{fmtPct(v)}{over ? " (تجاوز الموازنة)" : ""}</b></div>
    <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v === null ? undefined : Math.round(Math.min(100, v))}>
      <div className="h-full rounded-full" style={{ width: `${v === null ? 0 : Math.min(100, Math.max(0, v))}%`, background: color }} />
    </div>
  </div>
);

/** Planned vs actual (physical) vs financial consumption. Each bar carries a text label and value, never colour alone. */
export default function ProgressBars({ actual, planned, financial }: { actual: number | null; planned: number | null; financial: number | null }) {
  return (
    <div className="space-y-2">
      <Bar label="المخطط" v={planned} color={C.grey} />
      <Bar label="الإنجاز الفعلي" v={actual} color={C.primary} />
      <Bar label="الصرف من الموازنة" v={financial} color={C.blue} over={financial !== null && financial > 100} />
    </div>
  );
}
