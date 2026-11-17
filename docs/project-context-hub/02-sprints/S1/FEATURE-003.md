# `FEATURE-003`: Offering Review Sequence & Pilot Deliverables Workflow (`READ_VIEW`)

| Metadata Field | Canonical Value |
|---|---|
| **Feature ID** | `FEATURE-003` |
| **Title** | Offering Review Sequence & Pilot Deliverables Workflow |
| **Component ID** | `CMP-02` |
| **Epic ID** | `EPC-02` |
| **Target Release** | `REL-01` |
| **Component / Epic** | `CMP-02` / `EPC-02` |
| **Sprint / Wave** | `S1` / `Wave 1` |
| **Archetype** | `READ_VIEW` |
| **Channels** | `Web` |
| **Version** | `v1.0.0` |
| **Gate A Status (BA)** | `READY_FOR_DEV` |
| **Gate B Status (Eng)** | `READY_TO_CODE` |
| **Screen Refs** | `W03 (Offering & Service Details Page)` |
| **Source Story / BRD Refs** | `STR-003-01`, `STR-003-02`, `Website Development Brief §2 Page 2`, `PROJECT_CONTEXT @ v1.0.0` |
| **Semantic Digest (`feature_srd`)** | `SRD-F003-7B2EFEFA77B7` |

---

## 1. Objective, Actors & Scope Boundaries
- **Business Objective:** Clearly detail the proposed quality review service offering on Page 2, rendering a 6-step sequential visual workflow from submission through professional sign-off, cataloging the 6 concrete pilot deliverables, and establishing an unambiguous governance boundary stating that AI does not execute legal, financial, or regulatory approvals.
- **Inherited Global Contracts:** `BR-GLB-001`, `CONV-SHD-001`, `CONV-SHD-002`, `NFR-GLB-001`, `SEED-MAINT-GUEST-BROWSE`.

| Role ID | Channel | Permitted Business Actions | Data Ownership Scope | Denied Outcome |
|---|---|---|---|---|
| `ROLE-GUEST` | `Web` | Inspect 6-step workflow sequence, review pilot deliverable specs, view AI limitation boundaries | Public offering details | State mutations prohibited |
| `ROLE-CUST` | `Web` | Examine pilot deliverables scope, verify acceptance criteria, and navigate to CTA simulation | Public offering details and simulation | Production operational edits denied |
| `ROLE-ADMIN` | `Web` | Audit workflow integrity, deliverable descriptions, and compliance disclosures | Public offering details and governance | Standard session policies apply |

- **In-Scope:** Page 2 Offering details with sequential 6-step review workflow visualization (Submission -> Screening -> Classification -> Routing -> Human Review -> Final Report), 6 proposed pilot deliverables checklist with acceptance criteria, prominent legal/professional approval boundary callout box, and CTA button.
- **Out-of-Scope:** Commercial pricing cards and TCO models (owned by `FEATURE-005`), trust governance and source citations (owned by `FEATURE-006`), and interactive modal submission execution (owned by `FEATURE-007`).

### 1B. User Stories & Release/Sprint Decomposition (`STR-*` -> `TSK-*`)
| Story ID | Story Title | Release Code | Sprint Code | Priority | Linked `AC-*` | Screen Refs | Initial Department Tasks (`TSK-*`) |
|---|---|---|---|---|---|---|---|
| `STR-003-01` | Six-Step Quality Review Sequence Visualization & Decision Gate Flow | `REL-01` | `S1` | `high` | `AC-01`, `AC-05` | `W03` | `TSK-003-01 (FE: 6-step sequence cards)`, `TSK-003-02 (FE: Decision gate visual)`, `TSK-003-03 (QA: Workflow readability)` |
| `STR-003-02` | Proposed Pilot Deliverables List & AI Limitation Boundary Section | `REL-01` | `S1` | `medium` | `AC-02`, `AC-03`, `AC-04` | `W03` | `TSK-003-04 (FE: Deliverables checklist)`, `TSK-003-05 (FE: Boundary disclosure)`, `TSK-003-06 (QA: Citations audit)` |

