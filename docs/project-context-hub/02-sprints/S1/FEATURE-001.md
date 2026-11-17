# `FEATURE-001`: Global Microsite Architecture, Navigation & Design System (`READ_VIEW`)

| Metadata Field | Canonical Value |
|---|---|
| **Feature ID** | `FEATURE-001` |
| **Title** | Global Microsite Architecture, Navigation & Design System |
| **Component ID** | `CMP-01` |
| **Epic ID** | `EPC-01` |
| **Target Release** | `REL-01` |
| **Component / Epic** | `CMP-01` / `EPC-01` |
| **Sprint / Wave** | `S1` / `Wave 1` |
| **Archetype** | `READ_VIEW` |
| **Channels** | `Web` |
| **Version** | `v1.0.0` |
| **Gate A Status (BA)** | `READY_FOR_DEV` |
| **Gate B Status (Eng)** | `READY_TO_CODE` |
| **Screen Refs** | `W01 (Global Web Shell & Layout)` |
| **Source Story / BRD Refs** | `STR-001-01`, `STR-001-02`, `Website Development Brief §2, §7, §9`, `PROJECT_CONTEXT @ v1.0.0` |
| **Semantic Digest (`feature_srd`)** | `SRD-F001-7664AEEC0434` |

---

## 1. Objective, Actors & Scope Boundaries
- **Business Objective:** Provide a unified, responsive corporate microsite shell adhering to IBM-style enterprise visual aesthetics (blue, white, and grey palette) with clear four-page navigation, accessible responsive typography, and persistent academic capstone governance disclosures.
- **Inherited Global Contracts:** `BR-GLB-001`, `CONV-SHD-001`, `CONV-SHD-002`, `NFR-GLB-001`, `SEED-MAINT-GUEST-BROWSE`.

| Role ID | Channel | Permitted Business Actions | Data Ownership Scope | Denied Outcome |
|---|---|---|---|---|
| `ROLE-GUEST` | `Web` | Browse public pages, switch pages via header navbar, view footer academic disclaimers | Public corporate information only | Zero mutation access |
| `ROLE-CUST` | `Web` | Browse all 4 pages, view pilot evaluation terms, trigger pilot assessment CTA demonstration | Public corporate information and simulation data | Zero production administrative configuration |
| `ROLE-ADMIN` | `Web` | Inspect full layout and governance components across all viewports | Public corporate information and governance views | Standard session policies apply |

- **In-Scope:** Semantic HTML5 page structure, CSS3 responsive grid and flexbox styling, primary top navigation bar linking all 4 pages (Home, Offering, Pricing, Trust/Governance), persistent footer with mandatory Nexford University MBA Capstone academic disclaimer, and academic resource links shell.
- **Out-of-Scope:** Content-heavy service details (owned by `FEATURE-002`, `FEATURE-003`), commercial TCO tables (owned by `FEATURE-005`), and modal demonstration form logic (owned by `FEATURE-007`).

### 1B. User Stories & Release/Sprint Decomposition (`STR-*` -> `TSK-*`)
| Story ID | Story Title | Release Code | Sprint Code | Priority | Linked `AC-*` | Screen Refs | Initial Department Tasks (`TSK-*`) |
|---|---|---|---|---|---|---|---|
| `STR-001-01` | Responsive Layout, Color Tokens and Global Header/Footer Navigation | `REL-01` | `S1` | `critical` | `AC-01`, `AC-03`, `AC-05` | `W01` | `TSK-001-01 (FE: HTML5/CSS3 tokens)`, `TSK-001-02 (FE: Navigation & footer)`, `TSK-001-03 (QA: Cross-browser responsive)` |
| `STR-001-02` | Academic Disclaimer Banner and Accessibility Baseline Navigation | `REL-01` | `S1` | `high` | `AC-02`, `AC-04` | `W01` | `TSK-001-04 (FE: Academic disclaimer)`, `TSK-001-05 (QA: Accessibility & keyboard nav)` |

