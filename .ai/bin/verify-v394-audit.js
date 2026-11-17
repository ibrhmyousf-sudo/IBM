#!/usr/bin/env node

/**
 * ==============================================================================
 * INNOVADIGITS AI ENGINEERING OS (v3.9.4)
 * Production Audit & Verification Suite (Wave 6 Mandatory Verification Gate)
 *
 * Verifies:
 * 1. Skills health validation (8/8 skills)
 * 2. Stack templates and active stack schema conformity
 * 3. .NET scanner positive/negative mock fixture tests (NET-S01, S04, S12, A01)
 * 4. Multi-IDE rule exporter isolation & token budget (<22KB, zero leaks)
 * 5. Zero-token CLI engines parity (security fuzzer, perf predictor, drift radar, cycle handoff)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const { auditDotNet } = require('./lib/dotnet-scanner');
const { computeFeatureSrd } = require('./lib/hub-utils');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function logPass(msg) {
  passedChecks++;
  totalChecks++;
  console.log(`  \x1b[32m✔ PASS:\x1b[0m ${msg}`);
}

function logFail(msg, detail) {
  failedChecks++;
  totalChecks++;
  console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${msg}`);
  if (detail) console.error(`    \x1b[33mDetail:\x1b[0m ${detail}`);
}

function validateSchema(schema, data, prefix = '') {
  const errors = [];
  if (schema.type === 'object' && schema.required) {
    for (const reqKey of schema.required) {
      if (data[reqKey] === undefined) {
        errors.push(`${prefix}missing required field '${reqKey}'`);
      }
    }
  }
  if (schema.properties) {
    for (const [propKey, propSchema] of Object.entries(schema.properties)) {
      if (data[propKey] !== undefined) {
        const val = data[propKey];
        if (propSchema.type === 'boolean' && typeof val !== 'boolean') {
          errors.push(`${prefix}${propKey} must be boolean, got ${typeof val}`);
        } else if (propSchema.type === 'string' && typeof val !== 'string') {
          errors.push(`${prefix}${propKey} must be string, got ${typeof val}`);
        } else if (propSchema.type === 'number' && typeof val !== 'number') {
          errors.push(`${prefix}${propKey} must be number, got ${typeof val}`);
        } else if (propSchema.type === 'array' && !Array.isArray(val)) {
          errors.push(`${prefix}${propKey} must be array, got ${typeof val}`);
        } else if (propSchema.type === 'object' && typeof val === 'object' && !Array.isArray(val)) {
          errors.push(...validateSchema(propSchema, val, `${prefix}${propKey}.`));
        }
      }
    }
  }
  return errors;
}

console.log('\n\x1b[1m=== InnovaDigits AI Engineering OS v3.9.4 Audit Verification Suite ===\x1b[0m\n');

// ----------------------------------------------------------------------
// CHECK 1: Autonomous Skills Health Verification
// ----------------------------------------------------------------------
console.log('\x1b[36m[CHECK 1/6] Verifying 8 Autonomous Skills Health...\x1b[0m');
try {
  const skillsOutput = execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'verify-skills.js')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  if (skillsOutput.includes('8/8 Skills Validated') || skillsOutput.includes('REGISTRY HEALTH: HEALTHY')) {
    logPass('All 8 Autonomous Skills pass structural & invariant verification.');
  } else {
    logFail('Skills verification output did not indicate all 8 healthy.', skillsOutput.slice(0, 300));
  }
} catch (err) {
  logFail('Failed executing bin/verify-skills.js', err.message);
}

// ----------------------------------------------------------------------
// CHECK 2: Stack Presets Schema Validation
// ----------------------------------------------------------------------
console.log('\n\x1b[36m[CHECK 2/6] Validating Stack Configuration & Presets against Schema...\x1b[0m');
try {
  const schemaPath = path.join(REPO_ROOT, 'stack.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  const filesToValidate = ['stack.json'];
  const tplDir = path.join(REPO_ROOT, 'templates');
  if (fs.existsSync(tplDir)) {
    const templates = fs.readdirSync(tplDir).filter(f => f.startsWith('stack.') && f.endsWith('.json'));
    filesToValidate.push(...templates.map(t => path.join('templates', t)));
  }

  let allSchemaValid = true;
  for (const relFile of filesToValidate) {
    const fullPath = path.join(REPO_ROOT, relFile);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const validationErrors = validateSchema(schema, parsed);
      if (validationErrors.length > 0) {
        allSchemaValid = false;
        logFail(`${relFile} failed schema validation`, validationErrors.join('; '));
      }
    } catch (e) {
      allSchemaValid = false;
      logFail(`Failed parsing ${relFile}`, e.message);
    }
  }

  if (allSchemaValid) {
    logPass(`stack.json and all ${filesToValidate.length - 1} presets strictly conform to stack.schema.json.`);
  }
} catch (err) {
  logFail('Failed schema validation check', err.message);
}

// ----------------------------------------------------------------------
// CHECK 3: .NET Scanner Mock Fixture Verification (Positive & Negative)
// ----------------------------------------------------------------------
console.log('\n\x1b[36m[CHECK 3/6] Verifying .NET Scanner via Mock Fixtures (Positive & Negative)...\x1b[0m');

// Fixture A: Negative (Violations)
const tmpNegativeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v394-dotnet-neg-'));
const tmpPositiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v394-dotnet-pos-'));

try {
  // Setup Negative Fixture
  fs.writeFileSync(path.join(tmpNegativeDir, 'App.sln'), 'Microsoft Visual Studio Solution File, Format Version 12.00\n');
  fs.writeFileSync(path.join(tmpNegativeDir, 'appsettings.Production.json'), JSON.stringify({
    ConnectionStrings: {
      DefaultConnection: "Server=10.0.0.1;Database=ProductionDb;User ID=sa;Password=SuperSecret123!;Encrypt=False;"
    }
  }, null, 2));

  fs.mkdirSync(path.join(tmpNegativeDir, 'src', 'Domain'), { recursive: true });
  fs.mkdirSync(path.join(tmpNegativeDir, 'src', 'Application', 'Items', 'Queries'), { recursive: true });
  fs.mkdirSync(path.join(tmpNegativeDir, 'src', 'Web', 'Endpoints'), { recursive: true });

  // NET-A01: Domain references Infrastructure
  fs.writeFileSync(path.join(tmpNegativeDir, 'src', 'Domain', 'Domain.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\\Infrastructure\\Infrastructure.csproj" />
  </ItemGroup>
</Project>
`);

  // NET-S04: MediatR request missing [Authorize]
  fs.writeFileSync(path.join(tmpNegativeDir, 'src', 'Application', 'Items', 'Queries', 'GetItemQuery.cs'), `
namespace Application.Items.Queries;

public record GetItemQuery(int Id) : IRequest<ItemDto>;
`);

  // NET-S12: Minimal API IEndpointGroup with AllowAnonymous mutating endpoint
  fs.writeFileSync(path.join(tmpNegativeDir, 'src', 'Web', 'Endpoints', 'Items.cs'), `
namespace Web.Endpoints;

public class Items : IEndpointGroup
{
    public void Map(WebApplication app)
    {
        app.MapGroup("/items")
           .MapPost("/", () => Results.Ok())
           .AllowAnonymous();
    }
}
`);

  // Initialize git to test git-tracked secret elevation
  try {
    execFileSync('git', ['init'], { cwd: tmpNegativeDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: tmpNegativeDir, stdio: 'ignore' });
  } catch (_) {}

  const negFindings = auditDotNet(tmpNegativeDir);
  const foundRules = new Set(negFindings.map(f => `${f.id}:${f.severity}`));

  const hasS01 = negFindings.some(f => f.id === 'NET-S01' && (f.severity === 'CRITICAL' || f.severity === 'HIGH'));
  if (hasS01) {
    logPass('Fixture A: Correctly caught NET-S01 (hardcoded credential / unencrypted transport in Production) as CRITICAL/HIGH.');
  } else {
    logFail('Fixture A: NET-S01 was not detected as CRITICAL/HIGH.', Array.from(foundRules).join(', '));
  }

  if (foundRules.has('NET-S04:HIGH')) {
    logPass('Fixture A: Correctly caught NET-S04 (MediatR request without [Authorize]) as HIGH.');
  } else {
    logFail('Fixture A: NET-S04 was not detected as HIGH.', Array.from(foundRules).join(', '));
  }

  if (foundRules.has('NET-S12:HIGH')) {
    logPass('Fixture A: Correctly caught NET-S12 (IEndpointGroup mutating route with AllowAnonymous) as HIGH.');
  } else {
    logFail('Fixture A: NET-S12 was not detected as HIGH.', Array.from(foundRules).join(', '));
  }

  if (foundRules.has('NET-A01:HIGH')) {
    logPass('Fixture A: Correctly caught NET-A01 (Clean Architecture Domain reference violation) as HIGH.');
  } else {
    logFail('Fixture A: NET-A01 was not detected as HIGH.', Array.from(foundRules).join(', '));
  }

  // Setup Positive Fixture
  fs.writeFileSync(path.join(tmpPositiveDir, 'App.sln'), 'Microsoft Visual Studio Solution File, Format Version 12.00\n');
  fs.writeFileSync(path.join(tmpPositiveDir, 'appsettings.Production.json'), JSON.stringify({
    ConnectionStrings: {
      DefaultConnection: "Server=tcp:prod-sql.database.windows.net;Authentication=Active Directory Default;Encrypt=True;"
    }
  }, null, 2));

  fs.mkdirSync(path.join(tmpPositiveDir, 'src', 'Domain'), { recursive: true });
  fs.mkdirSync(path.join(tmpPositiveDir, 'src', 'Application', 'Items', 'Queries'), { recursive: true });
  fs.mkdirSync(path.join(tmpPositiveDir, 'src', 'Web', 'Endpoints'), { recursive: true });

  // Clean Domain.csproj
  fs.writeFileSync(path.join(tmpPositiveDir, 'src', 'Domain', 'Domain.csproj'), `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
</Project>
`);

  // Clean MediatR with [Authorize]
  fs.writeFileSync(path.join(tmpPositiveDir, 'src', 'Application', 'Items', 'Queries', 'GetItemQuery.cs'), `
namespace Application.Items.Queries;

[Authorize(Roles = "Admin")]
public record GetItemQuery(int Id) : IRequest<ItemDto>;
`);

  // Clean Minimal API with group .RequireAuthorization()
  fs.writeFileSync(path.join(tmpPositiveDir, 'src', 'Web', 'Endpoints', 'Items.cs'), `
namespace Web.Endpoints;

public class Items : IEndpointGroup
{
    public void Map(WebApplication app)
    {
        var group = app.MapGroup("/items").RequireAuthorization();
        group.MapGet("/", () => Results.Ok());
        group.MapPost("/", () => Results.Created());
    }
}
`);

  const posFindings = auditDotNet(tmpPositiveDir);
  const posHighOrCrit = posFindings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');

  if (posHighOrCrit.length === 0) {
    logPass('Fixture B: Clean .NET Clean Architecture project passes with 0 CRITICAL and 0 HIGH findings.');
  } else {
    logFail('Fixture B: Clean project had unexpected CRITICAL/HIGH findings', JSON.stringify(posHighOrCrit));
  }

} catch (err) {
  logFail('Failed during .NET scanner mock fixture verification', err.message);
} finally {
  try { fs.rmSync(tmpNegativeDir, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(tmpPositiveDir, { recursive: true, force: true }); } catch (_) {}
}

// ----------------------------------------------------------------------
// CHECK 4: Multi-IDE Rule Exporter Isolation & Token Budget
// ----------------------------------------------------------------------
console.log('\n\x1b[36m[CHECK 4/6] Verifying Multi-IDE Rule Exporter Isolation & Token Budget...\x1b[0m');
const originalStackContent = fs.readFileSync(path.join(REPO_ROOT, 'stack.json'), 'utf8');

try {
  // Test export with stack.dotnet-react.json
  const dotnetReactPath = path.join(REPO_ROOT, 'templates', 'stack.dotnet-react.json');
  fs.writeFileSync(path.join(REPO_ROOT, 'stack.json'), fs.readFileSync(dotnetReactPath, 'utf8'));

  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'specify.js'), 'export', '--all'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  // Verify backend active rule contains .NET and NO PHP
  const backendRulePath = path.join(REPO_ROOT, '.agents', 'rules', '01a-backend-active.md');
  const backendRuleContent = fs.readFileSync(backendRulePath, 'utf8');

  const hasDotNet = backendRuleContent.includes('.NET') || backendRuleContent.includes('C#');
  const hasPhpLeak = backendRuleContent.includes('Eloquent') || backendRuleContent.includes('namespace Modules\\');

  if (hasDotNet && !hasPhpLeak) {
    logPass('Stack Isolation: .NET active export contains .NET rules with ZERO PHP/Laravel rule leaks.');
  } else {
    logFail('Stack Isolation: Detected cross-stack rule leakage or missing .NET rules.', `hasDotNet=${hasDotNet}, hasPhpLeak=${hasPhpLeak}`);
  }

  // Verify token budget across all exported .agents/rules/*.md
  const rulesDir = path.join(REPO_ROOT, '.agents', 'rules');
  const agentRules = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
  let allUnderLimit = true;
  let allValidFrontmatter = true;

  for (const rFile of agentRules) {
    const rPath = path.join(rulesDir, rFile);
    const stat = fs.statSync(rPath);
    if (stat.size > 22000) {
      allUnderLimit = false;
      logFail(`.agents/rules/${rFile} exceeds 22,000 bytes: ${stat.size} bytes`);
    }
    const content = fs.readFileSync(rPath, 'utf8');
    if (!content.startsWith('---') || !content.includes('trigger:')) {
      allValidFrontmatter = false;
      logFail(`.agents/rules/${rFile} is missing valid YAML frontmatter`);
    }
  }

  if (allUnderLimit && allValidFrontmatter) {
    logPass(`Antigravity Budget: All ${agentRules.length} rules are strictly < 22,000 bytes with valid YAML frontmatter.`);
  }

} catch (err) {
  logFail('Failed during multi-IDE export test', err.message);
} finally {
  // Restore original stack.json and re-export
  fs.writeFileSync(path.join(REPO_ROOT, 'stack.json'), originalStackContent);
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'specify.js'), 'export', '--all'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

// ----------------------------------------------------------------------
// CHECK 5: Zero-Token CLI Engines Parity
// ----------------------------------------------------------------------
console.log('\n\x1b[36m[CHECK 5/6] Verifying Zero-Token CLI Engines Parity...\x1b[0m');

const cliChecks = [
  { name: 'Security Fuzzer (--strict)', script: 'security-fuzzer.js', args: ['--strict'] },
  { name: 'Performance Predictor', script: 'perf-predictor.js', args: [] },
  { name: 'Drift Radar', script: 'drift-radar.js', args: [] },
  { name: 'Cycle Handoff Pack Compiler (--dry-run)', script: 'build-cycle-handoff.js', args: ['--dry-run'] }
];

for (const cli of cliChecks) {
  try {
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', cli.script), ...cli.args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    logPass(`CLI Parity: ${cli.name} executed successfully.`);
  } catch (err) {
    logFail(`CLI Parity: ${cli.name} failed`, err.message);
  }
}

// ----------------------------------------------------------------------
// CHECK 6: v3.9.4-patch1 Surgical Regressions
// ----------------------------------------------------------------------
console.log('\n\x1b[36m[CHECK 6/6] Verifying v3.9.4-patch1 Surgical Regressions...\x1b[0m');

// 6.1 drift-radar.js Non-Empty .NET Fixture
const tmpRadarDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v394-radar-'));
try {
  fs.mkdirSync(path.join(tmpRadarDir, 'src', 'Domain', 'Entities'), { recursive: true });
  fs.writeFileSync(path.join(tmpRadarDir, 'src', 'Domain', 'Entities', 'Department.cs'), 'public class Department { public int Id { get; set; } }');

  fs.mkdirSync(path.join(tmpRadarDir, 'context'), { recursive: true });
  fs.writeFileSync(path.join(tmpRadarDir, 'context', 'CODEBASE_MAP.md'), `
## 1. Backend Models (1)
| Model | Type | Explicit Table | Relative Path |
| :--- | :--- | :--- | :--- |
| \`Department\` | EF Core Entity | \`departments\` | \`src/Domain/Entities/Department.cs\` |
`);

  fs.mkdirSync(path.join(tmpRadarDir, 'docs', 'business-context', 'features', 'B0'), { recursive: true });
  fs.writeFileSync(path.join(tmpRadarDir, 'docs', 'business-context', 'features', 'B0', 'FEATURE-001.md'), `
| **Feature ID** | FEATURE-001 |
| **Feature Name** | Department Setup |
| **Readiness Status** | READY_FOR_DEV |

| \`missing_master_tbl\` (Master) |
`);

  const radarScript = path.join(REPO_ROOT, 'bin', 'drift-radar.js');
  const radarOut = execFileSync(process.execPath, [radarScript, '--json'], {
    cwd: tmpRadarDir,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const parsedRadar = JSON.parse(radarOut);
  if (Array.isArray(parsedRadar.entity_drift) && parsedRadar.entity_drift.length >= 1) {
    logPass('Regression 6.1: drift-radar.js handles non-empty .NET fixture without ReferenceError and detects entity drift.');
  } else {
    logFail('Regression 6.1: drift-radar.js did not detect entity drift in non-empty .NET fixture.');
  }
} catch (err) {
  logFail('Regression 6.1 failed executing drift-radar.js on .NET fixture', err.message);
} finally {
  try { fs.rmSync(tmpRadarDir, { recursive: true, force: true }); } catch (_) {}
}

// 6.2 pre-commit.js Mounted in .ai/hooks
const tmpGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v394-git-hook-'));
try {
  execFileSync('git', ['init'], { cwd: tmpGitDir, stdio: 'ignore' });
  fs.mkdirSync(path.join(tmpGitDir, '.ai', 'hooks'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'hooks', 'pre-commit.js'), path.join(tmpGitDir, '.ai', 'hooks', 'pre-commit.js'));

  fs.mkdirSync(path.join(tmpGitDir, 'src', 'Web'), { recursive: true });

  // Case A: placeholder password (<set-in-secrets>) -> should pass
  fs.writeFileSync(path.join(tmpGitDir, 'src', 'Web', 'appsettings.json'), JSON.stringify({
    ConnectionStrings: { Default: "Server=tcp:sql;Password=<set-in-secrets>;Encrypt=True;" }
  }, null, 2));
  execFileSync('git', ['add', 'src/Web/appsettings.json'], { cwd: tmpGitDir, stdio: 'ignore' });

  let caseAPassed = false;
  try {
    execFileSync(process.execPath, [path.join(tmpGitDir, '.ai', 'hooks', 'pre-commit.js')], {
      cwd: tmpGitDir,
      stdio: 'pipe'
    });
    caseAPassed = true;
  } catch {
    caseAPassed = false;
  }

  // Case B: real live password -> should fail
  fs.writeFileSync(path.join(tmpGitDir, 'src', 'Web', 'appsettings.json'), JSON.stringify({
    ConnectionStrings: { Default: "Server=tcp:sql;User ID=sa;Password=LiveSecret99!;Encrypt=True;" }
  }, null, 2));
  execFileSync('git', ['add', 'src/Web/appsettings.json'], { cwd: tmpGitDir, stdio: 'ignore' });

  let caseBBlocked = false;
  try {
    execFileSync(process.execPath, [path.join(tmpGitDir, '.ai', 'hooks', 'pre-commit.js')], {
      cwd: tmpGitDir,
      stdio: 'pipe'
    });
    caseBBlocked = false;
  } catch {
    caseBBlocked = true;
  }

  if (caseAPassed && caseBBlocked) {
    logPass('Regression 6.2: pre-commit.js mounted in .ai/hooks safely permits <set-in-secrets> placeholders and blocks live credentials.');
  } else {
    logFail('Regression 6.2: pre-commit.js failed placeholder/live credential discrimination', `caseAPassed=${caseAPassed}, caseBBlocked=${caseBBlocked}`);
  }
} catch (err) {
  logFail('Regression 6.2 failed testing pre-commit.js in .ai/hooks', err.message);
} finally {
  try { fs.rmSync(tmpGitDir, { recursive: true, force: true }); } catch (_) {}
}

// 6.3 NET-S12 Method-Group Minimal API Bypass Fixture
const tmpMethodGroupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v394-s12-method-'));
try {
  fs.writeFileSync(path.join(tmpMethodGroupDir, 'App.sln'), 'Microsoft Visual Studio Solution File, Format Version 12.00\n');
  fs.mkdirSync(path.join(tmpMethodGroupDir, 'src', 'Web', 'Endpoints'), { recursive: true });

  fs.writeFileSync(path.join(tmpMethodGroupDir, 'src', 'Web', 'Endpoints', 'Departments.cs'), `
namespace Web.Endpoints;
public class DepartmentsGroup : IEndpointGroup
{
    public void Map(RouteGroupBuilder groupBuilder)
    {
        groupBuilder.MapPost(CreateDepartment);
    }
}
`);

  fs.writeFileSync(path.join(tmpMethodGroupDir, 'src', 'Web', 'Endpoints', 'Items.cs'), `
namespace Web.Endpoints;
public class ItemsGroup : IEndpointGroup
{
    public void Map(RouteGroupBuilder groupBuilder)
    {
        groupBuilder.MapGet(GetItems).RequireAuthorization();
        groupBuilder.MapDelete(DeleteItem, "{id}");
    }
}
`);

  const findings = auditDotNet(tmpMethodGroupDir);
  const s12Findings = findings.filter(f => f.id === 'NET-S12' && f.severity === 'HIGH');
  const targets = new Set(s12Findings.map(f => f.target));

  if (targets.has('DepartmentsGroup') && targets.has('ItemsGroup')) {
    logPass('Regression 6.3: NET-S12 successfully detects unguarded method-group endpoints and mixed route-authorization bypasses.');
  } else {
    logFail('Regression 6.3: NET-S12 missed method-group bypasses', Array.from(targets).join(', '));
  }
} catch (err) {
  logFail('Regression 6.3 failed testing NET-S12 method groups', err.message);
} finally {
  try { fs.rmSync(tmpMethodGroupDir, { recursive: true, force: true }); } catch (_) {}
}

// 6.4 Structured Single-File Export Integrity
const monolithicFiles = ['CLAUDE.md', '.windsurfrules', '.agrules', '.rules'];
const requiredHeaders = [
  '## 1. Architecture Mandate & Stop Gates',
  '## 2. Core Universal & QA Invariants',
  '## 3. Active Backend Rules Summary',
  '## 4. Active Frontend Rules Summary',
  '## 5. DevOps, OpenAPI & BCAS Workflow Index'
];

let allMonolithValid = true;
for (const mFile of monolithicFiles) {
  const mPath = path.join(REPO_ROOT, mFile);
  if (!fs.existsSync(mPath)) {
    allMonolithValid = false;
    logFail(`Regression 6.4: Monolithic export file missing: ${mFile}`);
    continue;
  }
  const stat = fs.statSync(mPath);
  if (stat.size >= 22000) {
    allMonolithValid = false;
    logFail(`Regression 6.4: ${mFile} exceeds 22,000 bytes: ${stat.size} bytes`);
  }
  const content = fs.readFileSync(mPath, 'utf8');
  for (const h of requiredHeaders) {
    if (!content.includes(h)) {
      allMonolithValid = false;
      logFail(`Regression 6.4: ${mFile} missing section header: ${h}`);
    }
  }
}

if (allMonolithValid) {
  logPass('Regression 6.4: CLAUDE.md, .windsurfrules, .agrules, and .rules are strictly < 22,000 bytes and contain all 5 complete section headers.');
}

// ----------------------------------------------------------------------
// CHECK 7: .NET 10 Minimal API + Dynamic ERD + Literal ENG-04 Expansion
// ----------------------------------------------------------------------
console.log('\n\x1b[36m[CHECK 7/7] Verifying .NET 10 Minimal API OpenAPI, Dynamic ERD & Literal ENG-04 Expansion...\x1b[0m');
const tmpDotNetPipeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'id-dotnet-pipe-'));
try {
  fs.mkdirSync(path.join(tmpDotNetPipeDir, '.ai'), { recursive: true });
  fs.mkdirSync(path.join(tmpDotNetPipeDir, 'src', 'Domain', 'Entities'), { recursive: true });
  fs.mkdirSync(path.join(tmpDotNetPipeDir, 'src', 'Infrastructure', 'Data', 'Configurations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDotNetPipeDir, 'src', 'Application', 'CatalogAssets'), { recursive: true });
  fs.mkdirSync(path.join(tmpDotNetPipeDir, 'src', 'Web', 'Endpoints'), { recursive: true });
  fs.mkdirSync(path.join(tmpDotNetPipeDir, 'docs', 'project-context-hub', '00-project-core'), { recursive: true });
  fs.mkdirSync(path.join(tmpDotNetPipeDir, 'docs', 'project-context-hub', '01-roadmap-and-pm'), { recursive: true });
  fs.mkdirSync(path.join(tmpDotNetPipeDir, 'docs', 'project-context-hub', '02-sprints', 'S1'), { recursive: true });

  fs.writeFileSync(path.join(tmpDotNetPipeDir, '.ai', 'stack.json'), JSON.stringify({
    name: 'VerifyDotNetEA',
    version: '1.0.0',
    mobile_app: false,
    stacks: {
      backend: { dotnet: true },
      frontend: { vue: false, react: false },
      api_docs: { json_openapi: true, postman: true },
      client_sdk: { typescript: false, dart: false }
    }
  }, null, 2));

  fs.writeFileSync(path.join(tmpDotNetPipeDir, 'src', 'Domain', 'Entities', 'CatalogAsset.cs'), `
namespace Domain.Entities;
public class CatalogAsset
{
    public int Id { get; set; }
    public Guid TenantUuid { get; set; }
    public string AssetCode { get; set; } = string.Empty;
    public IList<CatalogAttribute> Attributes { get; set; } = new List<CatalogAttribute>();
}
public class CatalogAttribute
{
    public int Id { get; set; }
    public int CatalogAssetId { get; set; }
    public CatalogAsset CatalogAsset { get; set; } = null!;
    public string AttributeKey { get; set; } = string.Empty;
}
`);

  fs.writeFileSync(path.join(tmpDotNetPipeDir, 'src', 'Infrastructure', 'Data', 'Configurations', 'CatalogAssetConfiguration.cs'), `
namespace Infrastructure.Data.Configurations;
public class CatalogAssetConfiguration : IEntityTypeConfiguration<CatalogAsset>
{
    public void Configure(EntityTypeBuilder<CatalogAsset> builder)
    {
        builder.ToTable("CatalogAssets");
    }
}
public class CatalogAttributeConfiguration : IEntityTypeConfiguration<CatalogAttribute>
{
    public void Configure(EntityTypeBuilder<CatalogAttribute> builder)
    {
        builder.ToTable("CatalogAttributes");
        builder.HasOne<CatalogAsset>().WithMany().HasForeignKey(x => x.CatalogAssetId);
    }
}
`);

  fs.writeFileSync(path.join(tmpDotNetPipeDir, 'src', 'Application', 'CatalogAssets', 'CreateCatalogAssetCommand.cs'), `
namespace Application.CatalogAssets;
[Authorize]
public record CreateCatalogAssetCommand(string AssetCode, Guid TenantUuid, bool IsActive) : IRequest<int>;
`);

  fs.writeFileSync(path.join(tmpDotNetPipeDir, 'src', 'Web', 'Endpoints', 'CatalogAssets.cs'), `
namespace Web.Endpoints;
public class CatalogAssets : IEndpointGroup
{
    public static string? RoutePrefix => "/api/catalog-assets";
    public void Map(RouteGroupBuilder groupBuilder)
    {
        groupBuilder.RequireAuthorization();
        groupBuilder.MapGet(GetAssets, "");
        groupBuilder.MapPost(CreateAsset, "");
    }
    public Task<IResult> GetAssets(ISender sender) => Task.FromResult(Results.Ok());
    public Task<IResult> CreateAsset(ISender sender, CreateCatalogAssetCommand command) => Task.FromResult(Results.Ok(1));
}
`);

  const hubRoot = path.join(tmpDotNetPipeDir, 'docs', 'project-context-hub');
  fs.writeFileSync(path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'), '# Project Context\n| Field | Value |\n|---|---|\n| **Project Code** | `TST` |\n| **Semantic Version** | `1.0.0` |\n');
  fs.writeFileSync(path.join(hubRoot, '00-project-core', 'GLOSSARY_AND_ENUMS.md'), '# Glossary\n| Enum ID | Values |\n|---|---|\n| `ENUM-ASSET-STATUS` | `ACTIVE`, `DRAFT` |\n');
  fs.writeFileSync(path.join(hubRoot, '00-project-core', 'SEED_DEFAULTS_CATALOG.md'), '# Seeds\n| Seed ID | Value |\n|---|---|\n| `SEED-CAT-PAGE-SIZE` | `25` |\n');
  fs.writeFileSync(path.join(hubRoot, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md'), '# Sprint Plan\n| Feature ID | Feature | Sprint / Wave | Archetype | Gate A |\n|---|---|---|---|---|\n| `FEATURE-TST-S1-F01` | Catalog Assets | S1 / Wave 1 | `MUTATION_WORKFLOW` | `READY_FOR_DEV` |\n');
  fs.writeFileSync(path.join(hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md'), '# Backlog\n');

  const rawFeature = `# FEATURE-TST-S1-F01: Catalog Assets Registry

| Field | Value |
| :--- | :--- |
| **Feature ID** | \`FEATURE-TST-S1-F01\` |
| **Sprint / Wave** | \`S1 / Wave 1\` |
| **Archetype** | \`MUTATION_WORKFLOW\` |
| **Gate A Status (BA)** | \`READY_FOR_DEV\` |

---

## 1. Purpose & Scope
Manage enterprise \`CatalogAsset\` records via \`CatalogAssets.cs\` (\`POST /api/catalog-assets\`).

## 2. UI Element Inventory
| Element ID | Type | Label (EN) | Behavior |
|---|---|---|---|
| \`EL-CAT-01\` | Table | Asset Grid | Displays paginated \`CatalogAsset\` rows |
| \`EL-CAT-02\` | Button | Create Asset | Submits \`CreateCatalogAssetCommand\` |

## 3. UI Lifecycle States
| State | Trigger | Behavior |
|---|---|---|
| \`Loading\` | Initial fetch | Render skeleton loader |
| \`Empty\` | Zero rows | Render empty card |
| \`Single-Item\` | 1 row | Render single row |
| \`Populated\` | >=2 rows | Render full paginated grid |
| \`Disabled\` | Read-only role | Disable create button |
| \`Error\` | HTTP 500 | Render retry banner |

## 4. Domain Rules
- Reuse \`ENUM-ASSET-STATUS\` and \`SEED-CAT-PAGE-SIZE\`.

## 5. Permissions
- Policy \`CanManageAssets\`.

## 6. API Contract & Data Flow
| Verb | Endpoint | Request |
|---|---|---|
| \`GET\` | \`/api/catalog-assets\` | Query list |
| \`POST\` | \`/api/catalog-assets\` | \`CreateCatalogAssetCommand\` |

## 7. Localization Copy Keys
| Key | AR | EN |
|---|---|---|
| \`catalog.title\` | سجل الأصول | Assets Catalog |

## 8. Acceptance Criteria
- Given valid command, \`POST /api/catalog-assets\` persists \`CatalogAsset\`.

## 9. Open Decisions & Escalations
### 9.1 Traceability
- Complete.

### 9.2 Open Decisions
| ID | Question | Status |
|---|---|---|
| - | None | \`RESOLVED\` |

---

## 11. Gate B — Engineering Readiness Appendix (\`ENG-01..ENG-10\`)

| Field | Value |
| :--- | :--- |
| **Gate B Status** | \`READY_TO_CODE\` |
| **Verified \`feature_srd\`** | \`PENDING_HASH\` |

| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| \`ENG-01\` | Model/Table Binding | \`src/Domain/Entities/CatalogAsset.cs -> CatalogAssets\` | \`PASS\` |
| \`ENG-02\` | API Endpoint & Envelope Contract | \`GET /api/catalog-assets; POST /api/catalog-assets\` | \`PASS\` |
| \`ENG-03\` | SEED-* & ENUM-* Codebase Mapping | \`SEED-CAT-PAGE-SIZE, ENUM-ASSET-STATUS\` | \`PASS\` |
| \`ENG-04\` | Visual Screen §2 & Lifecycle §3 data-testid Plan | \`catalog-assets (data-testid="catalog-assets-{component}-{element}")\` | \`PASS\` |
| \`ENG-05\` | ESR Index & N+1 Prevention | \`Composite index + AsNoTracking projection\` | \`PASS\` |
| \`ENG-06\` | Tenant/IDOR & RBAC Guard | \`AuthorizationBehaviour + FluentValidation\` | \`PASS\` |
| \`ENG-07\` | IPDPL/PII Masking | \`Zero Tier-1 PII columns; structured log scrubber\` | \`PASS\` |
| \`ENG-08\` | Archetype Concurrency/Idempotency Strategy | \`Archetype 5B MUTATION_WORKFLOW + X-Idempotency-Key\` | \`PASS\` |
| \`ENG-09\` | Automated Test File Binding | \`tests/Application.FunctionalTests/CatalogAssets/Tests.cs\` | \`PASS\` |
| \`ENG-10\` | Mobile/QA Handoff Impact | \`QA & API Contract Handoff Pack + Postman v2.1\` | \`PASS\` |
`;

  const preSrd = computeFeatureSrd(rawFeature);
  const featureWithSrd = rawFeature.replace('`PENDING_HASH`', `\`${preSrd}\``);
  const featurePath = path.join(hubRoot, '02-sprints', 'S1', 'FEATURE-TST-S1-F01.md');
  fs.writeFileSync(featurePath, featureWithSrd, 'utf8');
  fs.writeFileSync(path.join(hubRoot, '02-sprints', 'S1', 'SPRINT_S1_MANIFEST.md'), `# S1 Manifest\n| Feature ID | File | Archetype | Gate A | Gate B | \`feature_srd\` |\n|---|---|---|---|---|---|\n| \`FEATURE-TST-S1-F01\` | \`FEATURE-TST-S1-F01.md\` | \`MUTATION_WORKFLOW\` | \`READY_FOR_DEV\` | \`READY_TO_CODE\` | \`${preSrd}\` |\n`, 'utf8');

  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'build-codebase-map.js'), '.'], { cwd: tmpDotNetPipeDir, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'reverse-architect.js'), '--export-ba-intake=docs/business-context/intake', '--mode=prototype-code'], { cwd: tmpDotNetPipeDir, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'build-unified-openapi.js')], { cwd: tmpDotNetPipeDir, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'build-postman.js'), '--force'], { cwd: tmpDotNetPipeDir, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'eng-gate.js'), '--sprint=S1', '--auto-bind-bundle=docs/business-context/intake/REVERSE_INTAKE_BUNDLE.json', '--populate-hints'], { cwd: tmpDotNetPipeDir, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'eng-gate.js'), '--sprint=S1', '--verify-only'], { cwd: tmpDotNetPipeDir, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'sprint-plan.js'), '--sprint=S1'], { cwd: tmpDotNetPipeDir, stdio: 'pipe' });

  const mapPath = [
    path.join(tmpDotNetPipeDir, '.ai', 'context', 'CODEBASE_MAP.md'),
    path.join(tmpDotNetPipeDir, 'context', 'CODEBASE_MAP.md')
  ].find(p => fs.existsSync(p));
  const mapMd = mapPath ? fs.readFileSync(mapPath, 'utf8') : '';
  const modOa = JSON.parse(fs.readFileSync(path.join(tmpDotNetPipeDir, 'docs', 'modules', 'catalog-assets.json'), 'utf8'));
  const unifiedOa = JSON.parse(fs.readFileSync(path.join(tmpDotNetPipeDir, 'docs', 'openapi.json'), 'utf8'));
  const postmanRaw = fs.readFileSync(path.join(tmpDotNetPipeDir, 'docs', 'postman', 'catalog-assets.postman_collection.json'), 'utf8');
  const archMd = fs.readFileSync(path.join(tmpDotNetPipeDir, 'docs', 'architecture', 'LIVE_SYSTEM_ARCHITECTURE.md'), 'utf8');
  const featureAfter = fs.readFileSync(featurePath, 'utf8');
  const postSrd = computeFeatureSrd(featureAfter);
  const sprintPlanMd = fs.readFileSync(path.join(tmpDotNetPipeDir, 'docs', 'business-context', 'SPRINT_EXECUTION_PLAN.md'), 'utf8');

  const check7Errors = [];
  if (!mapMd.includes('## API Endpoints (Minimal APIs / Controllers)') || !mapMd.includes('/api/catalog-assets')) {
    check7Errors.push('CODEBASE_MAP missing Minimal API /api/catalog-assets table row');
  }
  if (modOa.openapi !== '3.0.0' || !modOa.paths?.['/api/catalog-assets']?.post || !modOa.components?.schemas?.CreateCatalogAssetCommand?.properties?.assetCode) {
    check7Errors.push('Modular OpenAPI catalog-assets.json missing 3.0.0 / POST /api/catalog-assets / CreateCatalogAssetCommand schema');
  }
  if (unifiedOa.openapi !== '3.0.0' || !unifiedOa.paths?.['/api/catalog-assets']?.get || unifiedOa.servers?.[0]?.url !== 'http://localhost:5000') {
    check7Errors.push('Unified docs/openapi.json missing /api/catalog-assets or localhost:5000 server');
  }
  if (!postmanRaw.includes('http://localhost:5000') || postmanRaw.includes('njoom.innoeg.com') || fs.existsSync(path.join(tmpDotNetPipeDir, 'docs', 'postman', 'cycles'))) {
    check7Errors.push('Postman output leaked njoom.innoeg.com or cycles/CYCLE_*');
  }
  if (!archMd.includes('CatalogAsset') || !archMd.includes('CatalogAttribute') || /\bTENANTS\b|\bMEMBERS\b|\bINVOICES\b|MobileApp|Flutter/.test(archMd)) {
    check7Errors.push('LIVE_SYSTEM_ARCHITECTURE.md failed dynamic ERD or leaked TENANTS/MEMBERS/MobileApp');
  }
  if (!featureAfter.includes('el-cat-01') || !featureAfter.includes('el-cat-02') || !featureAfter.includes('state-loading') || !featureAfter.includes('state-error') || featureAfter.includes('{component}') || postSrd !== preSrd) {
    check7Errors.push('ENG-04 literal expansion missing EL-*/states, retained {component}, or mutated feature_srd');
  }
  if (!sprintPlanMd.includes('`2 routes`')) {
    check7Errors.push(`SPRINT_EXECUTION_PLAN expected \`2 routes\` mapped for FEATURE-TST-S1-F01`);
  }

  if (check7Errors.length === 0) {
    logPass('Regression 7.1: .NET 10 Minimal API -> OpenAPI 3.0 -> Postman localhost:5000 -> Dynamic ERD -> Literal ENG-04 -> Sprint DAG verified end-to-end.');
  } else {
    logFail('Regression 7.1: .NET 10 end-to-end pipeline verification failed', check7Errors.join(' | '));
  }
} catch (err) {
  logFail('Regression 7.1 threw error during .NET 10 pipeline test', err.stderr ? `${err.message} :: ${err.stderr.toString()}` : err.message);
} finally {
  try { fs.rmSync(tmpDotNetPipeDir, { recursive: true, force: true }); } catch (_) {}
}

// ----------------------------------------------------------------------
// FINAL VERDICT
// ----------------------------------------------------------------------
console.log('\n------------------------------------------------------------');
console.log(`TOTAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
console.log('------------------------------------------------------------');

if (failedChecks === 0) {
  console.log('\x1b[32m\x1b[1m✨ ALL V3.9.4 AUDIT CHECKS PASSED PERFECTLY (CLEARANCE GRANTED)\x1b[0m\n');
  process.exit(0);
} else {
  console.error('\x1b[31m\x1b[1m🚨 AUDIT VERIFICATION FAILED - HALTING DEPLOYMENT\x1b[0m\n');
  process.exit(1);
}
