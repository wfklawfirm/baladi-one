// Smoke test of 0052 (+ data files) on a throwaway in-process Postgres (PGlite). No network, no production access.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { searchTerms } from "./brain/supersession";
import { makeEnv, read, type Env } from "../tests/security/harness";

let E: Env; const u = (uid: string) => ({ uid });
const DOCS = JSON.parse(fs.readFileSync("data/ppa_docs.json", "utf8")) as any[];
beforeAll(async () => {
  E = await makeEnv();
  await E.db.exec(read("0052_ppa_documents.sql"));
  await E.db.exec(`create or replace function public.is_platform_owner() returns boolean language sql stable as $$ select auth.uid() = '${E.mayorA}'::uuid $$; grant execute on function public.is_platform_owner() to authenticated, anon;`);
  await E.db.exec(read("0061_ppa_documents_import.sql"));
  for (const d of DOCS) await E.q(u(E.mayorA), `select procurement_doc_import($1::jsonb)`, [JSON.stringify(d)]);
  await E.db.exec(read("0062_ppa_doc_review.sql"));
}, 300_000);
afterAll(async () => { await E?.db.close(); });

describe("PPA documents", () => {
  it("staff can search, outsiders and anon cannot read", async () => {
    const r = await E.q<any>(u(E.mayorA), `select * from procurement_doc_search(array['لجان','التلزيم','رئيس','البلدية'], 5)`);
    expect(r.length).toBeGreaterThan(0);
    expect((await E.err("anon", `select * from procurement_doc_search(array['لجان'],3)`))?.code).toBe("42501");
    expect((await E.q<any>(u(E.outsider), `select count(*)::int n from procurement_doc`))[0].n).toBe(0);
  });
  it("PPA decision 9/2023 keeps the mayor out when council members must be used", async () => {
    const r = await E.q<any>(u(E.mayorA), `select body from procurement_doc_search(array['باستثناء','رئيس','البلدية','اللجان'], 10) where title like '%9/%2023%'`);
    expect(r.some((x) => x.body.includes("باستثناء رئيس البلدية"))).toBe(true);
  });
  it("the exact question that went wrong now retrieves decision 9/2023 in the top results", async () => {
    const terms = searchTerms("هل يحق لرئيس البلدية أن يكون عضوا في لجنة الشراء؟");
    const r = await E.q<any>(u(E.mayorA), `select title, body from procurement_doc_search($1::text[], 10)`, [terms]);
    expect(r.some((x) => /9\/.*2023/.test(x.title) && x.body.includes("باستثناء رئيس البلدية"))).toBe(true);
  });
  it("only the platform owner can import", async () => {
    expect(String((await E.err(u(E.clerkA), `select procurement_doc_import('{}'::jsonb)`))?.message)).toContain("forbidden");
    expect((await E.err("anon", `select procurement_doc_import('{}'::jsonb)`))?.code).toBe("42501");
    expect(String((await E.err(u(E.mayorA), `select procurement_doc_import('{"page_id":"1","source_url":"https://evil.example/x","chunks":[]}'::jsonb)`))?.message)).toContain("invalid_doc");
  });
  it("a drafting request for the committee decision also retrieves the mayor exclusion", async () => {
    const terms = searchTerms("اعطني نموذج قرار تشكيل لجنة الشراء في البلدية");
    const r = await E.q<any>(u(E.mayorA), `select body from procurement_doc_search($1::text[], 10)`, [terms]);
    expect(r.slice(0, 8).some((x) => x.body.includes("باستثناء رئيس البلدية"))).toBe(true);
  });
  it("every row is pending_review, none is labelled verified", async () => {
    expect((await E.su<any>(`select count(*)::int n from procurement_doc where verification_status <> 'pending_review'`))[0].n).toBe(0);
  });
  it("law 244 articles 100 and 101 are present", async () => {
    const r = await E.q<any>(u(E.mayorA), `select distinct label from procurement_doc_chunk where label in ('المادة 100','المادة 101')`);
    expect(r.length).toBe(2);
  });

  describe("owner review (0062)", () => {
    const st = async (pid: number) => (await E.q<any>(u(E.mayorA), `select verification_status s from procurement_doc where page_id=$1`, [pid]))[0].s;
    it("only the owner can review; a note is mandatory; text-less documents cannot be verified", async () => {
      expect(String((await E.err(u(E.clerkA), `select procurement_doc_review(1,'verified','قارنت بالأصل وتحققت')`))?.message)).toContain("forbidden");
      expect((await E.err("anon", `select procurement_doc_review(1,'verified','x')`))?.code).toBe("42501");
      expect(String((await E.err(u(E.mayorA), `select procurement_doc_review(1,'verified','قصير')`))?.message)).toContain("note_required");
      expect(String((await E.err(u(E.mayorA), `select procurement_doc_review(1,'bogus','قارنت بالأصل وتحققت')`))?.message)).toContain("invalid_status");
      const noText = DOCS.find((d) => !d.text_quality)!.page_id;
      expect(String((await E.err(u(E.mayorA), `select procurement_doc_review($1,'verified','قارنت بالأصل وتحققت')`, [noText]))?.message)).toContain("no_text_to_verify");
    });
    it("verification is logged, shows in search, and is voided when the text changes on re-import", async () => {
      expect(await st(1)).toBe("pending_review");
      await E.q(u(E.mayorA), `select procurement_doc_review(1,'verified','قارنت بالأصل في ملف PDF وتحققت')`);
      expect(await st(1)).toBe("verified");
      const r = await E.q<any>(u(E.mayorA), `select verification_status s from procurement_doc_search(array['باستثناء','رئيس','البلدية'], 10) where page_id=1`);
      expect(r[0].s).toBe("verified");
      expect((await E.q<any>(u(E.mayorA), `select count(*)::int n from procurement_doc_review_log where page_id=1 and to_status='verified'`))[0].n).toBe(1);
      expect((await E.q<any>(u(E.clerkA), `select count(*)::int n from procurement_doc_review_log`))[0].n).toBe(0);
      const d1 = DOCS.find((d) => d.page_id === 1);
      await E.q(u(E.mayorA), `select procurement_doc_import($1::jsonb)`, [JSON.stringify(d1)]);          // same text: stays verified
      expect(await st(1)).toBe("verified");
      const changed = { ...d1, chunks: d1.chunks.map((c: any, i: number) => (i === 0 ? { ...c, b: c.b + " تعديل" } : c)) };
      await E.q(u(E.mayorA), `select procurement_doc_import($1::jsonb)`, [JSON.stringify(changed)]);     // changed text: back to pending
      expect(await st(1)).toBe("pending_review");
      await E.q(u(E.mayorA), `select procurement_doc_import($1::jsonb)`, [JSON.stringify(d1)]);
    });
    it("rejected or superseded documents are never retrieved", async () => {
      await E.q(u(E.mayorA), `select procurement_doc_review(1,'rejected','نسخة غير مطابقة للأصل')`);
      expect((await E.q<any>(u(E.mayorA), `select 1 from procurement_doc_search(array['باستثناء','رئيس','البلدية'], 10) where page_id=1`)).length).toBe(0);
      await E.q(u(E.mayorA), `select procurement_doc_review(1,'pending_review','إعادة فتح للمراجعة')`);
      expect((await E.q<any>(u(E.mayorA), `select 1 from procurement_doc_search(array['باستثناء','رئيس','البلدية'], 10) where page_id=1`)).length).toBeGreaterThan(0);
    });
  });
});
