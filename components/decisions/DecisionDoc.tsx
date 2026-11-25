import type { Rendered } from "@/lib/decisions/render";

/** Official RTL layout. Plain, no promotional elements; the municipality's letterhead lines come from the register data only. */
export default function DecisionDoc({ r, print = false }: { r: Rendered; print?: boolean }) {
  return (
    <article dir="rtl" lang="ar" className={`relative mx-auto bg-white text-black ${print ? "" : "w-full max-w-[210mm] rounded-xl border p-4 shadow-sm md:p-8"}`} style={{ fontFamily: "'Amiri','Noto Naskh Arabic','Traditional Arabic',serif", lineHeight: 2, fontSize: print ? "14pt" : "12pt", overflowWrap: "anywhere" }}>
      {r.watermark && <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"><span className="-rotate-[30deg] whitespace-nowrap text-center text-[90px] font-bold tracking-widest text-neutral-400/20 print:text-neutral-400/30">{r.watermark}</span></div>}
      <div className="relative">
        {r.blocks.map((b, i) => {
          switch (b.t) {
            case "hdr": return <div key={i} className="mb-4 text-center font-bold">{r.logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.logo} alt="" className="mx-auto mb-2 h-20 w-auto object-contain" />}{b.lines.map((l, j) => <div key={j}>{l}</div>)}</div>;
            case "title": return <h1 key={i} className="my-3 text-center text-[1.35em] font-bold underline underline-offset-4">{b.text}</h1>;
            case "subject": return <p key={i} className="mb-3 font-bold">{b.text}</p>;
            case "p": return <p key={i} className="text-justify">{b.text}</p>;
            case "recital": return <p key={i} className="text-justify">{b.text}{b.flag && <span className="mx-1 rounded bg-amber-100 px-1 text-[9pt] font-sans text-amber-900 print:hidden">{b.flag}</span>}</p>;
            case "transition": return <p key={i} className="my-3 text-center font-bold">{b.text}</p>;
            case "clause": return <p key={i} className="text-justify">{b.n !== null && <b>المادة {b.n}: </b>}{b.text}</p>;
            case "closing": return <p key={i} className="text-justify">{b.text}</p>;
            case "fin": return <p key={i} className="text-justify">{b.text}</p>;
            case "pending": return <p key={i} className="rounded bg-amber-50 px-2 text-[11pt] font-sans text-amber-900 print:bg-transparent">{b.text}</p>;
            case "sigs": return <div key={i} className="mt-8"><div className="flex justify-around gap-6 text-center">{b.items.map((s, j) => <div key={j}><div className="font-bold">{s.role}</div><div>{s.name}</div><div className="mt-10">………………………</div></div>)}</div><p className="mt-6 text-center font-sans text-[9pt] text-neutral-600 print:text-neutral-500">{b.note}</p></div>;
            case "attach": return <div key={i} className="mt-6"><b>المرفقات:</b><ol className="list-decimal pe-6">{b.items.map((a, j) => <li key={j}>{a}</li>)}</ol></div>;
          }
        })}
      </div>
    </article>
  );
}
