# `00-project-core/` — Structural Guide

Shared project-wide business constants referenced by ID across all Sprint Feature specifications (defined once here, never duplicated with drift).

## Expected Canonical Files
| Filename | Template File | Purpose & Required Sections |
|---|---|---|
| `PROJECT_CONTEXT.md` | `./PROJECT_CONTEXT.template.md` | Authoritative BRD/CR source register, vision/scope, `ROLE-*` matrix, `BR-GLB-*`, `WF-SHD-*`, `CONV-SHD-*`, Multi-Tenancy, `SEC-PII-*`, `INT-EXT-*`, Notifications, Audit, NFRs, Assumptions, `0` Open Escalations, and **Section 15: Global Evolution & Version History**. |
| `GLOSSARY_AND_ENUMS.md` | `./GLOSSARY_AND_ENUMS.template.md` | Bilingual (`AR` / `EN`) Ubiquitous Language glossary and Canonical Status & Badge Enum Registry (`ENUM-*`) with UI semantic badge tones and allowed transitions. |
| `SEED_DEFAULTS_CATALOG.md` | `./SEED_DEFAULTS_CATALOG.template.md` | Concrete Day-1 operational parameters (`SEED-*`: Limits, Timers, Uploads, Pagination, Toggles, Lookups) eliminating unconfigured "fail-closed" gaps. |

