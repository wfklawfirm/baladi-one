import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";

export default function MIndex() {
  redirect(`/m/${BRAND.slug}`);
}
