---
name: security-fuzzing
version: 4.2.0
description: Autonomous Ethical-Hacker Security Fuzzing, Offensive Postman DAST & 183-Control Penetration Testing Protocol
triggers:
  - security fuzzing
  - fuzz audit
  - audit-security
  - pentest
  - dast
  - adversarial test
  - privilege escalation
  - idor fuzzing
  - sql injection
  - parameter tampering
  - otp brute-force
  - verb tampering
enforcement: strict
---

# Autonomous Skill: Security Fuzzing (`security-fuzzing`)

> **OS VERSION:** v4.2.0 Tier-1 Pentest & Offensive DAST Core  
> **LAYER:** Adversarial Pen-Testing, Mutation Fuzzing, Offensive Postman DAST & API Hardening  
> **APPLIES TO:** Controllers, Minimal API Endpoints, FormRequests, MediatR Handlers, Route Bindings, Policy Gates, File Uploads, AI Endpoints, and Rate Limiting.

---

## 1. IDOR & Cross-Tenant Parameter Tampering Fuzzing

1. **Target Identification**:
   - Every mutation (`POST`, `PUT`, `PATCH`, `DELETE`) or resource retrieval (`GET /{id}`) endpoint accepting integer or UUID entity keys.
2. **Autonomous Fuzzing Heuristics**:
   - **Cross-Tenant ID Mutation**: Replace target entity ID with foreign tenant's record ID (`tenant_id_b`). Expected result: `404 Not Found` (preferred to avoid leaking entity existence) or `403 Forbidden`. Under no circumstance should `200 OK` return foreign tenant data.
   - **Scalar Boundary Tampering**: Probe with negative IDs (`-1`), zero (`0`), maximum integers (`9223372036854775807`), string UUID overflows, and array payloads (`id[]='1'`).
   - **Nested Resource Mismatch**: In composite endpoints (`/api/v1/academies/{academy_id}/branches/{branch_id}`), ensure `branch_id` belongs strictly to `academy_id`. If `branch_id` belongs to another academy, reject with `404 Not Found`.

---

## 2. Privilege Escalation & Role Mutation Vectors

1. **Role Mutation Injection**:
   - Attempt overriding administrative attributes in user-facing mutation payloads: `{"role": "super_admin"}`, `{"is_admin": true}`, `{"status": "verified"}`, `{"balance": 999999}`.
   - **Laravel**: Enforce that Model `$fillable` whitelists contain zero privilege or monetary balance fields.
   - **.NET 10**: Enforce that endpoints bind strictly to immutable C# `record` DTOs, never binding directly to EF Core entity classes:
     ```csharp
     // PROHIBITED: Model binding directly to EF Core entity
     app.MapPost("/api/v1/users", async (User user, AppDbContext db) => { ... });

     // MANDATORY: Immutable DTO contract with FluentValidation
     public sealed record CreateUserRequest(string Email, string Name);
     ```
2. **Vertical & Horizontal Privilege Escalation**:
   - Execute administrative endpoints using standard user Bearer tokens (must return `403 Forbidden`).
   - Execute user profile updates or password resets targeting adjacent user IDs (must return `404 Not Found`).

---

## 3. Injection, Uploads & Rate-Limiting Penetration

1. **SQL Injection Fuzzing**:
   - Scan for string interpolations:
     - Laravel: `DB::raw("WHERE code = '{$request->code}'")` ➔ MUST use PDO positional/named bindings.
     - .NET 10: `context.Database.ExecuteSqlRaw($"...")` ➔ MUST use `ExecuteSqlInterpolatedAsync` or parameterized LINQ:
       ```csharp
       // SECURE: Parameterized SQL Interpolation
       var members = await context.Members
           .FromSqlInterpolated($"SELECT * FROM members WHERE tenant_id = {tenantId} AND code = {code}")
           .ToListAsync(ct);
       ```
