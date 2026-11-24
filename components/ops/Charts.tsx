// Server-rendered SVG charts (no client JS). Colours are paired with text labels/legends, never colour alone.
export const C = { primary: "#7a1f2e", soft: "#d9a3ac", ink: "#374151", grid: "#e5e7eb", green: "#2f7d4f", amber: "#b7791f", grey: "#9ca3af", blue: "#3b5b8c" };

export function IntakeChart({ data }: { data: { key: string; label: string; intake: number; closed: number }[] }) {
  const W = 720, H = 220, L = 28, B = 28, T = 10, R = 8;
  const max = Math.max(4, ...data.flatMap((d) => [d.intake, d.closed]));
  const bw = (W - L - R) / data.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = data.map((d, i) => `${i ? "L" : "M"}${(L + bw * (i + 0.5)).toFixed(1)},${y(d.closed).toFixed(1)}`).join(" ");
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg style={{ direction: "ltr" }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="الطلبات الواردة والمنجزة خلال ٣٠ يومًا" className="h-auto w-full">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.grid} /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={C.ink}>{t}</text></g>)}
      {data.map((d, i) => <rect key={d.key} x={L + bw * i + bw * 0.15} y={y(d.intake)} width={bw * 0.7} height={H - B - y(d.intake)} rx="2" fill={C.soft}><title>{`${d.label}: ${d.intake} واردة، ${d.closed} منجزة`}</title></rect>)}
      <path d={line} fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => d.closed > 0 && <circle key={d.key} cx={L + bw * (i + 0.5)} cy={y(d.closed)} r="3" fill={C.primary} />)}
      {data.map((d, i) => i % Math.max(1, Math.ceil(data.length / 7)) === 0 && <text key={d.key} x={L + bw * (i + 0.5)} y={H - 8} textAnchor="middle" fontSize="11" fill={C.ink}>{d.label}</text>)}
    </svg>
  );
}

export function Donut({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  const r = 54, c = 2 * Math.PI * r; let off = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg viewBox="0 0 140 140" role="img" aria-label="توزيع الطلبات حسب الحالة" className="size-36 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke={C.grid} strokeWidth="18" />
        {total > 0 && parts.filter((p) => p.n > 0).map((p) => { const len = (p.n / total) * c; const el = <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />; off += len; return el; })}
        <text x="70" y="70" transform="rotate(90 70 70)" textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="700" fill={C.ink}>{total}</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {parts.map((p) => <li key={p.label} className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: p.color }} aria-hidden /><span className="flex-1">{p.label}</span><b>{p.n}</b></li>)}
      </ul>
    </div>
  );
}

export function HBars({ items, color = C.primary }: { items: { label: string; n: number }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => <li key={i.label} className="space-y-1"><div className="flex justify-between text-sm"><span>{i.label}</span><b>{i.n.toLocaleString("en-US")}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(i.n / max) * 100}%`, background: color }} /></div></li>)}
    </ul>
  );
}

export function Columns({ data, label }: { data: { key: string; label: string; v: number }[]; label: string }) {
  const W = 720, H = 150, B = 22, T = 8;
  const max = Math.max(1, ...data.map((d) => d.v)); const bw = W / data.length;
  return (
    <svg style={{ direction: "ltr" }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
      <line x1="0" x2={W} y1={H - B} y2={H - B} stroke={C.grid} />
      {data.map((d, i) => { const h = ((H - B - T) * d.v) / max; return <rect key={d.key} x={bw * i + bw * 0.15} y={H - B - h} width={bw * 0.7} height={h} rx="2" fill={C.primary}><title>{`${d.label}: ${d.v.toLocaleString("en-US")}`}</title></rect>; })}
      {data.map((d, i) => i % Math.max(1, Math.ceil(data.length / 7)) === 0 && <text key={d.key} x={bw * (i + 0.5)} y={H - 6} textAnchor="middle" fontSize="11" fill={C.ink}>{d.label}</text>)}
    </svg>
  );
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2 || Math.max(...values) === 0) return null;
  const W = 80, H = 24, max = Math.max(...values);
  const pts = values.map((v, i) => `${((W * i) / (values.length - 1)).toFixed(1)},${(H - 2 - ((H - 4) * v) / max).toFixed(1)}`).join(" ");
  return <svg style={{ direction: "ltr" }} viewBox={`0 0 ${W} ${H}`} className="h-6 w-20" aria-hidden><polyline points={pts} fill="none" stroke={C.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
