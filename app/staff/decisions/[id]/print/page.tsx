import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import DecisionDoc from "@/components/decisions/DecisionDoc";
import PrintButton from "@/components/decisions/PrintButton";
import { uuidOk } from "@/lib/council";
import { renderDecision } from "@/lib/decisions/render";
import type { DraftData, TemplateContent } from "@/lib/decisions/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "طباعة القرار — BALADI ONE", referrer: "no-referrer" as const };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const sp = await searchParams;
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { data: d } = await sb.from("municipal_decision").select("title,legal_status,template_snapshot,draft_data,template_version_id").eq("id", id).maybeSingle();
  if (!d?.template_snapshot) notFound();
  const { data: tpl } = d.template_version_id ? await sb.from("decision_template_version").select("status").eq("id", d.template_version_id).maybeSingle() : { data: null };
  // The official copy is only produced for an adopted decision whose template is approved; everything else is a watermarked draft.
  const official = sp.mode === "official" && d.legal_status !== "draft" && tpl?.status === "approved";
  const r = renderDecision({ snap: d.template_snapshot as TemplateContent, data: (d.draft_data ?? {}) as DraftData, title: d.title, mode: official ? "official" : "draft" });
  return (
    <div className="bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page{size:A4;margin:20mm 18mm}@media print{header,nav,.no-print{display:none!important}body{background:#fff}}`}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center gap-2 text-sm" dir="rtl">
        <PrintButton />
        <a className="min-h-10 rounded-xl border bg-white px-3 py-2" href={`/api/decisions/${id}/docx${official ? "?mode=official" : ""}`}>تنزيل Word قابل للتحرير</a>
        <a className="min-h-10 rounded-xl border bg-white px-3 py-2" href={`/staff/decisions/${id}`}>رجوع للمحرر</a>
        <span className="text-muted-foreground">{official ? "نسخة رسمية معتمدة" : "مسودة بعلامة مائية"}{r.missing.length && official === false ? ` — ${r.missing.length} حقل ناقص` : ""}</span>
        {sp.mode === "official" && !official && <span className="font-semibold text-destructive">النسخة الرسمية غير متاحة: القرار لم يُعتمد أو قالبه غير معتمد قانونيًا.</span>}
      </div>
      <DecisionDoc r={r} print />
    </div>
  );
}
