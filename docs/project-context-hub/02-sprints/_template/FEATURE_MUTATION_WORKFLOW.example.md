# `FEATURE-004`: Submit & Cancel Customer Service Request (`MUTATION_WORKFLOW` Starter Profile)

| Metadata Field | Canonical Value |
|---|---|
| **Feature ID** | `FEATURE-004` |
| **Title** | Submit & Cancel Customer Service Request |
| **Component ID** | `CMP-01` |
| **Epic ID** | `EPC-01` |
| **Target Release** | `REL-01` |
| **Component / Epic** | `CMP-01` / `EPC-01` |
| **Sprint / Wave** | `S02` / `Wave 2` |
| **Archetype** | `MUTATION_WORKFLOW` |
| **Channels** | `Web`, `Mobile` |
| **Version** | `v1.0.0` |
| **Gate A Status (BA)** | `READY_FOR_DEV` |
| **Gate B Status (Eng)** | `PENDING` |
| **Screen Refs** | `M06 (Create Request Form)`, `M07 (Request Detail & Cancel Modal)` |
| **Source Story / BRD Refs** | `US-018`, `US-019`, `BRD §5.1–5.3`, `PROJECT_CONTEXT @ v1.0.0` |
| **Semantic Digest (`feature_srd`)** | `SRD-F004-3F92B710C44E` |

---

## 1. Objective, Actors & Scope Boundaries
- **Business Objective:** Enable active customers to submit a scheduled service request with optional photo attachments and cancel eligible open requests within the free cancellation window.
- **Inherited Global Contracts:** `BR-GLB-001`, `BR-GLB-002`, `CONV-SHD-001..003`, `WF-SHD-001`.

| Role ID | Channel | Permitted Business Actions | Data Ownership Scope | Denied Outcome |
|---|---|---|---|---|
| `ROLE-CUST` | `Web`, `Mobile` | Create request (`ACTIVE` account required); cancel own `SUBMITTED`/`CONFIRMED` request | `Self (customer_id == auth_actor_id)` | Block suspended/foreign actor with `COPY-ERR-FORBIDDEN` |

- **In-Scope:** Request creation (`M06`), attachment validation, free-window cancellation (`M07`), audit & in-app/push notifications (`US-018`, `US-019`).
- **Upstream Prerequisite:** `HARD_PREREQ: FEATURE-001` (Auth), `FEATURE-002` (Active Service Categories).
- **Out-of-Scope:** Online card settlement (`FEATURE-005`), post-completion rating (`S03`).

### 1B. User Stories & Release/Sprint Decomposition (`STR-*` -> `TSK-*`)
| Story ID | Story Title | Release Code | Sprint Code | Priority | Linked `AC-*` | Screen Refs | Initial Department Tasks (`TSK-*`) |
|---|---|---|---|---|---|---|---|
| `STR-004-01` | Submit Scheduled Service Request with Validated Attachments | `REL-01` | `S02` | `critical` | `AC-01, AC-02, AC-03, AC-05` | `M06` | `TSK-004-01 (BE: Create & Upload Validator)`, `TSK-004-02 (MOB: M06 Form)` |
| `STR-004-02` | Cancel Eligible Open Service Request Within Free Window | `REL-01` | `S02` | `high` | `AC-04, AC-06` | `M07` | `TSK-004-03 (BE: 24h Cancel Guard)`, `TSK-004-04 (QA: AC-01..06 Suite)` |


