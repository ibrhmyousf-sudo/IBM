---
name: perf-predictor
version: 3.9.4
description: Autonomous Static Performance Bottleneck Prediction, N+1 Query Elimination & ESR Index Optimization Protocol
triggers:
  - perf-predictor
  - predict-perf
  - performance audit
  - n+1 detection
  - missing index
  - slow query
  - pagination check
  - database bottleneck
enforcement: strict
---

# Autonomous Skill: Performance Predictor (`perf-predictor`)

> **OS VERSION:** v3.9.4 Deep Autonomous Skills Core  
> **LAYER:** Database Optimization, Query Efficiency & Static Performance Bottleneck Elimination  
> **APPLIES TO:** Controllers, Minimal API Endpoints, EF Core Queries, Eloquent Models, Repositories, and Database Migrations.

---

## 1. N+1 Query Antipattern & Eager Loading Enforcement

1. **Loop Traversal & Unprojected Entity Queries**:
   - Accessing relationships inside loops or serializing navigation properties without eager loading triggers exponential database roundtrips.
2. **Laravel Invariants**:
   - Always eager-load upfront with `with()` / `loadMissing()` and guard API Resources with `whenLoaded()`.
3. **.NET 10 / EF Core Invariants**:
   - **Mandatory `.AsNoTracking()`**: All read-only queries MUST specify `.AsNoTracking()` to eliminate ChangeTracker memory overhead:
     ```csharp
     // ANTI-PATTERN: N+1 navigation loading with tracking overhead
     var members = await context.Members.ToListAsync(ct);
     foreach (var member in members)
     {
         var planName = member.Subscription?.Plan?.Name; // N queries!
     }

     // OPTIMAL: Projection with AsNoTracking and explicit DTO select
     var members = await context.Members
         .AsNoTracking()
         .Where(m => m.TenantId == tenantId && m.Status == MemberStatus.Active)
         .Select(m => new MemberListItemDto(
             m.Id,
             m.Name,
             m.Subscription != null ? m.Subscription.Plan.Name : null
         ))
         .ToListAsync(ct);
     ```
   - **`Include` / `ThenInclude`**: When domain entities must be loaded for business execution, load dependencies explicitly:
     ```csharp
     var order = await context.Orders
         .Include(o => o.Items)
             .ThenInclude(i => i.Product)
         .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Id == id, ct);
     ```

---

## 2. Unindexed Columns & Compound Index (ESR) Rule

1. **Foreign Key & Lookup Indexing Invariant**:
   - Any column appearing in `WHERE`, `JOIN`, or `ORDER BY` references MUST carry an index.
   - All `*_id` scalar foreign keys (`user_id`, `facility_id`, `branch_id`) must have single or compound indexes.
2. **Compound Index (ESR) Order**:
   - Always order composite indexes by **Equality -> Sort -> Range**:
   - **Laravel**:
     ```php
     $table->index(['tenant_id', 'status', 'created_at'], 'idx_members_tenant_status_created');
     ```
   - **.NET 10 EF Core**:
     ```csharp
     builder.HasIndex(m => new { m.TenantId, m.Status, m.CreatedAt })
         .HasDatabaseName("ix_members_tenant_status_created");
     ```

---

## 3. Unbounded Dataset Protection & Pagination Invariants

1. **Strict Prohibition of Unbounded Enumeration**:
   - Endpoints must NEVER execute unbounded `ToList()`, `all()`, or `get()`.
2. **Bounded Page Size & `CancellationToken` Propagation**:
   - Every list endpoint must clamp `pageSize` (`1 <= pageSize <= 100`) and pass `CancellationToken` to avoid zombie queries when clients disconnect:
     ```csharp
     public static async Task<PagedResult<MemberDto>> GetMembers(
         [FromQuery] int page,
         [FromQuery] int pageSize,
         IApplicationDbContext context,
         IUser currentUser,
         CancellationToken ct)
     {
         var safePage = Math.Max(1, page);
         var safePageSize = Math.Clamp(pageSize, 1, 100);

         var query = context.Members
             .AsNoTracking()
             .Where(m => m.TenantId == currentUser.TenantId);

         var total = await query.CountAsync(ct);
         var items = await query
             .OrderByDescending(m => m.CreatedAt)
             .Skip((safePage - 1) * safePageSize)
             .Take(safePageSize)
             .Select(m => new MemberDto(m.Id, m.Name, m.Status))
             .ToListAsync(ct);

         return new PagedResult<MemberDto>(items, safePage, safePageSize, total);
     }
     ```

---

## 4. Synchronous Job Offloading & Request Cycle Budget

1. **HTTP Request Cycle Budget**:
   - Synchronous processing MUST complete in under **200ms**.
2. **Heavy Job Asynchronous Queuing**:
   - Any operation exceeding 50ms MUST be dispatched to asynchronous worker queues:
     - External HTTP API calls (Payment gateways, ZATCA e-invoicing, Webhooks)
     - Email, SMS, and Push notification dispatches
     - PDF / Excel export generation
     - Heavy media transcoding
   - **Laravel**: Implement `ShouldQueue`.
   - **.NET 10**: Offload via `BackgroundService`, `Channel<T>`, or background message broker (MassTransit / RabbitMQ).

---

## 5. Verification Checklist (`perf-predictor`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **PERF-01** | Eager Loading / Projection | Fail if entity relationship loaded inside loop or without `Select`/`Include`/`whenLoaded` |
| **PERF-02** | Read Query No-Tracking | Fail if .NET read query omits `.AsNoTracking()` |
| **PERF-03** | Compound Index ESR Order | Fail if composite index does not place Equality keys before Sort/Range keys |
| **PERF-04** | Unbounded Query Prevention | Fail if collection endpoint allows unbounded `all()` / `ToListAsync()` without pagination |
| **PERF-05** | Page Size Clamping | Fail if listing API does not enforce maximum page size cap (`<= 100`) |
| **PERF-06** | Cancellation Token Propagation | Fail if .NET EF Core async query omits `CancellationToken` |
| **PERF-07** | Heavy Task Offloading | Fail if external API calls or email notifications are executed synchronously in HTTP cycle |