### 1C. Scope Boundaries & Related Flows
| Boundary Type | Description & Linked `FEATURE-*` IDs | Dependency Kind (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM` / `EXCLUDED`) |
|---|---|---|
| **In-Scope** | Stories `STR-001-01`, `STR-001-02` defining base web shell, navigation, and persistent footer. | `OWNED` |
| **Related Flows** | Provides the host layout shell for `FEATURE-002` (Home Page) and `FEATURE-003` (Offering Page). | `IN_FLOW` |
| **Explicitly Out-of-Scope** | Backend API persistence, CMS database models, user account registration. | `EXCLUDED` |

---

## 2. Visual Screen Decomposition Matrix
| Element ID | Screen Ref | Kind | AR Label | EN Label | Business Source or Exact Calculation Formula | Visibility / Editability Rule |
|---|---|---|---|---|---|---|
| `EL-01` | `W01` | `Brand Header` | `شعار وآي بي إم كونسلتينج V2` | `Brand Logo & Title` | Static brand mark: "IBM Consulting V2 — Human-Governed Quality Review" | Read-only corporate header; links to Home (`/`) |
| `EL-02` | `W01` | `Navbar` | `شريط التنقل الرئيسي` | `Primary Navigation Bar` | Array of 4 navigation links: Home (`/`), Offering (`/offering`), Pricing (`/pricing`), Trust & Governance (`/trust`) | Always visible on desktop; collapsible drawer on mobile |
| `EL-03` | `W01` | `CTA` | `طلب تقييم تجريبي` | `Request a Pilot Assessment` | Primary CTA button; triggers demonstration simulation modal (`FEATURE-007`) | Always visible in header and page hero sections |
| `EL-04` | `W01` | `Footer Disclaimer` | `إخلاء المسؤولية الأكاديمية` | `Academic Disclaimer Notice` | Static text per Brief §9: "Student-developed academic concept. Prepared by Ibrahem Soliman Yousef Soliman Zahr for Nexford University MBA Capstone." | Always visible across all 4 page footers |
| `EL-05` | `W01` | `Footer Resources` | `الموارد الأكاديمية` | `Academic Resources Area` | Links to Research Appendix PDF and Master Excel Model with status badges | Visible in footer; displays pending validation badges |
| `EL-06` | `W01` | `Viewport Container` | `حاوية العرض المستجيبة` | `Responsive Viewport Container` | Max-width 1280px centered container with responsive gutter padding (16px mobile, 32px desktop) | Dynamic layout container across all viewports |

---

## 3. UI Lifecycle & Screen States Matrix
| Screen State | Trigger Condition | Exact Visual & Data Behavior | Primary CTA State | `AR / EN` Message Key |
|---|---|---|---|---|
| **Loading** | Initial page load or asset fetch | Render brand header skeleton and neutral background shimmer | `EL-03` disabled | `COPY-W01-LOADING` |
| **Empty State** | Content section has zero sub-elements loaded | Render fallback brand placeholder with navigation intact | `EL-03` enabled | `COPY-W01-EMPTY` |
| **Single-Item / Edge State** | Viewing standalone legal disclaimer or isolated footer route | Center single content card with full navigation header and footer retained | `EL-03` enabled | `COPY-W01-SINGLE` |
| **Populated / Normal** | Complete page markup and assets loaded | Full enterprise corporate microsite shell rendered with high-contrast typography | `EL-03` enabled | `COPY-W01-NORMAL` |
| **Disabled / Locked** | Offline connection or static asset failure | Display static fallback layout with navigation and offline notification toast | `EL-03` disabled | `COPY-W01-DISABLED` |
| **Error / Retry** | Critical stylesheet or font load error | Fallback to accessible system fonts and high-contrast styling with reload option | `EL-03` enabled | `COPY-W01-ERROR` |

---

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Deterministic Condition & Formula | Bound `SEED-*` / `ENUM-*` | Violation / Edge Outcome | Source Ref |
|---|---|---|---|---|
| `BR-FEAT-001-01` | All unauthenticated visitors (`ROLE-GUEST`) have full read access to all 4 pages without authentication barriers | `SEED-MAINT-GUEST-BROWSE` | Zero login wall or credential gating permitted on any page | `Brief §1`, `BRD §2.1` |
| `BR-FEAT-001-02` | Academic disclaimer (`EL-04`) must render verbatim on every page without truncation or removal | `CONV-SHD-001` | Page layout rejected in QA audit if disclaimer text is missing | `Brief §9` |
| `BR-FEAT-001-03` | Navigation active state must update deterministically based on current route path | `CONV-SHD-001` | Exactly one navigation item carries `active` attribute at any time | `Brief §2` |

### 4B. Functional Requirements (`FR-*` — one per Story, traced both ways to `AC-*`)
| FR ID | Requirement (Observable System Behavior) | Source Story (`STR-*`) | Linked Rules (`BR-*`) | Covered By (`AC-*`) |
|---|---|---|---|---|
| `FR-01` | Deliver responsive corporate layout shell with 4-page navigation bar, brand styling, and CTA button | `STR-001-01` | `BR-FEAT-001-01`, `BR-FEAT-001-03` | `AC-01`, `AC-03`, `AC-05` |
| `FR-02` | Render persistent academic governance disclaimer and accessible resource links across all footers | `STR-001-02` | `BR-FEAT-001-02` | `AC-02`, `AC-04` |

---

## 5. Archetype Operational Contract

### Sub-block 5A — `READ_VIEW` Query, Counter & Visibility Contract
| Concern | Deterministic Specification | Bound `SEED-*` / `ENUM-*` |
|---|---|---|
| **Actor / Tenant Visibility Scope** | Public read-only access for all actors (`ROLE-GUEST`, `ROLE-CUST`, `ROLE-ADMIN`) | `SEED-MAINT-GUEST-BROWSE` |
| **Search Behavior** | Client-side in-page section scrolling and navigation linking | `SEED-SEARCH-MIN-CHARS` |
| **Query Filters** | Route-based page selection across 4 independent URLs | `CONV-SHD-001` |
| **Default Sort** | Deterministic top-to-bottom reading sequence per Brief specifications | `CONV-SHD-001` |
| **Pagination** | Static multi-page architecture; zero pagination needed for global shell | `SEED-LIST-PAGE-ADMIN` |
| **Derived Counters** | Total pages count: `4` active independent pages | `CONV-SHD-001` |

### Sub-block 5B — `MUTATION_WORKFLOW` Contract
`OMITTED — Pure READ_VIEW Archetype (zero state mutations or write payloads).`

---

## 6. Split Edge-Case, Resilience & Mobile Matrix

### 6A. Domain Business Edge Cases (`DOM-01..02`)
| Case ID | Domain Boundary Scenario | Trigger / Condition | Expected Authoritative Business Outcome | Linked `AC-*` |
|---|---|---|---|---|
| `DOM-01` | User attempts direct navigation to non-existent sub-route | User types unknown URL path (e.g. `/unknown`) | Render 404 corporate fallback view with link back to Home (`/`) | `AC-04` |
| `DOM-02` | User resizes viewport from 1920px desktop to 360px mobile | Dynamic window resize or mobile orientation switch | Navigation collapses into accessible hamburger menu without horizontal scroll | `AC-01` |

### 6B. Resilience & Mobile Contract (`SCN-01..06` & `MB-01..15`)
| Scenario ID | Concern | Applicability (`Applicable` / `N/A — Reason`) | User-Visible Authoritative Outcome & Safe Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `SCN-01` | Duplicate Action / Double Tap | N/A — Pure READ_VIEW (no mutation) | Navigation links are idempotent; multiple clicks navigate to same destination without duplicate requests. | — |
| `SCN-02` | Timeout / Uncertain Result | `Applicable` | If external fonts or stylesheets time out, system fallback fonts render immediately (`COPY-W01-ERROR`). | `AC-06` |
| `SCN-03` | Offline / App Kill / Resume | `Applicable` | Client cached assets allow browsing loaded pages offline; status bar indicates offline state. | `AC-07` |
| `SCN-04` | Concurrent State Modification | N/A — Pure READ_VIEW (no mutation) | Client-side read views have zero mutable shared state. | — |
| `SCN-05` | Cancel / Back / Abandon Mid-Flow | N/A — Pure READ_VIEW (no mutation) | Browser back button restores previous page state cleanly without history corruption. | — |
| `SCN-06` | Permission / Auth Revoked Mid-Flow | `Applicable` | All pages are public; session revocation defaults safely to guest view without data leakage. | `AC-08` |

- **`MB-01..MB-15` Contract Note:** Web microsite interface satisfies responsive mobile constraints (`MB-12A` Push: N/A web-only; `MB-12B` Deep Links: standard URL routing supported across mobile browsers).

---

## 7. Bilingual Business Copy & Badges Table (`AR / EN`)
| Copy Key | Context | Arabic Text (`AR`) | English Text (`EN`) |
|---|---|---|---|
| `COPY-W01-TITLE` | `Brand` | `آي بي إم كونسلتينج V2 — مراجعة الجودة بإشراف بشري` | `IBM Consulting V2 — Human-Governed Quality Review` |
| `COPY-W01-NAV-HOME` | `Navigation` | `الرئيسية` | `Home` |
| `COPY-W01-NAV-OFFERING` | `Navigation` | `تفاصيل الخدمة` | `Offering` |
| `COPY-W01-NAV-PRICING` | `Navigation` | `التسعير ونموذج التكلفة` | `Pricing` |
| `COPY-W01-NAV-GOVERNANCE` | `Navigation` | `الحوكمة والموثوقية` | `Trust & Governance` |
| `COPY-W01-CTA` | `Button` | `طلب تقييم تجريبي` | `Request a Pilot Assessment` |
| `COPY-W01-DISCLAIMER` | `Footer` | `مفهوم أكاديمي مطور من قبل طالب لأغراض التقييم. ليس عرضاً رسمياً من شركة IBM.` | `Student-developed academic concept. This is a proposed V2 service model for evaluation purposes and is not an official IBM offering or commitment. Prepared by Ibrahem Soliman Yousef Soliman Zahr for Nexford University MBA Capstone.` |
| `COPY-W01-LOADING` | `Loading` | `جاري تحميل الصفحة...` | `Loading page...` |
| `COPY-W01-EMPTY` | `Empty` | `لا يوجد محتوى للعرض` | `No content to display` |
| `COPY-W01-SINGLE` | `Single` | `عرض مستقل` | `Standalone view` |
| `COPY-W01-NORMAL` | `Normal` | `تم تحميل المحتوى بنجاح` | `Content loaded successfully` |
| `COPY-W01-DISABLED` | `Disabled` | `الوضع غير متصل بالإنترنت` | `Offline mode` |
| `COPY-W01-ERROR` | `Error` | `تعذر تحميل بعض الموارد، يرجى إعادة المحاولة` | `Unable to load some resources. Please retry.` |

---

## 8. Deterministic Acceptance Criteria (`AC-01..08`)
| AC ID | Traced IDs | Screen Ref | Given | When | Then |
|---|---|---|---|---|---|
| `AC-01` | `BR-FEAT-001-01`, `FR-01`, `DOM-02` | `W01` | Visitor accesses site on desktop (1280px) or mobile (375px) | Page renders | Navigation bar displays all 4 page links, palette adheres to IBM blue/white/grey tokens, mobile shows responsive hamburger menu |
| `AC-02` | `BR-FEAT-001-02`, `FR-02` | `W01` | Visitor navigates to any of the 4 independent pages | Visitor scrolls to footer | Exact academic disclaimer text mentioning Nexford University MBA Capstone is visibly rendered |
| `AC-03` | `BR-FEAT-001-03`, `FR-01` | `W01` | Visitor clicks "Offering" link in navigation header | Route transition occurs | Offering page loads, active class is applied to Offering nav link, other links lose active state |
| `AC-04` | `DOM-01`, `FR-02` | `W01` | Visitor enters unknown URL sub-path | Server or router evaluates route | Clean 404 page is displayed with persistent header and footer, allowing return to Home |
| `AC-05` | `SCN-02`, `FR-01` | `W01` | Network conditions cause slow stylesheet load | Page renders | Fallback typography renders legibly without content jumping; interactive elements remain accessible |
| `AC-06` | `SCN-02` | `W01` | Resource load times out | Page fails to fetch external assets | `COPY-W01-ERROR` is surfaced with functional retry control |
| `AC-07` | `SCN-03` | `W01` | User returns to tab after device sleep | Browser wakes up | State is re-synchronized with zero ghost layout errors |
| `AC-08` | `SCN-06` | `W01` | User accesses public web shell | Anonymous or authenticated session | Zero private data is leaked; public navigation renders cleanly |

---

## 9. Gate A — BA Sealing Scorecard (`BA-01..BA-14`)

### 9.1 Key Business Decisions Snapshot (`D-01..D-n`)
| Decision ID | Provenance Tag (`PROJECT_CONTEXT` / `BA_ANSWERED` / `LOGICALLY_ENTAILED` / `ESTABLISHED_CONVENTION` / `PROPOSED_DEFAULT`) | Approved Decision & Bound `SEED-*` / `BR-*` | Reference & Authority |
|---|---|---|---|
| `D-01` | `LOGICALLY_ENTAILED` | `BR-FEAT-001-01` — Four-page static microsite architecture with zero mandatory login gates | `Brief §2`, `BR-FEAT-001-01` |
| `D-02` | `LOGICALLY_ENTAILED` | `BR-FEAT-001-02` — Verbatim Nexford MBA Capstone disclaimer in all page footers | `Brief §9`, `BR-FEAT-001-02` |
| `D-03` | `ESTABLISHED_CONVENTION` | IBM Carbon-inspired color palette (corporate blue, cool white, neutral grey) | `Brief §7`, `CONV-SHD-001` |
| `D-04` | `PROPOSED_DEFAULT` | Standard `READ_VIEW` resilience outcomes `SCN-01..06` applied for client-side navigation | `SCN-01..06`, `AC-05..08` |

**Snapshot Approval:** `APPROVED` (`BA Lead — 2026-11-17`)

### 9.2 Canonical 14-Check Audit Table
- **Decisions Snapshot (`D-01..D-04`):** Approved by `BA Lead (2026-11-17)`.
- **Audit Summary (`BA-01..BA-14`):** `BA-01..08 = PASS`, `BA-09 = N/A (Pure READ_VIEW without mutation form)`, `BA-10..13 = PASS`, `BA-14 = N/A (v1.0.0 baseline)`.
- **Score:** `P = 12 | F = 0 | U = 0 | N = 2 | VALID = round(100 * 12 / (14 - 2), 1) = 100.0%` -> **Gate A: `READY_FOR_DEV`**.

### 9.3 Ownership Routing (Non-BA Handoff Notes — never asked of the BA)
| Dependency ID | Owner (`BACKEND_OWNED` / `SHARED_MOBILE` / `SHARED_WEB` / `DESIGN_OWNED`) | Handoff Note / Technical Requirement | Status (`Open` / `Done` / `Reused`) |
|---|---|---|---|
| `DEP-01` | `SHARED_WEB` | Provide shared HTML5 boilerplate, CSS design tokens, and modular header/footer components | `Done` |
| `DEP-02` | `DESIGN_OWNED` | Provide IBM blue palette variables (`--cds-blue-60`, `--cds-gray-10`, `--cds-gray-100`) | `Done` |
| `DEP-03` | `SHARED_WEB` | Bind route-change event listeners to update navigation active indicators | `Done` |

---

## 10. Feature Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA` / `PM` / `Dev` / `Mobile` / `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-17` | Initial Baseline Seal | `ALL` | Pre-baseline draft | Sealed `READY_FOR_DEV` (`VALID = 100.0%`) | `BA`: Baseline locked \| `PM`: Schedule S1 implementation \| `Dev`: Build layout shell \| `Mobile`: Test mobile web responsiveness \| `QA`: Verify cross-browser compliance |

---

## 11. Gate B — Engineering Readiness Appendix (`ENG-01..ENG-10` — Reserved for Engineering `.ai`)

> **Gate B Status:** `READY_TO_CODE` | **Verified `feature_srd`:** `f938adcc4f106d6c8d15ee1baf8ba819a7d3f0467448059a977a770d2a0cc90b` | **Sealed At:** `2026-11-17T10:45:56.859Z`
| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| `ENG-01` | Model/Table Binding | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-001)` | `PASS` |
| `ENG-02` | API Endpoint & Envelope Contract | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-001)` | `PASS` |
| `ENG-03` | SEED-* & ENUM-* Codebase Mapping | `SEED-MAINT-GUEST-BROWSE, SEED-SEARCH-MIN-CHARS, SEED-LIST-PAGE-ADMIN mapped to catalog & seeder` | `PASS` |
| `ENG-04` | Visual Screen §2 & Lifecycle §3 data-testid Plan | `UI Spec §2 (6 elements): data-testid="feature-001-el-01", data-testid="feature-001-el-02", data-testid="feature-001-el-03", data-testid="feature-001-el-04", data-testid="feature-001-el-05", data-testid="feature-001-el-06" / §3 States (6): data-testid="feature-001-state-loading", data-testid="feature-001-state-empty", data-testid="feature-001-state-single-item", data-testid="feature-001-state-populated", data-testid="feature-001-state-disabled", data-testid="feature-001-state-error"` | `PASS` |
| `ENG-05` | ESR Index & N+1 Prevention | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-001)` | `PASS` |
| `ENG-06` | Tenant/IDOR & RBAC Guard | `RBAC Role-Matrix & Tenant 404 IDOR Guard (SEC-034, SEC-036, SEC-037)` | `PASS` |
| `ENG-07` | IPDPL/PII Masking | `Tier-1/2 PII Masking & Zero-PII Log Scrubber (SEC-048, SEC-148)` | `PASS` |
| `ENG-08` | Archetype Concurrency/Idempotency Strategy | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-001)` | `PASS` |
| `ENG-09` | Automated Test File Binding | `Horizontal/Vertical Negative Security & Role-Matrix Tests (SEC-164, SEC-170)` | `PASS` |
| `ENG-10` | Mobile/QA Handoff Impact | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-001)` | `PASS` |
