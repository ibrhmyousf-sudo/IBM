/**
 * 183-Control Project Security Delivery Checklist V1.1 Catalog & Applicability Engine (v4.2.0)
 * Mapped to Saudi NCA ECC 2:2024, NCA CCC/DCC/NCS, DGA, OWASP ASVS 5.0,
 * OWASP API Security Top 10 (2023), OWASP MASVS (Tier-2), and OWASP LLMSVS 2.0.
 * Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

const PHASES = {
  P1: '1. Planning & Governance',
  P2: '2. Identity & Authentication',
  P3: '3. Authorization & Business Logic',
  P4: '4. Input, Output & File Security',
  P5: '5. API Security',
  P6: '6. Web & Secure Configuration',
  P7: '7. Mobile Security',
  P8: '8. AI & LLM Security',
  P9: '9. Infrastructure, Cloud & Deployment',
  P10: '10. Monitoring & Resilience',
  P11: '11. Testing & Release Sign-Off'
};

function c(
  num,
  phase,
  domain,
  appliesTo,
  title,
  priority,
  releaseBlocker,
  applicabilityRule,
  verificationMode,
  scannerRuleIds,
  ncaEccClause,
  ncaAddons,
  owaspRef,
  passCriteria
) {
  return {
    id: `SEC-${String(num).padStart(3, '0')}`,
    phase,
    domain,
    appliesTo,
    title,
    priority,
    mandatory: true,
    releaseBlocker,
    applicabilityRule,
    verificationMode,
    scannerRuleIds,
    ncaEccClause,
    ncaAddons,
    owaspRef,
    passCriteria
  };
}

const RAW_CONTROLS = [
  // =========================================================================
  // PHASE 1: 1. Planning & Governance (SEC-001..SEC-015 — 15 controls)
  // Totals: 5 Critical, 9 High, 1 Medium | 12 Blockers, 3 Non-blockers
  // =========================================================================
  c(1, PHASES.P1, 'Governance & Ownership', 'All Projects',
    'Assign named Project Security Owner & Security Reviewer with release veto authority',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-4', ['DGA'], 'ASVS V1.1',
    'Named Security Owner and independent Security Reviewer documented in project charter and sign-off matrix.'),
  c(2, PHASES.P1, 'Asset & Scope Profile', 'All Projects',
    'Document delivery scope, exposed surfaces (Web/API/AI/Mobile), and system asset inventory',
    'Critical', true, 'always', 'AUTOMATED', [], 'ECC 2-1', ['DGA'], 'ASVS V1.2',
    'security_profile in stack.json and asset inventory explicitly declare all active surfaces with zero unconfirmed toggles.'),
  c(3, PHASES.P1, 'Regulatory Scope', 'All Projects',
    'Bind applicable regulatory baselines (Saudi NCA ECC 2:2024, PDPL, DGA, OWASP)',
    'High', true, 'always', 'AUTOMATED', [], 'ECC 1-3', ['NCA DCC', 'DGA'], 'ASVS V1.1',
    'Active compliance standards and regional hosting constraints declared in stack.json compliance & security_profile.'),
  c(4, PHASES.P1, 'Risk Management', 'All Projects',
    'Conduct pre-development cybersecurity risk assessment covering business & tenant threats',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-5', [], 'ASVS V1.2',
    'Approved project risk register with likelihood, impact, and treatment owners signed prior to production.'),
  c(5, PHASES.P1, 'Threat Modeling', 'All Projects',
    'Perform architecture threat modeling (STRIDE / abuse cases) across auth, tenant, API, and AI boundaries',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'ASVS V1.1',
    'Threat model document links trust boundaries, abuse cases, and compensating controls.'),
  c(6, PHASES.P1, 'Architecture Review', 'All Projects',
    'Complete security architecture review of network, auth, storage, and integration topology',
    'High', true, 'always', 'MANUAL_EVIDENCE', ['NET-A01'], 'ECC 1-6', ['NCA CCC'], 'ASVS V1.4',
    'Architecture diagram and boundary review approved with zero Clean Architecture or HMVC layer inversions.'),
  c(7, PHASES.P1, 'Secure SDLC Gates', 'All Projects',
    'Enforce automated pre-commit, CI SAST/SCA, and Two-Gate engineering readiness checks in SDLC',
    'High', true, 'always', 'AUTOMATED', ['FE-Q02'], 'ECC 1-6', [], 'ASVS V1.14',
    'Pre-commit guard and CI security verification scripts active and blocking on Critical/High defects.'),
  c(8, PHASES.P1, 'Specification Security', 'All Projects',
    'Embed explicit security acceptance criteria and negative role tests in feature specifications',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'ASVS V1.1',
    'Feature specs (Gate B Section 11 ENG-06/ENG-07/ENG-09) define RBAC, PII masking, and negative test bindings.'),
  c(9, PHASES.P1, 'Access Control Design', 'All Projects',
    'Approve canonical Role-Permission Matrix across all system personas and tenant tiers',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-2', [], 'ASVS V4.1',
    'Signed Role-Permission Matrix mapping every endpoint/action to allowed roles and ownership scopes.'),
  c(10, PHASES.P1, 'Team Readiness', 'All Projects',
    'Verify engineering team adherence to stack-specific secure coding rules and lessons learned',
    'Medium', false, 'always', 'AUTOMATED', [], 'ECC 1-9', [], 'ASVS V1.1',
    'Stack-selective IDE security rules exported (<22KB) and LESSONS_LEARNED.md bound to active workflow.'),
  c(11, PHASES.P1, 'Data Classification', 'PII / Regulated Data',
    'Classify data assets (Public, Internal, Confidential, Restricted/PII) with handling rules',
    'Critical', true, 'hosting.holds_regulated_pii', 'MANUAL_EVIDENCE', [], 'ECC 2-7', ['NCA DCC', 'SDAIA PDPL'], 'ASVS V8.1',
    'Data classification matrix maps Tier-1/Tier-2 PII fields to AES-256 encryption, masking, and retention controls.'),
  c(12, PHASES.P1, 'Data Flow Mapping', 'All Projects',
    'Maintain end-to-end data flow diagrams covering ingress, storage, exports, backups, and external APIs',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-1', ['NCA DCC'], 'ASVS V1.2',
    'Current data-flow diagram documents internal/external flows and TLS/encryption posture on each link.'),
  c(13, PHASES.P1, 'Third-Party Risk', 'Outbound Integrations',
    'Complete cybersecurity due diligence and contractual controls for third-party APIs & SDKs',
    'High', true, 'features.third_party_outbound_apis', 'MANUAL_EVIDENCE', [], 'ECC 4-1', [], 'ASVS V10.1',
    'Third-party integrations reviewed for TLS, least privilege, SLA, and incident notification clauses.'),
  c(14, PHASES.P1, 'Cloud & Residency Governance', 'Cloud / Hybrid Hosting',
    'Verify cloud provider compliance and KSA data residency alignment prior to deployment',
    'High', true, 'hosting.saudi_nca_scope', 'MANUAL_EVIDENCE', [], 'ECC 4-2', ['NCA CCC'], 'ASVS V1.1',
    'Cloud tenant region, residency attestation, and shared-responsibility matrix approved.'),
  c(15, PHASES.P1, 'Audit Cadence', 'All Projects',
    'Define periodic security review, compliance audit, and vulnerability reassessment schedule',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-8', [], 'ASVS V1.1',
    'Governance calendar schedules periodic SAST/DAST, access review, and ECC compliance audits.'),

  // =========================================================================
  // PHASE 2: 2. Identity & Authentication (SEC-016..SEC-033 — 18 controls)
  // Totals: 10 Critical, 8 High, 0 Medium | 17 Blockers, 1 Non-blocker
  // =========================================================================
  c(16, PHASES.P2, 'Endpoint Authentication', 'REST API / Web Backend',
    'Authenticate every non-public API and web endpoint server-side',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S02', 'NET-S04', 'NET-S12', 'NET-S13'], 'ECC 2-2', [], 'ASVS V2.1 / API2:2023',
    'Zero non-public controllers, Minimal API groups, or routes reachable without auth:sanctum / [Authorize] / RequireAuthorization().'),
  c(17, PHASES.P2, 'Client Auth Integrity', 'Web SPA',
    'Prohibit frontend-only authorization or reliance on hidden UI controls without server enforcement',
    'Critical', true, 'surfaces.web_spa', 'AUTOMATED', ['FE-S08', 'LAR-S02', 'NET-S13'], 'ECC 2-2', [], 'ASVS V4.1 / API5:2023',
    'SPA router enforces navigation guards (beforeEach/middleware) AND backend independently enforces auth/RBAC.'),
  c(18, PHASES.P2, 'Credential Hygiene', 'All Surfaces',
    'Remove all default, shared, test, and hard-coded credentials, tokens, and user GUIDs',
    'Critical', true, 'always', 'AUTOMATED', ['NET-S01', 'FE-S03', 'FE-S09'], 'ECC 2-2', ['NCA NCS'], 'ASVS V2.10 / API2:2023',
    'Zero hardcoded passwords, sa logins, JWT keys, API secrets, or static user/tenant UUIDs in source or config.'),
  c(19, PHASES.P2, 'Password Policy', 'Password Login',
    'Enforce approved password complexity, minimum length (>=12), breach check, and Argon2id/bcrypt/PBKDF2 hashing',
    'High', true, 'features.password_login', 'AUTOMATED', ['FE-S02', 'NET-S10'], 'ECC 2-2', [], 'ASVS V2.1',
    'Strong password validator and adaptive one-way password hashing enforced on registration, invite, and reset.'),
  c(20, PHASES.P2, 'Multi-Factor Authentication', 'Privileged & Admin Access',
    'Enforce MFA for all administrative, privileged, and sensitive operational accounts',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-2', ['NCA CCC', 'NCA NCS'], 'ASVS V2.8',
    'Privileged/admin login enforces second factor (TOTP/WebAuthn/SSO MFA) with verified enrollment and enforcement evidence.'),
  c(21, PHASES.P2, 'Login Brute-Force Defense', 'Authentication Endpoints',
    'Enforce login rate limiting and progressive lockout per account identifier AND client IP',
    'Critical', true, 'features.password_login', 'AUTOMATED', ['LAR-S03', 'NET-S05', 'NET-S12'], 'ECC 2-2', [], 'ASVS V2.2 / API4:2023',
    'Login endpoints enforce strict rate-limit policies (throttle / RequireRateLimiting) returning 429 on burst attempts.'),
  c(22, PHASES.P2, 'Cryptographic OTP', 'OTP Authentication',
    'Generate OTP codes using CSPRNG (random_int / RandomNumberGenerator) — prohibit static/predictable OTPs',
    'Critical', true, 'features.otp_auth', 'AUTOMATED', ['LAR-S04', 'NET-S21'], 'ECC 2-2', [], 'ASVS V2.8 / API2:2023',
    'Zero static OTP literals (123456/0000) or insecure PRNG (rand/Math.random) in authentication/verification flows.'),
  c(23, PHASES.P2, 'OTP Throttling', 'OTP Authentication',
    'Enforce strict throttling and max attempt lockouts across OTP request, resend, and verify endpoints',
    'Critical', true, 'features.otp_auth', 'AUTOMATED', ['LAR-S03', 'NET-S21'], 'ECC 2-2', [], 'ASVS V2.2 / API4:2023',
    'OTP send/resend/verify endpoints apply explicit throttle middleware and invalidate code after bounded failed attempts.'),
  c(24, PHASES.P2, 'OTP TTL & Single-Use', 'OTP Authentication',
    'Enforce short OTP expiration TTL (<=5 minutes) and immediate single-use invalidation upon verification',
    'Critical', true, 'features.otp_auth', 'AUTOMATED', ['LAR-S04', 'NET-S21'], 'ECC 2-2', [], 'ASVS V2.8',
    'OTP records store hashed value with strict expires_at check and atomic consumption on first valid use.'),
  c(25, PHASES.P2, 'Password Reset ATO Defense', 'Password Reset',
    'Prevent account takeover in password-reset flows (bind token to account, never trust client userId/email override)',
    'Critical', true, 'features.password_reset', 'AUTOMATED', ['LAR-S04', 'NET-S21'], 'ECC 2-2', [], 'ASVS V2.5 / API2:2023',
    'Reset flow resolves target user strictly from server-side hashed token record and invalidates active sessions on reset.'),
  c(26, PHASES.P2, 'Hashed Reset & Invite Tokens', 'Reset & Invitations',
    'Generate high-entropy single-use invitation and password-reset tokens stored hashed at rest',
    'Critical', true, 'features.password_reset || features.invitations', 'AUTOMATED', ['LAR-S04', 'NET-S21'], 'ECC 2-2', ['NCA NCS'], 'ASVS V2.3',
    'Reset and invite tokens use >=32 bytes CSPRNG entropy, are stored via SHA-256/bcrypt hash, and expire on first use.'),
  c(27, PHASES.P2, 'Anti-User Enumeration', 'Auth / Reset / Invite',
    'Return uniform, timing-safe responses across login, forgot-password, registration, and invite endpoints',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S04', 'NET-S21'], 'ECC 2-2', [], 'ASVS V2.5 / API2:2023',
    'Zero distinct "email not found" / "user does not exist" / "account inactive" oracle messages exposed to unauthenticated callers.'),
  c(28, PHASES.P2, 'Session & Token Rotation', 'Auth & Session Management',
    'Rotate session IDs and refresh/JWT tokens upon login, privilege change, MFA verification, and password reset',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S11', 'NET-S14'], 'ECC 2-2', [], 'ASVS V3.2',
    'Single token scheme active; refresh tokens rotate with reuse detection and privilege changes invalidate prior tokens.'),
  c(29, PHASES.P2, 'Token Lifetime Enforcement', 'REST API / SPA',
    'Enforce strict token/session expiration (ValidateLifetime=true, short access JWT TTL)',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S14'], 'ECC 2-2', [], 'ASVS V3.3 / API2:2023',
    'JWT bearer validation enforces ValidateLifetime = true with bounded access-token TTL (<60m) and zero multi-week non-expiring tokens.'),
  c(30, PHASES.P2, 'Server-Side Logout Revocation', 'REST API / SPA',
    'Revoke sessions and bearer/refresh tokens server-side on logout (token delete / jti denylist)',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S14', 'FE-S01'], 'ECC 2-2', [], 'ASVS V3.3',
    'Logout endpoint revokes server-side Sanctum token / refresh family / JWT jti; previously issued token is rejected post-logout.'),
  c(31, PHASES.P2, 'Step-Up Re-Authentication', 'High-Risk Actions',
    'Require step-up password or MFA re-verification prior to email/password change, payout, or key rotation',
    'High', false, 'surfaces.rest_api', 'MANUAL_EVIDENCE', [], 'ECC 2-2', [], 'ASVS V2.2',
    'Sensitive account/security mutations verify fresh authentication timestamp or secondary challenge.'),
  c(32, PHASES.P2, 'Cookie Security Attributes', 'Cookie-Authenticated Web',
    'Enforce Secure, HttpOnly, and SameSite=Lax/Strict attributes on all session and auth cookies',
    'High', true, 'features.cookie_auth', 'AUTOMATED', ['FE-S01'], 'ECC 2-2', [], 'ASVS V3.4',
    'Auth cookies set HttpOnly=true, Secure=true, SameSite=Strict/Lax; zero bearer tokens persisted in localStorage/sessionStorage.'),
  c(33, PHASES.P2, 'Hardware Biometric CryptoObject', 'Mobile App (Tier-2)',
    'Bind mobile biometric authentication to hardware-backed Keystore/Keychain CryptoObject (OWASP MASVS-AUTH)',
    'High', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-2', [], 'MASVS-AUTH-2',
    'BiometricPrompt authenticates a Keystore/Keychain cryptographic operation rather than a boolean callback.'),

  // =========================================================================
  // PHASE 3: 3. Authorization & Business Logic (SEC-034..SEC-051 — 18 controls)
  // Totals: 12 Critical, 6 High, 0 Medium | 16 Blockers, 2 Non-blockers
  // =========================================================================
  c(34, PHASES.P3, 'RBAC Server Enforcement', 'REST API / Backend',
    'Enforce approved Role-Permission Matrix server-side via Policies, Gates, or MediatR AuthorizationBehaviours',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S05', 'NET-S04', 'NET-S22'], 'ECC 2-2', [], 'ASVS V4.1 / API5:2023',
    'Every protected action verifies explicit permission/policy matching the approved Role-Permission Matrix.'),
  c(35, PHASES.P3, 'Deny-By-Default Policy', 'REST API / Backend',
    'Configure deny-by-default fallback authorization policy across API routers and pipelines',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S02', 'NET-S04', 'NET-S12', 'NET-S13'], 'ECC 2-2', [], 'ASVS V4.1',
    'ASP.NET FallbackPolicy / MediatR pipeline or Laravel auth:sanctum group denies undeclared endpoints by default.'),
  c(36, PHASES.P3, 'Object-Level Auth (IDOR)', 'REST API / Backend',
    'Enforce object-level ownership and tenant authorization (IDOR defense) on every ID/UUID parameter',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S05', 'NET-S09'], 'ECC 2-2', [], 'ASVS V4.2 / API1:2023',
    'All show/update/delete/nested lookups scope by authenticated user/tenant ownership and fail closed with 404 Not Found.'),
  c(37, PHASES.P3, 'Function-Level Authorization', 'Admin & Privileged APIs',
    'Enforce explicit role/permission guards on all administrative, approval, and management endpoints',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S05', 'NET-S22'], 'ECC 2-2', [], 'ASVS V4.1 / API5:2023',
    'Admin, approval, and configuration routes enforce explicit role/policy checks beyond bare [Authorize].'),
  c(38, PHASES.P3, 'Privilege Escalation Defense', 'Role & User Management',
    'Prevent vertical privilege escalation, self-role-assignment, and unauthorized permission grants',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S05', 'NET-S22'], 'ECC 2-2', [], 'ASVS V4.1 / API5:2023',
    'Role assignment endpoints require privileged admin policy and prevent assigning roles higher than caller scope.'),
  c(39, PHASES.P3, 'Multi-Tenant Isolation', 'Multi-Tenant Systems',
    'Isolate tenant data, caches, files, exports, and background jobs strictly by server-resolved tenant_id',
    'Critical', true, 'features.multi_tenant', 'AUTOMATED', ['LAR-S05', 'NET-S09', 'LLM-S04'], 'ECC 2-2', ['NCA CCC', 'NCA DCC'], 'ASVS V4.1 / API1:2023',
    'Tenant ID resolved exclusively from auth context; global scopes/query filters, cache keys, and storage paths prevent cross-tenant access.'),
  c(40, PHASES.P3, 'Invitation & Registration Control', 'Invitations & Onboarding',
    'Restrict user invitations, self-registration, and workspace/project team assignment to authorized roles',
    'High', true, 'features.invitations', 'AUTOMATED', ['NET-S10', 'NET-S22', 'LAR-S05'], 'ECC 2-2', [], 'ASVS V4.1 / API5:2023',
    'Template open /register routes disabled or guarded; invitations validate caller tenant/project admin permission.'),
  c(41, PHASES.P3, 'Destructive Action Guards', 'Delete / Cancel / Approve',
    'Enforce strict ownership, role policy, and valid lifecycle state checks on delete, cancel, approve, and reject',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S05', 'NET-S22'], 'ECC 2-2', [], 'ASVS V4.2 / API6:2023',
    'Delete/cancel/approve actions verify both caller policy and valid entity state before mutation.'),
  c(42, PHASES.P3, 'Bulk Operation Controls', 'Bulk Import / Export / Delete',
    'Enforce authorization, tenant scoping, batch size caps, and rate limits on bulk import/export/update/delete',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S03', 'LAR-S05', 'LAR-S08'], 'ECC 2-2', [], 'ASVS V4.2 / API4:2023',
    'Bulk endpoints enforce per-item tenant ownership, hard batch count caps, and endpoint throttling.'),
  c(43, PHASES.P3, 'Report & Dashboard Scoping', 'Reports & Dashboards',
    'Filter all analytics, KPIs, and dashboard queries by caller role and authorized data/tenant scope',
    'Critical', true, 'features.reports_and_dashboards', 'AUTOMATED', ['LAR-S05', 'LAR-S08'], 'ECC 2-2', ['NCA DCC'], 'ASVS V4.1 / API1:2023',
    'Aggregate and reporting queries enforce mandatory tenant/department/branch scope filters.'),
  c(44, PHASES.P3, 'Scoped Private Exports', 'PDF & Excel Exports',
    'Authenticate and scope PDF/Excel export endpoints and store generated artifacts in private non-public storage',
    'Critical', true, 'features.pdf_or_excel_exports', 'AUTOMATED', ['LAR-S03', 'LAR-S06', 'NET-S15'], 'ECC 2-7', ['NCA DCC'], 'ASVS V4.2 / API1:2023',
    'Export endpoints require auth + throttling; generated files never written to public/ or wwwroot/exports.'),
  c(45, PHASES.P3, 'Authorized File Streams', 'File Uploads & Downloads',
    'Enforce business-ownership authorization on every file preview and download stream',
    'Critical', true, 'features.file_uploads', 'AUTOMATED', ['LAR-S06', 'LAR-S07', 'NET-S15', 'NET-S16'], 'ECC 2-2', ['NCA DCC'], 'ASVS V12.5 / API1:2023',
    'Files streamed via authenticated controller/signed short-lived URL after verifying caller ownership; direct public URL access blocked.'),
  c(46, PHASES.P3, 'Scoped Notifications', 'In-App Notifications',
    'Scope notification list, read, mark-read, and delete operations strictly to recipient user_id',
    'High', true, 'features.notifications', 'AUTOMATED', ['LAR-S05'], 'ECC 2-2', [], 'ASVS V4.2 / API1:2023',
    'Notification queries bind where user_id == authenticated caller ID; foreign notification IDs return 404.'),
  c(47, PHASES.P3, 'Mass-Assignment Prevention', 'REST API / ORM',
    'Prevent mass-assignment and over-posting via explicit $fillable whitelists and immutable request DTOs',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S05'], 'ECC 1-6', [], 'ASVS V5.1 / API3:2023',
    'Zero $guarded = [], zero $request->all() persistence, and zero privilege/tenant fields in $fillable or bindable DTOs.'),
  c(48, PHASES.P3, 'Response Minimization & Masking', 'REST API / PII',
    'Enforce response DTO/Resource projection, $hidden attributes, and Tier-1/2 PII field masking',
    'High', false, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 2-7', ['NCA DCC', 'SDAIA PDPL'], 'ASVS V8.3 / API3:2023',
    'API responses use explicit Resource/DTO transformers hiding password hashes, tokens, secrets, and raw national IDs.'),
  c(49, PHASES.P3, 'Workflow State & Self-Approval', 'Transactional Workflows',
    'Enforce deterministic state-machine transitions and block creator self-approval on maker-checker flows',
    'High', true, 'features.transactional_workflows', 'MANUAL_EVIDENCE', [], 'ECC 2-2', [], 'ASVS V11.1 / API6:2023',
    'Domain state transitions reject illegal jumps and enforce distinct approver != requester where maker-checker applies.'),
  c(50, PHASES.P3, 'Verb-Tampering Consistency', 'REST API / Routing',
    'Enforce consistent authorization across all HTTP verbs and block Route::any / method-override bypasses',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S02'], 'ECC 2-2', [], 'ASVS V4.1 / API9:2023',
    'Routes bind explicit HTTP verbs (GET/POST/PUT/PATCH/DELETE); Route::any and unauthenticated HEAD/OPTIONS/method-override leaks blocked.'),
  c(51, PHASES.P3, 'Concurrency & Race Defense', 'Transactional Workflows',
    'Protect balance, quota, approval, and booking mutations with DB row locks / optimistic concurrency & idempotency',
    'High', false, 'features.transactional_workflows', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'ASVS V11.1 / API6:2023',
    'Critical state/financial mutations execute inside atomic transactions with row version / pessimistic lock protection.'),

  // =========================================================================
  // PHASE 4: 4. Input, Output & File Security (SEC-052..SEC-069 — 18 controls)
  // Totals: 9 Critical, 9 High, 0 Medium | 15 Blockers, 3 Non-blockers
  // =========================================================================
  c(52, PHASES.P4, 'SQL Injection Defense', 'Database & AI Queries',
    'Enforce parameterized SQL queries and strictly prohibit executing user- or AI-supplied raw SQL',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S07', 'NET-S08', 'LLM-S01'], 'ECC 1-6', [], 'ASVS V5.3 / OWASP A03',
    'Zero interpolated DB::raw/whereRaw/FromSqlRaw/ExecuteSqlRaw and zero execution of LLM-generated SQL statements.'),
  c(53, PHASES.P4, 'Command Injection Defense', 'Backend Services',
    'Prohibit shell/OS command execution with untrusted input; use safe native APIs or argument arrays',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LLM-S01'], 'ECC 1-6', [], 'ASVS V5.3 / OWASP A03',
    'Zero shell_exec/exec/Process.Start/child_process.exec concatenating user or AI input.'),
  c(54, PHASES.P4, 'SSRF & Outbound Fetch Defense', 'Outbound HTTP & PDF Generators',
    'Enforce host allowlists, RFC1918/metadata IP blocking, and TLS certificate verification on outbound fetches',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S18', 'EXP-S01'], 'ECC 2-5', [], 'ASVS V10.2 / API7:2023',
    'Outbound HttpClient/Guzzle validates TLS certificates and blocks private/link-local IPs on user/PDF URLs.'),
  c(55, PHASES.P4, 'Path Traversal & LFD Defense', 'File Read / Download',
    'Canonicalize file paths and enforce storage-root prefix bounds to prevent Path Traversal / LFD',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S07', 'NET-S16'], 'ECC 1-6', [], 'ASVS V12.3',
    'Download/read handlers resolve storage keys from DB or validate Path.GetFullPath prefix / basename() before file access.'),
  c(56, PHASES.P4, 'XSS Sanitization & Safe Sinks', 'Web SPA & Templates',
    'Eliminate unsanitized HTML sinks (v-html, dangerouslySetInnerHTML, innerHTML) to prevent Stored/DOM XSS',
    'Critical', true, 'surfaces.web_spa', 'AUTOMATED', ['FE-S06', 'FE-S10'], 'ECC 1-6', [], 'ASVS V5.3 / OWASP A03',
    'Dynamic content rendered as escaped text or sanitized via hardened DOMPurify (>=3.1.3) under strict CSP.'),
  c(57, PHASES.P4, 'Active Upload Content Block', 'File Uploads',
    'Block active/scriptable upload formats (SVG, HTML, JS, PHP, ASPX, EXE, SH) or serve strictly non-executable',
    'Critical', true, 'features.file_uploads', 'AUTOMATED', ['UPL-S01'], 'ECC 1-6', [], 'ASVS V12.1',
    'Upload extension/MIME allowlists exclude svg/html/js/php/aspx/exe and enforce Content-Disposition: attachment + nosniff.'),
  c(58, PHASES.P4, 'Magic-Byte Signature Validation', 'File Uploads',
    'Validate uploaded files server-side by allowlisted extension, MIME type, AND binary magic-byte header',
    'High', true, 'features.file_uploads', 'AUTOMATED', ['UPL-S02'], 'ECC 1-6', [], 'ASVS V12.2',
    'Upload validators inspect actual binary signatures (finfo_file / FileSignature header bytes), never trusting client Content-Type.'),
  c(59, PHASES.P4, 'Upload Size & Rate Bounds', 'File Uploads',
    'Enforce per-file byte limits, file count caps, and upload rate limits (forbid [DisableRequestSizeLimit])',
    'High', true, 'features.file_uploads', 'AUTOMATED', ['NET-S19', 'LAR-S03'], 'ECC 1-6', [], 'ASVS V12.1 / API4:2023',
    'Zero [DisableRequestSizeLimit] attributes; upload endpoints enforce explicit max file size and request throttling.'),
  c(60, PHASES.P4, 'Upload Malware Scanning', 'File Uploads',
    'Integrate asynchronous/inline antivirus or malware quarantine scanning on untrusted file uploads',
    'High', false, 'features.file_uploads', 'MANUAL_EVIDENCE', [], 'ECC 2-9', [], 'ASVS V12.4',
    'Uploaded files pass ClamAV/Defender/cloud malware scan hook prior to downstream user distribution.'),
  c(61, PHASES.P4, 'Private Storage & UUID Keys', 'File Uploads',
    'Store uploaded files outside webroot (public/ or wwwroot/) using server-generated UUID/ULID filenames',
    'High', true, 'features.file_uploads', 'AUTOMATED', ['LAR-S06', 'NET-S15', 'UPL-S03'], 'ECC 2-7', ['NCA DCC'], 'ASVS V12.1',
    'Uploads use private disk/bucket with generated UUID keys; zero getClientOriginalName() or wwwroot/FileServer writes.'),
  c(62, PHASES.P4, 'PDF/Document Render Sanitization', 'PDF & Document Exports',
    'Sanitize HTML templates and disable local-file/SSRF network access prior to server-side PDF rendering',
    'High', false, 'features.pdf_or_excel_exports', 'AUTOMATED', ['EXP-S01'], 'ECC 1-6', [], 'ASVS V12.3 / API7:2023',
    'PDF engines (DomPDF/Wkhtmltopdf/DinkToPdf/Puppeteer) sanitize dynamic HTML and block file:// and internal HTTP fetches.'),
  c(63, PHASES.P4, 'XXE Prevention', 'XML / Document Parsers',
    'Disable DTD and external XML entity resolution across all XML, DOCX, XLSX, and SOAP parsers',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 1-6', [], 'ASVS V5.5',
    'XML readers set DtdProcessing.Prohibit /XmlResolver = null / LIBXML_NONET with zero external entity expansion.'),
  c(64, PHASES.P4, 'Safe Deserialization', 'REST API / Queues',
    'Prohibit unsafe binary/type-name deserialization (BinaryFormatter, TypeNameHandling.All, unserialize)',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 1-6', [], 'ASVS V5.5 / OWASP A08',
    'All JSON/queue payloads deserialize into strict static types without polymorphic untrusted type resolvers.'),
  c(65, PHASES.P4, 'Template Injection (SSTI) Defense', 'Templates & Notifications',
    'Prohibit compiling user-controlled strings as Blade, Razor, Twig, or Liquid server templates',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 1-6', [], 'ASVS V5.2',
    'Notification/email templates use fixed parameterized placeholders rather than dynamic template evaluation.'),
  c(66, PHASES.P4, 'CSRF Protection', 'Cookie-Authenticated Web',
    'Enforce anti-CSRF tokens and origin verification on all state-changing cookie-authenticated routes',
    'High', true, 'features.cookie_auth', 'AUTOMATED', [], 'ECC 2-2', [], 'ASVS V4.2',
    'VerifyCsrfToken / ValidateAntiForgeryToken active on all cookie-authenticated POST/PUT/PATCH/DELETE routes.'),
  c(67, PHASES.P4, 'Central Schema Validation', 'REST API / Backend',
    'Validate all request inputs (body, query, route params, headers) via FormRequest or FluentValidation allowlists',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S05'], 'ECC 1-6', [], 'ASVS V5.1 / API8:2023',
    'Every mutating endpoint validates types, lengths, enums, and numeric ranges before invoking domain services.'),
  c(68, PHASES.P4, 'Context-Aware Output Encoding', 'Web SPA & Backend Views',
    'Apply context-aware HTML, attribute, URL, and JSON output encoding across UI views and responses',
    'High', true, 'surfaces.web_spa', 'AUTOMATED', ['FE-S06', 'FE-S10'], 'ECC 1-6', [], 'ASVS V5.3',
    'Framework auto-escaping preserved across Vue/React/Blade/Razor templates; javascript: URLs rejected.'),
  c(69, PHASES.P4, 'CSV / Excel Formula Neutralization', 'Spreadsheet Exports',
    'Neutralize spreadsheet formula-injection prefixes (=, +, -, @, tab, CR) in exported CSV and Excel cells',
    'High', false, 'features.pdf_or_excel_exports', 'AUTOMATED', ['EXP-S02'], 'ECC 1-6', [], 'ASVS V5.3',
    'CSV/Excel export writers prefix leading =, +, -, @ characters on untrusted strings before cell serialization.'),

  // =========================================================================
  // PHASE 5: 5. API Security (SEC-070..SEC-085 — 16 controls)
  // Totals: 3 Critical, 13 High, 0 Medium | 10 Blockers, 6 Non-blockers
  // =========================================================================
  c(70, PHASES.P5, 'API Inventory & Governance', 'REST API',
    'Maintain complete OpenAPI inventory of all routes with authentication, role, and exposure metadata',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 2-1', ['DGA'], 'API9:2023',
    'docs/modules/*.json or OpenAPI contract accurately inventories active endpoints and security schemes.'),
  c(71, PHASES.P5, 'Disable Public API Docs in Prod', 'REST API',
    'Disable or gate Swagger, Scalar, and OpenAPI interactive UIs in Staging and Production environments',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S01', 'NET-S03', 'NET-S17'], 'ECC 2-5', [], 'API8:2023 / API9:2023',
    'Swagger/Scalar/OpenAPI UI wrapped in IsDevelopment() / non-production guard or strict admin authorization.'),
  c(72, PHASES.P5, 'Strict JWT Validation', 'REST API',
    'Validate JWT signature, algorithm allowlist, issuer, audience, lifetime, and RequireHttpsMetadata=true',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S01', 'NET-S14'], 'ECC 2-2', ['NCA NCS'], 'ASVS V3.5 / API2:2023',
    'JWT middleware enforces ValidateIssuerSigningKey, ValidateIssuer, ValidateAudience, ValidateLifetime=true, RequireHttpsMetadata=true.'),
  c(73, PHASES.P5, 'Endpoint-Specific Rate Limiting', 'REST API',
    'Enforce granular per-user/IP rate limits on auth, OTP, reset, upload, export, AI, and bulk endpoints',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S03', 'NET-S05', 'LLM-S05'], 'ECC 2-5', [], 'ASVS V13.1 / API4:2023',
    'High-cost and sensitive endpoints enforce dedicated rate-limit policies with Retry-After headers.'),
  c(74, PHASES.P5, 'Bounded Server Pagination', 'REST API',
    'Enforce mandatory server-side pagination with a hard maximum pageSize clamp (e.g. <=100)',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S08', 'NET-S19'], 'ECC 1-6', [], 'API4:2023',
    'Collection endpoints paginate results and clamp client per_page/pageSize to a server ceiling; zero unbounded ::all().'),
  c(75, PHASES.P5, 'Payload & JSON Depth Limits', 'REST API',
    'Enforce bounded request body size, JSON nesting depth, and array element limits',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S19'], 'ECC 1-6', [], 'ASVS V13.2 / API4:2023',
    'Kestrel/Nginx/PHP max body size and JSON serializer MaxDepth configured without DisableRequestSizeLimit overrides.'),
  c(76, PHASES.P5, 'Contract Schema Conformance', 'REST API',
    'Validate request and response payloads against strict OpenAPI / typed contract schemas',
    'High', false, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 1-6', [], 'API3:2023 / API8:2023',
    'API responses conform to standardized envelope/ProblemDetails contracts without undocumented fields.'),
  c(77, PHASES.P5, 'Zero Stack/Exception Leakage', 'REST API',
    'Return generic error envelopes — never expose ex.Message, $e->getMessage(), SQL queries, or stack traces',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S08', 'NET-S20'], 'ECC 1-6', [], 'ASVS V7.4 / API8:2023',
    'Global exception handler maps unhandled errors to generic 500 envelope with trace_id; zero raw exception messages returned.'),
  c(78, PHASES.P5, 'Strict Content-Type Enforcement', 'REST API',
    'Enforce explicit Content-Type (application/json / multipart) and reject mismatches with 415 Unsupported Media Type',
    'High', false, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 1-6', [], 'ASVS V13.1 / API8:2023',
    'API controllers/endpoints accept declared media types only and return 415 on unexpected Content-Type.'),
  c(79, PHASES.P5, 'HTTP Method Allowlist & TRACE Block', 'REST API / Web Server',
    'Allow only required HTTP methods per route and disable TRACE / TRACK methods at server/router level',
    'High', false, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S02'], 'ECC 2-5', [], 'ASVS V14.5 / API8:2023',
    'TRACE disabled and routes explicitly declare single allowed HTTP verbs returning 405 on unsupported verbs.'),
  c(80, PHASES.P5, 'Mutation Idempotency Keys', 'Transactional APIs',
    'Enforce X-Idempotency-Key atomic locks on financial, checkout, and critical state-mutating POST/PATCH routes',
    'High', false, 'features.transactional_workflows', 'AUTOMATED', [], 'ECC 1-6', [], 'API6:2023',
    'Critical mutation endpoints deduplicate retried requests via X-Idempotency-Key scoped to caller user/tenant.'),
  c(81, PHASES.P5, 'Replay Attack Protection', 'Sensitive Flows',
    'Enforce timestamps, nonces, or single-use state tokens on high-value signed API operations',
    'High', false, 'surfaces.rest_api', 'MANUAL_EVIDENCE', [], 'ECC 2-2', [], 'ASVS V3.5',
    'Sensitive signed requests verify bounded timestamp skew and single-use nonce/jti replay cache.'),
  c(82, PHASES.P5, 'Webhook Signature & Replay Guard', 'Inbound Webhooks',
    'Verify HMAC/asymmetric signatures, timestamp freshness, and event-ID idempotency on inbound webhooks',
    'Critical', true, 'features.webhooks', 'MANUAL_EVIDENCE', [], 'ECC 2-5', [], 'ASVS V10.2 / API8:2023',
    'Webhook receivers compute constant-time HMAC over raw body, enforce <=5m timestamp window, and deduplicate event IDs.'),
  c(83, PHASES.P5, 'Outbound Third-Party API Hardening', 'Outbound Integrations',
    'Validate TLS certificates, enforce timeouts/circuit-breakers, and treat third-party API responses as untrusted',
    'High', false, 'features.third_party_outbound_apis', 'AUTOMATED', ['NET-S18'], 'ECC 4-1', [], 'API10:2023',
    'Outbound HTTP clients enforce valid TLS certificates, explicit timeouts, and schema validation on external responses.'),
  c(84, PHASES.P5, 'Explicit API Versioning', 'REST API',
    'Prefix endpoints with explicit /api/v{n} versioning and retire deprecated versions cleanly',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', [], 'ECC 2-1', ['DGA'], 'API9:2023',
    'All API routes versioned (/api/v1/...) with zero unmaintained shadow or legacy v0 endpoints left active.'),
  c(85, PHASES.P5, 'Explicit CORS Origin Allowlist', 'REST API',
    'Enforce explicit environment-configured CORS origin allowlist — forbid AllowAnyOrigin() or * in production',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S06', 'NET-S02'], 'ECC 2-5', [], 'ASVS V14.5 / API8:2023',
    'CORS policy restricts origins to explicit trusted HTTPS domains; fails closed when allowed origins config is empty.'),

  // =========================================================================
  // PHASE 6: 6. Web & Secure Configuration (SEC-086..SEC-097 — 12 controls)
  // Totals: 4 Critical, 6 High, 2 Medium | 9 Blockers, 3 Non-blockers
  // =========================================================================
  c(86, PHASES.P6, 'Production Debug Disabled', 'Web & API Backend',
    'Disable framework debug modes and developer exception pages in Staging and Production (APP_DEBUG=false)',
    'Critical', true, 'always', 'AUTOMATED', ['LAR-S01', 'NET-S20'], 'ECC 1-6', [], 'ASVS V14.2 / API8:2023',
    'APP_DEBUG=false in non-local configs and UseExceptionHandler() active without UseDeveloperExceptionPage in production.'),
  c(87, PHASES.P6, 'Lock Admin & Diagnostic Consoles', 'Background Jobs & Profilers',
    'Disable or strictly gate Telescope, Horizon, Hangfire, Clockwork, and debug profilers in production',
    'Critical', true, 'features.background_jobs_dashboard', 'AUTOMATED', ['LAR-S01', 'NET-S17'], 'ECC 2-2', [], 'ASVS V14.2 / API8:2023',
    'Telescope/Horizon/Hangfire dashboards restricted by strict admin policy + non-hardcoded auth or disabled in production.'),
  c(88, PHASES.P6, 'Browser Security Headers', 'Web SPA & Reverse Proxy',
    'Emit HSTS, X-Content-Type-Options: nosniff, Referrer-Policy, and Permissions-Policy headers',
    'High', true, 'surfaces.web_spa', 'AUTOMATED', ['FE-S11', 'FE-S12', 'NET-S07'], 'ECC 2-5', [], 'ASVS V14.4',
    'Web server / middleware emits Strict-Transport-Security, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy.'),
  c(89, PHASES.P6, 'Content Security Policy (CSP)', 'Web SPA',
    'Enforce effective Content-Security-Policy restricting script-src, object-src, base-uri, and third-party CDNs',
    'High', false, 'surfaces.web_spa', 'AUTOMATED', ['FE-S04', 'FE-S05', 'FE-S10'], 'ECC 2-5', ['SDAIA PDPL'], 'ASVS V14.4',
    'CSP header configured without unsafe-eval, self-hosting fonts/scripts and restricting connect-src/script-src.'),
  c(90, PHASES.P6, 'Clickjacking Defense', 'Web SPA',
    'Enforce CSP frame-ancestors \'none\'/\'self\' and X-Frame-Options: DENY/SAMEORIGIN',
    'High', true, 'surfaces.web_spa', 'AUTOMATED', ['FE-S04', 'NET-S07'], 'ECC 2-5', [], 'ASVS V14.4',
    'All web routes emit frame-ancestors and X-Frame-Options preventing UI redressing / iframe embedding.'),
  c(91, PHASES.P6, 'End-to-End TLS 1.2+ & DB Encryption', 'All Network Links',
    'Enforce HTTPS/TLS 1.2+ with HTTP->HTTPS redirect, valid certificates, and encrypted DB connections (Encrypt=True)',
    'Critical', true, 'always', 'AUTOMATED', ['NET-S01', 'NET-S18', 'FE-S07', 'FE-S11', 'LLM-S02'], 'ECC 2-8', ['ECC 2-15', 'NCA NCS'], 'ASVS V9.1',
    'Nginx/ingress redirects port 80 -> 443 TLS 1.2+, API/AI URLs use https://, and SQL connections enforce Encrypt=True.'),
  c(92, PHASES.P6, 'Server Banner Suppression', 'Web & API Servers',
    'Suppress Server, X-Powered-By, and X-AspNet-Version headers (server_tokens off / AddServerHeader = false)',
    'Medium', false, 'always', 'AUTOMATED', ['FE-S12', 'NET-S20'], 'ECC 2-5', [], 'ASVS V14.4 / API8:2023',
    'Nginx server_tokens off, Kestrel AddServerHeader = false, and PHP expose_php = Off configured.'),
  c(93, PHASES.P6, 'Correlation Error Handling', 'Web & API',
    'Serve generic user-facing error pages/envelopes carrying a correlation trace_id without internal details',
    'High', true, 'always', 'AUTOMATED', ['LAR-S08', 'NET-S20'], 'ECC 1-6', [], 'ASVS V7.4',
    'Global error handler logs full diagnostic detail internally against trace_id while returning safe generic message to client.'),
  c(94, PHASES.P6, 'Sensitive Cache-Control Hygiene', 'Web & API',
    'Emit Cache-Control: no-store on authenticated API responses, PII views, tokens, and exported files',
    'High', true, 'always', 'AUTOMATED', ['FE-S12'], 'ECC 2-7', ['NCA DCC'], 'ASVS V8.2',
    'Authenticated API and sensitive document responses include Cache-Control: no-store, private.'),
  c(95, PHASES.P6, 'Disable Production Source Maps', 'Web SPA',
    'Disable JavaScript/TypeScript .map source maps and debug build artifacts in production bundles',
    'Medium', false, 'surfaces.web_spa', 'AUTOMATED', ['FE-S13'], 'ECC 1-6', [], 'ASVS V14.2',
    'Vite/Nuxt/Webpack production build configuration sets sourcemap: false (or hidden non-public upload only).'),
  c(96, PHASES.P6, 'Frontend Dependency Remediation', 'Web SPA',
    'Remediate known vulnerable or EOL frontend npm packages (DOMPurify, Lodash, TinyMCE, Vue/React/Nuxt)',
    'High', true, 'surfaces.web_spa', 'AUTOMATED', ['SCA-S02'], 'ECC 2-10', [], 'ASVS V14.2 / OWASP A06',
    'Zero Critical/High vulnerabilities in frontend package.json / lockfile scan.'),
  c(97, PHASES.P6, 'Zero Public Bundle & Git Secrets', 'All Repositories',
    'Ensure zero API keys, DB passwords, or private tokens exist in VITE_*/NUXT_PUBLIC_* vars, public files, or git',
    'Critical', true, 'always', 'AUTOMATED', ['FE-S03', 'FE-S09', 'NET-S01', 'SCA-S01'], 'ECC 2-8', ['NCA NCS'], 'ASVS V2.10',
    'Zero secrets embedded in frontend env variables, client bundles, tracked config files, or repository archives.'),

  // =========================================================================
  // PHASE 7: 7. Mobile Security (SEC-098..SEC-115 — 18 controls, OWASP MASVS Tier-2)
  // Totals: 8 Critical, 9 High, 1 Medium | 12 Blockers, 6 Non-blockers
  // All bound strictly to surfaces.mobile_app -> auto N/A when mobile_app === false
  // =========================================================================
  c(98, PHASES.P7, 'Device Integrity', 'Mobile App (Tier-2)',
    'Implement multi-signal Root (Android) and Jailbreak (iOS) detection with tamper response',
    'High', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-11', [], 'MASVS-RESILIENCE-1',
    'App detects rooted/jailbroken environments and blocks or restricts regulated operations.'),
  c(99, PHASES.P7, 'Emulator Detection', 'Mobile App (Tier-2)',
    'Detect unauthorized emulator/simulator execution on production release builds',
    'High', false, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-11', [], 'MASVS-RESILIENCE-1',
    'Release binary detects emulator signatures and enforces risk policy.'),
  c(100, PHASES.P7, 'Binary Anti-Tampering', 'Mobile App (Tier-2)',
    'Verify APK/IPA signing certificate & Play Integrity / App Attest anti-repackaging checks at runtime',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-11', [], 'MASVS-RESILIENCE-2',
    'Modified or re-signed APK/IPA binaries fail runtime integrity attestation.'),
  c(101, PHASES.P7, 'Anti-Hooking Defense', 'Mobile App (Tier-2)',
    'Detect dynamic instrumentation and hooking frameworks (Frida, Xposed, Substrate, Objection)',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-11', [], 'MASVS-RESILIENCE-4',
    'Runtime defense terminates session when Frida/Xposed injection ports, maps, or hooks are present.'),
  c(102, PHASES.P7, 'Mobile Code Obfuscation', 'Mobile App (Tier-2)',
    'Enable R8/ProGuard/Swift symbol stripping and control-flow obfuscation on release builds',
    'High', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'MASVS-RESILIENCE-3',
    'Decompiled APK/IPA strips debug symbols and obfuscates sensitive domain/security classes.'),
  c(103, PHASES.P7, 'TLS Certificate Pinning', 'Mobile App (Tier-2)',
    'Enforce TLS SPKI certificate pinning with backup pins and forbid cleartext traffic',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-8', ['NCA NCS'], 'MASVS-NETWORK-2',
    'MITM proxy with custom CA certificate is rejected by mobile HTTP client.'),
  c(104, PHASES.P7, 'Secure Keystore / Keychain', 'Mobile App (Tier-2)',
    'Store tokens and sensitive data exclusively in Android Keystore / EncryptedSharedPreferences and iOS Keychain',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-8', ['NCA DCC'], 'MASVS-STORAGE-1',
    'Zero tokens or PII stored in plaintext SharedPreferences, NSUserDefaults, SQLite, or external storage.'),
  c(105, PHASES.P7, 'Mobile Secret & Log Hygiene', 'Mobile App (Tier-2)',
    'Eliminate hardcoded API keys in mobile binaries and disable Logcat/OSLog sensitive output in release',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-8', [], 'MASVS-STORAGE-2',
    'Static strings/resource scan of APK/IPA and runtime device logs reveal zero secrets or PII.'),
  c(106, PHASES.P7, 'Tapjacking / Overlay Defense', 'Mobile App (Tier-2)',
    'Protect sensitive mobile screens against UI overlay attacks (filterTouchesWhenObscured=true)',
    'High', false, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'MASVS-PLATFORM-3',
    'Android views set filterTouchesWhenObscured / hideOverlayWindows on auth and approval screens.'),
  c(107, PHASES.P7, 'App Switcher & Screenshot Guard', 'Mobile App (Tier-2)',
    'Prevent OS task-switcher snapshot caching and unauthorized screenshots on PII screens (FLAG_SECURE)',
    'High', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-7', ['NCA DCC'], 'MASVS-STORAGE-2',
    'FLAG_SECURE (Android) and background privacy blur overlay (iOS) active on authenticated views.'),
  c(108, PHASES.P7, 'Exported Components Hardening', 'Mobile App (Tier-2)',
    'Set android:exported="false" on internal Activities, Services, BroadcastReceivers, and ContentProviders',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'MASVS-PLATFORM-1',
    'AndroidManifest exports only explicitly required entry points protected by custom signature permissions.'),
  c(109, PHASES.P7, 'Verified App Links / Universal Links', 'Mobile App (Tier-2)',
    'Use verified Android App Links / iOS Universal Links and strictly validate deep-link parameters',
    'High', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'MASVS-PLATFORM-2',
    'Deep links verify assetlinks.json / apple-app-site-association and sanitize route/token parameters.'),
  c(110, PHASES.P7, 'WebView Hardening', 'Mobile App (Tier-2)',
    'Disable file:// access, universal file access, and untrusted JS bridges in mobile WebViews',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'MASVS-PLATFORM-2',
    'WebViews disable allowFileAccess/allowUniversalAccessFromFileURLs and restrict navigation to HTTPS allowlist.'),
  c(111, PHASES.P7, 'Debugger Attachment Defense', 'Mobile App (Tier-2)',
    'Prevent ptrace/JDWP/LLDB runtime debugger attachment in production mobile binaries',
    'High', false, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-11', [], 'MASVS-RESILIENCE-4',
    'Release build rejects debugger attachment and disables WebView remote debugging.'),
  c(112, PHASES.P7, 'Least-Privilege Mobile Permissions', 'Mobile App (Tier-2)',
    'Request only strictly necessary mobile OS permissions with runtime justification',
    'High', false, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-2', ['SDAIA PDPL'], 'MASVS-PRIVACY-1',
    'Manifest/Info.plist requests minimal permissions aligned with documented business features.'),
  c(113, PHASES.P7, 'Clipboard Protection', 'Mobile App (Tier-2)',
    'Restrict copying/pasting or auto-clear sensitive OTP, IBAN, and credential fields from mobile clipboard',
    'High', false, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-7', [], 'MASVS-STORAGE-2',
    'Sensitive inputs mark clipboard data as sensitive/expiring or disable copy export.'),
  c(114, PHASES.P7, 'Keyboard Cache Disabling', 'Mobile App (Tier-2)',
    'Disable third-party/predictive keyboard learning cache on password, PIN, and PII text fields',
    'Medium', false, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 2-7', [], 'MASVS-PLATFORM-3',
    'Inputs set TYPE_TEXT_FLAG_NO_SUGGESTIONS / autocorrectionType = .no on confidential fields.'),
  c(115, PHASES.P7, 'Production Signing & Debuggable=False', 'Mobile App (Tier-2)',
    'Sign release builds with hardware/vault production key, android:debuggable="false", and allowBackup="false"',
    'Critical', true, 'surfaces.mobile_app', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'MASVS-CODE-1',
    'Production manifest sets debuggable=false, allowBackup=false, and uses dedicated release signing certificate.'),

  // =========================================================================
  // PHASE 8: 8. AI & LLM Security (SEC-116..SEC-125 — 10 controls, OWASP LLMSVS 2.0)
  // Totals: 5 Critical, 5 High, 0 Medium | 8 Blockers, 2 Non-blockers
  // =========================================================================
  c(116, PHASES.P8, 'Prompt Injection Fencing', 'AI / LLM Features',
    'Enforce strict role separation, XML/delimiter fencing, and anti-override instructions on untrusted prompt inputs',
    'Critical', true, 'surfaces.ai_llm', 'AUTOMATED', ['LLM-S03'], 'ECC 1-6', [], 'OWASP LLM01 / LLMSVS',
    'System prompts never concatenate raw user/attachment text without explicit untrusted-data delimiters and instruction guards.'),
  c(117, PHASES.P8, 'Pre-Prompt Caller & Tenant ACL', 'AI / LLM Features',
    'Verify caller userId and tenantId object-level authorization BEFORE loading entities or attachments into AI prompts',
    'Critical', true, 'surfaces.ai_llm', 'AUTOMATED', ['LLM-S04'], 'ECC 2-2', ['NCA DCC'], 'OWASP LLM06 / API1:2023',
    'Prompt context builders enforce caller tenant_id & ownership ACL prior to reading documents, comments, or attachments.'),
  c(118, PHASES.P8, 'Block Schema & Secret Disclosure to AI', 'AI / LLM Features',
    'Prohibit sending live DB schema (information_schema), connection strings, or system secrets to external AI models',
    'Critical', true, 'surfaces.ai_llm', 'AUTOMATED', ['LLM-S02'], 'ECC 2-7', ['NCA DCC'], 'OWASP LLM06',
    'Zero information_schema dumps, secret env vars, or cleartext HTTP calls in AI/ML integration services.'),
  c(119, PHASES.P8, 'Agentic Tool Allowlist & Approval', 'Agentic AI Tools',
    'Enforce deterministic tool allowlists, strict JSON argument schemas, and human approval on mutating AI tool calls',
    'Critical', true, 'surfaces.ai_llm && features.agentic_tool_execution', 'MANUAL_EVIDENCE', ['LLM-S01'], 'ECC 2-2', [], 'OWASP LLM08',
    'AI tool-calling cannot invoke undeclared functions or mutate state without schema validation and user confirmation.'),
  c(120, PHASES.P8, 'Untrusted LLM Output Handling', 'AI / LLM Features',
    'Treat all LLM/ML output as untrusted — sanitize HTML rendering and NEVER execute output as SQL, shell, or eval',
    'High', true, 'surfaces.ai_llm', 'AUTOMATED', ['LLM-S01', 'FE-S10'], 'ECC 1-6', [], 'OWASP LLM02',
    'Zero ExecuteSqlRaw/DB::statement/eval on AI outputs; UI sanitizes rendered markdown/HTML via DOMPurify.'),
  c(121, PHASES.P8, 'AI Quotas, Token Ceilings & Timeouts', 'AI / LLM Features',
    'Enforce per-user/tenant rate limits, max input length, max_tokens ceilings, and request timeouts on AI endpoints',
    'High', true, 'surfaces.ai_llm', 'AUTOMATED', ['LLM-S05'], 'ECC 2-5', [], 'OWASP LLM04 / API4:2023',
    'AI endpoints enforce dedicated rate-limiting middleware, bounded input character limits, and bounded token budgets.'),
  c(122, PHASES.P8, 'AI Vendor DPA & KSA Residency', 'External AI Providers',
    'Verify external AI provider DPA, zero-training retention opt-out, PII redaction, and KSA data-residency compliance',
    'High', true, 'surfaces.ai_llm', 'MANUAL_EVIDENCE', [], 'ECC 4-1', ['ECC 4-2', 'NCA CCC', 'SDAIA PDPL'], 'OWASP LLM06',
    'Approved AI vendor agreement confirms zero model training on customer data and compliant regional data processing.'),
  c(123, PHASES.P8, 'RAG Vector Tenant & Document ACL', 'RAG / Vector Search',
    'Enforce mandatory tenant_id and document-level ACL metadata filters inside every vector/RAG similarity query',
    'Critical', true, 'surfaces.ai_llm && features.rag_retrieval', 'AUTOMATED', ['LLM-S04'], 'ECC 2-2', ['NCA DCC'], 'OWASP LLM06 / LLMSVS',
    'Vector/embedding retrieval queries filter strictly by authenticated tenant_id and caller permission scope.'),
  c(124, PHASES.P8, 'AI Prompt & Response Log Redaction', 'AI / LLM Features',
    'Redact PII and confidential payloads from AI prompt/completion logs while retaining abuse audit metadata',
    'High', false, 'surfaces.ai_llm', 'AUTOMATED', ['LLM-S06'], 'ECC 2-12', ['NCA DCC', 'SDAIA PDPL'], 'OWASP LLM06',
    'Application loggers never dump raw unredacted prompt/response bodies containing user PII or secrets.'),
  c(125, PHASES.P8, 'Human-in-the-Loop High-Impact Review', 'AI / LLM Features',
    'Require explicit human review and override capability before AI outputs affect scoring, HR, legal, or financial decisions',
    'High', false, 'surfaces.ai_llm', 'MANUAL_EVIDENCE', [], 'ECC 1-5', ['SDAIA AI Ethics'], 'OWASP LLM09',
    'AI recommendations are labeled advisory and require authenticated human confirmation prior to final persistence.'),

  // =========================================================================
  // PHASE 9: 9. Infrastructure, Cloud & Deployment (SEC-126..SEC-145 — 20 controls)
  // Totals: 10 Critical, 10 High, 0 Medium | 15 Blockers, 5 Non-blockers
  // =========================================================================
  c(126, PHASES.P9, 'Environment Isolation', 'Cloud / Infra',
    'Enforce strict network, credential, database, and key separation between Dev, Staging, and Production',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-5', ['NCA CCC'], 'ASVS V14.1',
    'Production VPC/VNet, DB instances, and signing keys are completely isolated from non-production environments.'),
  c(127, PHASES.P9, 'Zero Production Data/Dumps in Repo', 'All Repositories',
    'Prohibit unmasked production data, .bacpac/.bak/.sql dumps, and credential archives in source control',
    'Critical', true, 'always', 'AUTOMATED', ['SCA-S01'], 'ECC 2-7', ['NCA DCC', 'SDAIA PDPL'], 'ASVS V14.2',
    'Zero .bacpac, .bak, .sql data dumps or credential .zip artifacts present in repository tree.'),
  c(128, PHASES.P9, 'Minimal Port & Ingress Exposure', 'Cloud / Infra',
    'Expose only HTTPS (443) publicly; block direct internet access to DB (1433/3306/5432), Redis (6379), and SSH/RDP',
    'Critical', true, 'hosting.internet_facing', 'MANUAL_EVIDENCE', [], 'ECC 2-5', ['NCA CCC'], 'ASVS V14.1',
    'Security groups / firewall rules restrict public ingress strictly to reverse proxy/ALB port 443.'),
  c(129, PHASES.P9, 'Bastion VPN & MFA Admin Access', 'Cloud / Infra',
    'Require VPN/Zero-Trust bastion with MFA for all server, Kubernetes, database, and cloud console administration',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-2', ['ECC 2-5', 'NCA CCC'], 'ASVS V14.1',
    'Administrative infrastructure access gated by MFA-enforced VPN/bastion with zero public SSH/RDP keys.'),
  c(130, PHASES.P9, 'Least-Privilege Database Account', 'Database',
    'Connect applications using dedicated least-privilege DB accounts — strictly forbid sa, root, or postgres superusers',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S01'], 'ECC 2-2', ['NCA DCC'], 'ASVS V14.1',
    'Connection strings use dedicated app login with DML-only privileges; zero sa/root usage.'),
  c(131, PHASES.P9, 'Managed Secret Vault Integration', 'Cloud / Infra',
    'Inject production secrets at runtime from Vault / AWS Secrets Manager / Azure Key Vault — never tracked files',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', ['NET-S01', 'FE-S03'], 'ECC 2-8', ['NCA NCS', 'NCA CCC'], 'ASVS V14.2',
    'Runtime secrets provisioned via managed vault with IAM audit logging and zero plaintext files on repo.'),
  c(132, PHASES.P9, 'Cryptographic Key Rotation', 'Cryptography',
    'Maintain documented rotation capability and schedule for JWT signing keys, AES keys, and API credentials',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-8', ['NCA NCS'], 'ASVS V6.4',
    'Key rotation runbook and kid/key-ring support allow rotating signing/encryption keys without downtime.'),
  c(133, PHASES.P9, 'Encryption at Rest & In Transit', 'Storage & DB',
    'Enable AES-256 encryption at rest on databases, disks, object buckets, and caches alongside TLS 1.2+ in transit',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', ['NET-S01'], 'ECC 2-8', ['NCA DCC', 'NCA NCS'], 'ASVS V6.1 / V9.1',
    'DB TDE/disk encryption, encrypted S3/Blob storage, and field-level PII encryption verified active.'),
  c(134, PHASES.P9, 'Private Object Storage Buckets', 'File & Export Storage',
    'Configure all S3/Azure Blob/MinIO buckets with Block Public Access enabled and private IAM policies',
    'Critical', true, 'features.file_uploads || features.pdf_or_excel_exports', 'MANUAL_EVIDENCE', ['LAR-S06', 'NET-S15'], 'ECC 4-2', ['NCA CCC', 'NCA DCC'], 'ASVS V12.6',
    'Storage buckets disallow anonymous listing/reads; access occurs exclusively via backend stream or short-TTL presigned URL.'),
  c(135, PHASES.P9, 'Least-Privilege Cloud IAM', 'Cloud / Infra',
    'Scope workload IAM roles/managed identities to exact buckets, queues, and secrets (zero AdministratorAccess/*)',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-2', ['ECC 4-2', 'NCA CCC'], 'ASVS V14.1',
    'Application IAM policy grants resource-specific actions only with zero wildcard administrative permissions.'),
  c(136, PHASES.P9, 'CIS OS & Server Hardening', 'Compute / VMs',
    'Apply CIS benchmark hardening baseline to host OS, IIS/Nginx/Apache, PHP-FPM, and Kestrel runtimes',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-6', ['ECC 2-3'], 'ASVS V14.1',
    'Host/VM image hardened against CIS baseline with unnecessary services, modules, and default sites removed.'),
  c(137, PHASES.P9, 'OS & Runtime Patch Management', 'Infra & Dependencies',
    'Maintain current security patch levels across OS packages, .NET/PHP/Node runtimes, Composer, NuGet, and npm',
    'High', true, 'always', 'AUTOMATED', ['SCA-S02'], 'ECC 2-10', [], 'ASVS V14.2 / OWASP A06',
    'Runtime versions are actively supported (non-EOL) with zero unpatched Critical/High CVEs.'),
  c(138, PHASES.P9, 'Non-Root Minimal Container Security', 'Containers / K8s',
    'Run containers as non-root UID, pin minimal base images, drop Linux capabilities, and scan images in CI',
    'High', true, 'hosting.containerized', 'MANUAL_EVIDENCE', [], 'ECC 1-6', ['ECC 2-10', 'NCA CCC'], 'ASVS V14.2',
    'Dockerfile declares non-root USER, pins digest/minimal tag, and passes container CVE scan.'),
  c(139, PHASES.P9, 'Protected CI/CD Pipeline & Runners', 'CI/CD',
    'Enforce branch protection, signed/reviewed PR merges, masked CI secrets, and isolated build runners',
    'High', true, 'always', 'MANUAL_EVIDENCE', ['FE-Q02'], 'ECC 1-6', [], 'ASVS V1.14',
    'Main/release branches forbid direct unreviewed pushes; CI secrets masked and scoped to protected environments.'),
  c(140, PHASES.P9, 'DNS Security & TLS Auto-Renewal', 'Domains & TLS',
    'Configure DNS CAA/SPF/DMARC records and automated TLS certificate renewal monitoring (>=30d expiry alert)',
    'High', false, 'hosting.internet_facing', 'MANUAL_EVIDENCE', [], 'ECC 2-5', ['ECC 2-15'], 'ASVS V9.2',
    'Automated ACME/managed TLS renewal active with expiry alerting and hardened DNS records.'),
  c(141, PHASES.P9, 'Web Application Firewall (WAF)', 'Internet Ingress',
    'Deploy managed WAF + DDoS protection in blocking mode in front of internet-facing Web and API endpoints',
    'High', true, 'hosting.internet_facing', 'MANUAL_EVIDENCE', [], 'ECC 2-15', ['NCA CCC', 'DGA'], 'ASVS V14.1',
    'WAF active in prevention mode with OWASP Core Rule Set, bot/rate rules, and geo/IP controls where applicable.'),
  c(142, PHASES.P9, 'Queue & Worker Isolation', 'Background Jobs',
    'Isolate Redis/RabbitMQ/SQS queues per environment/tenant and lock Hangfire/Horizon worker dashboards',
    'High', true, 'features.background_jobs_dashboard', 'AUTOMATED', ['LAR-S01', 'NET-S17'], 'ECC 2-2', [], 'ASVS V14.1',
    'Queue brokers require authentication/TLS, isolate prefixes per environment, and restrict dashboard UIs.'),
  c(143, PHASES.P9, 'Named Service Accounts', 'Infra & Integrations',
    'Use dedicated, non-interactive named service accounts per workload integration with zero human sharing',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-2', [], 'ASVS V2.10',
    'Each service/pipeline uses an attributable service identity with interactive console login disabled.'),
  c(144, PHASES.P9, 'KSA Data Localization Compliance', 'Saudi Regulated Hosting',
    'Host databases, object storage, backups, logs, and DR replicas strictly inside Kingdom of Saudi Arabia regions',
    'Critical', true, 'hosting.saudi_nca_scope', 'MANUAL_EVIDENCE', [], 'ECC 4-2', ['NCA CCC', 'NCA DCC', 'SDAIA PDPL'], 'ASVS V1.1',
    'All primary, backup, log, and storage regions verified within KSA jurisdiction boundaries.'),
  c(145, PHASES.P9, 'Infrastructure & Config Backup', 'Cloud / Infra',
    'Version-control IaC/reverse-proxy/firewall configurations and maintain encrypted off-host config backups',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-9', [], 'ASVS V14.1',
    'Terraform/Docker/Nginx/K8s manifests stored in Git with tested recovery procedures.'),

  // =========================================================================
  // PHASE 10: 10. Monitoring & Resilience (SEC-146..SEC-157 — 12 controls)
  // Totals: 5 Critical, 6 High, 1 Medium | 9 Blockers, 3 Non-blockers
  // =========================================================================
  c(146, PHASES.P10, 'Auth & Session Audit Logging', 'Backend / Auth',
    'Emit structured audit logs for login success/failure, lockout, OTP events, password reset, and token revocation',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-12', [], 'ASVS V7.1',
    'Auth events log timestamp, actor/target ID, IP, user-agent, trace_id, and outcome without logging credentials.'),
  c(147, PHASES.P10, 'Privileged & Admin Action Logging', 'Backend / RBAC',
    'Record immutable audit trail for role changes, user invitations, permission edits, exports, and destructive deletes',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-12', [], 'ASVS V7.1',
    'Privileged mutations persist actor_id, tenant_id, entity, before/after metadata, and correlation ID.'),
  c(148, PHASES.P10, 'Log PII Redaction & Static Exposure Block', 'Logging & Web Server',
    'Scrub secrets/tokens/PII from logs AND strictly prohibit serving log directories via UseStaticFiles / public webroot',
    'Critical', true, 'always', 'AUTOMATED', ['NET-S15', 'LLM-S06'], 'ECC 2-12', ['NCA DCC', 'SDAIA PDPL'], 'ASVS V7.3',
    'Zero static serving of Logs/InnovaLogs folders and zero raw passwords, JWTs, or national IDs written to logs.'),
  c(149, PHASES.P10, 'Centralized Tamper-Protected SIEM', 'Logging & SOC',
    'Ship application, web server, WAF, and DB security logs to centralized append-only SIEM/log storage',
    'High', true, 'always', 'MANUAL_EVIDENCE', ['NET-S15'], 'ECC 2-12', ['NCA CCC'], 'ASVS V7.2',
    'Logs forwarded out-of-band to centralized collector where application runtime cannot delete or alter historical entries.'),
  c(150, PHASES.P10, 'NCA Log Retention Policy', 'Logging & Compliance',
    'Enforce minimum 12-month security audit log retention (or higher sector mandate) with archival integrity',
    'High', true, 'hosting.saudi_nca_scope', 'MANUAL_EVIDENCE', [], 'ECC 2-12', ['NCA CCC'], 'ASVS V7.2',
    'SIEM/log bucket lifecycle policy retains security audit logs >=365 days in KSA storage.'),
  c(151, PHASES.P10, 'Real-Time Security Alerting', 'Monitoring & SOC',
    'Configure automated alerts on brute-force spikes, 401/403/500 anomalies, privilege escalations, and WAF blocks',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-12', ['ECC 2-13'], 'ASVS V7.2',
    'Alert thresholds route real-time notifications to Security/On-Call channel with documented triage runbooks.'),
  c(152, PHASES.P10, 'Incident Response Plan', 'Operations & GRC',
    'Maintain project-bound cybersecurity incident response contacts, escalation matrix, and NCA notification workflow',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-13', ['SDAIA PDPL'], 'ASVS V1.1',
    'Incident response runbook defines severity tiers, containment steps, and regulatory breach notification timelines.'),
  c(153, PHASES.P10, 'Encrypted Isolated Backups', 'Database & Storage',
    'Maintain automated, AES-256 encrypted, network-isolated/immutable database and object-storage backups',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-9', ['NCA DCC'], 'ASVS V14.1',
    'Automated daily backups encrypted at rest in isolated vault/account protected against production credential compromise.'),
  c(154, PHASES.P10, 'Verified Backup-Restore Drill', 'Database & DR',
    'Execute and document a successful end-to-end backup restoration test into an isolated environment prior to go-live',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-9', [], 'ASVS V14.1',
    'Restore drill evidence records RPO/RTO timings and data integrity verification checksums.'),
  c(155, PHASES.P10, 'BCP / RTO / RPO Validation', 'Resilience & DR',
    'Validate Business Continuity Plan (BCP), multi-AZ/failover readiness, and agreed RTO/RPO targets',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 3-1', ['DGA'], 'ASVS V1.1',
    'BCP/DR architecture and failover runbook aligned with contractual RTO and RPO commitments.'),
  c(156, PHASES.P10, 'Safe Health Check Endpoints', 'Operations',
    'Expose operational /health endpoints that verify liveness without leaking versions, env vars, or connection strings',
    'High', false, 'always', 'AUTOMATED', [], 'ECC 2-12', ['ECC 3-1'], 'API8:2023',
    'Public health probe returns minimal status payload; detailed readiness diagnostics require internal/admin auth.'),
  c(157, PHASES.P10, 'NTP Clock Synchronization', 'Infrastructure',
    'Enforce synchronized NTP time across all application, DB, worker, and log nodes for accurate forensic correlation',
    'Medium', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-12', [], 'ASVS V7.1',
    'Host/container nodes synchronize UTC clock via trusted NTP service with drift monitoring.'),

  // =========================================================================
  // PHASE 11: 11. Testing & Release Sign-Off (SEC-158..SEC-177 — 20 controls)
  // Totals: 9 Critical, 11 High, 0 Medium | 19 Blockers, 1 Non-blocker
  // =========================================================================
  c(158, PHASES.P11, 'Automated SAST Gate', 'CI & Pre-Release',
    'Execute deterministic SAST security scanners across Backend, Frontend, and AI layers with zero Critical/High failures',
    'High', true, 'always', 'AUTOMATED',
    ['LAR-S01', 'LAR-S02', 'LAR-S05', 'LAR-S07', 'NET-S01', 'NET-S04', 'NET-S08', 'NET-S12', 'NET-S13', 'FE-S01', 'FE-S10', 'LLM-S01'],
    'ECC 1-6', ['ECC 2-10'], 'ASVS V1.14',
    'pentest-suite.js and stack SAST scanners pass with 0 unresolved Critical or High static code findings.'),
  c(159, PHASES.P11, 'Automated SCA Dependency Audit', 'CI & Pre-Release',
    'Execute Software Composition Analysis (npm/Composer/NuGet) and clear Critical/High vulnerable dependencies',
    'High', true, 'always', 'AUTOMATED', ['SCA-S02'], 'ECC 2-10', [], 'ASVS V14.2 / OWASP A06',
    'Dependency manifests and lockfiles pass SCA audit with zero untreated Critical/High CVEs.'),
  c(160, PHASES.P11, 'Secret Scan & Key Rotation Clearance', 'CI & Pre-Release',
    'Scan git working tree, build artifacts, and configs for exposed secrets; rotate any historically leaked keys',
    'Critical', true, 'always', 'AUTOMATED', ['NET-S01', 'FE-S03', 'FE-S09', 'SCA-S01'], 'ECC 2-8', ['NCA NCS'], 'ASVS V2.10',
    'Secret scanner confirms zero credentials/keys in repo or public bundles and rotated status for any prior exposures.'),
  c(161, PHASES.P11, 'Authenticated DAST & API Abuse Scan', 'Release Candidate',
    'Execute authenticated DAST and offensive Postman API-abuse collection against staging release candidate',
    'High', true, 'surfaces.rest_api || surfaces.web_spa', 'MANUAL_EVIDENCE', [], 'ECC 2-10', ['ECC 2-11'], 'ASVS V1.14',
    'DAST and pentest_abuse.postman_collection.json run against RC passes all 401/403/404/405/429/header assertions.'),
  c(162, PHASES.P11, 'Performance & DoS Bottleneck Clearance', 'Pre-Release',
    'Clear N+1 query loops, missing composite ESR indexes, and unbounded memory queries prior to production release',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['LAR-S08', 'NET-S19'], 'ECC 1-6', ['DGA'], 'API4:2023',
    'perf-predictor.js and pagination checks verify bounded queries and composite indexing on hot paths.'),
  c(163, PHASES.P11, 'Independent Penetration Test', 'Release Candidate',
    'Complete independent manual/hybrid penetration test covering defined Web, API, Business Logic, and AI scope',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-11', ['NCA CCC', 'DGA'], 'ASVS V1.1',
    'Signed penetration test report attached covering all in-scope surfaces and user roles.'),
  c(164, PHASES.P11, 'Horizontal & Vertical Role Matrix Tests', 'Automated Security QA',
    'Verify automated horizontal (cross-tenant/cross-user IDOR) and vertical (low-priv -> admin) boundary tests pass',
    'Critical', true, 'surfaces.rest_api', 'MANUAL_EVIDENCE', ['LAR-S05', 'NET-S22'], 'ECC 2-2', [], 'ASVS V4.1 / API1 / API5',
    'Automated test suite asserts 403/404 across cross-tenant IDs and unauthorized role invocations.'),
  c(165, PHASES.P11, 'Master Pentest Findings Register', 'GRC & Release Gate',
    'Maintain consolidated PENTEST_FINDINGS_REGISTER.md mapping every scanner & pentest finding to SEC-* and owner',
    'High', true, 'always', 'AUTOMATED', [], 'ECC 2-10', [], 'ASVS V1.1',
    'PENTEST_FINDINGS_REGISTER.md generated and synchronized with active scanner and ingested pentest findings.'),
  c(166, PHASES.P11, 'Severity Remediation SLA Enforcement', 'GRC & Release Gate',
    'Enforce remediation SLAs (Critical 7d, High 30d, Medium 90d, Low 180d) across all open findings',
    'Critical', true, 'always', 'AUTOMATED', [], 'ECC 2-10', [], 'ASVS V1.1',
    'Every open finding carries deterministic triage/containment/retest SLA target dates with zero breached blockers.'),
  c(167, PHASES.P11, 'Zero Open Critical Findings at Release', 'Release Gate',
    'Verify 0 open Critical code or penetration-test findings exist at production release sign-off',
    'Critical', true, 'always', 'AUTOMATED',
    ['LAR-S01', 'LAR-S02', 'LAR-S05', 'LAR-S07', 'NET-S01', 'NET-S13', 'NET-S14', 'NET-S15', 'NET-S16', 'NET-S22', 'FE-S03', 'FE-S09', 'FE-S10', 'LLM-S01', 'LLM-S02', 'LLM-S04', 'UPL-S01', 'SCA-S01'],
    'ECC 2-10', ['ECC 2-11'], 'ASVS V1.1',
    'Zero open CRITICAL findings across automated scanners and ingested external pentest reports.'),
  c(168, PHASES.P11, 'Zero Untreated High Findings at Release', 'Release Gate',
    'Verify all High findings are fixed & retested (or hold executive time-bound approved risk exception)',
    'Critical', true, 'always', 'AUTOMATED',
    ['LAR-S03', 'LAR-S04', 'LAR-S06', 'LAR-S08', 'NET-S02', 'NET-S03', 'NET-S04', 'NET-S08', 'NET-S10', 'NET-S11', 'NET-S12', 'NET-S17', 'NET-S18', 'NET-S19', 'NET-S20', 'NET-S21', 'NET-A01', 'FE-S01', 'FE-S02', 'FE-S08', 'FE-S11', 'LLM-S03', 'LLM-S05', 'LLM-S06', 'UPL-S02', 'UPL-S03', 'EXP-S01', 'SCA-S02', 'SCA-S03'],
    'ECC 2-10', [], 'ASVS V1.1',
    'Zero untreated HIGH findings open at release without verified fix or executive risk-acceptance expiry record.'),
  c(169, PHASES.P11, 'Formal Retest on Release Candidate', 'Release Candidate',
    'Complete formal security retest on the exact release candidate build confirming remediated findings stay closed',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-11', [], 'ASVS V1.1',
    'Retest verification evidence attached against final RC commit/tag confirming zero regression.'),
  c(170, PHASES.P11, 'Automated Security Regression Suite', 'Automated Security QA',
    'Commit automated Pest / WebApplicationFactory / Vitest regression tests for every remediated security defect',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'ASVS V1.14',
    'Each fixed vulnerability is covered by a deterministic CI regression test preventing reintroduction.'),
  c(171, PHASES.P11, 'Commit-to-Artifact Traceability', 'CI/CD & Release',
    'Verify immutable Git commit SHA / release tag traceability between tested RC build and production artifact',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-6', [], 'ASVS V1.14',
    'Release manifest binds exact git commit SHA, container digest, and pentest/checklist sign-off timestamp.'),
  c(172, PHASES.P11, 'Final Security Delivery Pack QA', 'GRC & Documentation',
    'Verify final security checklist & pentest reports have zero "To Confirm" cells, wrong project names, or broken links',
    'High', true, 'always', 'AUTOMATED', [], 'ECC 1-8', [], 'ASVS V1.1',
    'SECURITY_DELIVERY_CHECKLIST.md/.csv has 0 "To Confirm" applicability entries and complete metadata.'),
  c(173, PHASES.P11, 'Time-Bound Executive Risk Acceptance', 'GRC Exceptions',
    'Ensure any deferred non-Critical finding has executive sign-off, compensating control, and <=90d expiry date',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-5', ['ECC 1-8'], 'ASVS V1.1',
    'Zero permanent security exceptions; any accepted risk documents compensating controls and hard expiration date.'),
  c(174, PHASES.P11, 'Safe DB Migration & Rollback Strategy', 'Deployment & DB',
    'Verify expand/contract migration rollback plan — prohibit unconditional startup AutoMigrate/Database.Migrate in prod',
    'High', true, 'surfaces.rest_api', 'AUTOMATED', ['SCA-S03'], 'ECC 1-6', ['ECC 3-1'], 'ASVS V14.1',
    'Zero unguarded startup Database.Migrate()/AutoMigrate calls; deployment runbook documents tested rollback steps.'),
  c(175, PHASES.P11, 'Independent Security Release Sign-Off', 'Release Gate',
    'Obtain formal multi-party release sign-off from Engineering Lead, Product Owner, and independent Security Reviewer',
    'Critical', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-6', ['ECC 1-8'], 'ASVS V1.1',
    'Signed release approval record executed by Engineering, Product, and Security Reviewer.'),
  c(176, PHASES.P11, 'Post-Release Monitoring & 30-Day Review', 'Operations',
    'Schedule heightened 72-hour post-launch log/WAF monitoring and 30-day post-release vulnerability review',
    'High', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-10', ['ECC 2-12'], 'ASVS V7.2',
    'Post-release hypercare schedule and on-call security watch assigned in release runbook.'),
  c(177, PHASES.P11, 'Archived Security Evidence Package', 'GRC Archive',
    'Archive immutable Security Delivery Checklist, CSV, Pentest Register, and evidence links in access-controlled store',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 1-8', [], 'ASVS V1.1',
    'Complete v4.2.0 security delivery evidence bundle archived with restricted GRC access control.'),

  // =========================================================================
  // V1.1 ADDITIONS (SEC-178..SEC-183 — 6 controls mapped to respective phases)
  // Totals: 1 Critical, 2 High, 3 Medium | 5 Blockers, 1 Non-blocker
  // =========================================================================
  c(178, PHASES.P2, 'External Identity & SSO Verification', 'SSO / OAuth / LDAP / AD',
    'Verify cryptographic tokens/certificates and active directory checks on SSO/OAuth/LDAP — forbid blind username login',
    'Critical', true, 'surfaces.rest_api', 'AUTOMATED', ['NET-S13'], 'ECC 2-2', [], 'ASVS V2.9 / API2:2023',
    'External SSO/AD/OAuth login paths cryptographically verify provider assertion/password; zero commented-out AD checks.'),
  c(179, PHASES.P10, 'Automated Key & Token Containment Runbook', 'Incident Containment',
    'Maintain executable containment runbook to revoke leaked API keys, flush active JWTs/sessions, and throttle abused routes',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-13', [], 'ASVS V3.3',
    'Containment runbook tested for <15m emergency key rotation, session revocation, and WAF IP/route block.'),
  c(180, PHASES.P10, 'Cross-Layer Security Telemetry Correlation', 'Monitoring & SIEM',
    'Correlate trace_id and actor telemetry across Web SPA, REST API, Auth, Background Jobs, and AI layers',
    'Medium', false, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-12', ['ECC 2-13'], 'ASVS V7.1',
    'Unified request correlation ID propagates across API gateway, backend logs, queues, and AI audit events.'),
  c(181, PHASES.P11, 'Cross-Portfolio Shared-Code Vulnerability Check', 'Release Gate & Portfolio',
    'Verify vulnerabilities discovered in shared starter kits, auth modules, or common libraries are checked across sibling repos',
    'High', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 2-10', ['ECC 2-11'], 'ASVS V1.14',
    'Shared-module vulnerability advisory checked for propagation across template-derived microservices/products.'),
  c(182, PHASES.P9, 'Non-Production Public Access Gate', 'Dev / QA / Staging Infra',
    'Restrict Dev, QA, UAT, and Staging environments behind VPN, IP allowlist, or strong gateway auth with synthetic data',
    'Medium', true, 'hosting.internet_facing', 'MANUAL_EVIDENCE', [], 'ECC 2-5', ['NCA CCC'], 'ASVS V14.1',
    'Non-production URLs are unreachable to unauthenticated internet scanners and hold zero unmasked production PII.'),
  c(183, PHASES.P1, 'Subprocessor & External AI/SaaS Register', 'Governance & Privacy',
    'Maintain approved register of all external SaaS, cloud, payment, messaging, and AI subprocessors with data scope',
    'Medium', true, 'always', 'MANUAL_EVIDENCE', [], 'ECC 4-1', ['SDAIA PDPL', 'NCA CCC'], 'ASVS V10.1',
    'Subprocessor inventory lists vendor, region, data elements shared, DPA status, and exit strategy.')
];

