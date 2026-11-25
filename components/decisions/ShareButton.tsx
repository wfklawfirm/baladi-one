"use client";
import { useState } from "react";

/** Shares the Word copy of the decision (native share sheet where available); otherwise downloads it and offers e-mail / WhatsApp with the title only. */
export default function ShareButton({ id, title, official = false }: { id: string; title: string; official?: boolean }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/decisions/${id}/docx${official ? "?mode=official" : ""}`;
  const share = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(url); if (!res.ok) throw new Error();
      const blob = await res.blob();
      const file = new File([blob], `decision-${id.slice(0, 8)}${official ? "" : "-draft"}.docx`, { type: blob.type });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title, text: official ? title : `${title} — مسودة غير نافذة` }); }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); URL.revokeObjectURL(a.href); setMsg("نُزّل الملف: أرفقوه بالبريد أو واتساب."); }
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("تعذّرت المشاركة."); }
    setBusy(false);
  };
  const text = encodeURIComponent(`${title}${official ? "" : " — مسودة غير نافذة"}`);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={share} disabled={busy} className="min-h-11 rounded-xl border px-4 py-2.5 text-sm disabled:opacity-50">{busy ? "..." : "مشاركة"}</button>
      <a className="text-xs underline" href={`mailto:?subject=${text}`}>بريد</a>
      <a className="text-xs underline" href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer">واتساب</a>
      {msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}
    </span>
  );
}
