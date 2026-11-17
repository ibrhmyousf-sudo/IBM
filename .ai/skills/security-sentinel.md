---
name: security-sentinel
version: 4.2.0
description: Autonomous Multi-Tenant Isolation, IDOR Defense, Auth/JWT Hardening, Safe Uploads & OWASP LLMSVS Protocol
triggers:
  - security audit
  - idor check
  - tenant isolation
  - formrequest validation
  - mass assignment
  - authorization
  - pentest
  - jwt revocation
  - ai prompt acl
enforcement: strict
---

# Autonomous Skill: Security Sentinel (`security-sentinel`)

> **OS VERSION:** v4.2.0 Tier-1 Pentest & 183-Control GRC Core  
> **LAYER:** Application Security, Identity Lifecycle, Tenant Boundary, Upload Isolation & AI/LLM Guardrails  
> **APPLIES TO:** Controllers, FormRequests, FluentValidation, MediatR Behaviors, Eloquent / EF Core Models, Policies, Minimal APIs, File Handlers, and AI Prompt Builders.

---

## 1. Strict Multi-Tenant Isolation

### 1.1 Universal Tenant Scope Invariant
Every database query for tenant-owned resources MUST be scoped by the authenticated tenant identifier (`tenant_id`, `facility_id`, or `organization_id`). Tenant context must be resolved from trusted authenticated session/token credentials (`auth()->user()->tenant_id` or `IUser.TenantId`), **NEVER** from untrusted user-supplied request headers, query parameters, or form bodies.

### 1.2 Dual-Stack Scoping Architecture
- **Laravel / PHP**:
  ```php
  static::addGlobalScope('tenant', function (Builder $builder) {
      if (auth()->check() && !auth()->user()->isSuperAdmin()) {
          $builder->where('tenant_id', auth()->user()->tenant_id);
      }
  });
  ```
- **.NET 10 / EF Core 10**:
  ```csharp
  // EF Core Global Query Filter in DbContext
  modelBuilder.Entity<Invoice>()
      .HasQueryFilter(e => e.TenantId == _currentUserService.TenantId);
  ```
- Direct un-scoped queries such as `Model::find($id)` or `_context.Set.FindAsync(id)` without tenant boundary enforcement inside tenant-facing actions are **strictly prohibited**.

---

## 2. Insecure Direct Object References (IDOR) Defense

### 2.1 Explicit Identity Binding & 404 Fail-Closed
Any query fetching, updating, or deleting a resource belonging to a user MUST bind the authenticated user's ID. When a record exists under another tenant or user, the query MUST return `404 Not Found` (never disclose entity existence via `403 Forbidden`):
- **Laravel / PHP**:
  ```php
  $order = Order::where('id', $orderId)
      ->where('user_id', auth()->id())
      ->firstOrFail(); // Throws ModelNotFoundException -> 404
  ```
- **.NET 10 / MediatR**:
  ```csharp
  var order = await _context.Orders
      .Where(x => x.Id == request.OrderId && x.UserId == _user.Id)
      .FirstOrDefaultAsync(cancellationToken);
  if (order == null) throw new NotFoundException(nameof(Order), request.OrderId);
  ```

### 2.2 Dual-Guard Authorization (Policy & MediatR Pipeline)
- **Laravel / PHP**:
  ```php
  $this->authorize('update', $order);
  ```
- **.NET 10 / MediatR & Minimal APIs**:
  1. Every MediatR request class/record must declare `[Authorize]` or explicitly opt out with `[AllowAnonymousRequest]`. The `AuthorizationBehaviour` pipeline halts with `ForbiddenAccessException` if undeclared.
  2. Every `IEndpointGroup` Minimal API class must chain `.RequireAuthorization()` on the RouteGroupBuilder:
     ```csharp
     public class OrdersEndpoints : IEndpointGroup
     {
         public void Map(RouteGroupBuilder group)
         {
             group.RequireAuthorization();
             group.MapGet("/", GetOrders);
             group.MapPost("/", CreateOrder);
         }
     }
     ```

### 2.3 Opaque Public Identifiers
For all mobile and customer-facing APIs, expose non-sequential UUIDv4 / ULID identifiers (e.g., `uuid` column / `public Guid Uuid { get; set; }`) rather than sequential auto-incrementing integer IDs to prevent enumeration attacks.

---

## 3. Mass Assignment Defense & Strict Input Validation

### 3.1 Dual-Stack Whitelist Enforcement
- **Laravel / PHP**:
  - Accept attributes extracted exclusively via `$request->validated()`.
  - Prohibit `$request->all()`, `$request->input()`, or raw global array access in persistence methods.
  - Every Eloquent model MUST declare `protected $fillable = [...]`. `$guarded = []` is **STRICTLY FORBIDDEN**.
- **.NET 10 / Clean Architecture**:
  - Accept commands exclusively through strongly-typed, immutable C# `record` DTOs:
    ```csharp
    public record CreateOrderCommand(string Title, decimal Amount, List<OrderItemDto> Items) : IRequest<int>;
    ```
  - FluentValidation rules enforce strict whitelist bounds:
    ```csharp
    public class CreateOrderCommandValidator : AbstractValidator<CreateOrderCommand>
    {
        public CreateOrderCommandValidator()
        {
            RuleFor(v => v.Title).NotEmpty().MaximumLength(255);
            RuleFor(v => v.Amount).GreaterThan(0);
            RuleFor(v => v.Items).NotEmpty();
        }
    }
    ```
  - Domain entities are instantiated with explicit constructors or factory methods, preventing arbitrary property binding.

