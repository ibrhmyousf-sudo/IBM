---
name: ipdpl-guardian
version: 3.9.4
description: Autonomous Integrated Privacy & Data Protection Layer (IPDPL) Compliance Protocol
triggers:
  - ipdpl
  - data protection
  - privacy audit
  - pii masking
  - sdaia pdpl
  - encryption at rest
  - log sanitization
enforcement: strict
---

# Autonomous Skill: IPDPL Guardian (`ipdpl-guardian`)

> **OS VERSION:** v3.9.4 Deep Autonomous Skills Core  
> **LAYER:** Integrated Privacy, Regulatory Data Protection & PII Sanitization  
> **APPLIES TO:** API Resources, Minimal API DTOs, Logging Handlers, EF Core ValueConverters, Eloquent Casts, Database Schemas, and Audit Interceptors.

---

## 1. PII Classification Taxonomy (SDAIA-PDPL & NCA Aligned)

All application data handling personal data must be categorized into three explicit sensitivity tiers:

| Sensitivity Tier | Data Types & Identifiers | Masking & Storage Mandate |
| :--- | :--- | :--- |
| **Tier 1: High Sensitivity (Restricted PII)** | National ID (Saudi National ID / Iqama / Passport), IBAN, Credit Card PAN/CVV, Biometrics, Health records. | **MANDATORY AES-256 Encryption at Rest**. Zero plain-text logging. Strict API masking (`1******456`, `SA******************1234`). |
| **Tier 2: Medium Sensitivity (Confidential PII)** | Mobile phone number, Personal email address, Physical home address, Date of birth, Financial balance. | Masked by default in logs and public API endpoints (`+966 50 *** **89`, `u***r@domain.com`). Plain text stored with tenant isolation. |
| **Tier 3: Low Sensitivity (Internal PII)** | First name, Display nickname, Preferred language, Avatar URL. | Plain text permitted; subject to consent retention and user deletion requests. |

---

## 2. Zero-PII Application Logging Protocol

1. **Mandatory Scrubbed Key List**:
   ```text
   national_id, iqama, passport, id_number,
   iban, card_number, pan, cvv, cvv2, pin,
   password, password_confirmation, secret, token, api_key,
   otp, verification_code,
   phone, mobile, email, address, birth_date
   ```

2. **Laravel Logging Scrubbing**:
   - Monolog processors replace any sensitive array key or contextual string with `[REDACTED_PII]`.

3. **.NET 10 / ASP.NET Core Structured Logging Redaction**:
   - Configure `ILogger` / Serilog redaction policies to prevent logging sensitive DTOs:
   ```csharp
   public sealed class PiiRedactionEnricher : ILogEventEnricher
   {
       private static readonly HashSet<string> SensitiveKeys = new(StringComparer.OrdinalIgnoreCase)
       {
           "NationalId", "Iqama", "Iban", "Password", "PhoneNumber", "Email", "CardNumber", "Cvv"
       };

       public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
       {
           foreach (var property in logEvent.Properties.ToList())
           {
               if (SensitiveKeys.Contains(property.Key))
               {
                   logEvent.AddOrUpdateProperty(propertyFactory.CreateProperty(property.Key, "[REDACTED_PII]"));
               }
           }
       }
   }
   ```

---

## 3. API Response Masking & Role-Based Data Visibility

1. **Masking Algorithm Specifications**:
   - **National ID / Iqama (10 digits)**: Keep first 1 digit and last 3 digits; replace middle 6 with asterisks: `1******456`.
   - **Saudi Phone Number (`+9665XXXXXXXX`)**: Keep country code `+966 5` and last 2 digits; mask intermediate digits: `+966 5X *** **89`.
   - **IBAN (24 characters)**: Keep `SA` country code and last 4 digits: `SA******************1234`.
   - **Email Address**: Keep first character and domain suffix: `m***t@innovadigits.com`.

