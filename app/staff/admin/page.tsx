import Link from "next/link";
import { Mail, Building2, Gavel, ShieldCheck, Eye, IdCard, ChevronLeft } from "lucide-react";
import { Shell, guard } from "@/components/admin/ui";
import { deadlineState, loadList } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإدارة البلدية — BALADI ONE", referrer: "no-referrer" as const };

export default async function AdminHub() {
  const { sb, today } = await guard();
  const [co, as, ld, ov, ir, hr] = await Promise.all([
    loadList(sb, "correspondence", "id,status,deadline_on,archived"),
    loadList(sb, "asset", "id,status"),
    loadList(sb, "legal_deadline", "id,due_on,done"),
    loadList(sb, "oversight_item", "id,status,due_on"),
    loadList(sb, "info_request", "id,status,due_on,publishable"),
    loadList(sb, "hr_position", "id,ended_on"),
  ]);
  const fin = (s: string) => ["replied", "sent", "closed"].includes(s);
  const late = (rows: { due_on?: string | null; deadline_on?: string | null; done?: boolean; status?: string }[], key: "due_on" | "deadline_on", done: (r: any) => boolean) =>
    rows.filter((r) => deadlineState(r[key], today, done(r)) === "overdue").length;
  const cards = [
    { href: "/staff/admin/correspondence", Icon: Mail, title: "المراسلات", sub: "سجل الوارد والصادر والإحالة والمتابعة", m: co.missing, n: co.rows.filter((r) => !r.archived && !fin(r.status)).length, nl: "قيد المتابعة", late: late(co.rows.filter((r) => !r.archived), "deadline_on", (r) => fin(r.status)) },
    { href: "/staff/admin/assets", Icon: Building2, title: "الأملاك والأصول", sub: "سجل الأملاك والإيجارات والصيانة", m: as.missing, n: as.rows.filter((r) => r.status !== "retired").length, nl: "أصل مسجّل", late: 0 },
    { href: "/staff/admin/legal", Icon: Gavel, title: "الشؤون القانونية", sub: "دعاوى ومطالبات واستشارات وأحكام ومهل", m: ld.missing, n: ld.rows.filter((r) => !r.done).length, nl: "مهلة مفتوحة", late: late(ld.rows, "due_on", (r) => r.done) },
    { href: "/staff/admin/oversight", Icon: ShieldCheck, title: "الرقابة الإدارية", sub: "كتب رقابية وملاحظات وإجراءات تصحيحية", m: ov.missing, n: ov.rows.filter((r) => r.status !== "closed").length, nl: "بند مفتوح", late: late(ov.rows, "due_on", (r) => r.status === "closed") },
    { href: "/staff/admin/transparency", Icon: Eye, title: "الشفافية والمعلومات", sub: "طلبات الوصول إلى المعلومات وقرارات النشر", m: ir.missing, n: ir.rows.filter((r) => !["replied", "refused", "closed"].includes(r.status)).length, nl: "طلب بلا ردّ", late: late(ir.rows, "due_on", (r) => ["replied", "refused", "closed"].includes(r.status)) },
    { href: "/staff/admin/hr", Icon: IdCard, title: "سجل الوظائف والتكليفات", sub: "المنصب والوحدة والتكليف (دون رواتب)", m: hr.missing, n: hr.rows.filter((r) => !r.ended_on).length, nl: "تكليف قائم", late: 0 },
  ];
  return (
    <Shell title="الإدارة البلدية" sub="مراسلات وأملاك وشؤون قانونية ورقابة وشفافية. التسجيل مقتصر على رئيس البلدية ومدير النظام، وكل تعديل يُسجَّل في سجل التدقيق." hub>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ href, Icon, title, sub, m, n, nl, late: l }) => (
          <Link key={href} href={href} className="elev elev-hover flex min-h-[5.5rem] items-center gap-3.5 rounded-2xl border bg-background px-4 py-3 active:bg-muted">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-6" aria-hidden /></span>
            <span className="min-w-0 flex-1"><b className="block text-base">{title}</b><span className="block text-xs leading-5 text-muted-foreground">{sub}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs">{m ? <span className="rounded-full bg-muted px-2.5 py-0.5 font-bold">قيد التفعيل</span> : <><span className="rounded-full bg-accent px-2.5 py-0.5 font-bold text-primary">{n} {nl}</span>{l > 0 && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 font-bold text-destructive">{l} متأخر</span>}</>}</span></span>
            <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
      <p className="rounded-xl border p-3 text-xs leading-6 text-muted-foreground">النظام يسجّل ويتابع فقط: لا يحتسب مهلًا قانونية ولا يتصرف بالأملاك ولا ينشر شيئًا تلقائيًا. المهل تُدخلها الجهة المختصة، وأي نص أو تصنيف قانوني يلزم تحققه قبل الاعتماد.</p>
    </Shell>
  );
}
