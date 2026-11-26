// Server-side readers for the audit pack. Read-only; every query runs under the caller's RLS (pass the user-scoped Supabase client).
import { uuidOk } from "@/lib/council";
import { buildAuditPack, type AContract, type ACommittee, type ADecision, type AEvent, type AItem, type AMember, type APub, type AStageEv, type ABid, type AuditInput, type Variant } from "@/lib/procurementAudit";

type Res<T> = PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>;
/** Never throws: a failed read is reported as missing=true (unavailable), never as an empty table. */
export async function safeRows<T>(q: Res<T>): Promise<{ data: T[]; missing: boolean }> {
  try { const { data, error } = await q; return error ? { data: [], missing: true } : { data: data ?? [], missing: false }; } catch { return { data: [], missing: true }; }
}

export async function loadAuditInput(sb: any, id: string, variant: Variant, municipality: string): Promise<AuditInput | null> {
  if (!uuidOk(id)) return null;
  const { data: item } = await sb.from("procurement_plan_item").select("*").eq("id", id).maybeSingle();
  if (!item) return null;
  const it = item as AItem;
  const now = new Date(), opened = !!it.bids_open_on && new Date(it.bids_open_on) <= now;
  const cid = it.contract_id && uuidOk(it.contract_id) ? it.contract_id : null;
  const unavailable: string[] = [];
  const flag = (r: { missing: boolean }, label: string) => { if (r.missing) unavailable.push(label); };
  const none = <T,>() => Promise.resolve({ data: [] as T[], missing: false });
  const or = cid ? `plan_item_id.eq.${id},contract_id.eq.${cid}` : `plan_item_id.eq.${id}`;
  const [bl, ct, kms, pubs, ev, cnt] = await Promise.all([
    it.budget_line_id && uuidOk(it.budget_line_id) ? safeRows<{ code: string; title_ar: string }>(sb.from("budget_line").select("code,title_ar").eq("id", it.budget_line_id).limit(1)) : none<{ code: string; title_ar: string }>(),
    cid ? safeRows<AContract>(sb.from("contract").select("id,contractor,subject,value,currency,status,procurement_method,published_on,award_notice_on,signed_on,decision_id,start_on,objection_pending,objection_resolved_on").eq("id", cid).limit(1)) : none<AContract>(),
    safeRows<Omit<ACommittee, "members">>(sb.from("procurement_committee").select("id,kind,formed_on,report_text,report_on,result,result_on").or(or).order("created_at")),
    safeRows<APub>(sb.from("procurement_publication").select("kind,platform_url,reference_no,published_on,document_ref,proof_ref").or(or).order("created_at")),
    cid ? safeRows<AStageEv>(sb.from("procurement_stage_evidence").select("stage,evidence_ref,evidence_on").eq("contract_id", cid)) : none<AStageEv>(),
    sb.rpc("procurement_bid_count", { p_item: id }),
  ]);
  flag(bl, "بنود الموازنة"); flag(ct, "العقود"); flag(kms, "اللجان"); flag(pubs, "سجل النشر"); flag(ev, "أدلة المراحل");
  const contract = ct.data[0] ?? null, kids = kms.data.map((k) => k.id).filter(uuidOk);
  type BidRow = Omit<ABid, "supplier"> & { id: string; supplier_id: string };
  const [mem, dec, bids] = await Promise.all([
    kids.length ? safeRows<AMember & { committee_id: string }>(sb.from("procurement_committee_member").select("committee_id,name,role_ar,declaration_on,has_conflict,declaration_note").in("committee_id", kids)) : none<AMember & { committee_id: string }>(),
    contract?.decision_id && uuidOk(contract.decision_id) ? safeRows<ADecision>(sb.from("municipal_decision").select("id,decision_no,year,title,decided_on,legal_status").eq("id", contract.decision_id).limit(1)) : none<ADecision>(),
    // sealed bids: never queried before the opening time (RLS enforces the same on the server)
    opened ? safeRows<BidRow>(sb.from("procurement_bid").select("id,supplier_id,received_on,currency,total_value,delivery_days,warranty_note,technical_compliant,evaluation_note").eq("plan_item_id", id).order("received_on")) : none<BidRow>(),
  ]);
  flag(mem, "أعضاء اللجان"); flag(dec, "القرارات"); if (opened) flag(bids, "العروض");
  const sids = [...new Set(bids.data.map((b) => b.supplier_id))].filter(uuidOk);
  const sup = sids.length ? await safeRows<{ id: string; name: string }>(sb.from("procurement_supplier").select("id,name").in("id", sids)) : { data: [], missing: false };
  flag(sup, "الموردون");
  const ids = [id, ...(cid ? [cid] : []), ...kids, ...bids.data.map((b) => b.id)].filter(uuidOk);
  const events = await safeRows<AEvent>(sb.from("audit_event").select("id,action,entity,created_at,actor,detail").in("entity_id", ids).order("created_at", { ascending: true }).limit(300));
  flag(events, "سجل التدقيق");
  return {
    variant, generatedAt: now.toISOString(), municipality, item: it, budgetLine: bl.data[0] ?? null, contract, decision: dec.data[0] ?? null,
    committees: kms.data.map((k) => ({ ...k, members: mem.data.filter((m) => m.committee_id === k.id) })),
    publications: pubs.data, stageEvidence: ev.data,
    bids: { rows: bids.data.map((b) => ({ ...b, supplier: sup.data.find((s) => s.id === b.supplier_id)?.name ?? "—" })), count: typeof cnt.data === "number" ? cnt.data : null },
    events: events.data, unavailable,
  };
}

/** Compact Arabic fact block for the AI copilot. Built from the SHAREABLE variant on purpose: no bid prices, no conflict declarations, no actor ids reach the model. */
export async function procurementItemFacts(sb: any, id: string, municipality: string): Promise<string | null> {
  const input = await loadAuditInput(sb, id, "shareable", municipality);
  if (!input) return null;
  const p = buildAuditPack(input);
  const sec = (k: string) => p.sections.find((s) => s.id === k);
  const kv = (k: string) => (sec(k)?.kv ?? []).map(([a, b]) => `${a}: ${b}`).join(" · ");
  const stages = (sec("stages")?.table?.rows ?? []).map((r) => `${r[0]}: ${r[1]}`).join("؛ ");
  return [
    `بند الشراء المفتوح الآن: «${p.title}»`,
    `الملف الرقابي القابل للطباعة لهذا البند: /staff/procurement/audit-pack/${id} (للمستخدم أن يفتحه؛ لا تصدر أنت أي ملف نهائي)`, `البند — ${kv("plan")}`, `التقدير — ${kv("estimate")}`, `التمويل — ${kv("funding")}`, `العقد — ${kv("contract")}`, `القرار — ${kv("decision")}`,
    `مراحل الملف — ${stages}`,
    `السجلات الناقصة (${p.missing.length}): ${p.missing.map((m) => `[${m.section}] ${m.text}`).join("؛ ") || "لا شيء وفق القواعد المطبَّقة"}`,
    "ملاحظات ملزمة: لم تُحمَّل سقوف ولا مهل قانونية متحقَّق منها في النظام؛ لا تحسب مهلة ولا سقفًا ولا تذكر رقم مادة من عندك. لا تعتمد ولا تختر فائزًا ولا توقّع ولا تنشر: اقترح فقط وأحِل القرار للجهة المختصة. العروض المختومة لا تُكشف.",
  ].join("\n");
}
