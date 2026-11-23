import { FileText, ListChecks, Landmark, Clock, Wallet } from "lucide-react";
import { pick, t } from "@/lib/i18n";
import type { Lang, Service } from "@/lib/types";

/** Shared service-card content. `scale` sets text sizing: "kiosk" = large, "mobile" = normal. */
export function ServiceBody({ s, lang, scale }: { s: Service; lang: Lang; scale: "kiosk" | "mobile" }) {
  const big = scale === "kiosk";
  const h = big ? "text-[1.35rem] font-bold" : "text-base font-bold";
  const p = big ? "text-[1.3rem] leading-relaxed" : "text-[0.95rem]";
  const Row = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <section className="rounded-2xl border bg-background p-4 elev">
      <h3 className={`mb-2 flex items-center gap-2 text-primary ${h}`}>{icon}{title}</h3>
      <div className={p}>{children}</div>
    </section>
  );
  return (
    <div className={`grid gap-3 ${big ? "grid-cols-2" : "grid-cols-1"}`}>
      {s.documents.length > 0 && (
        <Row icon={<FileText className="size-5" />} title={t(lang, "documents")}>
          <ul className="list-disc space-y-1 ps-6">{s.documents.map((d, i) => <li key={i}>{pick(lang, d)}</li>)}</ul>
        </Row>
      )}
      {s.steps.length > 0 && (
        <Row icon={<ListChecks className="size-5" />} title={t(lang, "steps")}>
          <ol className="list-decimal space-y-1 ps-6">{s.steps.map((d, i) => <li key={i}>{pick(lang, d)}</li>)}</ol>
        </Row>
      )}
      {s.authority && <Row icon={<Landmark className="size-5" />} title={t(lang, "authority")}>{pick(lang, s.authority)}</Row>}
      {s.processingTime && <Row icon={<Clock className="size-5" />} title={t(lang, "processingTime")}>{pick(lang, s.processingTime)}</Row>}
      {s.fees && !s.demo && <Row icon={<Wallet className="size-5" />} title={t(lang, "fees")}>{pick(lang, s.fees)}</Row>}
      {s.sources.length > 0 && (
        <p className={`col-span-full text-muted-foreground ${big ? "text-[1.05rem]" : "text-sm"}`}>
          {t(lang, "sources")}: {s.sources.map((x) => x.title).join(" · ")}
          {s.reviewedOn ? ` — ${t(lang, "reviewedOn")}: ${s.reviewedOn}` : ""}
        </p>
      )}
    </div>
  );
}
