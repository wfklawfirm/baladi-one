import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { Landmark, UserCog, Users } from "lucide-react";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";
import Emblem from "@/components/Emblem";

export const dynamic = "force-dynamic";

const card = "group flex h-full w-full flex-col items-center gap-5 rounded-3xl border px-8 py-10 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-focus)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 lg:py-12";
const cta = "mt-3 flex h-16 w-full max-w-64 items-center justify-center rounded-2xl text-xl font-bold";

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) { if (slug !== BRAND.slug) redirect(`/m/${BRAND.slug}`); notFound(); }

  // Exhibition mode: employee / mayor open a restricted demo session; otherwise they lead to the normal login.
  // The whole card is the touch target; the "button" is a label inside it, so there is one interaction, not two.
  const light = `${card} border-border bg-background shadow-[0_2px_14px_rgb(0_0_0/0.06)] active:bg-accent/60`;
  const body = (Icon: typeof Users, title: string, desc: string, label: string, dark = false) => (
    <>
      <span className={`grid size-24 place-items-center rounded-3xl ${dark ? "bg-white/15" : "bg-accent"}`}>
        <Icon className={`size-14 ${dark ? "text-white" : "text-primary"}`} strokeWidth={1.6} aria-hidden />
      </span>
      <b className="text-4xl font-bold leading-snug">{title}</b>
      <span className={`text-xl font-medium ${dark ? "text-white/90" : "text-muted-foreground"}`}>{desc}</span>
      <span className={`${cta} ${dark ? "bg-white text-primary" : "bg-primary text-primary-foreground group-active:bg-[#5c1420]"}`}>{label}</span>
    </>
  );
  const staff = body(UserCog, "موظف البلدية", "إدارة الطلبات والخدمات", "دخول النظام");
  const mayor = body(Landmark, "رئيس البلدية", "متابعة الأعمال والأداء", "دخول الإدارة");

  return (
    <main dir="rtl" lang="ar" className="mx-auto flex min-h-dvh max-w-[1240px] flex-col items-center justify-center gap-10 px-5 py-8 lg:gap-12">
      <section className="flex flex-col items-center gap-5 text-center">
        <Emblem size={104} />
        <h1 className="text-5xl font-bold leading-tight text-primary lg:text-[clamp(3rem,3vw,3.5rem)]">منصتكم البلدية الذكية</h1>
        <p className="text-xl font-medium text-muted-foreground lg:text-2xl">اختر طريقة الدخول إلى خدمات البلدية</p>
      </section>

      <section aria-label="اختر نوع المستخدم" className="grid w-full grid-cols-1 gap-5 md:grid-cols-3 lg:gap-8">
        <Link href={`/m/${slug}/citizen`} className={`${card} border-primary bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(122_31_46/0.28)] active:bg-[#5c1420]`}>
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

      <footer className="flex flex-col items-center gap-2 text-base font-medium text-muted-foreground">
        <img src="/aijur-logo.png" alt="AIJUR" className="h-14 w-auto" />
        من تطوير AIJUR
      </footer>
    </main>
  );
}
