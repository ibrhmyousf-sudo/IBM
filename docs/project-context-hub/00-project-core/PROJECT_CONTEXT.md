# PROJECT CONTEXT — `ibrahem`

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | `IBR` |
| **Semantic Version** | `v1.0.0` |
| **Scope Mode** | `FULL_PROJECT` |
| **Context Status** | `DRAFT` |
| **Last Updated** | `2026-11-17` |
| **Governing Sources** | `BRD v1.0 (Approved 2026-11-17)` |
| **Semantic Digest** | `SRD-CTX-9BAC79AB80C6` |

> **Canonical State Rule (`.agrules`):** Pre-baseline edits (`v0.1..v0.9`) mutate sections in-place until `v1.0.0` (`BA_SEALED_BASELINE`). Post-baseline changes update the owning section in-place, increment the semantic version, append one row to **Section 15**, and emit `03-version-deltas/DELTA_vX.Y.Z.md`. Never append stacked `v2/v3` remediation addenda or contradictory disclaimers.

---

## 1. Vision & Scope Boundaries
- **Business Problem & Core Objective:** `Deliver auditable, role-scoped workflows and deterministic business governance for ibrahem (IBR).`
- **Active Channels / Surfaces:** `Web Portal, Admin Panel, Customer Mobile App (iOS/Android)`

| Boundary Tier | Capability / Module Summary | Source Ref | Phase / Disposition |
|---|---|---|---|
| **In-Scope (Current Release)** | `Core authentication, master lookups, transactional workflows, and audit trail` | `BRD §X.Y` | `MVP / Release 1` |
| **Conditional / Phase 2** | `Phase 2 extended analytics and external partner hooks` | `BRD §X.Z` | `Deferred — Phase 2` |
| **Explicitly Out-of-Scope** | `Unapproved billing bypasses or out-of-scope legacy admin surfaces` | `BRD §X.W` | `Excluded` |

---

## 2. Canonical Actor & Role Matrix (`ROLE-*`)
| Role ID | Canonical Name (EN) | Canonical Name (AR) | Surface Access | Authentication & Eligibility Boundary | High-Level Permission Scope | Source Ref |
|---|---|---|---|---|---|---|
| `ROLE-GUEST` | Guest Visitor | زائر | `Web / Mobile` | Unauthenticated | Browse public catalog/info only; zero mutations | `BRD §2.1` |
| `ROLE-CUST` | Customer | عميل | `Web / Mobile` | Verified phone/email + active account | Own profile, bookings/orders, ratings, notifications | `BRD §2.2` |
| `ROLE-ADMIN` | System Administrator | مدير النظام | `Admin Web` | Staff MFA / RBAC | Full operational management, seed configuration, audit review | `BRD §2.3` |

---


## 2A. Verified Codebase Master Entities Map (Auto-Discovered)

> **Authoritative Codebase Index:** `.ai/context/CODEBASE_MAP.md` (Auto-synced via `node bin/bcas-sync.js`)  
> **Discovered Codebase Assets:** **0** Backend Models, **0** Database Tables, **0** Service Contracts.  
> **Architecture Invariant:** Cross-domain relationships MUST reference scalar IDs only (`tenant_id`, `organization_id`, `user_id`). Direct SQL `JOIN` across module table boundaries is strictly prohibited.

## 3. Global Business Invariants (`BR-GLB-*`)
Shared business rules defined **once** here and inherited by ID (`BR-GLB-*`) in `FEATURE-XXX.md`. Each row carries an independent clause digest so updating one global rule only re-evaluates features binding that specific ID.

| Rule ID | Domain | Deterministic Business Invariant Statement | Exception / Override Condition | Bound Seed IDs | Clause Digest | Source Ref |
|---|---|---|---|---|---|---|
| `BR-GLB-001` | Monetary & Tax | `Round half-up to 2 decimal places per ISO currency precision` | `None unless explicitly amended by approved CR` | `SEED-FIN-001` | `SRD-BRG001` | `BRD §4.1` |
| `BR-GLB-002` | Identity & Session | `Deactivated or suspended accounts lose mutation access immediately across active sessions` | `Read-only historical receipt download when permitted` | `SEED-AUTH-001` | `SRD-BRG002` | `BRD §3.4` |

