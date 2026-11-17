# BACKLOG WORK BREAKDOWN STRUCTURE (5-LEVEL WBS) — `ibrahem`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `IBR` |
| **Semantic Version** | `v1.0.0` |
| **Last Updated** | `2026-11-17` |
| **WBS Hierarchy** | `Component (CMP-*) -> Epic (EPC-*) -> Feature (FEATURE-*) -> Story (STR-*) -> Task (TSK-*)` |
| **PMTool Sync State** | `01-roadmap-and-pm/PMTOOL_SYNC_MAP.json` |

> **Sequential-Wave PMTool Rule:** Because PMTool validates `Parent` dropdowns against live database IDs (`<ParentType> - <DB_ID> - <Title>` in hidden Column `Z`), import hierarchy waves sequentially (`Components -> Epics -> Features -> Stories -> Tasks`) using a freshly downloaded `backlog-import-template-<projectId>.xlsx` before each wave (`npm run hub:pmtool -- --hub=. --template=backlog-import-template.xlsx --wave=auto`).

---

## 1. Release & Sprint Registry

### 1A. Release Registry (`REL-*` <-> Column `AE`)
| Release Code | PMTool Release Label | Target Sprints | Status |
|---|---|---|---|
| `REL-01` | `Release 1` | `S1, S2, S3` | `ACTIVE` |

### 1B. Sprint Registry (`S1..Sn` <-> Column `AF`)
| Sprint Code | PMTool Sprint Label | Release Code | Goal |
|---|---|---|---|
| `S1` | `Sprint 1` | `REL-01` | Global layout architecture, corporate palette, Page 1 Home & SEC verified financial baseline (`Wave 1`) |
| `S2` | `Sprint 2` | `REL-01` | Page 2 Offering details with 6-step review workflow and Page 3 Commercial Pricing & TCO breakdown (`Wave 2`) |
| `S3` | `Sprint 3` | `REL-01` | Page 4 Trust & Governance, evidence taxonomy labels, and interactive simulation modal demonstration (`Wave 3`) |

---

## 2. Components & Epics Hierarchy (`CMP-*` -> `EPC-*`)

### 2A. Components Registry (`Level 1` <-> Column `Y: Component`)
| Component ID | Title | PMTool ID |
|---|---|---|
| `CMP-01` | Global Corporate Web Shell & Theming | `PENDING` |
| `CMP-02` | Value Proposition & Service Experience | `PENDING` |
| `CMP-03` | Commercial Model, Governance & Simulation | `PENDING` |

### 2B. Epics Registry (`Level 2` <-> Column `Y: Epic`, Parent `CMP-*`)
| Epic ID | Parent Component | Title | Target Release | Priority | PMTool ID |
|---|---|---|---|---|---|
| `EPC-01` | `CMP-01` | Global Navigation, Theming & Academic Governance Shell | `REL-01` | `high` | `PENDING` |
| `EPC-02` | `CMP-02` | Value Proposition, SEC Evidence & 6-Step Review Workflow | `REL-01` | `critical` | `PENDING` |
| `EPC-03` | `CMP-03` | Commercial Transparency, Trust Governance & Simulation Form | `REL-01` | `high` | `PENDING` |

---

## 3. Feature-to-Epic & Story Allocation Matrix (`FEATURE-*` -> `STR-*`)

### 3A. Features Hierarchy (`Level 3` <-> Column `Y: Feature`, Parent `EPC-*`)
| Feature ID | Parent Epic | Title | Target Release | Sprint Code | Priority | PMTool ID |
|---|---|---|---|---|---|---|
| `FEATURE-001` | `EPC-01` | Global Microsite Architecture, Navigation & Design System | `REL-01` | `S1` | `critical` | `PENDING` |
| `FEATURE-002` | `EPC-02` | Home Value Proposition & SEC-Verified Financial Metrics | `REL-01` | `S1` | `high` | `PENDING` |
| `FEATURE-003` | `EPC-02` | Offering Review Sequence & Pilot Deliverables Workflow | `REL-01` | `S1` | `high` | `PENDING` |
| `FEATURE-005` | `EPC-03` | Commercial Framing, Pricing & TCO Transparency Model | `REL-01` | `S2` | `high` | `PENDING` |
| `FEATURE-006` | `EPC-03` | Trust, Governance & Evidence Classification Taxonomy | `REL-01` | `S2` | `high` | `PENDING` |
| `FEATURE-007` | `EPC-03` | Pilot Assessment Interactive Demonstration Simulation | `REL-01` | `S3` | `medium` | `PENDING` |

