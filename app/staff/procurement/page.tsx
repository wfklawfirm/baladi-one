import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { safe } from "@/components/projects/procurement/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "إدارة الشراء العام — BALADI ONE", referrer: "no-referrer" as const };
const year = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date()).slice(0, 4));

/** Procurement home: four sections only. Specialised tools open from inside them (progressive disclosure). */
export default async function ProcurementHome() {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const y = year();
  const [plan, src, th] = await Promise.all([
    safe<{ id: string }>(sb.from("procurement_plan_item").select("id").eq("fiscal_year", y).limit(500)),
    safe<{ id: string; verification_status: string }>(sb.from("procurement_legal_source").select("id,verification_status").limit(500)),
    safe<{ id: string }>(sb.from("procurement_threshold").select("id").limit(1)),
  ]);
  const unverified = src.data.filter((s) => s.verification_status !== "verified").length;
  const cards = [
    { href: "/staff/procurement/new", t: "شراء جديد", d: "أجيبوا عن أسئلة بسيطة فيُحدَّد المسار القانوني المقترح والمستندات.", primary: true },
    { href: "/staff/projects/contracts", t: "ملفات الشراء", d: "ملف كل عقد: المراحل، اللجان، النشر الرسمي، والإجراء التالي." },
    { href: "/staff/projects/procurement", t: "خطة الشراء", d: `الخطة السنوية ${y}: ${plan.data.length} بنداً.` },
    { href: "/staff/projects/procurement/thresholds", t: "الأداء والرقابة", d: "السقوف المحمَّلة، تنبيهات التجزئة المحتملة، ومؤشرات الالتزام." },
  ];
  return (
    <><StaffHeader back="/staff" backLabel="الرئيسية" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <header className="space-y-1"><h1 className="text-2xl font-bold">إدارة الشراء العام</h1>
        <p className="text-muted-foreground">خطوات واضحة، مستندات جاهزة، وإجراءات مستندة إلى القانون.</p></header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}><Link href={c.href} className={`flex min-h-32 flex-col justify-between gap-2 rounded-2xl border p-5 active:opacity-90 ${c.primary ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
            <b className="text-xl">{c.t}</b><span className={`text-sm leading-6 ${c.primary ? "opacity-90" : "text-muted-foreground"}`}>{c.d}</span></Link></li>))}
      </ul>
      {(th.missing || src.missing) && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">بعض الجداول غير متاحة بعد في قاعدة البيانات.</p>}
      {!th.missing && th.data.length === 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">لم تُحمَّل أي سقوف قانونية بعد، لذلك لا يقترح النظام طريقة شراء بحسب القيمة: يتطلب تحققًا قانونيًا.</p>}
      <p className="text-sm text-muted-foreground"><Link href="/staff/procurement/suppliers" className="font-semibold text-primary underline">الموردون</Link> · <Link href="/staff/legal" className="font-semibold text-primary underline">النماذج والمراجع القانونية</Link>{!src.missing && ` · ${src.data.length} مصدراً مسجَّلاً، ${unverified} منها بانتظار المراجعة القانونية`}</p>
    </main></>
  );
}
