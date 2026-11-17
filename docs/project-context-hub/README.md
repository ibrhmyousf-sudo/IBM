# Project Context Hub Blueprint (`project-context-hub/`)

**Blueprint Version:** 2.0.0 | **Governing Standards:** `.agrules`, `GOV-POL-CANONICAL-EVOLUTION-v2.0`, `GOV-POL-MARKDOWN-FIRST-PIPELINE-v2.0`

`project-context-hub/` is the **Step 0 Shared Source of Truth** initialized at Project Kickoff and consumed directly by humans and AI agents across all 5 delivery departments: **BA**, **PM**, **Backend/Web (`Dev` / `.ai`)**, **Mobile (`02-FLUTTER ENGINE`)**, and **QA**.

---

## 1. Directory Topology

```text
project-context-hub/
├── 00-project-core/                 # Global rules, actors, enums & initial seed defaults
│   ├── PROJECT_CONTEXT.md
│   ├── GLOSSARY_AND_ENUMS.md
│   └── SEED_DEFAULTS_CATALOG.md
├── 01-roadmap-and-pm/               # Wave/Sprint schedule, archetypes & CR impact register
│   ├── SPRINT_MASTER_PLAN.md
│   └── CHANGE_IMPACT_REGISTER.md
├── 02-sprints/                      # Sprint-categorized canonical feature specs & manifests
│   └── <SprintID>/                  # e.g., B0/, B1/ or S01/, S02/
│       ├── SPRINT_<ID>_MANIFEST.md
│       └── FEATURE-XXX.md
├── 03-version-deltas/               # Post-v1.0.0 cross-team delta packs & immutable snapshots
│   ├── DELTA_vX.Y.Z.md
│   └── snapshots/
│       └── v1.0.0/
└── 04-traceability-and-exports/     # Automated RTM/Gate CSVs & stakeholder DOCX/XLSX exports
    ├── RTM_MATRIX.csv
    ├── GATE_EVIDENCE.csv
    └── stakeholder-docs/
```

---

## 2. How the 5 Departments Consume This Hub

### Day 1 Baseline Consumption (`v1.0.0` Sealed)
| Department | Primary Files Read on Day 1 | Operational Action |
|---|---|---|
| **1. BA (Business Analysis)** | `00-project-core/*`, `01-roadmap-and-pm/SPRINT_MASTER_PLAN.md`, `02-sprints/<SprintID>/*` | Authors in-place specs (`v0.x`), decomposes every screen (`M01..MXX`, `A01..AXX`), logs `PROPOSED_SEED_DEFAULT` values, and seals Gate A (`READY_FOR_DEV` at `v1.0.0`) via the unified `08+09` Sprint-Batch Pass. |
| **2. PM (Product / Delivery)** | `01-roadmap-and-pm/SPRINT_MASTER_PLAN.md`, `02-sprints/<SprintID>/SPRINT_<ID>_MANIFEST.md`, `04-traceability-and-exports/*` | Tracks 3-Wave ordering, `Supporting Work` readiness (`SUP-*`), Gate A -> Gate B handoffs, and stakeholder sign-off exports. |
| **3. Dev (`Backend/Web .ai`)** | `00-project-core/*`, `02-sprints/<SprintID>/SPRINT_<ID>_MANIFEST.md`, `02-sprints/<SprintID>/FEATURE-XXX.md` | Syncs sealed specs into `docs/business-context/` (via `@bcas-init`), seeds `SEED_DEFAULTS_CATALOG.md` constants, verifies Gate B (`ENG-01..10`), and executes `@implement FEATURE-XXX`. |
| **4. Mobile (`02-FLUTTER ENGINE`)** | `00-project-core/*`, mobile-scoped `FEATURE-XXX.md` (with `M01..MXX` decomposition & `MB-01..15` outcomes) | Implements screen states (`Loading / Empty / Error / Disabled`), bilingual EN/AR labels, countdown/limit seeds, deep links (`MB-12B`), and offline/retry outcomes (`SCN-01..06`). |
| **5. QA (Quality Engineering)** | `00-project-core/SEED_DEFAULTS_CATALOG.md`, `02-sprints/<SprintID>/FEATURE-XXX.md`, `04-traceability-and-exports/RTM_MATRIX.csv` | Generates 1:1 automated & UAT test suites mapped directly to `AC-01..AC-XX`, boundary seeds, and `SCN-01..06` edge scenarios. |

---

### Post-Baseline Evolution Consumption (`v1.1.0+`, `v2.0.0+` Updates)
When a Change Request (`CR-XXX`) or business clarification arrives **after `v1.0.0`**:
1. **Single Clean Body + Scoped Re-Seal:**
   - **BA** updates only the affected rule/screen/AC **in-place** inside `PROJECT_CONTEXT.md` or `FEATURE-XXX.md`, bumps the semantic version, appends one row to the file's **Evolution & History Ledger** (`Was | Current | Update Needed`), re-computes only the affected **Feature-Scoped Semantic Rule Digest (`feature_srd`)**, and emits `03-version-deltas/DELTA_vX.Y.Z.md`.
2. **Targeted Cross-Team Triage (Zero Re-Reading Unchanged Specs):**
   - **PM** checks `01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md` and the `PM` column of `DELTA_vX.Y.Z.md` to adjust sprint scope or release notes.
   - **Dev (`.ai`)** reads `DELTA_vX.Y.Z.md` (`Dev` column) + changed `feature_srd` entries in `SPRINT_<ID>_MANIFEST.md` to patch only mutated backend/web rules and OpenAPI/SDK contracts.
   - **Mobile** reads `DELTA_vX.Y.Z.md` (`Mobile` column) to patch affected Flutter screens/timers/locales—skipping backend-only deltas marked `No action`.
   - **QA** reads `DELTA_vX.Y.Z.md` (`QA` column) + updated `RTM_MATRIX.csv` rows to update affected `AC-XX` assertions and run targeted regression only on impacted features.

---

## 3. Non-Negotiable Hub Rules
- **Zero Append-Only Bloat:** Never paste `v2 / v3 Remediation Addenda` or contradictory disclaimers into active spec sections.
- **Zero Unseeded Limits:** Every configurable timer, limit, threshold, or lookup list MUST have a concrete initial value in `00-project-core/SEED_DEFAULTS_CATALOG.md`.
- **Strict Gate Separation:** Hub files certify **Gate A (`READY_FOR_DEV`)** pure business rules; downstream engineering repos own **Gate B (`READY_TO_CODE`)** architecture, schemas, and code.