### 3.2 Protected System Attributes (Never Accepted in User Input)
- `id`, `uuid`
- `tenant_id`, `organization_id`, `facility_id`
- `role`, `roles`, `is_admin`, `is_super_admin`, `permissions`
- `status`, `state`, `lifecycle_status` (must only transition via domain state machine methods)
- `verified_at`, `email_verified_at`, `phone_verified_at`
- `balance`, `credit`, `wallet_balance`, `points`
- `password`, `password_hash`, `security_stamp`

---

## 4. SQL Injection & Parameter Binding Standards

### 4.1 Parenthesized Logical Grouping (Laravel / PHP)
When combining tenant filters with boolean `OR` conditions, parentheses MUST be explicitly enforced using nested closures:
```php
// SECURE: Enclosed OR condition inside tenant scope
$query->where('tenant_id', $tenantId)
      ->where(function ($subQuery) use ($keyword) {
          $subQuery->where('name', 'LIKE', "%{$keyword}%")
                   ->orWhere('email', 'LIKE', "%{$keyword}%");
      });
```

### 4.2 Raw SQL Ban & EF Core Interpolation (.NET 10)
- Never use unparameterized SQL (`FromSqlRaw` with string concatenation or interpolation).
- Always use `FromSqlInterpolated` or `ExecuteSqlInterpolated` which creates parameterized DbParameters:
  ```csharp
  // SECURE: EF Core parameterizes {searchTerm} automatically
  var items = await _context.Products
      .FromSqlInterpolated($"SELECT * FROM Products WHERE TenantId = {_user.TenantId} AND Name LIKE {searchTerm}")
      .ToListAsync();
  ```

---

## 5. Identity Lifecycle, Private Uploads & AI/LLM Boundaries (`v4.2.0`)

### 5.1 Deny-by-Default Auth, JWT Revocation & Anti-Enumeration (`SEC-016..030`, `SEC-072`)
- **Deny-by-Default:** Enforce global `FallbackPolicy` requiring authenticated users (.NET) or route-group `auth:sanctum` middleware (Laravel). Public routes must be explicitly allowlisted and throttled.
- **JWT Lifetime & Server-Side Logout:** Enforce `ValidateLifetime = true`, `ClockSkew <= 60s`, short-lived access tokens (`<= 15m`), and server-side token/`jti` revocation in Redis/DB upon `Logout` and password change.
- **CSPRNG OTP & Uniform Responses:** Generate OTPs and reset tokens with `random_int()` / `RandomNumberGenerator`, store hashed (`Hash::make` / SHA-256) with single-use TTL + attempt caps, and return identical responses on login/forgot-password to prevent user enumeration (`SEC-027`).

### 5.2 Private File Storage, Magic-Byte Validation & Traversal Defense (`SEC-044`, `SEC-055`, `SEC-057..062`, `SEC-148`)
- Store all uploads, generated exports, and application logs outside webroots (`wwwroot/`, `public/`). Serve files exclusively through authenticated streaming endpoints with UUID keys and canonical `Path.GetFullPath` / `realpath` prefix checks.
- Inspect server-side magic bytes (`finfo_file` / file signatures), enforce per-route size limits, strip `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`, and reject active formats (`svg`, `html`, `htm`, `js`, `php`, `aspx`, `exe`).

### 5.3 OWASP LLMSVS 2.0 AI & Prompt Security (`SEC-116..125`)
- **Zero AI Output Execution (`SEC-120`):** Never pass LLM/AI text output into `DB::raw`, `DB::statement`, `FromSqlRaw`, `ExecuteSqlRaw`, shell commands, or `eval`.
- **Zero Schema Leakage & TLS (`SEC-117`, `SEC-129`):** Never expose `information_schema` or privileged DB credentials to AI services, and never call AI backends over cleartext `http://`.
- **Pre-Prompt Context ACL & Fencing (`SEC-116`, `SEC-118`, `SEC-121`, `SEC-124`):** Filter RAG chunks and attachments (`GetEligibleForPrompt`) by authenticated `user_id` + `tenant_id` before prompt assembly, wrap untrusted input inside `<untrusted_input>` XML tags, enforce AI rate/token budgets, and redact PII from AI prompt logs.

---

## 6. Verification Checklist (`security-sentinel`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **SEC-01** | Tenant Isolation Scoping | Fail if resource query lacks authenticated tenant/facility constraint (`SEC-039`) |
| **SEC-02** | IDOR Ownership Lookups | Fail if user resource fetched by ID without auth binding (must fail-closed 404, `SEC-036`) |
| **SEC-03** | Mass Assignment Protection | Fail if model has `$guarded = []` or DTO allows privilege/tenant mutation (`SEC-040`) |
| **SEC-04** | Identity, OTP & JWT Hygiene | Fail on missing `FallbackPolicy`/`auth:sanctum`, `ValidateLifetime=false`, static OTP, or enumeration (`SEC-016..030`) |
| **SEC-05** | Private Storage & Upload Safety | Fail on webroot uploads/logs/exports, missing magic-byte check, SVG/HTML upload, or LFD traversal (`SEC-055..062`) |
| **SEC-06** | AI/LLM Fencing & Context ACL | Fail if AI output executes as SQL/shell, leaks `information_schema`, or skips `user_id`+`tenant_id` ACL (`SEC-116..125`) |
