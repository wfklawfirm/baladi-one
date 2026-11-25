import { describe, expect, it } from "vitest";
import { E2E_PREFIX, E2eGuardError, PRODUCTION_DENYLIST_HOSTS, assertSafeE2eEnv, e2eName, evaluateE2eEnv } from "./e2e-guard";

const PROD_DB = `https://${PRODUCTION_DENYLIST_HOSTS[0]}`;
const PROD_APP = `https://${PRODUCTION_DENYLIST_HOSTS[1]}`;
const STG_DB = "https://abcdefghijklmnopqrst.supabase.co";
const STG_APP = "https://baladi-staging.vercel.app";
const stg = { E2E_TARGET: "staging", BASE_URL: STG_APP, SUPABASE_URL: STG_DB, E2E_ALLOWED_HOSTS: "baladi-staging.vercel.app,abcdefghijklmnopqrst.supabase.co" };

describe("e2e guard", () => {
  it("accepts a fully local stack", () => {
    expect(evaluateE2eEnv({ E2E_TARGET: "local", BASE_URL: "http://localhost:3000", SUPABASE_URL: "http://127.0.0.1:54321" }).ok).toBe(true);
  });
  it("accepts an explicitly allow-listed staging stack", () => {
    expect(assertSafeE2eEnv(stg).hosts).toEqual({ base: "baladi-staging.vercel.app", supabase: "abcdefghijklmnopqrst.supabase.co" });
  });
  it("refuses production Supabase even from a local app (the original incident)", () => {
    const r = evaluateE2eEnv({ E2E_TARGET: "local", BASE_URL: "http://localhost:3000", SUPABASE_URL: PROD_DB });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/PRODUCTION host/);
  });
  it("refuses the production app, and deny beats allow", () => {
    const r = evaluateE2eEnv({ ...stg, BASE_URL: PROD_APP, E2E_ALLOWED_HOSTS: `${stg.E2E_ALLOWED_HOSTS},${PRODUCTION_DENYLIST_HOSTS[1]},${PRODUCTION_DENYLIST_HOSTS[0]}` });
    expect(r.ok).toBe(false);
    const r2 = evaluateE2eEnv({ ...stg, SUPABASE_URL: PROD_DB, E2E_ALLOWED_HOSTS: PRODUCTION_DENYLIST_HOSTS[0] });
    expect(r2.ok).toBe(false);
  });
  it("honours extra production hosts (custom domain, project ref)", () => {
    const r = evaluateE2eEnv({ ...stg, E2E_PRODUCTION_HOSTS: "baladi-staging.vercel.app" });
    expect(r.ok).toBe(false);
  });
  it("refuses unset or unknown targets and production flags", () => {
    expect(evaluateE2eEnv({ ...stg, E2E_TARGET: undefined }).ok).toBe(false);
    expect(evaluateE2eEnv({ ...stg, E2E_TARGET: "production" }).ok).toBe(false);
    expect(evaluateE2eEnv({ ...stg, VERCEL_ENV: "production" }).ok).toBe(false);
    expect(evaluateE2eEnv({ ...stg, APP_ENV: "Production" }).ok).toBe(false);
  });
  it("refuses missing or malformed URLs", () => {
    expect(evaluateE2eEnv({ E2E_TARGET: "local" }).ok).toBe(false);
    expect(evaluateE2eEnv({ E2E_TARGET: "local", BASE_URL: "not a url", SUPABASE_URL: "http://localhost:54321" }).ok).toBe(false);
  });
  it("refuses a non-loopback host that is not allow-listed, and plain http off loopback", () => {
    expect(evaluateE2eEnv({ ...stg, E2E_ALLOWED_HOSTS: "" }).ok).toBe(false);
    expect(evaluateE2eEnv({ ...stg, BASE_URL: "http://baladi-staging.vercel.app" }).ok).toBe(false);
  });
  it("does not let look-alike hosts pass an exact or wildcard entry", () => {
    expect(evaluateE2eEnv({ ...stg, SUPABASE_URL: `${PROD_DB}.evil.example`, E2E_ALLOWED_HOSTS: "baladi-staging.vercel.app" }).ok).toBe(false);
    const wild = { ...stg, E2E_ALLOWED_HOSTS: "*.team.example.com", BASE_URL: "https://x.team.example.com", SUPABASE_URL: "https://db.team.example.com" };
    expect(evaluateE2eEnv(wild).ok).toBe(true);
    expect(evaluateE2eEnv({ ...wild, BASE_URL: "https://evilteam.example.com" }).ok).toBe(false);
    expect(evaluateE2eEnv({ ...wild, BASE_URL: "https://team.example.com" }).ok).toBe(false);
  });
  it("rejects over-broad wildcards", () => {
    for (const w of ["*", "*.com", "*.vercel.app", "*.supabase.co"]) {
      expect(evaluateE2eEnv({ ...stg, E2E_ALLOWED_HOSTS: `${stg.E2E_ALLOWED_HOSTS},${w}` }).problems.join(" ")).toMatch(/too broad/);
    }
  });
  it("refuses credentials embedded in a URL", () => {
    expect(evaluateE2eEnv({ ...stg, BASE_URL: "https://user:pw@baladi-staging.vercel.app" }).ok).toBe(false);
  });
  it("requires the app's public Supabase URL to be the same database as the test's", () => {
    const r = evaluateE2eEnv({ ...stg, NEXT_PUBLIC_SUPABASE_URL: PROD_DB });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(evaluateE2eEnv({ ...stg, NEXT_PUBLIC_SUPABASE_URL: STG_DB }).ok).toBe(true);
  });
  it("falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is unset", () => {
    expect(evaluateE2eEnv({ ...stg, SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: PROD_DB }).ok).toBe(false);
  });
  it("assert throws a typed error and never echoes secrets", () => {
    const env = { E2E_TARGET: "local", BASE_URL: "http://localhost:3000", SUPABASE_URL: PROD_DB, SUPABASE_SERVICE_ROLE_KEY: "sekret-value-123", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-value-456" };
    let err: unknown;
    try { assertSafeE2eEnv(env); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(E2eGuardError);
    expect(String((err as Error).message)).not.toMatch(/sekret-value|anon-value/);
  });
  it("names test rows with the cleanup prefix", () => {
    expect(e2eName("contract", "42")).toBe(`${E2E_PREFIX}_42_contract`);
  });
});
