// Pure rules for report attachments (shared by the browser and the server action). No I/O.
export const MAX_FILES = 3, MAX_FILE_BYTES = 2 * 1024 * 1024, MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

/** The real type from the file's first bytes (the declared type is never trusted). */
export function sniffMime(b: Uint8Array): AllowedMime | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}
export const cleanFileName = (n: string) => (n.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 120) || "attachment");
export type FileCheck = { ok: true; mime: AllowedMime } | { ok: false; error: string };
export function checkFile(bytes: Uint8Array, totalSoFar = 0): FileCheck {
  if (!bytes.length) return { ok: false, error: "ملف فارغ." };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: "الملف أكبر من 2 ميغابايت." };
  if (totalSoFar + bytes.length > MAX_TOTAL_BYTES) return { ok: false, error: "مجموع الملفات أكبر من 4 ميغابايت." };
  const mime = sniffMime(bytes);
  return mime ? { ok: true, mime } : { ok: false, error: "نوع الملف غير مدعوم (صور JPG/PNG/WebP أو PDF فقط)." };
}
export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
