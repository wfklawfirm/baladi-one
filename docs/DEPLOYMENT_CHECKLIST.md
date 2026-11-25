# Deployment Checklist

Date: 2026-11-25. Companion to `docs/ENVIRONMENTS.md`. Tick every box in order; a release is not "done" until section 6 is signed off. Anything marked **(owner)** needs account access this repository does not have.

## 0. Preconditions (one-time)

- [ ] **(owner)** Staging and Conference-Demo projects exist (`docs/ENVIRONMENTS.md`). Until then, every release is a production experiment: do not describe it as tested.
- [ ] **(owner)** Previously leaked secrets rotated and old values revoked: GitHub personal access tokens, OpenAI key, Qdrant key, Supabase JWT secret (rotating the JWT secret signs everyone out and changes the anon key: update Vercel variables and redeploy).
- [ ] **(owner)** Auth settings in every project: leaked-password protection ON, minimum password length ≥ 12, default/weak passwords replaced, demo accounts removed from production.
- [ ] Backups: confirm the plan's backup/PITR capability and the last successful backup time in the Supabase dashboard. Write down the restore procedure and test it once into staging.
- [ ] Migration folder equals what production runs: draft files (`0003`, `0004`, `0008`) moved out of `supabase/migrations/` or clearly excluded; gaps in numbering (`0009`, `0021`–`0023`) explained.

## 1. Pre-merge gates (automated, no database)

