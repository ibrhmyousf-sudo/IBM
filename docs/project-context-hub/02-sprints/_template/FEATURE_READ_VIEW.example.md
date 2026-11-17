# `FEATURE-003`: Customer Service Requests History & Summary View (`READ_VIEW` Starter Profile)

| Metadata Field | Canonical Value |
|---|---|
| **Feature ID** | `FEATURE-003` |
| **Title** | Customer Service Requests History & Summary View |
| **Component ID** | `CMP-01` |
| **Epic ID** | `EPC-01` |
| **Target Release** | `REL-01` |
| **Component / Epic** | `CMP-01` / `EPC-01` |
| **Sprint / Wave** | `S01` / `Wave 1` |
| **Archetype** | `READ_VIEW` |
| **Channels** | `Web`, `Mobile` |
| **Version** | `v1.0.0` |
| **Gate A Status (BA)** | `READY_FOR_DEV` |
| **Gate B Status (Eng)** | `PENDING` |
| **Screen Refs** | `M05 (My Requests List)` |
| **Source Story / BRD Refs** | `US-014`, `BRD §4.2`, `PROJECT_CONTEXT @ v1.0.0` |
| **Semantic Digest (`feature_srd`)** | `SRD-F003-8A41C902E11B` |

---

## 1. Objective, Actors & Scope Boundaries
- **Business Objective:** Allow authenticated customers to inspect their own historical and active service requests with live status counters, status filtering, and navigation to request details.
- **Inherited Global Contracts:** `BR-GLB-002`, `CONV-SHD-001`, `CONV-SHD-002`, `SEC-PII-002`.

| Role ID | Channel | Permitted Business Actions | Data Ownership Scope | Denied Outcome |
|---|---|---|---|---|
| `ROLE-CUST` | `Web`, `Mobile` | View own KPI counters, filter by status, search by request code, open detail | `Self (customer_id == authenticated actor)` | Unauthenticated redirected to Login (`COPY-ERR-AUTH`) |

- **In-Scope:** Request summary cards, KPI counters, status filter chips, request code search (`US-014`).
- **Out-of-Scope:** Creating or cancelling requests (`FEATURE-004` `MUTATION_WORKFLOW`).

### 1B. User Stories & Release/Sprint Decomposition (`STR-*` -> `TSK-*`)
| Story ID | Story Title | Release Code | Sprint Code | Priority | Linked `AC-*` | Screen Refs | Initial Department Tasks (`TSK-*`) |
|---|---|---|---|---|---|---|---|
| `STR-003-01` | View My Service Requests KPI Counters & Paginated List | `REL-01` | `S01` | `high` | `AC-01, AC-03, AC-05` | `M05` | `TSK-003-01 (BE: List/KPI query)`, `TSK-003-02 (MOB: M05 UI & RTL)` |
| `STR-003-02` | Filter & Search Service Requests by Status and Request Code | `REL-01` | `S01` | `medium` | `AC-02, AC-04` | `M05` | `TSK-003-03 (QA: AC-01..05 suite)` |


