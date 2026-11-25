# Permission Matrix — derived from the real RPCs and RLS policies

Date: 2026-11-25 · Source: `supabase/migrations/0001`–`0020` (applied per `docs/IMPLEMENTATION_REPORT.md`), plus a mechanical check of the unreviewed drafts `0024`/`0025`. Read-only analysis of the files; **grants and policies were not compared with the live database** (*needs live check*: `select * from information_schema.routine_privileges` and `pg_policies`).

## 1. Who the roles really are

There is no `clerk`, `citizen` or `demo` database role. What exists:

| Name in the request | Reality in the database |
|---|---|
| anon / citizen | The Postgres role `anon` (no account). Citizens have no accounts; "citizen" = anon |
| clerk / staff | `staff_member.role = 'staff'` (authenticated) |
| mayor | `staff_member.role = 'mayor'` |
| admin | `staff_member.role = 'admin'` (not scoped to a municipality, see 4.2) |
| demo | A flag, `staff_member.is_demo = true`, on a `staff` or `mayor` row (`admin_create_staff` refuses demo admins). Shared credentials from server env vars; one-click login from the public demo page |

Almost every RPC authorises through `_council_muni()`: "caller has a `mayor` or `admin` row; use the earliest such municipality". So for those RPCs the real role set is **mayor + admin + demo mayor**.

## 2. RPC matrix

Legend. Who: A = anon, S = staff (clerk), M = mayor, Ad = admin, DS = demo staff, DM = demo mayor. "Muni from" = where the tenant comes from. A tick (Y) means *the database allows the call*, regardless of what the UI shows.

