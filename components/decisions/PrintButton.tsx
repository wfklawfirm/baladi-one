"use client";
export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="min-h-10 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground">طباعة / حفظ PDF</button>;
}
