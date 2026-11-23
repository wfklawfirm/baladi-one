"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ path, size = 360, label }: { path: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    const url = new URL(path, window.location.origin).toString();
    QRCode.toDataURL(url, { margin: 2, width: size * 2, errorCorrectionLevel: "M" }).then(setSrc);
  }, [path, size]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    src ? <img src={src} alt={label} width={size} height={size} className="rounded-2xl border bg-white p-2" style={{ width: size, height: size }} /> : <div style={{ width: size, height: size }} className="rounded-2xl bg-muted" />
  );
}
