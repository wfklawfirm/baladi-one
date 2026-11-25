"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Printer } from "lucide-react";

const TPL = /<TEMPLATE:([^>]*)>([\s\S]*?)<\/TEMPLATE>/g;
export function splitTemplates(s: string) {
  const templates: { title: string; body: string }[] = [];
  const text = s.replace(TPL, (_, title, body) => { templates.push({ title: title.trim(), body: body.trim() }); return ""; }).trim();
  return { text, templates };
}

export function Doc({ title, body }: { title: string; body: string }) {
  const [done, setDone] = useState(false);
  const print = () => {
    const w = window.open("", "_blank"); if (!w) return;
    const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    w.document.write(`<html dir="rtl" lang="ar"><head><title>${title.replace(/</g, "")}</title><style>body{font-family:serif;font-size:16pt;line-height:2;padding:2cm;white-space:pre-wrap}</style></head><body>${esc}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <section className="space-y-3 rounded-2xl border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-primary">{title}</h3>
        <div className="flex gap-2">
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(body); setDone(true); setTimeout(() => setDone(false), 1500); }} className="flex min-h-12 items-center gap-1.5 rounded-xl border px-3 text-base active:bg-muted">{done ? <Check className="size-4" /> : <Copy className="size-4" />}{done ? "تم النسخ" : "نسخ"}</button>
          <button type="button" onClick={print} className="flex min-h-12 items-center gap-1.5 rounded-xl border px-3 text-base active:bg-muted"><Printer className="size-4" />طباعة</button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 font-[inherit] text-base leading-8">{body}</pre>
    </section>
  );
}

export function Md({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-base leading-8 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-primary [&_li]:ms-5 [&_ol]:list-decimal [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_ul]:list-disc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export const CONF: Record<string, string> = { high: "نثق بهذه الإجابة كثيرًا", medium: "نثق بها بدرجة متوسطة", low: "تحقق منها قبل الاعتماد عليها" };
export type Src = { title: string; preview: string; domain: string; score: number };
export function Sources({ list, confidence }: { list: Src[]; confidence?: string }) {
  if (!list?.length) return null;
  return (
    <details className="rounded-xl border bg-background p-3 text-base">
      <summary className="cursor-pointer font-semibold">من أين جاء هذا؟ ({list.length}){confidence ? ` · ${CONF[confidence] ?? ""}` : ""}</summary>
      <ul className="mt-2 space-y-2">{list.map((s, i) => <li key={i}><b>{s.title}</b> <span className="text-sm text-muted-foreground">· {s.domain}</span><p className="text-sm leading-7 text-muted-foreground">{s.preview}…</p></li>)}</ul>
    </details>
  );
}

export async function callBrain<T>(url: string, init: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "حدث خطأ، حاول مجدداً");
  return j as T;
}
