import Link from "next/link";
import { METHOD } from "@/lib/council";
import { WF_PENDING_NOTE, applicableTabs, buildChecklist, canFinish, nextAction, progress, sortStages, stageByKey, transitionsFrom, type FileCheck, type FileStatus, type WfStage, type WfTransition, type WfTab } from "@/lib/procurementWorkflow";
import { advanceFile, cancelFile, finishFile, restartFile, returnFile } from "@/app/staff/procurement/file/[planItemId]/actions";
import WorkflowChecklist from "./WorkflowChecklist";

const fld = "min-h-12 rounded-xl border-2 bg-background px-2";
const btn = "min-h-12 rounded-xl border px-4 text-sm font-semibold active:bg-muted";
export type WfHistory = { id: string; action: string; from_key: string | null; to_key: string | null; note: string | null; at: string; cycle: number };
const ACTION: Record<string, string> = { start: "بدء المسار", advance: "انتقال", return: "إرجاع", cancel: "إلغاء", restart: "إعادة تشغيل", finish: "إنهاء" };
const STATUS: Record<string, string> = { active: "نشط", cancelled: "ملغى", completed: "منتهٍ" };

export default function WorkflowFile(p: {
  itemId: string; title: string; method: string; status: FileStatus; cycle: number; currentKey: string;
  stages: WfStage[]; transitions: WfTransition[]; checks: FileCheck[]; history: WfHistory[]; today: string; tab: WfTab["id"];
}) {
  const stages = sortStages(p.stages), label = (k: string | null) => (k ? stageByKey(stages, k)?.label_ar ?? k : "—");
  const rows = buildChecklist(stages, p.checks, p.currentKey, p.today), pr = progress(rows), next = nextAction(stages, p.transitions, p.checks, p.currentKey);
  const tabs = applicableTabs(stages), tab = tabs.some((t) => t.id === p.tab) ? p.tab : "overview", active = p.status === "active";
  const fwd = transitionsFrom(p.transitions, p.currentKey, "forward"), back = transitionsFrom(p.transitions, p.currentKey, "return");
  const fin = canFinish(p.transitions, p.checks, p.currentKey, p.status).ok;
  return (
    <div className="space-y-4">
      <header className="space-y-1"><h1 className="text-2xl font-bold">ملف الشراء: {p.title}</h1>
        <p className="text-sm text-muted-foreground">الأسلوب: {METHOD[p.method] ?? p.method} · الحالة: {STATUS[p.status]} · الدورة {p.cycle} · المنجز {pr.done}/{pr.total}</p></header>
      <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{WF_PENDING_NOTE}</p>
      <nav aria-label="أقسام الملف" className="flex flex-wrap gap-2">{tabs.map((t) => (
        <Link key={t.id} href={t.id === "bids" ? `/staff/procurement/bids/${p.itemId}` : `?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined}
          className={`min-h-12 rounded-xl border px-4 py-3 text-sm font-semibold ${t.id === tab ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{t.label}</Link>))}</nav>

      {tab === "overview" && <>
        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold text-primary">المرحلة الحالية: {label(p.currentKey)}</h2>
          <ol className="flex flex-wrap gap-1 text-xs">{stages.map((s) => <li key={s.key} className={`rounded-full border px-2 py-1 ${s.key === p.currentKey ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{s.label_ar}</li>)}</ol></section>
        {next && active && <section className="space-y-2 rounded-2xl border-2 border-primary p-4"><h2 className="font-bold text-primary">ما الإجراء التالي؟</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">من المسؤول؟</dt><dd className="font-semibold">{next.who}</dd></div><div><dt className="text-muted-foreground">لماذا؟</dt><dd className="font-semibold">{next.why}</dd></div><div><dt className="text-muted-foreground">المستند المطلوب</dt><dd className="font-semibold">{next.document}</dd></div></dl>
          {next.missingEvidence && <p className="text-sm text-amber-900">لا إثبات مسجَّل لهذه المرحلة بعد: سجّلوه في «قائمة التحقق» قبل الانتقال.</p>}
          {next.reviewPending && <p className="text-xs text-muted-foreground">هذا النص إجرائي مقترح وليس رأيًا قانونيًا.</p>}</section>}
        {active && <section className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold text-primary">الانتقال</h2>
          {fwd.length === 0 ? (fin ? <form action={finishFile}><input type="hidden" name="item" value={p.itemId} /><button className={btn}>إنهاء الملف</button></form> : <p className="text-sm text-muted-foreground">آخر مرحلة: أكملوها بإثبات لإنهاء الملف.</p>) :
            fwd.map((t) => <form key={t.to_key} action={advanceFile} className="flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={p.itemId} /><input type="hidden" name="to" value={t.to_key} />
              <label className="text-sm">ملاحظة<input name="note" maxLength={1000} className={`${fld} block`} /></label><button className={btn}>انتقال إلى: {label(t.to_key)}</button></form>)}
          {back.map((t) => <form key={t.to_key} action={returnFile} className="flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={p.itemId} /><input type="hidden" name="to" value={t.to_key} />
            <label className="text-sm">سبب الإرجاع (مطلوب)<input name="reason" required maxLength={1000} className={`${fld} block`} /></label><button className={btn}>إرجاع إلى: {label(t.to_key)}</button></form>)}
          <form action={cancelFile} className="flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={p.itemId} />
            <label className="text-sm">سبب الإلغاء (مطلوب)<input name="reason" required maxLength={1000} className={`${fld} block`} /></label><button className={btn}>إلغاء الملف</button></form></section>}
        {p.status === "cancelled" && <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold text-primary">إعادة التشغيل</h2>
          <p className="text-sm text-muted-foreground">يبدأ المسار من أوله بدورة جديدة ويبقى السجل السابق محفوظًا.</p>
          <form action={restartFile} className="flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={p.itemId} />
            <label className="text-sm">السبب (مطلوب)<input name="reason" required maxLength={1000} className={`${fld} block`} /></label><button className={btn}>إعادة تشغيل</button></form></section>}
      </>}
      {tab === "checklist" && <WorkflowChecklist itemId={p.itemId} rows={rows} editable={active} />}
      {tab === "history" && <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold text-primary">سجل الانتقالات</h2>
        {p.history.length === 0 ? <p className="text-sm text-muted-foreground">لا سجل بعد.</p> : <ul className="space-y-1.5 text-sm">{p.history.map((h) => <li key={h.id} className="border-b py-1.5 last:border-0">
          <b>{ACTION[h.action] ?? h.action}</b> · {h.from_key ? `${label(h.from_key)} ← ` : ""}{label(h.to_key)} · دورة {h.cycle} · <span className="text-muted-foreground">{new Intl.DateTimeFormat("ar-LB-u-nu-latn", { timeZone: "Asia/Beirut", dateStyle: "medium", timeStyle: "short" }).format(new Date(h.at))}</span>{h.note && <span className="block text-muted-foreground">{h.note}</span>}</li>)}</ul>}</section>}
    </div>
  );
}
