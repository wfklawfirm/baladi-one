import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { Landmark, UserCog, Users } from "lucide-react";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";

export const dynamic = "force-dynamic";

const card = "group flex h-full w-full flex-col items-center gap-4 rounded-2xl border px-6 py-8 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-focus)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 lg:py-10";
const cta = "mt-2 flex h-14 w-full max-w-56 items-center justify-center rounded-xl text-lg font-bold";

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) { if (slug !== BRAND.slug) redirect(`/m/${BRAND.slug}`); notFound(); }

  // Exhibition mode: employee / mayor open a restricted demo session; otherwise they lead to the normal login.
  // The whole card is the touch target; the "button" is a label inside it, so there is one interaction, not two.
  const light = `${card} border-border bg-background shadow-sm active:bg-accent/60`;
  const body = (Icon: typeof Users, title: string, desc: string, label: string, dark = false) => (
    <>
      <Icon className={`size-12 ${dark ? "text-white" : "text-primary"}`} strokeWidth={1.5} aria-hidden />
      <b className="text-3xl font-bold">{title}</b>
      <span className={`text-lg ${dark ? "text-white/85" : "text-muted-foreground"}`}>{desc}</span>
      <span className={`${cta} ${dark ? "bg-white text-primary" : "border-2 border-primary text-primary group-active:bg-accent"}`}>{label}</span>
    </>
  );
  const staff = body(UserCog, "موظف البلدية", "إدارة الطلبات والخدمات", "دخول النظام");
  const mayor = body(Landmark, "رئيس البلدية", "متابعة الأعمال والأداء", "دخول الإدارة");

  return (
    <main dir="rtl" lang="ar" className="mx-auto flex min-h-[calc(100dvh-4.25rem)] max-w-[1200px] flex-col justify-center gap-10 px-4 py-8 lg:gap-12">
      <section className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-bold leading-tight text-primary lg:text-[clamp(2.25rem,2.2vw,2.75rem)]">منصتكم البلدية الذكية</h1>
        <p className="text-lg text-muted-foreground lg:text-xl">اختر طريقة الدخول إلى خدمات البلدية</p>
      </section>

      <section aria-label="اختر نوع المستخدم" className="grid grid-cols-1 gap-5 md:grid-cols-3 lg:gap-8">
        <Link href={`/m/${slug}/citizen`} className={`${card} border-primary bg-primary text-primary-foreground shadow-sm active:bg-[#5c1420]`}>
          {body(Users, "مواطن", "المعاملات والخدمات البلدية", "ابدأ الآن", true)}
        </Link>
        {muni.isDemo ? (
          <>
            <form action={enterDemo.bind(null, "staff")} className="h-full"><button className={light}>{staff}</button></form>
            <form action={enterDemo.bind(null, "mayor")} className="h-full"><button className={light}>{mayor}</button></form>
          </>
        ) : (
          <>
            <Link href="/staff/login" className={light}>{staff}</Link>
            <Link href="/staff/login" className={light}>{mayor}</Link>
          </>
        )}
      </section>

      <p className="text-center text-sm text-muted-foreground">من تطوير AIJUR</p>
    </main>
  );
}
