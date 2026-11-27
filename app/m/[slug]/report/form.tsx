"use client";
import { useActionState, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { sendReport } from "./actions";
import { REPORT_TYPES } from "@/lib/reports-client";
import Mic from "@/components/Mic";
import { MAX_FILES, MAX_FILE_BYTES, ALLOWED_MIME, fmtSize } from "@/lib/reportFiles";

/** Photos are shrunk in the browser (max 1600px JPEG) so phone pictures fit the size limit; PDFs are sent as they are. */
async function shrink(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.type === "image/gif") return f;
  try {
    const bmp = await createImageBitmap(f); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch { return f; }
}

export function ReportForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(sendReport.bind(null, slug), null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const sync = (list: File[]) => { setFiles(list); const dt = new DataTransfer(); list.forEach((f) => dt.items.add(f)); if (input.current) input.current.files = dt.files; };
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []); setFileErr("");
    const out = [...files];
    for (const p of picked) {
      if (out.length >= MAX_FILES) { setFileErr(`الحد الأقصى ${MAX_FILES} ملفات.`); break; }
      if (!(ALLOWED_MIME as readonly string[]).includes(p.type)) { setFileErr("المسموح: صور (JPG/PNG/WebP) أو PDF."); continue; }
      const f = await shrink(p);
      if (f.size > MAX_FILE_BYTES) { setFileErr(`الملف «${p.name}» أكبر من 2 ميغابايت.`); continue; }
      out.push(f);
    }
    sync(out);
  }
  return (
    <form action={action} className="space-y-4">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 font-semibold">نوع المشكلة</legend>
        {REPORT_TYPES.map(([k, label], i) => (
          <label key={k} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border bg-background px-3 has-[:checked]:border-primary has-[:checked]:bg-muted">
            <input type="radio" name="type" value={k} required defaultChecked={i === 0} />{label}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1"><label htmlFor="rp-desc" className="block font-semibold">وصف المشكلة</label>
        <div className="relative"><textarea id="rp-desc" name="description" required minLength={10} maxLength={1000} rows={5} className="w-full rounded-xl border bg-background p-3 pe-16" placeholder="مثال: عمود الإنارة أمام المدرسة مطفأ منذ أسبوع" />
          <Mic target="rp-desc" className="absolute bottom-3 end-2" /></div>
        <p className="text-xs text-muted-foreground">يمكنك الإملاء بالصوت: اضغط الميكروفون وتكلّم، فيُكتب كلامك في الحقل.</p></div>
      <div className="space-y-1"><label htmlFor="rp-loc" className="block font-semibold">الموقع</label>
        <div className="flex gap-2"><input id="rp-loc" name="location" maxLength={300} className="min-h-12 min-w-0 flex-1 rounded-xl border bg-background px-3" placeholder="الشارع / أقرب معلم" /><Mic target="rp-loc" /></div></div>
      <label className="block space-y-1"><span className="font-semibold">هاتف للتواصل (اختياري)</span>
        <input name="phone" inputMode="tel" maxLength={20} className="min-h-12 w-full rounded-xl border bg-background px-3" dir="ltr" /></label>
      <div className="space-y-2"><span className="block font-semibold">صورة أو ملف (اختياري)</span>
        <input ref={input} id="rp-files" name="files" type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={pick} />
        <label htmlFor="rp-files" className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 font-semibold text-primary active:bg-muted"><Paperclip className="size-5" aria-hidden />إرفاق صورة أو ملف</label>
        {files.length > 0 && <ul className="space-y-1">{files.map((f, i) => (<li key={i} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs text-muted-foreground">{fmtSize(f.size)}</span><button type="button" aria-label={`إزالة ${f.name}`} onClick={() => sync(files.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-lg active:bg-background"><X className="size-4" /></button></li>))}</ul>}
        {fileErr && <p role="alert" className="text-sm text-destructive">{fileErr}</p>}
        <p className="text-xs text-muted-foreground">حتى {MAX_FILES} ملفات، كل ملف حتى 2 ميغابايت. صور JPG/PNG/WebP أو PDF. لا تُرفق وثائق شخصية حساسة.</p></div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state?.error && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-60">{pending ? "جارٍ الإرسال…" : "إرسال البلاغ"}</button>
      <p className="text-xs text-muted-foreground">لا نطلب اسمك. تُستعمل بياناتك لمعالجة البلاغ فقط، وسيظهر لك رمز تتبع سري بعد الإرسال.</p>
    </form>
  );
}
