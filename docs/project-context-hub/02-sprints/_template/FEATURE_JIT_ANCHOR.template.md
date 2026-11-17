# `[FEATURE_ID]` — `[FEATURE_TITLE]` (As-Is Baseline Anchor)

| Metadata Field | Canonical Value |
|---|---|
| **Feature ID** | `[FEATURE_ID]` |
| **Title** | `[FEATURE_TITLE]` |
| **Component ID** | `CMP-01` |
| **Epic ID** | `EPC-01` |
| **Target Release** | `REL-01` |
| **Sprint / Wave** | `[SPRINT_ID] / Wave 1` |
| **Archetype** | `MUTATION_WORKFLOW` |
| **Channels** | `Web, Mobile, Admin` |
| **Screen Refs** | `S01 (Live Operational Screen)` |
| **Version** | `v1.0.0` |
| **Gate A Status (BA)** | `READY_FOR_DEV` |
| **Gate B Status (Eng)** | `PENDING` |
| **Semantic Digest (`feature_srd`)** | `SRD-[SHORT_ID]-000000000000` |

> **Just-In-Time Brownfield Anchor (`PARTIAL_JIT_ANCHOR`):** Captures the verified **As-Is (`v1.0.0`)** production behavior of `[FEATURE_ID]` prior to applying `[CR_ID]`. Next step: run `@ba-evolve v1.1.0` to mutate affected rules in-place, log `WAS | CURRENT | UPDATE NEEDED BY TEAM` in Section 10, and emit `03-version-deltas/DELTA_v1.0.0_to_v1.1.0.md`.

---

## 1. Business Objective & Actor Matrix
- **As-Is Business Capability:** Captures live baseline workflow, permissions, and validation rules for `[FEATURE_TITLE]` so `[CR_ID]` changes are isolated cleanly against an auditable `v1.0.0` anchor.

| Role ID | Surface | As-Is Permission & Ownership Scope |
|---|---|---|
| `ROLE-CUST` | `Web / Mobile` | Create and view own `[FEATURE_ID]` records within authenticated tenant/self scope |
| `ROLE-ADMIN` | `Admin Web` | View, filter (`SEED-LIST-PAGE-ADMIN`), and transition `[FEATURE_ID]` status (`ENUM-REQUEST-STATUS`) |

### 1B. User Stories & Release/Sprint Decomposition (`STR-*` -> `TSK-*`)
| Story ID | Story Title | Release Code | Sprint Code | Priority | Linked `AC-*` | Screen Refs | Initial Department Tasks (`TSK-*`) |
|---|---|---|---|---|---|---|---|
| `STR-[SHORT_ID]-01` | Baseline As-Is Operational Workflow for `[FEATURE_ID]` | `REL-01` | `[SPRINT_ID]` | `high` | `AC-01..04` | `S01` | `TSK-[SHORT_ID]-01 (BE/MOB/QA Baseline Verification)` |


