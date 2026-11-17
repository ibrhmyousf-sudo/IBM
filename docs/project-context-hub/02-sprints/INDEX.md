# `02-sprints/` — Structural Guide

Sprint- or Batch-partitioned canonical Feature specifications (`02-sprints/<SprintID>/`, e.g., `B0/`, `B1/` or `S01/`, `S02/`).

## Expected Per-Sprint Structure (`02-sprints/<SprintID>/`)
| Filename Pattern | Starter Templates (`./_template/`) | Purpose & Required Sections |
|---|---|---|
| `SPRINT_<ID>_MANIFEST.md` | `./_template/SPRINT_MANIFEST.template.md` | Sprint batch seal summary, per-feature Gate A status & `feature_srd` digest roster, cross-feature collision checks, `SUP-*` prerequisites, and `Dev / Mobile / QA` handoff checklists. |
| `FEATURE-XXX.md` | `./_template/FEATURE_SPEC.template.md`, `./_template/FEATURE_READ_VIEW.example.md`, `./_template/FEATURE_MUTATION_WORKFLOW.example.md` | 11-section intent-aware canonical spec: Metadata, Objective/Actors, **Visual Screen Decomposition**, **UI Lifecycle States**, Deterministic `BR-FEAT-*` & `SEED-*` Bindings, `5A READ_VIEW` / `5B MUTATION` Contract, `6A DOM-*` + `6B SCN-01..06 & MB-01..15` (`MB-12A/12B`), Bilingual `AR/EN` Copy, `AC-01..n`, `BA-01..14` Scorecard, `Was/Current/Update Needed` Ledger, and Reserved `ENG-01..10` Gate B Appendix. |