| RPC | A | S | M | Ad | DS | DM | Muni from | Fixed search_path | Findings |
|---|---|---|---|---|---|---|---|---|---|
| `submit_report` | Y | Y | Y | Y | Y | Y | **parameter `p_slug`** (public by design) | yes | Anon-callable. Limits: 200/h per municipality, 5/h per phone (optional field). No per-client limit; `REPORTS_ENABLED`/honeypot bypassable (FE only) |
| `track_report` | Y | Y | Y | Y | Y | Y | token hash | yes | Anon-callable, no throttle, `token_hash` unindexed |
| `voice_allow` | Y | Y | Y | Y | Y | Y | n/a | yes | Anon-callable; caller id is client-chosen; global 1,500/day ceiling can be exhausted by anyone |
| `staff_set_status` | – | Y | Y | Y | Y (demo rows only) | Y (demo rows only) | row, then `is_staff(row.muni)` | yes | OK. Any staff role may change any status of own municipality |
| `assign_request` | – | – | Y | Y | – | Y (demo rows) | row, then `is_staff(...,mayor/admin)` | yes | OK; assignee must belong to same municipality |
| `ops_roster` | – | – | Y | Y | – | Y (demo rows only) | caller's mayor/admin rows | yes | OK |
| `record_collection` | – | **Y** | Y | Y | Y | Y | **first membership by `created_at`** (any role) | yes | No role filter (clerk may record revenue); `p_request_id` not checked against municipality (cross-tenant reference); no demo/row check |
| `review_service_version` | – | – | Y | Y | – | – | none (global catalogue) | yes | draft→in_review admin only; approve needs different user than submitter (four-eyes via audit). Global scope |
| `admin_create_staff` | – | – | – | **Y (any muni)** | – | – | **parameter `p_muni_slug`** | yes | Violates "derive from session": an admin of municipality A can create an admin in B. Password min 8 only |
| `admin_list_staff` | – | – | – | **Y (all munis)** | – | – | none | yes | Lists all municipalities' staff and e-mails |
| `admin_reset_password` | – | – | – | **Y (any user)** | – | – | **parameter `p_user`** | yes | No same-municipality check; can reset another admin; sessions not revoked |
| `staff_password_changed` | – | Y | Y | Y | Y | Y | `auth.uid()` | yes | Self only; anon call is a no-op |
| `match_law_chunks` | – | Y | Y | Y | Y | Y | none (global law corpus) | yes | Does not check `must_change_password` |
| `admin_upsert_law_chunks`, `admin_law_chunk_count` | – | – | – | Y | – | – | none (global) | yes | Any admin of any municipality can overwrite the shared legal corpus |
| `report_export_log` | – | – | Y | Y | – | Y | first mayor/admin row | yes | Demo mayor allowed (harmless); audit best-effort in caller |
| `council_create_session`, `council_add_agenda`, `council_set_session`, `council_set_attendance` | – | – | Y | Y | – | **Y** | session (`_council_muni`) | yes | `council_set_session` can rewrite approved minutes. Demo mayor can edit real sessions |
| `decision_create`, `decision_set_status`, `decision_set_review`, `decision_add_task`, `decision_toggle_task` | – | – | Y | Y | – | **Y** | session | yes | `decision_create` does not validate `p_agenda`; `decision_set_status` gate bypass (see `SYSTEM_AUDIT.md`). Demo mayor can act on real decisions |
| `finance_add_line`, `finance_amend`, `finance_amend_validate`, `finance_commit`, `finance_pay`, `receivable_add`, `receivable_settle` | – | – | Y | Y | – | **Y** | session | yes | No segregation of duties: the same user can commit and pay. Demo mayor can post to a real fiscal year (`finance_add_line`) and settle real receivables if it knows the ID |
| `project_create`, `project_set_status`, `milestone_add`, `milestone_progress`, `project_spend` | – | – | Y | Y | – | **Y** | session | yes | Same demo weakness |
| `contract_add`, `contract_set_dates`, `contract_set_status`, `contract_set_objection`, `contract_amend` | – | – | Y | Y | – | **Y** | session | yes | No transition matrix (signing gate bypass); demo mayor can alter real contracts |
| `procurement_*`, `contract_link_decision_late` (0024 draft), `adm_*` (0025 draft) | – | – | Y | Y | – | **Y** | session | yes | Same pattern; not reviewed line by line |
| `is_staff(m, roles)`, `is_any_admin()` | callable (not revoked) | Y | Y | Y | Y | Y | evaluates caller only | yes | Harmless but should be revoked from `public, anon`. `is_any_admin()` is not tenant-scoped and is the root of the admin findings |
| `is_demo_staff()` | – | Y | Y | Y | Y | Y | caller | yes | Revoked from public/anon |
| `_council_muni`, `_fin_reserved`, `_fin_apply_amendment`, `_track_hash` | – | – | – | – | – | – | internal | yes | Revoked from `public, anon, authenticated` (correct; called only from definer functions) |
| `_add_working_days(date, int)` | callable via default privileges (*needs live check*) | Y | Y | Y | Y | Y | n/a | yes (invoker) | Granted to `authenticated`; `p_n` is unbounded: `select _add_working_days(current_date, 2000000000)` runs a long loop (cheap DoS). Add a cap or make it internal |

### Anon-callable `SECURITY DEFINER` functions (matches the Supabase advisor)

`submit_report`, `track_report`, `voice_allow`. Rate-limit status:

| Function | Limit that exists | Gap |
|---|---|---|
| `submit_report` | 200 reports/hour/municipality; 5/hour per `contact_phone` | Municipality cap is a denial-of-service lever (an attacker fills it and blocks citizens and floods the inbox). Phone limit skipped when no phone. No IP/device/captcha. Direct RPC bypasses `REPORTS_ENABLED` and the honeypot |
| `track_report` | none | Add per-caller throttle (or move behind a server route with limits); index `token_hash` |
| `voice_allow` | 15 / 10 min per caller; 1,500/day global | Caller is a client-supplied 64-hex value, so per-caller limit is bypassable and the global cap can be drained by anyone calling the RPC directly. Derive the caller server-side only and revoke anon execution (call it from the server route with a server-held secret or move the limiter into the route using the DB as store with `service_role`-free design) |

