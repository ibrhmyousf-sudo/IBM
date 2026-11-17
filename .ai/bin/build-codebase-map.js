#!/usr/bin/env node

/**
 * 🗺️ Deterministic Codebase Map Generator (v3.9.4 Universal Multi-Stack Edition)
 * Fast, zero-dependency codebase scanner for surgical AI context loading.
 * Scans Models, Controllers, UI Templates, Migrations, Contracts, and Modules across:
 * Laravel, CakePHP, PHP Native, .NET 10 (Clean Architecture / Minimal APIs / EF Core 10),
 * Vue/Nuxt, React (TanStack), Angular, and Blade.
 */

const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set([
  'vendor',
  'node_modules',
  '.git',
  'storage',
  '.ai',
  'dist',
  'build',
  '.idea',
  '.vscode',
  '.cache',
  'coverage',
  'bin',
  'obj'
]);

function hasProjectMarkers(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  if (fs.existsSync(path.join(dir, 'app')) || fs.existsSync(path.join(dir, 'packages')) || fs.existsSync(path.join(dir, 'src'))) {
    return true;
  }
  try {
    const entries = fs.readdirSync(dir);
    return entries.some(f => /\.(sln|slnx|csproj)$/i.test(f));
  } catch {
    return false;
  }
}

// Resolve target project root & output path
let projectRoot = process.argv[2] || process.cwd();
let outputPath = process.argv[3];

// If running inside .ai, check parent project root
if (path.basename(projectRoot) === '.ai') {
  projectRoot = path.resolve(projectRoot, '..');
} else if (!hasProjectMarkers(projectRoot)) {
  try {
    const parentDir = path.resolve(projectRoot, '..');
    if (hasProjectMarkers(parentDir)) {
      fs.accessSync(parentDir, fs.constants.R_OK);
      projectRoot = parentDir;
    }
  } catch {
    // Keep projectRoot as is if parent is not accessible
  }
}

if (!outputPath) {
  const aiDir = fs.existsSync(path.join(projectRoot, '.ai'))
    ? path.join(projectRoot, '.ai')
    : (path.basename(process.cwd()) === '.ai' ? process.cwd() : path.join(projectRoot, '.ai'));
  outputPath = path.join(aiDir, 'context', 'CODEBASE_MAP.md');
}

const startTime = Date.now();
const { scanCSharpFile, scanDotNetMinimalApis } = require('./lib/dotnet-scanner.js');
const csDbSets = [];   // { entity, set }
const csToTables = []; // { entity, table, file }

const results = {
  models: [],          // { name, table, type: 'Eloquent'|'CakePHP'|'EF Core Entity'|'Native', file }
  controllers: [],     // { name, stack, file }
  templates: [],       // { name, engine: 'Blade'|'CakePHP'|'Native'|'React'|'Angular'|'Vue', file }
  tables: [],          // { table, migration }
  contracts: [],       // { name, file }
  frontendModules: [], // { name, file }
  apiEndpoints: []     // { method, route, authPolicy, handler, requestDto, responseDto, sourceFile }
};
let sawDotNetFiles = false;

function walkDir(dir, fileCallback) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDir(fullPath, fileCallback);
    } else if (entry.isFile()) {
      fileCallback(fullPath);
    }
  }
}