const COMPANY_ECC_SUBDOMAINS = [
  { subdomain: '1-1', title: 'Cybersecurity Governance & Strategy', ownerRole: 'CISO / Executive Steering Committee', scopeNote: 'Organization-wide cybersecurity charter, mandate, and board reporting.' },
  { subdomain: '1-2', title: 'Cybersecurity Management & Committee', ownerRole: 'CISO / GRC Lead', scopeNote: 'Enterprise cybersecurity committee cadence and cross-department oversight.' },
  { subdomain: '1-3', title: 'Cybersecurity Policies & Standards', ownerRole: 'GRC Lead / Policy Owner', scopeNote: 'Corporate security policy library, annual review, and executive approval.' },
  { subdomain: '1-4', title: 'Cybersecurity Roles & Responsibilities', ownerRole: 'CISO / HR / Engineering VP', scopeNote: 'Enterprise RACI separation of duties between IT/Engineering and Cybersecurity.' },
  { subdomain: '1-7', title: 'Compliance with National Laws & Standards', ownerRole: 'GRC / Legal & Privacy Officer', scopeNote: 'Corporate NCA, SDAIA PDPL, and sector regulatory audit governance.' },
  { subdomain: '1-9', title: 'Cybersecurity Awareness & Training Program', ownerRole: 'GRC / People Operations', scopeNote: 'Company-wide phishing simulations, onboarding training, and developer workshops.' },
  { subdomain: '1-10', title: 'Human Resources Cybersecurity', ownerRole: 'HR / Corporate IT Security', scopeNote: 'Background screening, NDA clauses, onboarding least-privilege, and offboarding revocation.' },
  { subdomain: '2-3', title: 'Workstation & Endpoint Device Security', ownerRole: 'Corporate IT / SecOps', scopeNote: 'Developer/staff laptop EDR, disk encryption, MDM, and USB/media lockdowns.' },
  { subdomain: '2-4', title: 'Corporate Email Protection', ownerRole: 'Corporate IT / Messaging Admin', scopeNote: 'Enterprise domain SPF, DKIM, DMARC p=reject, and anti-phishing gateway.' },
  { subdomain: '2-6', title: 'Removable Media & BYOD Security', ownerRole: 'Corporate IT / SecOps', scopeNote: 'Physical media restriction and corporate mobile device management.' },
  { subdomain: '2-14', title: 'Physical & Environmental Security', ownerRole: 'Facilities / Cloud Data Center Provider', scopeNote: 'Data center physical access controls, CCTV, biometric cages, and environmental resilience.' }
];

