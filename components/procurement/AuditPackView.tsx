import type { AuditPack } from "@/lib/procurementAudit";

/** Printable A4 RTL rendering of an AuditPack. Pure presentation: every value comes from buildAuditPack. */
export default function AuditPackView({ pack }: { pack: AuditPack }) {
  return (
    <article dir="rtl" lang="ar" className="audit-pack mx-auto max-w-[210mm] bg-white text-black text-[11pt] leading-7 print:max-w-none">
      <style>{`@page{size:A4;margin:14mm}@media print{html,body{background:#fff!important}.audit-pack{font-size:10.5pt}.audit-pack table{page-break-inside:auto}.audit-pack tr{page-break-inside:avoid}.audit-pack h2{break-after:avoid}}`}</style>
      <section className="flex min-h-[250mm] flex-col justify-between border-2 border-black p-8 print:min-h-[265mm]" style={{ breakAfter: "page" }}>
        <div className="space-y-2 text-center"><p className="text-sm">الجمهورية اللبنانية</p><p className="text-sm">{pack.cover[0][1]}</p></div>
        <div className="space-y-4 text-center"><h1 className="text-3xl font-bold">الملف الرقابي الكامل</h1><p className="text-xl">{pack.title}</p>
          <p className="mx-auto w-fit rounded border border-black px-4 py-1 text-sm font-bold">{pack.variant === "shareable" ? "نسخة قابلة للمشاركة" : "نسخة داخلية — غير قابلة للمشاركة"}</p></div>
        <dl className="mx-auto w-full max-w-md space-y-1 text-sm">{pack.cover.slice(1).map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-dotted border-black/40 py-1"><dt className="font-semibold">{k}</dt><dd>{v}</dd></div>)}</dl>
      </section>

      <section className="space-y-3 p-2 print:p-0" style={{ breakAfter: "page" }}>
        <h2 className="text-xl font-bold">الفهرس</h2>
        <ol className="list-decimal space-y-1 ps-6">{pack.sections.map((s) => <li key={s.id}>{s.title}</li>)}<li>السجلات الناقصة ({pack.missing.length})</li><li>حدود التحقق</li></ol>
      </section>

      {pack.sections.map((s, i) => (
        <section key={s.id} className="space-y-2 p-2 print:p-0 print:pb-3" style={{ breakInside: s.table && s.table.rows.length > 12 ? "auto" : "avoid" }}>
          <h2 className="border-b-2 border-black pb-1 text-lg font-bold">{i + 1}. {s.title}</h2>
          {s.kv && <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-sm">{s.kv.map(([k, v]) => <div key={k} className="contents"><dt className="font-semibold">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>}
          {s.table && <table className="w-full border-collapse text-xs"><thead><tr>{s.table.head.map((h) => <th key={h} className="border border-black bg-neutral-100 p-1.5 text-right">{h}</th>)}</tr></thead>
            <tbody>{s.table.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border border-black p-1.5 align-top break-words">{c}</td>)}</tr>)}</tbody></table>}
          {s.notes?.map((n, k) => <p key={k} className="text-xs text-neutral-700">{n}</p>)}
        </section>
      ))}

      <section className="space-y-2 p-2 print:p-0" style={{ breakBefore: "page" }}>
        <h2 className="border-b-2 border-black pb-1 text-lg font-bold">{pack.sections.length + 1}. السجلات الناقصة</h2>
        {pack.missing.length === 0 ? <p className="text-sm">لا سجلات ناقصة وفق القواعد المطبَّقة. (هذا لا يعني اكتمال الملف قانونيًا.)</p>
          : <table className="w-full border-collapse text-sm"><thead><tr><th className="border border-black bg-neutral-100 p-1.5 text-right">#</th><th className="border border-black bg-neutral-100 p-1.5 text-right">القسم</th><th className="border border-black bg-neutral-100 p-1.5 text-right">المطلوب/الناقص</th></tr></thead>
            <tbody>{pack.missing.map((m, k) => <tr key={k}><td className="border border-black p-1.5">{k + 1}</td><td className="border border-black p-1.5">{m.section}</td><td className="border border-black p-1.5">{m.text}</td></tr>)}</tbody></table>}
      </section>

      <section className="space-y-1 p-2 print:p-0" style={{ breakInside: "avoid" }}>
        <h2 className="border-b-2 border-black pb-1 text-lg font-bold">{pack.sections.length + 2}. حدود التحقق</h2>
        <ul className="list-disc space-y-1 ps-6 text-sm">{pack.disclaimers.map((d) => <li key={d}>{d}</li>)}</ul>
      </section>
    </article>
  );
}
