import Link from "next/link";
import { Mail, Building2, Gavel, ShieldCheck, Eye, IdCard, Monitor, ChevronLeft, QrCode } from "lucide-react";
import { Shell, guard } from "@/components/admin/ui";
import { deadlineState, loadList } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإدارة البلدية — BALADI ONE", referrer: "no-referrer" as const };

export default async function AdminHub() {
  const { sb, today } = await guard();
  const [co, as, ld, ov, ir, hr, ds] = await Promise.all([
    loadList(sb, "correspondence", "id,status,deadline_on,archived"),
    loadList(sb, "asset", "id,status"),
    loadList(sb, "legal_deadline", "id,due_on,done"),
    loadList(sb, "oversight_item", "id,status,due_on"),
    loadList(sb, "info_request", "id,status,due_on,publishable"),
    loadList(sb, "hr_position", "id,ended_on"),
    loadList(sb, "display_setting", "screensaver_enabled,idle_seconds"),
  ]);
  const { data: isOwner } = await sb.rpc("is_platform_owner");
  const trialN = isOwner === true ? ((await sb.rpc("trial_leads")).data ?? []).length : 0;
  const fin = (s: string) => ["replied", "sent", "closed"].includes(s);
  const late = (rows: { due_on?: string | null; deadline_on?: string | null; done?: boolean; status?: string }[], key: "due_on" | "deadline_on", done: (r: any) => boolean) =>
    rows.filter((r) => deadlineState(r[key], today, done(r)) === "overdue").length;
  const cards = [
    { href: "/staff/admin/correspondence", Icon: Mail, title: "أسجّل كتابًا أو أتابع مراسلة", sub: "كل كتاب يصل إلى البلدية أو يخرج منها، ومن أحيله إليه", m: co.missing, n: co.rows.filter((r) => !r.archived && !fin(r.status)).length, nl: "قيد المتابعة", late: late(co.rows.filter((r) => !r.archived), "deadline_on", (r) => fin(r.status)) },
    { href: "/staff/admin/assets", Icon: Building2, title: "أسجّل ملكًا للبلدية", sub: "أرض أو مبنى أو آلية، وإيجاره وصيانته", m: as.missing, n: as.rows.filter((r) => r.status !== "retired").length, nl: "ملك مسجّل", late: 0 },
    { href: "/staff/admin/legal", Icon: Gavel, title: "أتابع دعوى أو مهلة قانونية", sub: "الدعاوى والأحكام وآخر موعد لكل ملف", m: ld.missing, n: ld.rows.filter((r) => !r.done).length, nl: "مهلة لم تُنجز", late: late(ld.rows, "due_on", (r) => r.done) },
    { href: "/staff/admin/oversight", Icon: ShieldCheck, title: "أرد على كتاب رقابة", sub: "ملاحظات الجهات الرقابية وما تمّ لمعالجتها", m: ov.missing, n: ov.rows.filter((r) => r.status !== "closed").length, nl: "بند يحتاج رد", late: late(ov.rows, "due_on", (r) => r.status === "closed") },
    { href: "/staff/admin/transparency", Icon: Eye, title: "أجيب مواطنًا طلب معلومات", sub: "طلبات الاطلاع على المعلومات، وما يجوز نشره", m: ir.missing, n: ir.rows.filter((r) => !["replied", "refused", "closed"].includes(r.status)).length, nl: "طلب لم يُجَب", late: late(ir.rows, "due_on", (r) => ["replied", "refused", "closed"].includes(r.status)) },
    { href: "/staff/admin/hr", Icon: IdCard, title: "أتابع موظفًا وتكليفه", sub: "من يعمل في أي قسم ومنذ متى (بدون رواتب)", m: hr.missing, n: hr.rows.filter((r) => !r.ended_on).length, nl: "موظف يعمل", late: 0 },
    { href: "/staff/admin/display", Icon: Monitor, title: "أضبط شاشة العرض", sub: "شاشة الانتظار على الشاشات العامة", m: ds.missing, n: ds.rows[0] ? (ds.rows[0].screensaver_enabled ? ds.rows[0].idle_seconds : 0) : 60, nl: ds.rows[0] && !ds.rows[0].screensaver_enabled ? "الشاشة متوقفة" : "ثانية حتى تظهر", late: 0 },
    ...(isOwner === true ? [{ href: "/staff/admin/ppa-import", Icon: QrCode, title: "نصوص هيئة الشراء العام", sub: "استيراد/تحديث نصوص الموقع للمساعد (لحساب WFK فقط)", m: false, n: 0, nl: "", late: 0 }] : []),
    ...(isOwner === true ? [{ href: "/staff/admin/ppa-review", Icon: ShieldCheck, title: "مراجعة نصوص هيئة الشراء العام", sub: "اعتماد أو رفض كل نص بعد مقابلته بالأصل (لحساب WFK فقط)", m: false, n: 0, nl: "", late: 0 }] : []),
    ...(isOwner === true ? [{ href: "/staff/admin/embeddings", Icon: ShieldCheck, title: "فهرس البحث الدلالي", sub: "توليد الـ embeddings للنصوص القانونية الجديدة (لحساب WFK فقط)", m: false, n: 0, nl: "", late: 0 }] : []),
    ...(isOwner === true ? [{ href: "/staff/admin/assistant-eval", Icon: ShieldCheck, title: "اختبار المساعد الذكي", sub: "تشغيل أسئلة فحص على المساعد الفعلي (لحساب WFK فقط)", m: false, n: 0, nl: "", late: 0 }] : []),
    ...(isOwner === true ? [{ href: "/staff/admin/trial-leads", Icon: QrCode, title: "سجل تجربة المساعد الذكي", sub: "من سجّل رقمه عبر الرمز لتجربة 3 أيام (لحساب WFK فقط)", m: false, n: trialN, nl: "مسجّل", late: 0 }] : []),
  ];
  return (
    <Shell title="الإدارة البلدية" sub="اختاروا ما تريدون فعله الآن. كل ما تسجّلونه محفوظ، ويُسجَّل اسم من عدّله." hub>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ href, Icon, title, sub, m, n, nl, late: l }) => (
          <Link key={href} href={href} className="elev elev-hover flex min-h-[6rem] items-center gap-3.5 rounded-2xl border bg-background px-4 py-3 active:bg-muted">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span>
            <span className="min-w-0 flex-1"><b className="block text-lg leading-snug">{title}</b><span className="block text-sm leading-6 text-muted-foreground">{sub}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs">{m ? <span className="rounded-full bg-muted px-2.5 py-0.5 font-bold">غير مفعّلة بعد</span> : <><span className="rounded-full bg-accent px-2.5 py-0.5 font-bold text-primary">{n} {nl}</span>{l > 0 && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 font-bold text-destructive">{l} فات موعده</span>}</>}</span></span>
            <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
      <p className="rounded-xl border p-3 text-xs leading-6 text-muted-foreground">ملاحظة: هذا السجل للتوثيق والمتابعة. لا يحسب المهل القانونية بنفسه، ولا يبيع ولا يؤجّر ولا ينشر شيئًا تلقائيًا. المهل والتصنيفات القانونية يُدخلها المختص (المحامي) ويتحقق منها.</p>
    </Shell>
  );
}