const DEFAULT_SECURITY_PROFILE = {
  surfaces: {
    web_spa: true,
    rest_api: true,
    ai_llm: false,
    mobile_app: false
  },
  features: {
    password_login: true,
    otp_auth: true,
    password_reset: true,
    invitations: true,
    cookie_auth: false,
    multi_tenant: true,
    reports_and_dashboards: true,
    pdf_or_excel_exports: true,
    file_uploads: true,
    notifications: true,
    transactional_workflows: true,
    webhooks: false,
    third_party_outbound_apis: true,
    background_jobs_dashboard: true,
    rag_retrieval: false,
    agentic_tool_execution: false
  },
  hosting: {
    model: 'cloud',
    containerized: true,
    internet_facing: true,
    holds_regulated_pii: true,
    critical_national_system: false,
    saudi_nca_scope: true,
    government_dga_scope: false
  }
};

function normalizeSecurityProfile(rawProfile = {}, stackConfig = {}) {
  const hasBe = Object.values(stackConfig?.stacks?.backend || {}).some(Boolean);
  const hasFe = Object.values(stackConfig?.stacks?.frontend || {}).some(Boolean);
  const surfacesDefault = {
    ...DEFAULT_SECURITY_PROFILE.surfaces,
    web_spa: stackConfig?.stacks?.frontend ? hasFe : true,
    rest_api: stackConfig?.stacks?.backend ? hasBe : true
  };
  return {
    surfaces: { ...surfacesDefault, ...(rawProfile?.surfaces || {}) },
    features: { ...DEFAULT_SECURITY_PROFILE.features, ...(rawProfile?.features || {}) },
    hosting: { ...DEFAULT_SECURITY_PROFILE.hosting, ...(rawProfile?.hosting || {}) }
  };
}