### 1C. Scope Boundaries & Related Flows
| Boundary Type | Description & Linked `FEATURE-*` IDs | Dependency Kind (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM` / `EXCLUDED`) |
|---|---|---|
| **In-Scope** | Stories `STR-003-01`, `STR-003-02` (see 1B). | `OWNED` |
| **Related Flows** | No cross-feature dependency is declared in the sealed spec; sprint-level collisions are tracked in the sprint manifest (XFC-01..04). | `NONE` |
| **Explicitly Out-of-Scope** | None declared in the sealed spec beyond the stories in 1B. | `EXCLUDED` |

---

## 2. Visual Screen Decomposition Matrix
| Element ID | Screen Ref | Kind | AR Label | EN Label | Business Source or Exact Calculation Formula | Visibility / Editability Rule |
|---|---|---|---|---|---|---|
| `EL-01` | `M05` | `Derived Counter` | `الطلبات النشطة` | `Active Requests` | `COUNT(requests WHERE actor_id = self AND status IN (SUBMITTED, CONFIRMED, IN_PROGRESS))` | Always visible; `0` when none (`ignores list filter`) |
| `EL-02` | `M05` | `Derived Counter` | `الطلبات المكتملة` | `Completed` | `COUNT(requests WHERE actor_id = self AND status = COMPLETED)` | Always visible; `0` when none |
| `EL-03` | `M05` | `Filter` | `حالة الطلب` | `Status` | `ALL` (default) + `ENUM-REQUEST-STATUS` values | Always interactive |
| `EL-04` | `M05` | `Field` | `رقم الطلب والخدمة` | `Request Code & Service` | `request.code`, `service.localized_name`, `scheduled_at` (`CONV-SHD-002`) | Read-only card body |
| `EL-05` | `M05` | `Badge` | `الحالة` | `Status Badge` | Maps `request.status` -> `ENUM-REQUEST-STATUS` tone | Read-only chip per card |
| `EL-06` | `M05` | `CTA` | `طلب خدمة جديدة` | `New Request` | Navigates to `FEATURE-004` (`Screen M06`) | Visible when `ROLE-CUST` status `== ACTIVE` |

---

## 3. UI Lifecycle & Screen States Matrix
| Screen State | Trigger Condition | Exact Visual & Data Behavior | Primary CTA State | `AR / EN` Message Key |
|---|---|---|---|---|
| **Loading** | Initial screen entry or filter tap | Show 3 card skeletons; KPI counters show shimmer | `EL-06` disabled | `COPY-M05-LOADING` |
| **Empty State** | `0` total customer requests exist | Render empty state + `New Request` CTA; counters display `0` | `EL-06` enabled | `COPY-M05-EMPTY-ALL` |
| **Single-Item / Edge State** | `0` matches for active filter (while total requests `> 0`) | Keep top KPI counters intact; show filter-empty message + `Reset Filter` button | `Reset Filter` enabled | `COPY-M05-EMPTY-FILTER` |
| **Populated / Normal** | `>= 1` matching requests | Render cards sorted `created_at DESC`; paginate at `SEED-LIST-PAGE-MOBILE` (`20`) | `EL-06` enabled | — |
| **Disabled / Locked** | Customer account `SUSPENDED` | Historical list remains readable (`BR-GLB-002`); `New Request` CTA hidden | `EL-06` hidden | `COPY-M05-SUSPENDED` |
| **Error / Retry** | Network failure or API timeout | Retain previous filter chip; show inline error banner + `Retry` button | `Retry` enabled | `COPY-M05-ERROR` |

---

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Deterministic Condition & Formula | Bound `SEED-*` / `ENUM-*` | Violation / Edge Outcome | Source Ref |
|---|---|---|---|---|
| `BR-FEAT-003-01` | `actor` may view ONLY records where `request.customer_id == actor.id` | `ROLE-CUST` | Return `404 / Not Found` on direct foreign ID deep link | `BRD §3.5` |
| `BR-FEAT-003-02` | Top counters (`EL-01`, `EL-02`) reflect total account scope regardless of selected status filter chip (`EL-03`) | `ENUM-REQUEST-STATUS` | Counters remain stable across filter switches | `BRD §4.2` |
| `BR-FEAT-003-03` | Mobile list loads `20` items per batch (`SEED-LIST-PAGE-MOBILE`); Web loads `25` (`SEED-LIST-PAGE-ADMIN`) | `SEED-LIST-PAGE-MOBILE`, `SEED-LIST-PAGE-ADMIN` | Next page fetched only when more items exist | `BA-STD` |


### 4B. Functional Requirements (`FR-*` — one per Story, traced both ways to `AC-*`)
| FR ID | Requirement (Observable System Behavior) | Source Story (`STR-*`) | Linked Rules (`BR-*`) | Covered By (`AC-*`) |
|---|---|---|---|---|
| `FR-01` | View My Service Requests KPI Counters & Paginated List | `STR-003-01` | `BR-FEAT-003-01`, `BR-FEAT-003-03` | `AC-01`, `AC-03`, `AC-05` |
| `FR-02` | Filter & Search Service Requests by Status and Request Code | `STR-003-02` | `BR-FEAT-003-02`, `BR-FEAT-003-01` | `AC-02`, `AC-04` |

---

## 5. Archetype Operational Contract

### Sub-block 5A — `READ_VIEW` Query, Counter & Visibility Contract
| Concern | Deterministic Specification | Bound `SEED-*` / `ENUM-*` |
|---|---|---|
| **Actor / Tenant Visibility Scope** | Strict self-scope (`customer_id == auth_actor_id`); zero cross-customer leakage | `BR-FEAT-003-01` |
| **Search Behavior** | Exact/prefix match on `request.code` (case-insensitive, trimmed, min `2` chars) | `SEED-SEARCH-MIN-CHARS` (`2`) |
| **Query Filters** | Single-select status chip (`ALL` default + `ENUM-REQUEST-STATUS`) | `ENUM-REQUEST-STATUS` |
| **Default Sort** | `created_at DESC, id DESC` | — |
| **Pagination** | `20` items/batch on Mobile; `25` rows/page on Web | `SEED-LIST-PAGE-MOBILE` |
| **Derived Counters** | Global self-totals (`EL-01`, `EL-02`) refreshed on initial load and pull-to-refresh | `BR-FEAT-003-02` |

### Sub-block 5B — `MUTATION_WORKFLOW` Contract
`OMITTED — Pure READ_VIEW Archetype (zero state mutations or write payloads).`

---

## 6. Split Edge-Case, Resilience & Mobile Matrix

### 6A. Domain Business Edge Cases (`DOM-01..02`)
| Case ID | Domain Boundary Scenario | Trigger / Condition | Expected Authoritative Business Outcome | Linked `AC-*` |
|---|---|---|---|---|
| `DOM-01` | Filter returns `0` rows while account has `Completed` items | Customer taps `In Progress` chip with `0` active items | `EL-02` still shows `Completed > 0`; list area renders `COPY-M05-EMPTY-FILTER` + `Reset Filter` | `AC-02` |
| `DOM-02` | Deep link to another customer's `request_id` | Customer opens shared URL for foreign request | Access denied (`COPY-ERR-NOT-FOUND`); redirect safely to own `M05` list | `AC-04` |


### 6B. Resilience & Mobile Contract (`SCN-01..06` & `MB-01..15`)
> **Anti-Evasion Rule (`STD-08-ZERO-GAP-v2.0`):** `N/A` is permitted only with an objective archetype/channel reason. Rows marked `PROPOSED_DEFAULT` in 9.1 were derived from the standard outcomes of this template and need BA/PO confirmation.

| Scenario ID | Concern | Applicability (`Applicable` / `N/A — Reason`) | User-Visible Authoritative Outcome & Safe Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `SCN-01` | Duplicate Action / Double Tap | N/A — Pure READ_VIEW (no mutation) | `EL-06` is disabled while the request is in flight; the server de-duplicates (request key / uniqueness) so a repeat yields one business outcome and returns the current authoritative state. | — |
| `SCN-02` | Timeout / Uncertain Result | `Applicable` | The UI never assumes success or failure on timeout: entered values are kept, `COPY-M05-ERROR` is shown with an explicit Retry, and the authoritative server state is re-read before a retry is accepted. | `AC-06` |
| `SCN-03` | Offline / App Kill / Resume | `Applicable` | On resume or reconnect the client re-fetches authoritative state; no ghost local success is displayed. | `AC-07` |
| `SCN-04` | Concurrent State Modification | N/A — Pure READ_VIEW (no mutation) | The first valid transition wins; a stale submit is rejected with a conflict notice and the actor sees the current record (no silent overwrite). | — |
| `SCN-05` | Cancel / Back / Abandon Mid-Flow | N/A — Pure READ_VIEW (no mutation) | Cancelling or closing the form discards unconfirmed input; no record, side effect or audit event is created. | — |
| `SCN-06` | Permission / Auth Revoked Mid-Flow | `Applicable` | Every request is authorized server-side: a revoked or insufficient role is rejected with 403 and the session-expiry convention (CONV-SHD-002) applies; a foreign or non-existent record id returns 404 without data leakage. | `AC-08` |

- **`MB-01..MB-15`:** Mobile channel is active — populate the Mobile Business Matrix (`MB-12A` Push, `MB-12B` Deep Links) before sealing.

---

## 7. Bilingual Business Copy & Badges Table (`AR / EN`)
| Copy Key | Context | Arabic Text (`AR`) | English Text (`EN`) |
|---|---|---|---|
| `COPY-M05-TITLE` | `Title` | `طلباتي` | `My Requests` |
| `COPY-M05-EMPTY-ALL` | `Empty` | `لم تقم بإنشاء أي طلب خدمة بعد` | `You have not submitted any service requests yet` |
| `COPY-M05-EMPTY-FILTER` | `Empty` | `لا توجد طلبات مطابقة للتصفية المحددة` | `No requests match the selected filter` |
| `COPY-M05-SUSPENDED` | `Badge` | `الحساب موقوف مؤقتاً — للعرض فقط` | `Account suspended — read-only view` |
| `COPY-M05-ERROR` | `Toast` | `تعذّر تحميل الطلبات، يرجى المحاولة مجدداً` | `Unable to load requests. Please retry.` |

---

## 8. Deterministic Acceptance Criteria (`AC-01..08`)
| AC ID | Traced IDs | Screen Ref | Given | When | Then |
|---|---|---|---|---|---|
| `AC-01` | `BR-FEAT-003-01`, `BR-FEAT-003-03`, `MB-09`, `FR-01` | `M05` | Authenticated `ROLE-CUST` owns `25` requests (`3` `IN_PROGRESS`, `22` `COMPLETED`) | Customer opens `M05` on Mobile | `EL-01` displays `3`, `EL-02` displays `22`, and the first `20` (`SEED-LIST-PAGE-MOBILE`) cards render sorted `created_at DESC` |
| `AC-02` | `BR-FEAT-003-02`, `DOM-01`, `FR-02` | `M05` | Customer owns `0` `CONFIRMED` requests and `5` `COMPLETED` requests | Customer selects `CONFIRMED` status chip (`EL-03`) | `EL-02` remains `5`, list renders `COPY-M05-EMPTY-FILTER` with `Reset Filter` CTA |
| `AC-03` | `CONV-SHD-001`, `MB-10`, `FR-01` | `M05` | App locale switched from `en` to `ar` | `M05` renders | Layout mirrors to RTL, status badges show `AR` labels from `ENUM-REQUEST-STATUS` |
| `AC-04` | `BR-FEAT-003-01`, `DOM-02`, `SCN-06`, `MB-12B`, `FR-02` | `M05` | `ROLE-CUST` opens deep link targeting another customer's request | Route guard evaluates ownership | Foreign record is never exposed; user sees not-found message and lands on own `M05` list |
| `AC-05` | `SCN-02`, `SCN-03`, `MB-01`, `FR-01` | `M05` | Device loses connectivity while refreshing `M05` | Request times out | Skeleton clears, `COPY-M05-ERROR` banner with `Retry` CTA appears without crashing |
| `AC-06` | `SCN-02` | M05 | A submission or data load is in flight. | The network drops or the request times out before any response. | The actor sees `COPY-M05-ERROR` with Retry, unsaved input is preserved, and no duplicate or half-applied record exists after the retry. |
| `AC-07` | `SCN-03` | M05 | The app was backgrounded or killed mid-flow. | The actor returns to the app. | The client re-fetches the authoritative state and shows no ghost local success. |
| `AC-08` | `SCN-06` | M05 | The actor's role or session is revoked while the flow is open (or the actor requests a record outside the authenticated tenant scope). | The actor submits or opens the record. | The server rejects with 403 (or 404 for a foreign/non-existent id), nothing is mutated or leaked, and the actor is routed per CONV-SHD-002. |

---

## 9. Gate A — BA Sealing Scorecard (`BA-01..BA-14`)

### 9.1 Key Business Decisions Snapshot (`D-01..D-n`)
| Decision ID | Provenance Tag (`PROJECT_CONTEXT` / `BA_ANSWERED` / `LOGICALLY_ENTAILED` / `ESTABLISHED_CONVENTION` / `PROPOSED_DEFAULT`) | Approved Decision & Bound `SEED-*` / `BR-*` | Reference & Authority |
|---|---|---|---|
| `D-01` | `LOGICALLY_ENTAILED` | `BR-FEAT-003-01` — actor may view ONLY records where request.customer_id == actor.id | `BR-FEAT-003-01` |
| `D-02` | `LOGICALLY_ENTAILED` | `BR-FEAT-003-02` — Top counters (EL-01, EL-02) reflect total account scope regardless of selected status filter chip (EL-03) | `BR-FEAT-003-02` |
| `D-03` | `LOGICALLY_ENTAILED` | `BR-FEAT-003-03` — Mobile list loads 20 items per batch (SEED-LIST-PAGE-MOBILE); Web loads 25 (SEED-LIST-PAGE-ADMIN) | `BR-FEAT-003-03` |
| `D-04` | `PROPOSED_DEFAULT` | Standard resilience outcomes `SCN-01..06` applied where the sealed spec was silent (low-risk, reversible). | `SCN-01..06`, `AC-06`, `AC-07`, `AC-08` |

**Snapshot Approval:** `APPROVED` (`[PO / BA Lead — YYYY-MM-DD]`)

### 9.2 Canonical 14-Check Audit Table
- **Decisions Snapshot (`D-01`):** `SEED-LIST-PAGE-MOBILE = 20` and unfiltered KPI counter behavior (`BR-FEAT-003-02`) approved by `PO / BA Lead (2026-11-11)`.
- **Audit Summary (`BA-01..BA-14`):** `BA-01..08 = PASS`, `BA-09 = N/A (Pure READ_VIEW without mutation form)`, `BA-10..13 = PASS`, `BA-14 = N/A (v1.0.0 baseline)`.
- **Score:** `P = 12 | F = 0 | U = 0 | N = 2 | VALID = round(100 * 12 / (14 - 2), 1) = 100.0%` -> **Gate A: `READY_FOR_DEV`**.

### 9.3 Ownership Routing (Non-BA Handoff Notes — never asked of the BA)
| Dependency ID | Owner (`BACKEND_OWNED` / `SHARED_MOBILE` / `SHARED_WEB` / `DESIGN_OWNED`) | Handoff Note / Technical Requirement | Status (`Open` / `Done` / `Reused`) |
|---|---|---|---|
| `DEP-01` | `BACKEND_OWNED` | Endpoints, idempotency key, tenant-scoped queries and persistence for STR-003-01, STR-003-02 (see ENG-01, ENG-02, ENG-06, ENG-08). | `Open` |
| `DEP-02` | `DESIGN_OWNED` | UX frames/tokens for M05 (My Requests List). | `Open` |
| `DEP-03` | `SHARED_WEB` | Reuse the global session-expiry, error and offline conventions (`CONV-SHD-002`, `CONV-SHD-003`) from PROJECT_CONTEXT. | `Reused` |

---

## 10. Feature Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA` / `PM` / `Dev` / `Mobile` / `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-11` | Initial Seal | `ALL` | Pre-baseline draft (`v0.x`) | Sealed `READY_FOR_DEV` (`VALID = 100.0%`) | `BA`: None \| `PM`: Lock `S01` \| `Dev`: Complete `§11` & implement \| `Mobile`: Build `M05` \| `QA`: Automate `AC-01..05` |

---

## 11. Gate B — Engineering Readiness Appendix (`ENG-01..ENG-10` — Reserved for Engineering `.ai`)
| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| `ENG-01` | Model/Table Binding | `[Model/Table Binding]` | `PENDING_ENG_AUDIT` |
| `ENG-02` | API Endpoint & Envelope Contract | `[API Endpoint Contract]` | `PENDING_ENG_AUDIT` |
| `ENG-03` | SEED-* & ENUM-* Codebase Mapping | `ENUM-REQUEST-STATUS, SEED-LIST-PAGE-MOBILE, SEED-LIST-PAGE-ADMIN, SEED-SEARCH-MIN-CHARS -> catalog & seeder binding` | `PENDING_ENG_AUDIT` |
| `ENG-04` | Visual Screen §2 & Lifecycle §3 data-testid Plan | `[Web component map]` | `PENDING_ENG_AUDIT` |
| `ENG-05` | ESR Index & N+1 Prevention | `[Index/Perf Check]` | `PENDING_ENG_AUDIT` |
| `ENG-06` | Tenant/IDOR & RBAC Guard | `[Security/IDOR Scope]` | `PENDING_ENG_AUDIT` |
| `ENG-07` | IPDPL/PII Masking | `Mask secrets/PII per PROJECT_CONTEXT privacy rules (SEC-PII-*); zero-PII log scrubber` | `PENDING_ENG_AUDIT` |
| `ENG-08` | Archetype Concurrency/Idempotency Strategy | `Optimistic version check + idempotency key per READ_VIEW (SCN-01, SCN-04)` | `PENDING_ENG_AUDIT` |
| `ENG-09` | Automated Test File Binding | `[Test File Binding]` | `PENDING_ENG_AUDIT` |
| `ENG-10` | Mobile/QA Handoff Impact | `[Flutter route/cubit ref]` | `PENDING_ENG_AUDIT` |

