import type { ReactNode } from "react";

/** Optional / rarely-used fields, collapsed but one tap away. Never put a `required` control in here (a collapsed required field blocks submit). */
export function Extra({ children, label = "حقول إضافية (اختيارية)" }: { children: ReactNode; label?: string }) {
  return (
    <details className="rounded-xl border p-3">
      <summary className="min-h-10 cursor-pointer text-base font-semibold">{label}</summary>
      <div className="mt-3 grid gap-3">{children}</div>
    </details>
  );
}
/** Plain-language help line under a field or a section. */
export const Hint = ({ children }: { children: ReactNode }) => <p className="text-sm leading-6 text-muted-foreground">{children}</p>;
