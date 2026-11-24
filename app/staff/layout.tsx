import { Suspense } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import ResponsiveTables from "@/components/ResponsiveTables";
import ExecCopilot from "@/components/brain/ExecCopilot";

/** Mayor/admin sessions get the floating executive copilot on every workspace page; no redirect here (login lives under /staff). */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  let show = false;
  try {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (user) { const { data } = await sb.from("staff_member").select("role,must_change_password").eq("user_id", user.id); show = !!data?.some((r: any) => (r.role === "mayor" || r.role === "admin") && !r.must_change_password); }
  } catch { /* no copilot without a verified session */ }
  return <>{children}<ResponsiveTables />{show && <Suspense fallback={null}><ExecCopilot /></Suspense>}</>;
}