---

## 4. Shared Workflows & Lifecycles (`WF-SHD-*`)
| Workflow ID | Process Name | Initiating Actor | Participating Features (`FEATURE-*`) | Canonical State Progression (`ENUM-*`) | Terminal Outcomes | Source Ref |
|---|---|---|---|---|---|---|
| `WF-SHD-001` | `End-to-End Core Request Lifecycle` | `ROLE-CUST` | `FEATURE-001 -> FEATURE-002 -> FEATURE-003` | `DRAFT -> SUBMITTED -> APPROVED -> COMPLETED \| CANCELLED` | `COMPLETED`, `CANCELLED`, `REJECTED` | `BRD §5.1` |

---

## 5. Shared UX, Copy & Formatting Conventions (`CONV-SHD-*`)
| Convention ID | Topic | Mandatory Business-Visible Standard | Supported Locales & Direction | Bound Seed / Enum Ref | Source Ref |
|---|---|---|---|---|---|
| `CONV-SHD-001` | Locales & RTL/LTR | Arabic (`ar`, RTL) & English (`en`, LTR); user-switchable without data loss | `ar`, `en` | — | `BRD §6.1` |
| `CONV-SHD-002` | Date, Time & Currency | Display timezone `Asia/Riyadh`, `24h/12h` format, ISO currency `SAR` | `ar`, `en` | `SEED-LOC-001` | `BRD §6.2` |
| `CONV-SHD-003` | Destructive Actions | Irreversible cancel/delete/reject requires explicit confirmation modal + reason when mandated | `ar`, `en` | — | `BA-STD` |

---

## 6. Multi-Tenancy & Access Isolation Policy
| Isolation Dimension | Scoping Entity (`Tenant / Organization / Branch / Self`) | Cross-Boundary Visibility Rule | Admin Override Policy | Source Ref |
|---|---|---|---|---|
| Customer Data | `Self (Authenticated Account)` | Zero visibility into other customers' records (`IDOR` hard block) | Authorized `ROLE-ADMIN` support view with audit trail | `BRD §3.5` |
| Operational Branch / Vendor | `Branch-Scoped` | `Actors view and mutate only records bound to assigned branch or tenant IDs` | `Authorized Super-Admin cross-branch support view with audit log` | `BRD §3.6` |

---

## 7. Privacy, Data Classification & PII Rules (`SEC-PII-*`)
| Policy ID | Data Category | Fields Covered | Masking / Display Rule in UI & Exports | Retention / Deletion Business Rule | Regulatory Basis (Source-Verified Only) |
|---|---|---|---|---|---|
| `SEC-PII-001` | Tier 1 Sensitive Identity | National ID / Iqama / Tax ID / Payment Instrument | Masked in lists (`****1234`); full view restricted to authorized role | `Per approved BRD retention and anonymization schedule` | `BRD §8.1` |
| `SEC-PII-002` | Tier 2 Contact PII | Mobile number, email, physical address | Visible only to owning actor and assigned operational fulfilment role | Account closure anonymizes/retains per ledger law | `BRD §8.2` |

---

## 8. External Integrations & Source-of-Truth Boundaries (`INT-EXT-*`)
| Integration ID | External Provider / Domain | Business Purpose | System of Record (Authoritative Truth) | Fallback / Timeout Business Outcome | Consuming Features | Source Ref |
|---|---|---|---|---|---|---|
| `INT-EXT-001` | `Configured Payment Gateway` | Card / wallet charge & refund | External Gateway Settlement Status | Mark `PENDING_VERIFICATION`; block duplicate charge; reconcile before fulfilment | `FEATURE-XXX` | `BRD §7.1` |
| `INT-EXT-002` | `Configured SMS / OTP Provider` | Identity verification & critical alerts | Internal OTP Challenge Ledger | Enforce resend cooldown (`SEED-AUTH-002`); surface clear retry message | `FEATURE-XXX` | `BRD §7.2` |

---

