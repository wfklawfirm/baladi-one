# نتائج الاختبارات
- vitest: 57 اختبارًا ناجحًا (منها 4 في council.test.ts للنصاب/الدعوة/تنبيهات القرار)، وهي اختبارات وحدة لا تمثل مجموعة امتثال قانوني مستقلة.
- سيناريوهات Playwright يدوية (ضد قاعدة الإنتاج، لا بيئة مستقلة): توقيع عقد بلا تاريخ/بلا قرار/داخل مهلة التجميد (رُفض) وبعدها (قُبل)؛ تعديل موازنة معلّق ثم مُصدَّق؛ نموذج النصاب؛ لوحة التصديق. هذه الاختبارات استندت إلى قاعدة 14 يومًا التي تبيَّن خطؤها.
- **لم تُنفَّذ**: مجموعة Legal Compliance Test Suite المطلوبة (جلسة ثانية، تصويت وتعارض مصالح، تصديق ضمني ومستثنياته، دورة النفقة، الإقفال، الرسوم، الشراء بالتفصيل، الأمان). ولا يوجد رابط بين اختبار ونص موثَّق بعد.

---

## جدول سيناريوهات الاختبار القانوني والأمني (تحديث 25/11/2026)

**Honesty notes.**
- The text of the "master prompt" sections 30–31 was not available to the author of this table. Scenarios are grouped by the eight areas named in the task (council, decision, financial, revenue, procurement, AI, security, UX) and numbered `LT-*`; map them to the master-prompt numbering when you have it. Add any scenario that is missing here as *Not Implemented* or *Not Executed* — do not assume it passes.
- Status values: **Implemented-and-Tested** = the control exists and a recorded test exercised it (the evidence column says what kind). **Not Implemented** = the control does not exist (or can be bypassed), regardless of tests. **Not Executed** = the control exists in code or migrations but no test of it has been run (or none that is repeatable).
- "Unit" = vitest, no database (`lib/*.test.ts`, `scripts/*.test.ts`; 94 tests passed when this table was written; other workers have added tests since, and 161 passed at the last run). Unit tests prove date and money arithmetic, not that the database refuses an action. "Manual-prod" = an earlier hand-driven Playwright run against the **production** database (`STATUS_REPORT.md` section 2); it is not repeatable, recorded no expected-versus-actual table, and for the signing gate was run against the superseded 14-day rule.
- No scenario is *Legally Verified*: every rule is `pending_review` in `legal_rule` and `LEGAL_AUDIT.md`. "Implemented-and-Tested" never means "legally correct".

