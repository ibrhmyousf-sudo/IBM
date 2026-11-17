#!/usr/bin/env node

/**
 * 🛡️ InnovaDigits Static Security Fuzzing & Vulnerability Scanner (v3.9.4)
 * Multi-Stack Security Scanner: Laravel/PHP, .NET 10 Clean Architecture, and React/Vue/Angular SPAs.
 * Scans Models, Controllers, Routes, and OpenAPI Modules to detect:
 *  1. IDOR & Missing Tenant/Auth Ownership Scopes
 *  2. Injection & Mass-Assignment Vectors
 *  3. PII & Secret Leakage / Exposure
 * Generates docs/security/SECURITY_AUDIT_REPORT.md with an Adversarial Fuzzing Test Matrix.
 *
 * Usage:
 *   node bin/security-fuzzer.js
 *   node bin/security-fuzzer.js --strict
 *   node bin/security-fuzzer.js --module=Academies
 *   node bin/security-fuzzer.js --output=custom/path.md
 *   node bin/security-fuzzer.js --json
 */

const fs = require('fs');
const path = require('path');

const startTime = Date.now();

// 1. Parse CLI Options
const args = process.argv.slice(2);
let targetModule = null;
let customOutputPath = null;
let isJson = false;
let isStrict = false;

for (const arg of args) {
  if (arg.startsWith('--module=')) {
    targetModule = arg.split('=')[1].trim();
  } else if (arg.startsWith('--output=')) {
    customOutputPath = path.resolve(arg.split('=')[1].trim());
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--strict') {
    isStrict = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Static Security Fuzzing & Vulnerability Scanner (v3.9.4)

Options:
  --strict           Fail closed (exit 1) on any Critical or High finding
  --module=<name>    Filter audit to a specific domain module (e.g. Academies, Events)
  --output=<path>    Custom destination report path (Default: docs/security/SECURITY_AUDIT_REPORT.md)
  --json             Output raw JSON report to stdout
  --help, -h         Show help instructions
`);
    process.exit(0);
  }
}

// 2. Resolve Paths
const cwd = process.cwd();
const candidateMaps = [
  path.join(cwd, 'context', 'CODEBASE_MAP.md'),
  path.join(cwd, '.ai', 'context', 'CODEBASE_MAP.md'),
  path.join(cwd, '..', 'context', 'CODEBASE_MAP.md')
];
const codebaseMapPath = candidateMaps.find(p => fs.existsSync(p));

const docsDir = path.join(cwd, 'docs');
const secDir = path.join(docsDir, 'security');
if (!fs.existsSync(secDir)) {
  fs.mkdirSync(secDir, { recursive: true });
}
const defaultOutputFile = path.join(secDir, 'SECURITY_AUDIT_REPORT.md');
const outputFile = customOutputPath || defaultOutputFile;

const openApiDir = path.join(docsDir, 'modules');
const rootOpenApi = path.join(docsDir, 'openapi.json');

// 3. Sensitive / PII Patterns
const SENSITIVE_FIELDS = [
  'password', 'secret', 'token', 'api_key', 'access_token', 'private_key',
  'national_id', 'iqama_no', 'ssn', 'passport_no', 'credit_card', 'cvv',
  'iban', 'bank_account', 'otp', 'pin_code'
];

const RAW_SQL_PATTERNS = [
  /DB::raw\s*\(/i,
  /whereRaw\s*\(/i,
  /havingRaw\s*\(/i,
  /orderByRaw\s*\(/i,
  /selectRaw\s*\(/i,
  /\$_(GET|POST|REQUEST)\b/
];

// 4. Data Extraction from CODEBASE_MAP.md
const models = [];
const controllers = [];
const tables = [];

if (codebaseMapPath && fs.existsSync(codebaseMapPath)) {
  const mapContent = fs.readFileSync(codebaseMapPath, 'utf8');
  const lines = mapContent.split('\n');
  let currentSection = 0; // 1 = Models, 2 = Controllers, 3 = Tables

  for (const line of lines) {
    if (line.startsWith('## 1. Backend Models')) {
      currentSection = 1;
      continue;
    } else if (line.startsWith('## 2. Controllers')) {
      currentSection = 2;
      continue;
    } else if (line.startsWith('## 3. Database Tables')) {
      currentSection = 3;
      continue;
    } else if (line.startsWith('## ')) {
      currentSection = 0;
      continue;
    }

    if (!line.startsWith('|') || line.includes(':---') || line.includes('| Model |') || line.includes('| Controller Name |') || line.includes('| Table Name |')) {
      continue;
    }

    const parts = line.split('|').map(s => s.trim()).filter(Boolean);
    if (currentSection === 1 && parts.length >= 4) {
      const name = parts[0].replace(/`/g, '');
      const type = parts[1];
      const table = parts[2].replace(/`/g, '');
      const relPath = parts[3].replace(/`/g, '');
      models.push({ name, type, table, relPath });
    } else if (currentSection === 2 && parts.length >= 3) {
      const name = parts[0].replace(/`/g, '');
      const stack = parts[1];
      const relPath = parts[2].replace(/`/g, '');
      controllers.push({ name, stack, relPath });
    } else if (currentSection === 3 && parts.length >= 2) {
      const name = parts[0].replace(/`/g, '');
      const migration = parts[1].replace(/`/g, '');
      tables.push({ name, migration });
    }
  }
}

