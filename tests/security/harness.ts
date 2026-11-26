// Local, throwaway Postgres (PGlite, in-process WASM) for procurement security tests.
// It never reads env vars, never opens a network connection, and cannot reach any Supabase project.
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const MIG = path.join(ROOT, "supabase/migrations");
export const read = (f: string) => fs.readFileSync(path.join(MIG, f), "utf8");

/** Pull a real function definition (create ... $$ ... $$;) out of a migration so stubs cannot drift from production SQL. */
function extractFn(file: string, name: string): string {
  const src = read(file);
  const re = new RegExp(`create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\$\\$;`, "i");
  const m = src.match(re);
  if (!m) throw new Error(`harness: cannot extract ${name} from ${file}`);
  return m[0].replace(/^create function/i, "create or replace function");
}

function extractPolicy(file: string, name: string): string {
  const m = read(file).match(new RegExp(`create policy ${name} on [\\s\\S]*?;`, "i"));
  if (!m) throw new Error(`harness: cannot extract policy ${name}`);
  return m[0];
}

export const MIGRATIONS = ["0024_procurement_ext.sql", "0040_procurement_legal_foundation.sql", "0041_procurement_sources_seed.sql", "0042_procurement_suppliers_bids.sql"];

export type Who = "anon" | { uid: string };
export interface Env {
  db: PGlite;
  muniA: string; muniB: string;
  mayorA: string; adminA: string; clerkA: string; mayorB: string; outsider: string; demoMayorA: string;
  /** Run fn as the Supabase role (anon/authenticated) with auth.uid() = uid. Always resets afterwards. */
  as<T>(who: Who, fn: () => Promise<T>): Promise<T>;
  /** Returns the error (with .code/.message) a call raised, or null when it succeeded. */
  err(who: Who, sql: string, params?: unknown[]): Promise<{ code?: string; message: string } | null>;
  q<T = Record<string, unknown>>(who: Who, sql: string, params?: unknown[]): Promise<T[]>;
  /** Superuser (table owner, bypasses RLS) — used only for seeding and for ground-truth checks. */
  su<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function makeEnv(): Promise<Env> {
  const db = new PGlite();
  await db.exec("create extension if not exists pgcrypto;").catch(() => undefined);
  await db.exec(fs.readFileSync(path.join(__dirname, "stubs.sql"), "utf8"));
  await db.exec(extractFn("0001_schema_as_built.sql", "is_staff"));
  await db.exec(extractFn("0011_demo_accounts.sql", "is_demo_staff"));
  await db.exec(extractPolicy("0001_schema_as_built.sql", "audit_staff_read"));
  await db.exec(extractPolicy("0001_schema_as_built.sql", "staff_self"));
  await db.exec(extractFn("0015_council_decisions.sql", "_council_muni") + "\nrevoke all on function public._council_muni() from public, anon, authenticated;");
  for (const f of MIGRATIONS) await db.exec(read(f));

  const su = async <T,>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows as T[];
  const ids = { muniA: randomUUID(), muniB: randomUUID(), mayorA: randomUUID(), adminA: randomUUID(), clerkA: randomUUID(), mayorB: randomUUID(), outsider: randomUUID(), demoMayorA: randomUUID() };
  await su(`insert into municipality (id, slug, name_ar) values ($1,'muni-a','A'),($2,'muni-b','B')`, [ids.muniA, ids.muniB]);
  for (const u of [ids.mayorA, ids.adminA, ids.clerkA, ids.mayorB, ids.outsider, ids.demoMayorA]) await su(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@example.invalid`]);
  const sm = (u: string, m: string, r: string, demo = false) => su(`insert into staff_member (user_id, municipality_id, role, is_demo) values ($1,$2,$3,$4)`, [u, m, r, demo]);
  await sm(ids.mayorA, ids.muniA, "mayor"); await sm(ids.adminA, ids.muniA, "admin"); await sm(ids.clerkA, ids.muniA, "staff");
  await sm(ids.mayorB, ids.muniB, "mayor"); await sm(ids.demoMayorA, ids.muniA, "mayor", true);

  const as = async <T,>(who: Who, fn: () => Promise<T>): Promise<T> => {
    const role = who === "anon" ? "anon" : "authenticated";
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who === "anon" ? "" : who.uid}', false); set role ${role};`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
  };
  const q = <T,>(who: Who, sql: string, params?: unknown[]) => as(who, async () => (await db.query<T>(sql, params)).rows as T[]);
  const err = (who: Who, sql: string, params?: unknown[]) => as(who, async () => {
    try { await db.query(sql, params); return null; } catch (e) { const x = e as { code?: string; message?: string }; return { code: x.code, message: String(x.message) }; }
  });
  return { db, ...ids, as, err, q, su };
}

/** Builds `select fn($1,...)` with a harmless dummy per argument type, so every RPC can be probed generically. */
export async function rpcCalls(env: Env): Promise<{ name: string; sql: string; params: unknown[] }[]> {
  const rows = await env.su<{ proname: string; args: string }>(
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'procurement\\_%' or p.proname = 'contract_link_decision_late') order by 1`);
  const dummy: Record<string, () => unknown> = { uuid: () => randomUUID(), text: () => "x".repeat(20), integer: () => 2026, numeric: () => 1, date: () => "2026-01-01", boolean: () => true, "timestamp with time zone": () => new Date(Date.now() + 86_400_000).toISOString() };
  return rows.map((r) => {
    const types = r.args.split(",").map((a) => a.trim().split(/\s+/).slice(1).join(" ")).filter(Boolean);
    const params = types.map((t) => { const f = dummy[t]; if (!f) throw new Error(`harness: no dummy for type ${t} in ${r.proname}`); return f(); });
    return { name: r.proname, params, sql: `select public.${r.proname}(${params.map((_, i) => `$${i + 1}`).join(",")})` };
  });
}
