// Static security checks for the procurement code (no network, no DB). Heuristic by nature: they catch regressions of the known
// patterns; they do not prove the absence of other flaws. See docs/PROCUREMENT_SECURITY_AUDIT.md.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const read = (f: string) => fs.readFileSync(f, "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const PROC_DIRS = ["app/staff/procurement", "app/staff/projects/procurement", "components/procurement", "components/projects/procurement"].map((d) => path.join(ROOT, d));
const procFiles = PROC_DIRS.flatMap((d) => walk(d));
const libProc = fs.readdirSync(path.join(ROOT, "lib")).filter((f) => /^procurement.*\.ts$/.test(f) && !/\.test\.ts$/.test(f)).map((f) => path.join(ROOT, "lib", f));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql") && !/DRAFT/i.test(f) && !f.startsWith("0046_")).map((f) => ({ f, src: read(path.join(ROOT, "supabase/migrations", f)) }));
const allSql = migrations.map((m) => m.src).join("\n");

describe("server actions go through auth-guarded RPCs", () => {
  const actionFiles = procFiles.filter((f) => /^\s*["']use server["']/.test(read(f)));
  it("the procurement server-action files exist", () => { expect(actionFiles.length).toBeGreaterThanOrEqual(2); });
  it("action files never write with .insert/.update/.upsert/.delete and never import an admin/service client", () => {
    for (const f of actionFiles) {
      const src = stripComments(read(f));
      expect(src, rel(f)).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
      expect(src, rel(f)).not.toMatch(/service[_-]?role|supabaseAdmin|createClient\s*\(|SUPABASE_SERVICE/i);
      expect(src, rel(f)).toMatch(/from "@\/lib\/supabase-server"/);
    }
  });
  it("writes in action files are only sb.rpc(...); any .from() in an action is a read (.select) on the cookie-bound client", () => {
    for (const f of actionFiles) for (const m of stripComments(read(f)).matchAll(/\.from\s*\(\s*"[a-z_]+"\s*\)\s*(\.\w+)/g)) expect(m[1], rel(f)).toBe(".select");
  });
  it("only procurement pages/components/libs read tables; none of them writes", () => {
    for (const f of [...procFiles, ...libProc]) expect(stripComments(read(f)), rel(f)).not.toMatch(/\.from\s*\([^)]*\)\s*\.(insert|update|upsert|delete)\b/);
  });
  it("every RPC name an action invokes is defined in the migrations, SECURITY DEFINER, revoked from anon/public, granted to authenticated, and guarded by _council_muni()", () => {
    const names = new Set<string>();
    for (const f of actionFiles) for (const m of read(f).matchAll(/\b(?:call|rpc)\(\s*"([a-z0-9_]+)"/g)) names.add(m[1]);
    expect(names.size).toBeGreaterThanOrEqual(10);
    const problems: string[] = [];
    for (const n of names) {
      const defRe = new RegExp(`create or replace function public\\.${n}\\([\\s\\S]*?\\n(?:end|\\s*)\\s*\\$\\$;`, "gi");
      const defs = [...allSql.matchAll(defRe)].map((m) => m[0]);
      if (!defs.length) { problems.push(`${n}: not defined in an applied migration (may be pending)`); continue; }
      const last = defs[defs.length - 1];
      if (!/security definer/i.test(last)) problems.push(`${n}: not SECURITY DEFINER`);
      if (!/set search_path/i.test(last)) problems.push(`${n}: no fixed search_path`);
      if (!/_council_muni\(\)|is_staff\(|auth\.uid\(\)/.test(last)) problems.push(`${n}: no auth guard in body`);
      if (!new RegExp(`${n}\\b[^;]*\\bfrom public, anon`, "i").test(allSql) && !new RegExp(`'${n}\\(`, "i").test(allSql)) problems.push(`${n}: no revoke from public, anon found`);
      if (!new RegExp(`grant execute on function[^;]*${n}[^;]*to authenticated|'${n}\\(`, "i").test(allSql)) problems.push(`${n}: no grant to authenticated found`);
    }
    expect(problems).toEqual([]);
  });
  it("every staff procurement page calls requireStaff() (or sits under a layout that does) before touching data", () => {
    const pages = procFiles.filter((f) => /\/page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThan(5);
    const noGuard = pages.filter((f) => !/requireStaff\(|requireMayor\(|requireProcurement\w*\(/.test(read(f)) && !/requireStaff\(/.test(layoutChain(f)));
    expect(noGuard.map(rel)).toEqual([]);
  });
  it("the cookie-bound server client uses only the public anon key", () => {
    const s = read(path.join(ROOT, "lib/supabase-server.ts"));
    expect(s).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/); expect(s).not.toMatch(/service[_-]?role/i);
  });
});
function layoutChain(file: string): string {
  let d = path.dirname(file), acc = "";
  while (d.startsWith(path.join(ROOT, "app"))) { const l = path.join(d, "layout.tsx"); if (fs.existsSync(l)) acc += read(l); d = path.dirname(d); }
  return acc;
}

describe("no hard-coded legal numbers in procurement code (thresholds, ratios, deadlines live in reviewed DB tables)", () => {
  const files = [...libProc, ...procFiles.filter((f) => /\/components\//.test(f))];
  // Allow-list: UI size limits, query page sizes, time-unit arithmetic. Anything else >= 1000 in code is suspicious.
  const allowLine = /ترحيل|migration|maxLength|\.limit\(|rows=|86_400_000|\* 1000|\/ 1000|setTimeout|toFixed|1e13|slice\(|Date\.UTC|padStart|\.length/;
  it("no numeric literal >= 1000 (monetary-threshold-like) outside the allow-list", () => {
    const hits: string[] = [];
    for (const f of files) stripComments(read(f)).split("\n").forEach((line, i) => {
      if (allowLine.test(line)) return;
      for (const m of line.matchAll(/(?<![\w.#"'-])(\d{1,3}(?:[_,]\d{3})+|\d{4,})(?![\w"'-]|\.\d)/g)) hits.push(`${rel(f)}:${i + 1}: ${m[1]}`);
    });
    expect(hits).toEqual([]);
  });
  it("no constant named like a legal limit is assigned a number (THRESHOLD/CEILING/LIMIT/CAP/SAQF/سقف)", () => {
    const hits: string[] = [];
    for (const f of files) stripComments(read(f)).split("\n").forEach((line, i) => { if (/\b(?:const|let|var)\s+\w*(?:THRESHOLD|CEIL|LIMIT|CAP|MAX_VALUE|MIN_VALUE|RATIO|PERCENT|PCT)\w*\s*(?::[^=]+)?=\s*[\d.]+/i.test(line)) hits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 100)}`); });
    expect(hits).toEqual([]);
  });
  it("no Arabic/English UI text asserts a legal number (days/percent/currency amount) next to a law keyword", () => {
    const hits: string[] = [];
    const KNOWN = /(?!)/; // F-4 fixed: no allowed exceptions remain
    const num = /(\d+(?:[.,]\d+)?)\s*(?:%|٪|يوم|أيام|ايام|يومًا|يوماً|يوم عمل|دولار|ليرة|ل\.ل|\$|USD|LBP)/;
    for (const f of files) stripComments(read(f)).split("\n").forEach((line, i) => {
      if (/maxLength|placeholder|className|\bw-\d|\bh-\d|px|opacity|width|height/.test(line) && !/["'`][^"'`]*(?:يوم|أيام|دولار|ليرة)/.test(line)) return;
      const m = line.match(num); if (m && !KNOWN.test(line)) hits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
    expect(hits).toEqual([]);
  });
  it("F-4 (fixed): no hard-coded standstill length remains in lib/procurement.ts or lib/projects.ts", () => {
    for (const f of ["lib/procurement.ts", "lib/projects.ts"]) expect(read(path.join(ROOT, f)), f).not.toMatch(/\d+\s*أيام عمل/);
  });
  it("0024/0040/0042 seed no threshold rows and no legal values (threshold table stays empty by default)", () => {
    for (const f of ["0024_procurement_ext.sql", "0040_procurement_legal_foundation.sql", "0042_procurement_suppliers_bids.sql"]) {
      const s = migrations.find((m) => m.f === f)!.src.replace(/\$\$[\s\S]*?\$\$/g, "$$$$"); // outside function bodies
      expect(s, f).not.toMatch(/insert into (?:public\.)?procurement_threshold\b/i);
      expect(s, f).not.toMatch(/insert into (?:public\.)?procurement_setting\b[^;]*values/i);
    }
  });
});

describe("no service-role key (or any secret) in client-reachable code", () => {
  const all = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !/\.test\.tsx?$/.test(f));
  const isClient = (f: string) => /^\s*(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(read(f));
  it("there are client components to check", () => { expect(all.filter(isClient).length).toBeGreaterThan(5); });
  it("no 'use client' file mentions service_role / SERVICE_ROLE / a non-NEXT_PUBLIC process.env", () => {
    const bad: string[] = [];
    for (const f of all.filter(isClient)) {
      const s = stripComments(read(f));
      if (/service[_-]?role|SERVICE_KEY|SUPABASE_SERVICE/i.test(s)) bad.push(`${rel(f)}: service role`);
      for (const m of s.matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (!m[1].startsWith("NEXT_PUBLIC_") && m[1] !== "NODE_ENV") bad.push(`${rel(f)}: process.env.${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
  it("no app/components/lib source (client or server) references the service-role key at all", () => {
    const bad = all.filter((f) => /service[_-]?role|SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY/i.test(stripComments(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });
  it("no NEXT_PUBLIC_ variable carries a secret-looking name, and next.config does not inline server secrets", () => {
    const src = [...all, path.join(ROOT, "next.config.ts"), path.join(ROOT, "proxy.ts")].filter((f) => fs.existsSync(f)).map((f) => stripComments(read(f))).join("\n");
    const names = new Set([...src.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)].map((m) => m[0]));
    for (const n of names) expect(n, n).not.toMatch(/SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN|JWT/);
    expect(fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8")).not.toMatch(/\benv\s*:\s*\{[^}]*(SECRET|SERVICE|KEY)/i);
  });
  it("no JWT-like or sk-/ghp_ token literal in procurement sources", () => {
    for (const f of [...procFiles, ...libProc]) expect(read(f), rel(f)).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{20,}|\bghp_[A-Za-z0-9]{20,}/);
  });
});

describe("migrations: every procurement SECURITY DEFINER function pins search_path and is never granted to anon/public", () => {
  it("static scan of applied migrations", () => {
    const bad: string[] = [];
    for (const m of migrations) {
      for (const f of m.src.matchAll(/create or replace function public\.((?:procurement_|contract_link_decision_late)\w*)\([\s\S]*?\$\$;/gi)) {
        if (/security definer/i.test(f[0]) && !/set search_path/i.test(f[0])) bad.push(`${m.f}: ${f[1]} lacks search_path`);
      }
      if (/grant execute on function[^;]*procurement_[^;]*to\s+(?:anon|public)\b/i.test(m.src)) bad.push(`${m.f}: grants procurement RPC to anon/public`);
    }
    expect(bad).toEqual([]);
  });
});
