# `04-traceability-and-exports/` — Structural Guide

Derived traceability matrices, quality gate evidence registers, and stakeholder-facing office exports compiled deterministically from the Markdown Single Source of Truth (`GOV-POL-MARKDOWN-FIRST-PIPELINE-v2.0.md`).

## Expected Generated Artifacts
| Path / Filename | Purpose |
|---|---|
| `RTM_MATRIX.csv` | Automated bidirectional Requirements Traceability Matrix (`BRD Clause / CR -> Component -> Epic -> Feature ID -> Sprint/Wave -> FR/BR/SCN/MB -> AC-ID -> Gate A Status -> Semantic Rule Digest`). |
| `GATE_EVIDENCE.csv` | Consolidated `BA-01..BA-14` audit scorecard, `VALID %`, decision snapshot approval ref, and `feature_srd` ledger per Feature across all sprints. |
| `stakeholder-docs/` | Client- and executive-ready `.docx` (Scope Summary, Sprint Story Packs) and `.xlsx` (Product Backlog, RTM Workbook) exports compiled from canonical Markdown—never edited manually out-of-band. |

