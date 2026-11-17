#!/usr/bin/env node

/**
 * 🛰️ InnovaDigits Semantic Drift, Catalog Parity & Delta Radar Engine (v4.0.0)
 * Supports both BA_AI_SDLC v2.0.0 Centralized Context Hub and Legacy BCAS layouts:
 *   1. Entity & schema drift (missing models/tables vs CODEBASE_MAP.md & .NET EF Core)
 *   2. Cross-feature business rule & status enum collisions
 *   3. AC-to-test binding gaps
 *   4. Hub v2.0 Check A: `feature_srd` SHA-256 normative integrity vs `SPRINT_<ID>_MANIFEST.md`
 *   5. Hub v2.0 Check B: `SEED-*` & `ENUM-*` catalog parity vs `00-project-core/` & Gate B `ENG-03`
 *   6. Hub v2.0 Check C: Screen §2 & UI Lifecycle §3 coverage in Gate B `ENG-04` / `data-testid`
 *   7. Hub v2.0 Check D: Unapplied `03-version-deltas/DELTA_*.md` vs `.delta-state.json`
 *
 * Usage:
 *   node bin/drift-radar.js
 *   node bin/drift-radar.js --sprint=S1
 *   node bin/drift-radar.js --output=custom/path.md
 *   node bin/drift-radar.js --json
 */

const fs = require('fs');
const path = require('path');
const {
  expandCliPath,
  resolveProjectAndAiRoot,
  resolveHubWorkspace,
  verifySrdMatch,
  parseFeatureDocument,
  collectSprintManifests,
  scanHubAndLegacyFeatures
} = require('./lib/hub-utils');

const startTime = Date.now();

// 1. CLI Arguments Parsing
const args = process.argv.slice(2);
let targetSprint = 'all';
let explicitHub = null;
let customOutputPath = null;
let isJson = false;

