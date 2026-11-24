import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { Landmark, UserCog, Users } from "lucide-react";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";
import Emblem from "@/components/Emblem";

export const dynamic = "force-dynamic";

const card = "group flex h-full w-full flex-col items-center gap-4 rounded-[22px] border px-7 pb-8 pt-9 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-focus)] active:scale-[0.985] active:brightness-95 disabled:pointer-events-none disabled:opacity-60";
const cta = "mt-auto flex h-16 w-full items-center justify-center rounded-2xl text-xl font-bold";

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) { if (slug !== BRAND.slug) redirect(`/m/${BRAND.slug}`); notFound(); }

  // Exhibition mode: employee / mayor open a restricted demo session; otherwise they lead to the normal login.
  // The whole card is the touch target; the "button" is a label inside it, so there is one interaction, not two.
  const light = `${card} border-border bg-background shadow-[0_4px_18px_rgb(0_0_0/0.07)]`;
  const body = (Icon: typeof Users, title: string, desc: string, label: string, dark = false) => (
    <>
      <span className={`grid size-24 place-items-center rounded-3xl ${dark ? "bg-white/15" : "bg-accent"}`}>
        <Icon className={`size-12 ${dark ? "text-white" : "text-primary"}`} strokeWidth={1.6} aria-hidden />
      </span>
      <b className="mt-2 text-3xl font-bold leading-snug">{title}</b>
      <span className={`mb-4 text-xl font-medium ${dark ? "text-white/90" : "text-muted-foreground"}`}>{desc}</span>
      <span className={`${cta} ${dark ? "bg-white text-primary" : "border-2 border-primary text-primary group-active:bg-accent"}`}>{label}</span>
    </>
  );
  const staff = body(UserCog, "موظف البلدية", "إدارة الطلبات والخدمات", "دخول النظام");
  const mayor = body(Landmark, "رئيس البلدية", "متابعة الأعمال والأداء", "دخول الإدارة");

  return (
    <div dir="rtl" lang="ar" className="flex min-h-dvh flex-col bg-background">
      <header className="h-20 border-b border-border/70 lg:h-24">
        <div className="mx-auto flex h-full max-w-[77.5rem] items-center justify-between px-6">
          <div className="min-[2400px]:[zoom:1.9]"><Emblem size={60} /></div>
          <img src="/aijur-logo.png" alt="AIJUR" className="h-14 w-auto" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[72.5rem] flex-1 flex-col items-center justify-center gap-10 px-6 py-8 text-center lg:gap-12">
        <section className="flex max-w-3xl flex-col items-center gap-4">
          <h1 className="text-4xl font-bold leading-tight text-primary lg:text-5xl">منصتكم البلدية الذكية</h1>
          <p className="text-xl font-medium text-muted-foreground lg:text-2xl">اختر طريقة الدخول إلى خدمات البلدية</p>
        </section>

        <section aria-label="اختر نوع المستخدم" className="grid w-full grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
          <Link href={`/m/${slug}/citizen`} className={`${card} border-primary bg-gradient-to-b from-[#86233a] to-[#6b1a29] text-primary-foreground shadow-[0_10px_28px_rgb(122_31_46/0.30)]`}>
            {body(Users, "مواطن", "المعاملات والخدمات البلدية", "ابدأ الآن", true)}
          </Link>
          {muni.isDemo ? (
            <>
              <form action={enterDemo.bind(null, "staff")} className="h-full"><button className={light}>{staff}</button></form>
              <form action={enterDemo.bind(null, "mayor")} className="h-full"><button className={light}>{mayor}</button></form>
            </>
          ) : (
            <>
              <Link href="/staff/login" className={`${light}`}>{staff}</Link>
              <Link href="/staff/login" className={`${light}`}>{mayor}</Link>
            </>
          )}
        </section>
      </main>

      <footer className="py-5 text-center text-base text-muted-foreground">من تطوير AIJUR</footer>
    </div>
  );
}
