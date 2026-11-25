import "server-only";
import { loadCatalog } from "./catalog";
import { draftServices } from "./draft";
import type { Service } from "./types";

/** The service list the citizen sees (approved catalog, otherwise the labelled drafts) — same rule as the kiosk page. */
export async function portalServices(): Promise<Service[]> {
  const cat = await loadCatalog();
  const approved = cat.services.length > 0 && !cat.demo;
  return approved ? cat.services : draftServices();
}
