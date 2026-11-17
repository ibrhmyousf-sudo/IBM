# `03-version-deltas/snapshots/` — Read-Only Baseline Archive

Stores immutable point-in-time baseline snapshots (e.g., `v1.0.0/`) archived automatically before post-baseline CR mutations.

> **AI Agent Rule:** Do **NOT** read `snapshots/**` when implementing active features unless explicitly performing a historical forensic diff; active canonical truth always resides in `00-project-core/`, `01-roadmap-and-pm/`, and `02-sprints/`.

