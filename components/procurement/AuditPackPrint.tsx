"use client";
import { Printer } from "lucide-react";

/** Opens the browser print dialog (choose «Save as PDF»). Hidden in print. */
export default function AuditPackPrint() {
  return (
    <button type="button" onClick={() => window.print()} className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground print:hidden">
      <Printer className="size-5" aria-hidden />طباعة / حفظ PDF
    </button>
  );
}
