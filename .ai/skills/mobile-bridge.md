---
name: mobile-bridge
version: 3.9.4
description: Autonomous Mobile & Frontend API Contract Standardization Protocol
triggers:
  - mobile api
  - idempotency
  - api envelope
  - pagination contract
  - error envelope
  - api chaining
  - cycle handoff
enforcement: strict
---

# Autonomous Skill: Mobile Bridge (`mobile-bridge`)

> **OS VERSION:** v3.9.4 Deep Autonomous Skills Core  
> **LAYER:** Cross-Stack Client Contract Integration & Mobile Network Reliability  
> **APPLIES TO:** API Controllers, API Resources, Minimal API Endpoints, FormRequests, MediatR Handlers, Filters, and OpenAPI Documentation.

---

## 1. Unified API Envelopes & Response Standard

The AI Engineering OS supports two canonical response profiles configured via `stack.json` (`stacks.backend`):

### Profile A: Laravel / PHP Wrapped Envelope
Used when `stacks.backend.laravel == true` or `stacks.backend.cakephp == true`:

1. **Success Envelope**:
   ```json
   {
     "success": true,
     "status": "success",
     "message": "Operation completed successfully.",
     "data": {},
     "meta": {}
   }
   ```
2. **Error Envelope & 422 Unprocessable Entity**:
   ```json
   {
     "success": false,
     "status": "error",
     "code": "VALIDATION_FAILED",
     "message": "بيانات الإدخال غير صالحة / The provided payload is invalid.",
     "errors": {
       "phone": [
         "رقم الجوال يجب أن يبدأ بـ 05 أو +9665 / Phone number must begin with 05 or +9665."
       ]
     },
     "trace_id": "req-20261110-094500-a1b2c3"
   }
   ```

---

### Profile B: .NET 10 / ASP.NET Core TypedResults & RFC 9110 ProblemDetails
Used when `stacks.backend.dotnet == true`:

1. **Success Envelope (`TypedResults.Ok` / `TypedResults.Created`)**:
   - Minimal API endpoints return strongly-typed `Results<Ok<ApiResponse<T>>, NotFound, ProblemHttpResult>` or `Created<T>`:
   ```json
   {
     "success": true,
     "status": "success",
     "message": "Operation completed successfully.",
     "data": {
       "id": "018f2d5a-6b47-79b8-a721-7294cf7b8d14",
       "code": "ORD-2026-0042",
       "status": "PENDING_PAYMENT"
     },
     "meta": {
       "server_time": "2026-11-10T12:00:00Z"
     }
   }
   ```

2. **Error Envelope: RFC 9110 / RFC 7807 ProblemDetails (400 / 404 / 409 / 422 / 500)**:
   - ASP.NET Core 10 Minimal APIs map exceptions and validation failures using standard `ProblemDetails`:
   ```json
   {
     "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
     "title": "One or more validation errors occurred.",
     "status": 400,
     "detail": "بيانات الإدخال غير صالحة / The provided payload is invalid.",
     "instance": "/api/v1/orders",
     "errors": {
       "PhoneNumber": [
         "رقم الجوال يجب أن يبدأ بـ 05 أو +9665 / Phone number must begin with 05 or +9665."
       ]
     },
     "traceId": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
     "code": "VALIDATION_FAILED"
   }
   ```
   - Standard HTTP Status Codes across both stacks:
     - `200 OK`: Successful query or idempotent update.
     - `201 Created`: Resource successfully created. Returns `Location` header and resource identifier.
     - `400 Bad Request`: Payload validation error or business rule violation (.NET 10 / RFC 9110).
     - `401 Unauthorized`: Missing or invalid Bearer JWT.
     - `403 Forbidden`: Authenticated caller lacks requisite permission claim.
     - `404 Not Found`: Tenant-scoped lookup produced no record.
     - `409 Conflict`: Concurrency version mismatch (`RowVersion`) or duplicate idempotency lock.
     - `422 Unprocessable Entity`: FormRequest validation error (Laravel profile).
     - `429 Too Many Requests`: Rate limiting ceiling reached.
     - `500 Internal Server Error`: Unhandled server exception (sanitized in production, detail masked).

---

## 2. API Chaining Identifiers Invariant

All state-mutating endpoints (`POST`, `PUT`, `PATCH`) MUST return the canonical resource `id`, business `code` (if applicable), and `status` inside the root of `data` (or top-level record):
- This enables mobile clients (Flutter/Swift/Kotlin) and automated test suites to chain subsequent dependent operations without extraneous `GET` roundtrips:
  ```json
  {
    "success": true,
    "status": "success",
    "message": "Invoice created successfully.",
    "data": {
      "id": 1042,
      "uuid": "9c82b4a1-16e0-4a88-87f5-20092bc21001",
      "code": "INV-2026-0042",
      "status": "PENDING_PAYMENT"
    }
  }
  ```

---

## 3. Idempotency Protocol (`X-Idempotency-Key`)

1. **Mandatory Idempotency Scope**:
   - Any mutating endpoint triggering payments, stock allocation, wallet transfers, order submissions, or irreversible external side-effects MUST require `X-Idempotency-Key` (UUIDv4).

