// Smoke test of 0052 (+ data files) on a throwaway in-process Postgres (PGlite). No network, no production access.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { searchTerms } from "./brain/supersession";
import { makeEnv, read, type Env } from "../tests/security/harness";

let E: Env; const u = (uid: string) => ({ uid });
const DATA = fs.readdirSync("supabase/migrations").filter((f) => /^00(5[3-9]|6\d)_ppa_documents_data_/.test(f)).sort();
beforeAll(async () => {
  E = await makeEnv();
  await E.db.exec(read("0052_ppa_documents.sql"));
  for (const f of DATA) await E.db.exec(read(f));
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
  it("every row is pending_review, none is labelled verified", async () => {
    expect((await E.su<any>(`select count(*)::int n from procurement_doc where verification_status <> 'pending_review'`))[0].n).toBe(0);
  });
  it("law 244 articles 100 and 101 are present", async () => {
    const r = await E.q<any>(u(E.mayorA), `select distinct label from procurement_doc_chunk where label in ('المادة 100','المادة 101')`);
    expect(r.length).toBe(2);
  });
});
