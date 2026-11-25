import Link from "next/link";

export const metadata = { title: "الصفحة غير موجودة — BALADI ONE" };
export default function NotFound() {
  return (
    <main dir="rtl" lang="ar" className="mx-auto grid min-h-[70vh] max-w-md place-items-center p-6 text-center">
      <div className="space-y-4">
        <p className="text-6xl font-extrabold text-primary">404</p>
        <h1 className="text-xl font-bold">الصفحة غير موجودة</h1>
        <p className="text-sm text-muted-foreground">ربما تغيّر الرابط أو لم تعد الصفحة متاحة.</p>
        <Link href="/" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90">العودة إلى الرئيسية</Link>
      </div>
    </main>
  );
}
