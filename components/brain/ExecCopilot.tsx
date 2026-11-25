"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles, X, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import Assistant from "./Assistant";

const IDEAS: [string, string[]][] = [
  ["/staff/operations", ["حلّل أداء البلدية في الفترة المحددة", "ما الأولويات الحالية؟", "ما المؤشرات المتراجعة؟", "حضّر موجزًا تنفيذيًا قصيرًا"]],
  ["/staff/council", ["ما الإجراءات المطلوبة لإدراج موضوع على جدول أعمال المجلس؟", "ما مهل الطعن بقرارات المجلس البلدي؟", "راجع الأساس القانوني لقرار اتخاذه المجلس"]],
  ["/staff/collections", ["ما الرسوم والأنظمة المتعلقة بالتحصيل البلدي؟"]],
];
const DEFAULT = ["ما صلاحيات رئيس البلدية في هذه المسألة؟", "اشرح الإجراء القانوني المطلوب", "حضّر مسودة كتاب رسمي"];

/** Floating executive copilot (bottom-left): side panel that keeps the page and filters untouched. Context is sent as a hint only; the server recomputes any figures. */
export default function ExecCopilot() {
  const path = usePathname(); const sp = useSearchParams();
  const [open, setOpen] = useState(false); const [wide, setWide] = useState(false); const [session, setSession] = useState(0);
  const [auto, setAuto] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    const h = (e: Event) => { const p = (e as CustomEvent).detail?.prompt; if (typeof p === "string") { setOpen(true); setAuto({ id: Date.now(), text: p }); } };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("copilot:ask", h); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("copilot:ask", h); window.removeEventListener("keydown", k); };
  }, []);
  const ideas = IDEAS.find(([p]) => path.startsWith(p))?.[1] ?? DEFAULT;
  const ctx = { path, p: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined };
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="المساعد البلدي الذكي" title="المساعد البلدي الذكي" className="fixed bottom-4 left-4 z-40 grid size-12 sm:size-14 sm:bottom-5 sm:left-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg active:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-focus)] print:hidden">
          <Sparkles className="size-7" aria-hidden />
        </button>
      )}
      {open && (
        <aside dir="rtl" role="dialog" aria-label="المساعد التنفيذي الذكي" className={`fixed inset-y-0 left-0 z-50 flex w-full flex-col border-e bg-background shadow-2xl print:hidden ${wide ? "sm:w-[760px]" : "sm:w-[440px]"}`}>
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">BALADI AI</p><h2 className="truncate font-bold">المساعد التنفيذي الذكي</h2></div>
            <button type="button" onClick={() => { setSession((s) => s + 1); setAuto(null); }} aria-label="محادثة جديدة" title="محادثة جديدة" className="grid size-10 place-items-center rounded-lg active:bg-muted"><RotateCcw className="size-5" /></button>
            <button type="button" onClick={() => setWide((w) => !w)} aria-label={wide ? "تصغير" : "توسيع"} className="hidden size-10 place-items-center rounded-lg active:bg-muted sm:grid">{wide ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}</button>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="grid size-10 place-items-center rounded-lg active:bg-muted"><X className="size-6" /></button>
          </header>
          <div className="flex-1 overflow-y-auto p-4"><Assistant key={session} ideas={ideas} ctx={ctx} auto={auto} compact /></div>
          <p className="border-t px-4 py-2 text-[11px] leading-5 text-muted-foreground">يقترح المساعد ويصوغ المسودات فقط؛ لا يعتمد قرارًا ولا ينفّذ إجراءً. راجع المصادر قبل الاعتماد.</p>
        </aside>
      )}
    </>
  );
}
