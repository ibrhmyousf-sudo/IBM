# SPRINT MASTER PLAN — `ibrahem`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `IBR` |
| **Semantic Version** | `v1.0.0` |
| **Planning Status** | `APPROVED` |
| **Last Updated** | `2026-11-17` |
| **Source Backlog Baseline** | `Website Development Brief v1.0` + `INTAKE_MANIFEST v1.0` |

---

## 1. Executive Readiness Summary
| Metric | Count / Value | Accounting Formula / Notes |
|---|---|---|
| **Total Canonical Functional Features** | `3` | `100%` of in-scope Functional Features (`Allocated = 6/6`, `Deferred = 0`) |
| **Planned Sprints / Batches** | `1` (S1) | Ordered across `Wave 1 -> Wave 2 -> Wave 3` (`0` forward `HARD_PREREQ` violations) |
| **Archetype Breakdown** | `READ_VIEW: 3` \| `MUTATION_WORKFLOW: 0` \| `INTEGRATION_JOB: 0`| Governs downstream specification and verification checks |
| **Gate A (`READY_FOR_DEV`) Sealed** | `3 / 3` | Updated per Sprint-Batch Sealing Pass |
| **Gate B (`READY_TO_CODE`) Cleared** | `0 / 3` | Updated downstream by Engineering Tech Leads |
| **Non-Feature Supporting Work Items** | `3` (`SUP-*`) | Tracked separately in Section 3 (zero feature-count inflation) |

---

## 2. Sprint-by-Sprint Feature Allocation Table
> **Wave Taxonomy (`STD-04-PLAN-v2.0`):** `Wave 1` = Global Layout, Theming & Value Proposition Foundations; `Wave 2` = Service Review Details, Pricing & Governance Transparency; `Wave 3` = Interactive Simulation & Capstone Release Seal.

| Sprint ID | Wave (`1`/`2`/`3`) | Feature ID | Title | Archetype (`READ_VIEW` / `MUTATION_WORKFLOW` / `INTEGRATION_JOB`) | Channels (`Web`/`Mobile`/`Admin`) | Upstream Dependencies (`HARD_PREREQ` / `IN_FLOW` / `DOWNSTREAM`) | Gate A (`BA`) | Gate B (`Eng`) |
|---|---|---|---|---|---|---|---|---|
| `S1` | `1` | `FEATURE-001` | Global Microsite Architecture, Navigation & Design System | `READ_VIEW` | `Web` | `Synced from S1` | `READY_FOR_DEV` | `PENDING` |
| `S1` | `1` | `FEATURE-002` | Home Value Proposition & SEC-Verified Financial Metrics | `READ_VIEW` | `Web` | `Synced from S1` | `READY_FOR_DEV` | `PENDING` |
| `S1` | `1` | `FEATURE-003` | Offering Review Sequence & Pilot Deliverables Workflow | `READ_VIEW` | `Web` | `Synced from S1` | `READY_FOR_DEV` | `PENDING` |

### Deferred / Explicitly Out-of-Release Functional Features
| Feature ID | Title | Disposition (`DEFERRED_PHASE_2` / `EXCLUDED`) | Authority & Source Ref | Safe Interim Boundary for Active Sprints |
|---|---|---|---|---|
| `NONE` | — | — | — | — |

---

## 3. Non-Feature Supporting Work Execution Schedule (`SUP-*`)
| Supporting ID | Category (`Technical Enabler` / `Integration Enabler` / `Content Catalog` / `NFR` / `Migration` / `Release Validation`) | Deliverable Summary | Unblocks Feature IDs | Target Sprint ID | Owner | Status |
|---|---|---|---|---|---|---|
| `SUP-CNT-001` | `Content Catalog` | SEC Form 10-K & Interim Financial Baseline Extracts | `FEATURE-002`, `FEATURE-005` | `S1` | `BA / Research` | `APPROVED` |
| `SUP-DSN-001` | `Technical Enabler` | IBM Carbon-Inspired Corporate Design Tokens & Palette Config | `FEATURE-001` | `S1` | `Frontend Lead` | `APPROVED` |
| `SUP-REL-001` | `Release Validation` | End-to-End Cross-Device Accessibility & Simulation Boundary Audit | `ALL` | `S3` | `QA Lead` | `OPEN` |

---

## 4. Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA`, `PM`, `Dev`, `Mobile`, `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-17` | Stage 04 Baseline | `ALL` | Unsequenced initial backlog | Approved 3-Wave Sprint Master Plan (S1..S3) with zero forward prereq violations | `BA`: Author S1 specs \| `PM`: Track SUP-* enablers \| `Dev`: Ingest Wave 1 architecture \| `Mobile`: Responsive web QA \| `QA`: Author test suites |
