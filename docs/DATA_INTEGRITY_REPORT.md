# Data Integrity Report

Date: 2026-11-25 · Source: migrations `0001`–`0020` (read-only review; live database not inspected). Findings marked *live check* need a query against the real schema before acting.

## 1. Money columns and rounding

| Column(s) | Type | Verdict |
|---|---|---|
| `budget_line.original_amount/current_amount`, `budget_amendment.delta`, `financial_commitment.amount`, `expenditure.amount`, `receivable.amount`, `collection_entry.amount`, `project.budget_amount/spent_amount`, `contract.value/guarantee_amount`, `contract_amendment.delta` | `numeric(14,2)` | **Correct.** No `float`, `real`, `money` or `integer` money column exists in 0001–0020 (grep confirmed). Range ±999,999,999,999.99 |
| Currency | `text` + `CHECK (currency in ('LBP','USD'))` on every money table | Correct, but a currency is a free-text set, not a table. Adding a currency means altering several CHECKs |

Rounding
- Finance RPCs call `round(p_amount, 2)` before insert (`finance_*`, `receivable_*`, `contract_amend`). `record_collection`, `project_spend`, `contract_add`, `project_create` do not: the column cast rounds, and for `record_collection` the audit `detail` stores the **unrounded** input. Use `round(x,2)` consistently so the audit value equals the stored value.
- Postgres `numeric` rounds half away from zero. The JavaScript helper `r2` in `lib/finance.ts` rounds with `Math.round((x+EPSILON)*100)/100` on floats. They agree on 2-decimal inputs (the form parser `parseAmount` rejects more than 2 decimals), but sums are done on JS `Number`: safe up to about 15 significant digits. LBP totals can exceed that if many large amounts are summed (the row cap of 5,000 limits it, but not strictly). Prefer summing in SQL (`sum(amount)` returns exact `numeric`) for any figure that is printed on an official report.
- `recordCollection` (staff collections form) parses with `Number(...)`, which accepts exponent and hex notation and Arabic digits are not normalised there (unlike `parseAmount`). The database bounds (`> 0`, `≤ 1e11`) catch the extremes, but the form should reuse `parseAmount`.
- Time zone: RPCs compare with `current_date`/`now()` (UTC on Supabase) while the application uses `Asia/Beirut` for "today" (`lib/opsData.ts`). Between 00:00 and 02:00/03:00 Beirut time the two disagree by one day; this touches `finance_pay` (`paid_on > current_date + 1`), `contract_set_status` (`p_date > current_date`), the art. 63 one-month test and the 8-day alert. Set the database function time zone or compute with `timezone('Asia/Beirut', now())::date`.

## 2. Double-counting and reconciliation risks

| # | Risk | Why |
|---|---|---|
| D1 | **Four unlinked sources of project money**: `project.spent_amount` (typed cumulative figure), `expenditure` (ledger, tied to budget lines), `financial_commitment`, `contract.value` (+ `contract_amendment`). None references another. A project's "spent" on the project page can differ from the budget-line ledger, and a contract amendment changes the contract value without touching any commitment. KPI `PROJECT_PROGRESS`/financial consumption uses `project.spent_amount` while `BUDGET_EXEC` uses `expenditure`. |
| D2 | **Two revenue paths**: `record_collection` (free entry) and `receivable_settle` (linked to a receivable). The same payment can be entered through both, producing two `collection_entry` rows. Revenue-collected KPIs sum all entries; the collection-rate KPI sums only linked ones, so they can diverge. `receipt_no` is neither required nor unique. |
| D3 | **Payments without commitment** are allowed (`finance_pay` with no `p_commitment` reserves against the available appropriation). Such a payment is then counted both as paid and as "reserved" (by design in `_fin_reserved`), which is correct; but a later commitment against the same expense will not be linked to it, so the same expense can be committed again once there is room. |
| D4 | **Revenue budget lines are not connected to collections.** Collections and revenue-line `current_amount` are never compared, so "revenue execution" cannot be computed and receipts can exceed or fall short of the budget unnoticed. |
| D5 | **Silent truncation**: dashboards fetch with `.limit(3000/5000/8000)`; a municipality with more rows gets wrong totals without warning (`lib/opsData.ts`, `lib/financeData.ts`, `lib/reportData.ts`). |
| D6 | **Pending amendments** (`applied = false`) do not reserve anything; two pending amendments on one line are each checked only when applied (safe, `_fin_apply_amendment` re-checks under lock). Reports must show pending separately: confirm they do. |
| D7 | Currencies are never added together in code (good); there is no exchange-rate table, so USD and LBP lines of one project or budget cannot be consolidated and no rule says which rate applies. |

## 3. Foreign keys and constraints

Missing or weak (ordered by impact)

