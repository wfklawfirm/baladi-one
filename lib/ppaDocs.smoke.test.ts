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
});
