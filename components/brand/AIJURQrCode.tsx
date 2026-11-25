"use client";
import { useMemo } from "react";
import QRCode from "qrcode";
import { QR_URL } from "@/lib/brand-motion";

/** QR to the AIJUR site, generated in-app (no network, no image asset): crisp SVG, near-black modules on white, 4-module quiet zone. */
export function AIJURQrCode() {
  const { d, n } = useMemo(() => {
    const q = QRCode.create(QR_URL, { errorCorrectionLevel: "Q" });
    const n = q.modules.size, data = q.modules.data as unknown as ArrayLike<number>;
    let d = "";
    for (let y = 0; y < n; y++) { let x = 0; while (x < n) { if (data[y * n + x]) { let w = 1; while (x + w < n && data[y * n + x + w]) w++; d += `M${x + 4} ${y + 4}h${w}v1h-${w}z`; x += w; } else x++; } }
    return { d, n };
  }, []);
  const v = n + 8;
  return (
    <svg className="brand-qr" viewBox={`0 0 ${v} ${v}`} shapeRendering="crispEdges" role="img" aria-label="QR: www.aijur.ai" xmlns="http://www.w3.org/2000/svg">
      <rect width={v} height={v} fill="#fff" /><path d={d} fill="#111" />
    </svg>
  );
}
