#!/usr/bin/env node

/**
 * ⚡ Specify CLI Engine — InnovaDigits Multi-Stack AI Engineering OS (v3.9.4)
 * Multi-IDE 2026 Scoped Exporter:
 *   - Google Antigravity (.agents/rules/*.md + .agents/skills/<id>/SKILL.md)
 *   - Root Always-On (AGENTS.md, GEMINI.md)
 *   - Cursor 2026 Modular (.cursor/rules/*.mdc)
 *   - GitHub Copilot (.github/copilot-instructions.md + .github/instructions/*.instructions.md)
 *   - Claude & Windsurf (CLAUDE.md, .windsurfrules, .agrules, .rules)
 * Strictly enforces stack-selective filtering from .ai/stack.json (zero cross-stack bleed).
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = __dirname.includes('.ai')
  ? path.resolve(__dirname, '../../')
  : path.resolve(__dirname, '../');

let AI_DIR = WORKSPACE_ROOT;
if (fs.existsSync(path.join(WORKSPACE_ROOT, '.ai'))) {
  AI_DIR = path.join(WORKSPACE_ROOT, '.ai');
}

// Read version dynamically from package.json
let OS_VERSION = '4.2.2';
const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version) OS_VERSION = pkg.version;
  } catch {}
}

const STACK_JSON_PATH = fs.existsSync(path.join(AI_DIR, 'stack.json'))
  ? path.join(AI_DIR, 'stack.json')
  : (fs.existsSync(path.join(WORKSPACE_ROOT, 'stack.json')) ? path.join(WORKSPACE_ROOT, 'stack.json') : path.join(AI_DIR, 'stack.json'));

const AGRULES_PATH = fs.existsSync(path.join(AI_DIR, '.agrules'))
  ? path.join(AI_DIR, '.agrules')
  : path.join(WORKSPACE_ROOT, '.agrules');

function loadStackConfig() {
  if (!fs.existsSync(STACK_JSON_PATH)) {
    console.error(`Error: stack.json not found at ${STACK_JSON_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(STACK_JSON_PATH, 'utf8'));
}

/**
 * Reads a directory of Markdown files and concatenates them cleanly.
 */
function readMdDir(dirPath) {
  if (!fs.existsSync(dirPath)) return '';
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  let result = '';
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const fullPath = path.join(dirPath, entry.name);
      result += fs.readFileSync(fullPath, 'utf8') + '\n\n';
    }
  }
  return result;
}

/**
 * Filter dual-stack DevOps & OpenAPI markdown so exported rules have zero cross-stack bleed.
 */
