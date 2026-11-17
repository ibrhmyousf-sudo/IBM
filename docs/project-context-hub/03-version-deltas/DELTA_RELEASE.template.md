# RELEASE DELTA PACK — `DELTA_v[X.Y.Z]`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `PRJ-[CODE]` |
| **Version Transition** | `From Version: v[1.0.0]` -> `To Version: v[1.1.0]` |
| **Release Date** | `YYYY-MM-DD` |
| **Change Triggers** | `CR-[XXX]`, `DEC-[XXX]` |
| **Affected Sprints & Features** | `S02: FEATURE-004` (`SRD-F004-... -> SRD-F004-...`); `00-project-core: SEED_DEFAULTS_CATALOG` |
| **Unchanged Sealed Features** | `All other sealed features retain prior feature_srd (0 cascade invalidations)` |
| **Archived Prior Snapshot** | `03-version-deltas/snapshots/v[1.0.0]/` |

> **Incremental Execution Rule (`GOV-POL-CANONICAL-EVOLUTION-v2.0`):** Active canonical files (`PROJECT_CONTEXT.md`, `SEED_DEFAULTS_CATALOG.md`, `FEATURE-XXX.md`) have already been updated **in-place** to reflect `To Version`. Humans and AI agents across all 5 teams consume this delta pack to apply surgical incremental updates **without re-reading unchanged specifications**.

---

## 1. Consolidated `WAS -> CURRENT` Rule, Seed & Screen Diff Table
| Hub Artifact | Target ID (`BR` / `SEED` / `ENUM` / `EL` / `AC`) | Change Kind (`ADD` / `MODIFY` / `REMOVE`) | WAS (Previous Baseline `v[1.0.0]`) | CURRENT (Active Canonical `v[1.1.0]`) | Trigger Ref | New Digest (`srd`) |
|---|---|---|---|---|---|---|
| `SEED_DEFAULTS_CATALOG.md` | `SEED-BOOKING-CANCEL-WINDOW` | `MODIFY` | `24 hours` free cancellation cutoff | `12 hours` free cancellation cutoff | `CR-001` | `SRD-SEED-...` |
| `SEED_DEFAULTS_CATALOG.md` | `SEED-BOOKING-LATE-FEE` | `ADD` | *(Did not exist)* | `10%` late cancellation fee when `< 12h` and `>= 2h` before slot | `CR-001` | `SRD-SEED-...` |
| `02-sprints/S02/FEATURE-004.md` | `BR-FEAT-004-02`, `EL-07`, `AC-04`, `AC-07` | `MODIFY` | Hard block cancellation `< 24h` | Free cancel `>= 12h`; `10%` fee cancel `2h..12h`; hard block `< 2h` | `CR-001` | `SRD-F004-...` |

---

## 2. Department Execution Checklists

### 2.1 `1. BA` (Business Analysis & Governance)
- [ ] Updated canonical rules, Visual Screen Decomposition (`EL-*`), `SEED-*` defaults, and `AC-*` rows **in-place** in affected files.
- [ ] Appended `Was / Current / Update Needed` row to Section 10/15 of each modified file.
- [ ] Re-ran two-pass `BA-01..BA-14` audit on modified features (`VALID = 100.0%`) and updated `SPRINT_<ID>_MANIFEST.md` `feature_srd` digests.
- [ ] Regenerated `04-traceability-and-exports/RTM_MATRIX.csv` and `GATE_EVIDENCE.csv`.

### 2.2 `2. PM` (Product & Delivery Management)
- [ ] Logged `CR-[XXX]` approval evidence and sprint capacity/schedule disposition in `01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md`.
- [ ] Confirmed whether impacted features are already in active development/production (`Retroactive data migration needed? [YES / NO]`).
- [ ] Distributed `DELTA_v[X.Y.Z].md` notification to Tech Lead, Mobile Lead, and QA Lead.

### 2.3 `3. Backend & Web (.ai)`
- [ ] Sync updated `00-project-core/` and `02-sprints/<SprintID>/FEATURE-XXX.md` into `docs/business-context/` (`@bcas-init`).
- [ ] Update `DatabaseSeeder` / config constants for modified `SEED-*` keys (`[list exact SEED-* IDs]`).
- [ ] Patch domain service validation/state guards for `[list exact BR-FEAT-* / ENUM-* IDs]` and update OpenAPI/Postman contracts if payload fields changed.
- [ ] Update/add Pest/Vitest tests mapped to `[list exact AC-* IDs]` and re-verify `Gate B: READY_TO_CODE`.

### 2.4 `4. Mobile (02-FLUTTER ENGINE)`
- [ ] *(Mark `NO ACTION REQUIRED — Backend/Admin-only delta` when `Mobile` is unaffected.)*
- [ ] Update screen elements `[list exact Screen Ref + EL-* IDs]` and screen states (`Section 3`).
- [ ] Sync updated/added `AR / EN` localization keys (`[list exact COPY-* keys]`) and countdown/threshold bindings (`SEED-*`).
- [ ] Verify `MB-01..15` impact (e.g., push copy `MB-12A`, deep link `MB-12B`, server-time cutoff `MB-11`).

### 2.5 `5. QA & Automation`
- [ ] Update existing automated/manual test assertions for modified ACs: `[list exact AC-* IDs]`.
- [ ] Add new boundary & negative test cases for added ACs/domain edge cases: `[list exact new AC-* / DOM-* IDs]`.
- [ ] Refresh QA scenario seed values (`@seed-feature`) to match updated `SEED-*` thresholds and run targeted regression on `[list affected FEATURE-* IDs]`.

