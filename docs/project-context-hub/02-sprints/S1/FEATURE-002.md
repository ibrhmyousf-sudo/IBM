# `FEATURE-002`: Home Value Proposition & SEC-Verified Financial Metrics (`READ_VIEW`)

| Metadata Field | Canonical Value |
|---|---|
| **Feature ID** | `FEATURE-002` |
| **Title** | Home Value Proposition & SEC-Verified Financial Metrics |
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
| **Screen Refs** | `W02 (Home Value Proposition Page)` |
| **Source Story / BRD Refs** | `STR-002-01`, `STR-002-02`, `Website Development Brief §2 Page 1, §3`, `PROJECT_CONTEXT @ v1.0.0` |
| **Semantic Digest (`feature_srd`)** | `SRD-F002-2B6DD3DC6B0A` |

---

## 1. Objective, Actors & Scope Boundaries
- **Business Objective:** Present the proposed enterprise quality review service on the microsite homepage, articulating key value propositions, illustrating the relationship between automated AI gates and qualified human review, and displaying verified IBM SEC Form 10-K and interim 2026 financial benchmarks with strict evidence attribution.
- **Inherited Global Contracts:** `BR-GLB-001`, `CONV-SHD-001`, `CONV-SHD-002`, `NFR-GLB-001`, `SEED-MAINT-GUEST-BROWSE`.

| Role ID | Channel | Permitted Business Actions | Data Ownership Scope | Denied Outcome |
|---|---|---|---|---|
| `ROLE-GUEST` | `Web` | View hero message, value props, verified SEC tables, corporate scale figures, and trigger CTA | Public homepage content | Mutation access prohibited |
| `ROLE-CUST` | `Web` | Inspect full corporate baseline evidence and click through to Pilot Assessment demonstration | Public homepage content and simulation | Administrative configuration denied |
| `ROLE-ADMIN` | `Web` | Audit evidence citations, SEC figures, and claim taxonomies across viewports | Public homepage content and governance | Session policies apply |

- **In-Scope:** Page 1 Hero section with exact headline and supporting text, 4 key value propositions, AI-assisted vs human reviewer synergy diagram, verified IBM FY2025 SEC Form 10-K and 9M 2026 financial comparison tables, official IBM corporate scale statistics (150,000+ consultants in 175+ countries), IBM-reported operational claims clearly tagged, and primary CTA linking to demonstration simulation.
- **Out-of-Scope:** Service workflow steps (owned by `FEATURE-003`), commercial pricing/TCO cards (owned by `FEATURE-005`), and interactive modal submission form (owned by `FEATURE-007`).

### 1B. User Stories & Release/Sprint Decomposition (`STR-*` -> `TSK-*`)
| Story ID | Story Title | Release Code | Sprint Code | Priority | Linked `AC-*` | Screen Refs | Initial Department Tasks (`TSK-*`) |
|---|---|---|---|---|---|---|---|
| `STR-002-01` | Hero Section, Value Proposition Cards and AI-Human Visual Flow | `REL-01` | `S1` | `high` | `AC-01`, `AC-03`, `AC-05` | `W02` | `TSK-002-01 (FE: Hero & value props)`, `TSK-002-02 (FE: CTA binding)`, `TSK-002-03 (QA: Viewport testing)` |
| `STR-002-02` | Verified IBM SEC Financial Metrics and Corporate Scale Data Grid | `REL-01` | `S1` | `high` | `AC-02`, `AC-04` | `W02` | `TSK-002-04 (FE: SEC 10-K tables)`, `TSK-002-05 (FE: Corporate scale cards)`, `TSK-002-06 (QA: Financial data audit)` |

