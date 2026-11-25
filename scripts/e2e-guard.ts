/**
 * E2E environment guard: end-to-end tests WRITE data, so they must never run against production.
 *
 * Why this exists: the previous Playwright runs wrote TEST_E2E rows into the production Supabase project, because a
 * local Next.js server was pointed at the production database. Checking BASE_URL alone is NOT enough: the Supabase URL
 * is what receives the writes, so both are checked, and they must agree.
 *
 * Usage in any E2E entry point (Playwright globalSetup, a node script, a vitest integration test) BEFORE any request:
 *
 *   import { assertSafeE2eEnv } from "../scripts/e2e-guard";
 *   assertSafeE2eEnv();                       // throws E2eGuardError when the environment is unsafe
 *
 * Or as a CLI pre-flight check (Node >= 22.18 strips types natively):
 *
 *   node scripts/e2e-guard.ts                 # exit 0 = safe, exit 1 = refused
 *
 * Variables read (names only; values are never printed except host names):
 *   E2E_TARGET            local | testing | staging          (required; "production" is always refused)
 *   BASE_URL              the app under test                 (required)
 *   SUPABASE_URL          the database the app talks to      (required; falls back to NEXT_PUBLIC_SUPABASE_URL)
 *   NEXT_PUBLIC_SUPABASE_URL  when also set, must be the same host as SUPABASE_URL
 *   E2E_ALLOWED_HOSTS     comma list of non-local hosts that may be written to, e.g.
 *                         "baladi-staging.vercel.app,abcdefghijklmnopqrst.supabase.co" (exact host, or "*.sub.domain.tld")
 *   E2E_PRODUCTION_HOSTS  extra comma list of production hosts to refuse (custom domains, production project ref)
 *   APP_ENV / VERCEL_ENV  refused when equal to "production"
 *
 * Deny always beats allow. No allowlist entry = loopback only.
 */

export type E2eEnv = Record<string, string | undefined>;

/** Hosts that are production and can never be a test target. Extend with E2E_PRODUCTION_HOSTS for custom domains. */
export const PRODUCTION_DENYLIST_HOSTS: readonly string[] = [
  "sdpemqqozovxmoaerspq.supabase.co", // production Supabase project (see supabase/migrations/0001 header)
  "baladi-one-pink.vercel.app",       // production deployment (docs/STATUS_REPORT.md)
];

export const E2E_TARGETS = ["local", "testing", "staging"] as const;
/** Every row an E2E test creates must carry this prefix so cleanup can find it deterministically (docs/ENVIRONMENTS.md). */
export const E2E_PREFIX = "TEST_E2E";
export const e2eName = (label: string, runId: string = String(Date.now())) => `${E2E_PREFIX}_${runId}_${label}`;

export class E2eGuardError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`E2E guard refused to run:\n - ${problems.join("\n - ")}`);
    this.name = "E2eGuardError";
    this.problems = problems;
  }
}

export type GuardResult = { ok: boolean; problems: string[]; hosts: { base?: string; supabase?: string } };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

type Parsed = { host: string; protocol: string; hasCreds: boolean } | null;
function parse(raw: string | undefined): Parsed {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { host: u.hostname.toLowerCase(), protocol: u.protocol, hasCreds: Boolean(u.username || u.password) };
  } catch { return null; }
}

const isLoopback = (host: string) => LOOPBACK.has(host);

/** exact host, or "*.suffix" which matches subdomains of suffix only (never the bare suffix, never a look-alike like evil-suffix). */
function matches(pattern: string, host: string): boolean {
  if (pattern.startsWith("*.")) return host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
  return host === pattern;
}

/** A wildcard must pin at least a 3-label suffix ("*.team.example.com"); "*", "*.com", "*.vercel.app", "*.supabase.co" are refused. */
const wildcardTooBroad = (pattern: string) => pattern === "*" || (pattern.startsWith("*.") && pattern.slice(2).split(".").length < 3);

function checkUrl(label: string, p: Parsed, env: { allow: string[]; deny: string[] }, problems: string[]) {
  if (!p) { problems.push(`${label} is missing or not a valid URL`); return; }
  if (p.hasCreds) problems.push(`${label} must not contain credentials in the URL`);
  const denied = env.deny.find((d) => matches(d, p.host));
  if (denied) { problems.push(`${label} host "${p.host}" is a PRODUCTION host (deny list)`); return; }
  if (isLoopback(p.host)) return;
  if (p.protocol !== "https:") problems.push(`${label} host "${p.host}" must use https (plain http is only accepted for loopback)`);
  if (!env.allow.some((a) => matches(a, p.host))) problems.push(`${label} host "${p.host}" is not in E2E_ALLOWED_HOSTS`);
}

/** Pure evaluation: never throws, never reads process.env unless no env is passed. Messages contain host names only. */
export function evaluateE2eEnv(env: E2eEnv = process.env): GuardResult {
  const problems: string[] = [];
  const target = (env.E2E_TARGET ?? "").trim().toLowerCase();
  if (!target) problems.push(`E2E_TARGET is not set (one of: ${E2E_TARGETS.join(", ")})`);
  else if (!(E2E_TARGETS as readonly string[]).includes(target)) problems.push(`E2E_TARGET "${target}" is not allowed (one of: ${E2E_TARGETS.join(", ")})`);

  for (const k of ["APP_ENV", "VERCEL_ENV"] as const) if ((env[k] ?? "").trim().toLowerCase() === "production") problems.push(`${k}=production`);

  const allow = list(env.E2E_ALLOWED_HOSTS);
  for (const a of allow) if (wildcardTooBroad(a)) problems.push(`E2E_ALLOWED_HOSTS entry "${a}" is too broad (a wildcard must pin at least three labels)`);
  const safeAllow = allow.filter((a) => !wildcardTooBroad(a));
  const deny = [...PRODUCTION_DENYLIST_HOSTS, ...list(env.E2E_PRODUCTION_HOSTS)];

  const base = parse(env.BASE_URL);
  const dbRaw = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const db = parse(dbRaw);
  checkUrl("BASE_URL", base, { allow: safeAllow, deny }, problems);
  checkUrl("SUPABASE_URL", db, { allow: safeAllow, deny }, problems);

  // The app server reads NEXT_PUBLIC_SUPABASE_URL; if it differs from the URL the test believes it is using, writes go elsewhere.
  if (env.SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL) {
    const pub = parse(env.NEXT_PUBLIC_SUPABASE_URL);
    checkUrl("NEXT_PUBLIC_SUPABASE_URL", pub, { allow: safeAllow, deny }, problems);
    if (pub && db && pub.host !== db.host) problems.push(`SUPABASE_URL host "${db.host}" differs from NEXT_PUBLIC_SUPABASE_URL host "${pub.host}"`);
  }
  return { ok: problems.length === 0, problems, hosts: { base: base?.host, supabase: db?.host } };
}

/** Throws E2eGuardError unless the environment is a safe non-production target. Call first, before any network or DB access. */
export function assertSafeE2eEnv(env: E2eEnv = process.env): GuardResult {
  const r = evaluateE2eEnv(env);
  if (!r.ok) throw new E2eGuardError(r.problems);
  return r;
}

// CLI pre-flight: `node scripts/e2e-guard.ts`
if (typeof process !== "undefined" && process.argv[1] && /e2e-guard\.(ts|js|mjs)$/.test(process.argv[1])) {
  const r = evaluateE2eEnv();
  if (r.ok) console.log(`E2E guard OK: app=${r.hosts.base} database=${r.hosts.supabase}`);
  else { console.error(`E2E guard refused to run:\n - ${r.problems.join("\n - ")}`); process.exit(1); }
}