// 1. Scan Repository Files
walkDir(projectRoot, (filePath) => {
  const relPath = path.relative(projectRoot, filePath);
  const normalized = relPath.replace(/\\/g, '/');

  // Skip test fixtures or build caches
  if (normalized.includes('tests/fixtures/') || normalized.includes('.nuxt/') || normalized.includes('.next/')) return;

  // --- A. PHP Files (.php, .ctp) ---
  if (filePath.endsWith('.php') || filePath.endsWith('.ctp')) {
    // A.1 Eloquent & CakePHP Models
    const isEloquentModel =
      normalized.startsWith('app/Models/') ||
      normalized.includes('/Models/') ||
      (normalized.startsWith('Modules/') && normalized.includes('/Models/')) ||
      (normalized.startsWith('packages/') && normalized.includes('/Models/'));

    const isCakeModel = normalized.includes('src/Model/Table/') && normalized.endsWith('Table.php');

    if (isEloquentModel) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const classMatch = content.match(/class\s+([A-Za-z0-9_]+)/);
        if (classMatch) {
          const className = classMatch[1];
          const tableMatch = content.match(/protected\s+\$table\s*=\s*['"]([A-Za-z0-9_]+)['"]/);
          const tableName = tableMatch ? tableMatch[1] : '(default/convention)';
          results.models.push({ name: className, table: tableName, type: 'Eloquent', file: normalized });
        }
      } catch {}
    } else if (isCakeModel) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const classMatch = content.match(/class\s+([A-Za-z0-9_]+Table)/);
        if (classMatch) {
          const className = classMatch[1];
          const tableMatch = content.match(/\$this->setTable\s*\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/);
          const tableName = tableMatch ? tableMatch[1] : className.replace(/Table$/, '').toLowerCase();
          results.models.push({ name: className, table: tableName, type: 'CakePHP Table', file: normalized });
        }
      } catch {}
    }

    // A.2 Controllers (Laravel, CakePHP, PHP Native)
    const isControllerPath =
      normalized.includes('/Controllers/') ||
      normalized.includes('/Controller/') ||
      normalized.endsWith('Controller.php');

    if (isControllerPath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const classMatch = content.match(/class\s+([A-Za-z0-9_]+Controller)/);
        if (classMatch) {
          let stack = 'Laravel';
          if (normalized.includes('src/Controller/')) stack = 'CakePHP';
          else if (!normalized.includes('app/') && !normalized.includes('packages/') && !normalized.includes('Modules/')) stack = 'PHP Native';
          results.controllers.push({ name: classMatch[1], stack, file: normalized });
        }
      } catch {}
    }

    // A.3 Blade Templates
    if (normalized.endsWith('.blade.php')) {
      const templateName = path.basename(normalized, '.blade.php');
      results.templates.push({ name: templateName, engine: 'Laravel Blade', file: normalized });
    }

    // A.4 CakePHP Templates
    else if (normalized.includes('templates/') || normalized.endsWith('.ctp')) {
      const ext = path.extname(normalized);
      const templateName = path.basename(normalized, ext);
      results.templates.push({ name: templateName, engine: 'CakePHP View', file: normalized });
    }

    // A.5 PHP Native Views
    else if (normalized.includes('/views/') || normalized.startsWith('views/')) {
      const templateName = path.basename(normalized, '.php');
      results.templates.push({ name: templateName, engine: 'PHP Native HTML', file: normalized });
    }

    // A.6 Database Migrations
    const isMigrationPath =
      normalized.includes('/migrations/') ||
      normalized.includes('/Migrations/') ||
      normalized.startsWith('database/migrations/');

    if (isMigrationPath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const schemaCreateRegex = /Schema::create\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g;
        let match;
        while ((match = schemaCreateRegex.exec(content)) !== null) {
          results.tables.push({ table: match[1], migration: normalized });
        }
      } catch {}
    }

    // A.7 Contracts & Interfaces
    const isContractPath =
      normalized.includes('/Contracts/') ||
      normalized.includes('/Interfaces/') ||
      normalized.startsWith('app/Contracts/');

    if (isContractPath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const interfaceMatch = content.match(/interface\s+([A-Za-z0-9_]+)/);
        if (interfaceMatch) {
          results.contracts.push({ name: interfaceMatch[1], file: normalized });
        }
      } catch {}
    }
  }

  // --- A2. .NET / C# (Clean Architecture, EF Core 10, Minimal APIs) ---
  else if (filePath.endsWith('.cs')) {
    sawDotNetFiles = true;
    try {
      const cs = scanCSharpFile(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''), normalized);
      cs.entities.forEach(n => results.models.push({ name: n, table: '(default/convention)', type: 'EF Core Entity', file: normalized }));
      cs.endpoints.forEach(n => results.controllers.push({ name: n, stack: 'ASP.NET Minimal API', file: normalized }));
      cs.controllers.forEach(n => results.controllers.push({ name: n, stack: 'ASP.NET MVC', file: normalized }));
      cs.contracts.forEach(n => results.contracts.push({ name: n, file: normalized }));
      cs.dbSets.forEach(d => csDbSets.push(d));
      cs.toTables.forEach(t => csToTables.push({ ...t, file: normalized }));
    } catch {}
  }

  // --- B. React Components (.tsx, .jsx) ---
  else if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    if (!normalized.includes('.test.') && !normalized.includes('.spec.')) {
      const ext = path.extname(normalized);
      const compName = path.basename(normalized, ext);
      results.templates.push({ name: compName, engine: 'React (TSX/JSX)', file: normalized });
    }
  }

  // --- C. Angular Components (.component.ts) ---
  else if (filePath.endsWith('.component.ts')) {
    const compName = path.basename(normalized, '.component.ts');
    results.templates.push({ name: compName, engine: 'Angular Component', file: normalized });
  }

  // --- D. Vue Components (.vue) ---
  else if (filePath.endsWith('.vue')) {
    const compName = path.basename(normalized, '.vue');
    results.templates.push({ name: compName, engine: 'Vue 3 / Nuxt', file: normalized });
  }
});