## 3. Table / RLS matrix (SELECT unless stated; "write" = INSERT/UPDATE/DELETE through PostgREST)

| Table(s) | anon | S (clerk) | M | Ad | Demo | Notes |
|---|---|---|---|---|---|---|
| `municipality` | read all | read | read | read | read | public by design |
| `staff_member` | – | own rows | own rows | own rows | own rows | no write policy (RPC only) |
| `municipal_service`, `service_version`, `service_source` | approved + in-scope only | same | + all versions (review read) | + all, **write (any admin, global)** | public view | |
| `citizen_request` | – | **read + UPDATE any column** (own muni) | same | same | demo rows only | UPDATE bypasses history/audit (X in `SYSTEM_AUDIT.md`) |
| `request_status_history` | – | read; **INSERT** (actor = self) | same | same | demo rows | direct insert possible |
| `audit_event` | – | – | read own muni | read own muni | **read own muni (no demo filter)** | contains e-mails and amounts |
| `collection_entry` | – | **read all** | read | read | demo rows | |
| `council_session`, `agenda_item`, `municipal_decision`, `decision_event`, `decision_task` | – | **read all** | read | read | demo rows | UI restricts to mayor/admin, RLS does not |
| `fiscal_year`, `budget_line`, `budget_amendment`, `financial_commitment`, `expenditure`, `receivable` | – | **read all** | read | read | demo rows | same |
| `project`, `project_milestone`, `project_update`, `contract`, `contract_amendment` | – | **read all** | read | read | demo rows | same |
| `legal_rule`, `legal_holiday` | – | read | read | read | read | `using (true)` for authenticated, global |
| `law_chunk`, `voice_usage` | – | – | – | – | – | RLS on, no policies: reachable only through definer functions (advisor INFO, correct) |
| `legal_instrument`, `legal_article` (0004 draft, not applied) | read | – | – | – | – | `using (true)`; do not apply before review |

No table has an INSERT/UPDATE/DELETE policy except `citizen_request` (update), `request_status_history` (insert) and the three catalogue tables (admin). Everything else is written only through RPCs.

## 4. Page vs role (what the UI shows; DB behaviour is in sections 2–3)

| Page | S (clerk) | M | Ad | Demo staff | Demo mayor | anon |
|---|---|---|---|---|---|---|
| `/m/**`, `/catalog`, `/laws`, `/kiosk/**`, `/s/**` | Y | Y | Y | Y | Y | Y |
| `/staff/login` | Y | Y | Y | Y | Y | Y |
| `/staff`, `/staff/requests`, `/staff/r/[id]`, `/staff/collections`, `/staff/assistant`, `/staff/analyze`, `/staff/decisions` | Y | Y | Y | demo data | demo data | redirect to login |
| `/staff/operations`, `/staff/reports/**`, `/staff/council/**`, `/staff/finance/**`, `/staff/projects/**`, `/staff/legal`, `/staff/services/**` | redirect | Y | Y | redirect | Y | redirect |
| `/staff/accounts`, `/staff/brain` | redirect | redirect | Y | redirect | redirect | redirect |
| `/api/voice` | public | public | public | public | public | public (limited) |
| `/api/brain/ask`, `/api/brain/analyze` | Y | Y | Y | Y | Y | 401 |
| `/api/brain/ingest` | 403 | 403 | Y | 403 | 403 | 403 |
| `/api/reports/[kind]` | 403 | Y | Y | 403 | Y | 401 |

`/staff/decisions`, `/staff/services/[id]` (reads) and a few others call `requireStaff()` without a role check; the data they show is still bounded by RLS.

## 5. Tenant isolation (IDOR) review

Rule: every RPC must derive the municipality from the session, never from a parameter.

