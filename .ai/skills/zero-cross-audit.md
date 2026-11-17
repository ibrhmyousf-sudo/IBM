---
name: zero-cross-audit
version: 3.9.4
description: Autonomous Cross-Feature Semantic Conflict & Specification Contradiction Detector Protocol
triggers:
  - zero cross audit
  - semantic conflict
  - feature conflict
  - business rule contradiction
  - status lifecycle divergence
  - cross feature audit
enforcement: strict
---

# Autonomous Skill: Zero-Cross Audit (`zero-cross-audit`)

> **OS VERSION:** v3.9.4 Deep Autonomous Skills Core  
> **LAYER:** Multi-Feature Business Requirement Governance & Semantic Consistency  
> **APPLIES TO:** `docs/business-context/features/**/*.md`, `PROJECT_CONTEXT.md`, `spec.md`, Enums, FluentValidation, FormRequests, and Permissions.

---

## 1. Multi-Feature Semantic Cross-Examination Engine

1. **Simultaneous Cross-Feature Inspection**:
   - The AI agent MUST NOT evaluate a feature specification in isolation.
   - When reviewing or preparing a feature under `docs/business-context/features/`, the engine scans all related feature specifications within active sprints/batches to detect inter-module dependencies and shared entity lifecycles.
2. **Entity & Contract Discovery Scope**:
   - Shared Master Entities (e.g., `User`, `Member`, `Facility`, `Branch`, `Subscription`, `Invoice`).
   - State machines & lifecycle transitions (e.g., `DRAFT` ➔ `PENDING` ➔ `APPROVED` ➔ `ACTIVE`).
   - System-wide permission names & role capabilities across stacks (`Domain/Constants/Permissions.cs` or Laravel Permissions).
   - Validation constraints & business boundary limits across FluentValidation, Zod schemas, and FormRequests.

---

## 2. Four Dimensions of Semantic Contradiction

### Dimension A: Status Lifecycle Divergence (`CONFLICT_LIFECYCLE`)
- **Definition**: When two features define incompatible states, transitions, or terminology for the same domain entity.
- **Cross-Stack Type Safety**:
  - **Laravel**: PHP 8.2+ String-Backed Enums (`enum MemberStatus: string { case Active = 'ACTIVE'; }`).
  - **.NET 10**: C# Enums configured with `[JsonConverter(typeof(JsonStringEnumConverter))]`:
    ```csharp
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum MemberStatus
    {
        Draft = 0,
        Pending = 1,
        Active = 2,
        Suspended = 3
    }
    ```
- **Enforcement**: Status enums and state machines for shared entities MUST be consolidated in a single canonical schema. Divergent state additions require synchronized updates across all feature specs.

---

### Dimension B: Business Rule Contradiction (`CONFLICT_BUSINESS_RULE`)
- **Definition**: Mutual exclusion or logical incompatibility between business rules across different modules.
- **Enforcement**: Flag as `CRITICAL_CONFLICT`. Require explicit precedence rules, tier exception handlers, or unified rule definitions in `PROJECT_CONTEXT.md`.

---

### Dimension C: Acceptance Criteria & Validation Mismatch (`CONFLICT_VALIDATION`)
- **Definition**: Divergent input validation constraints on identical attributes across different interfaces (Admin vs Mobile vs Public).
- **Cross-Stack Alignment**:
  - Ensure rules are consistent across Laravel `FormRequest`, .NET `FluentValidation<T>`, and React/TanStack `Zod` schemas:
    ```csharp
    // .NET 10 FluentValidation
    RuleFor(x => x.PhoneNumber)
        .NotEmpty()
        .Matches(@"^(\+9665|05)[0-9]{8}$")
        .WithMessage("رقم الجوال يجب أن يبدأ بـ 05 أو +9665 / Phone number must begin with 05 or +9665.");
    ```
- **Enforcement**: Validation rules for shared fields MUST be sourced from central domain value objects or shared validation specifications.

---

### Dimension D: Role & Permission Ambiguity (`CONFLICT_PERMISSIONS`)
- **Definition**: Overlapping or conflicting permission strings and role authority definitions.
- **Cross-Stack Taxonomy**:
  - Enforce canonical dot-notated permission taxonomy (`{module}.{action}`, e.g., `members.update`) defined centrally:
    - In .NET: `Domain.Constants.Permissions` (e.g., `public const string MembersUpdate = "members.update";`).
    - In Laravel: `App\Constants\Permissions` or Spatie permissions table.

---

## 3. Severity Classification & Enforcement Gates

| Conflict Level | Description | Governance Action |
| :--- | :--- | :--- |
| **CRITICAL_CONFLICT** | Incompatible state transitions, contradictory financial/business rules, or conflicting database keys. | **Hard Stop Gate**: Spec sealing and blueprint generation are BLOCKED until BA amends specs. |
| **WARNING_DRIFT** | Validation constraint variations or naming inconsistencies across modules. | Requires explicit reconciliation note in `spec.md` with approval justification. |
| **INFO_ALIGNED** | Cross-feature dependencies validated with 100% semantic harmony. | Clearance granted to proceed with `plan.md` and implementation. |

---

## 4. Audit Execution Protocol & Scorecard Format

When `@zero-cross-audit` is triggered or invoked during `@review-spec`:
1. Scan target feature spec alongside all other specs in `docs/business-context/features/`.
2. Generate structured scorecard:

```markdown
### 🔍 Zero-Cross Semantic Audit Scorecard

- **Target Feature:** `FEATURE-042 (Nutrition Subscription)`
- **Cross-Examined Features:** `FEATURE-010 (Billing)`, `FEATURE-015 (User Profile)`
- **Overall Result:** `BLOCKED | PASS`

| Ref | Type | Module A | Module B | Discovered Contradiction | Resolution Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **XAUD-01** | `CONFLICT_LIFECYCLE` | F042 (Status: `PAUSED`) | F010 (No `PAUSED` state) | Invoices continue generating while meal plan is marked paused. | Define billing pause webhook in F010. |
| **XAUD-02** | `CONFLICT_VALIDATION`| F042 (`weight`: min 30kg) | F015 (`weight`: min 20kg) | Divergent minimum threshold for member biometric profile. | Standardize biometric validation. |
```

---

## 5. Verification Checklist (`zero-cross-audit`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **XAUD-01** | Lifecycle State Alignment | Fail if entity states/transitions contradict existing module lifecycles |
| **XAUD-02** | Business Rule Mutual Exclusion | Fail if cross-feature rules logically conflict without explicit precedence |
| **XAUD-03** | Shared Entity Validation | Fail if validation constraints diverge between FormRequest, FluentValidation, or Zod |
| **XAUD-04** | Role & Permission Taxonomy | Fail if dot-notated permission naming diverges from `Domain/Constants/Permissions` |
| **XAUD-05** | Master Table Constraint Parity | Fail if feature introduces conflicting scalar foreign key constraints |