1. **Denormalised `municipality_id` without composite integrity.** Child tables carry `municipality_id` next to a parent key (`agenda_item`, `decision_task`, `decision_event`, `budget_line→fiscal_year`, `financial_commitment/expenditure/budget_amendment→budget_line`, `project_*→project`, `contract_amendment→contract`). Nothing in the schema forces the child's municipality to equal the parent's. Today only the RPCs guarantee it. Fix: `unique (id, municipality_id)` on parents and composite FKs `(parent_id, municipality_id)` on children.
2. `municipal_decision.agenda_item_id` and `session_id` are independent FKs: an agenda item of another session, or another municipality, can be attached (`decision_create` validates only `p_session`).
3. `expenditure.commitment_id` references `financial_commitment(id)` but nothing enforces `commitment.line_id = expenditure.line_id` (only `finance_pay`).
4. `collection_entry.request_id` is an FK to `citizen_request` without a municipality match; `record_collection` accepts any request UUID.
5. `citizen_request.token_hash`: no index, no unique constraint. `track_report` scans the table. Add `create unique index citizen_request_token_hash_key on citizen_request (token_hash)`.
6. `collection_entry.receipt_no`: no uniqueness. Add partial unique `(municipality_id, receipt_no) where receipt_no is not null` (the roadmap already lists this).
7. `contract.procurement_method`: `contract_method_chk` was created `NOT VALID`; existing rows are unchecked. Run `VALIDATE CONSTRAINT` after cleaning data.
8. `staff_member` primary key is `(user_id, municipality_id)`, so a user can hold several rows; RPCs use "first by `created_at`". Either enforce one active municipality per user or pass an explicit current municipality.
9. No year-lifecycle: `fiscal_year.status` can only be `open`; no RPC closes it, so the `year_closed` branches are dead code and a past year can still receive postings.
10. Cross-field checks missing: `municipal_decision.decided_on` vs `council_session.held_on`; `vote_for + vote_against + vote_abstain` vs `council_session.members_present`; `received_on >= sent_on`; `validated_on >= received_on`; `contract.signed_on >= award_notice_on`; `budget_amendment.amended_on` unbounded; `financial_commitment.committed_on` unbounded (only `finance_pay` bounds its date).
11. `receivable.status = 'cancelled'` exists but no RPC cancels (and no reason/audit path).
12. Personal data: `citizen_request.contact_phone` and `description` are free text kept indefinitely; no retention or erasure procedure; `payer_ref` is validated as an opaque code (good).

Delete behaviour (matters for cleanup and for accidental deletion)

| Relationship | `ON DELETE` |
|---|---|
| `budget_line` → `budget_amendment`, `financial_commitment`, `expenditure` | **CASCADE**: deleting a budget line erases its whole ledger |
| `financial_commitment` ← `expenditure.commitment_id` | RESTRICT (no action) |
| `municipal_decision` → `decision_event`, `decision_task` | CASCADE; `council_session` → `agenda_item` CASCADE |
| `project` → `project_milestone`, `project_update` | CASCADE; `contract.project_id`, `project.decision_id`, `municipal_decision.session_id/agenda_item_id` SET NULL |
| `contract` → `contract_amendment` | CASCADE |
| `municipal_decision` ← `budget_amendment.decision_id`, `contract.decision_id`, `contract_amendment.decision_id` | RESTRICT |
| `receivable` ← `collection_entry.receivable_id` | RESTRICT |
| `fiscal_year` ← `budget_line.fiscal_year_id` | RESTRICT |
| `municipality` ← everything | RESTRICT (no cascade) |
| `auth.users` → `staff_member` | CASCADE (deleting a user removes memberships; audit rows keep the bare uuid) |

Financial and legal records should not cascade. Prefer `RESTRICT` on ledger and decision tables and soft-cancel status columns.

## 4. Immutability gaps

There is no trigger anywhere that blocks `UPDATE`/`DELETE` on a log or ledger. Today the only protection is "no RLS write policy", which does not bind the table owner, the SQL editor, the service role, or a future migration.

| Table | Intended nature | Gap |
|---|---|---|
| `audit_event` | append-only | No trigger; `municipality_id` nullable; `detail` may hold personal data (e-mails in `staff.created`); no hash chain; best-effort for report export |
| `request_status_history` | append-only | Staff can INSERT directly (policy `hist_staff_insert`); no UPDATE/DELETE trigger |
| `decision_event`, `project_update` | append-only | No trigger |
| `budget_amendment`, `financial_commitment`, `expenditure`, `collection_entry`, `contract_amendment` | append-only ledgers | No trigger; no reversal/cancel record type (there is no way to correct an error other than editing/deleting rows by hand) |
| `council_session.minutes_text` | locked after `minutes_approved` | **No lock.** `council_set_session` overwrites minutes in any status; no version history |
| `municipal_decision` | after `effective`: only execution fields change | Legal fields (`title`, `body`, votes) remain editable through no RPC today, but nothing in the database prevents a future one; `effective_on` can be overwritten by a second `effective` call |
| `citizen_request` | status only through `staff_set_status` | Direct UPDATE policy (any column, including `description`, `token_hash`) |
| `contract.value` | changes only through `contract_amend` | Correct today (no direct policy), but no check that status is not `terminated/completed` |
| `service_version` | approved versions frozen | Admin policy `ver_admin_all` allows direct UPDATE of an approved version's content, bypassing review |

Recommended pattern: a shared trigger `before update or delete` that raises on the append-only tables (allowing only a named maintenance role to bypass), plus `create trigger ... before update on council_session` that refuses `minutes_text` changes when `old.status = 'minutes_approved'`, plus corrections recorded as new reversing rows.

## 5. Other integrity observations

- Every `is_demo` flag is copied at creation and never re-validated; a mislabelled row (real data flagged demo) becomes invisible to real staff and visible to demo staff. Reports and dashboards must not include demo rows once real data exists.
- `decision_no` is unique per municipality and year, but numbering is manual (gaps and reuse after deletion cannot be detected). Same for `council_session.session_no` (not unique at all).
- `citizen_request.assigned_to` has no FK to `staff_member` (only `auth.users`); `assign_request` checks membership, direct UPDATE does not.
- `legal_holiday` empty: standstill computed with Mon–Fri only; any real holiday makes the computed signing date earlier than the legal date (a compliance error in the "unsafe" direction until loaded).
- `legal_rule` is read-only reference data inside a mutable `public` schema: no `version` history table, so a rule edit loses the previous text.
- Backups/restore: not documented anywhere in the repo; see `docs/DEPLOYMENT_CHECKLIST.md`.
