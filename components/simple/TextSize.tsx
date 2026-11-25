"use client";
import { useEffect, useState } from "react";

const SIZES = [100, 115, 130] as const;
/** "كبّر الخط" control for the staff workspace. Remembered on this device only. */
export default function TextSize() {
  const [i, setI] = useState(0);
  useEffect(() => { try { const v = Number(localStorage.getItem("baladi.textsize")); if (v >= 0 && v < SIZES.length) { setI(v); document.documentElement.style.fontSize = `${SIZES[v]}%`; } } catch { /* ignore */ } }, []);
  const set = (n: number) => { setI(n); document.documentElement.style.fontSize = `${SIZES[n]}%`; try { localStorage.setItem("baladi.textsize", String(n)); } catch { /* ignore */ } };
  return (
    <div className="fixed bottom-4 right-4 z-30 flex items-center gap-1 rounded-full border bg-background/95 p-1 shadow-md print:hidden" role="group" aria-label="حجم الخط">
      <button type="button" onClick={() => set(Math.max(0, i - 1))} disabled={i === 0} aria-label="صغّر الخط" className="grid size-11 place-items-center rounded-full text-base font-bold disabled:opacity-30 active:bg-muted">أ-</button>
      <button type="button" onClick={() => set(Math.min(SIZES.length - 1, i + 1))} disabled={i === SIZES.length - 1} aria-label="كبّر الخط" className="grid size-11 place-items-center rounded-full text-xl font-bold disabled:opacity-30 active:bg-muted">أ+</button>
    </div>
  );
}
