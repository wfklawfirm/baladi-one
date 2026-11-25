# Environments

Date: 2026-11-25. Status today: **one** Supabase project and one Vercel deployment serve everything (development checks, Playwright runs, the conference demo and the real municipality's data). Every previous E2E run therefore wrote `TEST_E2E` rows into production (`docs/SECURITY_AUDIT.md`). This document defines the target separation. Nothing here has been created: it needs the owner (accounts, billing, DNS).

Rule 0: **a person or a test must never be able to reach production data by accident.** Separate projects, separate keys, separate env values per environment, and a guard in test code (section 5).

## 1. The five environments

| Environment | Purpose | App | Database | Data | Who may write |
|---|---|---|---|---|---|
| Development | Daily coding | `next dev` on the developer machine | Local Supabase (`supabase start`, Docker) — or a personal Supabase project | Throw-away; seeded by migrations plus a local seed file | The developer |
| Testing | Automated tests: vitest (no DB) and E2E (Playwright) | Local or CI-started `next start` | Local Supabase stack in CI, rebuilt from migrations on every run | Fully synthetic, every row named with the `TEST_E2E_` prefix (`scripts/e2e-guard.ts` exports `e2eName`) | CI and developers, **only after the guard passes** |
| Staging | Pre-release rehearsal of migrations and flows against production-shaped, synthetic data | Vercel Preview (branch `dev`) | **Separate Supabase project** `baladi-staging` | Synthetic. Never a production dump (it contains citizen phone numbers). Same schema as production | Maintainers; E2E may write here |
| Production | The real municipality | Vercel Production | Existing project (`sdpemqqozovxmoaerspq`, see 0001 header) | Real | Real staff only. **No automated test writes, ever** |
| Conference-Demo | Public exhibition kiosk and sales demos | Separate Vercel project / domain | **Separate Supabase project** `baladi-demo` | Fictional only; demo accounts live **only here** | Public (demo accounts), with fictional data |

Why Conference-Demo must be separate: the public "enter as staff / mayor" buttons log in with shared accounts that can call every mayor-level RPC (`docs/PERMISSION_MATRIX.md`). In a database that also holds real data, that is a data-integrity and confidentiality risk. In its own project the worst case is fictional data. Once the demo project exists, remove the demo accounts and `DEMO_*` variables from production.

## 2. Environment variables (names only; values live in the platform secret stores)

Application (read by the code today)

| Name | Scope | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public (browser) | `lib/supabase-server.ts`, `proxy.ts`, `lib/reports.ts` | Differs per environment. Not secret, but identifies the database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public (browser) | same | Public by design; security is RLS + RPC checks |
| `OPENAI_API_KEY` | server only | `lib/brain/rag.ts`, `app/api/voice/route.ts` | Use a separate key per environment with a spend limit; prefer a read-restricted project key |
| `DEMO_STAFF_EMAIL`, `DEMO_STAFF_PASSWORD`, `DEMO_MAYOR_EMAIL`, `DEMO_MAYOR_PASSWORD` | server only | `app/m/[slug]/actions.ts` | Set **only** in the Conference-Demo environment (and unset in Production once it exists) |
| `BALADI_DEMO` | server | `lib/catalog.ts` | `1` shows labelled demo catalogue when no approved service exists. Demo environment only |
| `REPORTS_ENABLED` | server | `lib/reports.ts` | `1` enables citizen reports/tracking. Note this is a UI flag, not a security control |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | **nothing** | Listed in `.env.example` but no code reads it. Do not set it anywhere; delete the line from `.env.example` |

Platform-provided (read by Next/Vercel; useful for the guard)

`NODE_ENV`, `VERCEL_ENV` (`production` / `preview` / `development`), `VERCEL_URL`.

Test tooling (new; read by `scripts/e2e-guard.ts` and future Playwright config)

| Name | Purpose |
|---|---|
| `E2E_TARGET` | `local`, `testing` or `staging`. Anything else (including `production`) is refused |
| `BASE_URL` | App under test |
| `SUPABASE_URL` | Database under test; must be the same host as the app's `NEXT_PUBLIC_SUPABASE_URL` |
| `E2E_ALLOWED_HOSTS` | Comma list of non-loopback hosts allowed to receive writes (staging app and staging database) |
| `E2E_PRODUCTION_HOSTS` | Extra production hosts to always refuse (custom domain, any alias) |
| `APP_ENV` | Optional label; `production` is refused |
| `E2E_MAYOR_EMAIL`, `E2E_MAYOR_PASSWORD`, `E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD` | Test accounts that exist **only** in staging/testing databases |

Vercel scoping: set each variable per environment (Production, Preview, Development) in the project settings so that Preview deployments can never inherit production Supabase values. Production values should be `Sensitive` where the platform allows. Rotate any value that was ever pasted into a chat, a ticket or a repository.

## 3. Creating the staging database

Option A (recommended now): a second Supabase project.

1. Supabase dashboard → New project in the same organisation and region as production; name `baladi-staging`; strong database password stored in the team password manager (not in the repo).
2. Authentication settings: same providers as production, **leaked-password protection ON**, minimum password length ≥ 12, site URL and redirect URLs set to the staging domain only, e-mail confirmation as in production.
3. Extensions: `vector` is created by `0012` (`create extension vector with schema extensions`); `pgcrypto` functions are used through the `extensions` schema (`digest`, `crypt`, `gen_salt`, `gen_random_bytes`). Confirm both are available.
4. Apply migrations **selectively and in order**: `0001`, `0002`, `0005`, `0006`, `0007`, `0010`, `0011`, `0012`, `0013`, `0014`, `0015`–`0020` (and later numbered files after review). Do **not** run a blind `supabase db push` while the folder contains files marked DRAFT / NOT APPLIED: `0003` (demo drafts), `0004` (legal library DRAFT, public `using (true)` policies), `0008` (catalogue drafts, 940 lines). Ask the lead to move drafts to a separate folder (for example `supabase/drafts/`) so the folder equals "what production runs". Numbers `0009` and `0021`–`0023` are absent: confirm that is intentional before relying on a CLI-driven history.
5. Seed minimal synthetic data: the municipality row used by the tests (production's real municipality row is not created by any migration in the repo, so write a `supabase/seed-staging.sql` outside the migrations folder), one `mayor`, one `staff`, one `admin` test user (see `supabase/STAFF_SETUP.md`), optionally the demo catalogue from `0003`/`0008` after review.
6. Create the staging Vercel Preview environment variables (section 2) pointing at this project. Preview deployments of branch `dev` become the staging app.
7. Run `E2E_TARGET=staging BASE_URL=... SUPABASE_URL=... E2E_ALLOWED_HOSTS=... node scripts/e2e-guard.ts` and expect "E2E guard OK" before any test.

Option B: Supabase Branching (preview database branch per git branch). Requires a paid plan and the GitHub integration (*verify plan and pricing before choosing it*); a branch starts from migrations, not from production data, which is what we want. It still needs the drafts-folder cleanup from step 4, otherwise draft files run on every branch.

Option C (local only, free): `supabase start` for Development/Testing; useful for CI. It does not replace staging because Auth, extensions and Vercel behaviour differ slightly.

Never create staging by restoring a production backup unless the personal data is first anonymised (citizen phone numbers and descriptions in `citizen_request`, staff e-mails in `auth.users` and in `audit_event.detail`).

## 4. Conference-Demo setup (summary)

1. Supabase project `baladi-demo`; apply the same migrations; load fictional data only.
2. Create `demo` staff and mayor accounts there (`admin_create_staff` with `p_demo = true`, or the dashboard). Shared passwords are acceptable only because nothing real is behind them.
3. Separate Vercel project (or a Production-protected alias) with `BALADI_DEMO=1`, `REPORTS_ENABLED=1`, the `DEMO_*` variables and the demo Supabase URL/anon key.
4. Before each event: reset demo data from a known seed script (do it in the demo project only), then check that the production project URL appears nowhere in the demo build environment.

## 5. Tests must never write to production — the guard

`scripts/e2e-guard.ts` (this repository) implements the rule. Behaviour, covered by `scripts/e2e-guard.test.ts` (15 cases):

- Requires `E2E_TARGET` in {local, testing, staging}.
- Checks **both** `BASE_URL` and the database URL (`SUPABASE_URL`, falling back to `NEXT_PUBLIC_SUPABASE_URL`), because the original incident was a local app server pointed at the production database.
- Loopback hosts are allowed; any other host must be in `E2E_ALLOWED_HOSTS` over `https`. Wildcards must pin three labels (`*.team.example.com`); `*`, `*.com`, `*.vercel.app`, `*.supabase.co` are refused.
- A built-in deny list (production Supabase host, production Vercel host) plus `E2E_PRODUCTION_HOSTS` **beats** any allow entry.
- Refuses credentials inside URLs, mismatching app/database hosts, and `APP_ENV` / `VERCEL_ENV` equal to `production`.
- Error messages contain host names only; keys and passwords are never printed.

How to use it: call `assertSafeE2eEnv()` as the first statement of Playwright `globalSetup`, of any script that creates data, and of any integration test; name every created row with `e2eName("label")` so cleanup can find it. In CI run `node scripts/e2e-guard.ts` as a separate step before `playwright test`. No Playwright config or E2E script exists in the repository today (earlier runs were ad hoc and kept outside the repo), so there was nothing to wire the guard into; the first committed E2E harness must start with the guard.

Also required (owner/lead actions): remove the production host from every developer's `.env.local`; keep test credentials only in staging; give CI no production secrets at all.

## 6. TEST_E2E cleanup plan (describe only)

Do **not** delete anything without (1) the owner's explicit approval and (2) a verified backup. Production currently holds, per `docs/STATUS_REPORT.md` and `docs/SECURITY_AUDIT.md`: one budget line, four contracts, one decision, one project, one session, one budget amendment, one receivable/collection pair, plus any fiscal year, project updates/milestones and staff accounts the tests created, plus `audit_event` and `*_event` rows.

Step 0 — Freeze and backup
- Announce a short window; stop test runs.
- Take a Supabase backup (dashboard backup, or PITR restore point if the plan has it) **and** a logical dump of the affected tables. Verify the backup by restoring it into the staging project and counting rows.

Step 1 — Build a manifest (read-only)
- Not every test row carries the prefix (`fiscal_year`, `collection_entry`, `receivable` have no free-text name that the tests controlled). Build the list of IDs from the `audit_event` trail: rows with `actor` = the test user(s) within the run time windows, grouped by `entity` and `entity_id`; cross-check with `title`/`code`/`contractor` columns containing `TEST_E2E`.
- Produce a table `entity | id | created_at | name` and have the owner approve it line by line. Anything not on the approved list is not touched. A fiscal year that was created implicitly by `finance_add_line` may also contain real lines: delete it only if it has no remaining lines.

Step 2 — Delete in dependency order, inside one transaction, on the approved IDs only (children before parents; foreign keys decide the order)
1. `collection_entry` rows linked to the test receivable (`receivable_id`), and any other approved `collection_entry`.
2. `receivable`.
3. `expenditure` (it references `financial_commitment` with no cascade).
4. `financial_commitment`.
5. `budget_amendment` (references `municipal_decision` and `budget_line`).
6. `budget_line`. (Its CASCADE removes any remaining amendments/commitments/expenditures: that is why steps 3–5 are done explicitly and counted first.)
7. `fiscal_year` — only if created by the tests and now empty.
8. `contract_amendment`, then `contract` (the four test contracts; `contract` references `municipal_decision` with no cascade, so contracts go before decisions). Any 0024 tables that reference contracts (committees, publications, stage evidence, plan links) first, if 0024 was applied.
9. `project_update`, `project_milestone`, then `project` (cascades do this; `contract.project_id` and `project.decision_id` are SET NULL).
10. `decision_task`, `decision_event`, then `municipal_decision` (cascade).
11. `agenda_item`, then `council_session` (cascade; decisions already gone or set null).
12. `citizen_request` test rows and their `request_status_history` (only if any; history cascades).
13. Test `staff_member` rows and `auth.users` accounts created by tests (via the admin tools or dashboard, not by raw SQL on `auth`).
14. Leave `audit_event` rows in place (append-only evidence), and add one `audit_event` documenting the cleanup (who approved, manifest id, counts).

Step 3 — Verify
- Row counts per table equal "before − manifest". Recompute dashboard KPIs and compare with the pre-test figures. Keep the dump for at least the retention period the owner chooses. If anything is wrong, restore only the affected tables from the dump taken in Step 0.

Step 4 — Prevent recurrence
- Guard in test code (section 5), staging project (section 3), no production secrets in test environments.

## 7. Release flow

`feature branch` → PR → CI (`npx tsc --noEmit`, `npx vitest run`, guard self-test) → merge to `dev` → Preview deployment = staging → apply new migrations to staging → run E2E against staging → owner approval → backup production → apply migrations to production → promote the same build → smoke checks (`docs/DEPLOYMENT_CHECKLIST.md`).
