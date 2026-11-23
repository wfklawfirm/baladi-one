import Link from "next/link";
import { Clock } from "lucide-react";

/** Shown for citizen services that are not switched on yet: explains, and always offers a way forward. */
export function ComingSoon({ title, slug }: { title: string; slug: string }) {
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-5 rounded-3xl border bg-background p-8 text-center elev">
      <span className="grid size-16 place-items-center rounded-2xl bg-accent text-primary"><Clock className="size-8" aria-hidden /></span>
      <span className="rounded-full border px-4 py-1 text-sm font-semibold">قريبًا</span>
      <div className="space-y-2">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-muted-foreground">هذه الخدمة غير مفعّلة بعد. يمكنك الآن الاطلاع على المعاملات البلدية ومتطلباتها.</p>
      </div>
      <Link href={`/m/${slug}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground active:opacity-90">
        العودة إلى المعاملات البلدية
      </Link>
    </div>
  );
}
