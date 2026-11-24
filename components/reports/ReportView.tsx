import Emblem from "@/components/Emblem";
import type { ReportDoc } from "@/lib/reportBuild";

/** Print-optimised A4 rendering of a ReportDoc (Arabic shaping and RTL come from the browser's own text engine). */
export default function ReportView({ doc, maxRows = 200 }: { doc: ReportDoc; maxRows?: number }) {
  return (
    <article dir="rtl" lang="ar" className="report mx-auto max-w-[210mm] bg-white p-6 text-[13px] leading-6 text-black print:p-0">
      <header className="flex items-center justify-between gap-4 border-b-2 border-primary pb-3">
        <div className="flex items-center gap-3"><Emblem size={64} /><div><p className="text-lg font-bold">{doc.municipality}</p><h1 className="text-2xl font-bold text-primary">{doc.title}</h1></div></div>
        <dl className="text-xs leading-5"><div><dt className="inline font-bold">الفترة: </dt><dd className="inline">{doc.period}</dd></div><div><dt className="inline font-bold">تاريخ التوليد: </dt><dd className="inline" dir="ltr">{doc.generatedAt}</dd></div></dl>
      </header>
      <p className="my-3 rounded border border-[#b7791f] bg-[#fff8e6] px-3 py-1.5 font-bold text-[#8a5a00]">حالة المراجعة: {doc.reviewStatus}</p>
      <p className="mb-3 text-xs"><b>مصادر البيانات: </b><span dir="ltr">{doc.sources.join(" · ")}</span></p>

      <h2 className="mb-1 text-base font-bold text-primary">المؤشرات</h2>
      <table className="mb-4 w-full border-collapse"><tbody>
        {doc.kpis.map((k) => <tr key={k.label} className="break-inside-avoid border-b"><th className="w-[34%] py-1.5 pe-2 text-start font-semibold">{k.label}</th><td className="w-[22%] py-1.5 pe-2 font-bold">{k.value}</td><td className="py-1.5 text-xs text-gray-600">{k.note}</td></tr>)}
      </tbody></table>

      {doc.formulaNote && <p className="mb-4 rounded border bg-gray-50 p-2 text-xs"><b>معادلة المؤشر: </b>{doc.formulaNote}</p>}

      {doc.tables.map((t) => {
        const rows = t.rows.slice(0, maxRows);
        return (
          <section key={t.title} className="mb-4">
            <h2 className="mb-1 text-base font-bold text-primary">{t.title}</h2>
            <table className="w-full border-collapse text-xs">
              <thead><tr>{t.columns.map((c) => <th key={c} className="border bg-gray-100 px-1.5 py-1 text-start">{c}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="break-inside-avoid">{r.map((c, j) => <td key={j} className="border px-1.5 py-1 align-top">{c === null ? "—" : c}</td>)}</tr>)}</tbody>
            </table>
            {t.rows.length > maxRows && <p className="mt-1 text-xs text-gray-600">عُرض أول {maxRows} من {t.rows.length} صفًا. السجل الكامل في ملف Excel.</p>}
            {t.rows.length === 0 && <p className="mt-1 text-xs text-gray-600">لا سجلات.</p>}
            {t.note && <p className="mt-1 text-xs text-gray-600">{t.note}</p>}
          </section>
        );
      })}

      <section className="break-inside-avoid border-t-2 border-primary pt-2">
        <h2 className="mb-1 text-base font-bold text-primary">حدود البيانات</h2>
        <ul className="list-disc ps-5 text-xs">{doc.limits.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
    </article>
  );
}
