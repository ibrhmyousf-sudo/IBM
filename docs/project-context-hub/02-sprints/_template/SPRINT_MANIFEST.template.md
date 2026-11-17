# SPRINT MANIFEST & HANDOFF PACK — `[SPRINT_ID]`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `PRJ-[CODE]` |
| **Sprint / Batch ID** | `[S01 / B1]` |
| **Manifest Version** | `v1.0.0` |
| **Bound Project Context** | `00-project-core/PROJECT_CONTEXT.md @ v1.0.0 (SRD-CTX-...)` |
| **Bound Seed Catalog** | `00-project-core/SEED_DEFAULTS_CATALOG.md @ v1.0.0 (SRD-SEED-...)` |
| **Batch Gate A Status** | `DRAFT_IN_REVIEW` \| `PARTIALLY_SEALED` \| `ALL_READY_FOR_DEV` |
| **Batch Gate B Status** | `PENDING_ENG_AUDIT` \| `READY_TO_CODE` |
| **Last Updated** | `YYYY-MM-DD` |

---

## 1. Gate A Readiness Summary
| Metric | Value | Requirement for Sprint Handoff |
|---|---|---|
| **Scoped Functional Features** | `[N]` | Matches `SPRINT_MASTER_PLAN.md` for `[SPRINT_ID]` |
| **Gate A `READY_FOR_DEV` Features** | `[N / N]` | `100.0%` `VALID` score on applicable `BA-01..BA-14` checks (`0 FAIL`, `0 PENDING`) |
| **Unseeded Numeric / Timer Limits** | `0` | All limits/timers bound to `SEED-*` rows in `SEED_DEFAULTS_CATALOG.md` |
| **Cross-Feature Semantic Collisions** | `0` | Verified enum codes, status transitions, and `HARD_PREREQ` ordering |
| **Open Material `BA_OWNED` Questions** | `0` | Consolidated Sprint Decisions Snapshot explicitly approved by BA/PO |

---

## 2. Feature Readiness & Scoped Semantic Digest Roster
> **Surgical Re-Seal Guarantee (`GOV-POL-CANONICAL-EVOLUTION-v2.0`):** Updating one feature recomputes ONLY that row's `feature_srd` without invalidating peer `READY_FOR_DEV` features in this manifest.

| Wave (`1`/`2`/`3`) | Feature ID | Spec File | Archetype | Channels | Gate A (`BA`) | `VALID %` | Semantic Rule Digest (`feature_srd`) | Gate B (`Eng`) |
|---|---|---|---|---|---|---|---|---|
| `1` | `FEATURE-001` | `./FEATURE-001.md` | `MUTATION_WORKFLOW` | `Web`, `Mobile`, `Admin` | `READY_FOR_DEV` | `100.0%` | `SRD-F001-[12HEX]` | `PENDING` |
| `1` | `FEATURE-003` | `./FEATURE-003.md` | `READ_VIEW` | `Web`, `Mobile` | `READY_FOR_DEV` | `100.0%` | `SRD-F003-[12HEX]` | `PENDING` |

---

## 3. Cross-Feature Collision & Dependency Check
| Check ID | Verification Rule | Verdict (`PASS` / `FAIL`) | Evidence / Notes |
|---|---|---|---|
| `XFC-01` | Every `HARD_PREREQ` feature is sealed in an earlier Wave or earlier Sprint | `PASS` | `Wave 1` precedes `Wave 2/3` |
| `XFC-02` | Shared status codes & badge tones match `GLOSSARY_AND_ENUMS.md` `1:1` | `PASS` | Zero conflicting status names |
| `XFC-03` | Shared global rules (`BR-GLB-*`, `CONV-SHD-*`) are referenced by ID, never forked inline | `PASS` | Verified against `PROJECT_CONTEXT.md` |
| `XFC-04` | Deferred downstream features (`Wave 3` / future sprint) leave zero dead-end CTAs in current screens | `PASS` | Documented in `ASM-*` |

---

## 4. Supporting Work Prerequisites (`SUP-*`) Before Gate B
| Supporting ID | Type | Required Before Feature(s) | Owner | Status (`OPEN` / `READY`) |
|---|---|---|---|---|
| `SUP-CNT-001` | `Content Catalog` | `FEATURE-001`, `FEATURE-003` | `BA / Content` | `READY` |
| `SUP-INT-001` | `Integration Enabler` | `[If applicable]` | `Tech Lead` | `OPEN` |

---

## 5. Downstream Department Handoff Checklist
- **1. Backend & Web (`Dev` / `.ai`):**
  - [ ] Run `@bcas-init` to sync `00-project-core/` and `02-sprints/[SPRINT_ID]/` into `docs/business-context/`.
  - [ ] Provision all bound `SEED-*` defaults from `SEED_DEFAULTS_CATALOG.md` in `DatabaseSeeder`.
  - [ ] Complete **Section 11 (`ENG-01..ENG-10`)** in each `FEATURE-XXX.md` to promote `Gate B -> READY_TO_CODE` before `@implement`.
- **2. Mobile (`02-FLUTTER ENGINE`):**
  - [ ] Ingest features tagged `Mobile` (`M01..MXX` Visual Screen Decomposition + Section 3 Screen States + Section 6B `MB-01..15` outcomes).
  - [ ] Bind bilingual `AR / EN` keys from Section 7 and enum badge tones from `GLOSSARY_AND_ENUMS.md`.
- **3. QA & Automation:**
  - [ ] Map `AC-01..n` (Section 8), `DOM-*` (Section 6A), and `SCN-01..06` (Section 6B) `1:1` into automated & UAT test cases.
  - [ ] Provision test data matching `SEED-*` boundary thresholds.

---

## 6. Manifest Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA`, `PM`, `Dev`, `Mobile`, `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `YYYY-MM-DD` | Unified `08+09` Sprint Seal | `ALL` | Sprint draft specs (`v0.x`) | Sprint batch sealed `READY_FOR_DEV` | `BA`: Sealed \| `PM`: Kick off Gate B \| `Dev`: Run Gate B & `@implement` \| `Mobile`: Implement `Mobile` features \| `QA`: Build sprint test suite |