- [ ] `npx tsc --noEmit` clean.
- [ ] `npx vitest run` green (94 tests at the time of writing, including `scripts/e2e-guard.test.ts`).
- [ ] No secrets in the diff: `git diff <base-branch>... | grep -nE "sk-|ghp_|github_pat_|eyJ[A-Za-z0-9_-]{15,}\.|sb_secret_"` returns nothing. The working tree and all 90 commits of history were scanned on 2026-11-25 with the same kind of patterns and were clean.
- [ ] `.env.example` lists names only, no values, and no variable the code does not read (remove `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] New RPCs: `SECURITY DEFINER` has `set search_path`, the municipality comes from the session (`_council_muni()`), `revoke all ... from public, anon` then an explicit `grant execute ... to authenticated`, demo behaviour decided, role decided (`docs/PERMISSION_MATRIX.md`).
- [ ] New tables: RLS enabled, SELECT policy uses the narrowest role list, no write policy unless unavoidable, money columns `numeric(14,2)`, FKs with `RESTRICT` for ledgers.

## 2. Staging rehearsal

- [ ] Preview deployment of the branch uses **staging** Supabase variables (check in Vercel: Preview scope, not Production).
- [ ] `E2E_TARGET=staging ... node scripts/e2e-guard.ts` prints "E2E guard OK".
- [ ] Apply the new migration files to staging, in order, one file at a time; record the time and result.
- [ ] Run the E2E suite against staging; attach results to `docs/LEGAL_TEST_RESULTS.md`.
- [ ] Re-run the permission checks that apply to the change (anon, clerk, mayor, admin, demo, other municipality): expect `42501 forbidden` where the matrix says "–".

## 3. Production release

- [ ] **(owner)** Written approval for this release and for each migration.
- [ ] Backup taken now (not "last night") and its timestamp noted; for destructive changes also a table-level dump.
- [ ] Rollback prepared (section 5) and the previous deployment identified in Vercel.
- [ ] Apply migrations to production **before** promoting an app version that needs them; apply additive migrations (new columns/functions) before the app, removals after (expand → deploy → contract).
- [ ] Promote the build that was tested on staging (do not rebuild a different commit).
- [ ] Environment variables in Production scope contain **no** `DEMO_*`, no `E2E_*`, and the production Supabase URL only there.

## 4. Security headers and CSP

Added in `next.config.ts` (global, all routes): `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()`, `Strict-Transport-Security: max-age=31536000`. `poweredByHeader` was already off. The microphone stays allowed for the same origin because voice dictation (`components/Mic.tsx`) needs it. `proxy.ts` already sets `Cache-Control: private, no-store` on `/staff/*`.

Verify after deploy: `curl -sI https://<host>/ | grep -iE "x-content-type|x-frame|referrer|permissions|strict-transport"`.

**CSP recommendation (not applied).** I could not verify, without running the app in a browser, that a CSP would not break it: Next.js emits inline bootstrap scripts, the pages use `next/font/google` (fonts are self-hosted at build time by Next, but confirm no runtime request to Google), QR codes are rendered as inline SVG, and the voice recorder uses `getUserMedia` and `blob:` audio. Suggested rollout:
1. Generate a per-request nonce in `proxy.ts` and send `Content-Security-Policy-Report-Only` first, with: `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://<project>.supabase.co; media-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'`.
2. Collect violations in staging for at least a week of normal use (all staff pages, kiosk, print views, voice, XLSX download), fix, then switch to enforcing.
3. Note: nonce-based CSP forces dynamic rendering of every page; check the cost for public catalogue pages.
Also consider `Cross-Origin-Opener-Policy: same-origin` (safe if no popups are used) and `X-Frame-Options: DENY` once it is confirmed that no page frames another.

Other web-layer items not changed here: citizen tracking codes travel in the query string (`/m/<slug>/track?code=`), so they appear in server logs, browser history and, with a laxer referrer policy, in `Referer`; `strict-origin-when-cross-origin` keeps them out of cross-origin referrers.

## 5. Rollback plan for migrations

Facts about this repository: migrations are forward-only SQL files with no "down" scripts; functions are redefined with `create or replace`; two migrations drop and recreate functions with different signatures (`0019` dropped `finance_amend(uuid,numeric,text,date)` and `contract_add` old signature; `0020` dropped `decision_set_review` old signature), so an app version and a database version must move together.

Before applying anything
1. Backup + timestamp (section 3). 2. Run the same files on staging first. 3. For each file write the inverse in the PR description (below).

Inverse by kind of change
| Change | Rollback |
|---|---|
| New table/column/index/constraint, nothing depends on it yet | `drop` it (only if it holds no data you need; otherwise leave it and stop using it) |
| New function | `drop function` with its exact signature, then re-grant what the previous version had |
| `create or replace` of an existing function | Re-run the previous definition from the earlier migration file (`git show <commit>:supabase/migrations/<file>`); the latest definition of each function is in the highest-numbered file that mentions it (for example `decision_set_status` → `0020`, `contract_set_status` → `0020`, `finance_amend` → `0019`) |
| Dropped + recreated function with a new signature | Recreate the old signature **and** redeploy the matching old app build (the Vercel previous deployment); server actions call RPCs by name and argument list |
| `NOT VALID` constraint validation / data backfill | Restore the affected table from the table dump; do not attempt reverse updates |
| RLS policy change | `drop policy` / `create policy` with the previous expression from the earlier file; test with a non-admin user immediately |
| Anything destructive (drop column/table, delete data) | Not allowed without a table dump and owner approval; prefer renaming to `_old_<date>` and dropping after a quiet period |

Decision rule: if the failure is in the app only, roll back the Vercel deployment (instant). If a migration left the database in a state the old app cannot use, roll the database function/policy back first, then the app. If data was corrupted, stop writes (put the site in maintenance or revoke execute from `authenticated` on the writing functions), restore the affected tables from the Step-0 dump, replay nothing, and write an incident note in `audit_event`.

Point-in-time restore of the whole project is the last resort: it loses every change after the restore point, including citizen reports submitted in the meantime.

## 6. Post-deploy smoke test (production, read-only unless stated)

- [ ] `/m/<municipality>`, `/m/<municipality>/services`, `/catalog`, `/laws` load; Arabic RTL renders; no console errors.
- [ ] `/staff/login` loads; a **real** staff user (not a demo) signs in; `/staff` shows KPIs or "data unavailable" (never fake zeros).
- [ ] Response headers present (section 4).
- [ ] As a clerk (`staff` role) a mayor-only page redirects; as anon `/staff` redirects to login.
- [ ] `/api/reports/executive?p=month` returns 401 when not signed in.
- [ ] Supabase advisors re-run: no new warnings (`anon`-callable `SECURITY DEFINER` list is exactly `submit_report`, `track_report`, `voice_allow`, or smaller).
- [ ] Vercel runtime error log empty for 15 minutes.
- [ ] No write test was performed on production. If a write check is unavoidable, do it by hand as a real, approved action, never by an automated script.

## 7. Periodic

- [ ] Quarterly: rotate keys, review staff list (`/staff/accounts`), remove unused accounts, review the audit log, re-run the secrets scan including history.
- [ ] After any legal change: update `legal_rule` through a reviewed migration, never directly in the dashboard.
- [ ] Restore drill into staging at least twice a year.
