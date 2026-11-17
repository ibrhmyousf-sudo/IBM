# Cycle Handoff & QA/Mobile Automation Pack: `[CYCLE_ID]`

> **CYCLE ID:** `[CYCLE_ID]`  
> **WORKFLOW MODE:** `[implement | specs | feature | bug | refactor_legacy | sprint_plan | release]`  
> **SCOPE / FEATURES:** `[FEATURE-IDs / Module Names]`  
> **GENERATED AT:** `[ISO-8601 Timestamp]`  
> **GIT BASELINE:** `Branch: [branch] | Commit: [short_sha]`  
> **STACK API DOCS CONFIG:** `json_openapi: [true|false] | postman: [true|false]`  
> **TARGET TEAMS:** `QA Automation Engineers (Playwright / Cypress / Appium / Newman)` & `Mobile Engineers (Flutter / iOS / Android)`

---

## 1. Cycle Executive Delta Summary

| Metric | Count / Status | Details |
| :--- | :--- | :--- |
| **Impacted Modules** | `[N]` | `[ModuleA, ModuleB]` |
| **API Endpoints Touched** | `[N]` | `[Added / Modified / Deprecated]` |
| **UI `data-testid` Locators** | `[N]` | `[New / Updated deterministic selectors]` |
| **OpenAPI Specification** | `[ENABLED / BYPASSED]` | `[docs/modules/{module}.json or disabled in stack.json]` |
| **Postman Collection v2.1** | `[ENABLED / BYPASSED]` | `[docs/postman/{module}.postman_collection.json or disabled in stack.json]` |
| **Client SDK Packages** | `[AVAILABLE / BYPASSED]` | `[docs/sdk/dart/ & docs/sdk/ts/ or disabled in stack.json]` |
| **Module Handoff Guides** | `[LINKED]` | `[docs/handoff/{MODULE}_INTEGRATION_GUIDE.md]` |
| **Feature Handoff Guides** | `[LINKED]` | `[docs/handoff/features/]` |
| **Quality Gate Clearance** | `[🟢 ALL GATES CLEARED / 🔴 ACTION REQUIRED]` | `[Security Score, Performance Grade, Drift Radar Status]` |

---

## 2. Governance, Security & Performance Quality Gate Clearance

| Gate Engine | Score / Grade | Findings / Blockers | Clearance Status | Authoritative Report |
| :--- | :--- | :--- | :--- | :--- |
| **AI Security Fuzzer & IDOR Audit** | `[100% Grade A+]` | `[0 Critical, 0 High findings]` | `[CLEARANCE_GRANTED]` | `docs/security/SECURITY_AUDIT_REPORT.md` |
| **.NET & Frontend Standards Audit** | `[0 NET-S* / FE-S* / FE-Q* findings]` | `[bin/dotnet-audit.js, bin/frontend-audit.js]` | `[CLEARANCE_GRANTED]` | `docs/security/SECURITY_AUDIT_REPORT.md` |
| **Performance Bottleneck Predictor** | `[100% Grade A+]` | `[0 Bottlenecks, ESR Composite Indexes]` | `[CLEARANCE_GRANTED]` | `docs/architecture/PERFORMANCE_BOTTLENECK_REPORT.md` |
| **Semantic Drift & Conflict Radar** | `[100% HEALTHY]` | `[0 Schema Drift, 0 Collisions, 0 Test Gaps]` | `[CLEARANCE_GRANTED]` | `docs/business-context/DRIFT_RADAR_REPORT.md` |
| **Self-Healing Institutional Memory** | `[Active]` | `[Continuous LESSONS_LEARNED.md updates]` | `[CLEARANCE_GRANTED]` | `.ai/context/LESSONS_LEARNED.md` |

---

## 3. Mobile & API Contract Delta Matrix

### 3.1 Changed / Affected Endpoints in This Cycle
| Change | Method | Endpoint Path | Auth | `X-Idempotency-Key` | Chaining Keys (`data.*`) | Breaking? |
| :-: | :-: | :--- | :-: | :-: | :--- | :-: |
| `ADDED` | `POST` | `/api/v1/[module]` | Bearer | Required (UUIDv4) | `id`, `code`, `status` | No |
| `MODIFIED` | `PUT` | `/api/v1/[module]/{id}` | Bearer | Optional | `id`, `code`, `status` | No |
| `ADDED` | `GET` | `/api/v1/[module]/{id}` | Bearer | N/A | Read-only DTO | No |

### 3.2 Mobile DTO, Enum & Envelope Notes
- **Unified Success Envelope:** `{ "success": true, "message": "...", "data": { "id": ..., "code": "...", "status": "..." }, "meta": {} }`
- **Unified Error Envelope:** `{ "success": false, "code": "ERR_*", "message": "AR/EN localized message", "errors": {} }`
- **Payload / Schema Deltas:**
  - `[field_name]` (`[type]`, `[nullable/required]`): `[Description & validation rule]`
- **State Machine Transitions Introduced/Updated:**
  - `[draft] -> [pending_approval] -> [active | rejected]`

