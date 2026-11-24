"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Phones: wide data tables become stacked cards (labels taken from the header cells). Desktop is untouched. */
export default function ResponsiveTables() {
  const path = usePathname();
  useEffect(() => {
    document.querySelectorAll<HTMLTableElement>("main table, table").forEach((t) => {
      if (t.closest("[data-keep-table]")) return;
      const heads = Array.from(t.querySelectorAll("thead th")).map((h) => h.textContent?.trim() ?? "");
      if (!heads.length) return;
      t.classList.add("rt");
      t.querySelectorAll("tbody tr").forEach((tr) => Array.from(tr.children).forEach((td, i) => { if (!td.getAttribute("data-label")) td.setAttribute("data-label", heads[i] ?? ""); }));
    });
  }, [path]);
  return null;
}