2. **.NET 10 Masking Utility (`AuditFieldMasking`)**:
   ```csharp
   public static class AuditFieldMasking
   {
       public static string MaskNationalId(string? value)
       {
           if (string.IsNullOrWhiteSpace(value) || value.Length < 4) return "******";
           return $"{value[0]}******{value[^3..]}";
       }

       public static string MaskPhone(string? value)
       {
           if (string.IsNullOrWhiteSpace(value) || value.Length < 4) return "+966 5* *** **";
           return $"{value[..6]} *** **{value[^2..]}";
       }

       public static string MaskIban(string? value)
       {
           if (string.IsNullOrWhiteSpace(value) || value.Length < 6) return "SA******************";
           return $"{value[..2]}******************{value[^4..]}";
       }

       public static string MaskEmail(string? value)
       {
           if (string.IsNullOrWhiteSpace(value) || !value.Contains('@')) return "***@***.com";
           var parts = value.Split('@');
           return $"{parts[0][0]}***@{parts[1]}";
       }
   }
   ```

3. **Immutable Audit Interceptor for PII Access (.NET 10 EF Core)**:
   ```csharp
   public sealed class AuditLoggingInterceptor : SaveChangesInterceptor
   {
       private readonly IUser _currentUser;
       private readonly IClock _clock;

       public AuditLoggingInterceptor(IUser currentUser, IClock clock)
       {
           _currentUser = currentUser;
           _clock = clock;
       }

       public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
           DbContextEventData eventData,
           InterceptionResult<int> result,
           CancellationToken cancellationToken = default)
       {
           var context = eventData.Context;
           if (context is null) return ValueTask.FromResult(result);

           var auditEntries = context.ChangeTracker.Entries<IImmutableAuditRecord>()
               .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
               .Select(e => new SecurityAuditEntry
               {
                   EntityName = e.Metadata.ClrType.Name,
                   Action = e.State.ToString(),
                   ActorId = _currentUser.Id ?? "SYSTEM",
                   TenantId = _currentUser.TenantId ?? 0,
                   OccurredAtUtc = _clock.UtcNow,
                   ChangesJson = JsonSerializer.Serialize(e.CurrentValues.ToObject())
               });

           context.Set<SecurityAuditEntry>().AddRange(auditEntries);
           return ValueTask.FromResult(result);
       }
   }
   ```

---

## 4. Secure Storage & Field-Level Encryption at Rest

1. **EF Core 10 AES-256 ValueConverter with HMAC-SHA256 Blind Index**:
   ```csharp
   public sealed class Aes256ValueConverter : ValueConverter<string, string>
   {
       public Aes256ValueConverter(IAesEncryptionService encryptionService)
           : base(
               v => encryptionService.Encrypt(v),
               v => encryptionService.Decrypt(v))
       { }
   }

   // Mapping configuration
   public void Configure(EntityTypeBuilder<Member> builder)
   {
       builder.Property(m => m.NationalId)
           .HasConversion<Aes256ValueConverter>()
           .HasMaxLength(512)
           .IsRequired();

       // Blind index for exact-match searches without decrypting table
       builder.Property(m => m.NationalIdBlindIndex)
           .HasMaxLength(64)
           .IsRequired();

       builder.HasIndex(m => new { m.TenantId, m.NationalIdBlindIndex })
           .HasDatabaseName("ix_members_tenant_national_id_bidx");
   }
   ```

2. **Blind Index Computation**:
   - Whenever `NationalId` is updated, compute HMAC-SHA256 using a server-side secret key:
   ```csharp
   member.NationalIdBlindIndex = Convert.ToHexString(
       HMACSHA256.HashData(blindIndexKeyBytes, Encoding.UTF8.GetBytes(normalizedNationalId)));
   ```
   - Exact searches execute strictly via `Where(m => m.TenantId == tenantId && m.NationalIdBlindIndex == searchHash)`.

---

## 5. Verification Checklist (`ipdpl-guardian`)

| Check ID | Verification Item | Blocking Condition |
| :--- | :--- | :--- |
| **PRIV-01** | Unmasked Tier 1 PII in API | Fail if National ID, IBAN, or Passport is returned unmasked without audited permission |
| **PRIV-02** | Plaintext PII in Logs | Fail if log statements or logger configurations do not scrub sensitive PII keys |
| **PRIV-03** | Tier 1 Storage Encryption | Fail if database schema or entity model stores National ID or IBAN in unencrypted plain text |
| **PRIV-04** | Blind Index Key Security | Fail if searchable encrypted fields lack dedicated HMAC blind indexing |
| **PRIV-05** | Immutable Audit Trail | Fail if PII mutations lack persistent `IImmutableAuditRecord` / audit logging capture |
