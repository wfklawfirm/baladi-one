"use client";
import { useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Md, Doc, Sources, splitTemplates, callBrain, type Src } from "./Answer";

type Turn = { role: "user" | "assistant"; content: string; sources?: Src[]; confidence?: string };
const IDEAS = ["ما صلاحيات رئيس البلدية في منح رخص البناء؟", "كيف تُجرى المناقصة العمومية وما عتبات الشراء؟", "أنشئ نموذج قرار تعيين موظف مؤقت", "ما مهل الطعن بقرارات المجلس البلدي؟"];

export default function Assistant() {
  const [turns, setTurns] = useState<Turn[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  async function send(text: string) {
    const query = text.trim(); if (!query || busy) return;
    setErr(""); setBusy(true); setQ("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: query }]);
    try {
      const r = await callBrain<{ answer: string; sources: Src[]; confidence: string }>("/api/brain/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, history }) });
      setTurns((t) => [...t, { role: "assistant", content: r.answer, sources: r.sources, confidence: r.confidence }]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  }
  return (
    <div className="space-y-4">
      {!turns.length && <div className="grid gap-2 sm:grid-cols-2">{IDEAS.map((i) => <button key={i} onClick={() => send(i)} className="elev rounded-2xl border bg-background p-4 text-start text-sm leading-7 active:bg-muted">{i}</button>)}</div>}
      {turns.map((t, i) => {
        if (t.role === "user") return <p key={i} className="ms-auto w-fit max-w-[90%] rounded-2xl bg-primary px-4 py-3 text-sm leading-7 text-primary-foreground">{t.content}</p>;
        const { text, templates } = splitTemplates(t.content);
        return <div key={i} className="space-y-3 rounded-2xl border bg-background p-4"><Md>{text}</Md>{templates.map((d, k) => <Doc key={k} {...d} />)}<Sources list={t.sources ?? []} confidence={t.confidence} /></div>;
      })}
      {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />جاري البحث في القوانين والاجتهادات…</p>}
      {err && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}
      <div ref={end} />
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="sticky bottom-3 flex items-end gap-2 rounded-3xl border-2 bg-background p-2 shadow-lg">
        <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }} rows={2} maxLength={2000} placeholder="اسأل المساعد عن أي مسألة بلدية أو قانونية…" className="min-h-12 flex-1 resize-none bg-transparent p-2 text-base outline-none" />
        <button disabled={busy || !q.trim()} aria-label="إرسال" className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-40"><Send className="size-5 -scale-x-100" /></button>
      </form>
    </div>
  );
}
