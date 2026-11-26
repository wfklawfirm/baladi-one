"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";
import { parseAmount } from "@/lib/projects";
import { procErrCode } from "@/lib/procurement";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (v: string) => (v ? v : null);
const ROOT = "/staff/procurement";

async function call(name: string, args: Record<string, unknown>, dest: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(name, args);
  if (error) redirect(`${dest}?err=${procErrCode(error)}`);
  revalidatePath(dest);
}

export async function addSupplier(fd: FormData) {
  const dest = `${ROOT}/suppliers`;
  if (!s(fd, "name")) redirect(`${dest}?err=bad_input`);
  const exp = s(fd, "docs_expire");
  await call("procurement_supplier_add", { p_name: s(fd, "name"), p_form: opt(s(fd, "form")), p_contact: opt(s(fd, "contact")), p_registry: opt(s(fd, "registry")), p_docs_expire: dateOk(exp) ? exp : null, p_notes: opt(s(fd, "notes")) }, dest);
}
/** "YYYY-MM-DDTHH:mm" typed as Beirut local time -> UTC ISO string (handles DST). */
function beirutToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const asUtc = Date.parse(`${v}:00Z`); if (Number.isNaN(asUtc)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(asUtc)).map((x) => [x.type, x.value]));
  const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  let t = asUtc - (shown - asUtc);                       // first guess, then correct once for DST edges
  const p2 = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  t += asUtc - Date.parse(`${p2.year}-${p2.month}-${p2.day}T${p2.hour}:${p2.minute}:${p2.second}Z`);
  return new Date(t).toISOString();
}
export async function setBidsOpen(fd: FormData) {
  const id = s(fd, "item"), dest = `${ROOT}/bids/${id}`;
  if (!uuidOk(id)) redirect(`${ROOT}?err=bad_input`);
  const iso = beirutToIso(s(fd, "open"));
  if (!iso) redirect(`${dest}?err=bad_input`);
  await call("procurement_set_bids_open", { p_item: id, p_open: iso }, dest);
}
export async function addBid(fd: FormData) {
  const item = s(fd, "item"), sup = s(fd, "supplier"), dest = `${ROOT}/bids/${item}`, v = parseAmount(s(fd, "total")), rec = s(fd, "received");
  if (!uuidOk(item) || !uuidOk(sup) || v === null || !dateOk(rec)) redirect(`${dest}?err=bad_input`);
  const days = s(fd, "days");
  await call("procurement_bid_add", { p_item: item, p_supplier: sup, p_received: rec, p_currency: s(fd, "currency") === "LBP" ? "LBP" : "USD", p_total: v, p_days: days && /^\d+$/.test(days) ? Number(days) : null, p_warranty: opt(s(fd, "warranty")), p_note: opt(s(fd, "note")) }, dest);
}
export async function evaluateBid(fd: FormData) {
  const bid = s(fd, "bid"), item = s(fd, "item"), dest = `${ROOT}/bids/${item}`, c = s(fd, "compliant");
  if (!uuidOk(bid) || !uuidOk(item) || !["yes", "no"].includes(c)) redirect(`${dest}?err=bad_input`);
  await call("procurement_bid_evaluate", { p_bid: bid, p_compliant: c === "yes", p_note: opt(s(fd, "note")) }, dest);
}
