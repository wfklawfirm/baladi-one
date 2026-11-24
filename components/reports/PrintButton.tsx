"use client";
export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground active:opacity-90">طباعة / حفظ كـ PDF</button>;
}
