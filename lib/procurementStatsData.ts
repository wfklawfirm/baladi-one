// Server-side reader for the procurement dashboard. Read-only, under the caller's RLS.
import { uuidOk } from "@/lib/council";
import { detectSplitPurchases, SPLIT_MSG } from "@/lib/procurement";
import { safeRows } from "@/lib/procurementAuditData";
import { computeStats, NO_DATA, type DashCommittee, type DashContract, type DashMember, type DashPlan, type DashPub, type DashSupplier, type Stats } from "@/lib/procurementStats";

export type DashData = { stats: Stats; unavailable: string[]; plan: (DashPlan & { fiscal_year?: number })[] };

export async function loadDashboard(sb: any, year: number, today: string): Promise<DashData> {
  const plan = await safeRows<DashPlan>(sb.from("procurement_plan_item").select("id,title,estimated_value,currency,status,planned_method,contract_id,planned_publish_on,planned_award_on").eq("fiscal_year", year).limit(1000));
  const cids = [...new Set(plan.data.map((p) => p.contract_id).filter((x): x is string => !!x && uuidOk(x)))];
  const [ct, pubs, kms, mem, sup, obj] = await Promise.all([
    cids.length ? safeRows<DashContract>(sb.from("contract").select("id,value,currency,signed_on,status").in("id", cids)) : Promise.resolve({ data: [] as DashContract[], missing: false }),
    safeRows<DashPub>(sb.from("procurement_publication").select("plan_item_id,contract_id,platform_url,reference_no,published_on,proof_ref").limit(3000)),
    safeRows<DashCommittee>(sb.from("procurement_committee").select("id,plan_item_id,contract_id").limit(3000)),
    safeRows<DashMember>(sb.from("procurement_committee_member").select("committee_id,declaration_on,has_conflict").limit(10000)),
    safeRows<DashSupplier>(sb.from("procurement_supplier").select("id,docs_expire_on").limit(3000)),
    // open objections: only if a dedicated table exists (none is deployed today); any error omits the card
    safeRows<{ id: string; status: string }>(sb.from("procurement_objection").select("id,status").limit(5000)),
  ]);
  const unavailable: string[] = [];
  if (plan.missing) unavailable.push("خطة الشراء");
  if (ct.missing) unavailable.push("العقود");
  if (pubs.missing) unavailable.push("سجل النشر");
  if (kms.missing || mem.missing) unavailable.push("اللجان وتصاريحها");
  if (sup.missing) unavailable.push("الموردون");
  const stats = computeStats({
    plan: plan.data, contracts: ct.data, pubs: pubs.data, committees: kms.data, members: mem.data, membersAvailable: !kms.missing && !mem.missing,
    suppliers: sup.missing ? null : sup.data, today, openObjections: obj.missing ? null : obj.data.filter((o) => o.status === "open").length,
  });
  return { stats, unavailable, plan: plan.data };
}

const cur = (t: Record<string, number>) => Object.keys(t).sort().map((c) => `${t[c].toLocaleString("en-US")} ${c}`).join(" | ") || NO_DATA;

/** Arabic fact block for the copilot on non-item procurement pages (dashboard / home / lists). Figures are per currency; nothing is merged. */
export async function procurementOverviewFacts(sb: any, year: number, today: string): Promise<string> {
  const { stats: s, unavailable, plan } = await loadDashboard(sb, year, today);
  const st = await safeRows<{ split_window_days: number; split_min_similarity: number }>(sb.from("procurement_setting").select("split_window_days,split_min_similarity").limit(1));
  const cfg = st.data[0] ?? { split_window_days: 90, split_min_similarity: 0.5 };
  const split = detectSplitPurchases(plan.filter((p) => p.status !== "cancelled" && (p.planned_publish_on || p.planned_award_on)).map((p) => ({ id: p.id, subject: p.title, value: p.estimated_value ?? 0, currency: p.currency, date: p.planned_publish_on ?? p.planned_award_on })), { windowDays: cfg.split_window_days, minSimilarity: cfg.split_min_similarity });
  return [
    `خطة الشراء ${year} (أرقام مقروءة من سجلات البلدية):`,
    `القيمة التقديرية حسب العملة (لا تُجمع العملات): ${cur(s.estimatedByCurrency)}`,
    `بنود غير ملغاة: ${s.itemCount} · نشطة: ${s.active} · نسبة التنفيذ بالعدد: ${s.execution.pct === null ? NO_DATA : s.execution.pct + "%"}`,
    `عقود موقَّعة مربوطة بالخطة: ${s.signedContracts}`,
    `مخطَّط مقابل متعاقد عليه لكل عملة: ${s.charts.plannedVsContracted.map((r) => `${r.currency}: مخطَّط ${r.planned.toLocaleString("en-US")} / متعاقد ${r.contracted.toLocaleString("en-US")}`).join(" | ") || NO_DATA}`,
    `بنود تحتاج متابعة (${s.followUps.length}): ${s.followUps.map((f) => `«${f.title}»: ${f.reasons.join("، ")}`).join("؛ ") || "لا شيء وفق القواعد المطبَّقة"}`,
    `التزام: تصاريح ناقصة ${s.compliance.missingDeclarations ?? "غير متاح"} · مستندات موردين منتهية ${s.compliance.expiredSupplierDocs ?? "غير متاح"} · بنود بلا نشر رسمي مكتمل ${s.compliance.unpublished}`,
    `مؤشرات تجزئة محتملة (استدلال بحت يستلزم التحقق، لا حكم): ${split.length ? split.map((g) => `${g.count} بنود بمجموع ${g.total.toLocaleString("en-US")} ${g.currency} (${SPLIT_MSG})`).join("؛ ") : "لا مؤشرات وفق الاستدلال المطبَّق"}`,
    unavailable.length ? `مصادر غير متاحة للقراءة: ${unavailable.join("، ")}` : "",
    "ملاحظات ملزمة: لم تُحمَّل سقوف ولا مهل قانونية متحقَّق منها؛ لا تذكر سقفًا أو مهلة أو رقم مادة من عندك. لا تعتمد ولا تختر فائزًا ولا توقّع: اقترح فقط.",
  ].filter(Boolean).join("\n");
}