2. **Rate Limiting, Verb Tampering, Uploads & AI Fuzzing (`v4.2.0`)**:
   - **Rate Limiting & Anti-Brute-Force (`SEC-021`, `SEC-023`, `SEC-073`)**: Login, OTP verify, password reset, AI chat, and bulk export routes MUST enforce strict rate-limiting policies (`RequireRateLimiting("auth-strict")` or `throttle:auth`) returning `429 Too Many Requests`.
   - **HTTP Verb Tampering (`SEC-050`, `SEC-079`)**: Forbid `Route::any` on state mutations and block `X-HTTP-Method-Override` / `_method` bypasses; unpermitted verbs must return `405`/`403`.
   - **Upload, Export & Traversal Fuzzing (`SEC-055`, `SEC-058`, `SEC-061`, `SEC-069`)**: Probe upload endpoints with polyglot MIME mismatches, active SVG/HTML files, path traversal filenames, and CSV formula prefixes (`=`, `+`, `-`, `@`).
   - **AI/LLM Prompt & RAG Boundary Fuzzing (`SEC-116..120`)**: Probe AI endpoints for prompt boundary escape, cross-tenant attachment retrieval, and SQL/command sink isolation.
   - **Offensive DAST Suite**: Compile `docs/postman/pentest_abuse.postman_collection.json` via `node bin/build-pentest-postman.js` and run the 183-control gate via `node bin/pentest-suite.js --strict`.

---

## 4. Automated Adversarial Test Generation

### Laravel Pest Harness
```php
test('it halts IDOR attack when user accesses adjacent tenant resource', function () {
    $tenantA = Tenant::factory()->create();
    $tenantB = Tenant::factory()->create();
    $userA = User::factory()->forTenant($tenantA)->create();
    $resourceB = Facility::factory()->forTenant($tenantB)->create();

    $this->actingAs($userA)
        ->getJson("/api/v1/facilities/{$resourceB->id}")
        ->assertStatus(404);
});
```

### .NET 10 NUnit + WebApplicationFactory + Respawn Harness
```csharp
[TestFixture]
public class SecurityFuzzingTests : CustomWebApplicationFactory
{
    [Test]
    public async Task GetFacility_WithCrossTenantId_Returns404NotFound()
    {
        // Arrange
        await ResetDatabaseAsync();
        var tenantA = await SeedTenantAsync("Tenant-A");
        var tenantB = await SeedTenantAsync("Tenant-B");
        var facilityB = await SeedFacilityAsync(tenantB.Id, "Foreign Facility");

        var client = CreateAuthenticatedClient(userId: "user-a", tenantId: tenantA.Id, role: "Member");

        // Act
        var response = await client.GetAsync($"/api/v1/facilities/{facilityB.Id}");

        // Assert - Fail closed without entity leakage
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task DeleteFacility_WithoutAdminRole_Returns403Forbidden()
    {
        // Arrange
        await ResetDatabaseAsync();
        var tenantA = await SeedTenantAsync("Tenant-A");
        var facilityA = await SeedFacilityAsync(tenantA.Id, "Target Facility");
        var client = CreateAuthenticatedClient(userId: "user-a", tenantId: tenantA.Id, role: "Member");

        // Act
        var response = await client.DeleteAsync($"/api/v1/facilities/{facilityA.Id}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Test]
    public async Task AuthEndpoint_ExceedingLimit_Returns429TooManyRequests()
    {
        // Arrange
        var client = CreateClient();

        // Act - Burst 10 requests against rate-limited login
        HttpResponseMessage? lastResponse = null;
        for (int i = 0; i < 10; i++)
        {
            lastResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new { Email = "probe@test.com", Password = "Wrong" });
        }

        // Assert
        lastResponse.Should().NotBeNull();
        lastResponse!.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }
}
```

---

## 5. Verification Checklist (`security-fuzzing`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **FUZZ-01** | IDOR Parameter Tampering | Fail if resource accessed without tenant or user ownership scope returns `200` |
| **FUZZ-02** | Privilege Escalation Defense | Fail if protected fields (`role`, `is_admin`, `balance`) are bindable or in `$fillable` |
| **FUZZ-03** | SQL Injection Probing | Fail if any raw string concatenation exists in `DB::raw`, `whereRaw`, or `FromSqlRaw` |
| **FUZZ-04** | File Upload Extension Bypass | Fail if upload handler lacks magic byte MIME validation or stores raw client filename |
| **FUZZ-05** | Sensitive Endpoint Throttling | Fail if OTP, auth, or checkout endpoint lacks rate-limiting policy (`429`) |
| **FUZZ-06** | Adversarial Test Harness | Fail if module lacks automated tests asserting `403`/`404` on tampered ID inputs |
