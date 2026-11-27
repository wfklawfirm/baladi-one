// Read-only facts about the municipality's OWN data, computed on the server under the caller's RLS (never trusted from the browser).
// No citizen names/contacts and no bid prices are ever included. Totals are kept per currency; unknown is written as «غير متوفر», never 0.
export type Domain = "requests" | "decisions" | "council" | "projects" | "contracts" | "finance" | "admin" | "procurement";
const D: [Domain, RegExp][] = [
  ["requests", /طلب|طلبات|شكوى|شكاوى|بلاغ|معاملة|معاملات|تحصيل|إيصال|ايصال|جباية|متأخر/],
  ["decisions", /قرار|قرارات|تنفيذ القرار|تصديق|وصاية/],
  ["council", /مجلس|جلسة|جلسات|محضر|محاضر|نصاب/],
  ["projects", /مشروع|مشاريع|إنجاز|انجاز|ورشة|أشغال/],
  ["contracts", /عقد|عقود|متعهد|ملتزم|تلزيم/],
  ["finance", /موازنة|ميزانية|اعتماد|اعتمادات|صرف|مصروف|نفقة|نفقات|إيراد|ايراد|مالية|المالي/],
  ["admin", /مراسلة|مراسلات|كتاب وارد|كتب|ملك|أملاك|عقار|رقابة|رقابي|ديوان|شفافية|اطلاع|دعوى|دعاوى|مهلة|موظف/],
  ["procurement", /شراء|مناقصة|استدراج|عرض سعر|عروض|لجنة|اعتراض/],
];
const OVERVIEW = /ملخص|وضع|حال|حالة|نظرة|أين وصلنا|اين وصلنا|ماذا لدينا|ماذا عندنا|لدينا|عندنا|عدد|كم |آخر|اخر|أولويات|اولويات|يحتاج|تأخر|متأخر/;
const LEGAL_ONLY = /^(?:ما|ماذا|هل|كيف)?\s*(?:هو|هي)?\s*(?:نص|مادة|المادة|قانون|مرسوم|اجتهاد)/;

export function detectDomains(q: string): Domain[] {
  const hit = D.filter(([, re]) => re.test(q)).map(([d]) => d);
  if (hit.length) return hit;
  return OVERVIEW.test(q) && !LEGAL_ONLY.test(q.trim()) ? ["requests", "decisions", "projects", "contracts", "admin"] : [];
}

const sum = (rows: any[], f: string, cur = "currency") => {
  const m = new Map<string, number>();
  for (const r of rows) { const v = Number(r[f]); if (Number.isFinite(v)) m.set(r[cur] ?? "؟", (m.get(r[cur] ?? "؟") ?? 0) + v); }
  return [...m].map(([c, v]) => `${v.toLocaleString("en-US")} ${c}`).join(" + ") || "غير متوفر";
};
const by = (rows: any[], f: string) => { const m = new Map<string, number>(); for (const r of rows) m.set(String(r[f] ?? "—"), (m.get(String(r[f] ?? "—")) ?? 0) + 1); return [...m].map(([k, n]) => `${k}: ${n}`).join("، ") || "لا شيء"; };
const q = async (sb: any, t: string, cols: string, extra?: (b: any) => any): Promise<any[] | null> => {
  try { let b = sb.from(t).select(cols).limit(1000); if (extra) b = extra(b); const { data, error } = await b; return error ? null : (data ?? []); } catch { return null; }
};
const NA = "غير متوفر (لا صلاحية أو لا بيانات)";

