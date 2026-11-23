import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** Contact block: the municipality name lives here, not under the logo (the logo already carries it). */
export default function PortalFooter() {
  return (
    <footer className="mt-16 border-t bg-muted/40 px-4 py-8">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
        <h2 className="text-sm font-semibold text-muted-foreground">تواصل معنا</h2>
        <p className="text-lg font-bold">{BRAND.nameAr}</p>
        <p className="text-sm text-muted-foreground">بيانات التواصل الرسمية (العنوان والهاتف وأوقات الدوام) تُضاف بعد اعتمادها من البلدية.</p>
        <Link href="/staff" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">دخول الموظفين</Link>
        <p className="text-xs tracking-[0.25em] text-muted-foreground" dir="ltr">BY AIJUR</p>
      </div>
    </footer>
  );
}
