# `FEATURE-[XXX]`: `[Feature Title]`

| Metadata Field | Canonical Value |
|---|---|
| **Feature ID** | `FEATURE-[XXX]` |
| **Title** | `[Concise Capability Title]` |
| **Component ID** | `CMP-[XX]` |
| **Epic ID** | `EPC-[XX]` |
| **Target Release** | `REL-[XX]` |
| **Component / Epic** | `CMP-[XX]` / `EPC-[XX]` (`Stage 02 Preserved`) |
| **Sprint / Wave** | `[S01 / B1]` / `Wave [1 | 2 | 3]` |
| **Archetype** | `READ_VIEW` \| `MUTATION_WORKFLOW` \| `INTEGRATION_JOB` |
| **Channels** | `Web` \| `Mobile` \| `Admin` \| `API` |
| **Version** | `v1.0.0` |
| **Gate A Status (BA)** | `DRAFT` \| `READY_FOR_DEV` |
| **Gate B Status (Eng)** | `PENDING` \| `READY_TO_CODE` |
| **Screen Refs** | `[M01, M02 | A04 | Figma Node / Wireframe ID | NONE (Headless Job)]` |
| **Source Story / BRD Refs** | `US-[XXX]`, `BRD §X.Y`, `PROJECT_CONTEXT @ v1.0.0` |
| **Semantic Digest (`feature_srd`)** | `SRD-F[XXX]-[12_HEX_DIGEST]` |

---

## 1. Objective, Actors & Scope Boundaries
- **Business Objective:** `[1–2 concrete sentences stating observable business outcome and value]`
- **Inherited Global Contracts:** `BR-GLB-[XXX]`, `CONV-SHD-[XXX]`, `WF-SHD-[XXX]`, `SEC-PII-[XXX]` (referenced by ID from `00-project-core/PROJECT_CONTEXT.md`).

### Actor & Eligibility Matrix (`ROLE-*`)
| Role ID | Channel | Permitted Business Actions in This Feature | Data / Tenant Ownership Scope | Denied / Unauthorized Outcome |
|---|---|---|---|---|
| `ROLE-[XXX]` | `[Mobile / Web / Admin]` | `[Exact actions allowed]` | `[Self / Assigned Branch / All Tenants]` | `[Deny access + redirect/message key COPY-ERR-AUTH]` |