function resolveTokenValue(token, profile) {
  const trimmed = token.trim();
  if (trimmed === 'always') return true;
  const parts = trimmed.split('.');
  let cur = profile;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return false;
  }
  return Boolean(cur);
}

/**
 * Deterministically evaluates applicability of a control against normalized security_profile.
 * Guarantees 0 "To Confirm" outcomes: always returns Applicable or Not Applicable with written justification.
 */
function evaluateControlApplicability(control, securityProfile) {
  const profile = normalizeSecurityProfile(securityProfile);
  const expr = control.applicabilityRule || 'always';

  if (expr === 'always') {
    return {
      applicable: true,
      applicability: 'Applicable',
      justification: 'Core baseline control mandatory across all InnovaDigits software deliveries.'
    };
  }

  if (expr === 'surfaces.mobile_app') {
    if (profile.surfaces.mobile_app === true) {
      return {
        applicable: true,
        applicability: 'Applicable',
        justification: 'Active mobile binary surface (security_profile.surfaces.mobile_app = true); OWASP MASVS controls enforced.'
      };
    }
    return {
      applicable: false,
      applicability: 'Not Applicable',
      justification: 'Tier-1 Web/API/AI delivery profile (security_profile.surfaces.mobile_app = false); OWASP MASVS mobile binary controls deferred/not in scope.'
    };
  }

  let isApplicable = false;
  if (expr.includes('&&')) {
    const terms = expr.split('&&').map(s => s.trim());
    isApplicable = terms.every(t => resolveTokenValue(t, profile));
  } else if (expr.includes('||')) {
    const terms = expr.split('||').map(s => s.trim());
    isApplicable = terms.some(t => resolveTokenValue(t, profile));
  } else {
    isApplicable = resolveTokenValue(expr, profile);
  }

  if (isApplicable) {
    return {
      applicable: true,
      applicability: 'Applicable',
      justification: `Enabled by active project security profile (${expr} = true).`
    };
  }

  if (expr.startsWith('surfaces.ai_llm')) {
    return {
      applicable: false,
      applicability: 'Not Applicable',
      justification: `AI/LLM surface or sub-capability disabled in security_profile (${expr} = false); OWASP LLMSVS control not in scope.`
    };
  }

  return {
    applicable: false,
    applicability: 'Not Applicable',
    justification: `Feature/surface toggle disabled in stack.json security_profile (${expr} = false).`
  };
}

