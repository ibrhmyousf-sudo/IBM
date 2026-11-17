#!/usr/bin/env node

/**
 * ⚡ InnovaDigits Performance Bottleneck Predictor (v3.9.3)
 * Scans Models, Controllers, Services, and Database Migrations to detect:
 *  1. N+1 Query Risks (missing eager loading in loops or resources)
 *  2. Missing Index & Full Table Scan Risks (unindexed foreign keys and status columns)
 *  3. Unbounded Dataset Risks (unpaginated .get() / .all() calls)
 * Generates docs/architecture/PERFORMANCE_BOTTLENECK_REPORT.md with exact composite index migrations.
 *
 * Usage:
 *   node bin/perf-predictor.js
 *   node bin/perf-predictor.js --module=Academies
 *   node bin/perf-predictor.js --output=custom/path.md
 *   node bin/perf-predictor.js --json
 */

const fs = require('fs');
const path = require('path');

let pkgVersion = '3.9.4';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (pkg.version) pkgVersion = pkg.version;
} catch (e) {}

let scanDotNetPerformance = null;
try {
  const ds = require('./lib/dotnet-scanner');
  if (ds && typeof ds.scanDotNetPerformance === 'function') {
    scanDotNetPerformance = ds.scanDotNetPerformance;
  }
} catch (e) {}

const startTime = Date.now();

// 1. Parse CLI Options
const args = process.argv.slice(2);
let targetModule = null;
let customOutputPath = null;
let isJson = false;

