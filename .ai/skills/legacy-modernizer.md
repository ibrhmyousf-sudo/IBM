---
name: legacy-modernizer
version: 3.9.4
description: Autonomous Strangler-Fig Legacy Modernization, Side-Effect Isolation & Parity Regression Protocol
triggers:
  - legacy-modernizer
  - refactor-legacy
  - legacy modernization
  - cakephp refactor
  - php native refactor
  - blade modernization
  - dotnet framework refactor
  - strangler fig
  - parity regression
enforcement: strict
---

# Autonomous Skill: Legacy Modernizer (`legacy-modernizer`)

> **OS VERSION:** v3.9.4 Deep Autonomous Skills Core  
> **LAYER:** Architectural Modernization, Strangler-Fig Migration & Parity Regression  
> **APPLIES TO:** .NET Framework 4.x / Legacy ASP.NET MVC, PHP Native, CakePHP (2.x/3.x), Legacy Blade, and Stored-Procedure Monoliths.

---

## 1. Strangler-Fig Decomposition Protocol

1. **Step-by-Step Modernization Invariant**:
   - Never attempt full "big-bang" rewrites of legacy systems. Modernization must follow the **Strangler-Fig Pattern**:
     1. **Characterize**: Write automated integration and parity characterization tests for legacy endpoints before touching production code.
     2. **Intercept**: Route a single specific URL or action through a modern API gateway or reverse proxy (e.g., YARP, NGINX, or HMVC router).
     3. **Isolate**: Extract business logic from monolithic procedural files or giant controllers into isolated Domain Services behind strict Interfaces.
     4. **Replace**: Swap legacy execution with modern service calls while asserting identical input/output parity.
2. **Side-Effect Isolation**:
   - Isolate all global state dependencies (`HttpContext.Current`, `$_GET`, `$_POST`, `$_SESSION`, global static singletons) into strongly-typed DTOs and injected Context providers.
   - Decouple direct database calls (`mysqli_query`, `SqlDataAdapter`, CakePHP `$this->Model->find('all')`) into dedicated Repositories or EF Core queries implementing clean contract interfaces.

---

## 2. Framework-Specific Migration Pathways

### Pathway A: Legacy .NET Framework 4.x / ASP.NET MVC to .NET 10 Clean Architecture
1. **Decouple `System.Web.HttpContext.Current`**:
   - Replace static `HttpContext.Current` references with scoped abstraction `IUser` / `ICurrentUser` injected via DI.
2. **Decommission Stored Procedure / `DataSet` Monoliths**:
   - Extract raw `SqlDataAdapter`, `DataTable`, and stored procedure executions (`SqlCommand`) into EF Core 10 `IEntityTypeConfiguration<T>` models or targeted Dapper queries mapped to immutable C# `record` DTOs.
3. **Migrate Legacy EF 6 `.edmx` to EF Core 10**:
   - Replace XML-based `.edmx` models with clean code-first entity configurations utilizing Fluent API (`HasIndex`, `HasMaxLength`, `DeleteBehavior.Restrict`).
4. **Transition MVC Controllers to Minimal API / MediatR Slices**:
   - Replace `ViewBag` / `ViewData` actions with strongly-typed `IEndpointGroup` Minimal API routes or MediatR `IRequest<TResponse>` handlers validated by FluentValidation.

---

### Pathway B: PHP Native & Procedural PHP
1. Wrap raw procedural scripts into PSR-4 autoloaded Controller classes.
2. Replace manual `include`/`require` templates with modern Component-based views or API JSON resources.
3. Replace raw database access with PDO / Eloquent models using strict `$fillable` whitelisting and typed casts.

---

### Pathway C: CakePHP 2.x/3.x Migration
1. Map CakePHP `$this->request->data` into strictly-typed FormRequest classes with validation rules.
2. Decouple CakePHP Behaviors and Components into reusable Traits and Service classes.
3. Transition CakePHP Array-based entity structures to typed PHP 8.2+ DTOs and Read-Only Value Objects.

---

### Pathway D: Legacy Server-Rendered UI Modernization
1. Modernize monolithic Blade / ASP.NET Razor Views into headless API endpoints backed by TanStack React / Vue 3 SPA components.
2. Enforce universal testability locators: Inject `data-testid="{module}-{component}-{element}"` into all interactive inputs, buttons, tables, and dialogs per `006-qa-testability-and-handoff.md`.

---

## 3. Universal Testability & Parity Regression Harness

1. **Automated Characterization Testing**:
   - Prior to refactoring, capture existing output vectors (JSON payloads, HTML rendered structures, database side-effects) using snapshot tests.
2. **Parity Assertion Invariants**:
   - The refactored code MUST produce 100% identical HTTP status codes, response headers, error validation structures, and database state mutations as the legacy baseline.
3. **Deterministic `data-testid` Locators**:
   ```html
   <!-- Modernized Component -->
   <input 
       type="text" 
       name="license_no" 
       data-testid="facilities-registration-input-license" 
       v-model="form.license_no"
   />
   <button 
       type="submit" 
       data-testid="facilities-registration-btn-submit"
   >
       Submit
   </button>
   ```

---

## 4. Verification Checklist (`legacy-modernizer`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **MOD-01** | Pre-Refactor Parity Test | Fail if legacy code is modified before a baseline characterization test exists |
| **MOD-02** | Side-Effect Encapsulation | Fail if procedural globals (`HttpContext.Current`, `$_POST`, `$_SESSION`) remain unmapped to DTOs |
| **MOD-03** | Contract & Service Extraction | Fail if legacy controller logic is refactored without extracting an interface-backed Service |
| **MOD-04** | Direct DB Query Elimination | Fail if raw SQL (`mysqli_query`, `SqlDataAdapter`) remains in controller/view layer |
| **MOD-05** | Universal `data-testid` Injection | Fail if modernized UI elements lack `data-testid="{module}-{component}-{element}"` |
| **MOD-06** | Parity Verification Check | Fail if refactored output deviates in format, status code, or database side effects |
