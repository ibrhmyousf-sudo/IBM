# PROJECT INTAKE MANIFEST — `ibrahem`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `IBR` |
| **Intake Mode** | `high-level` |
| **Scope Mode** | `FULL_PROJECT` |
| **Source Path** | `docs/project-context-hub/_intake/breif.md` |
| **Reverse Bundle** | `docs/business-context/intake/REVERSE_INTAKE_BUNDLE.json` |
| **Target Sprint** | `S1` |
| **Change Request Ref** | `N/A` |
| **Generated On** | `2026-11-17` |

> **Governance Note:** Generated deterministically by `ba-hub intake` (`workflows/00-ba-intake-router.md`). Normalizes heterogeneous project starting points (`greenfield-brd`, `high-level`, `prototype-code`, `markdown-import`, `brownfield-cr`) into a single canonical `project-context-hub/` pipeline.

---

## 1. Ingested Source Artifacts
| # | Source Artifact | Detected Kind | Size (Bytes) | Hub Disposition |
|---|---|---|---|---|
| 1 | `docs/project-context-hub/_intake/breif.md` | `Markdown Brief (.md)` | 9645 | Primary ground-truth website development brief for IBM Consulting V2 microsite |
| 2 | `raw/breif.md` | `Raw Source Backup (.md)` | 9645 | Exact mirror of raw intake brief |
| 3 | `docs/business-context/intake/REVERSE_INTAKE_BUNDLE.json` | `Reverse Architecture Bundle (.json)` | 1113 | Ingested via reverse-architect extraction engine |
| 4 | `.ai/context/CODEBASE_MAP.md` | `Codebase Index (.md)` | 1169 | Indexed via deterministic multi-stack scanner |

---

## 2. Auto-Discovered Domain & Technical Inventory
| Discovery Dimension | Count | Extracted Identifiers / Summary |
|---|---|---|
| Target Web Pages | 4 | Page 1: Home / Value Proposition, Page 2: Offering / Service Details, Page 3: Pricing / Commercial Framing, Page 4: Trust / Governance / CTA |
| Verified SEC & Corporate Metrics | 14 | IBM FY2025 SEC 10-K ($67,535M Rev, $21,055M Consulting Rev), 9M 2026 Results, Q3 2026 Results, IBM Scale (150,000+ consultants across 175+ countries) |
| Evidence Taxonomy Labels | 6 | `SEC-VERIFIED FACT`, `IBM OFFICIAL FACT`, `IBM-REPORTED CLAIM`, `STUDENT-PROPOSED DESIGN`, `UNVALIDATED HYPOTHESIS`, `PLACEHOLDER — TO BE VALIDATED` |
| Mandatory Placeholder Convention | 1 | Strict visible marker: `⟦ TO BE VALIDATED ⟧` for unconfirmed commercial/financial inputs |
| Delivery Technical Stack | 3 | HTML5, CSS3, Vanilla JavaScript (responsive desktop/tablet/mobile, zero heavy framework lock-in) |
| Discovered Backend Models | 0 | Greenfield standalone corporate microsite (zero backend database models) |
| Discovered API Endpoints | 0 | Client-side simulation modal form ("Request a Pilot Assessment") |

---

## 3. Detected Gaps Requiring BA / UX Sign-Off (`Option A` Ready)
| Gap ID | Category | Observation | Recommended `Option A` Action |
|---|---|---|---|
| `GAP-01` | Commercial Pricing Placeholders | Customer pilot price, duration, document volume, and reviewer hourly cost are pending financial model validation | Persist exact visible marker `⟦ TO BE VALIDATED ⟧` across all commercial cards; do not invent figures |
| `GAP-02` | Simulation Form Boundary | "Request a Pilot Assessment" CTA modal must never submit data to IBM or imply official corporate deployment | Implement client-side modal demonstration with prominent academic prototype simulation banner |
| `GAP-03` | Academic Governance Disclaimer | Site must not be misconstrued as an officially launched IBM service offering | Prominently display Nexford University MBA Capstone academic disclaimer in footer across all 4 pages |
| `GAP-04` | Academic Resources Links | Research Appendix PDF and Master Excel Model URLs are pending file generation | Render disabled download action pills displaying `⟦ TO BE VALIDATED ⟧` tooltip until assets are provided |

---

## 4. Exact Next Workflow Routing by Department
| Department | Immediate Action & Bound Artifact | Command / Trigger |
|---|---|---|
| **BA** | Populate all 15 sections of `00-project-core/PROJECT_CONTEXT.md`, `GLOSSARY_AND_ENUMS.md`, and `SEED_DEFAULTS_CATALOG.md` | Stage 2: `CORE_BOOTSTRAP` (`@ba-bootstrap`) |
| **PM** | Sequence 3-Wave sprint roadmap & WBS for the 4-page corporate microsite | Stage 3: `SPRINT_PLAN` (`@ba-sprint-plan S1`) |
| **UI/UX & Frontend** | Design responsive layout templates using IBM corporate blue/white/grey palette and accessible cards | Stage 4: `SPRINT_SPECS` -> `DEV_IMPLEMENT` |
| **QA / Security** | Verify zero PII storage in simulated CTA modal, cross-browser responsiveness, and strict evidence label alignment | Stage 8: `SECURITY_PERF_GATE` -> `QA_HANDOFF` |