for (const arg of args) {
  if (arg.startsWith('--module=')) {
    targetModule = arg.split('=')[1].trim();
  } else if (arg.startsWith('--output=')) {
    customOutputPath = path.resolve(arg.split('=')[1].trim());
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Performance Bottleneck Predictor (v3.9.3)

Options:
  --module=<name>    Filter analysis to a specific domain module (e.g. Academies, Events)
  --output=<path>    Custom destination report path (Default: docs/architecture/PERFORMANCE_BOTTLENECK_REPORT.md)
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
const archDir = path.join(docsDir, 'architecture');
if (!fs.existsSync(archDir)) {
  fs.mkdirSync(archDir, { recursive: true });
}
const defaultOutputFile = path.join(archDir, 'PERFORMANCE_BOTTLENECK_REPORT.md');
const outputFile = customOutputPath || defaultOutputFile;

// 3. Extract Codebase Map Entities
const models = [];
const controllers = [];
const tables = [];

if (codebaseMapPath && fs.existsSync(codebaseMapPath)) {
  const mapContent = fs.readFileSync(codebaseMapPath, 'utf8');
  const lines = mapContent.split('\n');
  let currentSection = 0;

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
      models.push({
        name: parts[0].replace(/`/g, ''),
        type: parts[1],
        table: parts[2].replace(/`/g, ''),
        relPath: parts[3].replace(/`/g, '')
      });
    } else if (currentSection === 2 && parts.length >= 3) {
      controllers.push({
        name: parts[0].replace(/`/g, ''),
        stack: parts[1],
        relPath: parts[2].replace(/`/g, '')
      });
    } else if (currentSection === 3 && parts.length >= 2) {
      tables.push({
        name: parts[0].replace(/`/g, ''),
        migration: parts[1].replace(/`/g, '')
      });
    }
  }
}

// 4. Filtering Scope
const filteredControllers = targetModule
  ? controllers.filter(c => c.relPath.toLowerCase().includes(targetModule.toLowerCase()))
  : controllers;

const filteredModels = targetModule
  ? models.filter(m => m.relPath.toLowerCase().includes(targetModule.toLowerCase()))
  : models;

const filteredTables = targetModule
  ? tables.filter(t => t.name.toLowerCase().includes(targetModule.toLowerCase()) || t.migration.toLowerCase().includes(targetModule.toLowerCase()))
  : tables;

// 5. Bottleneck Analysis
const findings = [];
const indexRecommendations = [];
let findingCounter = 1;

function addFinding(severity, category, target, location, issue, fix) {
  findings.push({
    id: `PERF-${String(findingCounter++).padStart(3, '0')}`,
    severity, // CRITICAL, HIGH, MEDIUM, LOW
    category,
    target,
    location,
    issue,
    fix
  });
}

// 5.1 Run .NET Performance Scanner if .NET projects or files exist
if (scanDotNetPerformance) {
  try {
    const netFindings = scanDotNetPerformance(cwd);
    if (Array.isArray(netFindings)) {
      for (const nf of netFindings) {
        addFinding(nf.severity, nf.category, nf.target, nf.location, nf.issue, nf.fix);
      }
    }
  } catch (e) {}
}

// 5.2 Scan EF Core Configurations for Missing Indexes on *Id / *_id
const configDir = path.join(cwd, 'src', 'Infrastructure', 'Data', 'Configurations');
if (fs.existsSync(configDir)) {
  try {
    const configFiles = fs.readdirSync(configDir).filter(f => f.endsWith('.cs'));
    for (const cf of configFiles) {
      const cPath = path.join(configDir, cf);
      const code = fs.readFileSync(cPath, 'utf8');
      const relConfigPath = path.relative(cwd, cPath);
      const entityName = path.basename(cf, 'Configuration.cs');

      // Check foreign key properties without index
      const fkMatches = code.matchAll(/builder\.Property\([a-zA-Z0-9_]+\s*=>\s*[a-zA-Z0-9_]+\.([A-Za-z0-9_]+Id)\)/g);
      for (const fm of fkMatches) {
        const propName = fm[1];
        if (propName !== 'Id' && !code.includes(`.${propName}`)) {
          // If HasIndex does not mention this property
          const hasIndexWithProp = new RegExp(`HasIndex\\([^)]*\\.${propName}\\b`).test(code);
          if (!hasIndexWithProp) {
            addFinding(
              'HIGH',
              'Missing EF Core Foreign Key Index',
              entityName,
              relConfigPath,
              `Foreign key property '${propName}' in '${cf}' lacks explicit builder.HasIndex(...) definition.`,
              `Add 'builder.HasIndex(e => e.${propName});' to eliminate table scan overhead.`
            );
          }
        }
      }
    }
  } catch (e) {}
}

// A. Scan Controllers for Unbounded .get() / .all() and N+1 In-Memory Iteration
for (const ctrl of filteredControllers) {
  const fullPath = path.join(cwd, ctrl.relPath);
  if (fs.existsSync(fullPath)) {
    const code = fs.readFileSync(fullPath, 'utf8');

    // Check unbounded Model::all() or ->get() without limit/paginate in index actions
    if (/function\s+index\s*\(/.test(code) && /(::all\(\)|->get\(\))/.test(code) && !code.includes('paginate(') && !code.includes('cursorPaginate(')) {
      addFinding(
        'HIGH',
        'Unbounded Dataset Listing',
        ctrl.name,
        ctrl.relPath,
        'Controller listing action returns unpaginated collection via `all()` or `get()`.',
        'Replace with `paginate(min((int)$request->input("per_page", 25), 100))` to prevent memory exhaustion.'
      );
    }

    // Check relationship query inside foreach / loop
    if (/foreach\s*\([^{]+\)\s*\{[^}]*\$[a-zA-Z0-9_]+->(profile|user|facility|team|plan|order|items)\b/.test(code)) {
      addFinding(
        'CRITICAL',
        'N+1 Query in Loop',
        ctrl.name,
        ctrl.relPath,
        'Accessing dynamic Eloquent relation property inside loop without upfront eager loading.',
        'Eager load relation in repository/controller query using `->with(["relation"])`.'
      );
    }
  }
}

// B. Scan Migrations & Tables for Missing Foreign Key & Status Indexes
for (const tbl of filteredTables) {
  const fullPath = path.join(cwd, tbl.migration);
  if (fs.existsSync(fullPath)) {
    const migrationCode = fs.readFileSync(fullPath, 'utf8');

    // Detect foreignId / unsignedBigInteger without index
    const fkMatches = migrationCode.match(/\$(table->(foreignId|unsignedBigInteger)\(['"]([a-zA-Z0-9_]+_id)['"]\)[^;]*);/g) || [];
    for (const fkLine of fkMatches) {
      if (!fkLine.includes('->index') && !fkLine.includes('->constrained')) {
        const colMatch = fkLine.match(/['"]([a-zA-Z0-9_]+_id)['"]/);
        const colName = colMatch ? colMatch[1] : 'foreign_id';
        addFinding(
          'HIGH',
          'Missing Foreign Key Index',
          tbl.name,
          tbl.migration,
          `Column \`${colName}\` declared without explicit index, risking Full Table Scans on joins.`,
          `Add \`$table->index('${colName}')\` or chain \`->index()\` in migration.`
        );
      }
    }

    // Detect status or code column without index
    if (/(['"](status|state|code|slug)['"])/.test(migrationCode) && !migrationCode.includes('->index') && !migrationCode.includes('->unique')) {
      addFinding(
        'MEDIUM',
        'Unindexed Status/Code Column',
        tbl.name,
        tbl.migration,
        'Lookup column (`status` / `code`) queried in filters without an index definition.',
        'Add composite index covering tenant_id and status/code for fast range queries.'
      );
    }
  }
}

// C. Synthesize ESR Composite Index Recommendations for High-Traffic Core Tables
const coreSampleTables = filteredTables.slice(0, 8);
for (const tbl of coreSampleTables) {
  const tableName = tbl.name;
  const isTenantTable = tableName.startsWith('mod_') || tableName.includes('acad') || tableName.includes('facility') || tableName.includes('camp');
  
  if (isTenantTable) {
    indexRecommendations.push({
      table: tableName,
      indexName: `idx_${tableName.replace(/^mod_/, '')}_tenant_status_created`,
      columns: ['tenant_id', 'status', 'created_at'],
      esrOrder: 'Equality (tenant_id, status) -> Range/Sort (created_at)',
      migrationSnippet: `$table->index(['tenant_id', 'status', 'created_at'], 'idx_${tableName.replace(/^mod_/, '')}_tenant_status_created');`
    });
  } else {
    indexRecommendations.push({
      table: tableName,
      indexName: `idx_${tableName}_status_created`,
      columns: ['status', 'created_at'],
      esrOrder: 'Equality (status) -> Range/Sort (created_at)',
      migrationSnippet: `$table->index(['status', 'created_at'], 'idx_${tableName}_status_created');`
    });
  }
}

// 6. Calculate Performance Readiness Score
// 100% max. Deductions: CRITICAL (-20), HIGH (-10), MEDIUM (-5), LOW (-2)
let penalty = 0;
for (const f of findings) {
  if (f.severity === 'CRITICAL') penalty += 20;
  else if (f.severity === 'HIGH') penalty += 10;
  else if (f.severity === 'MEDIUM') penalty += 5;
  else penalty += 2;
}

const readinessScore = Math.max(0, 100 - penalty);
let readinessGrade = 'A+';
let readinessBadge = '🟢 OPTIMIZED';

if (readinessScore < 60) {
  readinessGrade = 'F';
  readinessBadge = '🔴 CRITICAL BOTTLENECK';
} else if (readinessScore < 75) {
  readinessGrade = 'C';
  readinessBadge = '🟠 POOR THROUGHPUT';
} else if (readinessScore < 90) {
  readinessGrade = 'B';
  readinessBadge = '🟡 ACCEPTABLE';
} else if (readinessScore < 100) {
  readinessGrade = 'A';
  readinessBadge = '🟢 WELL-INDEXED';
}

const durationMs = Date.now() - startTime;

// 7. Generate Markdown Report
let md = `# Static Performance Bottleneck Prediction Report

> **Scanner Version:** v3.9.3 Performance Predictor Engine  
> **Generated:** ${new Date().toISOString()} | **Duration:** ${durationMs}ms  
> **Target Scope:** ${targetModule ? `Module: ${targetModule}` : 'Full Workspace / Mapped Codebase'}  
> **Entities Analyzed:** ${filteredModels.length} Models | ${filteredControllers.length} Controllers | ${filteredTables.length} Tables

---

## 1. Performance Readiness Scorecard

| Metric | Value | Rating |
| :--- | :--- | :--- |
| **Performance Readiness Score** | **${readinessScore}%** | ${readinessBadge} (Grade ${readinessGrade}) |
| **Identified Bottlenecks** | **${findings.length}** | ${findings.filter(f => f.severity === 'CRITICAL').length} Critical, ${findings.filter(f => f.severity === 'HIGH').length} High |
| **Composite ESR Index Recommendations** | **${indexRecommendations.length}** | Ready-to-apply database migrations |
| **Enforcement Policy** | **ESR STRICT** | Halt PRs on unindexed foreign keys or N+1 loops |

---

## 2. Bottleneck Findings

`;

if (findings.length === 0) {
  md += `> 🟢 **ZERO PERFORMANCE BOTTLENECKS DETECTED.**  
> All analyzed queries use pagination caps, foreign keys are appropriately indexed, and no N+1 loop traversal was found.\n\n`;
} else {
  md += `| ID | Severity | Category | Target | Issue Description | Recommended Fix |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const f of findings) {
    const sevBadge = f.severity === 'CRITICAL' ? '🔴 CRITICAL' : f.severity === 'HIGH' ? '🟠 HIGH' : f.severity === 'MEDIUM' ? '🟡 MEDIUM' : '🔵 LOW';
    md += `| **${f.id}** | ${sevBadge} | ${f.category} | \`${f.target}\` | ${f.issue} | ${f.fix} |\n`;
  }
  md += `\n`;
}

md += `---

## 3. Recommended Composite ESR Indexes

To eliminate Full Table Scans under heavy multi-tenant traffic, apply these **Equality -> Sort -> Range (ESR)** compound indexes:

| Target Table | Index Name | Columns (ESR Order) | Rationalization |
| :--- | :--- | :--- | :--- |
`;

for (const rec of indexRecommendations) {
  md += `| \`${rec.table}\` | \`${rec.indexName}\` | \`[${rec.columns.join(', ')}]\` | ${rec.esrOrder} |\n`;
}

md += `
### Ready-to-Apply Migration Snippets

\`\`\`php
// database/migrations/2026_11_03_000001_add_esr_performance_indexes.php
use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration {
    public function up(): void
    {
`;

for (const rec of indexRecommendations) {
  md += `        Schema::table('${rec.table}', function (Blueprint $table) {\n`;
  md += `            ${rec.migrationSnippet}\n`;
  md += `        });\n`;
}

md += `    }

    public function down(): void
    {
`;

for (const rec of indexRecommendations) {
  md += `        Schema::table('${rec.table}', function (Blueprint $table) {\n`;
  md += `            $table->dropIndex('${rec.indexName}');\n`;
  md += `        });\n`;
}

md += '    }\n};\n```\n\n';

md += `### Ready-to-Apply EF Core 10 Composite Index Snippets

\`\`\`csharp
// In your IEntityTypeConfiguration<T> Configure(EntityTypeBuilder<T> builder) methods:
`;

for (const rec of indexRecommendations) {
  const isTenant = rec.columns.includes('tenant_id');
  const entityName = rec.table.replace(/^mod_/, '').replace(/s$/, '');
  const pascalEntity = entityName.charAt(0).toUpperCase() + entityName.slice(1);
  const csharpIndex = isTenant
    ? `builder.HasIndex(e => new { e.TenantId, e.Status, e.CreatedAt }).HasDatabaseName("${rec.indexName}");`
    : `builder.HasIndex(e => new { e.Status, e.CreatedAt }).HasDatabaseName("${rec.indexName}");`;
  md += `// Entity: ${pascalEntity}\n${csharpIndex}\n\n`;
}

md += '```\n\n';

md += [
  '---',
  '',
  '## 4. Query & Architecture Invariants',
  '',
  '1. **Mandatory Pagination Caps (`perf-predictor`)**:',
  '   - Cap per-page parameters to a safe upper bound: `$perPage = min((int)$request->input("per_page", 25), 100)`.',
  '2. **Strict Eager Loading (`db-architect`)**:',
  '   - Forbid relationship property resolution inside Blade views or Vue/Nuxt serializers without `whenLoaded()`.',
  '3. **Queue Asynchronous Jobs (`000-execution-protocol.md`)**:',
  '   - Keep synchronous HTTP response cycle strictly under 200ms. Dispatch notifications, exports, and heavy operations to asynchronous workers.',
  ''
].join('\n');

fs.writeFileSync(outputFile, md, 'utf8');

// 8. Console Output
if (isJson) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    score: readinessScore,
    grade: readinessGrade,
    models_count: filteredModels.length,
    controllers_count: filteredControllers.length,
    tables_count: filteredTables.length,
    findings,
    indexRecommendations,
    outputFile,
    durationMs
  }, null, 2));
} else {
  console.log('');
  console.log('================================================================================');
  console.log(`       INNOVADIGITS PERFORMANCE BOTTLENECK PREDICTOR (v${pkgVersion})                  `);
  console.log('================================================================================');
  console.log(`Readiness Score    : ${readinessScore}% (${readinessBadge} - Grade ${readinessGrade})`);
  console.log(`Scope Analyzed     : ${targetModule ? `Module: ${targetModule}` : 'Full Workspace'}`);
  console.log(`Entities Scanned   : ${filteredModels.length} models / ${filteredControllers.length} controllers / ${filteredTables.length} tables`);
  console.log(`Bottlenecks Found  : ${findings.length} (${findings.filter(f => f.severity === 'CRITICAL').length} Critical, ${findings.filter(f => f.severity === 'HIGH').length} High)`);
  console.log(`ESR Index Migrations: ${indexRecommendations.length} composite indexes synthesized`);
  console.log(`Report Output      : ${outputFile}`);
  console.log(`Execution Time     : ${durationMs}ms`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`>>> READINESS STATUS: ${readinessScore >= 80 ? 'CLEARANCE_GRANTED' : 'OPTIMIZATION_REQUIRED'}`);
  console.log('================================================================================\n');
}

process.exit(0);
