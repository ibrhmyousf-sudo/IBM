# Project Context Document (BCAS Master Reference)

| Attribute | Details |
| :--- | :--- |
| **Project Name** | `[Project Name]` |
| **Document ID** | `BCAS-CTX-001` |
| **Version** | `1.0.0` |
| **Status** | `ACTIVE` |
| **Target Platforms** | `Web Admin`, `Member Portal`, `Mobile (iOS / Android)` |
| **Supported Locales**| `ar-SA` (Primary / RTL), `en-US` (Secondary / LTR) |

---

> ### 🤖 AI AGENT OPERATIONAL DIRECTIVE
> 1. **Single Source of Truth:** This document defines the authoritative domain identity, global business rules, glossary, and shared constraints for the entire project.
> 2. **Rule Precedence:** Global rules (`BR-GLB-xxx`) defined here take precedence over any ambiguous feature-level assumptions. Feature-specific rules (`BR-FEAT-xxx`) can specialize or constrain global rules, but cannot violate them without an approved exception.
> 3. **Master Entity Reusability:** Inspect Section 2A (`Verified Codebase Master Entities Map`). Never invent shadow database tables or duplicate Eloquent models for entities already registered as Master tables.
> 4. **Zero-Hallucination Invariant:** Cross-check every table name, foreign key, and enum value against `.ai/context/CODEBASE_MAP.md`.

---

## 1. Project Identity & Architecture Core
- **Domain Identity:** `[Unified Sports & Athletic Club Management System (UCMS)]`
- **Core Purpose:** `[End-to-end administration of memberships, academies, amateur sports, facilities booking, events, point-of-sale, and gate access.]`
- **Architectural Pattern:** Microservice-Minded Modular Monolith (HMVC Packages with zero cross-domain SQL joins).
- **Backend Stack:** Laravel 11+, PostgreSQL 16+, Redis, OpenAPI JSON-First.
- **Frontend / Mobile Stack:** Vue 3 Composition API / Nuxt 3, Flutter / React Native, Pinia, Tailwind / CSS Tokens.

---

## 2. Business Domain & Glossary

| Term (EN) | Term (AR) | Domain Meaning & Scope |
| :--- | :--- | :--- |
| **Member** | عضو | An individual possessing an active or historical membership contract in the club. |
| **Dependent** | تابع | A family member (child, spouse, parent) attached to a primary member's contract. |
| **Academy** | أكاديمية | Structured training programs (e.g. Football, Swimming) organized into levels and batches. |
| **Facility** | مرفق / منشأة | Physical club assets (pitches, courts, halls) rentable by members or external guests. |
| **Subscription** | اشتراك | Recurring or term-based access agreement governing club or sport utilization. |
| **Branch** | فرع | Physical facility/branch location operating distinct resources and schedules. |

---

## 2A. Verified Codebase Master Entities Map (Auto-Discovered)

> **Source:** `.ai/context/CODEBASE_MAP.md` | Auto-synced via `node .ai/bin/bcas-sync.js`

| Master Entity | Primary Table | Primary Eloquent Model | Domain Package | Scalar Identifier |
| :--- | :--- | :--- | :--- | :--- |
| **Member** | `members` / `mod_members` | `Member` | `Memberships` | `member_id` (UUID) |
| **User / Account** | `users` / `mod_core_users` | `User` | `CoreIdentity` | `user_id` (UUID) |
| **Branch** | `mod_set_branches` | `Branch` | `Settings` | `branch_id` (BigInt) |
| **Facility** | `mod_facility_facilities` | `Facility` | `Facilities` | `facility_id` (BigInt) |
| **Academy** | `mod_acad_academies` | `Academy` | `Academies` | `academy_id` (BigInt) |
| **Subscription** | `mod_membership_subscriptions` | `Subscription` | `Memberships` | `subscription_id` (UUID) |

*Directive: Scalar references only. Prohibit physical cross-domain foreign keys.*

---

## 3. Global Business Rules (BR-GLB)

