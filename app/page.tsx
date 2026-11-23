import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
export default function Home() { redirect(`/m/${BRAND.slug}`); }
