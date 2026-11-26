import "server-only";
import { cookies } from "next/headers";

/** Where "home" points for citizen pages: the clean citizen page (/c) when the visitor came through it, otherwise the original chooser (/m). */
export async function portalHome(slug: string): Promise<string> {
  const c = (await cookies()).get("portal")?.value;
  return c === "c" ? `/c/${slug}` : `/m/${slug}`;
}
