// Printable A4 RTL HTML for a generated procurement document. Pure; every value is escaped.
import { SRC_LABEL } from "./generate";
import type { Block, Doc } from "./types";

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const src = (s: { table: string; label: string; id: string }) => `${esc(SRC_LABEL[s.table] ?? s.table)} · ${esc(s.label)} <span class="id">(${esc(s.id.slice(0, 8))})</span>`;

export const CSS = `.pd{font-family:'Traditional Arabic','Amiri','Noto Naskh Arabic',serif;font-size:14pt;line-height:1.9;color:#111;background:#fff;max-width:210mm;margin:0 auto;padding:16mm 18mm;position:relative;box-sizing:border-box}
.pd .wm{position:fixed;top:42%;left:0;right:0;text-align:center;font-size:130pt;font-weight:700;color:#b91c1c;opacity:.09;transform:rotate(-28deg);pointer-events:none;z-index:0}
.pd>*:not(.wm){position:relative;z-index:1}
.pd h1{text-align:center;font-size:20pt;margin:0 0 4mm}.pd h2{font-size:15pt;margin:6mm 0 2mm;border-bottom:1px solid #999}
.pd .draft{text-align:center;color:#b91c1c;font-weight:700;border:1.5px solid #b91c1c;padding:1mm;margin-bottom:4mm}
.pd table{width:100%;border-collapse:collapse;margin:2mm 0;font-size:12pt}.pd th,.pd td{border:1px solid #444;padding:1.5mm 2mm;vertical-align:top;text-align:right}.pd th{background:#eee}
.pd td.k{width:34%;font-weight:700;background:#f7f7f7}.pd .note{font-size:11pt;color:#444}.pd .rec{margin:1mm 0}.pd .id{font-family:monospace;color:#666}.pd .src{font-size:10.5pt;color:#555}
.pd .sign{display:flex;flex-wrap:wrap;gap:8mm;margin-top:14mm}.pd .sign div{flex:1 1 40mm;text-align:center;border-top:1px solid #000;padding-top:2mm;min-width:40mm}
.pd .need{color:#92400e;font-weight:700}.pd .ok{color:#166534}.pd .foot{margin-top:8mm;font-size:10.5pt;color:#555;border-top:1px solid #999;padding-top:2mm}
.pd .appx{page-break-before:always}@page{size:A4;margin:12mm}@media print{.no-print{display:none!important}}`;

function block(b: Block): string {
  switch (b.t) {
    case "heading": return `<h2>${esc(b.text)}</h2>`;
    case "para": return `<p>${esc(b.text)}</p>`;
    case "note": return `<p class="note">${esc(b.text)}</p>`;
    case "kv": return `<table><tbody>${b.rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v) || "&nbsp;"}</td></tr>`).join("")}</tbody></table>`;
    case "table": return `<table><thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v) || "&nbsp;"}</td>`).join("")}</tr>`).join("")}</tbody></table>${b.note ? `<p class="note">${esc(b.note)}</p>` : ""}`;
    case "recital": return `<p class="rec">${esc(b.text)} <span class="src">[المصدر: ${src(b.source)}]</span></p>`;
    case "legal": return `<ul>${b.lines.map((l) => `<li><b>${esc(l.topic)}:</b> <span class="${l.status === "verified" ? "ok" : "need"}">${esc(l.text)}</span>${l.source ? ` <span class="src">[${src(l.source)}]</span>` : ""}</li>`).join("")}</ul>`;
    case "sign": return `<div class="sign">${b.items.map((s) => `<div>${esc(s)}<br>&nbsp;</div>`).join("")}</div>`;
  }
}

/** Fragment (div) for embedding, or a full document when `full` is true. */
export function renderHtml(d: Doc, opts: { full?: boolean; recordId?: string | null } = {}): string {
  const appendix = `<div class="appx"><h2>الحقول المعبّأة آليًا ومصادرها</h2><table><thead><tr><th>الحقل</th><th>القيمة</th><th>السجل المصدر</th></tr></thead><tbody>${d.autofilled.map((a) => `<tr><td>${esc(a.label)}</td><td>${esc(a.value)}</td><td>${src(a.source)}</td></tr>`).join("")}</tbody></table>
<h2>السجلات المستخدمة</h2><ul>${d.sources.map((s) => `<li>${src(s)}</li>`).join("")}</ul>
<p class="note">القالب: ${esc(d.key)} · الإصدار ${esc(d.version)}${opts.recordId ? ` · سجل التوليد ${esc(opts.recordId.slice(0, 8))}` : " · غير مسجَّل بعد"}</p></div>`;
  const body = `<div class="pd" dir="rtl" lang="ar"><div class="wm" aria-hidden="true">${esc(d.watermark)}</div><div class="draft">${esc(d.watermark)} — لم تُعتمد</div><h1>${esc(d.title)}</h1><p style="text-align:center">بلدية ${esc(d.municipality)}</p>${d.blocks.map(block).join("")}<p class="foot">${esc(d.footer)}</p>${appendix}</div>`;
  if (!opts.full) return `<style>${CSS}</style>${body}`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${CSS}</style></head><body style="margin:0;background:#fff">${body}</body></html>`;
}
