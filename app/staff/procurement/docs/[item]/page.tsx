import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import DocDecisionDraft, { type LinkedDecision } from "@/components/procurement/DocDecisionDraft";
import { safe } from "@/components/projects/procurement/data";
import { uuidOk } from "@/lib/council";
import { bestVersions, loadTemplates } from "@/lib/decisions/load";
import { loadDocInput } from "@/lib/procurementDocs/load";
import { generateDoc } from "@/lib/procurementDocs/generate";
import { DOC_KEYS } from "@/lib/procurementDocs/types";
import { DOC_TITLE } from "@/lib/procurementDocs/generate";
import { generateProcDoc } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "مستندات الشراء — BALADI ONE", referrer: "no-referrer" as const };
const ERR: Record<string, string> = { no_matching_template: "القالب المختار ليس من مجال الشراء العام.", template_unavailable: "القالب غير متاح للاستخدام.", not_found: "العنصر غير موجود.", forbidden: "غير مسموح لهذا الحساب.", pending: "قيد التفعيل: بانتظار تطبيق ترحيل قاعدة البيانات 0045.", "1": "تعذّر تنفيذ العملية." };

export default async function Page({ params, searchParams }: { params: Promise<{ item: string }>; searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { item } = await params, sp = await searchParams;
  if (!uuidOk(item)) notFound();
  const input = await loadDocInput(sb, item, null);
  if (!input) notFound();
  const [{ rows }, sess, links] = await Promise.all([
    loadTemplates(sb),
    safe<{ id: string; session_no: string | null; title: string; held_on: string }>(sb.from("council_session").select("id,session_no,title,held_on").order("held_on", { ascending: false }).limit(30)),
    safe<{ decision_id: string }>(sb.from("procurement_plan_decision").select("decision_id").eq("plan_item_id", item)),
  ]);
  const tpls = bestVersions(rows).filter((t) => t.domain === "procurement" && (t.status === "approved" || t.status === "pending_legal_review"));
  const ids = links.data.map((l) => l.decision_id);
  const decs = ids.length ? await safe<{ id: string; title: string; decision_no: string; year: number }>(sb.from("municipal_decision").select("id,title,decision_no,year").in("id", ids)) : { data: [] };
  const linked: LinkedDecision[] = ids.map((id) => { const d = decs.data.find((x) => x.id === id); return { decision_id: id, title: d?.title ?? null, decision_no: d?.decision_no ?? null, year: d?.year ?? null }; });
  return (
    <><StaffHeader back="/staff/projects/procurement" backLabel="خطة الشراء" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">مستندات الشراء: {input.item.title}</h1>
      <p className="text-sm text-muted-foreground">كل مستند مسودة بعلامة مائية، يُعبَّأ من سجلات النظام وتُذكر مصادر كل حقل، ويرفض النظام توليده إذا نقص حقل إلزامي. المراجع القانونية لا تظهر إلا إذا كانت متحقَّقًا منها.</p>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{ERR[sp.err] ?? ERR["1"]}</p>}
      <ul className="space-y-2">{DOC_KEYS.map((k) => {
        const r = generateDoc(k, { ...input, bidderBidId: input.bids[0]?.id ?? null });
        return (
          <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
            <div className="min-w-0"><b>{DOC_TITLE[k]}</b>{r.ok ? <p className="text-sm text-green-800">جاهز للتوليد</p> : <p className="text-sm text-amber-900">ناقص: {r.missing.map((m) => m.label).join("، ")}</p>}</div>
            <form action={generateProcDoc} className="flex items-center gap-2"><input type="hidden" name="item" value={item} /><input type="hidden" name="key" value={k} />
              {k === "bidder_notification" && input.bids.length > 0 && <select name="bid" aria-label="العارض" className="min-h-12 rounded-xl border-2 bg-background px-2">{input.bids.map((b) => <option key={b.id} value={b.id}>{b.supplier_name}</option>)}</select>}
              <button className="min-h-12 rounded-xl border px-4 text-sm font-semibold active:bg-muted">{r.ok ? "توليد وفتح" : "عرض سبب الرفض"}</button></form>
          </li>); })}</ul>
      <DocDecisionDraft item={item} templates={tpls} sessions={sess.data} linked={linked} />
    </main></>
  );
}
