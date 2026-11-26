"use client";
import { useEffect } from "react";
/** Remembers (6 h) that the visitor entered through the clean citizen page, so back/home links stay inside it. */
export default function PortalMark() {
  useEffect(() => { try { document.cookie = "portal=c; path=/; max-age=21600; samesite=lax"; } catch { /* cookies blocked: links fall back to the default home */ } }, []);
  return null;
}
