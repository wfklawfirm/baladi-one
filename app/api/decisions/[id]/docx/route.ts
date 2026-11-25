import { AlignmentType, Document, Footer, Header, Packer, Paragraph, TextRun } from "docx";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidOk } from "@/lib/council";
import { renderDecision, type Block } from "@/lib/decisions/render";
import type { DraftData, TemplateContent } from "@/lib/decisions/model";

export const dynamic = "force-dynamic";
const FONT = "Traditional Arabic";
const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, bold: o.bold, size: o.size ?? 28, color: o.color, font: FONT, rightToLeft: true, rtl: true } as ConstructorParameters<typeof TextRun>[0]);
const para = (text: string, o: { bold?: boolean; size?: number; center?: boolean; color?: string; after?: number } = {}) =>
  new Paragraph({ bidirectional: true, alignment: o.center ? AlignmentType.CENTER : AlignmentType.BOTH, spacing: { after: o.after ?? 120, line: 360 }, children: [run(text, o)] });

function toParas(blocks: Block[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.t === "hdr") b.lines.forEach((l) => out.push(para(l, { bold: true, center: true, after: 0 })));
    else if (b.t === "title") out.push(para(b.text, { bold: true, size: 36, center: true, after: 200 }));
    else if (b.t === "subject") out.push(para(b.text, { bold: true }));
    else if (b.t === "transition") out.push(para(b.text, { bold: true, center: true }));
    else if (b.t === "clause") out.push(para(b.n ? `المادة ${b.n}: ${b.text}` : b.text));
    else if (b.t === "pending") out.push(para(b.text, { color: "B45309", size: 24 }));
    else if (b.t === "recital") out.push(para(b.text + (b.flag ? `  [${b.flag}]` : "")));
    else if (b.t === "sigs") { out.push(para("", { after: 300 })); b.items.forEach((s) => { out.push(para(s.role, { bold: true, center: true, after: 0 })); out.push(para(s.name, { center: true, after: 400 })); }); out.push(para(b.note, { center: true, size: 18, color: "666666" })); }
    else if (b.t === "attach") { out.push(para("المرفقات:", { bold: true })); b.items.forEach((a, i) => out.push(para(`${i + 1}. ${a}`))); }
    else out.push(para(b.text));
  }
  return out;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidOk(id)) return new Response("bad id", { status: 400 });
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { data: m } = await sb.from("staff_member").select("role").eq("user_id", user.id);
  if (!(m ?? []).some((x) => x.role === "mayor" || x.role === "admin")) return new Response("forbidden", { status: 403 });
  const { data: d } = await sb.from("municipal_decision").select("title,decision_no,year,legal_status,template_snapshot,draft_data,template_version_id").eq("id", id).maybeSingle();
  if (!d?.template_snapshot) return new Response("not found", { status: 404 });
  const { data: tpl } = d.template_version_id ? await sb.from("decision_template_version").select("status").eq("id", d.template_version_id).maybeSingle() : { data: null };
  const wantOfficial = new URL(req.url).searchParams.get("mode") === "official";
  const official = wantOfficial && d.legal_status !== "draft" && tpl?.status === "approved";
  const r = renderDecision({ snap: d.template_snapshot as TemplateContent, data: (d.draft_data ?? {}) as DraftData, title: d.title, mode: official ? "official" : "draft" });
  const doc = new Document({
    creator: "BALADI ONE", title: d.title,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1021, right: 1021 } }, bidi: true } as never,
      headers: { default: new Header({ children: r.watermark ? [para(r.watermark, { bold: true, center: true, color: "B91C1C", size: 26 })] : [new Paragraph({ children: [] })] }) },
      footers: { default: new Footer({ children: [para(r.watermark ? `${r.watermark} — قرار ${d.decision_no}/${d.year}` : `قرار ${d.decision_no}/${d.year}`, { center: true, size: 18, color: "666666" })] }) },
      children: toParas(r.blocks),
    }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="decision-${d.decision_no}-${d.year}${official ? "" : "-draft"}.docx"`, "cache-control": "no-store" } });
}
