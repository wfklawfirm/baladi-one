// Word (.docx) export of a generated procurement document, built with the `docx` library already used by the decision builder.
import { AlignmentType, Document, Footer, Header, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { SRC_LABEL } from "./generate";
import type { Block, Doc } from "./types";

const FONT = "Traditional Arabic";
const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, bold: o.bold, size: o.size ?? 26, color: o.color, font: FONT, rightToLeft: true, rtl: true } as ConstructorParameters<typeof TextRun>[0]);
const para = (text: string, o: { bold?: boolean; size?: number; center?: boolean; color?: string; after?: number } = {}) =>
  new Paragraph({ bidirectional: true, alignment: o.center ? AlignmentType.CENTER : AlignmentType.START, spacing: { after: o.after ?? 100, line: 340 }, children: [run(text, o)] });
const cell = (t: string, bold = false) => new TableCell({ children: [para(t, { bold, size: 22, after: 0 })] });
const table = (cols: string[] | null, rows: string[][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true,
  rows: [...(cols ? [new TableRow({ tableHeader: true, children: cols.map((c) => cell(c, true)) })] : []), ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, !cols && i === 0)) }))] } as ConstructorParameters<typeof Table>[0]);
const srcText = (s: { table: string; label: string; id: string }) => `${SRC_LABEL[s.table] ?? s.table} · ${s.label} (${s.id.slice(0, 8)})`;

function conv(b: Block): (Paragraph | Table)[] {
  switch (b.t) {
    case "heading": return [para(b.text, { bold: true, size: 30, after: 80 })];
    case "para": return [para(b.text)];
    case "note": return [para(b.text, { size: 22, color: "555555" })];
    case "kv": return [table(null, b.rows), para("", { after: 80 })];
    case "table": return [table(b.columns, b.rows), ...(b.note ? [para(b.note, { size: 22, color: "555555" })] : []), para("", { after: 80 })];
    case "recital": return [para(`${b.text} [المصدر: ${srcText(b.source)}]`)];
    case "legal": return b.lines.map((l) => para(`• ${l.topic}: ${l.text}${l.source ? ` [${srcText(l.source)}]` : ""}`, { color: l.status === "verified" ? undefined : "B45309" }));
    case "sign": return [para("", { after: 300 }), ...b.items.flatMap((s) => [para(s, { bold: true, center: true, after: 0 }), para("______________________", { center: true, after: 240 })])];
  }
}

export async function docToDocx(d: Doc): Promise<Buffer> {
  const wm = `${d.watermark} — لم تُعتمد`;
  const doc = new Document({
    creator: "BALADI ONE", title: d.title,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1021, right: 1021 } }, bidi: true } as never,
      headers: { default: new Header({ children: [para(wm, { bold: true, center: true, color: "B91C1C", size: 28 })] }) },
      footers: { default: new Footer({ children: [para(`${wm} — ${d.title}`, { center: true, size: 18, color: "666666" })] }) },
      children: [para(d.title, { bold: true, size: 36, center: true, after: 80 }), para(`بلدية ${d.municipality}`, { center: true }), ...d.blocks.flatMap(conv), para(d.footer, { size: 20, color: "555555" }),
        para("الحقول المعبّأة آليًا ومصادرها", { bold: true, size: 30 }), table(["الحقل", "القيمة", "السجل المصدر"], d.autofilled.map((a) => [a.label, a.value, srcText(a.source)])),
        para(`القالب: ${d.key} · الإصدار ${d.version}`, { size: 20, color: "555555" })],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