### 1C. Scope Boundaries & Related Flows
| Boundary Type | Description & Linked `FEATURE-*` IDs | Dependency Kind (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM` / `EXCLUDED`) |
|---|---|---|
| **In-Scope** | Stories `STR-[SHORT_ID]-01` (see 1B). | `OWNED` |
| **Related Flows** | No cross-feature dependency is declared in the sealed spec; sprint-level collisions are tracked in the sprint manifest (XFC-01..04). | `NONE` |
| **Explicitly Out-of-Scope** | None declared in the sealed spec beyond the stories in 1B. | `EXCLUDED` |

---

## 2. Visual Screen Decomposition Matrix (`S01`)
| Element ID | Screen ID | Element Kind | Label (`EN / AR`) | Data Source / Formula / Binding | Validation / Interaction Rule |
|---|---|---|---|---|---|
| `EL-01` | `S01` | `Derived Counter` | `Active Items / العناصر النشطة` | `COUNT(records WHERE status IN (SUBMITTED, IN_PROGRESS))` | Scoped to authenticated actor |
| `EL-02` | `S01` | `Status Badge` | `Status / الحالة` | `ENUM-REQUEST-STATUS` | Semantic badge tone per `GLOSSARY_AND_ENUMS.md` |
| `EL-03` | `S01` | `Filter / Sort` | `Status Filter / تصفية الحالة` | Filter by `ENUM-REQUEST-STATUS`; default sort `created_at DESC` | Page batch bound to `SEED-LIST-PAGE-ADMIN` (`25`) |
| `EL-04` | `S01` | `Field` | `Primary Input / المدخل الأساسي` | Required business payload field (`1..255` chars) | Trimmed non-empty input validated on submit |
| `EL-05` | `S01` | `CTA` | `Submit Action / إرسال` | Triggers primary state transition on `[FEATURE_ID]` | Disabled while request in flight (idempotent) |

---

## 3. UI Lifecycle & Screen States Matrix
| Screen State | Trigger Condition | Exact Visual & Data Behavior | Primary CTA State | `AR / EN` Message Key |
|---|---|---|---|---|
| **Loading** | Initial fetch or submission in flight | Render skeleton rows / button spinner | `Disabled` | `COPY-JIT-LOADING` |
| **Empty State** | Zero records match actor scope or active filter | Show empty notice with `Reset Filter` action | `Enabled` | `COPY-JIT-EMPTY` |
| **Single-Item / Edge** | Exactly `1` record or boundary payload length | Render single card cleanly without pagination footer | `Enabled` | `COPY-JIT-SINGLE` |
| **Populated / Normal** | `>= 2` active records loaded | Paginated list (`SEED-LIST-PAGE-ADMIN`) + interactive form | `Enabled` | — |
| **Disabled / Locked** | Terminal status (`COMPLETED` / `CANCELLED`) or unauthorized role | Lock mutation controls and show read-only reason | `Disabled` | `COPY-JIT-LOCKED` |
| **Error / Retry** | Validation rejection or transient network error | Preserve user input; show inline error or retry action | `Enabled` | `COPY-JIT-ERROR` |

---

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Deterministic Condition & Formula | Bound `SEED-*` / `ENUM-*` | Violation Outcome | Source Ref |
|---|---|---|---|---|
| `BR-[SHORT_ID]-01` | Actor must hold active authenticated session and own target record (`ROLE-CUST`) or hold `ROLE-ADMIN` | `ENUM-REQUEST-STATUS` | Reject unauthorized access (`COPY-JIT-LOCKED`) | `As-Is Prod` |
| `BR-[SHORT_ID]-02` | List pagination defaults to `SEED-LIST-PAGE-ADMIN` (`25` rows) on web/admin and `SEED-LIST-PAGE-MOBILE` (`20` items) on mobile | `SEED-LIST-PAGE-ADMIN`, `SEED-LIST-PAGE-MOBILE` | Cap batch size to configured seed limit | `As-Is Prod` |


### 4B. Functional Requirements (`FR-*` — one per Story, traced both ways to `AC-*`)
| FR ID | Requirement (Observable System Behavior) | Source Story (`STR-*`) | Linked Rules (`BR-*`) | Covered By (`AC-*`) |
|---|---|---|---|---|
| `FR-01` | Baseline As-Is Operational Workflow for [FEATURE_ID] | `STR-[SHORT_ID]-01` | — | `AC-01`, `AC-02`, `AC-03`, `AC-04` |

---

## 5. Archetype Operational Contract

### Sub-block 5A — `READ_VIEW` Contract
`COVERED IN SECTION 2 & 5B — Combined operational view & mutation workflow.`

### Sub-block 5B — `MUTATION_WORKFLOW` Input, State & Side-Effect Contract
| Transition | From State (`ENUM-REQUEST-STATUS`) | Action | To State | Concurrency / Idempotency & Side Effects |
|---|---|---|---|---|
| `TR-01` | `DRAFT / NEW` | Submit (`EL-05`) | `SUBMITTED` | Deduplicate repeat taps via submission key; write audit log entry |
| `TR-02` | `SUBMITTED` | Admin / Customer Cancel | `CANCELLED` | Reject stale transition if already `COMPLETED`; notify owning actor |

---

## 6. Domain Edge Cases (`6A`) & Resilience / Mobile Matrix (`6B`)

### 6A. Domain Edge Scenarios (`DOM-*`)
| Scenario ID | Edge Condition | Deterministic Expected System Behavior |
|---|---|---|
| `DOM-01` | Concurrent status change while screen `S01` is open | Reject stale mutation with conflict message and refresh current `ENUM-REQUEST-STATUS` |
| `DOM-02` | Cross-actor direct URL/deep-link access attempt | Enforce strict ownership filter; return not-found/unauthorized state without leaking data |


### 6B. Resilience & Mobile Contract (`SCN-01..06` & `MB-01..15`)
> **Anti-Evasion Rule (`STD-08-ZERO-GAP-v2.0`):** `N/A` is permitted only with an objective archetype/channel reason. Rows marked `PROPOSED_DEFAULT` in 9.1 were derived from the standard outcomes of this template and need BA/PO confirmation.

| Scenario ID | Concern | Applicability (`Applicable` / `N/A — Reason`) | User-Visible Authoritative Outcome & Safe Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `SCN-01` | Duplicate Action / Double Tap | `Applicable` | `EL-05` is disabled while the request is in flight; the server de-duplicates (request key / uniqueness) so a repeat yields one business outcome and returns the current authoritative state. Feature rule (as sealed): Idempotent single execution; disables EL-05 in flight. | `AC-05` |
| `SCN-02` | Timeout / Uncertain Result | `Applicable` | The UI never assumes success or failure on timeout: entered values are kept, `COPY-JIT-ERROR` is shown with an explicit Retry, and the authoritative server state is re-read before a retry is accepted. Feature rule (as sealed): ..06 (Network Drop, Timeout, Stale State, Suspension, Tampered ID): Preserves form state on timeout, enforces server-side ownership & clock evaluation, and blocks suspended accounts immediately. | `AC-06` |
| `SCN-03` | Offline / App Kill / Resume | `Applicable` | On resume or reconnect the client re-fetches authoritative state; no ghost local success is displayed. | `AC-07` |
| `SCN-04` | Concurrent State Modification | `Applicable` | The first valid transition wins; a stale submit is rejected with a conflict notice and the actor sees the current record (no silent overwrite). | `AC-08` |
| `SCN-05` | Cancel / Back / Abandon Mid-Flow | `Applicable` | Cancelling or closing the form discards unconfirmed input; no record, side effect or audit event is created. | `AC-09` |
| `SCN-06` | Permission / Auth Revoked Mid-Flow | `Applicable` | Every request is authorized server-side: a revoked or insufficient role is rejected with 403 and the session-expiry convention (CONV-SHD-002) applies; a foreign or non-existent record id returns 404 without data leakage. | `AC-10` |

- **`MB-01..MB-15`:** Mobile channel is active — populate the Mobile Business Matrix (`MB-12A` Push, `MB-12B` Deep Links) before sealing.

---

## 7. Bilingual Copy & Localization Table (`AR / EN`)
| Copy Key | Surface | Arabic (`ar`) | English (`en`) |
|---|---|---|---|
| `COPY-JIT-LOADING` | `Web / Mobile` | `جاري التحميل...` | `Loading...` |
| `COPY-JIT-EMPTY` | `Web / Mobile` | `لا توجد سجلات مطابقة حالياً` | `No matching records found` |
| `COPY-JIT-SINGLE` | `Web / Mobile` | `سجل واحد معروض` | `Showing 1 record` |
| `COPY-JIT-LOCKED` | `Web / Mobile` | `هذا الإجراء غير متاح في الحالة الحالية` | `Action unavailable in current status` |
| `COPY-JIT-ERROR` | `Web / Mobile` | `تعذّر إتمام العملية، يرجى المحاولة مرة أخرى` | `Operation failed. Please retry.` |

---

## 8. Deterministic Acceptance Criteria (`AC-01..10`)
| AC ID | Traced IDs | Screen Ref | Given | When | Then |
|---|---|---|---|---|---|
| `AC-01` | `BR-[SHORT_ID]-01`, `TR-01`, `FR-01` | `S01` | Authenticated `ROLE-CUST` enters valid `EL-04` payload | User submits `EL-05` | Record saves as `SUBMITTED` (`ENUM-REQUEST-STATUS`) and `EL-01` increments by `1` |
| `AC-02` | `BR-[SHORT_ID]-02`, `EL-03`, `FR-01` | `S01` | Actor owns `30` records across statuses | Actor loads `S01` on Admin/Web | First `25` (`SEED-LIST-PAGE-ADMIN`) records render sorted `created_at DESC` |
| `AC-03` | `SCN-01`, `DOM-01`, `FR-01` | `S01` | User double-taps `EL-05` on slow network | Duplicate requests arrive | Only `1` record transitions; stale concurrent state returns conflict refresh |
| `AC-04` | `DOM-02`, `MB-12A`, `MB-12B`, `FR-01` | `S01` | Foreign `ROLE-CUST` opens deep link to another user's record | Ownership check runs | Access denied cleanly with zero foreign PII/data exposure |
| `AC-05` | `SCN-01` | S01 | The actor has a valid, complete form ready on S01 (Live Operational Screen). | The actor activates `EL-05` twice in quick succession (or the client retries the same request). | Exactly one business record/outcome is persisted, the repeat returns the current authoritative state without a duplicate, and the CTA stays disabled until the response arrives. |
| `AC-06` | `SCN-02` | S01 | A submission or data load is in flight. | The network drops or the request times out before any response. | The actor sees `COPY-JIT-ERROR` with Retry, unsaved input is preserved, and no duplicate or half-applied record exists after the retry. |
| `AC-07` | `SCN-03` | S01 | The app was backgrounded or killed mid-flow. | The actor returns to the app. | The client re-fetches the authoritative state and shows no ghost local success. |
| `AC-08` | `SCN-04` | S01 | Two authorized actors edit the same record. | The second actor submits after the first has committed. | The stale write is rejected with a conflict notice and the current record version is displayed; the first actor's change is preserved. |
| `AC-09` | `SCN-05` | S01 | The actor has unsaved changes in the form. | The actor cancels, goes back, or closes the form. | No record is created or changed, no notification or audit event is emitted, and the previous state is shown. |
| `AC-10` | `SCN-06` | S01 | The actor's role or session is revoked while the flow is open (or the actor requests a record outside the authenticated tenant scope). | The actor submits or opens the record. | The server rejects with 403 (or 404 for a foreign/non-existent id), nothing is mutated or leaked, and the actor is routed per CONV-SHD-002. |

---

## 9. Gate A — BA Sealing Scorecard (`BA-01..BA-14`)

### 9.1 Key Business Decisions Snapshot (`D-01..D-n`)
| Decision ID | Provenance Tag (`PROJECT_CONTEXT` / `BA_ANSWERED` / `LOGICALLY_ENTAILED` / `ESTABLISHED_CONVENTION` / `PROPOSED_DEFAULT`) | Approved Decision & Bound `SEED-*` / `BR-*` | Reference & Authority |
|---|---|---|---|
| `D-01` | `PROPOSED_DEFAULT` | Standard resilience outcomes `SCN-01..06` applied where the sealed spec was silent (low-risk, reversible). | `SCN-01..06`, `AC-05`, `AC-06`, `AC-07`, `AC-08`, `AC-09`, `AC-10` |

**Snapshot Approval:** `APPROVED` (`[PO / BA Lead — YYYY-MM-DD]`)

### 9.2 Canonical 14-Check Audit Table
- **Decisions Snapshot (`JIT-ANCHOR`):** As-Is production baseline anchored under `Scope Mode: PARTIAL_JIT_ANCHOR` for `[CR_ID]` (`YYYY-MM-DD`).
- **Audit Summary (`BA-01..BA-14`):** `BA-01..13 = PASS`, `BA-14 = N/A (v1.0.0 As-Is baseline anchor prior to CR evolution)`.
- **Score:** `P = 13 | F = 0 | U = 0 | N = 1 | VALID = round(100 * 13 / (14 - 1), 1) = 100.0%` -> **Gate A: `READY_FOR_DEV`**.

### 9.3 Ownership Routing (Non-BA Handoff Notes — never asked of the BA)
| Dependency ID | Owner (`BACKEND_OWNED` / `SHARED_MOBILE` / `SHARED_WEB` / `DESIGN_OWNED`) | Handoff Note / Technical Requirement | Status (`Open` / `Done` / `Reused`) |
|---|---|---|---|
| `DEP-01` | `BACKEND_OWNED` | Endpoints, idempotency key, tenant-scoped queries and persistence for STR-[SHORT_ID]-01 (see ENG-01, ENG-02, ENG-06, ENG-08). | `Open` |
| `DEP-02` | `DESIGN_OWNED` | UX frames/tokens for S01 (Live Operational Screen). | `Open` |
| `DEP-03` | `SHARED_WEB` | Reuse the global session-expiry, error and offline conventions (`CONV-SHD-002`, `CONV-SHD-003`) from PROJECT_CONTEXT. | `Reused` |

---

## 10. Feature Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA` / `PM` / `Dev` / `Mobile` / `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `YYYY-MM-DD` | `[CR_ID]` Anchor | `ALL` | Unanchored live behavior | As-Is `v1.0.0` baseline anchored (`READY_FOR_DEV`) | `BA`: Run `@ba-evolve v1.1.0` for `[CR_ID]` \| `PM`: Track `[CR_ID]` \| `Dev`: Verify `§11` bindings \| `Mobile`: Verify `S01` parity \| `QA`: Baseline `AC-01..04` |

---

## 11. Gate B — Engineering Readiness Appendix (`ENG-01..ENG-10` — Reserved for Engineering `.ai`)
| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| `ENG-01` | Model/Table Binding | `[ENG_MODEL_HINT]` | `PENDING_ENG_AUDIT` |
| `ENG-02` | API Endpoint & Envelope Contract | `[ENG_ROUTE_HINT]` | `PENDING_ENG_AUDIT` |
| `ENG-03` | SEED-* & ENUM-* Codebase Mapping | `SEED-LIST-PAGE-ADMIN, ENUM-REQUEST-STATUS, SEED-LIST-PAGE-MOBILE -> catalog & seeder binding` | `PENDING_ENG_AUDIT` |
| `ENG-04` | Visual Screen §2 & Lifecycle §3 data-testid Plan | `[ENG_VIEW_HINT]` | `PENDING_ENG_AUDIT` |
| `ENG-05` | ESR Index & N+1 Prevention | `[Index/Perf Check]` | `PENDING_ENG_AUDIT` |
| `ENG-06` | Tenant/IDOR & RBAC Guard | `[Security/IDOR Scope]` | `PENDING_ENG_AUDIT` |
| `ENG-07` | IPDPL/PII Masking | `Mask secrets/PII per PROJECT_CONTEXT privacy rules (SEC-PII-*); zero-PII log scrubber` | `PENDING_ENG_AUDIT` |
| `ENG-08` | Archetype Concurrency/Idempotency Strategy | `Optimistic version check + idempotency key per MUTATION_WORKFLOW (SCN-01, SCN-04); integration: [External service check]` | `PENDING_ENG_AUDIT` |
| `ENG-09` | Automated Test File Binding | `[Test File Binding]` | `PENDING_ENG_AUDIT` |
| `ENG-10` | Mobile/QA Handoff Impact | `[Flutter screen/cubit ref]` | `PENDING_ENG_AUDIT` |

