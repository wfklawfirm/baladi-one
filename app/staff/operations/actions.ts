"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

export async function assignRequest(fd: FormData) {
  const id = String(fd.get("id") ?? ""), to = String(fd.get("to") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || (to && !/^[0-9a-f-]{36}$/i.test(to))) return;
  const sb = await supabaseServer();
  await sb.rpc("assign_request", { p_id: id, p_user: to || null });
  revalidatePath("/staff/operations");
}