### 1C. Scope Boundaries & Related Flows
| Boundary Type | Description & Linked `FEATURE-*` IDs | Dependency Kind (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM` / `EXCLUDED`) |
|---|---|---|
| **In-Scope** | Stories `STR-002-01`, `STR-002-02` covering homepage messaging, evidence tables, and value propositions. | `OWNED` |
| **Related Flows** | Relies on `FEATURE-001` global web shell; flows into `FEATURE-003` (Offering workflow) and `FEATURE-007` (CTA modal). | `HARD_PREREQ: FEATURE-001` |
| **Explicitly Out-of-Scope** | Live stock ticker feeds, external financial APIs, backend database queries. | `EXCLUDED` |

---

## 2. Visual Screen Decomposition Matrix
| Element ID | Screen Ref | Kind | AR Label | EN Label | Business Source or Exact Calculation Formula | Visibility / Editability Rule |
|---|---|---|---|---|---|---|
| `EL-01` | `W02` | `Headline` | `العنوان الرئيسي` | `Main Hero Headline` | Static text: "Human-Governed Quality Review for Enterprise Consulting Deliverables" | Always visible in Hero section |
| `EL-02` | `W02` | `Supporting Text` | `الرسالة الداعمة` | `Supporting Message` | Static text: "Combining automated checklist gates with specialized human review to support more consistent and efficient enterprise consulting deliverable reviews." | Always visible below headline |
| `EL-03` | `W02` | `Cards Grid` | `عروض القيمة الرئيسية` | `Value Propositions Grid` | 4 cards: Consistency & Compliance, Exception-Based Routing, Human Accountability, Scalable Efficiency | Always visible; 4 responsive cards |
| `EL-04` | `W02` | `Data Table` | `البيانات المالية لعام 2025` | `IBM FY2025 SEC 10-K Table` | Verified SEC Form 10-K figures: Revenue $67,535M, Gross Profit $39,297M, Consulting Revenue $21,055M, Consulting Margin 28.1%, Consulting Profit $2,464M (11.7%) | Always visible; formatted in USD Millions |
| `EL-05` | `W02` | `Data Table` | `النتائج المرحلية لعام 2026` | `IBM Interim 9M 2026 Table` | Verified 9M 2026 figures: Revenue $50,182M, Consulting Revenue $15,934M, Consulting Margin 27.9%, Q3 Revenue $17,103M, Q3 Consulting $5,335M (27.4%) | Always visible; tagged SEC-VERIFIED FACT |
| `EL-06` | `W02` | `Scale Cards` | `حجم أعمال آي بي إم كونسلتينج` | `IBM Corporate Scale Highlights` | Verified scale: 150,000+ consultants across 175+ countries; Consulting Advantage AI platform | Always visible; tagged IBM OFFICIAL FACT |
| `EL-07` | `W02` | `Visual Flow` | `مخطط مسار العمل المشترك` | `AI-Human Workflow Diagram` | Interactive SVG/CSS diagram showing Automated Gates -> Exception Routing -> Human Reviewer Sign-Off | Always visible; accessible with ARIA flow |
| `EL-08` | `W02` | `CTA` | `طلب تقييم تجريبي` | `Request a Pilot Assessment` | Primary action button opening simulation modal (`FEATURE-007`) | Always interactive in Hero and bottom section |

---

## 3. UI Lifecycle & Screen States Matrix
| Screen State | Trigger Condition | Exact Visual & Data Behavior | Primary CTA State | `AR / EN` Message Key |
|---|---|---|---|---|
| **Loading** | Initial homepage navigation or route change | Render Hero title shimmer, card outlines, and table header skeletons | `EL-08` disabled | `COPY-W02-LOADING` |
| **Empty State** | Section content array empty during render | Render fallback text notifying visitor of pending content compilation | `EL-08` enabled | `COPY-W02-EMPTY` |
| **Single-Item / Edge State** | Focused single metric detail inspection modal/card | Highlight single SEC metric card with source citation footnote visible | `EL-08` enabled | `COPY-W02-SINGLE` |
| **Populated / Normal** | Complete homepage markup and assets available | Full rich presentation with Hero, 4 value proposition cards, financial tables, and SVG diagram | `EL-08` enabled | `COPY-W02-NORMAL` |
| **Disabled / Locked** | Offline connection detected on device | Display cached verified data with offline notification badge | `EL-08` disabled | `COPY-W02-DISABLED` |
| **Error / Retry** | Rendering failure or DOM exception | Render clean accessible fallback view with reload trigger button | `EL-08` enabled | `COPY-W02-ERROR` |

---

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Deterministic Condition & Formula | Bound `SEED-*` / `ENUM-*` | Violation / Edge Outcome | Source Ref |
|---|---|---|---|---|
| `BR-FEAT-002-01` | All USD currency values in financial tables must display in Millions (`$M`) unless explicitly noted otherwise | `BR-GLB-001` | Unscaled raw dollar amounts rejected; must format as `$X,XXXM` | `Brief §3` |
| `BR-FEAT-002-02` | Every financial figure must carry an official attribution label badge (`SEC-VERIFIED FACT` or `IBM OFFICIAL FACT`) | `CONV-SHD-001` | Unlabeled claims or metrics rejected during BA audit | `Brief §6` |
| `BR-FEAT-002-03` | IBM-reported operational claims (e.g. FDU 6-person model, Copilot 250k hrs saved) must explicitly state they are self-reported claims, not independent proof | `CONV-SHD-001` | Must bear `IBM-REPORTED CLAIM` badge with disclaimer footnote | `Brief §3, §6` |

### 4B. Functional Requirements (`FR-*` — one per Story, traced both ways to `AC-*`)
| FR ID | Requirement (Observable System Behavior) | Source Story (`STR-*`) | Linked Rules (`BR-*`) | Covered By (`AC-*`) |
|---|---|---|---|---|
| `FR-01` | Render homepage hero section with exact headlines, value propositions, and AI-human synergy visual diagram | `STR-002-01` | `BR-FEAT-002-01` | `AC-01`, `AC-03`, `AC-05` |
| `FR-02` | Present verified SEC Form 10-K and interim 2026 financial metrics and corporate scale data with strict evidence labels | `STR-002-02` | `BR-FEAT-002-02`, `BR-FEAT-002-03` | `AC-02`, `AC-04` |

---

## 5. Archetype Operational Contract

### Sub-block 5A — `READ_VIEW` Query, Counter & Visibility Contract
| Concern | Deterministic Specification | Bound `SEED-*` / `ENUM-*` |
|---|---|---|
| **Actor / Tenant Visibility Scope** | Public read access for all visitors (`ROLE-GUEST`, `ROLE-CUST`, `ROLE-ADMIN`) | `SEED-MAINT-GUEST-BROWSE` |
| **Search Behavior** | In-page smooth scrolling to financial data and value proposition sections | `SEED-SEARCH-MIN-CHARS` |
| **Query Filters** | Toggle between FY2025 Annual 10-K and 2026 Interim 9M data views | `CONV-SHD-001` |
| **Default Sort** | Chronological and structural flow matching Brief: Hero -> Props -> Financials -> Scale -> CTA | `CONV-SHD-001` |
| **Pagination** | Single responsive landing page view; zero pagination required | `SEED-LIST-PAGE-ADMIN` |
| **Derived Counters** | 4 Value Propositions, 8 FY2025 SEC Metrics, 6 Interim 2026 Metrics, 3 Scale Stats | `CONV-SHD-001` |

### Sub-block 5B — `MUTATION_WORKFLOW` Contract
`OMITTED — Pure READ_VIEW Archetype (zero state mutations or write payloads).`

---

## 6. Split Edge-Case, Resilience & Mobile Matrix

### 6A. Domain Business Edge Cases (`DOM-01..02`)
| Case ID | Domain Boundary Scenario | Trigger / Condition | Expected Authoritative Business Outcome | Linked `AC-*` |
|---|---|---|---|---|
| `DOM-01` | Visitor inspects operational claim without seeing source attribution | Visitor hovers or clicks claim card | Tooltip surfaces SEC Form 10-K filing date or IBM official corporate press release source | `AC-02` |
| `DOM-02` | Narrow mobile screen (< 360px width) renders multi-column financial table | Mobile viewport constraint | Table enables horizontal touch scroll with sticky left metric name column | `AC-01` |

### 6B. Resilience & Mobile Contract (`SCN-01..06` & `MB-01..15`)
| Scenario ID | Concern | Applicability (`Applicable` / `N/A — Reason`) | User-Visible Authoritative Outcome & Safe Next Action | Linked `AC-*` |
|---|---|---|---|---|
| `SCN-01` | Duplicate Action / Double Tap | N/A — Pure READ_VIEW (no mutation) | Action CTA button de-bounces multiple taps to open exactly one modal instance. | — |
| `SCN-02` | Timeout / Uncertain Result | `Applicable` | If visual diagram assets fail to load, accessible semantic text description renders immediately. | `AC-06` |
| `SCN-03` | Offline / App Kill / Resume | `Applicable` | Static verified financial figures remain fully accessible in browser cache while offline. | `AC-07` |
| `SCN-04` | Concurrent State Modification | N/A — Pure READ_VIEW (no mutation) | Read-only corporate facts do not mutate during user sessions. | — |
| `SCN-05` | Cancel / Back / Abandon Mid-Flow | N/A — Pure READ_VIEW (no mutation) | Scroll position preserved upon navigation return. | — |
| `SCN-06` | Permission / Auth Revoked Mid-Flow | `Applicable` | Public homepage is fully accessible anonymously; zero session revocation blocking. | `AC-08` |

- **`MB-01..MB-15` Contract Note:** Web microsite interface satisfies responsive mobile constraints (`MB-12A` Push: N/A web-only; `MB-12B` Deep Links: direct anchor links supported to `#financials` and `#workflow`).

---

## 7. Bilingual Business Copy & Badges Table (`AR / EN`)
| Copy Key | Context | Arabic Text (`AR`) | English Text (`EN`) |
|---|---|---|---|
| `COPY-W02-HEADLINE` | `Hero` | `مراجعة الجودة بإشراف بشري لمخرجات الاستشارات المؤسسية` | `Human-Governed Quality Review for Enterprise Consulting Deliverables` |
| `COPY-W02-SUBHEAD` | `Hero` | `الجمع بين بوابات قوائم التحقق المؤتمتة والمراجعة البشرية المتخصصة لدعم مراجعات استشارية أكثر اتساقاً وكفاءة.` | `Combining automated checklist gates with specialized human review to support more consistent and efficient enterprise consulting deliverable reviews.` |
| `COPY-W02-BADGE-SEC` | `Badge` | `حقيقة مثبتة بملفات SEC` | `SEC-VERIFIED FACT` |
| `COPY-W02-BADGE-OFFICIAL` | `Badge` | `حقيقة رسمية من IBM` | `IBM OFFICIAL FACT` |
| `COPY-W02-BADGE-CLAIM` | `Badge` | `ادعاء تشغيلي صادر عن IBM` | `IBM-REPORTED CLAIM` |
| `COPY-W02-SCALE-TITLE` | `Scale` | `نطاق أعمال IBM كونسلتينج العالمي` | `IBM Consulting Corporate Scale` |
| `COPY-W02-LOADING` | `Loading` | `جاري تحميل مؤشرات الأداء والبيانات المالية...` | `Loading performance indicators and financial data...` |
| `COPY-W02-EMPTY` | `Empty` | `لا توجد بيانات متاحة حالياً` | `No data currently available` |
| `COPY-W02-SINGLE` | `Single` | `تفاصيل المؤشر المالي المحدد` | `Selected financial metric details` |
| `COPY-W02-NORMAL` | `Normal` | `تم عرض المؤشرات المالية وحقائق الخدمة` | `Financial metrics and service facts displayed` |
| `COPY-W02-DISABLED` | `Disabled` | `البيانات المعروضة من الذاكرة المحلية (غير متصل)` | `Data displayed from local cache (offline)` |
| `COPY-W02-ERROR` | `Error` | `تعذر تحميل الرسوم البيانية، يرجى إعادة المحاولة` | `Unable to load diagrams. Please retry.` |

---

## 8. Deterministic Acceptance Criteria (`AC-01..08`)
| AC ID | Traced IDs | Screen Ref | Given | When | Then |
|---|---|---|---|---|---|
| `AC-01` | `BR-FEAT-002-01`, `FR-01` | `W02` | Visitor opens homepage on any device | Hero section renders | Headline and supporting message match Brief verbatim; 4 value prop cards render with consistent padding |
| `AC-02` | `BR-FEAT-002-02`, `FR-02`, `DOM-01` | `W02` | Visitor navigates to financial metrics section | Section renders | Table displays IBM FY2025 revenue ($67,535M), consulting revenue ($21,055M), gross margin (28.1%), segment profit ($2,464M) with `SEC-VERIFIED FACT` badge |
| `AC-03` | `FR-01` | `W02` | Visitor views AI-human workflow section | Visual flow renders | Diagram clearly shows automated checklist screening preceding human reviewer approval gate |
| `AC-04` | `BR-FEAT-002-03`, `FR-02` | `W02` | Visitor inspects operational claims section | Section renders | FDU 6-person model and Copilot 250k hrs savings explicitly carry `IBM-REPORTED CLAIM` badge with non-independent disclaimer |
| `AC-05` | `FR-01` | `W02` | Visitor clicks primary CTA button | Button clicked | Action opens Pilot Assessment demonstration modal without reloading the page |
| `AC-06` | `SCN-02` | `W02` | SVG diagram fails to render due to network latency | Fallback evaluates | Accessible text description of the workflow renders with `COPY-W02-ERROR` retry button |
| `AC-07` | `SCN-03` | `W02` | User navigates site with offline connection | Page accessed | Cached SEC metrics and corporate scale figures remain visible with offline badge |
| `AC-08` | `SCN-06` | `W02` | Visitor views financial evidence | Anonymous visitor | Full verified evidence set displays with zero paywall or login prompt |

---

## 9. Gate A — BA Sealing Scorecard (`BA-01..BA-14`)

### 9.1 Key Business Decisions Snapshot (`D-01..D-n`)
| Decision ID | Provenance Tag (`PROJECT_CONTEXT` / `BA_ANSWERED` / `LOGICALLY_ENTAILED` / `ESTABLISHED_CONVENTION` / `PROPOSED_DEFAULT`) | Approved Decision & Bound `SEED-*` / `BR-*` | Reference & Authority |
|---|---|---|---|
| `D-01` | `LOGICALLY_ENTAILED` | `BR-FEAT-002-01` — All financial table figures displayed in USD Millions (`$M`) | `Brief §3`, `BR-FEAT-002-01` |
| `D-02` | `LOGICALLY_ENTAILED` | `BR-FEAT-002-02` — Strict evidence tagging: `SEC-VERIFIED FACT` vs `IBM-REPORTED CLAIM` | `Brief §6`, `BR-FEAT-002-02` |
| `D-03` | `BA_ANSWERED` | Verified corporate scale baseline: 150,000+ consultants across 175+ countries | `Brief §3`, `IBM Corporate Scale` |
| `D-04` | `PROPOSED_DEFAULT` | Standard `READ_VIEW` resilience outcomes `SCN-01..06` applied for public landing page | `SCN-01..06`, `AC-05..08` |

**Snapshot Approval:** `APPROVED` (`BA Lead — 2026-11-17`)

### 9.2 Canonical 14-Check Audit Table
- **Decisions Snapshot (`D-01..D-04`):** Approved by `BA Lead (2026-11-17)`.
- **Audit Summary (`BA-01..BA-14`):** `BA-01..08 = PASS`, `BA-09 = N/A (Pure READ_VIEW without mutation form)`, `BA-10..13 = PASS`, `BA-14 = N/A (v1.0.0 baseline)`.
- **Score:** `P = 12 | F = 0 | U = 0 | N = 2 | VALID = round(100 * 12 / (14 - 2), 1) = 100.0%` -> **Gate A: `READY_FOR_DEV`**.

### 9.3 Ownership Routing (Non-BA Handoff Notes — never asked of the BA)
| Dependency ID | Owner (`BACKEND_OWNED` / `SHARED_MOBILE` / `SHARED_WEB` / `DESIGN_OWNED`) | Handoff Note / Technical Requirement | Status (`Open` / `Done` / `Reused`) |
|---|---|---|---|
| `DEP-01` | `SHARED_WEB` | Provide responsive HTML table components with sticky headers and scroll wrappers | `Done` |
| `DEP-02` | `DESIGN_OWNED` | Provide SVG diagram illustrating automated checklist screening and human reviewer sign-off | `Done` |
| `DEP-03` | `SHARED_WEB` | Implement CSS badge utility classes for the 6 canonical evidence taxonomy labels | `Done` |

---

## 10. Feature Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA` / `PM` / `Dev` / `Mobile` / `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-17` | Initial Baseline Seal | `ALL` | Pre-baseline draft | Sealed `READY_FOR_DEV` (`VALID = 100.0%`) | `BA`: Baseline locked \| `PM`: Schedule S1 implementation \| `Dev`: Build Hero and SEC tables \| `Mobile`: Test mobile table scrolling \| `QA`: Validate figures against SEC Form 10-K |

---

## 11. Gate B — Engineering Readiness Appendix (`ENG-01..ENG-10` — Reserved for Engineering `.ai`)

> **Gate B Status:** `READY_TO_CODE` | **Verified `feature_srd`:** `3d688d98c56cc823822129cd0fdbd15cd15315d9be7016c0f641488fc536ea4f` | **Sealed At:** `2026-11-17T10:45:56.868Z`
| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| `ENG-01` | Model/Table Binding | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-002)` | `PASS` |
| `ENG-02` | API Endpoint & Envelope Contract | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-002)` | `PASS` |
| `ENG-03` | SEED-* & ENUM-* Codebase Mapping | `SEED-MAINT-GUEST-BROWSE, SEED-SEARCH-MIN-CHARS, SEED-LIST-PAGE-ADMIN mapped to catalog & seeder` | `PASS` |
| `ENG-04` | Visual Screen §2 & Lifecycle §3 data-testid Plan | `UI Spec §2 (8 elements): data-testid="feature-002-el-01", data-testid="feature-002-el-02", data-testid="feature-002-el-03", data-testid="feature-002-el-04", data-testid="feature-002-el-05", data-testid="feature-002-el-06", data-testid="feature-002-el-07", data-testid="feature-002-el-08" / §3 States (6): data-testid="feature-002-state-loading", data-testid="feature-002-state-empty", data-testid="feature-002-state-single-item", data-testid="feature-002-state-populated", data-testid="feature-002-state-disabled", data-testid="feature-002-state-error"` | `PASS` |
| `ENG-05` | ESR Index & N+1 Prevention | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-002)` | `PASS` |
| `ENG-06` | Tenant/IDOR & RBAC Guard | `RBAC Role-Matrix & Tenant 404 IDOR Guard (SEC-034, SEC-036, SEC-037)` | `PASS` |
| `ENG-07` | IPDPL/PII Masking | `Tier-1/2 PII Masking & Zero-PII Log Scrubber (SEC-048, SEC-148)` | `PASS` |
| `ENG-08` | Archetype Concurrency/Idempotency Strategy | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-002)` | `PASS` |
| `ENG-09` | Automated Test File Binding | `Horizontal/Vertical Negative Security & Role-Matrix Tests (SEC-164, SEC-170)` | `PASS` |
| `ENG-10` | Mobile/QA Handoff Impact | `Bound via REVERSE_INTAKE_BUNDLE (FEATURE-002)` | `PASS` |