// 2. Scan Frontend Modules
const feRoots = [
  'src/modules',
  'resources/js/modules',
  'portal/app/modules',
  'frontend/src/modules'
];

feRoots.forEach(feRoot => {
  const fullRoot = path.join(projectRoot, feRoot);
  if (fs.existsSync(fullRoot)) {
    try {
      const entries = fs.readdirSync(fullRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
          results.frontendModules.push({
            name: entry.name,
            file: path.relative(projectRoot, path.join(fullRoot, entry.name)).replace(/\\/g, '/')
          });
        }
      }
    } catch {}
  }
});

// Resolve .NET entity table names: explicit ToTable() wins, then the DbSet property name.
for (const m of results.models) {
  if (m.type !== 'EF Core Entity') continue;
  const explicit = csToTables.find(t => t.entity === m.name);
  const dbSet = csDbSets.find(d => d.entity === m.name);
  if (explicit) m.table = explicit.table;
  else if (dbSet) m.table = dbSet.set;
}
csToTables.forEach(t => results.tables.push({ table: t.table, migration: t.file }));

if (sawDotNetFiles) {
  try {
    const minimalApis = scanDotNetMinimalApis(projectRoot);
    results.apiEndpoints = minimalApis.endpoints || [];
  } catch {}
}

// Sort for determinism
results.models.sort((a, b) => a.name.localeCompare(b.name));
results.controllers.sort((a, b) => a.name.localeCompare(b.name));
results.templates.sort((a, b) => a.name.localeCompare(b.name));
results.tables.sort((a, b) => a.table.localeCompare(b.table));
results.contracts.sort((a, b) => a.name.localeCompare(b.name));
results.frontendModules.sort((a, b) => a.name.localeCompare(b.name));
results.apiEndpoints.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));

// Build Markdown
const lines = [
  '# Deterministic Codebase Index (CODEBASE_MAP)',
  '',
  `> **Generated:** ${new Date().toISOString()} | **Scan Duration:** ${Date.now() - startTime}ms`,
  '> **Version:** v3.9.4 Multi-Stack Index',
  '> **Purpose:** Surgical context loading. Consult this map before any grep/scan to preserve tokens.',
  '',
  `## 1. Backend Models (${results.models.length})`,
  '| Model | Type | Explicit Table | Relative Path |',
  '| :--- | :--- | :--- | :--- |'
];

if (results.models.length === 0) {
  lines.push('| _(None detected)_ | - | - | - |');
} else {
  results.models.forEach(m => {
    lines.push(`| \`${m.name}\` | ${m.type} | \`${m.table}\` | \`${m.file}\` |`);
  });
}

lines.push('');
lines.push(`## 2. Controllers (${results.controllers.length})`);
lines.push('| Controller Name | Stack | Relative Path |');
lines.push('| :--- | :--- | :--- |');

if (results.controllers.length === 0) {
  lines.push('| _(None detected)_ | - | - |');
} else {
  results.controllers.forEach(c => {
    lines.push(`| \`${c.name}\` | ${c.stack} | \`${c.file}\` |`);
  });
}

lines.push('');
lines.push(`## 3. Database Tables & Migrations (${results.tables.length})`);
lines.push('| Table Name | Migration File |');
lines.push('| :--- | :--- |');

if (results.tables.length === 0) {
  lines.push('| _(None detected)_ | - |');
} else {
  results.tables.forEach(t => {
    lines.push(`| \`${t.table}\` | \`${t.migration}\` |`);
  });
}

