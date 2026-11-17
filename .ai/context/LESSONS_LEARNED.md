# Institutional Memory & Self-Healing Project Knowledge (`LESSONS_LEARNED.md`)

| ID | Domain / Component | Context & Anti-Pattern Discovered | Hard Institutional Invariant | Resolved Date |
| :--- | :--- | :--- | :--- | :--- |
| **LL-01** | `SPRINT_SPECS / SPRINT_SPECS_EMPTY` | Recurring gate failure (3 retries): No FEATURE-*.md files found in '02-sprints/S1/'. | Author canonical 11-section FEATURE-*.md specs inside '02-sprints/S1/'. | 2026-11-17 |
| **LL-02** | `GATE_A_SEAL / FR_AC_TRACE` | Recurring gate failure (2 retries): FR-01 lists AC-03, but AC-03 does not trace back to FR-01 or its story. | Fix 'FR_AC_TRACE' in '02-sprints/S1/FEATURE-003.md': FR-01 lists AC-03, but AC-03 does not trace back to FR-01 or its story. | 2026-11-17 |
