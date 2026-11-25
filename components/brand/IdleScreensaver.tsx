"use client";
import { useEffect, useState } from "react";
import { AIJURBrandMotion } from "./AIJURBrandMotion";

const FADE_MS = 350;

/** Full-screen white screensaver with the breathing logo. The first touch/click/key/mouse move only closes it (the overlay stays mounted
 *  for the fade so the tap that closed it cannot reach the page behind). Nothing is reloaded: page state is preserved underneath. */
export function IdleScreensaver({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) { setMounted(true); const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(r); }
    setShown(false); const id = window.setTimeout(() => setMounted(false), FADE_MS); return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let x = -1, y = -1;
    const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); onDismiss(); };
    const move = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; if (x >= 0 && Math.hypot(e.clientX - x, e.clientY - y) < 3) return; if (x < 0) { x = e.clientX; y = e.clientY; return; } eat(e); };
    window.addEventListener("keydown", eat, true);
    window.addEventListener("pointermove", move, true);
    return () => { window.removeEventListener("keydown", eat, true); window.removeEventListener("pointermove", move, true); };
  }, [open, onDismiss]);

  if (!mounted) return null;
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); if (open) onDismiss(); };
  return (
    <div className="brand-stage saver" data-open={shown} role="presentation" onPointerDown={stop} onTouchStart={stop} onClick={stop} onContextMenu={stop}>
      <AIJURBrandMotion />
    </div>
  );
}