### 3B. User Story Allocation Matrix (`Level 4` <-> Column `Y: Story`, Parent `FEATURE-*`)
| Story ID | Parent Feature | Parent Epic | Story Title | Release Code | Sprint Code | Priority | Stage | Assignee Role | PMTool ID |
|---|---|---|---|---|---|---|---|---|---|
| `STR-001-01` | `FEATURE-001` | `EPC-01` | Responsive Layout, Color Tokens and Global Header/Footer Navigation | `REL-01` | `S1` | `critical` | `Todo` | `FE / Design` | `PENDING` |
| `STR-001-02` | `FEATURE-001` | `EPC-01` | Academic Disclaimer Banner and Accessibility Baseline Navigation | `REL-01` | `S1` | `high` | `Todo` | `FE / Content` | `PENDING` |
| `STR-002-01` | `FEATURE-002` | `EPC-02` | Hero Section, Value Proposition Cards and AI-Human Visual Flow | `REL-01` | `S1` | `high` | `Todo` | `FE / Content` | `PENDING` |
| `STR-002-02` | `FEATURE-002` | `EPC-02` | Verified IBM SEC Financial Metrics and Corporate Scale Data Grid | `REL-01` | `S1` | `high` | `Todo` | `FE / Research` | `PENDING` |
| `STR-003-01` | `FEATURE-003` | `EPC-02` | Six-Step Quality Review Sequence Visualization & Decision Gate Flow | `REL-01` | `S1` | `high` | `Todo` | `FE / Design` | `PENDING` |
| `STR-003-02` | `FEATURE-003` | `EPC-02` | Proposed Pilot Deliverables List & AI Limitation Boundary Section | `REL-01` | `S1` | `medium` | `Todo` | `FE / Legal` | `PENDING` |
| `STR-005-01` | `FEATURE-005` | `EPC-03` | Proposed Customer Pilot Pricing Cards with Mandatory Placeholders | `REL-01` | `S2` | `high` | `Todo` | `FE / Pricing` | `PENDING` |
| `STR-005-02` | `FEATURE-005` | `EPC-03` | Internal Total Cost of Ownership Software & Operation Breakdown | `REL-01` | `S2` | `medium` | `Todo` | `FE / Pricing` | `PENDING` |
| `STR-006-01` | `FEATURE-006` | `EPC-03` | Six-Tier Evidence Classification Badging and Official Source References | `REL-01` | `S2` | `high` | `Todo` | `FE / Content` | `PENDING` |
| `STR-006-02` | `FEATURE-006` | `EPC-03` | Governance Boundaries, Data Access Controls and Privacy Disclosures | `REL-01` | `S2` | `medium` | `Todo` | `FE / Legal` | `PENDING` |
| `STR-007-01` | `FEATURE-007` | `EPC-03` | Interactive Pilot Assessment Demonstration Simulation Modal Form | `REL-01` | `S3` | `high` | `Todo` | `Full-Stack` | `PENDING` |
| `STR-007-02` | `FEATURE-007` | `EPC-03` | Form Client-Side Validation, Simulation Confirmation and Reset Controls | `REL-01` | `S3` | `medium` | `Todo` | `Full-Stack` | `PENDING` |

---