| Result | Items |
|---|---|
| Conforms | All `council_*`, `decision_*`, `finance_*`, `receivable_*`, `project_*`, `milestone_*`, `contract_*` RPCs: tenant from `_council_muni()`; every row lookup is `where id = p_x and municipality_id = m`; cross-references (`p_decision`, `p_project`, `p_session`, `p_assignee`, `p_commitment`) are validated against `m`, with the exceptions below |
| Violates | `admin_create_staff` (tenant from `p_muni_slug`); `admin_reset_password` (target user from `p_user`, no tenant check); `admin_list_staff` (all tenants); `review_service_version` / service tables / `admin_upsert_law_chunks` (global by design: needs a decision whether the catalogue and law corpus are shared across municipalities) |
| Cross-tenant references accepted | `record_collection.p_request_id` (any request UUID can be linked); `decision_create.p_agenda` (not validated, and not required to belong to `p_session`) |
| Non-deterministic multi-tenant | `_council_muni()` and `record_collection` use the earliest membership; UI uses all memberships |
| By design public | `submit_report(p_slug)` can target any municipality including demo |

## 6. Recommended fixes (not applied: this audit may not edit `supabase/**`)

Proposed next migration, one logical change per statement. All are additive or `create or replace`, and need a staging run first (see `docs/DEPLOYMENT_CHECKLIST.md`).

1. Make `_council_muni()` refuse demo staff **or** have every writing RPC refuse rows where `is_demo = false` when `is_demo_staff()`. Smallest change: inside `_council_muni()` add `and not is_demo` to the `staff_member` select and give demo accounts a separate read-only path. Also add `and (is_demo or not is_demo_staff())` to `audit_staff_read`.
2. Scope admin: add `municipality_id` checks to `admin_reset_password` (target must share a municipality where caller is admin), `admin_list_staff` (filter), `admin_create_staff` (caller must be admin of the target municipality, and only a "super admin" may create admins). Replace `is_any_admin()` with `is_staff(m, array['admin'])`.
3. Tighten SELECT policies on council/decision/finance/project/contract/collection tables to `is_staff(municipality_id, array['mayor','admin'])`, keeping a narrower clerk view for collections only if the product needs it.
4. Add state machines: `contract_set_status` allowed transitions (`draft→signed→active→completed|terminated|expired`; refuse `draft→active`), `decision_set_status` (no leaving `annulled`; `effective` only from `adopted/under_review/pending_completion`), and require a non-`none` `validation_level` for categories `budget, accounts, planning, loan, transfer` before `effective`.
5. Remove the direct `UPDATE` policy on `citizen_request` and the direct `INSERT` policy on `request_status_history` (everything already goes through `staff_set_status`/`assign_request`), or restrict `UPDATE` with a column-level `grant update (assigned_to)`.
6. Check `must_change_password` inside `_council_muni()`, `is_staff()`-based policies and the other RPCs (or make the temporary password unusable outside the password-change endpoint).
7. `submit_report`: add a per-caller limit with a server-derived caller key, make the municipality cap per-caller-class (so one actor cannot lock the municipality), and enforce `REPORTS_ENABLED` in the database (a settings row). Add `create unique index on citizen_request(token_hash)`.
8. `voice_allow`: it must not be callable by arbitrary anonymous clients. A database function cannot see the client IP, so the per-caller identity can only be trusted if the server derives it. Realistic option: move the counter into the `/api/voice` route backed by a durable store (the in-memory Map does not work on serverless) and drop anon execution of `voice_allow`, or accept the current design and document that the global daily ceiling can be drained by anyone.
9. `record_collection`: validate `p_request_id` belongs to `m`; add unique `(municipality_id, receipt_no)` where not null; restrict role.
10. `_add_working_days`: cap `p_n` (for example ≤ 365) or revoke from `authenticated` and make it internal.
11. Revoke `is_staff` and `is_any_admin` from `public, anon`.
12. Enable leaked-password protection and enforce a longer minimum password in Supabase Auth (dashboard, owner action).
