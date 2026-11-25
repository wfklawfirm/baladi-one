"use client";
import { useState } from "react";
import { Loader2, Paperclip, ScanSearch } from "lucide-react";
import { Doc, Sources, callBrain, type Src } from "./Answer";
import Mic from "@/components/Mic";

type Opt = { id: string; type: string; title: string; description: string; pros?: string; cons?: string; template: string };
type A = { doc_type?: string; summary?: string; validity?: string; validity_reason?: string; legal_basis?: string; authority?: string; decision_maker?: string; urgency?: string; required_signatures?: string[]; required_docs?: string[]; risks?: string; options?: Opt[]; recommended_option?: string; next_steps?: string[]; time_limits?: string; recommendations?: string; sources: Src[]; confidence: string };
const VALID: Record<string, [string, string]> = { valid: ["سليم ومكتمل", "bg-green-100 text-green-800"], invalid: ["ناقص أو مخالف", "bg-red-100 text-red-800"], needs_info: ["يلزمه معلومات إضافية", "bg-amber-100 text-amber-800"] };
const List = ({ title, items }: { title: string; items?: string[] }) => items?.length ? <div><h3 className="text-lg font-bold">{title}</h3><ul className="ms-5 list-disc text-base leading-8">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;
const Block = ({ title, text }: { title: string; text?: string }) => text ? <div><h3 className="text-lg font-bold">{title}</h3><p className="whitespace-pre-line text-base leading-8">{text}</p></div> : null;

export default function Analyzer({ initialText = "" }: { initialText?: string }) {
  const [text, setText] = useState(initialText); const [file, setFile] = useState<File | null>(null); const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [a, setA] = useState<A | null>(null);
  async function run(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setErr(""); setBusy(true); setA(null);
    const f = new FormData(); f.set("text", text); f.set("question", q); if (file) f.set("file", file);
    try { setA(await callBrain<A>("/api/brain/analyze", { method: "POST", body: f })); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  const v = VALID[a?.validity ?? ""];
  return (
    <div className="space-y-5">
      <form onSubmit={run} className="space-y-4 rounded-3xl border bg-background p-4 sm:p-5">
        <label htmlFor="an-text" className="block text-lg font-bold">اكتب أو الصق نص المعاملة</label>
        <div className="relative"><textarea id="an-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={12000} placeholder="مثال: ورد طلب من مواطن يطلب رخصة بناء لقطعة الأرض رقم ... أو اضغط على الميكروفون وتكلّم" className="w-full rounded-xl border-2 bg-background p-3 pe-16 text-lg outline-none focus:border-primary" />
          <Mic target="an-text" className="absolute bottom-3 end-2" /></div>
        <label className="flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed px-3 text-base"><Paperclip className="size-5" /><span className="truncate">{file ? file.name : "أو أرفق المعاملة كملف (PDF، Word، صورة)"}</span>
          <input type="file" className="sr-only" accept=".pdf,.docx,.txt,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <div className="flex gap-2"><input id="an-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} aria-label="سؤال محدد عن المعاملة (اختياري)" placeholder="هل عندك سؤال محدد عنها؟ (اختياري)" className="min-h-12 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 text-base outline-none focus:border-primary" /><Mic target="an-q" /></div>
        <button disabled={busy || (!text.trim() && !file)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-lg font-bold text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="size-5 animate-spin" /> : <ScanSearch className="size-5" />}{busy ? "نقرأ المعاملة، لحظة من فضلك…" : "اقرأ المعاملة وأخبرني ماذا أفعل"}</button>
      </form>
      {err && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-base text-destructive">{err} — حاول مرة أخرى بعد قليل.</p>}
      {a && (
        <div className="space-y-4">
          <section className="space-y-3 rounded-2xl border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{a.doc_type}</h2>{v && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${v[1]}`}>{v[0]}</span>}{a.urgency && <span className="rounded-full bg-accent px-3 py-1 text-sm">{a.urgency}</span>}</div>
            <Block title="ما خلاصة المعاملة؟" text={a.summary} /><Block title="هل هي سليمة قانونيًا؟" text={a.validity_reason} /><Block title="على أي نص تستند؟" text={a.legal_basis} />
            <Block title="من يحق له البتّ فيها؟" text={a.authority} /><Block title="ما المخاطر؟" text={a.risks} /><Block title="ما المهل؟" text={a.time_limits} />
            <List title="من يجب أن يوقّع؟" items={a.required_signatures} /><List title="ما الأوراق الناقصة أو المطلوبة؟" items={a.required_docs} /><List title="ماذا أفعل الآن؟" items={a.next_steps} /><Block title="نصيحتنا" text={a.recommendations} />
          </section>
          {!!a.options?.length && <h2 className="text-lg font-bold text-primary">اختر قرارًا جاهزًا</h2>}
          {a.options?.map((o) => (
            <div key={o.id} className="space-y-2">
              <div className={`rounded-2xl border bg-background p-4 ${a.recommended_option?.startsWith(o.id) ? "border-primary" : ""}`}>
                <h3 className="font-bold">{o.title}{a.recommended_option?.startsWith(o.id) && <span className="ms-2 rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground">ننصح به</span>}</h3>
                <p className="text-base leading-8">{o.description}</p>
                {o.pros && <p className="text-base text-green-800">إيجابياته: {o.pros}</p>}{o.cons && <p className="text-base text-red-800">سلبياته: {o.cons}</p>}
              </div>
              {o.template && <Doc title={`نص القرار: ${o.title}`} body={o.template} />}
            </div>
          ))}
          <Sources list={a.sources} confidence={a.confidence} />
        </div>
      )}
    </div>
  );
}