### 1C. Scope Boundaries & Related Flows
| Boundary Type | Description & Linked `FEATURE-*` IDs | Dependency Kind (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM` / `EXCLUDED`) |
|---|---|---|
| **In-Scope** | Stories `STR-004-01`, `STR-004-02` (see 1B). | `OWNED` |
| **Related Flows** | No cross-feature dependency is declared in the sealed spec; sprint-level collisions are tracked in the sprint manifest (XFC-01..04). | `NONE` |
| **Explicitly Out-of-Scope** | None declared in the sealed spec beyond the stories in 1B. | `EXCLUDED` |

---

## 2. Visual Screen Decomposition Matrix
| Element ID | Screen Ref | Kind | AR Label | EN Label | Business Source or Exact Calculation Formula | Visibility / Editability Rule |
|---|---|---|---|---|---|---|
| `EL-01` | `M06` | `Field` | `فئة الخدمة` | `Service Category` | Active categories from `FEATURE-002` (`status == ACTIVE`) | Required selector |
| `EL-02` | `M06` | `Field` | `موعد الزيارة` | `Scheduled Slot` | Future slot `>= server_now + 2 hours` | Required datetime picker |
| `EL-03` | `M06` | `Field` | `وصف المشكلة` | `Issue Description` | Plain text (`10..500` chars) | Required multiline input |
| `EL-04` | `M06` | `Field` | `المرفقات` | `Attachments` | Up to `SEED-UPLOAD-MAX-COUNT` (`3`) files, `<= SEED-UPLOAD-MAX-SIZE` (`5 MB`) each | Optional uploader |
| `EL-05` | `M06` | `CTA` | `إرسال الطلب` | `Submit Request` | Creates `SUBMITTED` request + unique `code` | Enabled when required fields valid; locks in flight |
| `EL-06` | `M07` | `Badge` | `حالة الطلب` | `Request Status` | `ENUM-REQUEST-STATUS` badge | Always visible |
| `EL-07` | `M07` | `CTA` | `إلغاء الطلب` | `Cancel Request` | Opens confirmation modal (`SEED-LKP-CANCEL-REASONS`) | Visible only when `status IN (SUBMITTED, CONFIRMED)` & `hours_to_slot >= 24` (`SEED-BOOKING-CANCEL-WINDOW`) |

---

## 3. UI Lifecycle & Screen States Matrix
| Screen State | Trigger Condition | Exact Visual & Data Behavior | Primary CTA State | `AR / EN` Message Key |
|---|---|---|---|---|
| **Loading** | Category lookup load or submission in flight | Show spinner on `EL-05`; disable inputs during submit | `Disabled` | `COPY-M06-SUBMITTING` |
| **Empty State** | Zero `ACTIVE` service categories configured | Render unavailability notice instead of broken form | `EL-05` hidden | `COPY-M06-NO-SERVICES` |
| **Single-Item / Edge State** | `3 / 3` attachments uploaded (`SEED-UPLOAD-MAX-COUNT`) | Hide `+ Add File` button; allow removing existing file | `EL-05` enabled | `COPY-M06-MAX-FILES` |
| **Populated / Normal** | Valid active categories loaded on `M06` / active request on `M07` | Interactive form (`M06`) or full detail + conditional `Cancel` (`M07`) | `Enabled` | — |
| **Disabled / Locked** | Request in `IN_PROGRESS` / `COMPLETED` / `< 24h` before slot | Hide/disable `EL-07` and show cutoff rule notice | `EL-07` disabled | `COPY-M07-CANCEL-LOCKED` |
| **Error / Retry** | Validation error or network timeout on submit/cancel | Keep all typed fields & selected attachments intact; highlight offending field or show retry toast | `Enabled` | `COPY-M06-NET-ERR` |

---

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Deterministic Condition & Formula | Bound `SEED-*` / `ENUM-*` | Violation Outcome | Source Ref |
|---|---|---|---|---|
| `BR-FEAT-004-01` | `scheduled_at >= server_now + 120 minutes` AND selected category `status == ACTIVE` | `ENUM-REQUEST-STATUS` | Reject submit with `COPY-VAL-SLOT` / `COPY-VAL-CAT` | `BRD §5.1` |
| `BR-FEAT-004-02` | Customer self-cancellation permitted IFF `status IN (SUBMITTED, CONFIRMED)` AND `(scheduled_at - server_now) >= SEED-BOOKING-CANCEL-WINDOW (24h)` | `SEED-BOOKING-CANCEL-WINDOW`, `SEED-LKP-CANCEL-REASONS` | Block self-cancel; display `COPY-M07-CANCEL-LOCKED` | `BRD §5.3` |
| `BR-FEAT-004-03` | Attachments capped at `3` files (`SEED-UPLOAD-MAX-COUNT`), `<= 5 MB` (`SEED-UPLOAD-MAX-SIZE`), formats `JPG, PNG, PDF` | `SEED-UPLOAD-MAX-COUNT`, `SEED-UPLOAD-MAX-SIZE` | Block upload with `COPY-VAL-FILE` | `BRD §4.4` |


### 4B. Functional Requirements (`FR-*` — one per Story, traced both ways to `AC-*`)
| FR ID | Requirement (Observable System Behavior) | Source Story (`STR-*`) | Linked Rules (`BR-*`) | Covered By (`AC-*`) |
|---|---|---|---|---|
| `FR-01` | Submit Scheduled Service Request with Validated Attachments | `STR-004-01` | `BR-FEAT-004-01`, `BR-FEAT-004-03` | `AC-01`, `AC-02`, `AC-03`, `AC-05` |
| `FR-02` | Cancel Eligible Open Service Request Within Free Window | `STR-004-02` | `BR-FEAT-004-02` | `AC-04`, `AC-06` |

---

## 5. Archetype Operational Contract

### Sub-block 5A — `READ_VIEW` Contract
`OMITTED — Covered by FEATURE-003 (M05 List).`

### Sub-block 5B — `MUTATION_WORKFLOW` Input, State & Side-Effect Contract

#### 5B.1 Input Field Validation Matrix
| Field ID | Label (`EN / AR`) | Required? | Data Type | Min / Max / Format | Conditional Rule | Default | Error Copy Key |
|---|---|---|---|---|---|---|---|
| `FLD-CAT` | `Service Category / فئة الخدمة` | `YES` | `Lookup ID` | Active category ID | Must remain `ACTIVE` at submit | `None` | `COPY-VAL-CAT` |
| `FLD-SLOT` | `Scheduled Slot / موعد الزيارة` | `YES` | `DateTime` | `>= server_now + 2h` | Evaluated in project timezone | `None` | `COPY-VAL-SLOT` |
| `FLD-DESC` | `Issue Description / وصف المشكلة` | `YES` | `String` | `10..500` trimmed chars | Non-whitespace | `""` | `COPY-VAL-DESC` |
| `FLD-FILES` | `Attachments / المرفقات` | `NO` | `File[]` | `0..3` files, `<= 5 MB`, `JPG/PNG/PDF` | — | `[]` | `COPY-VAL-FILE` |
| `FLD-RSN` | `Cancel Reason / سبب الإلغاء` | `COND` | `Enum Code` | `SEED-LKP-CANCEL-REASONS` | Required on Cancel modal | `None` | `COPY-VAL-RSN` |

#### 5B.2 State Transition Matrix
| Current State | Triggering Event | Actor | Guard Condition | Next State | Invalid Attempt Outcome |
|---|---|---|---|---|---|
| `NONE` | `Submit Request` | `ROLE-CUST` | `BR-FEAT-004-01` & `03` pass | `SUBMITTED` | Return field validation error; zero record created |
| `SUBMITTED` / `CONFIRMED` | `Cancel Request` | `ROLE-CUST` | `BR-FEAT-004-02` (`>= 24h` & reason selected) | `CANCELLED` | Reject cancel; refresh `M07` with current status + `COPY-ERR-CONFLICT` |

#### 5B.3 Concurrency, Idempotency & Side Effects
- **Idempotency:** Duplicate `Submit Request` tap with same submission key returns the single created `request.code` without creating a second booking. Duplicate `Cancel` on an already `CANCELLED` request returns current `CANCELLED` state cleanly.
- **Concurrency:** If Admin/Provider transitions `CONFIRMED -> IN_PROGRESS` milliseconds before customer taps `Cancel`, `IN_PROGRESS` wins and customer receives `COPY-ERR-CONFLICT` with refreshed `M07`.
- **Side Effects:** Log immutable audit row (`PROJECT_CONTEXT §10`); dispatch In-App + Mobile Push (`MB-12A`) on `SUBMITTED` confirmation and `CANCELLED` transition.

---

## 6. Split Edge-Case, Resilience & Mobile Matrix

### 6A. Domain Business Edge Cases (`DOM-01..03`)
| Case ID | Domain Boundary Scenario | Trigger / Condition | Expected Authoritative Outcome | Linked `AC-*` |
|---|---|---|---|---|
| `DOM-01` | Exact `24h` cancellation cutoff boundary | `scheduled_at - server_now == 23h 59m` | Self-cancel blocked (`BR-FEAT-004-02`); `COPY-M07-CANCEL-LOCKED` shown | `AC-04` |
| `DOM-02` | Category deactivated while `M06` form is open | Admin deactivates category before customer taps `Submit` | Submit rejected with `COPY-VAL-CAT`; form preserves `FLD-DESC` & `FLD-FILES` | `AC-02` |
| `DOM-03` | `5.1 MB` file or `.exe` selected | File exceeds `SEED-UPLOAD-MAX-SIZE` or disallowed MIME | Rejected immediately with `COPY-VAL-FILE` | `AC-03` |


### 6B. Resilience & Mobile Contract (`SCN-01..06` & `MB-01..15`)
> **Anti-Evasion Rule (`STD-08-ZERO-GAP-v2.0`):** `N/A` is permitted only with an objective archetype/channel reason. Rows marked `PROPOSED_DEFAULT` in 9.1 were derived from the standard outcomes of this template and need BA/PO confirmation.

| Scenario ID | Concern | Applicability (`Applicable` / `N/A — Reason`) | User-Visible Authoritative Outcome & Safe Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `SCN-01` | Duplicate Action / Double Tap | `Applicable` | `EL-05` is disabled while the request is in flight; the server de-duplicates (request key / uniqueness) so a repeat yields one business outcome and returns the current authoritative state. | `AC-07` |
| `SCN-02` | Timeout / Uncertain Result | `Applicable` | The UI never assumes success or failure on timeout: entered values are kept, the screen error message is shown with an explicit Retry, and the authoritative server state is re-read before a retry is accepted. | `AC-08` |
| `SCN-03` | Offline / App Kill / Resume | `Applicable` | On resume or reconnect the client re-fetches authoritative state; no ghost local success is displayed. | `AC-09` |
| `SCN-04` | Concurrent State Modification | `Applicable` | The first valid transition wins; a stale submit is rejected with a conflict notice and the actor sees the current record (no silent overwrite). | `AC-10` |
| `SCN-05` | Cancel / Back / Abandon Mid-Flow | `Applicable` | Cancelling or closing the form discards unconfirmed input; no record, side effect or audit event is created. | `AC-11` |
| `SCN-06` | Permission / Auth Revoked Mid-Flow | `Applicable` | Every request is authorized server-side: a revoked or insufficient role is rejected with 403 and the session-expiry convention (CONV-SHD-002) applies; a foreign or non-existent record id returns 404 without data leakage. | `AC-12` |

- **`MB-01..MB-15`:** Mobile channel is active — populate the Mobile Business Matrix (`MB-12A` Push, `MB-12B` Deep Links) before sealing.

---

## 7. Bilingual Business Copy & Badges Table (`AR / EN`)
| Copy Key | Context | Arabic Text (`AR`) | English Text (`EN`) |
|---|---|---|---|
| `COPY-M06-TITLE` | `Title` | `طلب خدمة جديدة` | `New Service Request` |
| `COPY-VAL-CAT` | `Validation` | `فئة الخدمة المحددة غير متاحة حالياً` | `Selected service category is no longer available` |
| `COPY-VAL-SLOT` | `Validation` | `يجب اختيار موعد بعد ساعتين على الأقل من الوقت الحالي` | `Scheduled slot must be at least 2 hours from now` |
| `COPY-VAL-DESC` | `Validation` | `يرجى إدخال وصف للمشكلة بين 10 و500 حرف` | `Please enter an issue description between 10 and 500 characters` |
| `COPY-VAL-FILE` | `Validation` | `الحد الأقصى 3 ملفات (PDF, JPG, PNG) بحجم 5 ميجابايت للملف` | `Maximum 3 files (PDF, JPG, PNG) up to 5 MB each` |
| `COPY-M07-CANCEL-LOCKED` | `Toast` | `لا يمكن إلغاء الطلب قبل أقل من 24 ساعة من الموعد المحدد` | `Requests cannot be cancelled less than 24 hours before the scheduled slot` |
| `COPY-ERR-CONFLICT` | `Toast` | `تم تحديث حالة الطلب، يرجى مراجعة الحالة الحالية` | `Request status has changed. Please review the updated status.` |

---

## 8. Deterministic Acceptance Criteria (`AC-01..12`)
| AC ID | Traced IDs | Screen Ref | Given | When | Then |
|---|---|---|---|---|---|
| `AC-01` | `BR-FEAT-004-01`, `MB-12B`, `FR-01` | `M06`, `M07` | Active `ROLE-CUST` selects active category, slot `+4h`, and `25`-char description | Customer taps `Submit Request` (`EL-05`) | Request persists with status `SUBMITTED` and unique `code`, audit row logs creation, and customer lands on `M07` |
| `AC-02` | `DOM-02`, `FLD-CAT`, `FR-01` | `M06` | Category is deactivated by Admin while `M06` is open | Customer taps `Submit Request` | Submission rejected with `COPY-VAL-CAT`; `FLD-DESC` and uploaded attachments remain intact |
| `AC-03` | `BR-FEAT-004-03`, `DOM-03`, `MB-06..07`, `FR-01` | `M06` | Customer selects a `6 MB` image or `4th` attachment | Upload validation runs | File rejected with `COPY-VAL-FILE`; denied OS photo permission shows graceful Settings prompt |
| `AC-04` | `BR-FEAT-004-02`, `DOM-01`, `MB-11`, `MB-12A`, `FR-02` | `M07` | `SUBMITTED` request has `scheduled_at` `26h` ahead on server clock (`>= 24h`) vs `23h 59m` (`< 24h`) | Customer submits `Cancel` with `CHANGE_MIND` reason | `>= 24h` transitions to `CANCELLED` + logs audit; `< 24h` rejects with `COPY-M07-CANCEL-LOCKED` regardless of device clock tampering |
| `AC-05` | `SCN-01..03`, `MB-01..04`, `FR-01` | `M06` | Slow network causes customer to double-tap `Submit Request` | Both requests reach server with same submission key | Exactly `1` `SUBMITTED` request is created and returned |
| `AC-06` | `SCN-04..06`, `FR-02` | `M06`, `M07` | Request moves to `IN_PROGRESS` concurrently before customer confirms `Cancel` | Cancel request arrives | Server rejects transition with `COPY-ERR-CONFLICT` and refreshes `M07` to `IN_PROGRESS` |
| `AC-07` | `SCN-01` | M06 | The actor has a valid, complete form ready on M06 (Create Request Form), M07 (Request Detail & Cancel Modal). | The actor activates `EL-05` twice in quick succession (or the client retries the same request). | Exactly one business record/outcome is persisted, the repeat returns the current authoritative state without a duplicate, and the CTA stays disabled until the response arrives. |
| `AC-08` | `SCN-02` | M06 | A submission or data load is in flight. | The network drops or the request times out before any response. | The actor sees the screen error message with Retry, unsaved input is preserved, and no duplicate or half-applied record exists after the retry. |
| `AC-09` | `SCN-03` | M06 | The app was backgrounded or killed mid-flow. | The actor returns to the app. | The client re-fetches the authoritative state and shows no ghost local success. |
| `AC-10` | `SCN-04` | M06 | Two authorized actors edit the same record. | The second actor submits after the first has committed. | The stale write is rejected with a conflict notice and the current record version is displayed; the first actor's change is preserved. |
| `AC-11` | `SCN-05` | M06 | The actor has unsaved changes in the form. | The actor cancels, goes back, or closes the form. | No record is created or changed, no notification or audit event is emitted, and the previous state is shown. |
| `AC-12` | `SCN-06` | M06 | The actor's role or session is revoked while the flow is open (or the actor requests a record outside the authenticated tenant scope). | The actor submits or opens the record. | The server rejects with 403 (or 404 for a foreign/non-existent id), nothing is mutated or leaked, and the actor is routed per CONV-SHD-002. |

---

## 9. Gate A — BA Sealing Scorecard (`BA-01..BA-14`)

### 9.1 Key Business Decisions Snapshot (`D-01..D-n`)
| Decision ID | Provenance Tag (`PROJECT_CONTEXT` / `BA_ANSWERED` / `LOGICALLY_ENTAILED` / `ESTABLISHED_CONVENTION` / `PROPOSED_DEFAULT`) | Approved Decision & Bound `SEED-*` / `BR-*` | Reference & Authority |
|---|---|---|---|
| `D-01` | `LOGICALLY_ENTAILED` | `BR-FEAT-004-01` — scheduled_at >= server_now + 120 minutes AND selected category status == ACTIVE | `BR-FEAT-004-01` |
| `D-02` | `LOGICALLY_ENTAILED` | `BR-FEAT-004-02` — Customer self-cancellation permitted IFF status IN (SUBMITTED, CONFIRMED) AND (scheduled_at - server_now) >= SEED-BOOKING-CANCEL-WINDOW (24h) | `BR-FEAT-004-02` |
| `D-03` | `LOGICALLY_ENTAILED` | `BR-FEAT-004-03` — Attachments capped at 3 files (SEED-UPLOAD-MAX-COUNT), <= 5 MB (SEED-UPLOAD-MAX-SIZE), formats JPG, PNG, PDF | `BR-FEAT-004-03` |
| `D-04` | `PROPOSED_DEFAULT` | Standard resilience outcomes `SCN-01..06` applied where the sealed spec was silent (low-risk, reversible). | `SCN-01..06`, `AC-07`, `AC-08`, `AC-09`, `AC-10`, `AC-11`, `AC-12` |

**Snapshot Approval:** `APPROVED` (`[PO / BA Lead — YYYY-MM-DD]`)

### 9.2 Canonical 14-Check Audit Table
- **Decisions Snapshot (`D-01`):** `2h` minimum lead time, `24h` free cancellation window (`SEED-BOOKING-CANCEL-WINDOW`), and `3 × 5 MB` upload seeds approved by `PO / BA Lead (2026-11-11)`.
- **Audit Summary (`BA-01..BA-14`):** `BA-01..13 = PASS`, `BA-14 = N/A (v1.0.0 baseline)`.
- **Score:** `P = 13 | F = 0 | U = 0 | N = 1 | VALID = round(100 * 13 / (14 - 1), 1) = 100.0%` -> **Gate A: `READY_FOR_DEV`**.

### 9.3 Ownership Routing (Non-BA Handoff Notes — never asked of the BA)
| Dependency ID | Owner (`BACKEND_OWNED` / `SHARED_MOBILE` / `SHARED_WEB` / `DESIGN_OWNED`) | Handoff Note / Technical Requirement | Status (`Open` / `Done` / `Reused`) |
|---|---|---|---|
| `DEP-01` | `BACKEND_OWNED` | Endpoints, idempotency key, tenant-scoped queries and persistence for STR-004-01, STR-004-02 (see ENG-01, ENG-02, ENG-06, ENG-08). | `Open` |
| `DEP-02` | `DESIGN_OWNED` | UX frames/tokens for M06 (Create Request Form), M07 (Request Detail & Cancel Modal). | `Open` |
| `DEP-03` | `SHARED_WEB` | Reuse the global session-expiry, error and offline conventions (`CONV-SHD-002`, `CONV-SHD-003`) from PROJECT_CONTEXT. | `Reused` |

---

## 10. Feature Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA` / `PM` / `Dev` / `Mobile` / `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-11` | Initial Seal | `ALL` | Pre-baseline draft (`v0.x`) | Sealed `READY_FOR_DEV` (`VALID = 100.0%`) | `BA`: None \| `PM`: Lock `S02` \| `Dev`: Complete `§11` & implement \| `Mobile`: Build `M06/M07` \| `QA`: Automate `AC-01..06` |

---

## 11. Gate B — Engineering Readiness Appendix (`ENG-01..ENG-10` — Reserved for Engineering `.ai`)
| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| `ENG-01` | Model/Table Binding | `[Model/Table Binding]` | `PENDING_ENG_AUDIT` |
| `ENG-02` | API Endpoint & Envelope Contract | `[API Endpoint Contract + X-Idempotency-Key]` | `PENDING_ENG_AUDIT` |
| `ENG-03` | SEED-* & ENUM-* Codebase Mapping | `SEED-UPLOAD-MAX-COUNT, SEED-UPLOAD-MAX-SIZE, ENUM-REQUEST-STATUS, SEED-LKP-CANCEL-REASONS, SEED-BOOKING-CANCEL-WINDOW -> catalog & seeder binding` | `PENDING_ENG_AUDIT` |
| `ENG-04` | Visual Screen §2 & Lifecycle §3 data-testid Plan | `[Web component map]` | `PENDING_ENG_AUDIT` |
| `ENG-05` | ESR Index & N+1 Prevention | `[Index/Perf Check]` | `PENDING_ENG_AUDIT` |
| `ENG-06` | Tenant/IDOR & RBAC Guard | `[Security/IDOR Scope]` | `PENDING_ENG_AUDIT` |
| `ENG-07` | IPDPL/PII Masking | `N/A - no Tier-1/2 PII or secret fields in scope (confirm at audit)` | `PENDING_ENG_AUDIT` |
| `ENG-08` | Archetype Concurrency/Idempotency Strategy | `Optimistic version check + idempotency key per MUTATION_WORKFLOW (SCN-01, SCN-04); integration: [Storage / Push provider check]` | `PENDING_ENG_AUDIT` |
| `ENG-09` | Automated Test File Binding | `[Test File Binding]` | `PENDING_ENG_AUDIT` |
| `ENG-10` | Mobile/QA Handoff Impact | `[Flutter form/upload/push ref]` | `PENDING_ENG_AUDIT` |