2. **Laravel Implementation (Redis Atomic Lock)**:
   ```php
   $key = $request->header('X-Idempotency-Key');
   $cacheKey = "idempotency:{$tenantId}:{$userId}:{$key}";
   $lock = Cache::lock("lock:{$cacheKey}", 120);

   if (!$lock->get()) {
       return response()->json([
           'success' => false,
           'code'    => 'CONCURRENT_REQUEST',
           'message' => 'A request with this idempotency key is currently processing.'
       ], 409);
   }

   if ($cached = Cache::get($cacheKey)) {
       $lock->release();
       return response()->json($cached['body'], $cached['status'])
           ->header('X-Cache', 'HIT-IDEMPOTENT');
   }
   ```

3. **.NET 10 Implementation (`IEndpointFilter` + `IDistributedCache`)**:
   ```csharp
   public sealed class IdempotencyEndpointFilter : IEndpointFilter
   {
       private readonly IDistributedCache _cache;
       private readonly ILogger<IdempotencyEndpointFilter> _logger;

       public IdempotencyEndpointFilter(IDistributedCache cache, ILogger<IdempotencyEndpointFilter> logger)
       {
           _cache = cache;
           _logger = logger;
       }

       public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
       {
           var httpContext = context.HttpContext;
           if (!httpContext.Request.Headers.TryGetValue("X-Idempotency-Key", out var keyValues) ||
               string.IsNullOrWhiteSpace(keyValues.ToString()))
           {
               return TypedResults.Problem(
                   title: "Missing Idempotency Key",
                   detail: "Mutating operations require a valid X-Idempotency-Key header.",
                   statusCode: StatusCodes.Status400BadRequest);
           }

           var key = keyValues.ToString();
           var userId = httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous";
           var cacheKey = $"idempotency:{userId}:{key}";

           var existing = await _cache.GetStringAsync(cacheKey, httpContext.RequestAborted);
           if (!string.IsNullOrEmpty(existing))
           {
               httpContext.Response.Headers.Append("X-Cache", "HIT-IDEMPOTENT");
               return TypedResults.Content(existing, "application/json", Encoding.UTF8, StatusCodes.Status200OK);
           }

           var lockKey = $"lock:{cacheKey}";
           var acquired = await _cache.SetStringAsync(
               lockKey,
               "LOCKED",
               new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60) },
               httpContext.RequestAborted);

           var result = await next(context);

           if (result is IStatusCodeHttpResult { StatusCode: >= 200 and < 300 })
           {
               var payload = result is IValueHttpResult valueResult ? valueResult.Value : result;
               var json = JsonSerializer.Serialize(payload);
               await _cache.SetStringAsync(
                   cacheKey,
                   json,
                   new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) },
                   httpContext.RequestAborted);
           }

           await _cache.RemoveAsync(lockKey, httpContext.RequestAborted);
           httpContext.Response.Headers.Append("X-Cache", "MISS-IDEMPOTENT");
           return result;
       }
   }
   ```

---

## 4. Mobile-First Keyset & Offset Pagination

1. **Standard Page-Based Envelope**:
   ```json
   {
     "data": [...],
     "meta": {
       "current_page": 1,
       "per_page": 15,
       "total": 142,
       "total_pages": 10,
       "has_more": true
     }
   }
   ```

2. **Keyset / Cursor-Based Pagination (.NET 10 / EF Core)**:
   - For infinite scroll feeds, chat streams, and mobile lists:
   ```csharp
   public static async Task<CursorPagedResult<T>> ToCursorPagedAsync<T>(
       this IQueryable<T> query,
       int? afterId,
       int pageSize,
       Func<T, int> idSelector,
       CancellationToken ct) where T : class
   {
       var boundedPageSize = Math.Clamp(pageSize, 1, 100);
       var items = await query
           .AsNoTracking()
           .Take(boundedPageSize + 1)
           .ToListAsync(ct);

       var hasMore = items.Count > boundedPageSize;
       var pagedItems = hasMore ? items.Take(boundedPageSize).ToList() : items;
       var nextCursor = hasMore ? idSelector(pagedItems.Last()).ToString() : null;

       return new CursorPagedResult<T>(pagedItems, nextCursor, hasMore, boundedPageSize);
   }
   ```

---

## 5. Verification Checklist (`mobile-bridge`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **MOB-01** | Standard Envelope Uniformity | Profile A (Laravel/PHP): Enforce `{ success, data, error }` wrapper. Profile B (.NET 10): Permit native flat `TypedResults` DTOs (`Ok<TDto>`, `Created<TDto>`) exposing `{ id, code, status }` directly at root or `ApiResponse<T>` wrapper. Bare unformatted primitive data is prohibited. |
| **MOB-02** | Idempotency Key Enforcement | Fail if payment or state-creating mutation endpoint lacks `X-Idempotency-Key` filter or lock |
| **MOB-03** | API Chaining Identifiers | Fail if `POST`/`PUT` mutation does not return resource `id` inside `data` |
| **MOB-04** | Bilingual Error Envelope | Fail if error response lacks localized AR/EN message or `code` |
| **MOB-05** | ProblemDetails / 422 Schema Compliance | Fail if `.NET` fails to emit RFC 9110 `ProblemDetails` or Laravel fails to emit 422 envelope |
| **MOB-06** | Keyset / Bounded Pagination | Fail if collection endpoint allows unbounded `pageSize` (`> 100`) or omits `has_more` |
| **MOB-07** | Cycle Handoff & API Docs Parity | Fail if `cycle_handoff == true` and completed cycle omits `docs/handoff/cycles/CYCLE-*_HANDOFF.md` |