### 3.3 Mobile (`02-FLUTTER ENGINE`) `MB-01..15`, `ENUM-*`, §3 Lifecycle, §7 Copy & `WAS -> CURRENT` Deltas
- **`MB-01..MB-15` Coverage:**
  - `MB-01..MB-11`: Null-safe DTOs, `Accept-Language: ar|en`, `{ id, code, status }` chaining, pagination & RTL parity.
  - `MB-12A` (Push Notifications): FCM/APNs data payload `{ event_type, entity_id, entity_code, status }`.
  - `MB-12B` (Deep Links): Universal/App Link URI `/[module]/{id}` with cold-start auth redirect.
  - `MB-13..MB-15`: `X-Idempotency-Key` UUIDv4 replay guard, offline retry handling, PII-free telemetry.
- **`ENUM-*` Bilingual Badges & §7 Copy Keys:** Sync status badges from `00-project-core/GLOSSARY_AND_ENUMS.md` and `ar`/`en` copy keys from Spec §7.
- **Spec §3 UI Lifecycle Matrix:** Verify `LOADING`, `EMPTY`, `ERROR`, and `POPULATED` deterministic `data-testid="[module]-state-*"` states.
- **Active `WAS -> CURRENT` Delta Changelog:** Document any applied `03-version-deltas/DELTA_*.md` mutations affecting DTOs or QA assertions.

---

## 4. QA UI & Mobile Locator Delta (`data-testid`)

All interactive elements added or updated in this cycle expose deterministic locators per `006-qa-testability-and-handoff.md`:

| Module / View | `data-testid` Selector | Element Role | Automation Action |
| :--- | :--- | :--- | :--- |
| `[module]` | `data-testid="[module]-form"` | Form Container | `assert-visible` |
| `[module]` | `data-testid="[module]-[field]-input"` | Input Control | `fill / type` |
| `[module]` | `data-testid="[module]-submit-btn"` | Primary Submit | `click` |
| `[module]` | `data-testid="[module]-row-{id}"` | Dynamic List Row | `assert-row-by-id` |
| `[module]` | `data-testid="[module]-status-badge"` | State Indicator | `assert-status` |
| `[module]` | `data-testid="[module]-error-alert"` | Validation Banner | `assert-error` |

---

## 5. End-to-End Automation & Request Chaining Plan

### 5.1 Automated API Chaining Sequence (QA Gate B)
1. **Create / Initiate (`POST`):** Submit payload with `Accept-Language: ar` and `X-Idempotency-Key: <uuid>` -> Assert `201 Created` -> Capture `data.id` into `{{last_created_id}}` and verify `data.status`.
2. **Mutate / Transition (`PUT` / `POST`):** Call `/api/v1/[module]/{{last_created_id}}/[action]` -> Assert `200 OK` and updated `data.status`.
3. **Verify Persistence (`GET`):** Fetch `/api/v1/[module]/{{last_created_id}}` -> Confirm state, localized labels, and scalar type integrity.

### 5.2 Cycle Acceptance & Negative Test Matrix
| Test ID | AC / Ref | Category | Input / Trigger | Expected HTTP / UI Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CYC-T01` | `AC-01` | Happy Path | Valid payload + active auth | `201/200` + `data.{id,code,status}` + UI status badge updated |
| `CYC-T02` | `AC-02` | Validation | Missing/invalid required fields | `422` + `ERR_VALIDATION_FAILED` + `[module]-error-alert` visible |
| `CYC-T03` | `MOB-02` | Idempotency | Replay identical `X-Idempotency-Key` | Cached `200/201` (`X-Cache: HIT-IDEMPOTENT`) or `409` if in-flight |
| `CYC-T04` | `SEC-01` | Tenant / IDOR | Cross-tenant or unauthorized `{id}` | `403` / `404` fail-closed |

### 5.3 Regression Blast Radius
- **Changed Files in Cycle:** `[N files]`
- **Downstream Consumers to Regression-Test:** `[List impacted portals, mobile screens, shared resolvers]`

---

## 6. QA & Mobile Execution Checklist

### 6.1 Mobile Engineering Action Plan
- [ ] Sync DTO models (`fromJson` / `toJson`) with Section 3.1 & 3.2 fields (strict boolean/numeric null-safety).
- [ ] Attach `X-Idempotency-Key` (UUIDv4) on all mutating `POST`/`PUT` calls introduced in this cycle.
- [ ] Chain downstream navigation/actions using `data.id`, `data.code`, and `data.status` without extra lookup calls.
- [ ] Verify `Accept-Language: ar` & `en` localized error/status rendering.

### 6.2 QA Automation Action Plan
- [ ] Execute unit/feature suite: `vendor/bin/pest` / `npx vitest run`.
- [ ] If `stacks.api_docs.postman == true`: Run `npx newman run docs/postman/[module].postman_collection.json`.
- [ ] Bind Playwright / Cypress / Appium page objects strictly to Section 4 `data-testid` selectors (zero CSS/text XPaths).
- [ ] Provision edge-case fixtures via `@seed-feature [FeatureID]` where applicable and sign off cycle release gate.

