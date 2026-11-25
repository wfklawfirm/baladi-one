import { PENDING_NOTICE, procErr } from "@/lib/procurement";
export function PendingNotice({ what }: { what?: string }) {
  return <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{what ? `${what}: ` : ""}{PENDING_NOTICE}</p>;
}
export function ErrNotice({ err }: { err?: string }) {
  if (!err) return null;
  return <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{procErr(err)}</p>;
}
