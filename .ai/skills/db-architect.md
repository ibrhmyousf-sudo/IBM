---
name: db-architect
version: 3.9.4
description: Autonomous Database Architecture & Migration Engineering Protocol
triggers:
  - database migration
  - schema change
  - query optimization
  - index design
  - n+1 prevention
  - zero downtime
enforcement: strict
---

# Autonomous Skill: Database Architect (`db-architect`)

> **OS VERSION:** v3.9.4 Deep Autonomous Skills Core  
> **LAYER:** Data Persistence, Query Performance & Zero-Downtime Schema Evolution  
> **APPLIES TO:** All SQL Migrations, EF Core 10 / Eloquent Models, EntityTypeConfigurations, Indexing Strategies, and Data Access Layers.

---

## 1. Schema Invariants & Dual-Stack Configuration

### 1.1 Laravel / PHP Migrations
1. **Migration Naming & Structure Standard**:
   - File names must strictly follow: `YYYY_MM_DD_HHMMSS_create_{table}_table.php` or `YYYY_MM_DD_HHMMSS_add_{column}_to_{table}_table.php`.
   - Every migration must provide both a strictly-typed `up()` method and a reversible `down()` method.
   - Table and column names must strictly use `snake_case` in English. Plural table names (e.g., `invoices`, `members`), singular scalar foreign keys (e.g., `tenant_id`, `member_id`).
2. **Decoupled Boundary Compliance (Zero Cross-Module DB Foreign Keys)**:
   - Physical SQL `FOREIGN KEY` constraints are **strictly prohibited** across module boundaries.
   - Cross-module entity references must use scalar index columns (`unsignedBigInteger` or `uuid`) without physical `->constrained()->onDelete(...)` foreign keys.
3. **Safe Column Definitions**:
   - Primary keys must use `bigIncrements('id')` or `uuid('id')->primary()`.
   - Decimal values for currency, monetary amounts, and ZATCA tax amounts must strictly use `decimal('amount', 18, 4)` (never `float` or `double`).

### 1.2 .NET 10 / EF Core 10 EntityTypeConfigurations
1. **Configuration Location & Interface**:
   - Every entity configuration must reside in `src/Infrastructure/Data/Configurations/{Entity}Configuration.cs` implementing `IEntityTypeConfiguration<T>`.
   - Explicit table naming: `builder.ToTable("name")`.
2. **Decoupled Boundary Compliance & Foreign Keys**:
   - Physical foreign keys across microservice or module boundaries are strictly forbidden. Use scalar scalar IDs (`public int TenantId { get; set; }` or `public Guid MemberId { get; set; }`) without navigation properties to external domains.
   - Intra-domain relationships must declare explicit delete behaviors: `.OnDelete(DeleteBehavior.Restrict)`. Never leave `DeleteBehavior.Cascade` on high-risk relationships.
3. **Optimistic Concurrency & Precision**:
   - Concurrency tokens: `builder.Property(x => x.RowVersion).IsRowVersion()` to prevent lost updates under race conditions.
   - Monetary precision: `builder.Property(x => x.Amount).HasPrecision(18, 4)` and `builder.Property(x => x.Total).HasPrecision(18, 2)`.
4. **Migration CLI**:
   - Create migrations: `dotnet ef migrations add <Name> --project src/Infrastructure --startup-project src/Web`.
   - Review generated SQL script before applying: `dotnet ef migrations script --idempotent`.

---

## 2. N+1 Query Antipattern Prevention

### 2.1 Laravel / PHP Eager Loading
1. **Mandatory Eager Loading**:
   - All relations accessed in loops, collections, or API Resources must be eager-loaded using `with([...])` or lazy eager-loaded via `loadMissing([...])`.
   - Direct relation property access in Blade/Vue or Resource loops (e.g., `$member->branch->name` without `with('branch')`) is a **blocking defect**.
2. **Cross-Boundary Batch Hydration**:
   ```php
   // CORRECT: Single batch query in Controller/Service
   $userIds = $invoices->pluck('user_id')->unique()->values()->all();
   $users = $this->userResolver->findManyByIds($userIds)->keyBy('id');
   return InvoiceResource::collection($invoices)->additional(['users_map' => $users]);
   ```
3. **Strict Prevention in CI & Local Environments**:
   ```php
   Model::preventLazyLoading(!app()->isProduction());
   Model::preventSilentlyDiscardingAttributes(!app()->isProduction());
   ```

