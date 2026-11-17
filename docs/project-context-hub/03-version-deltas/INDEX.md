# `03-version-deltas/` — Structural Guide

Cross-department evolution delta packs and immutable read-only baseline archives governed by `GOV-POL-CANONICAL-EVOLUTION-v2.0.md`.

## Expected Contents
| Path / Pattern | Template File | Purpose & Required Sections |
|---|---|---|
| `DELTA_vX.Y.Z.md` | `./DELTA_RELEASE.template.md` | Emitted on every post-`v1.0.0` version bump (`v1.1.0`, `v2.0.0`). Consolidates `WAS -> CURRENT` rule/seed/screen diffs and separate execution checklists for `1. BA`, `2. PM`, `3. Backend & Web (.ai)`, `4. Mobile (02-FLUTTER ENGINE)`, and `5. QA & Automation`. |
| `snapshots/vX.Y.Z/` | — | Read-only historical archive of superseded baseline releases (`snapshots/v1.0.0/`, etc.) preserved strictly for audit/contractual forensics—never loaded as active implementation context by coding agents. |

