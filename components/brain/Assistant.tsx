"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Md, Doc, Sources, splitTemplates, callBrain, type Src } from "./Answer";
import Mic from "@/components/Mic";

type Turn = { role: "user" | "assistant"; content: string; sources?: Src[]; confidence?: string; clarify?: { questions: string[]; original: string } };
const IDEAS = ["هل يحق لي منح رخصة بناء بنفسي؟", "كيف أشتري بالمناقصة وما حدود المبالغ؟", "اكتب لي قرار تعيين موظف مؤقت", "كم يومًا للاعتراض على قرار المجلس البلدي؟"];

export default function Assistant({ ideas = IDEAS, ctx, auto, compact = false }: { ideas?: string[]; ctx?: Record<string, string | undefined>; auto?: { id: number; text: string } | null; compact?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const lastAuto = useRef(0);
  useEffect(() => { if (auto && auto.id !== lastAuto.current) { lastAuto.current = auto.id; void send(auto.text); } }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  // display: undefined → show the query; null → no user bubble (skipping the clarifying questions)
  async function send(text: string, o: { noClarify?: boolean; display?: string | null } = {}) {
    const query = text.trim(); if (!query || busy) return;
    setErr(""); setBusy(true); setQ("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    if (o.display !== null) setTurns((t) => [...t, { role: "user", content: o.display ?? query }]);
    try {
      const r = await callBrain<{ answer?: string; sources?: Src[]; confidence?: string; clarify?: string[] }>("/api/brain/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, history, noClarify: o.noClarify, ctx }) });
      if (r.clarify?.length) setTurns((t) => [...t, { role: "assistant", content: "أسئلة توضيحية:\n" + r.clarify!.map((x, i) => `${i + 1}. ${x}`).join("\n"), clarify: { questions: r.clarify!, original: query } }]);
      else setTurns((t) => [...t, { role: "assistant", content: r.answer ?? "", sources: r.sources, confidence: r.confidence }]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  }
  return (
    <div className="space-y-4">
      {!turns.length && <div className="space-y-2"><p className="text-base font-semibold">لا تعرف ماذا تكتب؟ اضغط على سؤال:</p><div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>{ideas.map((i) => <button key={i} onClick={() => send(i)} className="elev min-h-14 rounded-2xl border-2 bg-background p-4 text-start text-base leading-7 active:bg-muted">{i}</button>)}</div></div>}
      {turns.map((t, i) => {
        if (t.role === "user") return <p key={i} className="ms-auto w-fit max-w-[90%] rounded-2xl bg-primary px-4 py-3 text-base leading-7 text-primary-foreground">{t.content}</p>;
        if (t.clarify) return <ClarifyCard key={i} id={i} c={t.clarify} live={i === turns.length - 1 && !busy} onSend={(a) => send(a.length ? `${t.clarify!.original}\n\nتوضيحات:\n${a.map(([x, y]) => `- ${x} ${y}`).join("\n")}` : t.clarify!.original, { noClarify: true, display: a.length ? a.map(([, y]) => y).join("\n") : null })} />;
        const { text, templates } = splitTemplates(t.content);
        return <div key={i} className="space-y-3 rounded-2xl border bg-background p-4"><Md>{text}</Md>{templates.map((d, k) => <Doc key={k} {...d} />)}<Sources list={t.sources ?? []} confidence={t.confidence} /></div>;
      })}
      {busy && <p className="flex items-center gap-2 text-base text-muted-foreground"><Loader2 className="size-4 animate-spin" />نبحث لك في القوانين، لحظة من فضلك…</p>}
      {err && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-base text-destructive">{err} — حاول مرة أخرى بعد قليل.</p>}
      <div ref={end} />
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="sticky bottom-3 flex items-end gap-2 rounded-3xl border-2 bg-background p-2 shadow-lg">
        <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }} id="ask-q" rows={3} maxLength={2000} aria-label="اكتب سؤالك بكلماتك" placeholder="اكتب سؤالك بكلماتك، أو اضغط على الميكروفون وتكلّم…" className="min-h-12 flex-1 resize-none bg-transparent p-2 text-lg outline-none" />
        <Mic target="ask-q" />
        <button disabled={busy || !q.trim()} aria-label="أرسل السؤال" className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-40"><Send className="size-5 -scale-x-100" /></button>
      </form>
    </div>
  );
}

function ClarifyCard({ id, c, live, onSend }: { id: number; c: { questions: string[]; original: string }; live: boolean; onSend: (a: [string, string][]) => void }) {
  const [ans, setAns] = useState<string[]>(() => c.questions.map(() => ""));
  const filled = c.questions.map((q, k) => [q, ans[k].trim()] as [string, string]).filter(([, a]) => a);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (live && filled.length) onSend(filled); }} className="space-y-3 rounded-2xl border bg-background p-4">
      <p className="text-base font-semibold">لأجيبك بدقة أكبر، أحتاج توضيحاً بسيطاً:</p>
      {c.questions.map((q, k) => (
        <div key={k} className="space-y-1.5">
          <label htmlFor={`cl-${id}-${k}`} className="block text-base leading-7">{k + 1}. {q}</label>
          <div className="flex items-center gap-2">
            <input id={`cl-${id}-${k}`} value={ans[k]} disabled={!live} maxLength={300} onChange={(e) => setAns((a) => a.map((x, j) => (j === k ? e.target.value : x)))} className="min-h-11 flex-1 rounded-xl border bg-background px-3 text-base outline-none disabled:opacity-60" />
            {live && <Mic target={`cl-${id}-${k}`} />}
          </div>
        </div>
      ))}
      {live && (
        <div className="flex flex-wrap gap-2">
          <button disabled={!filled.length} className="min-h-12 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground disabled:opacity-40">أجب الآن</button>
          <button type="button" onClick={() => onSend([])} className="min-h-12 rounded-xl border-2 px-5 text-base active:bg-muted">تخطَّ وأجب مباشرة</button>
        </div>
      )}
    </form>
  );
}