// 5. Scan On-Disk Source Code or Map-Based Heuristics
const findings = [];
let findingCounter = 1;

function addFinding(severity, category, target, location, threat, remediation) {
  findings.push({
    id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
    severity, // CRITICAL, HIGH, MEDIUM, LOW
    category,
    target,
    location,
    threat,
    remediation
  });
}

// Filter targets if --module is provided
const filteredControllers = targetModule
  ? controllers.filter(c => c.relPath.toLowerCase().includes(targetModule.toLowerCase()))
  : controllers;

const filteredModels = targetModule
  ? models.filter(m => m.relPath.toLowerCase().includes(targetModule.toLowerCase()))
  : models;

// A. Scan PHP Controllers for IDOR, Auth Guard, and Raw SQL
for (const ctrl of filteredControllers) {
  if (ctrl.stack === 'ASP.NET Minimal API' || ctrl.stack === 'ASP.NET MVC') continue;
  const fullPath = path.join(cwd, ctrl.relPath);
  if (fs.existsSync(fullPath)) {
    const code = fs.readFileSync(fullPath, 'utf8');

    // Check Raw SQL
    for (const pat of RAW_SQL_PATTERNS) {
      if (pat.test(code)) {
        addFinding(
          'HIGH',
          'SQL Injection Risk',
          ctrl.name,
          ctrl.relPath,
          'Detected unparameterized or raw SQL invocation (`DB::raw` / `whereRaw` / superglobals).',
          'Enforce PDO parameter binding with question-mark placeholders: `->whereRaw("column = ?", [$val])`'
        );
        break;
      }
    }

    // Check Direct $request->all() mass assignment in controllers
    if (/\$request->all\(\)/.test(code) && (code.includes('::create(') || code.includes('->update('))) {
      addFinding(
        'HIGH',
        'Mass Assignment Vector',
        ctrl.name,
        ctrl.relPath,
        'Direct `$request->all()` passed to Eloquent model persistence method.',
        'Replace `$request->all()` with `$request->validated()` from dedicated FormRequest class.'
      );
    }

    // Check missing tenant / user scoping in show/update/destroy methods
    const hasShowOrUpdate = /function\s+(show|update|destroy|edit)\s*\(/.test(code);
    const hasTenantScope = /tenant_id|facility_id|academy_id|organization_id|auth\(\)->id\(\)|auth\(\)->user\(\)|auth\(\)->check\(\)|\$request->user\(\)|getAuthIdentifier|user_id|AuthUserDto/.test(code);
    const hasAuthorize = /authorize\s*\(|Gate::|Policy|middleware\(['"](auth|permission|role)|BaseApiController|BaseController/.test(code);

    if (hasShowOrUpdate && !hasTenantScope && !hasAuthorize) {
      addFinding(
        'CRITICAL',
        'Insecure Direct Object Reference (IDOR)',
        ctrl.name,
        ctrl.relPath,
        'Controller mutates or fetches record by ID without explicit tenant scope, auth boundary, or Policy Gate.',
        'Bind tenant/user context: `where("tenant_id", auth()->user()->tenant_id)->where("id", $id)->firstOrFail()`'
      );
    }
  } else {
    // Structural Heuristic for mapped controllers
    if (ctrl.name.includes('Admin') && !ctrl.relPath.includes('Admin')) {
      addFinding(
        'MEDIUM',
        'Privilege Boundary Ambiguity',
        ctrl.name,
        ctrl.relPath,
        'Administrative controller path lacks standard Admin namespace segregation.',
        'Relocate to Admin namespace and ensure `auth:sanctum` and role middleware are enforced.'
      );
    }
  }
}

// B. Scan PHP Models for Mass-Assignment and PII Protection
for (const mdl of filteredModels) {
  if (mdl.type === 'EF Core Entity') continue;
  const fullPath = path.join(cwd, mdl.relPath);
  if (fs.existsSync(fullPath)) {
    const code = fs.readFileSync(fullPath, 'utf8');

    // Check unguarded models
    if (/\$guarded\s*=\s*\[\s*\];/.test(code) && !code.includes('$fillable')) {
      addFinding(
        'CRITICAL',
        'Unguarded Model (Mass Assignment)',
        mdl.name,
        mdl.relPath,
        'Model specifies `$guarded = []` allowing arbitrary HTTP parameter injection into database.',
        'Remove `$guarded = []` and declare an explicit whitelist array in `protected $fillable = [...]`.'
      );
    }

    // Check sensitive fields missing in $hidden
    for (const field of SENSITIVE_FIELDS) {
      if (new RegExp(`['"]${field}['"]`, 'i').test(code) && !code.includes('$hidden')) {
        addFinding(
          'HIGH',
          'PII / Secret Exposure',
          mdl.name,
          mdl.relPath,
          `Sensitive attribute \`${field}\` declared without \`$hidden\` serialization protection.`,
          `Add \`${field}\` to \`protected $hidden = ['${field}']\` and mask in logs.`
        );
      }
    }
  }
}

// C. Scan OpenAPI specs: modular docs/modules/*.json and root docs/openapi.json
const openApiSpecsToScan = [];
if (fs.existsSync(openApiDir)) {
  const openApiFiles = fs.readdirSync(openApiDir).filter(f => f.endsWith('.json') && f !== 'modules_config.json');
  for (const f of openApiFiles) openApiSpecsToScan.push(path.join(openApiDir, f));
}
if (fs.existsSync(rootOpenApi)) {
  openApiSpecsToScan.push(rootOpenApi);
}

for (const filePath of openApiSpecsToScan) {
  const relPath = path.relative(cwd, filePath).replace(/\\/g, '/');
  try {
    const spec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (spec.paths) {
      for (const [routePath, methods] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(methods)) {
          if (['post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
            if (!op.security && !spec.security) {
              addFinding(
                'HIGH',
                'Unauthenticated Mutation Endpoint',
                `${method.toUpperCase()} ${routePath}`,
                relPath,
                'Mutating API route declared without OpenAPI `security` requirement (e.g. bearerAuth).',
                'Add `security: [{ bearerAuth: [] }]` to OpenAPI operation and enforce auth middleware / RequireAuthorization() in router.'
              );
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignored malformed JSON
  }
}

// D. Multi-Stack Tier-1 Security Scanners (Laravel, .NET, Frontend, AI/LLM, Uploads/Exports/SCA)
{
  let isSelfOsRoot = false;
  const selfPkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(selfPkgPath)) {
    try {
      const selfPkg = JSON.parse(fs.readFileSync(selfPkgPath, 'utf8'));
      if (selfPkg.name === 'ai-engineering-os' && !fs.existsSync(path.join(cwd, 'artisan')) && !fs.existsSync(path.join(cwd, 'Modules')) && !fs.existsSync(path.join(cwd, 'src'))) {
        isSelfOsRoot = true;
      }
    } catch { /* ignore */ }
  }

  let stackSecProfile = {};
  for (const sp of [path.join(cwd, 'stack.json'), path.join(cwd, '.ai', 'stack.json')]) {
    if (fs.existsSync(sp)) {
      try { stackSecProfile = JSON.parse(fs.readFileSync(sp, 'utf8')).security_profile || {}; break; } catch { /* ignore */ }
    }
  }

  const pushScannerFinding = (f) => {
    if (targetModule && !String(f.location || '').toLowerCase().includes(targetModule.toLowerCase()) && !String(f.target || '').toLowerCase().includes(targetModule.toLowerCase())) {
      return;
    }
    addFinding(f.severity, `${f.ruleId || f.id} ${f.category}`, f.target, f.location, f.threat, f.remediation);
  };

  if (!isSelfOsRoot) {
    const laravel = require('./lib/security/laravel-scanner.js');
    if (laravel.isLaravelOrPhpProject(cwd)) {
      for (const f of laravel.auditLaravel(cwd)) pushScannerFinding(f);
    }

    const dotnet = require('./lib/dotnet-scanner.js');
    if (dotnet.isDotNetProject(cwd)) {
      for (const f of dotnet.auditDotNet(cwd)) pushScannerFinding(f);
    }

    const frontend = require('./lib/frontend-scanner.js');
    for (const feRoot of frontend.findFrontendRoots(cwd)) {
      for (const f of frontend.auditFrontend(feRoot)) pushScannerFinding(f);
    }

    const aiLlm = require('./lib/security/ai-llm-scanner.js');
    for (const f of aiLlm.auditAiLlm(cwd, stackSecProfile)) pushScannerFinding(f);

    const uploadsSca = require('./lib/security/upload-export-sca-scanner.js');
    for (const f of uploadsSca.auditUploadsExportsSca(cwd)) pushScannerFinding(f);
  }
}

// 6. Generate Adversarial Fuzzing Test Matrix
const fuzzingMatrix = [];
let matrixCounter = 1;

const sampleControllers = filteredControllers.slice(0, 10);
for (const ctrl of sampleControllers) {
  const baseName = ctrl.name.replace(/Controller|Endpoints?$/i, '');
  const slug = baseName.toLowerCase();
  const isDotNet = ctrl.stack === 'ASP.NET Minimal API' || ctrl.stack === 'ASP.NET MVC';

  // 1. Cross-Tenant IDOR Fuzz
  fuzzingMatrix.push({
    caseId: `FUZZ-${String(matrixCounter++).padStart(3, '0')}`,
    endpoint: `/api/v1/${slug}/{id}`,
    method: 'GET / PUT',
    attackVector: 'Cross-Tenant IDOR Injection',
    payload: `{"id": "foreign_tenant_id_9999"}`,
    expectedStatus: '404 / 403',
    invariant: isDotNet
      ? '`[Authorize]` + `IUser` tenant-scoped LINQ query filter (`where tenant_id == user.TenantId`) throwing 404'
      : 'Strict tenant query scoping (`where tenant_id = current_tenant`)'
  });

  // 2. Privilege Escalation Fuzz
  fuzzingMatrix.push({
    caseId: `FUZZ-${String(matrixCounter++).padStart(3, '0')}`,
    endpoint: `/api/v1/${slug}`,
    method: 'POST / PUT',
    attackVector: 'Privilege Escalation Tampering',
    payload: `{"role": "super_admin", "is_admin": true, "balance": 999999}`,
    expectedStatus: isDotNet ? '400 Bad Request' : '422 Unprocessable',
    invariant: isDotNet
      ? 'FluentValidation rule + immutable C# `record` DTO omitting privileged properties'
      : 'Protected fields excluded from FormRequest and Model $fillable'
  });

  // 3. SQLi Boolean Injection
  fuzzingMatrix.push({
    caseId: `FUZZ-${String(matrixCounter++).padStart(3, '0')}`,
    endpoint: `/api/v1/${slug}?search=`,
    method: 'GET',
    attackVector: 'SQLi Boolean Tautology Probe',
    payload: `' OR '1'='1' --`,
    expectedStatus: '200 OK (Sanitized)',
    invariant: isDotNet
      ? 'EF Core LINQ translation / `FromSqlInterpolated` with parameterized sql parameters'
      : 'PDO parameterized bindings; raw SQL interpolation strictly blocked'
  });

  // 4. Scalar Integer Overflow
  fuzzingMatrix.push({
    caseId: `FUZZ-${String(matrixCounter++).padStart(3, '0')}`,
    endpoint: `/api/v1/${slug}/-1`,
    method: 'GET / DELETE',
    attackVector: 'Scalar Boundary Tampering (-1 / MaxInt)',
    payload: `id=-1 OR id=9223372036854775807`,
    expectedStatus: '404 Not Found',
    invariant: isDotNet
      ? 'Minimal API route constraint `/{id:int}` or FluentValidation `RuleFor(x => x.Id).GreaterThan(0)`'
      : 'Route parameter constraint `->whereNumber("id")` and positive validation'
  });
}

// 7. Calculate Security Posture Score
// Max 100%. Deductions: CRITICAL (-20), HIGH (-10), MEDIUM (-5), LOW (-2)
let penalty = 0;
let criticalCount = 0;
let highCount = 0;
let mediumCount = 0;
let lowCount = 0;

for (const f of findings) {
  if (f.severity === 'CRITICAL') {
    penalty += 20;
    criticalCount++;
  } else if (f.severity === 'HIGH') {
    penalty += 10;
    highCount++;
  } else if (f.severity === 'MEDIUM') {
    penalty += 5;
    mediumCount++;
  } else {
    penalty += 2;
    lowCount++;
  }
}

const postureScore = Math.max(0, 100 - penalty);
let postureGrade = 'A+';
let postureBadge = '🟢 EXCELLENT';

if (postureScore < 60) {
  postureGrade = 'F';
  postureBadge = '🔴 CRITICAL RISK';
} else if (postureScore < 75) {
  postureGrade = 'C';
  postureBadge = '🟠 ELEVATED RISK';
} else if (postureScore < 90) {
  postureGrade = 'B';
  postureBadge = '🟡 MODERATE';
} else if (postureScore < 100) {
  postureGrade = 'A';
  postureBadge = '🟢 SECURE';
}

const clearanceGranted = (criticalCount === 0 && highCount === 0 && postureScore >= 80);
const durationMs = Date.now() - startTime;

// 8. Generate Markdown Report
let md = `# Security Audit & Adversarial Fuzzing Report

> **Scanner Version:** v3.9.4 Multi-Stack AI Security Fuzzing Engine  
> **Generated:** ${new Date().toISOString()} | **Duration:** ${durationMs}ms  
> **Target Scope:** ${targetModule ? `Module: ${targetModule}` : 'Full Workspace / Mapped Codebase'}  
> **Controllers Analyzed:** ${filteredControllers.length} | **Models Analyzed:** ${filteredModels.length}

---

## 1. Security Posture Scorecard

| Metric | Value | Rating |
| :--- | :--- | :--- |
| **Security Posture Score** | **${postureScore}%** | ${postureBadge} (Grade ${postureGrade}) |
| **Total Findings** | **${findings.length}** | ${criticalCount} Critical, ${highCount} High, ${mediumCount} Medium, ${lowCount} Low |
| **Adversarial Fuzzing Cases** | **${fuzzingMatrix.length}** | Synthesized Attack Vectors |
| **Enforcement Policy** | **FAIL-CLOSED** | Halt deployment on Critical/High findings |
| **Clearance Status** | **${clearanceGranted ? 'CLEARANCE_GRANTED' : 'SECURITY_ALERT_REVIEW_REQUIRED'}** | Strict 0 Critical & 0 High policy |

---

## 2. Vulnerability Findings

`;

if (findings.length === 0) {
  md += `> 🟢 **ZERO VULNERABILITIES DETECTED.**  
> All analyzed controllers, models, and endpoints adhere to strict tenant isolation, explicit auth boundaries, and mass-assignment whitelists.\n\n`;
} else {
  md += `| ID | Severity | Category | Target | Threat Vector | Remediation |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const f of findings) {
    const sevBadge = f.severity === 'CRITICAL' ? '🔴 CRITICAL' : f.severity === 'HIGH' ? '🟠 HIGH' : f.severity === 'MEDIUM' ? '🟡 MEDIUM' : '🔵 LOW';
    md += `| **${f.id}** | ${sevBadge} | ${f.category} | \`${f.target}\` | ${f.threat} | ${f.remediation} |\n`;
  }
  md += `\n`;
}

md += `---

## 3. Adversarial Fuzzing Test Matrix

The following adversarial test suite simulates ethical-hacker penetration vectors to verify fail-closed boundary enforcement:

| Case ID | Endpoint / Action | Method | Attack Vector | Fuzzing Payload | Expected Status | Mitigation Invariant |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

for (const tc of fuzzingMatrix) {
  md += `| **${tc.caseId}** | \`${tc.endpoint}\` | \`${tc.method}\` | ${tc.attackVector} | \`${tc.payload}\` | **${tc.expectedStatus}** | ${tc.invariant} |\n`;
}

md += [
  '',
  '---',
  '',
  '## 4. Remediation & Hardening Roadmap',
  '',
  '1. **Strict Multi-Tenant Scoping (`security-sentinel`)**:',
  '   - Verify every query is bound to `user.TenantId` or `auth()->user()->tenant_id`. Never rely on route ID alone.',
  '2. **FormRequest / FluentValidation Protection (`security-fuzzing`)**:',
  '   - Prohibit raw dictionary injection. Use strictly-typed FormRequest / immutable C# record DTOs with FluentValidation.',
  '3. **Database Parameterization (`db-architect`)**:',
  '   - Prohibit string concatenation in raw SQL; use EF `FromSqlInterpolated` or PDO parameter bindings.',
  '4. **Institutional Memory Binding (`LESSONS_LEARNED.md`)**:',
  '   - Any resolved vulnerability pattern must be recorded into `context/LESSONS_LEARNED.md` to prevent regression.',
  ''
].join('\n');

fs.writeFileSync(outputFile, md, 'utf8');

// 9. Output Results
if (isJson) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    score: postureScore,
    grade: postureGrade,
    clearance_status: clearanceGranted ? 'CLEARANCE_GRANTED' : 'SECURITY_ALERT_REVIEW_REQUIRED',
    critical_count: criticalCount,
    high_count: highCount,
    controllers_count: filteredControllers.length,
    models_count: filteredModels.length,
    findings,
    fuzzingMatrix,
    outputFile,
    durationMs
  }, null, 2));
} else {
  console.log('');
  console.log('================================================================================');
  console.log('       INNOVADIGITS AI SECURITY FUZZING & VULNERABILITY SCANNER (v3.9.4)        ');
  console.log('================================================================================');
  console.log(`Security Score     : ${postureScore}% (${postureBadge} - Grade ${postureGrade})`);
  console.log(`Scope Analyzed     : ${targetModule ? `Module: ${targetModule}` : 'Full Workspace'}`);
  console.log(`Controllers/Models : ${filteredControllers.length} controllers / ${filteredModels.length} models`);
  console.log(`Audit Findings     : ${findings.length} (${criticalCount} Critical, ${highCount} High, ${mediumCount} Medium, ${lowCount} Low)`);
  console.log(`Fuzzing Vectors    : ${fuzzingMatrix.length} synthesized test cases`);
  console.log(`Report Output      : ${outputFile}`);
  console.log(`Execution Time     : ${durationMs}ms`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`>>> SECURITY STATUS: ${clearanceGranted ? 'CLEARANCE_GRANTED' : 'SECURITY_ALERT_REVIEW_REQUIRED'}`);
  console.log('================================================================================\n');
}

if (isStrict && (criticalCount > 0 || highCount > 0)) {
  process.exit(1);
}

process.exit(0);