### 2.2 .NET 10 / EF Core 10 Query Performance
1. **Mandatory `.AsNoTracking()`**:
   - Every read-only query in MediatR Query Handlers must chain `.AsNoTracking()`, or project directly via `.Select(x => new DTO { ... })`.
2. **Eliminate Loop Queries (N+1)**:
   - Prohibit `await _context.Set.FirstOrDefaultAsync()` or `ToListAsync()` inside `foreach` / `for` / `while` loops.
   - Query in a single batch using `.Where(x => ids.Contains(x.Id)).ToListAsync()` and assemble in memory.
3. **Explicit Split Queries**:
   - When loading multiple collection navigations, use `.AsSplitQuery()` to prevent Cartesian explosion.

---

## 3. Compound Indexing & Query Optimization (ESR Rule)

### 3.1 The ESR (Equality, Sort, Range) Ordering Standard
Compound indexes must arrange columns in exact sequence:
1. **E - Equality**: Columns matched with `=` or `IN` (e.g., `tenant_id`, `status`).
2. **S - Sort**: Columns used in `ORDER BY` (e.g., `created_at`, `priority`).
3. **R - Range**: Columns filtered with inequalities `<`, `>`, `BETWEEN`, `LIKE` (e.g., `scheduled_at`).

### 3.2 Dual-Stack Implementation
- **Laravel / PHP**:
  ```php
  $table->index(['tenant_id', 'status', 'created_at'], 'idx_invoices_tenant_status_created');
  ```
- **.NET 10 / EF Core 10**:
  ```csharp
  builder.HasIndex(x => new { x.TenantId, x.Status, x.CreatedAt })
      .HasDatabaseName("idx_invoices_tenant_status_created");
  ```

### 3.3 Index Hygiene & Over-Indexing Guards
- Do not create single-column indexes for columns that already serve as the left-most prefix of an existing compound index.
- Low-cardinality boolean columns (e.g., `is_active`) must never be indexed alone; index them only in compound combination with tenant/status/lookup columns.

---

## 4. Zero-Downtime Database Change Protocol

1. **The Expand / Contract (Parallel Run) Migration Pattern**:
   - **Phase 1 (Expand)**: Add the new column or table as `nullable` or with a safe default. Deploy application code that dual-writes to both old and new schema.
   - **Phase 2 (Backfill)**: Run tracked background data migration (using chunked seeders/jobs) to backfill historical records.
   - **Phase 3 (Switch)**: Update application read paths to consume the new column. Stop writing to the old column.
   - **Phase 4 (Contract)**: Drop or rename the legacy column in a separate, isolated migration after production validation.
2. **Prohibited Destructive Operations in Single Deployments**:
   - **NEVER** drop a column, rename a column, or change a column type to narrower constraints in the same release as application code that depends on it.
   - **NEVER** add a `NOT NULL` column without a `default` value to a high-volume existing table (causes exclusive table locks and downtime).
   - In PostgreSQL / MySQL 8 / SQL Server:
     - PostgreSQL: `CREATE INDEX CONCURRENTLY`
     - MySQL: `ALGORITHM=INPLACE, LOCK=NONE`
     - SQL Server: `WITH (ONLINE = ON)`
3. **Safe Table Truncate & Volume Guards**:
   - High-volume transaction tables must partition by date range (e.g., monthly) when projected rows exceed 10 million.
   - Archive tables must be defined alongside active tables for audit retention (e.g., ZATCA 6-year retention).

---

## 5. Verification Checklist (`db-architect`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **DB-01** | Cross-Module Foreign Keys | Fail if `->constrained()` or EF navigation references external module table |
| **DB-02** | N+1 Lazy Loading | Fail if iteration accesses relations without eager load, batch map, or `.AsNoTracking()` |
| **DB-03** | Compound Index Order | Fail if compound index violates ESR (Equality -> Sort -> Range) |
| **DB-04** | Monolith Zero-Downtime | Fail if migration drops/renames column in active release without Expand/Contract |
| **DB-05** | Monetary Precision | Fail if currency/tax column uses `float`/`double` instead of `decimal(18,2)`/`(18,4)` |
| **DB-06** | Concurrency & Restrict | Fail if EF Core delete behavior defaults to Cascade or lacks RowVersion concurrency token |