### 1C. Scope Boundaries & Related Flows
| Boundary Type | Description & Linked `FEATURE-*` IDs | Dependency Kind (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM` / `EXCLUDED`) |
|---|---|---|
| **In-Scope** | Stories `STR-003-01`, `STR-003-02` covering 6-step workflow, pilot deliverable inventory, and AI boundary disclosure. | `OWNED` |
| **Related Flows** | Relies on `FEATURE-001` global web shell; feeds into `FEATURE-005` (commercial packaging) and `FEATURE-007` (CTA modal). | `HARD_PREREQ: FEATURE-001` |
| **Explicitly Out-of-Scope** | Document upload engine, OCR document ingestion, actual human reviewer assignment queues. | `EXCLUDED` |

---

## 2. Visual Screen Decomposition Matrix
| Element ID | Screen Ref | Kind | AR Label | EN Label | Business Source or Exact Calculation Formula | Visibility / Editability Rule |
|---|---|---|---|---|---|---|
| `EL-01` | `W03` | `Header` | `عنوان صفحة تفاصيل الخدمة` | `Offering Page Header & Intro` | Static headline: "The Human-Governed Quality Review Process & Deliverables" | Always visible at top of Page 2 |
| `EL-02` | `W03` | `Step Cards` | `خطوات مسار العمل الستة` | `Six-Step Visual Workflow Sequence` | 6 sequential steps: 1. Submission, 2. Screening, 3. Detection, 4. Routing, 5. Human Review, 6. Final Report | Always visible in ordered numbered sequence |
| `EL-03` | `W03` | `Deliverables List`| `مخرجات المرحلة التجريبية` | `Proposed Pilot Deliverables Cards` | 6 deliverables: Review Checklist, Screening Summary, Exception Register, Decision Log, Sign-off Record, Evaluation Report | Always visible with acceptance criteria badges |
| `EL-04` | `W03` | `Callout Box` | `حدود وحدود مسؤولية الذكاء الاصطناعي`| `AI Non-Approval Boundary Notice` | Explicit callout: "AI assists with exception detection and routing; final legal, financial, and professional approvals remain exclusively with human specialists." | Prominent callout box with warning icon |
| `EL-05` | `W03` | `Badge` | `وسم التصميم المقترح` | `Design Provenance Badge` | Static badge: `STUDENT-PROPOSED DESIGN` | Visible on workflow and deliverables sections |
| `EL-06` | `W03` | `CTA` | `طلب تقييم تجريبي` | `Request a Pilot Assessment` | Primary action button opening simulation modal (`FEATURE-007`) | Always interactive at bottom of page |

---

## 3. UI Lifecycle & Screen States Matrix
| Screen State | Trigger Condition | Exact Visual & Data Behavior | Primary CTA State | `AR / EN` Message Key |
|---|---|---|---|---|
| **Loading** | Initial navigation to Offering page | Render step card skeletons and deliverable item shimmers | `EL-06` disabled | `COPY-W03-LOADING` |
| **Empty State** | Zero workflow steps returned | Render placeholder noting process steps are currently undergoing review | `EL-06` enabled | `COPY-W03-EMPTY` |
| **Single-Item / Edge State** | Focused inspection of single workflow step modal/drawer | Highlight selected step details with input/output criteria displayed | `EL-06` enabled | `COPY-W03-SINGLE` |
| **Populated / Normal** | Complete page markup and assets loaded | Full ordered sequence of 6 steps, 6 pilot deliverables, and AI boundary callout rendered | `EL-06` enabled | `COPY-W03-NORMAL` |
| **Disabled / Locked** | Offline device connectivity | Display cached workflow sequence with offline status banner | `EL-06` disabled | `COPY-W03-DISABLED` |
| **Error / Retry** | Rendering failure or DOM exception | Clean fallback layout rendering numbered plain text list with retry button | `EL-06` enabled | `COPY-W03-ERROR` |

---

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Deterministic Condition & Formula | Bound `SEED-*` / `ENUM-*` | Violation / Edge Outcome | Source Ref |
|---|---|---|---|---|
| `BR-FEAT-003-01` | The 6 service steps must render in strict sequential numerical order (1 through 6) with no reordering | `CONV-SHD-001` | Non-sequential rendering violates specification audit | `Brief §2 Page 2` |
| `BR-FEAT-003-02` | All 6 proposed pilot deliverables must include clear acceptance criteria and deliverable summaries | `CONV-SHD-001` | Incomplete deliverable cards rejected during QA review | `Brief §2 Page 2` |
| `BR-FEAT-003-03` | Professional approval boundary section (`EL-04`) must explicitly negate automated final legal/financial sign-off | `CONV-SHD-001` | Missing boundary callout constitutes a critical compliance defect | `Brief §2 Page 2` |

### 4B. Functional Requirements (`FR-*` — one per Story, traced both ways to `AC-*`)
| FR ID | Requirement (Observable System Behavior) | Source Story (`STR-*`) | Linked Rules (`BR-*`) | Covered By (`AC-*`) |
|---|---|---|---|---|
| `FR-01` | Render 6-step sequential review workflow visualization highlighting human decision gate | `STR-003-01` | `BR-FEAT-003-01` | `AC-01`, `AC-05` |
| `FR-02` | Present proposed pilot deliverables inventory and professional approval boundary disclosure | `STR-003-02` | `BR-FEAT-003-02`, `BR-FEAT-003-03` | `AC-02`, `AC-03`, `AC-04` |

---

## 5. Archetype Operational Contract

### Sub-block 5A — `READ_VIEW` Query, Counter & Visibility Contract
| Concern | Deterministic Specification | Bound `SEED-*` / `ENUM-*` |
|---|---|---|
| **Actor / Tenant Visibility Scope** | Public read access for all visitors (`ROLE-GUEST`, `ROLE-CUST`, `ROLE-ADMIN`) | `SEED-MAINT-GUEST-BROWSE` |
| **Search Behavior** | In-page section linking and anchor navigation between steps and deliverables | `SEED-SEARCH-MIN-CHARS` |
| **Query Filters** | Step selection highlights corresponding input and output artifacts | `CONV-SHD-001` |
| **Default Sort** | Chronological workflow execution order (Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6) | `CONV-SHD-001` |
| **Pagination** | Single responsive page layout; zero pagination needed | `SEED-LIST-PAGE-ADMIN` |
| **Derived Counters** | 6 Workflow Steps, 6 Proposed Pilot Deliverables, 1 Governance Boundary Callout | `CONV-SHD-001` |

### Sub-block 5B — `MUTATION_WORKFLOW` Contract
`OMITTED — Pure READ_VIEW Archetype (zero state mutations or write payloads).`

---

## 6. Split Edge-Case, Resilience & Mobile Matrix

### 6A. Domain Business Edge Cases (`DOM-01..02`)
| Case ID | Domain Boundary Scenario | Trigger / Condition | Expected Authoritative Business Outcome | Linked `AC-*` |
|---|---|---|---|---|
| `DOM-01` | User inspects Step 5 (Human Review) seeking automated override options | User clicks step detail | Clear notice appears confirming human review cannot be bypassed or automated | `AC-02` |
| `DOM-02` | Mobile screen renders horizontal step connectors | Viewport width < 768px | Connectors transition from horizontal arrows to vertical connecting timeline | `AC-01` |

### 6B. Resilience & Mobile Contract (`SCN-01..06` & `MB-01..15`)
| Scenario ID | Concern | Applicability (`Applicable` / `N/A — Reason`) | User-Visible Authoritative Outcome & Safe Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `SCN-01` | Duplicate Action / Double Tap | N/A — Pure READ_VIEW (no mutation) | Step cards are informational; repetitive taps have zero destructive side effects. | — |
| `SCN-02` | Timeout / Uncertain Result | `Applicable` | If step diagram icons time out, clean CSS fallback numbers render immediately. | `AC-06` |
| `SCN-03` | Offline / App Kill / Resume | `Applicable` | Offering steps and deliverables remain fully cached and readable offline. | `AC-07` |
| `SCN-04` | Concurrent State Modification | N/A — Pure READ_VIEW (no mutation) | Static service descriptions do not mutate during user browsing sessions. | — |
| `SCN-05` | Cancel / Back / Abandon Mid-Flow | N/A — Pure READ_VIEW (no mutation) | Browser back navigation returns smoothly to Home without history distortion. | — |
| `SCN-06` | Permission / Auth Revoked Mid-Flow | `Applicable` | Offering page is fully public; zero session gating or login barriers. | `AC-08` |

- **`MB-01..MB-15` Contract Note:** Web microsite interface satisfies responsive mobile constraints (`MB-12A` Push: N/A web-only; `MB-12B` Deep Links: supported to `#workflow` and `#deliverables`).

---

## 7. Bilingual Business Copy & Badges Table (`AR / EN`)
| Copy Key | Context | Arabic Text (`AR`) | English Text (`EN`) |
|---|---|---|---|
| `COPY-W03-HEADER` | `Header` | `مسار عمل مراجعة الجودة ومخرجات البرنامج التجريبي` | `The Human-Governed Quality Review Process & Deliverables` |
| `COPY-W03-SUBHEADER` | `Header` | `تسلسل متكامل من ست مراحل يجمع بين دقة الأتمتة ومسؤولية الخبير البشري.` | `An integrated six-stage sequence combining automated precision with specialized human accountability.` |
| `COPY-W03-STEP1` | `Step` | `1. استلام الوثائق المعتمدة من العميل` | `1. Customer-Approved Document Submission` |
| `COPY-W03-STEP2` | `Step` | `2. الفحص الآلي لقوائم التحقق` | `2. Automated Checklist Screening` |
| `COPY-W03-STEP3` | `Step` | `3. اكتشاف وتصنيف الاستثناءات` | `3. Exception Detection & Classification` |
| `COPY-W03-STEP4` | `Step` | `4. توجيه الحالات للمراجع البشري المؤهل` | `4. Routing to Qualified Human Reviewer` |
| `COPY-W03-STEP5` | `Step` | `5. المراجعة البشرية والتصحيح والاعتماد المهني` | `5. Human Review, Correction & Professional Approval` |
| `COPY-W03-STEP6` | `Step` | `6. تقرير المراجعة النهائي وملخص التقييم` | `6. Final Review Report & Evaluation Summary` |
| `COPY-W03-BOUNDARY` | `Callout` | `الذكاء الاصطناعي لا يتخذ القرارات النهائية القانونية أو المالية أو التنظيمية.` | `AI does not make final legal, financial, regulatory, or professional approval decisions. All sign-offs remain strictly human.` |
| `COPY-W03-BADGE-DESIGN` | `Badge` | `تصميم مقترح من قبل الطالب` | `STUDENT-PROPOSED DESIGN` |
| `COPY-W03-LOADING` | `Loading` | `جاري تحميل خطوات مسار العمل والمخرجات...` | `Loading workflow steps and deliverables...` |
| `COPY-W03-EMPTY` | `Empty` | `لا توجد خطوات متاحة حالياً` | `No steps currently available` |
| `COPY-W03-SINGLE` | `Single` | `تفاصيل مرحلة العمل المحددة` | `Selected workflow step details` |
| `COPY-W03-NORMAL` | `Normal` | `تم تحميل مسار العمل والمخرجات بنجاح` | `Workflow and deliverables loaded successfully` |
| `COPY-W03-DISABLED` | `Disabled` | `عرض غير متصل بالإنترنت` | `Offline display` |
| `COPY-W03-ERROR` | `Error` | `تعذر تحميل عناصر مسار العمل، يرجى إعادة المحاولة` | `Unable to load workflow elements. Please retry.` |

---

## 8. Deterministic Acceptance Criteria (`AC-01..08`)
| AC ID | Traced IDs | Screen Ref | Given | When | Then |
|---|---|---|---|---|---|
| `AC-01` | `BR-FEAT-003-01`, `FR-01` | `W03` | Visitor opens Offering & Service Details page | Section renders | All 6 sequential steps render in exact numerical order (1 through 6) with distinct step cards |
| `AC-02` | `BR-FEAT-003-03`, `FR-02`, `DOM-01` | `W03` | Visitor scrolls to AI boundary section | Callout renders | Explicit notice states AI does not make final legal/financial decisions, styled in high-visibility warning box |
| `AC-03` | `BR-FEAT-003-02`, `FR-02` | `W03` | Visitor inspects proposed pilot deliverables | Section renders | Exactly 6 pilot deliverable cards appear with acceptance criteria and delivery formats detailed |
| `AC-04` | `FR-02` | `W03` | Visitor views provenance badging | Section renders | Workflow and deliverables carry the `STUDENT-PROPOSED DESIGN` evidence taxonomy label badge |
| `AC-05` | `FR-01` | `W03` | Visitor clicks "Request a Pilot Assessment" CTA | Button clicked | Pilot assessment simulation modal opens cleanly without page refresh |
| `AC-06` | `SCN-02` | `W03` | Network delays custom icon rendering | Page loads | Fallback CSS step badges render with zero missing content |
| `AC-07` | `SCN-03` | `W03` | Device loses network connection | Page browsed | Cached workflow steps and deliverables remain fully readable |
| `AC-08` | `SCN-06` | `W03` | Visitor accesses offering details | Anonymous visitor | Zero authentication barrier or registration prompt is displayed |

---

## 9. Gate A — BA Sealing Scorecard (`BA-01..BA-14`)

### 9.1 Key Business Decisions Snapshot (`D-01..D-n`)
| Decision ID | Provenance Tag (`PROJECT_CONTEXT` / `BA_ANSWERED` / `LOGICALLY_ENTAILED` / `ESTABLISHED_CONVENTION` / `PROPOSED_DEFAULT`) | Approved Decision & Bound `SEED-*` / `BR-*` | Reference & Authority |
|---|---|---|---|
| `D-01` | `LOGICALLY_ENTAILED` | `BR-FEAT-003-01` — Strict 6-step sequential review workflow visualization | `Brief §2 Page 2`, `BR-FEAT-003-01` |
| `D-02` | `LOGICALLY_ENTAILED` | `BR-FEAT-003-02` — Concrete 6-item pilot deliverable catalog with acceptance criteria | `Brief §2 Page 2`, `BR-FEAT-003-02` |
| `D-03` | `LOGICALLY_ENTAILED` | `BR-FEAT-003-03` — Strict disclaimer that AI never executes final professional sign-offs | `Brief §2 Page 2`, `BR-FEAT-003-03` |
| `D-04` | `PROPOSED_DEFAULT` | Standard `READ_VIEW` resilience outcomes `SCN-01..06` applied for workflow inspection | `SCN-01..06`, `AC-05..08` |

**Snapshot Approval:** `APPROVED` (`BA Lead — 2026-11-17`)

### 9.2 Canonical 14-Check Audit Table
- **Decisions Snapshot (`D-01..D-04`):** Approved by `BA Lead (2026-11-17)`.
- **Audit Summary (`BA-01..BA-14`):** `BA-01..08 = PASS`, `BA-09 = N/A (Pure READ_VIEW without mutation form)`, `BA-10..13 = PASS`, `BA-14 = N/A (v1.0.0 baseline)`.
- **Score:** `P = 12 | F = 0 | U = 0 | N = 2 | VALID = round(100 * 12 / (14 - 2), 1) = 100.0%` -> **Gate A: `READY_FOR_DEV`**.

### 9.3 Ownership Routing (Non-BA Handoff Notes — never asked of the BA)
| Dependency ID | Owner (`BACKEND_OWNED` / `SHARED_MOBILE` / `SHARED_WEB` / `DESIGN_OWNED`) | Handoff Note / Technical Requirement | Status (`Open` / `Done` / `Reused`) |
|---|---|---|---|
| `DEP-01` | `DESIGN_OWNED` | Provide responsive vertical/horizontal timeline CSS components for the 6 steps | `Done` |
| `DEP-02` | `SHARED_WEB` | Implement accessible expandable cards for pilot deliverable acceptance criteria | `Done` |
| `DEP-03` | `SHARED_WEB` | Style high-visibility warning callout box for the AI approval boundary notice | `Done` |

---

## 10. Feature Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA` / `PM` / `Dev` / `Mobile` / `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-17` | Initial Baseline Seal | `ALL` | Pre-baseline draft | Sealed `READY_FOR_DEV` (`VALID = 100.0%`) | `BA`: Baseline locked \| `PM`: Schedule S1 implementation \| `Dev`: Build 6-step timeline and deliverables \| `Mobile`: Test mobile vertical timeline \| `QA`: Verify deliverable checklist criteria |

---

## 11. Gate B — Engineering Readiness Appendix (`ENG-01..ENG-10` — Reserved for Engineering `.ai`)

> **Gate B Status:** `READY_TO_CODE` | **Verified `feature_srd`:** `6a775a18221eae66ae7dba28747ebc2445463ea0e2af46ebc22e251dd05625c3` | **Sealed At:** `2026-11-17T10:45:56.875Z`
| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| `ENG-01` | Model/Table Binding | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-003)` | `PASS` |
| `ENG-02` | API Endpoint & Envelope Contract | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-003)` | `PASS` |
| `ENG-03` | SEED-* & ENUM-* Codebase Mapping | `SEED-MAINT-GUEST-BROWSE, SEED-SEARCH-MIN-CHARS, SEED-LIST-PAGE-ADMIN mapped to catalog & seeder` | `PASS` |
| `ENG-04` | Visual Screen §2 & Lifecycle §3 data-testid Plan | `UI Spec §2 (6 elements): data-testid="feature-003-el-01", data-testid="feature-003-el-02", data-testid="feature-003-el-03", data-testid="feature-003-el-04", data-testid="feature-003-el-05", data-testid="feature-003-el-06" / §3 States (6): data-testid="feature-003-state-loading", data-testid="feature-003-state-empty", data-testid="feature-003-state-single-item", data-testid="feature-003-state-populated", data-testid="feature-003-state-disabled", data-testid="feature-003-state-error"` | `PASS` |
| `ENG-05` | ESR Index & N+1 Prevention | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-003)` | `PASS` |
| `ENG-06` | Tenant/IDOR & RBAC Guard | `RBAC Role-Matrix & Tenant 404 IDOR Guard (SEC-034, SEC-036, SEC-037)` | `PASS` |
| `ENG-07` | IPDPL/PII Masking | `Tier-1/2 PII Masking & Zero-PII Log Scrubber (SEC-048, SEC-148)` | `PASS` |
| `ENG-08` | Archetype Concurrency/Idempotency Strategy | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-003)` | `PASS` |
| `ENG-09` | Automated Test File Binding | `Horizontal/Vertical Negative Security & Role-Matrix Tests (SEC-164, SEC-170)` | `PASS` |
| `ENG-10` | Mobile/QA Handoff Impact | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-003)` | `PASS` |