for (const arg of args) {
  if (arg.startsWith('--sprint=')) {
    targetSprint = arg.split('=')[1].trim();
  } else if (arg.startsWith('--hub=')) {
    explicitHub = path.resolve(expandCliPath(arg.slice('--hub='.length)));
  } else if (arg.startsWith('--output=')) {
    customOutputPath = path.resolve(expandCliPath(arg.slice('--output='.length)));
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Semantic Drift & Conflict Radar CLI (v4.1.0)

Options:
  --sprint=<ID>      Target sprint/batch to audit (Default: all specs)
  --hub=<path>       Optional project-context-hub root override
  --output=<path>    Custom destination report path (Default: docs/business-context/DRIFT_RADAR_REPORT.md)
  --json             Output raw JSON report
  --help, -h         Show help instructions
`);
    process.exit(0);
  }
}

// 2. Resolve Project Root, Hub Workspace & Context Files
const cwd = process.cwd();
const { projectRoot, aiDir } = resolveProjectAndAiRoot(cwd, __dirname);
const hubWorkspace = resolveHubWorkspace(projectRoot, { explicitHubPath: explicitHub, aiDir });
const scopeMode = hubWorkspace.scopeMode || 'FULL_PROJECT';
const intakeMode = hubWorkspace.intakeMode || 'standard';
const isPartialJit = scopeMode === 'PARTIAL_JIT_ANCHOR';
const docsDir = hubWorkspace.docsDir;
const outputFile = customOutputPath || path.join(docsDir, 'DRIFT_RADAR_REPORT.md');

let pkgVersion = '4.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (pkg.version) pkgVersion = pkg.version;
} catch {}

let codebaseMapPath = null;
const candidateMaps = [
  path.join(projectRoot, 'context', 'CODEBASE_MAP.md'),
  path.join(projectRoot, '.ai', 'context', 'CODEBASE_MAP.md'),
  path.join(cwd, 'context', 'CODEBASE_MAP.md'),
  path.join(cwd, '..', 'context', 'CODEBASE_MAP.md')
];
for (const p of candidateMaps) {
  if (fs.existsSync(p)) {
    codebaseMapPath = p;
    break;
  }
}

function scanFilesRecursively(dir, filterFn) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'bin' && entry.name !== 'obj' && entry.name !== 'node_modules' && entry.name !== '.git') {
        results = results.concat(scanFilesRecursively(fullPath, filterFn));
      }
    } else if (entry.isFile() && (!filterFn || filterFn(entry.name, fullPath))) {
      results.push(fullPath);
    }
  }
  return results;
}

// 3. Known Code Inventory
const knownModels = new Set();
const knownTables = new Set();
const knownApiRoutes = new Set();

const domainEntitiesDir = path.join(projectRoot, 'src', 'Domain', 'Entities');
if (fs.existsSync(domainEntitiesDir)) {
  for (const ef of scanFilesRecursively(domainEntitiesDir, name => name.endsWith('.cs'))) {
    try {
      const code = fs.readFileSync(ef, 'utf8');
      const cMatch = code.match(/public\s+(?:sealed\s+)?class\s+([A-Za-z0-9_]+)/);
      if (cMatch) {
        knownModels.add(cMatch[1]);
        knownTables.add(cMatch[1].toLowerCase() + 's');
      }
    } catch {}
  }
}

const configDir = path.join(projectRoot, 'src', 'Infrastructure', 'Data', 'Configurations');
if (fs.existsSync(configDir)) {
  for (const cf of scanFilesRecursively(configDir, name => name.endsWith('.cs'))) {
    try {
      const code = fs.readFileSync(cf, 'utf8');
      const tMatch = code.match(/ToTable\(["']([^"']+)["']\)/);
      if (tMatch) knownTables.add(tMatch[1].trim());
    } catch {}
  }
}

const endpointsDir = path.join(projectRoot, 'src', 'Web', 'Endpoints');
if (fs.existsSync(endpointsDir)) {
  for (const ef of scanFilesRecursively(endpointsDir, name => name.endsWith('.cs'))) {
    try {
      const code = fs.readFileSync(ef, 'utf8');
      for (const m of code.matchAll(/\.Map(Get|Post|Put|Delete|Patch)\(\s*["']([^"']+)["']/g)) {
        knownApiRoutes.add(`${m[1].toUpperCase()} ${m[2]}`);
      }
    } catch {}
  }
}

if (codebaseMapPath && fs.existsSync(codebaseMapPath)) {
  const mapContent = fs.readFileSync(codebaseMapPath, 'utf8');
  const modelRegex = /\|\s*`([A-Za-z0-9_]+)`\s*\|\s*(?:Eloquent|CakePHP Table|EF Core Entity)\s*\|\s*`([^`]+)`\s*\|/gi;
  let mMatch;
  while ((mMatch = modelRegex.exec(mapContent)) !== null) {
    knownModels.add(mMatch[1].trim());
    if (mMatch[2] && mMatch[2] !== '-') knownTables.add(mMatch[2].trim());
  }

  const tableRegex = /\|\s*`([a-z0-9_]+)`\s*\|\s*`[^`]+`\s*\|/gi;
  let tMatch;
  while ((tMatch = tableRegex.exec(mapContent)) !== null) {
    knownTables.add(tMatch[1].trim());
  }
}

// Supplement knownModels / knownTables from app/Models & database/migrations if present
const phpModelsDirs = [path.join(projectRoot, 'app', 'Models'), path.join(projectRoot, 'Modules')];
for (const mDir of phpModelsDirs) {
  if (!fs.existsSync(mDir)) continue;
  for (const mf of scanFilesRecursively(mDir, (name, full) => name.endsWith('.php') && (/\/Models\//i.test(full) || mDir.endsWith('Models')))) {
    try {
      const code = fs.readFileSync(mf, 'utf8');
      const cm = code.match(/class\s+([A-Za-z0-9_]+)/);
      if (cm) {
        knownModels.add(cm[1]);
        const tm = code.match(/protected\s+\$table\s*=\s*['"]([^'"]+)['"]/);
        if (tm) {
          knownTables.add(tm[1].trim());
        } else {
          const snake = cm[1].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
          knownTables.add(snake.endsWith('s') ? snake : `${snake}s`);
        }
      }
    } catch {}
  }
}

// 4. Hub v2.0 Core Catalogs & Manifests (gracefully optional in legacy mode)
const manifestMap = collectSprintManifests(hubWorkspace);

const seedCatalogCandidates = [
  path.join(hubWorkspace.hubRoot, '00-project-core', 'SEED_DEFAULTS_CATALOG.md'),
  path.join(docsDir, 'SEED_DEFAULTS_CATALOG.md')
];
const enumCatalogCandidates = [
  path.join(hubWorkspace.hubRoot, '00-project-core', 'GLOSSARY_AND_ENUMS.md'),
  path.join(docsDir, 'GLOSSARY_AND_ENUMS.md')
];

const seedCatalogPath = seedCatalogCandidates.find(p => fs.existsSync(p));
const enumCatalogPath = enumCatalogCandidates.find(p => fs.existsSync(p));

const declaredSeeds = seedCatalogPath
  ? new Set((fs.readFileSync(seedCatalogPath, 'utf8').match(/\bSEED-[A-Z0-9_-]+\b/g) || []))
  : null;
const declaredEnums = enumCatalogPath
  ? new Set((fs.readFileSync(enumCatalogPath, 'utf8').match(/\bENUM-[A-Z0-9_-]+\b/g) || []))
  : null;

// 5. Collect Feature Files (Hub v2 + Legacy fallback)
const allFeatureFiles = scanHubAndLegacyFeatures(hubWorkspace, targetSprint);

const entityDrift = [];
const ruleCollisions = [];
const statusCollisions = [];
const testBindingGaps = [];
const srdDrift = [];
const catalogParityGaps = [];
const screenLifecycleGaps = [];
const unappliedDeltas = [];

const rulesCatalog = new Map();
const statusCatalog = new Map();

let scannedCount = 0;
let sealedCount = 0;

for (const filePath of allFeatureFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(cwd, filePath).replace(/\\/g, '/');
  const parsed = parseFeatureDocument(filePath, { isHubV2: hubWorkspace.isHubV2 });
  scannedCount++;

  const featureId = parsed.id;
  const featureTitle = parsed.title;
  const readiness = parsed.gateA;
  const isSealed = readiness === 'READY_FOR_DEV' || readiness === 'IMPLEMENTED';
  if (isSealed) sealedCount++;

  // 1. Entity & Schema Drift Scan
  if (isSealed && (knownModels.size > 0 || knownTables.size > 0)) {
    const fieldTableMatches = content.match(/\|\s*`?([a-z0-9_]+)`?\s*\(Master\)\s*\|/gi);
    if (fieldTableMatches) {
      fieldTableMatches.forEach(m => {
        const rawTable = m.replace(/\||\s|`|\(Master\)/gi, '').trim();
        if (rawTable && rawTable !== 'local' && !knownTables.has(rawTable) && !knownTables.has(`mod_${rawTable}`)) {
          entityDrift.push({
            featureId,
            featureTitle,
            entityName: rawTable,
            type: 'DATABASE_TABLE',
            severity: 'CRITICAL',
            file: relPath,
            remediation: `Create migration for table '${rawTable}' or bind to verified model in context/CODEBASE_MAP.md.`
          });
        }
      });
    }
  }

  // 2. Business Rule Collision Scan (BR-FEAT-* / BR-* declared in column 1 of rule tables)
  const ruleRowRegex = /^\s*\|\s*`?(BR-(?:FEAT-)?[A-Z0-9_-]+)`?\s*\|\s*([^\r\n|]+)\|\s*([^\r\n|]+)\|/gim;
  let rMatch;
  while ((rMatch = ruleRowRegex.exec(content)) !== null) {
    const ruleId = rMatch[1].trim().toUpperCase();
    if (/^BR-GLB-\d+$/i.test(ruleId)) continue;
    const col2 = rMatch[2].replace(/`/g, '').trim();
    const col3 = rMatch[3].replace(/`/g, '').trim();
    const isHubRuleRow = /\b(?:SEED|ENUM|BR-GLB)-/.test(rMatch[3]) || col2.length > 40;
    const ruleTitle = isHubRuleRow ? 'Rule' : col2;
    const statement = (isHubRuleRow ? col2 : col3).slice(0, 100);
    if (!rulesCatalog.has(ruleId)) rulesCatalog.set(ruleId, []);
    const existing = rulesCatalog.get(ruleId);
    if (!existing.some(e => e.featureId === featureId)) {
      existing.push({ featureId, ruleTitle, statement, file: relPath });
    }
  }

  // 3. Status Lifecycle Enum Collision Scan
  const statusEnumMatch = content.match(/Enum:\s*`?([A-Z0-9_,\s]+)`?/i);
  if (statusEnumMatch) {
    const rawStates = statusEnumMatch[1].split(',').map(s => s.trim().replace(/`/g, '')).filter(Boolean);
    const entityKey = featureId.split('-')[0] || 'Domain';
    if (!statusCatalog.has(entityKey)) statusCatalog.set(entityKey, []);
    statusCatalog.get(entityKey).push({ featureId, states: rawStates, file: relPath });
  }

  // 4. AC-to-Test Binding Verification
  // In Hub v2 mode, Gate B (ENG-09) binds planned test paths at READY_TO_CODE; physical test file existence is enforced once IMPLEMENTED (avoiding false positives on brownfield tests/ folders)
  const shouldVerifyTests = hubWorkspace.isHubV2
    ? (parsed.gateA === 'IMPLEMENTED')
    : isSealed;

  if (shouldVerifyTests) {
    const testMatches = content.match(/tests\/[A-Za-z0-9_/.-]+(?:Test|Tests|spec|test)\.(?:php|ts|tsx|js|cs)/gi);
    if (testMatches && testMatches.length > 0) {
      testMatches.forEach(testRelPath => {
        const absTest = path.resolve(projectRoot, testRelPath);
        if (!fs.existsSync(absTest)) {
          testBindingGaps.push({
            featureId,
            testPath: testRelPath,
            status: 'MISSING_TEST_FILE',
            remediation: `Generate automated test suite at '${testRelPath}' to fulfill sealed acceptance criteria.`
          });
        }
      });
    } else if (!hubWorkspace.isHubV2 || parsed.gateA === 'IMPLEMENTED') {
      const candidatePhpTest = path.resolve(projectRoot, `tests/Feature/${featureId}Test.php`);
      const testDir = path.resolve(projectRoot, 'tests');
      let hasSuiteTest = false;
      if (fs.existsSync(testDir)) {
        try {
          const allTestFiles = scanFilesRecursively(testDir, f => /\.(?:php|ts|js|cs)$/.test(f));
          hasSuiteTest = allTestFiles.some(f => {
            const base = path.basename(f);
            return base.includes(featureId) || /E2ETest\./i.test(base);
          });
        } catch {}
      }
      if (!fs.existsSync(candidatePhpTest) && !hasSuiteTest) {
        testBindingGaps.push({
          featureId,
          testPath: `tests/Feature/${featureId}Test.php`,
          status: 'UNBOUND_AC_TEST',
          remediation: `Declare and scaffold test suite for ${featureId} mapped to AC-01..AC-XX.`
        });
      }
    }
  }

  // Hub v2.0 Check A: feature_srd Integrity against SPRINT_<ID>_MANIFEST.md & sealed hash
  const manifestEntry = manifestMap.get(featureId);
  if (manifestEntry && manifestEntry.featureSrd) {
    const check = verifySrdMatch(parsed.computedSrd, manifestEntry.featureSrd, parsed.computedSrdV1);
    if (check.comparable && !check.matches) {
      srdDrift.push({
        featureId,
        sprint: parsed.sprint,
        expectedSrd: check.expected,
        computedSrd: parsed.computedSrd,
        source: path.relative(projectRoot, manifestEntry.manifestPath).replace(/\\/g, '/'),
        remediation: `Revert unauthorized edits to normative Sections 1–9 of ${featureId} or request BA re-seal via @ba-evolve.`
      });
    }
  } else if (parsed.declaredSrd) {
    const selfCheck = verifySrdMatch(parsed.computedSrd, parsed.declaredSrd, parsed.computedSrdV1);
    if (selfCheck.comparable && !selfCheck.matches) {
      srdDrift.push({
        featureId,
        sprint: parsed.sprint,
        expectedSrd: selfCheck.expected,
        computedSrd: parsed.computedSrd,
        source: relPath,
        remediation: `Normative Sections 1–9 drifted from sealed feature_srd. Restore Sections 1–9 or re-seal via @ba-evolve.`
      });
    }
  }

  // Hub v2.0 Check B: SEED-* & ENUM-* Catalog Parity
  if (declaredSeeds) {
    for (const sRef of parsed.seedRefs) {
      if (!declaredSeeds.has(sRef)) {
        catalogParityGaps.push({
          featureId,
          token: sRef,
          catalog: 'SEED_DEFAULTS_CATALOG.md',
          status: 'MISSING_IN_CATALOG',
          remediation: `Register '${sRef}' in 00-project-core/SEED_DEFAULTS_CATALOG.md and map in Section 11 ENG-03.`
        });
      }
    }
  }
  if (declaredEnums) {
    for (const eRef of parsed.enumRefs) {
      if (!declaredEnums.has(eRef)) {
        catalogParityGaps.push({
          featureId,
          token: eRef,
          catalog: 'GLOSSARY_AND_ENUMS.md',
          status: 'MISSING_IN_CATALOG',
          remediation: `Register '${eRef}' in 00-project-core/GLOSSARY_AND_ENUMS.md and map in Section 11 ENG-03.`
        });
      }
    }
  }
  if (parsed.gateB === 'READY_TO_CODE' && (parsed.seedRefs.length > 0 || parsed.enumRefs.length > 0)) {
    const eng03 = parsed.section11.checks.get('ENG-03');
    if (!eng03 || !eng03.binding || eng03.status.includes('PENDING') || eng03.status.includes('FAIL')) {
      catalogParityGaps.push({
        featureId,
        token: [...parsed.seedRefs, ...parsed.enumRefs].join(', '),
        catalog: 'Section 11 (ENG-03)',
        status: 'UNMAPPED_IN_GATE_B',
        remediation: `Bind ${featureId} SEED-*/ENUM-* tokens to concrete codebase enums/seeders in Section 11 ENG-03.`
      });
    }
  }

  // Hub v2.0 Check C: Screen §2 & Lifecycle §3 Coverage
  if ((parsed.gateB === 'READY_TO_CODE' || parsed.gateA === 'IMPLEMENTED') && (parsed.hasScreenSection || parsed.lifecycleStates.length > 0)) {
    if (parsed.section11.exists) {
      const eng04 = parsed.section11.checks.get('ENG-04');
      if (!eng04 || !eng04.binding || (!/data-testid|n\/a|headless|job|backend/i.test(eng04.binding))) {
        screenLifecycleGaps.push({
          featureId,
          screens: parsed.screenRefs.join(', ') || '§2 Screen Elements',
          states: parsed.lifecycleStates.join(', ') || '§3 Lifecycle',
          remediation: `Document deterministic data-testid plan for §2 Screen & §3 Lifecycle states in Section 11 ENG-04.`
        });
      }
    }
  }
}

// Hub v2.0 Check D: Unapplied Business Deltas in 03-version-deltas/
const deltaStatePath = path.join(docsDir, '.delta-state.json');
let appliedVersions = new Set();
if (fs.existsSync(deltaStatePath)) {
  try {
    const st = JSON.parse(fs.readFileSync(deltaStatePath, 'utf8'));
    for (const [ver, info] of Object.entries(st.deltas || {})) {
      if (info && info.status === 'APPLIED') {
        appliedVersions.add(ver.toLowerCase());
        appliedVersions.add(ver.toLowerCase().replace(/^v/, ''));
      }
    }
  } catch {}
}

const deltaDirs = [
  path.join(hubWorkspace.hubRoot, '03-version-deltas'),
  path.join(docsDir, '03-version-deltas')
];
const seenDeltaFiles = new Set();
for (const dd of deltaDirs) {
  if (!fs.existsSync(dd)) continue;
  for (const df of fs.readdirSync(dd).sort()) {
    if (!df.startsWith('DELTA_') || !df.endsWith('.md') || /\.template\.md$/i.test(df)) continue;
    const abs = path.resolve(dd, df);
    if (seenDeltaFiles.has(abs)) continue;
    seenDeltaFiles.add(abs);

    const base = path.basename(df, '.md');
    const verMatch = base.match(/_to_([vV]?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)/i) ||
                     base.match(/DELTA_([vV]?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)/i);
    const rawVer = verMatch ? verMatch[1] : base.replace(/^DELTA_/i, '');
    const normVer = /^\d+\.\d+/.test(rawVer) ? `v${rawVer}` : rawVer;

    if (!appliedVersions.has(normVer.toLowerCase()) && !appliedVersions.has(normVer.toLowerCase().replace(/^v/, ''))) {
      unappliedDeltas.push({
        version: normVer,
        file: path.relative(projectRoot, abs).replace(/\\/g, '/'),
        status: 'UNAPPLIED_DELTA',
        remediation: `Run 'node bin/delta-sync.js --to=${normVer}' (@apply-delta ${normVer}), apply surgical updates, then mark '--mark-applied=${normVer}'.`
      });
    }
  }
}

// Evaluate Rule Collisions
for (const [ruleId, declarations] of rulesCatalog.entries()) {
  if (declarations.length > 1) {
    const firstStatement = declarations[0].statement.toLowerCase().replace(/\s+/g, '');
    const hasDivergence = declarations.some(d => d.statement.toLowerCase().replace(/\s+/g, '') !== firstStatement);
    if (hasDivergence) {
      ruleCollisions.push({
        ruleId,
        features: declarations.map(d => `${d.featureId} (${d.ruleTitle})`).join(', '),
        discrepancy: 'Divergent business logic statements across features sharing identical Rule ID',
        remediation: 'Disambiguate rule IDs or standardize logic across specs in PROJECT_CONTEXT.md.'
      });
    }
  }
}

// Evaluate Status Lifecycle Collisions
for (const [entityKey, records] of statusCatalog.entries()) {
  if (records.length > 1) {
    const baseStates = new Set(records[0].states);
    for (let i = 1; i < records.length; i++) {
      const currentStates = new Set(records[i].states);
      const diff = [...currentStates].filter(x => !baseStates.has(x));
      if (diff.length > 0) {
        statusCollisions.push({
          entityKey,
          featureA: records[0].featureId,
          featureB: records[i].featureId,
          divergentStates: diff.join(', '),
          remediation: `Harmonize state machine enum transitions between ${records[0].featureId} and ${records[i].featureId}.`
        });
      }
    }
  }
}

// In PARTIAL_JIT_ANCHOR mode, identify untouched legacy codebase models that are intentionally unanchored (zero drift penalty)
const anchoredSpecCorpus = allFeatureFiles.map(fp => {
  try { return fs.readFileSync(fp, 'utf8').toLowerCase(); } catch { return ''; }
}).join('\n');

const untouchedLegacyModels = isPartialJit
  ? Array.from(knownModels).filter(m => !anchoredSpecCorpus.includes(m.toLowerCase()))
  : [];

// Calculate Health Score (0 - 100%)
let healthScore = 100;
healthScore -= entityDrift.length * 15;
healthScore -= ruleCollisions.length * 15;
healthScore -= statusCollisions.length * 15;
healthScore -= testBindingGaps.length * 5;
healthScore -= srdDrift.length * 20;
healthScore -= catalogParityGaps.length * 10;
healthScore -= screenLifecycleGaps.length * 10;
healthScore -= unappliedDeltas.length * 10;
healthScore = Math.max(0, Math.min(100, healthScore));

const statusLabel = healthScore >= 90 ? '🟢 HEALTHY' : (healthScore >= 70 ? '🟡 CAUTION_DRIFT' : '🔴 CRITICAL_DRIFT');

function buildDriftReport() {
  return `# Semantic Drift, Catalog Parity & Delta Radar Report

> **Generated:** \`${new Date().toISOString()}\` | **Layout:** \`${hubWorkspace.layout}\`  
> **Scope Mode:** \`${scopeMode}\` | **Intake Mode:** \`${intakeMode}\`${isPartialJit ? ` | **Untouched Legacy Models Bypassed:** \`${untouchedLegacyModels.length}\`` : ''}  
> **Scanned Features:** \`${scannedCount}\` specifications (\`${sealedCount}\` BA-sealed)  
> **Radar Health Score:** \`${healthScore}%\` — **${statusLabel}**  
> **Enforcement Gate:** Zero schema drift, intact \`feature_srd\`, 100% \`SEED-*\`/\`ENUM-*\` parity, and zero unapplied deltas.

---

## 1. Executive Drift & Collision Summary

| Radar Dimension | Discovered Findings | Impact | Gate Status |
| :--- | :--- | :--- | :--- |
| **Entity & Schema Drift** | \`${entityDrift.length}\` drift items | Codebase missing tables/models cited in sealed specs | ${entityDrift.length === 0 ? '🟢 PASS' : '🔴 BLOCKED'} |
| **Business Rule Collisions** | \`${ruleCollisions.length}\` collisions | Contradictory business logic sharing identical rule IDs | ${ruleCollisions.length === 0 ? '🟢 PASS' : '🔴 BLOCKED'} |
| **Status Lifecycle Divergence** | \`${statusCollisions.length}\` collisions | Conflicting state enums for shared domain entities | ${statusCollisions.length === 0 ? '🟢 PASS' : '🟡 WARNING'} |
| **AC-to-Test Binding Gaps** | \`${testBindingGaps.length}\` gaps | Sealed features with missing/unbound test suites | ${testBindingGaps.length === 0 ? '🟢 PASS' : '🟡 ACTION_REQ'} |
| **Check A: \`feature_srd\` Integrity** | \`${srdDrift.length}\` violations | Normative Sections 1–9 drifted from Sprint Manifest SHA-256 | ${srdDrift.length === 0 ? '🟢 PASS' : '🔴 BLOCKED'} |
| **Check B: \`SEED-*\` / \`ENUM-*\` Parity** | \`${catalogParityGaps.length}\` gaps | Undeclared or unmapped core catalog tokens | ${catalogParityGaps.length === 0 ? '🟢 PASS' : '🟡 ACTION_REQ'} |
| **Check C: Screen §2 & Lifecycle §3** | \`${screenLifecycleGaps.length}\` gaps | Missing \`data-testid\` plan for UI screens/states | ${screenLifecycleGaps.length === 0 ? '🟢 PASS' : '🟡 ACTION_REQ'} |
| **Check D: Unapplied Business Deltas** | \`${unappliedDeltas.length}\` deltas | \`03-version-deltas/DELTA_*.md\` awaiting \`@apply-delta\` | ${unappliedDeltas.length === 0 ? '🟢 PASS' : '🟡 PENDING_DELTA'} |

---

## 2. Entity & Database Schema Drift

${entityDrift.length === 0 ? '✅ **Zero Schema Drift Detected:** All entities and master tables cited in sealed specs match verified models in `CODEBASE_MAP.md`.' : `
| Feature ID | Missing Entity / Table | Type | Severity | Actionable Remediation |
| :--- | :--- | :--- | :--- | :--- |
${entityDrift.map(e => `| **${e.featureId}** | \`${e.entityName}\` | \`${e.type}\` | **${e.severity}** | ${e.remediation} |`).join('\n')}
`}

---

## 3. BA_AI_SDLC v2.0.0 Hub Integrity & Delta Checks (Checks A–D)

### 3.1 Check A — Normative \`feature_srd\` Integrity
${srdDrift.length === 0 ? '✅ **Normative Sections 1–9 Intact:** All feature hashes match `SPRINT_<ID>_MANIFEST.md`.' : `
| Feature ID | Sprint | Expected SHA-256 | Computed SHA-256 | Remediation |
| :--- | :--- | :--- | :--- | :--- |
${srdDrift.map(s => `| **${s.featureId}** | \`${s.sprint}\` | \`${s.expectedSrd.slice(0, 16)}...\` | \`${s.computedSrd.slice(0, 16)}...\` | ${s.remediation} |`).join('\n')}
`}

### 3.2 Check B — \`SEED-*\` & \`ENUM-*\` Catalog Parity
${catalogParityGaps.length === 0 ? '✅ **Catalog Parity Verified:** All referenced `SEED-*` and `ENUM-*` codes resolve cleanly.' : `
| Feature ID | Token | Target Catalog | Status | Remediation |
| :--- | :--- | :--- | :--- | :--- |
${catalogParityGaps.map(c => `| **${c.featureId}** | \`${c.token}\` | \`${c.catalog}\` | \`${c.status}\` | ${c.remediation} |`).join('\n')}
`}

### 3.3 Check C — Screen §2 & Lifecycle §3 \`data-testid\` Coverage
${screenLifecycleGaps.length === 0 ? '✅ **Screen & Lifecycle Coverage Verified:** All decomposed UI elements and states are accounted for.' : `
| Feature ID | Screen Refs (§2) | Lifecycle States (§3) | Remediation |
| :--- | :--- | :--- | :--- |
${screenLifecycleGaps.map(g => `| **${g.featureId}** | \`${g.screens}\` | \`${g.states}\` | ${g.remediation} |`).join('\n')}
`}

### 3.4 Check D — Unapplied Business Deltas (\`03-version-deltas/\`)
${unappliedDeltas.length === 0 ? '✅ **All Business Deltas Applied:** Zero pending `DELTA_*.md` versions.' : `
| Target Version | Delta File | Status | Required Action |
| :--- | :--- | :--- | :--- |
${unappliedDeltas.map(d => `| **\`${d.version}\`** | \`${d.file}\` | \`${d.status}\` | ${d.remediation} |`).join('\n')}
`}

---

## 4. Cross-Feature Collisions & AC Test Bindings

### 4.1 Business Rule ID Collisions
${ruleCollisions.length === 0 ? '✅ **Zero Rule ID Collisions.**' : `
| Colliding Rule ID | Involved Features | Discovered Contradiction | Remediation Pointer |
| :--- | :--- | :--- | :--- |
${ruleCollisions.map(r => `| **\`${r.ruleId}\`** | ${r.features} | ${r.discrepancy} | ${r.remediation} |`).join('\n')}
`}

### 4.2 Status Machine Lifecycle Collisions
${statusCollisions.length === 0 ? '✅ **Zero Status Divergences.**' : `
| Domain Scope | Feature A | Feature B | Divergent States | Remediation Pointer |
| :--- | :--- | :--- | :--- | :--- |
${statusCollisions.map(s => `| **${s.entityKey}** | \`${s.featureA}\` | \`${s.featureB}\` | \`${s.divergentStates}\` | ${s.remediation} |`).join('\n')}
`}

### 4.3 Acceptance Criteria to Test Binding Matrix
${testBindingGaps.length === 0 ? '✅ **100% AC-to-Test Binding.**' : `
| Feature ID | Expected Test Suite Path | Binding Status | Action Required |
| :--- | :--- | :--- | :--- |
${testBindingGaps.map(t => `| **${t.featureId}** | \`${t.testPath}\` | \`${t.status}\` | ${t.remediation} |`).join('\n')}
`}

---
*Generated by InnovaDigits Drift Radar CLI (v${pkgVersion}).*
`;
}

const markdownOutput = buildDriftReport();

if (isJson) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    layout: hubWorkspace.layout,
    scope_mode: scopeMode,
    intake_mode: intakeMode,
    untouched_legacy_models_bypassed: untouchedLegacyModels,
    health_score: healthScore,
    status: statusLabel,
    scanned_features: scannedCount,
    sealed_features: sealedCount,
    entity_drift: entityDrift,
    rule_collisions: ruleCollisions,
    status_collisions: statusCollisions,
    test_binding_gaps: testBindingGaps,
    srd_drift: srdDrift,
    catalog_parity_gaps: catalogParityGaps,
    screen_lifecycle_gaps: screenLifecycleGaps,
    unapplied_deltas: unappliedDeltas
  }, null, 2));
} else {
  const outDir = path.dirname(outputFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputFile, markdownOutput);

  const elapsed = Date.now() - startTime;
  console.log('');
  console.log('================================================================================');
  console.log(`       INNOVADIGITS SEMANTIC DRIFT & CONFLICT RADAR (v${pkgVersion})                    `);
  console.log('================================================================================');
  console.log(`Radar Health Score : ${healthScore}% (${statusLabel}) [Layout: ${hubWorkspace.layout} | Scope: ${scopeMode}]`);
  console.log(`Features Scanned   : ${scannedCount} specifications (${sealedCount} sealed)`);
  console.log(`Report Output      : ${outputFile}`);
  console.log(`Execution Time     : ${elapsed}ms`);
  console.log('--------------------------------------------------------------------------------');
  console.log(
    `| Schema Drift: ${entityDrift.length} | SRD Drift: ${srdDrift.length} | Catalog Gaps: ${catalogParityGaps.length} | Pending Deltas: ${unappliedDeltas.length} | Test Gaps: ${testBindingGaps.length} |`
  );
  console.log('--------------------------------------------------------------------------------');
  console.log(`>>> RADAR STATUS: ${healthScore >= 70 && srdDrift.length === 0 ? 'CLEARANCE_GRANTED' : 'REMEDIATION_REQUIRED'}`);
  console.log('================================================================================\n');
}
