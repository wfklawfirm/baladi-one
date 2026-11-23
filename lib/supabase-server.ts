import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component: proxy refreshes the session */ } },
    },
  });
}

/** Authenticated staff member (verified with the auth server) or redirect to login. */
export async function requireStaff() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/staff/login");
  const { data: rows } = await sb.from("staff_member").select("municipality_id,role,display_name,municipality(slug,name_ar)").eq("user_id", user.id);
  if (!rows?.length) redirect("/staff/login?denied=1");
  return { sb, user, memberships: rows as any[] };
}
