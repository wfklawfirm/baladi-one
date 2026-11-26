import { renderHtml } from "@/lib/procurementDocs/html";
import type { Doc } from "@/lib/procurementDocs/types";

/** Printable A4 RTL document. The HTML is produced by lib/procurementDocs/html.ts, which escapes every value. */
export default function DocHtml({ doc, recordId }: { doc: Doc; recordId?: string | null }) {
  return <div dangerouslySetInnerHTML={{ __html: renderHtml(doc, { recordId }) }} />;
}