| Rule ID | Title | Global Rule Statement | Retroactive Impact Policy |
| :--- | :--- | :--- | :--- |
| `BR-GLB-001` | **Identity Uniqueness** | National ID / Iqama is universally unique across all member and account records. | Existing duplicates require administrative deduplication merge flow. |
| `BR-GLB-002` | **Dual Localization** | All end-user facing text, statuses, error codes, and audit events must be stored/served in both Arabic and English. | Schema columns must support dual-locale JSON or standardized translation keys. |
| `BR-GLB-003` | **Financial Immutability** | Financial transactions, invoices, and ledger entries are write-once, append-only. Zero `UPDATE` or `DELETE` on finalized invoices. | Adjustments require credit/debit notes (`REFUND` or `ADJUSTMENT`). |
| `BR-GLB-004` | **Soft Delete & Audit** | Master records use soft deletes (`deleted_at`). Audit logs record `actor_id`, `ip_address`, `timestamp`, `old_values`, `new_values`. | Non-destructive schema invariants. |
| `BR-GLB-005` | **Timezone Handling** | All timestamps stored in UTC (`timestamp with time zone`). Rendered in `Asia/Riyadh` (`UTC+3`) by default for users. | Migration column types must strictly enforce timestamptz. |

---

## 4. Scope Boundaries

### 4.1 In Scope (System Responsibilities)
- Multi-branch administration, access gate pass validation, unified customer portal, automated subscription renewal, class booking, coach scheduling, digital payments & ZATCA e-invoicing.

### 4.2 Out of Scope (External Responsibilities)
- Core bank reconciliation (delegated to ERP / external accounting).
- Hardware firmware controllers (delegated to Turnstile Gate Controller Gateways via REST webhook).

---

## 5. Shared Workflows & Conventions

### 5.1 Shared Workflows (WF-SHD)
- **`WF-SHD-001` (Digital Payment Checkout):** Cart / Booking ➔ Invoice Scaffolding ➔ Payment Gateway Redirect / SDK ➔ Webhook Notification ➔ Idempotent Status Transition ➔ ZATCA QR Receipt Generation ➔ Access Permission Activation.
- **`WF-SHD-002` (Gate Attendance Verification):** NFC / QR Scan ➔ Offline-tolerant Gate Cache Check ➔ Active Subscription Validation ➔ Facility Booking Check ➔ Turnstile Pulse ➔ Async Presence Event Sync.

### 5.2 Cross-Platform Conventions (CONV-SHD)
- **`CONV-SHD-001` (Error Payloads):** Standard RFC 7807 Problem Details format: `{ "type", "title", "status", "detail", "code", "errors", "locale": "ar" }`.
- **`CONV-SHD-002` (Currency & Decimals):** All amounts stored as integers in smallest currency unit (Halalas / Cents) or strictly typed `DECIMAL(12, 2)`. Zero floating point representation.

---

## 6. Roles & RBAC Matrix

| Role Code | Role Name (AR) | Access Scope | Description |
| :--- | :--- | :--- | :--- |
| `SUPER_ADMIN` | المدير العام | Global (All Branches) | Unrestricted system configuration, financial audits, security policies. |
| `BRANCH_MANAGER` | مدير الفرع | Branch-Scoped | Operational management, staff schedules, facility availability in assigned branch. |
| `RECEPTIONIST` | موظف الاستقبال | Branch-Scoped | Member check-in, walk-in registration, cash collection, manual pass issue. |
| `COACH` | مدرب | Assignment-Scoped | Roster inspection, attendance marking, performance evaluations. |
| `MEMBER` | عضو النادي | Self & Dependents | Self-service booking, renewals, profile management, digital membership pass. |

---

## 7. Shared Constraints & Regulatory Compliance
- **KSA Compliance:**
  - **ZATCA Phase 2:** Cryptographic stamp, UUID, invoice counter, and QR TLV structure on all tax invoices.
  - **SDAIA PDPL:** Explicit member consent logging, data minimization, right to erasure workflows, encrypted PII.
  - **NCA ECC:** Strong password policies, MFA on administrative access, session timeouts (15 minutes idle).

---

## 8. Global Open Decisions (DEC-GLB)

| Decision ID | Area | Question / Trade-off | Status | Decision Owner |
| :--- | :--- | :--- | :--- | :--- |
| `DEC-GLB-001` | Billing | Grace period for auto-renewals before access gate lockout (3 days vs 7 days). | `Resolved (3 Days)` | Business Lead |
| `DEC-GLB-002` | Dependents | Maximum age for child dependent under family subscription (18 vs 21). | `Open` | Legal / Product |

---

## 9. Global Context Audit Gate
- [ ] Section 2A verified against latest `.ai/context/CODEBASE_MAP.md`.
- [ ] All `BR-GLB` rules evaluated for backward compatibility.
- [ ] Zero unassigned blocking decisions in Section 8 for active sprint scope.

---

## 10. Version & Rule Change Log

| Version | Date | Author | Summary of Changes |
| :--- | :--- | :--- | :--- |
| `1.0.0` | `[YYYY-MM-DD]` | Principal Systems Architect | Initial baseline aligned with BCAS v3.5.0 standards. |