export async function platformFacts(sb: any, question: string, today: string, extra: { procurement?: () => Promise<string> } = {}): Promise<string | undefined> {
  const doms = detectDomains(question);
  if (!doms.length) return undefined;
  const out: string[] = [`التاريخ: ${today}. البيانات من سجلات البلدية التي يحق للمستخدم الحالي رؤيتها فقط.`];
  const overdue = (rows: any[], f: string, done: (r: any) => boolean) => rows.filter((r) => r[f] && r[f] < today && !done(r)).length;
  for (const d of doms) {
    if (d === "requests") {
      const r = await q(sb, "citizen_request", "status,kind,report_type,created_at");
      if (!r) { out.push(`## الطلبات والشكاوى: ${NA}`); continue; }
      const open = r.filter((x) => ["received", "in_progress", "needs_info"].includes(x.status));
      const old = open.filter((x) => (Date.parse(today) - Date.parse(String(x.created_at).slice(0, 10))) / 86_400_000 > 7).length;
      out.push(`## الطلبات والشكاوى\n- المجموع المسجّل: ${r.length}. حسب الحالة — ${by(r, "status")}.\n- المفتوحة: ${open.length}، منها أقدم من 7 أيام: ${old}.\n- حسب النوع: ${by(r, "kind")}.`);
    } else if (d === "decisions") {
      const r = await q(sb, "municipal_decision", "decision_no,year,title,legal_status,execution_status,execution_due,decided_on");
      if (!r) { out.push(`## القرارات: ${NA}`); continue; }
      const last = [...r].sort((a, b) => String(b.decided_on ?? "").localeCompare(String(a.decided_on ?? ""))).slice(0, 5).map((x) => `${x.decision_no}/${x.year} «${String(x.title ?? "").slice(0, 60)}»`).join("؛ ");
      out.push(`## القرارات\n- العدد: ${r.length}. الوضع القانوني — ${by(r, "legal_status")}. التنفيذ — ${by(r, "execution_status")}.\n- تنفيذ فات موعده: ${overdue(r, "execution_due", (x) => ["done", "executed", "completed"].includes(x.execution_status))}.\n- أحدث القرارات: ${last || "لا شيء"}.`);
    } else if (d === "council") {
      const r = await q(sb, "council_session", "session_no,title,held_on,status,members_total,members_present");
      if (!r) { out.push(`## المجلس: ${NA}`); continue; }
      const last = [...r].sort((a, b) => String(b.held_on ?? "").localeCompare(String(a.held_on ?? ""))).slice(0, 4).map((x) => `جلسة ${x.session_no ?? "—"} (${x.held_on ?? "بلا تاريخ"}، ${x.status}، حضور ${x.members_present ?? "؟"}/${x.members_total ?? "؟"})`).join("؛ ");
      out.push(`## جلسات المجلس\n- عدد الجلسات: ${r.length}. آخر الجلسات: ${last || "لا شيء"}.`);
    } else if (d === "projects") {
      const r = await q(sb, "project", "title,status,due_on,budget_amount,spent_amount,currency");
      if (!r) { out.push(`## المشاريع: ${NA}`); continue; }
      const done = (x: any) => ["done", "completed", "closed", "cancelled"].includes(x.status);
      out.push(`## المشاريع\n- العدد: ${r.length}. حسب الحالة — ${by(r, "status")}.\n- متأخرة عن موعدها: ${overdue(r, "due_on", done)}.\n- الموازنة المرصودة: ${sum(r, "budget_amount")}. المصروف المسجّل: ${sum(r, "spent_amount")}.`);
    } else if (d === "contracts") {
      const r = await q(sb, "contract", "contractor,subject,value,currency,status,end_on,objection_pending,procurement_method");
      if (!r) { out.push(`## العقود: ${NA}`); continue; }
      out.push(`## العقود\n- العدد: ${r.length}. حسب الحالة — ${by(r, "status")}. حسب أسلوب الشراء — ${by(r, "procurement_method")}.\n- القيمة الإجمالية: ${sum(r, "value")}.\n- عقود عليها اعتراض قائم: ${r.filter((x) => x.objection_pending).length}. انتهى أجلها دون إغلاق: ${overdue(r, "end_on", (x) => ["closed", "completed", "cancelled"].includes(x.status))}.`);
    } else if (d === "finance") {
      const b = await q(sb, "budget_line", "kind,original_amount,current_amount,currency"), e = await q(sb, "expenditure", "amount,currency,entry_kind,doc_currency");
      if (!b && !e) { out.push(`## المالية: ${NA}`); continue; }
      out.push(`## المالية\n- بنود الموازنة: ${b ? `${b.length} بندًا؛ الاعتماد الأصلي ${sum(b, "original_amount")}؛ الحالي ${sum(b, "current_amount")}` : NA}.\n- قيود الصرف: ${e ? `${e.length} قيدًا (المبالغ مسجّلة بعملات متعددة؛ لا تُجمع عبر العملات)` : NA}.`);
    } else if (d === "admin") {
      const c = await q(sb, "correspondence", "direction,status,deadline_on,archived"), a = await q(sb, "asset", "kind,status"), o = await q(sb, "oversight_item", "status,due_on"), i = await q(sb, "info_request", "status,due_on"), l = await q(sb, "legal_deadline", "due_on,done");
      const fin = (x: any) => ["replied", "sent", "closed"].includes(x.status);
      out.push(`## الإدارة البلدية\n- المراسلات: ${c ? `${c.filter((x) => !x.archived).length} غير مؤرشفة، متأخرة عن موعد الرد ${overdue(c.filter((x) => !x.archived), "deadline_on", fin)}` : NA}.\n- الأملاك: ${a ? `${a.length} (${by(a, "kind")})` : NA}.\n- كتب الرقابة: ${o ? `${o.filter((x) => x.status !== "closed").length} مفتوحة، متأخرة ${overdue(o, "due_on", (x) => x.status === "closed")}` : NA}.\n- طلبات الاطلاع: ${i ? `${i.filter((x) => !["replied", "refused", "closed"].includes(x.status)).length} بلا جواب، متأخرة ${overdue(i, "due_on", (x) => ["replied", "refused", "closed"].includes(x.status))}` : NA}.\n- المهل القانونية: ${l ? `${l.filter((x) => !x.done).length} غير منجزة، فات موعدها ${overdue(l, "due_on", (x) => x.done)}` : NA}.`);
    } else if (d === "procurement" && extra.procurement) {
      try { out.push(`## الشراء العام\n${await extra.procurement()}`); } catch { out.push(`## الشراء العام: ${NA}`); }
    }
  }
  return out.join("\n\n").slice(0, 6000);
}