lines.push('');
lines.push(`## 4. Contracts & Interfaces (${results.contracts.length})`);
lines.push('| Contract / Interface | Relative Path |');
lines.push('| :--- | :--- |');

if (results.contracts.length === 0) {
  lines.push('| _(None detected)_ | - |');
} else {
  results.contracts.forEach(c => {
    lines.push(`| \`${c.name}\` | \`${c.file}\` |`);
  });
}

lines.push('');
lines.push(`## 5. UI Views & Components (${results.templates.length})`);
lines.push('| Component / Template | Engine | Relative Path |');
lines.push('| :--- | :--- | :--- |');

if (results.templates.length === 0) {
  lines.push('| _(None detected)_ | - | - |');
} else {
  results.templates.forEach(tpl => {
    lines.push(`| \`${tpl.name}\` | ${tpl.engine} | \`${tpl.file}\` |`);
  });
}

lines.push('');
lines.push(`## 6. Frontend Modules (${results.frontendModules.length})`);
lines.push('| Module Name | Relative Path |');
lines.push('| :--- | :--- |');

if (results.frontendModules.length === 0) {
  lines.push('| _(None detected)_ | - |');
} else {
  results.frontendModules.forEach(f => {
    lines.push(`| \`${f.name}\` | \`${f.file}\` |`);
  });
}

lines.push('');
lines.push(`## API Endpoints (Minimal APIs / Controllers) (${results.apiEndpoints.length})`);
lines.push('| Method | Route | Auth/Policy | Handler/DTO | Source File |');
lines.push('| :--- | :--- | :--- | :--- | :--- |');

if (results.apiEndpoints.length === 0) {
  lines.push('| _(None detected)_ | - | - | - | - |');
} else {
  results.apiEndpoints.forEach(ep => {
    const dtoPart = ep.requestDto ? `${ep.handler} (${ep.requestDto})` : (ep.responseDto ? `${ep.handler} -> ${ep.responseDto}` : ep.handler);
    lines.push(`| \`${ep.method}\` | \`${ep.route}\` | \`${ep.authPolicy}\` | \`${dtoPart}\` | \`${ep.sourceFile}\` |`);
  });
}

lines.push('');

// Read stack.json to check active stacks
let stackConfig = null;
const stackJsonCandidates = [
  path.join(projectRoot, '.ai', 'stack.json'),
  path.join(projectRoot, 'stack.json'),
  path.join(__dirname, '..', 'stack.json')
];
for (const sc of stackJsonCandidates) {
  if (fs.existsSync(sc)) {
    try { stackConfig = JSON.parse(fs.readFileSync(sc, 'utf8')); break; } catch {}
  }
}

const totalEntities = results.models.length + results.controllers.length + results.tables.length + results.apiEndpoints.length;
let shouldPreserveExisting = false;

if (totalEntities === 0 && fs.existsSync(outputPath) && !process.argv.includes('--force')) {
  const existingMap = fs.readFileSync(outputPath, 'utf8');
  const existingHasEloquent = /Eloquent/i.test(existingMap);
  const isLaravelActive = stackConfig?.stacks?.backend?.laravel === true;
  const isDotNetActive = stackConfig?.stacks?.backend?.dotnet === true;

  const hasEntities = !existingMap.includes('_(None detected)_');

  // Stale cross-project map check: if existing map contains Eloquent but Laravel is false and .NET is true, overwrite!
  const isCrossStackStale = (existingHasEloquent && !isLaravelActive && isDotNetActive)
    || (!existingHasEloquent && isLaravelActive && /EF Core/i.test(existingMap));

  if (existingMap.length > 500 && hasEntities && !isCrossStackStale) {
    shouldPreserveExisting = true;
  }
}

if (shouldPreserveExisting) {
  console.log(`ℹ️ Existing rich codebase map preserved at: ${outputPath} (0 models/controllers found in local scan; pass --force to overwrite)`);
  process.exit(0);
}

// Write Output
const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');

console.log(`✅ Codebase map generated at: ${outputPath}`);
console.log(`📊 Scanned in ${Date.now() - startTime}ms — Models: ${results.models.length}, Controllers: ${results.controllers.length}, API Endpoints: ${results.apiEndpoints.length}, Templates: ${results.templates.length}, Tables: ${results.tables.length}, Contracts: ${results.contracts.length}, FE Modules: ${results.frontendModules.length}`);
