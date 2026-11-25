"use client";
export default function SelectAll() {
  return <button type="button" className="min-h-10 rounded-xl border px-3 text-sm" onClick={(e) => { const f = e.currentTarget.closest("form"); const boxes = [...(f?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? [])]; const all = boxes.every((b) => b.checked); boxes.forEach((b) => (b.checked = !all)); }}>تحديد / إلغاء تحديد الكل</button>;
}