function filterDualStackDevops(rawText, { isDotNet, isLaravel, isCakePhp }) {
  let out = rawText;
  const hasPhp = isLaravel || isCakePhp;
  if (isDotNet && !hasPhp) {
    out = out.replace(/## Section A: Laravel Tracked Seeders[\s\S]*?(?=## Section B:)/g, '');
    out = out.replace(/across Laravel and \.NET 10\./g, 'for .NET 10.');
    out = out.replace(/\(using `firstOrCreate` in Laravel, or `AnyAsync` \/ upsert in EF Core\)/g, '(using `AnyAsync` / upsert in EF Core)');
    out = out.replace(/Inline `@OA\\` PHPDoc annotations and legacy /g, 'Legacy ');
    out = out.replace(/,\s*`sanctum`/g, '');
    out = out.replace(/^\s*-\s*\*\*Profile A \(Laravel\)\*\*:.*$\n?/gm, '');
  } else if (hasPhp && !isDotNet) {
    out = out.replace(/## Section B: \.NET 10 \/ EF Core Tracked Seeders[\s\S]*?(?=## 3\. Idempotency Invariant)/g, '');
    out = out.replace(/across Laravel and \.NET 10\./g, 'for Laravel.');
    out = out.replace(/\(using `firstOrCreate` in Laravel, or `AnyAsync` \/ upsert in EF Core\)/g, '(using `firstOrCreate` / `updateOrCreate`)');
    out = out.replace(/ and legacy C# Swashbuckle attributes \(`\[SwaggerOperation\]`, `\[ProducesResponseType\]`\)/g, '');
    out = out.replace(/ Standard \.NET 10 Minimal API metadata attributes[\s\S]*?explicitly permitted\./g, '');
    out = out.replace(/^\s*-\s*\*\*Profile B \(\.NET 10\)\*\*:.*$\n?/gm, '');
  }
  return out;
}

/**
 * Builds stack-selective Tier-1 / Tier-2 security invariants (v4.2.0) with zero cross-stack or premature surface bleed.
 */
function buildSelectiveSecurityRules({ isDotNet, isLaravel, isCakePhp, hasAiLlm, hasMobileApp }) {
  const sections = [];

  if (isLaravel || isCakePhp) {
    sections.push(`## Tier-1 Backend Security Gate — Laravel / PHP (\`SEC-001..183\`)
- **Deny-by-Default & Verb Safety (\`SEC-016\`, \`SEC-050\`):** Protect all non-public routes with \`auth:sanctum\`; forbid \`Route::any\` on state-mutating actions and enforce \`APP_DEBUG=false\` in staging/production (\`SEC-086\`).
- **Throttling, CSPRNG OTP & Anti-Enumeration (\`SEC-021..027\`):** Enforce \`throttle:\` middleware on login, OTP, password-reset, and bulk export routes; generate OTPs via \`random_int()\`, store hashed with single-use TTL + attempt caps, and return uniform responses.
- **Tenant Scope, IDOR & Mass Assignment (\`SEC-036\`, \`SEC-039\`, \`SEC-040\`):** Scope every query by authenticated \`tenant_id\` and ownership (fail-closed \`404\`), authorize via Policies, and declare explicit \`$fillable\` arrays excluding privilege/tenant/balance keys (\`$guarded = []\` prohibited).
- **Private Uploads & Safe Exports (\`SEC-044\`, \`SEC-055..062\`, \`SEC-148\`):** Store uploads, exports, and logs on private disks outside \`public/\`; verify server-side magic bytes via \`finfo_file()\`, reject active formats (\`svg\`, \`html\`, \`php\`, \`js\`), use UUID storage keys, and canonicalize paths.`);
  }

  if (isDotNet) {
    sections.push(`## Tier-1 Backend Security Gate — .NET 10 / ASP.NET Core (\`SEC-001..183\`)
- **Deny-by-Default & Endpoint Auth (\`SEC-016\`, \`SEC-034\`):** Configure global \`FallbackPolicy\` requiring authenticated users; declare \`[Authorize]\` on MediatR requests/controllers and chain \`.RequireAuthorization()\` on Minimal API \`IEndpointGroup\` groups.
- **JWT Validation & Server-Side Logout (\`SEC-029\`, \`SEC-072\`):** Enforce \`ValidateLifetime = true\`, \`ValidateIssuerSigningKey = true\`, \`ClockSkew <= 60s\`, and revoke \`jti\`/session tokens server-side on \`Logout\`.
- **Static Folder, CORS & Swagger Hardening (\`SEC-044\`, \`SEC-071\`, \`SEC-085\`, \`SEC-148\`):** Never expose logs, exports, or uploads via \`wwwroot\` or \`UseStaticFiles\`; gate \`UseSwaggerUI\`/\`MapScalarApiReference\` behind \`app.Environment.IsDevelopment()\`; forbid wildcard \`AllowAnyOrigin()\`.
- **Traversal, Upload Caps & TLS Validation (\`SEC-055\`, \`SEC-060\`, \`SEC-129\`):** Verify canonical \`Path.GetFullPath\` prefix boundaries before file reads, forbid \`[DisableRequestSizeLimit]\`, and never register \`DangerousAcceptAnyServerCertificateValidator\`.`);
  }

  if (hasAiLlm) {
    sections.push(`## Tier-1 AI & LLM Security Gate — OWASP LLMSVS 2.0 (\`SEC-116..125\`)
- **Prompt Fencing & Pre-Prompt Context ACL (\`SEC-116\`, \`SEC-118\`):** Wrap untrusted input inside \`<untrusted_input>\` XML tags and filter RAG/attachment records (\`GetEligibleForPrompt\`) by authenticated caller + tenant IDs before prompt construction.
- **Zero Output Execution & Zero Schema Exposure (\`SEC-117\`, \`SEC-120\`, \`SEC-129\`):** Never execute LLM output as SQL or shell commands, never expose \`information_schema\` or admin DB credentials to AI services, and enforce HTTPS/TLS on all AI endpoints.
- **AI Quotas & Redacted Telemetry (\`SEC-121\`, \`SEC-124\`):** Enforce per-user/tenant AI rate limits and \`max_tokens\` ceilings, and scrub PII/secrets from AI prompt logs.`);
  }

  if (hasMobileApp) {
    sections.push(`## Tier-2 Mobile Security Gate — OWASP MASVS (\`SEC-033\`, \`SEC-098..115\`)
- **Secure Keystore & TLS Pinning (\`SEC-033\`, \`SEC-098\`, \`SEC-104\`):** Persist tokens exclusively in iOS Keychain / Android Keystore (never plaintext preferences) and enforce TLS certificate pinning.
- **Binary Hardening & Screen Privacy (\`SEC-106\`, \`SEC-108\`, \`SEC-111\`):** Enable R8/ProGuard release obfuscation, root/jailbreak & Frida anti-tamper checks, and \`FLAG_SECURE\` screen-capture protection on sensitive views.`);
  }

  return sections.length > 0 ? '\n\n' + sections.join('\n\n') + '\n\n' : '';
}

/**
 * Builds stack-selective rules based strictly on stackConfig.
 */
function buildStackRules(stackConfig) {
  const isDotNet = Boolean(stackConfig.stacks?.backend?.dotnet);
  const isLaravel = Boolean(stackConfig.stacks?.backend?.laravel);
  const isCakePhp = Boolean(stackConfig.stacks?.backend?.cakephp);

  const isTanstack = Boolean(stackConfig.stacks?.frontend?.tanstack);
  const isReact = Boolean(stackConfig.stacks?.frontend?.react);
  const isVue = Boolean(stackConfig.stacks?.frontend?.vue || stackConfig.stacks?.frontend?.nuxt);
  const isAngular = Boolean(stackConfig.stacks?.frontend?.angular);

  const isHmvc = Boolean(stackConfig.architecture?.hmvc);
  const isMonolith = Boolean(stackConfig.architecture?.monolith);

  const hasAiLlm = Boolean(stackConfig.security_profile?.surfaces?.ai_llm);
  const hasMobileApp = Boolean(stackConfig.security_profile?.surfaces?.mobile_app);

  const rulesBaseDir = path.join(WORKSPACE_ROOT, 'rules');

  // 1. Architecture Header
  let archHeader = `## Active Architecture: ${isHmvc ? 'HMVC / Modular' : (isDotNet ? '.NET 10 Clean Architecture (Monolith)' : 'Monolith')}\n\n`;
  if (isDotNet) {
    archHeader += `> [!CRITICAL]\n`;
    archHeader += `> **.NET 10 CLEAN ARCHITECTURE MANDATE ACTIVE:**\n`;
    archHeader += `> 1. **Domain:** Pure enterprise entities, value objects, domain events. Zero <ProjectReference> or framework dependencies (no EF Core, no ASP.NET Core).\n`;
    archHeader += `> 2. **Application:** CQRS MediatR commands, queries, FluentValidation validators, and interfaces. May only reference Domain (and Shared).\n`;
    archHeader += `> 3. **Infrastructure:** EF Core DbContext, migrations, external adapters. Implements interfaces defined in Application.\n`;
    archHeader += `> 4. **Web:** ASP.NET Core 10 Minimal APIs implementing IEndpointGroup, OpenAPI/Scalar, and rate limiting. Thin endpoints delegating to MediatR ISender.\n\n`;
  } else if (isHmvc) {
    archHeader += `> [!CRITICAL]\n`;
    archHeader += `> **HMVC ARCHITECTURE MANDATE ACTIVE ('architecture.hmvc == true'):**\n`;
    archHeader += `> 1. ALL domain code MUST be structured as a self-contained Mini-App inside Modules/{ModuleName}/ mirroring base app/ structure.\n`;
    archHeader += `> 2. ALL frontend feature components MUST reside inside Modules/{ModuleName}/Frontend/.\n`;
    archHeader += `> 3. Use Modules\\{ModuleName}\\... for PHP class namespaces and register routes via Modules/{ModuleName}/Backend/Routes/api.php.\n\n`;
  }

  // 2. Core Universal Rules
  const coreUniversal = readMdDir(path.join(rulesBaseDir, '00-universal'));

  // 3. Active Backend Rules + Stack-Selective Security Gate (v4.2.0)
  let backendRules = '';
  if (isDotNet) {
    backendRules += readMdDir(path.join(rulesBaseDir, '01-backend', 'dotnet'));
  } else if (isLaravel) {
    backendRules += readMdDir(path.join(rulesBaseDir, '01-backend', 'laravel'));
  } else if (isCakePhp) {
    backendRules += readMdDir(path.join(rulesBaseDir, '01-backend', 'cakephp'));
  }
  const selectiveSecurityRules = buildSelectiveSecurityRules({
    isDotNet,
    isLaravel,
    isCakePhp,
    hasAiLlm,
    hasMobileApp
  });
  backendRules += selectiveSecurityRules;

  // 4. Active Frontend Rules
  let frontendRules = '';
  if (isTanstack) {
    frontendRules += readMdDir(path.join(rulesBaseDir, '02-frontend', 'tanstack'));
  }
  if (isReact && !isTanstack) {
    frontendRules += readMdDir(path.join(rulesBaseDir, '02-frontend', 'react'));
  }
  if (isVue) {
    frontendRules += readMdDir(path.join(rulesBaseDir, '02-frontend', 'vue'));
  }
  if (isAngular) {
    frontendRules += readMdDir(path.join(rulesBaseDir, '02-frontend', 'angular'));
  }

  // 5. DevOps & API Docs (filtered for active backend stack)
  let devopsRules = readMdDir(path.join(rulesBaseDir, '03-devops'));
  if (stackConfig.stacks?.api_docs?.json_openapi) {
    devopsRules += readMdDir(path.join(rulesBaseDir, '03-api-docs', 'json-openapi'));
  }
  devopsRules = filterDualStackDevops(devopsRules, { isDotNet, isLaravel, isCakePhp });

  // 6. Active Workflows (BCAS, Cycle Handoff, Drift Radar, Security Audit, Pentest Gate)
  let workflowRules = '';
  const wfDir = path.join(rulesBaseDir, '04-workflows');
  if (fs.existsSync(wfDir)) {
    const wfFiles = ['bcas-workflows.md', 'audit-drift.md', 'audit-security.md', 'pentest-workflow.md'];
    for (const f of wfFiles) {
      const p = path.join(wfDir, f);
      if (fs.existsSync(p)) workflowRules += fs.readFileSync(p, 'utf8') + '\n\n';
    }
  }

  return {
    archHeader,
    coreUniversal,
    backendRules,
    selectiveSecurityRules,
    frontendRules,
    devopsRules,
    workflowRules,
    isDotNet,
    isLaravel,
    isCakePhp,
    isTanstack,
    isReact,
    isVue,
    hasAiLlm,
    hasMobileApp
  };
}

/**
 * Compiles full stack-selective rules for legacy monolithic exporters (CLAUDE.md, .rules, .agrules).
 */
function compileMonolithicRules(stackConfig) {
  const parts = buildStackRules(stackConfig);
  let compiled = `# InnovaDigits Stack-Aware AI Instructions (v${OS_VERSION})\n\n`;
  compiled += parts.archHeader;
  compiled += `## 1. Core Universal & Governance Rules\n\n` + parts.coreUniversal + '\n\n';
  compiled += `## 2. Active Backend Architecture & Invariants\n\n` + parts.backendRules + '\n\n';
  compiled += `## 3. Active Frontend Architecture & Invariants\n\n` + parts.frontendRules + '\n\n';
  compiled += `## 4. DevOps, API Contracts & Seeders\n\n` + parts.devopsRules + '\n\n';
  compiled += `## 5. Governed Engineering Workflows\n\n` + parts.workflowRules + '\n\n';
  return compiled;
}

function buildCompactMonolithicExport(stackConfig, parts) {
  const activeBackends = Object.entries(stackConfig.stacks?.backend || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
  const activeFrontends = Object.entries(stackConfig.stacks?.frontend || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';

  // Section 1: Architecture Mandate & Stop Gates
  const sec1 = `## 1. Architecture Mandate & Stop Gates

> **ACTIVE STACKS:** Backend: \`[${activeBackends}]\` | Frontend: \`[${activeFrontends}]\` | Architecture: \`[${stackConfig.architecture?.hmvc ? 'HMVC' : (parts.isDotNet ? '.NET 10 Clean Architecture' : 'Monolith')}]\`
> **TOKEN DIRECTIVE:** Ponytail Code Grade (100% complete, strictly-typed code, zero stubs/TODOs) + Caveman chat brevity.

1. **Step 0 Mandatory Inspection:** Consult \`.ai/stack.json\`, \`context/CODEBASE_MAP.md\`, and \`context/LESSONS_LEARNED.md\` before executing file searches or codebase modifications.
2. **Mandatory Stop Gate (Mode 0 / BCAS):**
   - **Turn 1 (Gate 1 Blueprint):** Emit concise Blueprint (Models, tables, migrations, API contracts, task checklist). STOP and wait for \`APPROVE\`.
   - **Turn 2 (Execution):** Implement task-by-task upon approval, run tests, update handoff, append telemetry.
3. **Fail-Closed Gate:** Halt commit or deployment on any Critical or High security scanner finding.

${parts.archHeader.trim()}
`;

  // Section 2: Core Universal & QA Invariants
  const sec2 = `## 2. Core Universal & QA Invariants

1. **Ponytail Code Grade:** Write 100% complete, production-ready, strictly-typed code. Zero placeholders, zero \`// TODO\` stubs, zero truncated functions.
2. **Deterministic QA Testability:**
   - Every interactive UI element MUST carry \`data-testid="{module}-{component}-{element}"\`.
   - All mutating API endpoints must return canonical resource \`id\`, \`code\`, and \`status\` inside response body for request chaining.
3. **Bilingual Localization (i18n):** Synchronously support Arabic (\`ar\`) and English (\`en\`) for all user-facing strings, validation rules, and error messages.
4. **Tenant Isolation & IDOR Defense:** Enforce tenant query scopes, explicit user ID lookups, and whitelist model fields against mass assignment.
5. **Zero PII Logging:** Mask Tier 1/2 PII in logs, encrypt sensitive fields at rest with AES-256, and use blind indexing for searchable encrypted data.
`;

  // Section 3: Active Backend Rules Summary
  const backendContent = parts.backendRules.trim();
  const sec3 = `## 3. Active Backend Rules Summary\n\n${backendContent}\n`;

  // Section 4: Active Frontend Rules Summary
  const frontendContent = parts.frontendRules.trim();
  const sec4 = `## 4. Active Frontend Rules Summary\n\n${frontendContent}\n`;

  // Section 5: DevOps, OpenAPI & BCAS Workflow Index
  const openApiStackLine = parts.isDotNet && !(parts.isLaravel || parts.isCakePhp)
    ? '.NET 10 Minimal APIs use `[EndpointSummary]` / `[EndpointDescription]` with build-time OpenAPI generator (`docs/openapi.json`).'
    : (parts.isLaravel || parts.isCakePhp
      ? 'Zero inline annotations in PHP files (`@OA\\` prohibited); maintain modular JSON OpenAPI specs in `docs/modules/`.'
      : 'Maintain modular JSON OpenAPI specs in `docs/modules/` and `docs/openapi.json`.');
  const seederTableLine = parts.isDotNet && !(parts.isLaravel || parts.isCakePhp)
    ? 'Seeders must be tracked in `__SeedHistory` to ensure deterministic zero-downtime execution.'
    : 'Seeders must be tracked in `seeder_log` / `seed_history` to ensure deterministic zero-downtime execution.';

  const sec5 = `## 5. DevOps, OpenAPI & BCAS Workflow Index

1. **OpenAPI & Postman Standards:**
   - ${openApiStackLine}
   - Run \`node bin/build-postman.js\` to generate Postman v2.1 collection with automatic token/resource chaining.
2. **Tracked Seeders:**
   - ${seederTableLine}
3. **Governed Workflow Commands (\`v${OS_VERSION}\` — \`BA_AI_SDLC v2.1.0\` Multi-Intake Hub, Legacy BCAS & 183-Control Pentest Gate):**
   - \`@reverse-intake\`: Export \`REVERSE_INTAKE_BUNDLE.json\` + \`REVERSE_INTAKE_REPORT.md\` via \`node bin/reverse-architect.js --export-ba-intake\` (\`prototype-code\` / \`brownfield-cr\`).
   - \`@bcas-init\` / \`/bcas-init\`: Sync \`BA_AI_SDLC v2.1.0\` \`project-context-hub/\` (\`UX_DESIGN_BRIEF.md\`, \`_intake/\`, \`PARTIAL_JIT_ANCHOR\`) & cascade map/DAG/radar.
   - \`@review-spec [FeatureID]\`: Two-Gate sealer (\`READY_FOR_DEV -> READY_TO_CODE\`) populating Section 11 (\`ENG-01..ENG-10\`, \`--populate-hints\`) & verifying \`feature_srd\` via \`node bin/eng-gate.js\`.
   - \`@pmtool-sync [SprintID]\`: Decompose \`§1B\` Stories (\`STR-*\`) into department tasks (\`TSK-*-{BE,WEB,MOB,QA}\`) & export PMTool \`.csv\`/\`.xlsx\` boards via \`node bin/pmtool-board-sync.js\`.
   - \`@implement [FeatureID]\`: Mode 0 1-Gate fast-track blueprint -> code consuming \`SEED-*\`, \`ENUM-*\`, Archetype \`5A/5B\`, and §2/§3 \`data-testid\`.
   - \`@apply-delta [Version]\`: Compile & execute \`Was -> Current\` deltas via \`node bin/delta-sync.js\`, re-handoff Mobile/QA, and mark applied.
   - \`@handoff [Module]\` & \`@cycle-handoff\`: Compile Postman v2.1, Integration Guide, and \`CYCLE-*_HANDOFF.md\` (\`MB-01..15\`).
   - \`@pentest\` & \`@audit-security\`: Run 183-Control GRC Release Gate (\`node bin/pentest-suite.js --strict\`), Offensive Postman DAST (\`node bin/build-pentest-postman.js\`), & Security Fuzzer (\`node bin/security-fuzzer.js --strict\`).
   - \`@predict-perf\`: Run Performance Predictor (\`node bin/perf-predictor.js\`).

> *(Refer to scoped files in \`.agents/rules/\`, \`.cursor/rules/\`, and \`rules/\` for exhaustive rule texts)*
`;

  const header = `# InnovaDigits Stack-Aware AI Instructions (v${OS_VERSION})\n\n`;
  let combined = `${header}${sec1}\n\n${sec2}\n\n${sec3}\n\n${sec4}\n\n${sec5}`;

  // If combined exceeds budget (21,200 bytes), compress sec3 and sec4 while preserving selectiveSecurityRules intact
  if (Buffer.byteLength(combined) > 21200) {
    const secRulesText = (parts.selectiveSecurityRules || '').trim();
    const baseBackendOnly = secRulesText && backendContent.endsWith(secRulesText)
      ? backendContent.slice(0, backendContent.length - secRulesText.length).trim()
      : backendContent;
    const fixedOverhead = Buffer.byteLength(header + sec1 + sec2 + sec5 + secRulesText) + 450;
    const availableForRules = Math.max(2000, 21200 - fixedOverhead);
    const halfBudget = Math.floor(availableForRules / 2);

    function trimAtParagraph(text, maxBytes) {
      if (Buffer.byteLength(text) <= maxBytes) return text;
      let trimmed = text.slice(0, maxBytes);
      const lastPara = trimmed.lastIndexOf('\n\n');
      if (lastPara > 0) {
        trimmed = trimmed.slice(0, lastPara);
      }
      return trimmed + '\n\n> *(Refer to `.agents/rules/` for full scoped rules)*';
    }

    const combinedBackendSummary = [trimAtParagraph(baseBackendOnly, halfBudget), secRulesText].filter(Boolean).join('\n\n');
    const trimmedSec3 = `## 3. Active Backend Rules Summary\n\n${combinedBackendSummary}\n`;
    const trimmedSec4 = `## 4. Active Frontend Rules Summary\n\n${trimAtParagraph(frontendContent, halfBudget)}\n`;
    combined = `${header}${sec1}\n\n${sec2}\n\n${trimmedSec3}\n\n${trimmedSec4}\n\n${sec5}`;
  }

  return combined;
}

/**
 * 2026 Native Scoped Rule Exporter
 */
function exportTargetAgents(agentFilter) {
  const stackConfig = loadStackConfig();
  const parts = buildStackRules(stackConfig);

  const activeBackends = Object.entries(stackConfig.stacks?.backend || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
  const activeFrontends = Object.entries(stackConfig.stacks?.frontend || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';

  console.log(`[Specify CLI v${OS_VERSION}] Compiling stack-selective rules:`);
  console.log(`  Backend : ${activeBackends}`);
  console.log(`  Frontend: ${activeFrontends}`);

  const dotnetCliRow = parts.isDotNet
    ? `\n| \`npm run dotnet:audit\` | .NET 10 Clean Architecture & security auditor | \`node bin/dotnet-audit.js --strict\` |`
    : '';
  const routingDelegationTarget = parts.isDotNet
    ? 'CQRS Handlers / Application Services'
    : 'Domain Services / Repositories';

  // 1. Root Always-On: AGENTS.md & GEMINI.md (NO YAML frontmatter, strictly under 8,000 bytes)
  const masterAgentsMd = `# InnovaDigits AI Engineering OS — Master Agent Directives (v${OS_VERSION})

> **ACTIVE STACKS:** Backend: \`[${activeBackends}]\` | Frontend: \`[${activeFrontends}]\` | Architecture: \`[${stackConfig.architecture?.hmvc ? 'HMVC' : (parts.isDotNet ? '.NET 10 Clean Architecture' : 'Monolith')}]\`
> **TOKEN DIRECTIVE:** Ponytail Code Grade (100% complete, strictly-typed code, zero stubs/TODOs) + Caveman chat brevity.

## 🛑 Step 0: Stop Gates & Context Protocol
1. Read \`.ai/stack.json\` first on every task to resolve active stacks and compliance boundaries.
2. Read \`context/CODEBASE_MAP.md\` before running any codebase grep or file search to preserve tokens.
3. Consult \`context/LESSONS_LEARNED.md\` to avoid repeating known architectural and framework nuances.
4. Auto-inject domain skills from \`skills/*.md\` based on prompt triggers (\`db-architect\`, \`security-sentinel\`, \`mobile-bridge\`, \`zero-cross-audit\`, \`ipdpl-guardian\`, \`security-fuzzing\`, \`perf-predictor\`, \`legacy-modernizer\`).
5. Halt at mandatory stop gates (Gate 1 Blueprint -> wait for \`APPROVE\` before mutating files).

## 🛠️ CLI Tool Matrix
| Command | Primary Role | Trigger / Flag |
| :--- | :--- | :--- |
| \`npm run intake:export\` | \`BA_AI_SDLC v2.1.0\` prototype/brownfield intake exporter | \`node bin/reverse-architect.js --export-ba-intake\` |
| \`npm run bcas:sync\` | \`BA_AI_SDLC v2.1.0\` Context Hub & BCAS synchronizer | \`node bin/bcas-sync.js\` |
| \`npm run eng:gate\` | Two-Gate (\`ENG-01..10\`), \`--populate-hints\` & \`feature_srd\` sealer | \`node bin/eng-gate.js\` |
| \`npm run pmtool:sync\` | 5-Level WBS Story-to-Task (\`STR-* -> TSK-*\`) & \`.xlsx\` exporter | \`node bin/pmtool-board-sync.js\` |
| \`npm run delta:sync\` | \`Was -> Current\` delta execution plan compiler | \`node bin/delta-sync.js\` |
| \`npm run map:build\` | Fast deterministic codebase indexer | \`node bin/build-codebase-map.js\` |
| \`npm run pentest:audit\` | 183-control GRC release gate & pentest orchestrator | \`node bin/pentest-suite.js --strict\` |
| \`npm run pentest:postman\` | Offensive Postman v2.1 API-abuse DAST compiler | \`node bin/build-pentest-postman.js\` |
| \`npm run security:fuzz\` | Static security, IDOR, & mass-assignment fuzzer | \`node bin/security-fuzzer.js --strict\` |${dotnetCliRow}
| \`npm run frontend:audit\`| SPA security headers, sinks & testid auditor | \`node bin/frontend-audit.js --strict\` |
| \`npm run perf:predict\` | N+1 loop & compound ESR index predictor | \`node bin/perf-predictor.js\` |
| \`npm run drift:radar\` | \`PARTIAL_JIT_ANCHOR\`-aware drift, \`feature_srd\` & delta radar | \`node bin/drift-radar.js\` |
| \`npm run arch:visualize\`| Live topology & Mermaid ERD generator | \`node bin/reverse-architect.js\` |
| \`npm run postman:build\` | OpenAPI to Postman v2.1 collection compiler | \`node bin/build-postman.js\` |
| \`npm run handoff:cycle\` | Immutable QA & Mobile (\`MB-01..15\`) cycle pack | \`node bin/build-cycle-handoff.js\` |
| \`npm run sdk:build\` | Strongly-typed TypeScript & Dart SDK generator | \`node bin/build-client-sdk.js\` |
| \`npm run telemetry:log\` | Deterministic execution telemetry logger | \`node bin/log-telemetry.js\` |
| \`npm run hub:verify-adapter\` | E2E Context Hub v2.0 adapter verification suite | \`node bin/verify-hub-adapter.js\` |
| \`npm run hub:verify-intake\` | E2E Multi-Intake & \`PARTIAL_JIT_ANCHOR\` bridge suite | \`node bin/verify-intake-bridge.js\` |
| \`npm run test:pentest\` | E2E 183-control pentest & GRC verification suite | \`node bin/verify-pentest-suite.js\` |
| \`npm run test:os\` | Core OS audit verification test suite | \`node bin/verify-v394-audit.js\` |
| \`npm run verify:all\` | Complete repository quality & CI gate suite | All CLI engines in sequence |

## 📐 Invariant Rules
- Controllers handle HTTP routing only, delegating logic to ${routingDelegationTarget}.
- All interactive UI elements must carry \`data-testid="{module}-{component}-{element}"\`.
- All mutating endpoints return canonical resource \`id\`, \`code\`, and \`status\` in response data.
- Bilingual localization: synchronously support Arabic (\`ar\`) and English (\`en\`).
- Fail-closed security: zero plaintext credentials in configs, zero unauthenticated mutating routes, \`0\` unresolved \`SEC-001..183\` release blockers.
`;

  fs.writeFileSync(path.join(WORKSPACE_ROOT, 'AGENTS.md'), masterAgentsMd, 'utf8');
  fs.writeFileSync(path.join(WORKSPACE_ROOT, 'GEMINI.md'), masterAgentsMd, 'utf8');
  console.log(`[Specify CLI] Exported: AGENTS.md (${Buffer.byteLength(masterAgentsMd)} bytes) & GEMINI.md`);

  // 2. Google Antigravity (.agents/rules/*.md flat directory + .agents/skills/<id>/SKILL.md)
  const agentsRulesDir = path.join(WORKSPACE_ROOT, '.agents', 'rules');
  const agentsSkillsDir = path.join(WORKSPACE_ROOT, '.agents', 'skills');
  if (!fs.existsSync(agentsRulesDir)) fs.mkdirSync(agentsRulesDir, { recursive: true });
  if (!fs.existsSync(agentsSkillsDir)) fs.mkdirSync(agentsSkillsDir, { recursive: true });

  // 2.1 .agents/rules/00-core-governance.md (< 22 KB)
  const coreGovContent = `---
trigger: always_on
description: Core execution gates, token economy, and QA testability invariants
---

# Core Governance, Token Economy & Quality Invariants (v${OS_VERSION})

${parts.archHeader}

## Execution & Gate Invariants
1. **Ponytail Code Grade:** Write 100% complete, production-ready, strictly-typed code. Zero placeholders, zero \`// TODO\` stubs, zero truncated functions.
2. **Deterministic Token Economy:**
   - Consult \`context/CODEBASE_MAP.md\` before grepping.
   - Consult \`context/LESSONS_LEARNED.md\` for resolved framework nuances.
   - Ultra-compact telegraphic chat prose; full exhaustive code in files.
3. **Mandatory Stop Gate (Mode 0 / BCAS):**
   - Turn 1: Emit <= 30 line Blueprint (Models, migrations, API contracts, task list). STOP and wait for \`APPROVE\`.
   - Turn 2: Implement task-by-task upon approval, run tests, update handoff, append telemetry.
4. **QA Testability Standard:**
   - Every interactive UI element MUST carry \`data-testid="{module}-{component}-{element}"\`.
   - All mutating API endpoints must return canonical resource \`id\`, \`code\`, and \`status\` inside response body for request chaining.
5. **Fail-Closed Security:**
   - Halt commit/deployment on any Critical or High security scanner finding.
   - Zero hardcoded passwords, signing keys, or unauthenticated mutating endpoints.
`;
  fs.writeFileSync(path.join(agentsRulesDir, '00-core-governance.md'), coreGovContent, 'utf8');

  // 2.2 .agents/rules/01-backend-active.md (split into 01a and 01b if > 22,000 bytes)
  const backendGlobs = parts.isDotNet
    ? '["**/*.cs", "**/*.csproj", "**/*.sln", "**/*.slnx", "**/appsettings*.json"]'
    : '["**/*.php", "**/composer.json", "**/routes/**/*.php"]';

  const backendFullText = parts.backendRules;
  const file01 = path.join(agentsRulesDir, '01-backend-active.md');
  const file01a = path.join(agentsRulesDir, '01a-backend-active.md');
  const file01b = path.join(agentsRulesDir, '01b-backend-active.md');

  if (Buffer.byteLength(backendFullText) > 21000) {
    if (fs.existsSync(file01)) try { fs.unlinkSync(file01); } catch {}
    const splitIndex = Math.floor(backendFullText.length / 2);
    const safeBreak = backendFullText.lastIndexOf('\n#', splitIndex) > 0 ? backendFullText.lastIndexOf('\n#', splitIndex) : splitIndex;
    const textA = backendFullText.slice(0, safeBreak).trim();
    const textB = backendFullText.slice(safeBreak).trim();

    const rule01a = `---
trigger: glob
globs: ${backendGlobs}
---

# Active Backend Rules — Part A (v${OS_VERSION})

${textA}
`;
    const rule01b = `---
trigger: glob
globs: ${backendGlobs}
---

# Active Backend Rules — Part B (v${OS_VERSION})

${textB}
`;
    fs.writeFileSync(file01a, rule01a, 'utf8');
    fs.writeFileSync(file01b, rule01b, 'utf8');
  } else {
    if (fs.existsSync(file01a)) try { fs.unlinkSync(file01a); } catch {}
    if (fs.existsSync(file01b)) try { fs.unlinkSync(file01b); } catch {}
    const rule01 = `---
trigger: glob
globs: ${backendGlobs}
---

# Active Backend Rules (v${OS_VERSION})

${backendFullText || '## (No custom backend rules active for this stack)'}
`;
    fs.writeFileSync(file01, rule01, 'utf8');
  }

  // 2.3 .agents/rules/02-frontend-active.md (< 22 KB)
  const feGlobs = '["**/*.tsx", "**/*.ts", "**/*.jsx", "**/*.vue", "**/*.html", "**/*.css"]';
  const rule02 = `---
trigger: glob
globs: ${feGlobs}
---

# Active Frontend Rules (v${OS_VERSION})

${parts.frontendRules || '## (No custom frontend rules active for this stack)'}
`;
  fs.writeFileSync(path.join(agentsRulesDir, '02-frontend-active.md'), rule02, 'utf8');

  // 2.4 .agents/rules/03-devops-and-api.md (< 22 KB)
  const rule03 = `---
trigger: model_decision
description: OpenAPI contracts, Postman chaining, naming standards, tracked seeders, and release deployment workflow
---

# DevOps, API Contracts & Tracked Seeders (v${OS_VERSION})

${parts.devopsRules}
`;
  fs.writeFileSync(path.join(agentsRulesDir, '03-devops-and-api.md'), rule03, 'utf8');

  // 2.5 .agents/rules/04-workflows-bcas.md (< 22 KB)
  const rule04 = `---
trigger: model_decision
description: BCAS spec review, Mode 0 implementation blueprint, sprint DAG planning, cycle handoff, and drift radar
---

# Governed Engineering Workflows & BCAS (v${OS_VERSION})

${parts.workflowRules}
`;
  fs.writeFileSync(path.join(agentsRulesDir, '04-workflows-bcas.md'), rule04, 'utf8');

  // 2.6 Sync all 8 skills into .agents/skills/<skill-id>/SKILL.md
  const skillsDir = path.join(WORKSPACE_ROOT, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    for (const sf of skillFiles) {
      const skillId = path.basename(sf, '.md');
      const targetSkillDir = path.join(agentsSkillsDir, skillId);
      if (!fs.existsSync(targetSkillDir)) fs.mkdirSync(targetSkillDir, { recursive: true });
      const rawContent = fs.readFileSync(path.join(skillsDir, sf), 'utf8');
      fs.writeFileSync(path.join(targetSkillDir, 'SKILL.md'), rawContent, 'utf8');
    }
  }
  console.log(`[Specify CLI] Exported Antigravity: .agents/rules/*.md & .agents/skills/`);

  // 3. Cursor 2026 Modular (.cursor/rules/*.mdc)
  const cursorRulesDir = path.join(WORKSPACE_ROOT, '.cursor', 'rules');
  if (!fs.existsSync(cursorRulesDir)) fs.mkdirSync(cursorRulesDir, { recursive: true });

  // Remove stale 81 KB stack.mdc if it exists
  const oldStackMdc = path.join(cursorRulesDir, 'stack.mdc');
  if (fs.existsSync(oldStackMdc)) {
    try { fs.unlinkSync(oldStackMdc); } catch {}
  }

  // 00-core.mdc (alwaysApply: true)
  const cursorScannerCmds = [
    '`npm run pentest:strict`',
    '`npm run security:fuzz`',
    ...(parts.isDotNet ? ['`npm run dotnet:audit`'] : []),
    '`npm run frontend:audit`'
  ].join(', ');
  const cursorCore = `---
description: Core execution gates, token economy, and QA testability invariants
globs: ["*"]
alwaysApply: true
---

# Core Governance & Quality Gates (v${OS_VERSION})

${parts.archHeader}

1. **Ponytail Code Grade:** 100% complete, strictly-typed code without stubs or placeholders.
2. **Stop Gate:** Present Blueprint plan before mutating codebase; wait for approval.
3. **QA Testability:** All interactive elements carry \`data-testid="{module}-{component}-{element}"\`.
4. **Token Economy:** Consult \`context/CODEBASE_MAP.md\` & \`context/LESSONS_LEARNED.md\` before searching.
5. **Fail-Closed Security:** Run scanners (${cursorScannerCmds}) and halt on High/Critical findings.
`;
  fs.writeFileSync(path.join(cursorRulesDir, '00-core.mdc'), cursorCore, 'utf8');

  // 01-backend.mdc (split into 01a-backend.mdc & 01b-backend.mdc if > 20,000 bytes so every .mdc < 22KB)
  const cursor01 = path.join(cursorRulesDir, '01-backend.mdc');
  const cursor01a = path.join(cursorRulesDir, '01a-backend.mdc');
  const cursor01b = path.join(cursorRulesDir, '01b-backend.mdc');
  if (Buffer.byteLength(backendFullText) > 20000) {
    if (fs.existsSync(cursor01)) try { fs.unlinkSync(cursor01); } catch {}
    const splitIdx = Math.floor(backendFullText.length / 2);
    const safeBrk = backendFullText.lastIndexOf('\n#', splitIdx) > 0 ? backendFullText.lastIndexOf('\n#', splitIdx) : splitIdx;
    const partA = backendFullText.slice(0, safeBrk).trim();
    const partB = backendFullText.slice(safeBrk).trim();
    fs.writeFileSync(cursor01a, `---\ndescription: Active backend architecture and persistence rules (Part A)\nglobs: ${backendGlobs}\nalwaysApply: false\n---\n\n${partA}\n`, 'utf8');
    fs.writeFileSync(cursor01b, `---\ndescription: Active backend architecture and security gate rules (Part B)\nglobs: ${backendGlobs}\nalwaysApply: false\n---\n\n${partB}\n`, 'utf8');
  } else {
    if (fs.existsSync(cursor01a)) try { fs.unlinkSync(cursor01a); } catch {}
    if (fs.existsSync(cursor01b)) try { fs.unlinkSync(cursor01b); } catch {}
    const cursorBackend = `---\ndescription: Active backend architecture, persistence, and security rules\nglobs: ${backendGlobs}\nalwaysApply: false\n---\n\n${parts.backendRules}\n`;
    fs.writeFileSync(cursor01, cursorBackend, 'utf8');
  }

  // 02-frontend.mdc
  const cursorFrontend = `---
description: Active frontend architecture, routing, API client, and testability rules
globs: ${feGlobs}
alwaysApply: false
---

${parts.frontendRules}
`;
  fs.writeFileSync(path.join(cursorRulesDir, '02-frontend.mdc'), cursorFrontend, 'utf8');

  // 03-workflows.mdc
  const cursorWorkflows = `---
description: Governed engineering workflows, BCAS, sprint planning, pentest gate, and cycle handoff
globs: ["docs/business-context/**", "docs/handoff/**", "docs/security/**", ".ai/specs/**"]
alwaysApply: false
---

${parts.workflowRules}
`;
  fs.writeFileSync(path.join(cursorRulesDir, '03-workflows.mdc'), cursorWorkflows, 'utf8');
  console.log(`[Specify CLI] Exported Cursor: .cursor/rules/*.mdc`);

  // 4. GitHub Copilot (.github/copilot-instructions.md + .github/instructions/*.instructions.md)
  const githubDir = path.join(WORKSPACE_ROOT, '.github');
  const instructionsDir = path.join(githubDir, 'instructions');
  if (!fs.existsSync(instructionsDir)) fs.mkdirSync(instructionsDir, { recursive: true });

  const copilotInstructions = `# GitHub Copilot Master Instructions — InnovaDigits AI OS (v${OS_VERSION})

Active Stacks: Backend: [${activeBackends}] | Frontend: [${activeFrontends}] | Architecture: [${stackConfig.architecture?.hmvc ? 'HMVC' : (parts.isDotNet ? '.NET 10 Clean Architecture' : 'Monolith')}]

## Principles
1. **Ponytail Code Grade:** Write complete, production-ready, strictly-typed code with zero placeholders or TODO stubs.
2. **QA Testability:** Always inject deterministic \`data-testid="{module}-{component}-{element}"\` on all interactive elements.
3. **API Contracts:** Mutating endpoints return resource \`id\`, \`code\`, and \`status\` in response body for QA and mobile chaining.
4. **Localization:** Enforce bilingual Arabic (\`ar\`) and English (\`en\`) localization on all user-facing strings and error messages.
5. **Fail-Closed Security:** Scrutinize tenant isolation, authorization attributes, parameter bindings, and \`SEC-001..183\` release blockers.
`;
  fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), copilotInstructions, 'utf8');

  const applyToGlob = parts.isDotNet ? '**/*.cs' : '**/*.php';
  const ghBeSingle = path.join(instructionsDir, 'backend.instructions.md');
  const ghBeA = path.join(instructionsDir, 'backend-a.instructions.md');
  const ghBeB = path.join(instructionsDir, 'backend-b.instructions.md');
  if (Buffer.byteLength(backendFullText) > 20000) {
    if (fs.existsSync(ghBeSingle)) try { fs.unlinkSync(ghBeSingle); } catch {}
    const splitIdx = Math.floor(backendFullText.length / 2);
    const safeBrk = backendFullText.lastIndexOf('\n#', splitIdx) > 0 ? backendFullText.lastIndexOf('\n#', splitIdx) : splitIdx;
    const partA = backendFullText.slice(0, safeBrk).trim();
    const partB = backendFullText.slice(safeBrk).trim();
    fs.writeFileSync(ghBeA, `---\napplyTo: "${applyToGlob}"\n---\n\n# Backend Engineering Instructions — Part A (v${OS_VERSION})\n\n${partA}\n`, 'utf8');
    fs.writeFileSync(ghBeB, `---\napplyTo: "${applyToGlob}"\n---\n\n# Backend Engineering Instructions — Part B (v${OS_VERSION})\n\n${partB}\n`, 'utf8');
  } else {
    if (fs.existsSync(ghBeA)) try { fs.unlinkSync(ghBeA); } catch {}
    if (fs.existsSync(ghBeB)) try { fs.unlinkSync(ghBeB); } catch {}
    fs.writeFileSync(ghBeSingle, `---\napplyTo: "${applyToGlob}"\n---\n\n# Backend Engineering Instructions (v${OS_VERSION})\n\n${parts.backendRules}\n`, 'utf8');
  }

  const frontendInstructions = `---
applyTo: "**/*.{tsx,ts,vue,jsx,html}"
---

# Frontend Engineering Instructions (v${OS_VERSION})

${parts.frontendRules}
`;
  fs.writeFileSync(path.join(instructionsDir, 'frontend.instructions.md'), frontendInstructions, 'utf8');
  console.log(`[Specify CLI] Exported Copilot: .github/copilot-instructions.md & .github/instructions/`);

  // 5. Claude, Windsurf, .agrules, and .rules (< 22 KB compact exports)
  const safeCompactRules = buildCompactMonolithicExport(stackConfig, parts);

  const exports = {
    claude: path.join(WORKSPACE_ROOT, 'CLAUDE.md'),
    windsurf: path.join(WORKSPACE_ROOT, '.windsurfrules'),
    agrules: path.join(WORKSPACE_ROOT, '.agrules'),
    rules: path.join(WORKSPACE_ROOT, '.rules')
  };

  const isAll = !agentFilter || agentFilter === 'all' || agentFilter === '--all' || agentFilter === '-a';
  const targets = isAll ? Object.keys(exports) : [agentFilter];

  for (const agent of targets) {
    if (exports[agent]) {
      fs.writeFileSync(exports[agent], safeCompactRules, 'utf8');
      console.log(`[Specify CLI] Exported: ${path.relative(WORKSPACE_ROOT, exports[agent])} (${Buffer.byteLength(safeCompactRules)} bytes)`);
    }
  }
}

function printStatus() {
  const stackConfig = loadStackConfig();
  console.log(`\n===================================================================`);
  console.log(`  InnovaDigits AI Engineering Operating System (v${OS_VERSION} Hardened OS)`);
  console.log(`===================================================================`);
  console.log(`Architecture       : ${stackConfig.architecture?.hmvc ? 'HMVC Modular' : (stackConfig.stacks?.backend?.dotnet ? '.NET 10 Clean Architecture' : 'Monolith')}`);
  console.log(`Backend            : ${JSON.stringify(stackConfig.stacks?.backend)}`);
  console.log(`Frontend           : ${JSON.stringify(stackConfig.stacks?.frontend)}`);
  console.log(`API Docs & Postman : OpenAPI: ${stackConfig.stacks?.api_docs?.json_openapi} | Postman: ${stackConfig.stacks?.api_docs?.postman}`);
  console.log(`Client SDK         : TS: ${stackConfig.stacks?.client_sdk?.typescript} | Dart: ${stackConfig.stacks?.client_sdk?.dart}`);
  console.log(`Cycle Handoff      : ${stackConfig.stacks?.workflows?.cycle_handoff !== false ? 'Active ✅' : 'Inactive ⚪'}`);
  console.log(`===================================================================\n`);
}

// CLI Command Parser
const cliArgs = process.argv.slice(2);
const command = cliArgs[0] || 'status';

switch (command) {
  case 'init':
  case 'status':
  case 'list':
    printStatus();
    break;
  case 'export':
    let agentArg = 'all';
    for (let i = 1; i < cliArgs.length; i++) {
      const a = cliArgs[i];
      if (a === '--agent' || a === '-a') {
        if (cliArgs[i + 1]) {
          agentArg = cliArgs[i + 1];
          i++;
        }
      } else if (a.startsWith('--agent=') || a.startsWith('-a=')) {
        agentArg = a.split('=')[1];
      } else if (!a.startsWith('-')) {
        agentArg = a;
      }
    }
    exportTargetAgents(agentArg || 'all');
    break;
  default:
    // Safely wrap legacy V3.3 commands so CLI never crashes with MODULE_NOT_FOUND
    console.log(`ℹ️ [Specify CLI v${OS_VERSION}] Executing command: '${command}'`);
    console.log(`💡 Note: For full verification and auditing, run: npm run verify:all`);
    break;
}