### 1C. Scope Boundaries & Related Flows
| Boundary Type | Description & Linked `FEATURE-*` IDs | Dependency Kind (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM` / `EXCLUDED`) |
|---|---|---|
| **In-Scope** | `[Included capabilities & Story IDs]` | `OWNED` |
| **Upstream Prerequisite** | `[Required existing entity/state from FEATURE-YYY]` | `HARD_PREREQ` |
| **Downstream Side Effect** | `[State/event consumed later by FEATURE-ZZZ]` | `DOWNSTREAM` |
| **Explicitly Out-of-Scope** | `[Capabilities excluded from this feature]` | `EXCLUDED` |

### 1B. User Stories & Release/Sprint Decomposition (`STR-*` -> `TSK-*`)
| Story ID | Story Title (`As a ROLE-*, I want ...`) | Release Code | Sprint Code | Priority | Linked `AC-*` | Screen Refs | Initial Department Tasks (`TSK-*`) |
|---|---|---|---|---|---|---|---|
| `STR-[XXX]-01` | `[Atomic deliverable user story 1]` | `REL-01` | `S01` | `high` | `AC-01, AC-02` | `M01` | `TSK-[XXX]-01 (BE)`, `TSK-[XXX]-02 (MOB)`, `TSK-[XXX]-03 (QA)` |

---

## 2. Visual Screen Decomposition Matrix
> **Mandatory Rule (`.agrules` §4.1):** Every screen listed in `Screen Refs` MUST decompose all fields, derived counters/metrics, status badges, filters, and CTAs. No screen widget may rely on undocumented visual guesswork.

| Element ID | Screen Ref | Kind (`Field` / `Derived Counter` / `Badge` / `Filter` / `CTA`) | AR Label | EN Label | Business Source or Exact Calculation Formula | Visibility / Editability Rule |
|---|---|---|---|---|---|---|
| `EL-01` | `[M01 / A01]` | `Derived Counter` | `[إجمالي ...]` | `[Total ...]` | `COUNT(records WHERE status IN (...) AND scope = actor_scope)` | Visible to `ROLE-*`; `0` when empty |
| `EL-02` | `[M01 / A01]` | `Filter` | `[الحالة]` | `[Status]` | Options bound to `ENUM-[GROUP]` (`ALL` default) | Always visible |
| `EL-03` | `[M01 / A01]` | `Field` | `[الاسم / القيمة]` | `[Name / Value]` | Entity attribute / User input (`Required`) | Editable when `status == DRAFT`; read-only otherwise |
| `EL-04` | `[M01 / A01]` | `Badge` | `[حسب ENUM]` | `[Per ENUM]` | Maps entity `status` -> `ENUM-[GROUP]` semantic tone | Always visible on card/row |
| `EL-05` | `[M01 / A01]` | `CTA` | `[تأكيد / إرسال]` | `[Submit / Confirm]` | Triggers `[Action / Transition]` | Enabled when form valid & actor eligible; disabled while submitting |

---

## 3. UI Lifecycle & Screen States Matrix
| Screen State | Trigger Condition | Exact Visual & Data Behavior | Primary CTA State | `AR / EN` Message Key (`Section 7`) |
|---|---|---|---|---|
| **Loading** | Initial fetch or filter refresh in flight | Render skeleton/spinner layout; suppress premature empty banner | `Disabled` | `COPY-STATE-LOADING` |
| **Empty State** | Query succeeds with `0` matching records | Show empty illustration/message; if active filters exist, offer "Reset Filters" | `Clear Filters` or `Create CTA` enabled | `COPY-STATE-EMPTY` |
| **Single-Item / Edge State** | Exactly `1` record or boundary threshold reached (e.g., last slot / max upload count) | Render item cleanly; hide pagination next control; show limit notice if at cap | Conditional per `BR-FEAT-*` | `COPY-STATE-EDGE` |
| **Populated / Normal** | `>= 2` records returned or active editable form loaded | Render sorted items per `SEED-LIST-PAGE-*` + active counters/badges | `Enabled` per eligibility | — |
| **Disabled / Locked** | Record in terminal/locked state or actor lacks mutation right | Inputs read-only; mutating CTA hidden or disabled with explicit reason | `Disabled` | `COPY-STATE-LOCKED` |
| **Error / Retry** | Network/server failure or timeout fetching/submitting | Preserve any unsaved user input; display non-technical error + explicit `Retry` action | `Retry` enabled | `COPY-STATE-ERROR` |

---

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Deterministic Condition & Formula (`IF ... THEN ... ELSE ...`) | Bound `SEED-*` / `ENUM-*` ID | Failure / Violation Outcome | Source Ref |
|---|---|---|---|---|
| `BR-FEAT-[XXX]-01` | `IF [explicit boolean/state condition] THEN [observable business result] ELSE [rejection/fallback]` | `SEED-[KEY]` (`Default: [Value]`) | Block action + surface `COPY-VAL-01` | `BRD §X.Y` |
| `BR-FEAT-[XXX]-02` | `[Exact fee / timer / eligibility calculation formula with rounding/timezone rule]` | `ENUM-[GROUP]` | `[State or validation outcome]` | `BRD §X.Z` |

### 4B. Functional Requirements (`FR-*` — one per Story, traced both ways to `AC-*`)
| FR ID | Requirement (Observable System Behavior) | Source Story (`STR-*`) | Linked Rules (`BR-*`) | Covered By (`AC-*`) |
|---|---|---|---|---|
| `FR-01` | `[Actor can / system must ... — observable outcome]` | `STR-[XXX]-01` | `BR-FEAT-[XXX]-01` | `AC-01` |

---

## 5. Archetype Operational Contract
> **Instruction:** Populate **Sub-block 5A** for `READ_VIEW` features (and list/detail screens inside composite features). Populate **Sub-block 5B** for `MUTATION_WORKFLOW` and `INTEGRATION_JOB` features. Delete or mark unused sub-block `OMITTED — Pure [Archetype]`.

### Sub-block 5A — `READ_VIEW` Query, Counter & Visibility Contract
| Concern | Deterministic Specification | Bound `SEED-*` / `ENUM-*` |
|---|---|---|
| **Actor / Tenant Data Visibility Scope** | `[Exact row-level business visibility rule: e.g., Customer sees ONLY own requests; Branch Manager sees assigned branch_id]` | `ROLE-*` |
| **Search Behavior** | `[Searchable fields, case/diacritic insensitivity, min chars before trigger]` | `SEED-SEARCH-MIN-CHARS` |
| **Query Filters** | `[Filterable fields, single vs multi-select, default = ALL, URL/session persistence]` | `ENUM-*` |
| **Default Sort & Secondary Tie-Breaker** | `[e.g., created_at DESC, id DESC]` | — |
| **Pagination / Batching Strategy** | `[Cursor/Page size per surface; never unbounded]` | `SEED-LIST-PAGE-MOBILE` / `SEED-LIST-PAGE-ADMIN` |
| **Derived Counter Synchronization** | `[Whether KPI counters reflect global tenant totals or active filter subset]` | `EL-01` |

*(Note: Pure `READ_VIEW` specs intentionally omit write-locking, double-submit idempotency, and rollback boilerplate.)*

### Sub-block 5B — `MUTATION_WORKFLOW` / `INTEGRATION_JOB` Input, State & Side-Effect Contract

#### 5B.1 Input Field Validation Matrix
| Field ID | Label (`EN / AR`) | Required? | Data Type | Min / Max / Format / Allowed Values | Cross-Field / Conditional Rule | Default Value | Error Copy Key |
|---|---|---|---|---|---|---|---|
| `FLD-01` | `[Field EN / AR]` | `YES / COND` | `String / Decimal / Date / File` | `[Exact min/max or SEED-UPLOAD-MAX-SIZE]` | `[e.g., Required when status == REJECTED]` | `[None or Seed]` | `COPY-VAL-01` |

#### 5B.2 State Transition Matrix
| Current State (`ENUM-*`) | Triggering Event / CTA | Actor / System | Guard Condition (`BR-FEAT-*`) | Next State (`ENUM-*`) | Invalid State Attempt Outcome |
|---|---|---|---|---|---|
| `SUBMITTED` | `Confirm Request` | `ROLE-ADMIN` | Slot available & account `ACTIVE` | `CONFIRMED` | Reject transition; refresh current state + show `COPY-ERR-CONFLICT` |

#### 5B.3 Concurrency, Idempotency & Side Effects
- **Duplicate Submit / Webhook Idempotency Rule:** `[Repeated tap/callback for the same logical operation creates at most 1 business record/charge and returns current authoritative state]`.
- **Concurrent Modification Policy:** `[First valid transition wins; stale actor receives current state notice without silent overwrite]`.
- **Side Effects (Notifications & Audit):** `[Exact notification event + recipient role + channel per PROJECT_CONTEXT §9; audit log entry per §10]`.

---

## 6. Split Edge-Case, Resilience & Mobile Matrix

### 6A. Domain Business Edge Cases (`DOM-01..n`)
| Case ID | Domain Boundary Scenario | Trigger / Condition | Expected Authoritative Business Outcome & Permitted Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `DOM-01` | `[Feature-specific boundary: e.g., exact cutoff minute, zero-price promo, deactivated lookup item]` | `[Exact trigger]` | `[Observable system outcome + user recovery path]` | `AC-03` |

### 6B. Resilience & Mobile Contract (`SCN-01..06` & `MB-01..15`)
> **Anti-Evasion Rule (`STD-08-ZERO-GAP-v2.0`):** Blanket `NOT_APPLICABLE` across mutation/mobile rows is **FORBIDDEN**. `N/A` is permitted ONLY when justified objectively by `Archetype == READ_VIEW`, `Mobile NOT in Channels`, or an explicit out-of-scope BRD clause.

#### Adversarial Resilience Scenarios (`SCN-01..06`)
| Scenario ID | Concern | Applicability (`APPLICABLE` / `N/A — Archetype/Scope Reason`) | User-Visible Authoritative Outcome & Safe Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `SCN-01` | Duplicate Action / Double Tap | `[APPLICABLE for MUTATION/INTEGRATION \| N/A — Pure READ_VIEW]` | `[Disable CTA in flight; server deduplicates; single outcome shown]` | `AC-XX` |
| `SCN-02` | Network Timeout / Uncertain Result | `[APPLICABLE]` | `[Never assume mutation failed or succeeded; query/display current status + safe Retry]` | `AC-XX` |
| `SCN-03` | Offline / App Kill / Resume | `[APPLICABLE if Mobile \| Web form draft rule]` | `[Clear offline indicator; re-fetch authoritative state on resume; no ghost local success]` | `AC-XX` |
| `SCN-04` | Concurrent State Modification | `[APPLICABLE for stateful MUTATION \| N/A — Pure READ_VIEW]` | `[Reject stale write; show updated record status and reload CTA]` | `AC-XX` |
| `SCN-05` | Back / Cancel / Abandon Mid-Flow | `[APPLICABLE for multi-step/form MUTATION \| N/A — Pure READ_VIEW]` | `[Unconfirmed changes discarded (or draft saved if sourced); zero partial side effects]` | `AC-XX` |
| `SCN-06` | Auth / Permission Revoked Mid-Flow | `[APPLICABLE]` | `[Block protected data/mutation immediately; redirect to login/access-denied]` | `AC-XX` |

#### Mobile Business Matrix (`MB-01..15` with `MB-12A` & `MB-12B` Split — Populate When `Mobile` in Channels)
| MB ID | Mobile Business Dimension | Applicability (`APPLICABLE` / `N/A — Scope/Archetype Reason`) | Observable Mobile Business Behavior | Linked `AC-*` |
|---|---|---|---|---|
| `MB-01` | Lifecycle Background / Foreground Resume | `[APPLICABLE / N/A]` | `[Refresh stale counters/status on foreground resume]` | `AC-XX` |
| `MB-02` | Offline Read / Cached View Policy | `[APPLICABLE / N/A]` | `[Show connectivity banner; never display stale financial/slot availability as live]` | `AC-XX` |
| `MB-03` | Offline Mutation / Queue Policy | `[N/A — Live Connectivity Required unless BRD mandates offline queue]` | `[Block submit offline with COPY-STATE-ERROR; preserve typed inputs]` | `AC-XX` |
| `MB-04` | Duplicate Tap & Slow Network Guard | `[APPLICABLE for MUTATION / N/A — Pure READ_VIEW]` | `[Lock CTA during request; idempotent business outcome]` | `AC-XX` |
| `MB-05` | Session Expiry & Biometric / Token Re-Auth | `[Ref CONV-SHD / BR-GLB-002]` | `[Prompt re-auth cleanly without corrupting account state]` | `AC-XX` |
| `MB-06` | OS Permission Denial (Camera/Photos/Location/Push) | `[APPLICABLE only if feature uses OS capability / N/A — Not used]` | `[Graceful explanation + Settings shortcut or manual fallback]` | `AC-XX` |
| `MB-07` | Media Capture, File Picker & Upload Limits | `[APPLICABLE if upload exists / N/A — Zero file inputs]` | `[Enforce SEED-UPLOAD-MAX-SIZE & allowed MIME types before upload]` | `AC-XX` |
| `MB-08` | Soft Keyboard, Input Type & Focus Recovery | `[APPLICABLE if form inputs exist / N/A — Pure READ_VIEW without search]` | `[Numeric/phone/email keypad matching field; inline error scroll-to-focus]` | `AC-XX` |
| `MB-09` | Pull-to-Refresh & Infinite Pagination | `[APPLICABLE if mobile list/detail / N/A]` | `[Pull-to-refresh resets page 1; batch size = SEED-LIST-PAGE-MOBILE]` | `AC-XX` |
| `MB-10` | RTL / LTR Live Locale Switch (`AR / EN`) | `[APPLICABLE per CONV-SHD-001]` | `[Mirror layout, icons, and badges cleanly; preserve Western/Arabic numerals per conv]` | `AC-XX` |
| `MB-11` | Timezone, Device Clock Skew & Countdown Timers | `[APPLICABLE if timers/slots exist / N/A]` | `[Evaluate cutoffs/OTP timers against server authoritative time, never device clock]` | `AC-XX` |
| `MB-12A` | Push Notification Business Outcome | `[APPLICABLE if push event scoped / N/A — No push in feature]` | `[Recipient role, trigger state, localized title/body intent]` | `AC-XX` |
| `MB-12B` | Deep Link / Universal Link Entry Routing | `[APPLICABLE if deep-link target / N/A — Not deep-linkable]` | `[If authenticated & authorized -> target detail; if unauth -> login then route; if missing -> safe error]` | `AC-XX` |
| `MB-13` | App Force-Update / Deprecated Rule Guard | `[Inherited via PROJECT_CONTEXT or N/A]` | `[Handled globally per CONV-SHD]` | — |
| `MB-14` | Sensitive Screen Masking / PII Clipboard Guard | `[APPLICABLE if Tier-1 PII displayed / N/A]` | `[Apply SEC-PII-001 masking rules]` | `AC-XX` |
| `MB-15` | Mobile Analytics / Business Funnel Event | `[APPLICABLE only if analytics taxonomy in BRD / N/A — Unscoped]` | `[Exact business event trigger without PII payload]` | — |

---

## 7. Bilingual Business Copy & Badges Table (`AR / EN`)
| Copy Key | Context (`Title` / `CTA` / `Badge` / `Validation` / `Toast` / `Empty`) | Arabic Text (`AR`) | English Text (`EN`) |
|---|---|---|---|
| `COPY-TITLE-MAIN` | `Title` | `[عنوان الشاشة]` | `[Screen Title]` |
| `COPY-CTA-PRIMARY` | `CTA` | `[الإجراء الرئيسي]` | `[Primary Action]` |
| `COPY-STATE-EMPTY` | `Empty` | `[لا توجد سجلات متاحة حالياً]` | `[No records available yet]` |
| `COPY-STATE-ERROR` | `Toast` | `[تعذّر إتمام العملية، يرجى المحاولة مرة أخرى]` | `[Unable to complete request. Please try again.]` |
| `COPY-VAL-01` | `Validation` | `[رسالة التحقق المحددة]` | `[Specific validation error message]` |

---

## 8. Deterministic Acceptance Criteria (`AC-01..n`)
> **Strict Ban on Mail-Merge Templates:** Every `AC-*` row MUST state concrete domain conditions, actor roles, `SEED-*`/`ENUM-*` values, and exact copy/state outcomes. Generic `«Field» is invalid` placeholders fail `BA-07` & `BA-09`.

| AC ID | Traced `BR-FEAT` / `DOM` / `SCN` / `MB` | Screen Ref | Given (Precondition & State) | When (Concrete Actor / System Trigger) | Then (Observable Business, State & UI Outcome) |
|---|---|---|---|---|---|
| `AC-01` | `BR-FEAT-[XXX]-01` | `[M01]` | `[Concrete actor, role, and seeded state]` | `[Exact action or query]` | `[Exact persisted state, badge, counter, and copy key]` |
| `AC-02` | `DOM-01`, `SCN-01` | `[M01]` | `[Boundary or duplicate-action setup]` | `[Repeated or boundary trigger]` | `[Deterministic rejection/idempotent outcome + safe next action]` |

---

## 9. Gate A — BA Sealing Scorecard (`BA-01..BA-14` + Key Decisions Snapshot)

### 9.1 Key Business Decisions Snapshot (`D-01..D-n`)
| Decision ID | Provenance Tag (`PROJECT_CONTEXT` / `BA_ANSWERED` / `LOGICALLY_ENTAILED` / `ESTABLISHED_CONVENTION` / `PROPOSED_DEFAULT`) | Approved Decision & Bound `SEED-*` / `BR-*` | Reference & Authority |
|---|---|---|---|
| `D-01` | `PROJECT_CONTEXT` | `[Exact approved rule]` | `BR-GLB-001` |

**Snapshot Approval:** `APPROVED` (`[PO / BA Lead — YYYY-MM-DD]`)

### 9.2 Canonical 14-Check Audit Table
> **Formula:** `APPLICABLE = 14 - N`; `VALID = round(100 * P / (14 - N), 1)`. Gate A `READY_FOR_DEV` requires `F = 0`, `U = 0`, and `VALID = 100.0%` across two verification passes.

| Check ID | Type | Audit Assurance Criterion | Verdict (`PASS` / `FAIL` / `PENDING` / `N/A`) | Concrete Evidence / `N/A` Archetype Justification |
|---|---|---|---|---|
| `BA-01` | `ALWAYS` | Current approved BRD/CR, Context, and Feature slice loaded | `PASS` | `Metadata & §1` |
| `BA-02` | `ALWAYS` | Objective, outcome, and In/Out scope boundaries consistent | `PASS` | `§1` |
| `BA-03` | `ALWAYS` | Actors (`ROLE-*`), eligibility, and tenant/ownership scope explicit | `PASS` | `§1, §5` |
| `BA-04` | `ALWAYS` | Visual Screen Decomposition (`§2`) & UI Screen States (`§3`) complete | `PASS` | `§2, §3` |
| `BA-05` | `ALWAYS` | `BR-FEAT-*`, `SEED-*` defaults, and cross-feature flows compatible | `PASS` | `§4` |
| `BA-06` | `ALWAYS` | Archetype applicability & BA vs Eng ownership strictly honored | `PASS` | `§5, §6B, §11` |
| `BA-07` | `ALWAYS` | Bidirectional `REQ <-> AC` coverage (`0` uncovered rules, `0` orphan/generic ACs) | `PASS` | `§8` |
| `BA-08` | `ALWAYS` | Exact Key Business Decisions Snapshot (`§9.1`) & `SEED-*` values signed off | `PASS` | `§9.1` |
| `BA-09` | `COND` | Input validations, formats, limits, and error recovery complete | `PASS / N/A` | `§5B.1` (`N/A` only if pure `READ_VIEW` with zero inputs) |
| `BA-10` | `COND` | Bilingual `AR / EN` business copy & badge labels complete | `PASS` | `§7` |
| `BA-11` | `COND` | Money, time, capacity, seed limits, and state guards deterministic | `PASS` | `§4, §5B.2, §6A` |
| `BA-12` | `COND` | Applicable `SCN-01..06` & `MB-01..11` resilience outcomes specified | `PASS` | `§6B` |
| `BA-13` | `COND` | In-scope Push (`MB-12A`), Deep Links (`MB-12B`), Lists (`§5A`), PII (`MB-14`) complete | `PASS / N/A` | `§5A, §6B` |
| `BA-14` | `COND` | Post-baseline CR / regression delta (`Was / Current / Update Needed`) recorded | `N/A` (`v1.0.0`) \| `PASS` (`v1.1+`) | `§10` |

- **Score Summary:** `P = [X] | F = 0 | U = 0 | N = [Y] | VALID = 100.0%` -> **Gate A: `READY_FOR_DEV`** (`Pass 1 + Pass 2 Verified`).


### 9.3 Ownership Routing (Non-BA Handoff Notes — never asked of the BA)
| Dependency ID | Owner (`BACKEND_OWNED` / `SHARED_MOBILE` / `SHARED_WEB` / `DESIGN_OWNED`) | Handoff Note / Technical Requirement | Status (`Open` / `Done` / `Reused`) |
|---|---|---|---|
| `DEP-01` | `BACKEND_OWNED` | `[API contract, idempotency key, persistence — owned by Backend]` | `Open` |
| `DEP-02` | `DESIGN_OWNED` | `[Figma frames / tokens for the Screen Refs]` | `Open` |

---

## 10. Feature Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA` / `PM` / `Dev` / `Mobile` / `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `YYYY-MM-DD` | Initial Seal | `ALL` | Pre-baseline draft (`v0.x`) | Sealed `READY_FOR_DEV` baseline (`VALID = 100.0%`) | `BA`: None \| `PM`: Ready for Sprint \| `Dev`: Complete `§11` & implement \| `Mobile`: Implement `Screen Refs` \| `QA`: Automate `AC-01..n` |

---

## 11. Gate B — Engineering Readiness Appendix (`ENG-01..ENG-10` — Reserved for Engineering `.ai`)
> **Strict Boundary Mandate:** BA MUST leave all rows below at `PENDING_ENG_AUDIT`. Populated exclusively by Engineering Tech Leads / `.ai` architecture workflows when promoting `Gate B: PENDING -> READY_TO_CODE`.

| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| `ENG-01` | Model/Table Binding | `[Model/Table Binding — e.g., Modules/... or src/Domain/Entities/...]` | `PENDING_ENG_AUDIT` |
| `ENG-02` | API Endpoint & Envelope Contract | `[API Endpoint Contract — OpenAPI / Route ref]` | `PENDING_ENG_AUDIT` |
| `ENG-03` | SEED-* & ENUM-* Codebase Mapping | `[SEED/ENUM -> catalog & seeder binding]` | `PENDING_ENG_AUDIT` |
| `ENG-04` | Visual Screen §2 & Lifecycle §3 data-testid Plan | `[Web/Admin component map + data-testid plan]` | `PENDING_ENG_AUDIT` |
| `ENG-05` | ESR Index & N+1 Prevention | `[Index/Perf Check]` | `PENDING_ENG_AUDIT` |
| `ENG-06` | Tenant/IDOR & RBAC Guard | `[Security/IDOR Scope — Policy / Middleware]` | `PENDING_ENG_AUDIT` |
| `ENG-07` | IPDPL/PII Masking | `[PII masking / zero-PII log scrubber binding]` | `PENDING_ENG_AUDIT` |
| `ENG-08` | Archetype Concurrency/Idempotency Strategy | `[Optimistic version check / idempotency key strategy]` | `PENDING_ENG_AUDIT` |
| `ENG-09` | Automated Test File Binding | `[Test File Binding — Pest / Vitest / xUnit / Flutter Test]` | `PENDING_ENG_AUDIT` |
| `ENG-10` | Mobile/QA Handoff Impact | `[02-FLUTTER ENGINE bloc/cubit/route ref or N/A — Web only]` | `PENDING_ENG_AUDIT` |