function getCatalogStats(controls = RAW_CONTROLS) {
  let critical = 0;
  let high = 0;
  let medium = 0;
  let releaseBlockers = 0;
  for (const ctrl of controls) {
    if (ctrl.priority === 'Critical') critical++;
    else if (ctrl.priority === 'High') high++;
    else if (ctrl.priority === 'Medium') medium++;
    if (ctrl.releaseBlocker) releaseBlockers++;
  }
  return {
    total: controls.length,
    critical,
    high,
    medium,
    releaseBlockers
  };
}

function buildCatalogPayload() {
  const stats = getCatalogStats(RAW_CONTROLS);
  return {
    schemaVersion: '1.1.0',
    osVersion: '4.2.0',
    title: 'InnovaDigits Project Security Delivery Checklist V1.1',
    frameworks: [
      'Saudi NCA ECC 2:2024',
      'Saudi NCA CCC / DCC / NCS',
      'Saudi DGA & SDAIA PDPL',
      'OWASP ASVS 5.0',
      'OWASP API Security Top 10 (2023)',
      'OWASP LLMSVS 2.0 / LLM Top 10',
      'OWASP MASVS (Tier-2 Mobile Plug-In)'
    ],
    summary: stats,
    companyLevelEccSubdomains: COMPANY_ECC_SUBDOMAINS,
    controls: RAW_CONTROLS
  };
}

function loadControlsCatalog(customCatalogPath = null) {
  const defaultPath = path.resolve(__dirname, '..', '..', '..', 'templates', 'security', 'SECURITY_CONTROLS_CATALOG.json');
  const target = customCatalogPath || defaultPath;
  if (fs.existsSync(target)) {
    try {
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch {
      // Fallback to in-memory canonical payload
    }
  }
  return buildCatalogPayload();
}

function writeCanonicalCatalogFile(destPath = null) {
  const outPath = destPath || path.resolve(__dirname, '..', '..', '..', 'templates', 'security', 'SECURITY_CONTROLS_CATALOG.json');
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = buildCatalogPayload();
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

module.exports = {
  PHASES,
  RAW_CONTROLS,
  COMPANY_ECC_SUBDOMAINS,
  DEFAULT_SECURITY_PROFILE,
  normalizeSecurityProfile,
  evaluateControlApplicability,
  getCatalogStats,
  buildCatalogPayload,
  loadControlsCatalog,
  writeCanonicalCatalogFile
};