## 9. Notification Channels & Dispatch Governance
| Channel | In-Scope? (`YES/NO`) | Trigger Policy | User Opt-Out Allowed? | Quiet Hours / Throttling Seed | Deep-Link Target Rule (`MB-12A/12B`) | Source Ref |
|---|---|---|---|---|---|---|
| In-App Notification Center | `YES / NO` | Transactional state transitions | `NO` (mandatory operational history) | `SEED-NOTIF-001` | Route to owning entity detail screen | `BRD §6.4` |
| Mobile Push (`MB-12A`) | `YES / NO` | Approved high-value events only | `YES` (OS/App settings) | `SEED-NOTIF-002` | Fallback to list/login if entity revoked | `BRD §6.4` |
| Email / SMS | `YES / NO` | OTP, receipts, critical security events | `NO` for security/OTP | `SEED-AUTH-002` | Web/Universal link where scoped | `BRD §6.4` |

---

## 10. Auditability & Immutable Ledger Rules
| Audit Scope | Mandatory Logged Business Attributes | Retention Visibility | Consuming Role / Feature | Source Ref |
|---|---|---|---|---|
| State & Approval Mutations | `Actor ID`, `Role`, `Timestamp`, `Entity ID`, `Previous State`, `New State`, `Reason/Comment` | Read-only immutable log | `ROLE-ADMIN` (`FEATURE-XXX`) | `BRD §8.3` |
| Seed / Policy Parameter Edits | `Parameter Key (SEED-*)`, `Old Value`, `New Value`, `Approving Admin`, `Effective Timestamp` | Read-only immutable log | `ROLE-ADMIN` | `BRD §8.3` |

---

## 11. Non-Functional Requirement Baselines (Source-Evidenced Only)
> Record **only** measurable targets explicitly approved in the BRD/SOW. Never invent universal `2s` response times or compliance mandates.

| NFR ID | Category (`Availability / Throughput / Localization / Accessibility`) | Approved Measurable Business Target | Scope / Peak Condition | Source Ref |
|---|---|---|---|---|
| `NFR-GLB-001` | `Localization & Accessibility Baseline` | `Bilingual AR (RTL) / EN (LTR) parity across active views` | `All active customer and admin surfaces` | `BRD §9.1` |

---

## 12. Cross-Sprint Assumptions & Phased Dependency Rules
| Assumption ID | Statement | Impacted Sprints / Features | Approved Interim Behavior (If Dependent Feature Is Future Sprint) | Sign-Off Owner |
|---|---|---|---|---|
| `ASM-001` | `Wave 1 foundation and master lookups ship before Wave 2 dependent transactions` | `S02 (FEATURE-005)`, `S03 (FEATURE-014)` | `FEATURE-005` reaches `COMPLETED` cleanly without rendering dead "Rate Now" CTA until `S03` | `PO / BA Lead` |

---

## 13. Shared Seed & Enum Binding Summary
- **Ubiquitous Terms & Status Badges:** Bound to [00-project-core/GLOSSARY_AND_ENUMS.md](./GLOSSARY_AND_ENUMS.md).
- **Operational Limits, Timers & Toggles:** Bound to [00-project-core/SEED_DEFAULTS_CATALOG.md](./SEED_DEFAULTS_CATALOG.md) (`0` unseeded numeric limits permitted at seal).

---

## 14. Open Escalations & Source Conflicts (`0` Required at `BA_SEALED_BASELINE`)
| Escalation ID | Conflicting / Missing Clause | Affected IDs | Blocking? | Decision Owner | Resolution Status |
|---|---|---|---|---|---|
| `NONE` | Zero open material business escalations at baseline seal | — | `NO` | — | `CLOSED` |

---

## 15. Global Evolution & Version History (`Was / Current / Update Needed`)
| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM (`BA`, `PM`, `Dev`, `Mobile`, `QA`) |
|---|---|---|---|---|---|---|
| `v1.0.0` | `2026-11-17` | Initial Baseline Seal | `ALL` | Pre-baseline draft (`v0.x`) | Sealed `BA_SEALED_BASELINE` (`0` open blockers) | `BA`: Baseline sealed \| `PM`: Lock Sprint Plan \| `Dev`: Ingest via `@bcas-init` \| `Mobile`: Bind `CONV-SHD-*` & enums \| `QA`: Establish baseline RTM |

