"use client";
import { useState } from "react";
import { Loader2, FileSignature } from "lucide-react";
import { Doc, Md, Sources, splitTemplates, callBrain, type Src } from "./Answer";
import Mic from "@/components/Mic";

const KINDS = ["قرار مجلس بلدي", "قرار رئيس البلدية", "كتاب رسمي", "محضر جلسة", "عقد", "إذن / ترخيص", "تكليف / تعيين"];
export default function DecisionGen() {
  const [kind, setKind] = useState(KINDS[0]); const [subject, setSubject] = useState(""); const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [r, setR] = useState<{ answer: string; sources: Src[]; confidence: string } | null>(null);
  async function run(e: React.FormEvent) {
    e.preventDefault(); if (busy || !subject.trim()) return; setBusy(true); setErr(""); setR(null);
    const query = `أنشئ نموذج ${kind} رسمي كامل جاهز للتوقيع بخصوص: ${subject.trim()}.${details.trim() ? `\nالتفاصيل والوقائع: ${details.trim()}` : ""}\nاذكر السند القانوني والمواد المنطبقة وأي موافقات مطلوبة.`;
    try { setR(await callBrain("/api/brain/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, noClarify: true }) })); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  const parts = r ? splitTemplates(r.answer) : null;
  return (
    <div className="space-y-5">
      <form onSubmit={run} className="space-y-3 rounded-2xl border bg-background p-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع الوثيقة">{KINDS.map((k) => <button type="button" role="radio" aria-checked={kind === k} key={k} onClick={() => setKind(k)} className={`rounded-full border px-4 py-2 text-sm ${kind === k ? "bg-primary text-primary-foreground" : "bg-background"}`}>{k}</button>)}</div>
        <div className="flex gap-2"><input id="dg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} placeholder="موضوع القرار (مثال: تلزيم أعمال تعبيد طريق)" className="min-h-12 min-w-0 flex-1 rounded-xl border bg-background px-3" /><Mic target="dg-subject" /></div>
        <div className="relative"><textarea id="dg-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={1500} placeholder="وقائع وتفاصيل (اختياري): الأسماء، التواريخ، العقار، الجهة…" className="w-full rounded-xl border bg-background p-3 pe-16" />
          <Mic target="dg-details" className="absolute bottom-3 end-2" /></div>
        <button disabled={busy || !subject.trim()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="size-5 animate-spin" /> : <FileSignature className="size-5" />}{busy ? "جاري إعداد المسودة…" : "أنشئ المسودة"}</button>
      </form>
      {err && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}
      {r && parts && (
        <div className="space-y-3">
          {parts.templates.map((d, i) => <Doc key={i} {...d} />)}
          {parts.text && <div className="rounded-2xl border bg-background p-4"><Md>{parts.text}</Md></div>}
          <Sources list={r.sources} confidence={r.confidence} />
          <p className="text-xs text-muted-foreground">مسودة للاستئناس وتُراجَع قانونياً قبل التوقيع.</p>
        </div>
      )}
    </div>
  );
}
