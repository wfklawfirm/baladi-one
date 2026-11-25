import { guard } from "@/lib/brain/guard";
import { ask } from "@/lib/brain/rag";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidOk } from "@/lib/council";
import { blocksToText, renderDecision } from "@/lib/decisions/render";
import type { DraftData, TemplateContent } from "@/lib/decisions/model";

export const maxDuration = 60;
const ACTIONS: Record<string, string> = {
  improve: "حسّن الصياغة الإدارية والقانونية للنص أدناه دون تغيير مضمونه ودون إضافة وقائع أو أرقام. أعد النص المقترح فقط ثم سطرًا بالتغييرات.",
  recitals: "اقترح حيثيات إضافية مناسبة لهذا القرار مع بيان المصدر الذي تستند إليه كل حيثية. لا تذكر رقم مادة أو قرار أو تعميم إلا إذا ورد حرفيًا في المصادر المسترجعة أو في بيانات القرار؛ وإلا اكتب «يحتاج تحققًا».",
  legal_basis: "راجع الأساس القانوني الوارد في القرار: هل المراجع المختارة تنطبق على نوع القرار؟ وما الناقص؟ لا تخترع أرقام مواد؛ ما لم تتحقق منه من المصادر اذكره «غير متحقق منه».",
  competence: "تحقق من الجهة المختصة باتخاذ هذا القرار (المجلس البلدي أم رئيس البلدية أم جهة أخرى) وهل يحتاج إلى تصديق أو موافقة مسبقة، مع المصدر. إن لم يكفِ المصدر فقل ذلك صراحة.",
  documents: "اقترح المستندات المطلوب إرفاقها بهذا القرار قبل اعتماده، مع سبب كل مستند، وميّز المستندات الإلزامية من المستحسنة.",
  conflicts: "ابحث عن تعارض أو تناقض داخلي في النص (تواريخ، مبالغ، جهات، مواد) أو مع القرارات السابقة المدرجة في البيانات.",
  effect: "راجع شروط النفاذ والتصديق والتبليغ والنشر في القرار: هل الصيغة متسقة مع نوعه ومستوى التصديق؟ لا تعتمد صيغة «فور صدوره» إلا إن أثبتت المصادر ذلك.",
  compare: "قارن هذا القرار بالقرارات السابقة المدرجة في البيانات من حيث الموضوع والصياغة والأثر، وبيّن الفروق وأي تكرار أو تعارض محتمل.",
};
export async function POST(req: Request) {
  const g = await guard(); if (!g.ok) return g.res;
  const b = await req.json().catch(() => null);
  const id = String(b?.id ?? ""), action = String(b?.action ?? "");
  if (!uuidOk(id) || !ACTIONS[action]) return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  const sb = await supabaseServer();
  const { data: d } = await sb.from("municipal_decision").select("title,category,validation_level,template_snapshot,draft_data,year,municipality_id").eq("id", id).maybeSingle();
  if (!d?.template_snapshot) return Response.json({ error: "غير موجود" }, { status: 404 });
  const snap = d.template_snapshot as TemplateContent;
  const text = blocksToText(renderDecision({ snap, data: (d.draft_data ?? {}) as DraftData, title: d.title, mode: "draft" }));
  let prev = "";
  if (action === "compare" || action === "conflicts") {
    const { data: p } = await sb.from("municipal_decision").select("decision_no,year,title,decided_on,legal_status").eq("category", d.category).neq("id", id).order("year", { ascending: false }).limit(15);
    prev = (p ?? []).map((x) => `- قرار ${x.decision_no}/${x.year}: ${x.title} (${x.decided_on ?? "بلا تاريخ"}، ${x.legal_status})`).join("\n") || "لا قرارات سابقة من الفئة نفسها في السجل.";
  }
  const focus = typeof b?.text === "string" && b.text.trim() ? `\n\nالنص المطلوب العمل عليه:\n${b.text.slice(0, 3000)}` : "";
  const facts = `نوع الوثيقة: ${snap.title_ar} (قالب ${snap.id}) — الجهة: ${snap.issuer_candidate} — الفئة: ${d.category} — مستوى التصديق: ${d.validation_level ?? "غير محدد"}\nملاحظة: القالب مسودة تأسيسية غير معتمدة قانونيًا.\n\nنص المسودة الحالي:\n${text.slice(0, 7000)}${prev ? `\n\nالقرارات السابقة في السجل:\n${prev}` : ""}`;
  const query = `${ACTIONS[action]}${focus}\n\nقيود إلزامية: أنت تقترح فقط ولا تعتمد؛ لا تخترع رقم مادة أو قرار أو مرسوم أو تاريخ؛ اذكر مصدر كل ادعاء قانوني؛ واختم بسطر «يتطلب مراجعة المختص قبل الاعتماد».`;
  try {
    const r = await ask(query, [], { noClarify: true, facts });
    if ("answer" in r) return Response.json({ answer: r.answer, sources: r.sources, confidence: r.confidence });
    return Response.json({ error: "تعذّر الوصول إلى المساعد" }, { status: 502 });
  } catch { return Response.json({ error: "تعذّر الوصول إلى المساعد" }, { status: 502 }); }
}