| ID | Area | Scenario | Status | Evidence / reason |
|---|---|---|---|---|
| LT-C1 | Council | Quorum is more than half of the members (first meeting) | Implemented-and-Tested | Unit: `quorumState` in `lib/council.test.ts`. Calculation only: nothing blocks a session or decision without quorum |
| LT-C2 | Council | Second meeting needs one third of members | Implemented-and-Tested | Unit, same test. Calculation only |
| LT-C3 | Council | Written summons at least 3 days before the session | Implemented-and-Tested | Unit: `summonsOk`. Warning only; not enforced in the database |
| LT-C4 | Council | Second meeting held at least 24 hours after the first | Not Implemented | No field or check |
| LT-C5 | Council | Monthly meeting (art. 32) reminder/overdue | Not Implemented | Registry text only (`MUN-118-32`, INFORMATION) |
| LT-C6 | Council | Per-member attendance, vote and conflict-of-interest recusal | Not Implemented | Only aggregate counts (`members_total/present`, `vote_for/against/abstain`); no cross-check between them |
| LT-C7 | Council | Approved minutes cannot be altered | Not Implemented | `council_set_session` overwrites `minutes_text` in any status |
| LT-C8 | Council | Tie vote is flagged | Implemented-and-Tested | Unit: "tie votes noted" |
| LT-D1 | Decision | Decision must be sent to the supervisory authority within 8 days (art. 58) | Implemented-and-Tested | Unit: `decisionAlerts`. Alert only, never blocks |
| LT-D2 | Decision | Tacit approval after one month: exclusions (budget, planning, credit transfer, loan), audit-bureau start date, authority notified (art. 63) | Implemented-and-Tested | Unit: date and category logic. The **database gate** in `decision_set_status` (0020) was never exercised by a write test: **Not Executed** |
| LT-D3 | Decision | "Effective" requires an explicit date from the official document | Not Executed | In the database since 0015; the only run was Manual-prod before 0020 |
| LT-D4 | Decision | A budget/loan/planning decision cannot become effective without explicit validation | Not Implemented | Gate runs only when `validation_level <> 'none'` (the default); category and level are independent |
| LT-D5 | Decision | Legal status follows valid transitions only (no `annulled → effective`) | Not Implemented | Any value to any value; history kept in `decision_event` |
| LT-D6 | Decision | Decision authority by category and amount (art. 59–62) | Not Implemented | Thresholds not loaded; `INFORMATION` rule only |
| LT-F1 | Financial | Available = current appropriation − commitments (− uncommitted payments); execution and commitment ratios are separate | Implemented-and-Tested | Unit: `lib/finance.test.ts` |
| LT-F2 | Financial | Commitment cannot exceed available appropriation | Not Executed | Implemented in `finance_commit` under row lock; no recorded DB test |
| LT-F3 | Financial | Appropriation change needs an adopted decision and stays pending until validation | Implemented-and-Tested | Manual-prod (pending then validated amendment). Legal basis for budget-transfer rules unverified; not repeatable |
| LT-F4 | Financial | Amendment cannot take a line below zero or below commitments | Not Executed | Implemented (`_fin_apply_amendment`); no test |
| LT-F5 | Financial | Payment without a prior commitment is refused | Not Implemented | Allowed, with a reservation (`finance_pay`) |
| LT-F6 | Financial | Liquidation and payment-order stages | Not Implemented | Absent |
| LT-F7 | Financial | Fiscal-year close and accounts closing | Not Implemented | No RPC sets `closed`; `year_closed` branches are unreachable |
| LT-F8 | Financial | Segregation of duties (commit / approve / pay) | Not Implemented | Same mayor/admin may do every step |
| LT-F9 | Financial | LBP and USD never summed together | Implemented-and-Tested | Unit: "keeps currencies apart", `totalsByCurrency` |
| LT-F10 | Financial | No floating-point drift in money | Implemented-and-Tested | Unit: "avoids float drift"; storage is `numeric(14,2)` |
| LT-F11 | Financial | Budget-to-revenue and project-to-ledger reconciliation (no double counting) | Not Implemented | See `DATA_INTEGRITY_REPORT.md` D1–D4 |
| LT-R1 | Revenue | Collection rate is null (not 0%) when nothing is due; over-collection capped | Implemented-and-Tested | Unit: `collectionRate` tests |
| LT-R2 | Revenue | Arrears bucketed by age, per currency | Implemented-and-Tested | Unit: `arrears` |
| LT-R3 | Revenue | A receivable cannot be over-collected; partial settlement allowed | Not Executed | Implemented in `receivable_settle`; a `TEST_E2E` receivable exists so a manual write occurred, but no expected/actual was recorded |
| LT-R4 | Revenue | Unique receipt numbering | Not Implemented | `receipt_no` optional and non-unique |
| LT-R5 | Revenue | Same payment cannot be recorded twice (free entry plus receivable settlement) | Not Implemented | Two unlinked paths |
| LT-R6 | Revenue | Fee amounts derive from an approved fee schedule (Law 60/1988) | Not Implemented | Amount typed by hand; schedule not loaded or reviewed |
| LT-R7 | Revenue | Refunds, cancellations and objections to a charge | Not Implemented | `cancelled` status has no RPC |
| LT-P1 | Procurement | Method required; negotiated agreement requires written justification | Not Executed | Implemented (`contract_add`, `contract_set_status`); no recorded test |
| LT-P2 | Procurement | Standstill is 10 working days from publication of the winning-bid acceptance | Implemented-and-Tested | Unit: working-day arithmetic. Database gate under the corrected rule **Not Executed** (`IMPLEMENTATION_REPORT.md`); start date (publication vs notice) awaiting legal ruling; holidays table empty |
| LT-P3 | Procurement | A pending objection blocks signing | Not Executed | `contract_set_objection` + gate in 0020, no test |
| LT-P4 | Procurement | The signing gate cannot be skipped through another status change | Not Implemented | `draft → active` (any status) passes without the gate |
| LT-P5 | Procurement | Council decision required before signing | Not Implemented | Deliberately downgraded to a warning because no verified source; the earlier Manual-prod "no decision, rejected" case tested a rule that no longer exists |
| LT-P6 | Procurement | Procurement method chosen by value thresholds | Not Implemented | Thresholds not loaded (drafts in 0024 unreviewed) |
| LT-P7 | Procurement | Split-purchase detection | Not Implemented | Draft only (0024), not reviewed or applied |
| LT-P8 | Procurement | Award/evaluation/receipt committees, publication register | Not Implemented | Draft only (0024) |
| LT-P9 | Procurement | Contract value amendment limited by art. 29 ratio | Not Implemented | `contract_amend` has no cap, no status check |
| LT-A1 | AI | Assistant refuses when no source supports an answer | Not Executed | `REFUSAL` constant exists; no test |
| LT-A2 | AI | Answers cite the legal sources used | Not Executed | No test |
| LT-A3 | AI | Assistant facts never include another municipality's or other roles' data | Not Executed | Facts are recomputed under the caller's RLS (design), untested |
| LT-A4 | AI | Prompt injection through an uploaded document cannot change behaviour or exfiltrate data | Not Executed | No test |
| LT-A5 | AI | KPIs and money figures are computed in code, never by the model | Implemented-and-Tested | Unit: `lib/ops.test.ts`, `finance.test.ts`; KPI registry states formulas |
| LT-A6 | AI | Per-user cost limits on AI and voice routes | Not Implemented | In-memory counters, ineffective on serverless |
| LT-A7 | AI | Legal knowledge base is verified against official texts | Not Implemented | Secondary sources only (`LEGAL_SOURCES_REGISTER.md`) |
| LT-S1 | Security | Anonymous users cannot call staff RPCs | Not Executed | Read from migrations (revoked from `anon`); never called |
| LT-S2 | Security | A clerk (`staff`) cannot call mayor/admin RPCs | Not Executed | Implemented (`_council_muni`); not tested |
| LT-S3 | Security | A clerk cannot read finance/council/contract data through the API | Not Implemented | RLS allows any staff role to SELECT |
| LT-S4 | Security | Cross-municipality isolation (tenant isolation) | Not Executed | Stated as not run in `SECURITY_AUDIT.md`; admin RPCs known not to isolate |
| LT-S5 | Security | Front-end checks cannot be bypassed by calling the API | Not Executed | Several rules are front-end only (see `SYSTEM_AUDIT.md`) |
| LT-S6 | Security | Demo accounts cannot change real data | Not Implemented | RPCs do not check row `is_demo`; audit log readable by demo mayor |
| LT-S7 | Security | Forced password change is enforced by the backend | Not Implemented | Front-end only |
| LT-S8 | Security | Citizen report flood limits | Not Implemented | Municipality-wide cap exploitable; phone limit bypassable |
| LT-S9 | Security | Tracking code stored hashed; malformed codes rejected without a query | Implemented-and-Tested | Unit: malformed-code rejection and formatting. Hashing itself Not Executed |
| LT-S10 | Security | Spreadsheet export neutralises formulas; periods and kinds whitelisted | Implemented-and-Tested | Unit: `reportBuild.test.ts`, `reportXlsx.test.ts` |
| LT-S11 | Security | Reports and exports are mayor/admin only and audited | Not Executed | Code path read; audit is best-effort |
| LT-S12 | Security | No secrets in the repository or its history | Implemented-and-Tested | One-off scan of tree and 90 commits, 2026-11-25: no matches (not a recurring test) |
| LT-S13 | Security | Security headers present on responses | Not Executed | Added to `next.config.ts` on 2026-11-25; no build or request was run in this audit |
| LT-S14 | Security | E2E tests refuse to run against production | Implemented-and-Tested | Unit: `scripts/e2e-guard.test.ts` (15 cases). Not yet wired into a Playwright run because none is in the repository |
| LT-U1 | UX | RTL Arabic layout, no horizontal overflow at 390 px | Implemented-and-Tested | Manual-prod (emulated viewport, `STATUS_REPORT.md`); not a real phone, not repeatable |
| LT-U2 | UX | Missing data shows "data unavailable", never a fake zero | Implemented-and-Tested | Unit: null-rate tests in `ops`, `finance`, `reportBuild` |
| LT-U3 | UX | Every database error code maps to a clear Arabic message | Implemented-and-Tested | Unit: error-map tests (finance); partial for other modules |
| LT-U4 | UX | Print layouts of reports | Not Executed | "الطباعة الفعلية" not tested |
| LT-U5 | UX | Excel file opens correctly in real Excel (RTL, number formats) | Not Executed | Workbook generation is unit-tested only |
| LT-U6 | UX | Accessibility (keyboard, screen reader, contrast) | Not Executed | |
| LT-U7 | UX | Kiosk touchscreen, long-running session, idle reset | Not Executed | |
| LT-U8 | UX | Voice dictation in real browsers/devices (Arabic dialect) | Not Executed | |

Totals (70 scenarios counted above): Implemented-and-Tested 21 (most are unit-level arithmetic or one-off checks, not database or end-to-end proof), Not Implemented 28, Not Executed 21. These totals describe test coverage, not legal compliance.
