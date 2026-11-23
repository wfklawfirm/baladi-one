import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, FileCheck2, Landmark, LayoutList, UserCog, Users } from "lucide-react";
import Emblem from "@/components/Emblem";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";

export const dynamic = "force-dynamic";

const FEATURES = [
  { Icon: LayoutList, text: "دليل معاملات منظّم" },
  { Icon: FileCheck2, text: "مستندات وخطوات واضحة" },
  { Icon: Clock, text: "معلومات الخدمات متاحة في أي وقت" },
];

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();

  // Exhibition mode: employee / mayor open a restricted demo session; otherwise they lead to the normal login.
  const base = "group flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border px-6 py-8 text-center transition active:scale-[0.99] min-h-64 lg:min-h-[clamp(13rem,30vh,19rem)]";
  const light = `${base} elev elev-hover bg-background`;
  const staffBody = (Icon: typeof Users, title: string, desc: string, cta: string) => (
    <>
      <span className="grid size-20 place-items-center rounded-2xl bg-accent text-primary"><Icon className="size-10" aria-hidden /></span>
      <b className="text-2xl lg:text-3xl">{title}</b>
      <span className="text-base text-muted-foreground lg:text-lg">{desc}</span>
      <span className="mt-2 w-full max-w-60 rounded-xl border-2 border-primary px-6 py-3 text-lg font-semibold text-primary group-active:bg-accent">{cta}</span>
    </>
  );
  const staff = staffBody(UserCog, "موظف البلدية", "معالجة الطلبات وإدارة الخدمات", "دخول النظام");
  const mayor = staffBody(Landmark, "رئيس البلدية", "إدارة الخدمات ومتابعة الأداء", "دخول الإدارة");

  return (
    <main dir="rtl" lang="ar" className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-6xl flex-col justify-center gap-5 px-4 py-6 lg:gap-[clamp(1rem,3vh,2.25rem)]">
      <section className="flex flex-col items-center gap-3 text-center">
        <Emblem size={96} />
        <h1 className="text-4xl font-bold text-primary lg:text-5xl">منصتكم البلدية الذكية</h1>
        <p className="text-lg text-foreground/80 lg:text-2xl">خدمات ومعاملات البلدية بسهولة وأمان</p>
        <span aria-hidden className="h-1 w-16 rounded-full bg-primary" />
      </section>

      <section aria-label="اختر نوع المستخدم" className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        <Link href={`/m/${slug}/citizen`} className={`${base} bg-gradient-to-br from-[#8b2335] to-[#5c1420] text-white shadow-lg`}>
          <span className="grid size-20 place-items-center rounded-2xl bg-white/15"><Users className="size-10" aria-hidden /></span>
          <b className="text-3xl lg:text-4xl">مواطن</b>
          <span className="text-base text-white/85 lg:text-lg">اطّلع على المعاملات وقدّم طلبك</span>
          <span className="mt-2 w-full max-w-60 rounded-xl bg-white px-6 py-3 text-lg font-bold text-primary">ابدأ الآن</span>
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

      <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-foreground/80 lg:text-base">
        {FEATURES.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-full bg-accent text-primary"><Icon className="size-5" aria-hidden /></span>{text}</li>
        ))}
      </ul>

      <p className="flex items-center justify-center gap-4 text-sm text-muted-foreground"><span className="h-px w-12 bg-border" />من تطوير AIJUR<span className="h-px w-12 bg-border" /></p>
    </main>
  );
}