## 4. Execution Task Breakdown (`Level 5: TSK-*`)
| Task ID | Parent Story | Department | Task Title | Release Code | Sprint Code | Estimate | Assignee |
|---|---|---|---|---|---|---|---|
| `TSK-001-01` | `STR-001-01` | `FE` | Scaffold semantic HTML5 layouts with IBM corporate blue, white, and grey CSS design tokens | `REL-01` | `S1` | `4h` | `Unassigned` |
| `TSK-001-02` | `STR-001-01` | `FE` | Implement responsive top navigation bar and unified multi-page footer shell | `REL-01` | `S1` | `4h` | `Unassigned` |
| `TSK-001-03` | `STR-001-01` | `QA` | Verify cross-browser responsive breakpoints and HTML5 validator compliance | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-001-04` | `STR-001-02` | `FE` | Render Nexford MBA Capstone academic disclaimer prominently across all 4 page footers | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-001-05` | `STR-001-02` | `QA` | Verify accessibility ARIA landmarks, focus rings, and keyboard tab order | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-002-01` | `STR-002-01` | `FE` | Build Page 1 Hero section with core value proposition cards and AI-human synergy visual | `REL-01` | `S1` | `4h` | `Unassigned` |
| `TSK-002-02` | `STR-002-01` | `FE` | Bind primary CTA button linking to pilot assessment demonstration simulation | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-002-03` | `STR-002-01` | `QA` | Test visual layout and typography consistency across desktop, tablet, and mobile viewports | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-002-04` | `STR-002-02` | `FE` | Construct verified SEC Form 10-K and 9M 2026 financial comparison tables | `REL-01` | `S1` | `4h` | `Unassigned` |
| `TSK-002-05` | `STR-002-02` | `FE` | Implement corporate scale highlight cards for 150,000+ consultants across 175+ countries | `REL-01` | `S1` | `3h` | `Unassigned` |
| `TSK-002-06` | `STR-002-02` | `QA` | Assert all corporate financial figures match SEC Form 10-K baseline evidence | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-003-01` | `STR-003-01` | `FE` | Construct 6-step visual sequence cards from document submission to professional approval | `REL-01` | `S1` | `5h` | `Unassigned` |
| `TSK-003-02` | `STR-003-01` | `FE` | Implement human reviewer decision gate visual highlights and exception classification tags | `REL-01` | `S1` | `3h` | `Unassigned` |
| `TSK-003-03` | `STR-003-01` | `QA` | Verify sequence readability and responsive vertical card stacking on mobile viewports | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-003-04` | `STR-003-02` | `FE` | Render proposed pilot deliverables checklist and agreed acceptance criteria cards | `REL-01` | `S1` | `3h` | `Unassigned` |
| `TSK-003-05` | `STR-003-02` | `FE` | Add professional boundary section stating AI does not make final legal/financial approvals | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-003-06` | `STR-003-02` | `QA` | Verify evidence source citations and disclaimer visibility on Page 2 | `REL-01` | `S1` | `2h` | `Unassigned` |
| `TSK-005-01` | `STR-005-01` | `FE` | Build Customer Pilot Pricing package card preserving exact visible placeholder markers | `REL-01` | `S2` | `4h` | `Unassigned` |
| `TSK-005-02` | `STR-005-01` | `QA` | Verify zero invented pricing figures appear across customer-facing commercial cards | `REL-01` | `S2` | `2h` | `Unassigned` |
| `TSK-005-03` | `STR-005-02` | `FE` | Construct Internal TCO breakdown with watsonx Orchestrate historical pricing snapshots | `REL-01` | `S2` | `4h` | `Unassigned` |
| `TSK-005-04` | `STR-005-02` | `FE` | Add interactive tooltips for unvalidated implementation and governance placeholders | `REL-01` | `S2` | `3h` | `Unassigned` |
| `TSK-005-05` | `STR-005-02` | `QA` | Test tooltip hover and click interactions with accessible keyboard focus states | `REL-01` | `S2` | `2h` | `Unassigned` |
| `TSK-006-01` | `STR-006-01` | `FE` | Implement 6-tier evidence label badge CSS classes and tooltip definitions | `REL-01` | `S2` | `3h` | `Unassigned` |
| `TSK-006-02` | `STR-006-01` | `QA` | Validate each corporate claim carries an exact canonical evidence taxonomy badge | `REL-01` | `S2` | `2h` | `Unassigned` |
| `TSK-006-03` | `STR-006-02` | `FE` | Render data governance, access control, and privacy policy sections on Page 4 | `REL-01` | `S2` | `3h` | `Unassigned` |
| `TSK-006-04` | `STR-006-02` | `FE` | Implement Academic Resources footer links with pending download tooltip badges | `REL-01` | `S2` | `2h` | `Unassigned` |
| `TSK-006-05` | `STR-006-02` | `QA` | Test resource link states and privacy disclosure readability across viewports | `REL-01` | `S2` | `2h` | `Unassigned` |
| `TSK-007-01` | `STR-007-01` | `FE` | Implement accessible modal dialog with backdrop for Request a Pilot Assessment | `REL-01` | `S3` | `4h` | `Unassigned` |
| `TSK-007-02` | `STR-007-01` | `FE` | Display prominent Academic Concept Simulation notification banner in modal header | `REL-01` | `S3` | `2h` | `Unassigned` |
| `TSK-007-03` | `STR-007-01` | `QA` | Assert zero external network calls occur upon modal submission | `REL-01` | `S3` | `2h` | `Unassigned` |
| `TSK-007-04` | `STR-007-02` | `FE` | Implement client-side form validation for organization name, email, and scope inputs | `REL-01` | `S3` | `3h` | `Unassigned` |
| `TSK-007-05` | `STR-007-02` | `FE` | Render simulation success confirmation banner and form reset controls | `REL-01` | `S3` | `2h` | `Unassigned` |
| `TSK-007-06` | `STR-007-02` | `QA` | Test client validation error messages, focus trapping, and Escape key dismissal | `REL-01` | `S3` | `2h` | `Unassigned` |
