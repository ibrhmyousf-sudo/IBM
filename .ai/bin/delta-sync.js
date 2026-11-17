#!/usr/bin/env node

/**
 * 🔄 Deterministic Business Delta Compiler (`bin/delta-sync.js` v4.0.0)
 * Compiles `BA_AI_SDLC v2.0.0` `Was / Current / Update Needed` Deltas into surgical engineering execution plans:
 *   1. Scans `03-version-deltas/DELTA_*.md` + Section 10 (`FEATURE-*.md`) + Section 15 (`PROJECT_CONTEXT.md` / `CHANGE_IMPACT_REGISTER.md`)
 *   2. Cross-references `FEATURE-*`, `BR-*`, `SEED-*`, `ENUM-*`, `DOM-*`, and `SCR-*` against `context/CODEBASE_MAP.md` & Section 11 bindings
 *   3. Emits `docs/business-context/DELTA_EXECUTION_PLAN.md` + `docs/business-context/deltas/DELTA_PLAN_<version>.md`
 *   4. Tracks `SYNCED` vs `APPLIED` state in `docs/business-context/.delta-state.json` (`--mark-applied=<version>`)
 *
 * Usage:
 *   node bin/delta-sync.js
 *   node bin/delta-sync.js --delta=docs/project-context-hub/03-version-deltas/DELTA_v1.0.0_to_v1.1.0.md
 *   node bin/delta-sync.js --to=v1.1.0
 *   node bin/delta-sync.js --mark-applied=v1.1.0
 */

const fs = require('fs');
const path = require('path');
const {
  expandCliPath,
  resolveProjectAndAiRoot,
  resolveHubWorkspace,
  parseEvolutionTables,
  parseBacklogWbs,
  resolveWbsAndPmtoolPaths,
  parseFeatureDocument,
  scanHubAndLegacyFeatures
} = require('./lib/hub-utils');

const startTime = Date.now();
const args = process.argv.slice(2);

let explicitDeltaFile = null;
let targetToVersion = '';
let markAppliedVersion = '';
let explicitHub = null;
let isJson = false;

for (const arg of args) {
  if (arg.startsWith('--delta=')) {
    explicitDeltaFile = path.resolve(expandCliPath(arg.slice('--delta='.length)));
  } else if (arg.startsWith('--to=')) {
    targetToVersion = normalizeVersionKey(arg.slice('--to='.length).trim());
  } else if (arg.startsWith('--mark-applied=')) {
    markAppliedVersion = normalizeVersionKey(arg.slice('--mark-applied='.length).trim());
  } else if (arg.startsWith('--hub=')) {
    explicitHub = path.resolve(expandCliPath(arg.slice('--hub='.length)));
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Was -> Current Delta Execution Compiler (v4.0.0)

Options:
  --delta=<file>           Compile a specific DELTA_*.md file
  --to=<vX.Y.Z>            Filter delta compilation to a target version (e.g. v1.1.0)
  --mark-applied=<vX.Y.Z>  Mark target version as APPLIED in docs/business-context/.delta-state.json
  --hub=<path>             Custom project-context-hub root
  --json                   Output JSON summary
`);
    process.exit(0);
  }
}

function normalizeVersionKey(raw) {
  if (!raw) return '';
  let clean = String(raw).trim().replace(/^DELTA_.*?_to_/i, '').replace(/\.md$/i, '');
  if (/^\d+\.\d+/.test(clean)) clean = `v${clean}`;
  return clean;
}

function extractVersionsFromFilename(filePath) {
  const base = path.basename(filePath, '.md');
  const pairMatch = base.match(/DELTA_([vV]?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)_to_([vV]?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)/i);
  if (pairMatch) {
    return {
      fromVersion: normalizeVersionKey(pairMatch[1]),
      toVersion: normalizeVersionKey(pairMatch[2])
    };
  }
  const singleMatch = base.match(/DELTA_([vV]?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9._-]+)?)/i);
  if (singleMatch) {
    return {
      fromVersion: 'baseline',
      toVersion: normalizeVersionKey(singleMatch[1])
    };
  }
  return { fromVersion: 'baseline', toVersion: base.replace(/^DELTA_/i, '') || 'v1.0.0' };
}

function parseBlockStyleDeltas(markdown, defaultVer, sourceLabel) {
  const items = [];
  const blocks = String(markdown || '').replace(/\r\n/g, '\n').split(/\n(?=###\s+)/);
  for (const blk of blocks) {
    if (!/^###\s+/.test(blk.trim())) continue;
    const targetMatch = blk.match(/(?:\*\*Target ID\*\*|Target ID)\s*:\s*`?([^\n`]+)`?/i) ||
                        blk.match(/^###\s+.*?\b((?:FEATURE|BR|SEED|ENUM|DOM|SCR|AC|FR)-[A-Za-z0-9_-]+)/im);
    const wasMatch = blk.match(/(?:\*\*WAS\*\*|WAS)\s*:\s*([^\n]+)/i);
    const curMatch = blk.match(/(?:\*\*CURRENT\*\*|CURRENT)\s*:\s*([^\n]+)/i);
    const updMatch = blk.match(/(?:\*\*UPDATE NEEDED(?: BY TEAM)?\*\*|Update Needed)\s*:\s*([^\n]+)/i);
    if (targetMatch && (wasMatch || curMatch)) {
      items.push({
        version: defaultVer,
        date: '',
        ref: 'DELTA-BLOCK',
        targetId: targetMatch[1].trim(),
        was: wasMatch ? wasMatch[1].trim() : '-',
        current: curMatch ? curMatch[1].trim() : '-',
        updateNeeded: updMatch ? updMatch[1].trim() : 'Sync implementation & tests',
        source: sourceLabel
      });
    }
  }
  return items;
}

const { projectRoot, aiDir } = resolveProjectAndAiRoot(process.cwd(), __dirname);
const hubWorkspace = resolveHubWorkspace(projectRoot, { explicitHubPath: explicitHub, aiDir });
const docsDir = hubWorkspace.docsDir;
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const stateFilePath = path.join(docsDir, '.delta-state.json');
let deltaState = { updated_at: new Date().toISOString(), deltas: {} };
if (fs.existsSync(stateFilePath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      deltaState = { updated_at: parsed.updated_at || new Date().toISOString(), deltas: parsed.deltas || {} };
    }
  } catch {}
}

// 1. Parse CODEBASE_MAP.md inventory
const mapCandidates = [
  path.join(projectRoot, 'context', 'CODEBASE_MAP.md'),
  path.join(projectRoot, '.ai', 'context', 'CODEBASE_MAP.md'),
  path.join(aiDir, 'context', 'CODEBASE_MAP.md')
];
const codebaseMapPath = mapCandidates.find(p => fs.existsSync(p));
const codeAssets = {
  models: [],
  controllers: [],
  tables: [],
  views: []
};

if (codebaseMapPath) {
  const mapText = fs.readFileSync(codebaseMapPath, 'utf8');
  for (const m of mapText.matchAll(/\|\s*`([A-Za-z0-9_]+)`\s*\|\s*(?:Eloquent|CakePHP Table|EF Core Entity)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gi)) {
    codeAssets.models.push({ name: m[1], table: m[2], path: m[3] });
  }
  for (const c of mapText.matchAll(/\|\s*`([A-Za-z0-9_]+Controller|[A-Za-z0-9_]+Endpoints?)`\s*\|\s*[^|]+\|\s*`([^`]+)`\s*\|/gi)) {
    codeAssets.controllers.push({ name: c[1], path: c[2] });
  }
  for (const t of mapText.matchAll(/\|\s*`([a-z0-9_]+)`\s*\|\s*`([^`]*migration[^`]*)`\s*\|/gi)) {
    codeAssets.tables.push({ table: t[1], migration: t[2] });
  }
  for (const v of mapText.matchAll(/\|\s*`([^`]+)`\s*\|\s*(?:Vue|React|Blade|Angular|CakePHP|HTML)[^|]*\|\s*`([^`]+)`\s*\|/gi)) {
    codeAssets.views.push({ name: v[1], path: v[2] });
  }
}

// 2. Load Feature Docs & Section 11 Bindings + Section 10 Ledgers + 5-Level WBS
const { wbsPath } = resolveWbsAndPmtoolPaths(hubWorkspace);
const wbsData = parseBacklogWbs(wbsPath);
const featureFiles = scanHubAndLegacyFeatures(hubWorkspace, 'all');
const featureDocs = new Map();
const ledgerChanges = [];

for (const fp of featureFiles) {
  try {
    const doc = parseFeatureDocument(fp, { isHubV2: hubWorkspace.isHubV2 });
    featureDocs.set(doc.id, doc);
    for (const d of doc.section10Deltas) {
      ledgerChanges.push({ ...d, featureContext: doc.id });
    }
  } catch {}
}

// Scan Section 15 / Global Evolution Ledgers in PROJECT_CONTEXT.md & CHANGE_IMPACT_REGISTER.md
const globalLedgerFiles = [
  path.join(hubWorkspace.hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'),
  path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md'),
  path.join(docsDir, 'PROJECT_CONTEXT.md'),
  path.join(docsDir, 'CHANGE_IMPACT_REGISTER.md')
];
const seenGlobalFiles = new Set();
for (const gf of globalLedgerFiles) {
  const abs = path.resolve(gf);
  if (!fs.existsSync(abs) || seenGlobalFiles.has(abs)) continue;
  seenGlobalFiles.add(abs);
  const content = fs.readFileSync(abs, 'utf8');
  const sec15Match = content.match(/^##\s+(?:Section\s+)?15(?:\b|\.)([\s\S]*?)(?=^##\s+\d+|$)/im);
  const targetSlice = sec15Match ? sec15Match[1] : content;
  const extracted = parseEvolutionTables(targetSlice, path.basename(abs));
  for (const e of extracted) ledgerChanges.push(e);
}

// 3. Discover DELTA_*.md files
const deltaFiles = [];
if (explicitDeltaFile && fs.existsSync(explicitDeltaFile)) {
  deltaFiles.push(explicitDeltaFile);
} else {
  const deltaDirs = [
    path.join(hubWorkspace.hubRoot, '03-version-deltas'),
    path.join(docsDir, '03-version-deltas')
  ];
  const seen = new Set();
  for (const dd of deltaDirs) {
    if (!fs.existsSync(dd)) continue;
    for (const f of fs.readdirSync(dd).sort()) {
      if (f.startsWith('DELTA_') && f.endsWith('.md') && !/\.template\.md$/i.test(f)) {
        const abs = path.resolve(dd, f);
        if (!seen.has(abs)) {
          seen.add(abs);
          deltaFiles.push(abs);
        }
      }
    }
  }
}

// Handle --mark-applied early/alongside compilation
if (markAppliedVersion) {
  const existingEntry = deltaState.deltas[markAppliedVersion] || {
    version: markAppliedVersion,
    file: `03-version-deltas/DELTA_to_${markAppliedVersion}.md`,
    synced_at: new Date().toISOString(),
    changes_count: 0
  };
  existingEntry.status = 'APPLIED';
  existingEntry.applied_at = new Date().toISOString();
  deltaState.deltas[markAppliedVersion] = existingEntry;
  deltaState.updated_at = new Date().toISOString();
}

// 4. Parse Delta Files and Group by Target Version
const versionBundles = new Map();

for (const df of deltaFiles) {
  const { fromVersion, toVersion } = extractVersionsFromFilename(df);
  if (targetToVersion && toVersion.toLowerCase() !== targetToVersion.toLowerCase()) continue;

  const raw = fs.readFileSync(df, 'utf8');
  let changes = parseEvolutionTables(raw, path.basename(df));
  if (changes.length === 0) {
    changes = parseBlockStyleDeltas(raw, toVersion, path.basename(df));
  }
  changes = changes.map(c => ({
    ...c,
    version: normalizeVersionKey(c.version || toVersion) || toVersion
  }));

  versionBundles.set(toVersion, {
    fromVersion,
    toVersion,
    filePath: df,
    relFile: path.relative(projectRoot, df).replace(/\\/g, '/'),
    changes
  });
}

// Merge matching Section 10 / Section 15 ledger changes into bundles (or synthetic bundle if no DELTA_*.md)
for (const lc of ledgerChanges) {
  const vKey = normalizeVersionKey(lc.version) || targetToVersion || (versionBundles.size === 1 ? Array.from(versionBundles.keys())[0] : '');
  if (!vKey) continue;
  if (targetToVersion && vKey.toLowerCase() !== targetToVersion.toLowerCase()) continue;

  if (!versionBundles.has(vKey)) {
    // Skip v1.0.0 initial baseline ledger entries when no DELTA file targets v1.0.0
    if (/^v?1\.0\.0$/i.test(vKey) && !targetToVersion) continue;
    versionBundles.set(vKey, {
      fromVersion: 'baseline',
      toVersion: vKey,
      filePath: null,
      relFile: lc.source,
      changes: []
    });
  }

  const bundle = versionBundles.get(vKey);
  const dup = bundle.changes.some(
    x => x.targetId.toUpperCase() === lc.targetId.toUpperCase() && x.current.toLowerCase() === lc.current.toLowerCase()
  );
  if (!dup) bundle.changes.push({ ...lc, version: vKey });
}

function classifyTarget(targetId) {
  const tid = String(targetId || '').toUpperCase();
  if (tid.includes('SEED-')) return 'SEED_CATALOG';
  if (tid.includes('ENUM-')) return 'ENUM_GLOSSARY';
  if (tid.includes('SCR-') || /SCREEN|UI|MODAL|VIEW/i.test(tid)) return 'SCREEN_UI';
  if (tid.includes('BR-') || tid.includes('DOM-')) return 'BUSINESS_RULE';
  if (tid.includes('AC-')) return 'ACCEPTANCE_CRITERIA';
  if (tid.includes('FEATURE-')) return 'FEATURE_SPEC';
  return 'DOMAIN_CONTRACT';
}

function buildWorklistForChanges(changes) {
  const modelsAndMigrations = new Set();
  const controllersAndRequests = new Set();
  const seeders = new Set();
  const enums = new Set();
  const uiAndLocators = new Set();
  const testSuites = new Set();
  const affectedFeatures = new Set();
  const affectedStories = new Set();
  const wbsLineageRows = [];
  const taskWorklist = [];

  for (const ch of changes) {
    const combinedText = `${ch.targetId} ${ch.was} ${ch.current} ${ch.updateNeeded} ${ch.source}`;
    for (const fm of combinedText.matchAll(/\b(FEATURE-[A-Za-z0-9_-]+|FEAT-[A-Za-z0-9_-]+)\b/gi)) {
      affectedFeatures.add(fm[1].toUpperCase().replace(/^FEAT-/, 'FEATURE-'));
    }
    for (const strm of combinedText.matchAll(/\b(STR-[A-Za-z0-9_-]+)\b/gi)) {
      const sid = strm[1].toUpperCase();
      affectedStories.add(sid);
      const wbsStory = wbsData.stories.get(sid);
      if (wbsStory && wbsStory.featureId) affectedFeatures.add(wbsStory.featureId);
    }
    for (const sm of combinedText.matchAll(/\b(SEED-[A-Za-z0-9_-]+)\b/gi)) {
      seeders.add(`Update tracked seeder record for \`${sm[1].toUpperCase()}\` (\`__SeedHistory\` / \`seed_history\` idempotent upsert)`);
    }
    for (const em of combinedText.matchAll(/\b(ENUM-[A-Za-z0-9_-]+)\b/gi)) {
      enums.add(`Sync \`${em[1].toUpperCase()}\` constant values, validation \`in:...\` rules, and bilingual badge labels`);
    }
    for (const scm of combinedText.matchAll(/\b(SCR-[A-Za-z0-9_-]+)\b/gi)) {
      uiAndLocators.add(`Update screen \`${scm[1].toUpperCase()}\` component & verify \`data-testid\` locators`);
    }
    for (const brm of combinedText.matchAll(/\b((?:BR|DOM)-[A-Za-z0-9_-]+)\b/gi)) {
      controllersAndRequests.add(`Update FormRequest / FluentValidation & Domain Service logic for \`${brm[1].toUpperCase()}\`: ${ch.current}`);
    }
    for (const acm of combinedText.matchAll(/\b(AC-[A-Za-z0-9_-]+)\b/gi)) {
      testSuites.add(`Update regression assertion for \`${acm[1].toUpperCase()}\``);
    }

    const cat = classifyTarget(ch.targetId);
    if (cat === 'SEED_CATALOG' && seeders.size === 0) {
      seeders.add(`Update tracked seeder for \`${ch.targetId}\` -> ${ch.current}`);
    } else if (cat === 'ENUM_GLOSSARY' && enums.size === 0) {
      enums.add(`Update enum definition \`${ch.targetId}\` -> ${ch.current}`);
    } else if (cat === 'SCREEN_UI') {
      uiAndLocators.add(`Update UI view & \`data-testid\` attributes for \`${ch.targetId}\` -> ${ch.current}`);
    }
  }

  // Bind against Feature Section 11 (ENG-01..ENG-10), 5-Level WBS & CODEBASE_MAP.md
  for (const fid of affectedFeatures) {
    const fDoc = featureDocs.get(fid);
    const wbsH = wbsData.featureHierarchy.get(fid);
    const cmpId = fDoc?.componentId || wbsH?.componentId || 'CMP-01';
    const epcId = fDoc?.epicId || wbsH?.epicId || 'EPC-01';
    const relId = fDoc?.targetRelease || wbsH?.release || 'REL-1.0';
    const stories = (fDoc?.stories && fDoc.stories.length > 0)
      ? fDoc.stories
      : (wbsH?.stories && wbsH.stories.length > 0
          ? wbsH.stories
          : [{ id: `STR-${fid.replace(/^FEATURE-/i, '')}-01`, title: fDoc?.title || fid, release: relId, sprint: fDoc?.sprint || 'S1' }]);

    for (const st of stories) {
      const shortCode = String(st.id || '').toUpperCase().replace(/^STR-/, '');
      const tskIds = [`TSK-${shortCode}-BE`, `TSK-${shortCode}-WEB`, `TSK-${shortCode}-MOB`, `TSK-${shortCode}-QA`];
      wbsLineageRows.push({
        release: st.release || relId,
        lineage: `${cmpId} -> ${epcId} -> ${fid} -> ${st.id}`,
        tasks: tskIds
      });
      for (const tid of tskIds) {
        taskWorklist.push(`\`${tid}\` (\`${st.release || relId}\` / \`${st.sprint || fDoc?.sprint || 'S1'}\`) — Apply delta patch for \`${st.id}\` (${st.title})`);
      }
    }

    if (fDoc && fDoc.section11.exists) {
      const e01 = fDoc.section11.checks.get('ENG-01');
      if (e01 && e01.binding) modelsAndMigrations.add(`[${fid}] Verify Model/Table binding: \`${e01.binding}\``);
      const e02 = fDoc.section11.checks.get('ENG-02');
      if (e02 && e02.binding) controllersAndRequests.add(`[${fid}] Sync endpoint/controller contract: \`${e02.binding}\``);
      const e04 = fDoc.section11.checks.get('ENG-04');
      if (e04 && e04.binding) uiAndLocators.add(`[${fid}] Sync §2/§3 UI & \`data-testid\` plan: \`${e04.binding}\``);
      const e09 = fDoc.section11.checks.get('ENG-09');
      if (e09 && e09.binding) testSuites.add(`[${fid}] Update bound automated test suite: \`${e09.binding}\``);
    } else {
      testSuites.add(`[${fid}] Update feature test suite \`tests/Feature/${fid}Test.php\` (or stack equivalent)`);
    }
  }

  // Cross-reference CODEBASE_MAP.md assets by keyword overlap
  const keywords = Array.from(new Set(
    changes
      .flatMap(c => `${c.targetId} ${c.current} ${c.updateNeeded}`.toLowerCase().split(/[^a-z0-9]+/))
      .filter(w => w.length >= 4 && !['feature', 'current', 'update', 'needed', 'team', 'from', 'with', 'must', 'should'].includes(w))
  ));

  for (const m of codeAssets.models) {
    const hay = `${m.name} ${m.table} ${m.path}`.toLowerCase();
    if (keywords.some(k => hay.includes(k))) {
      modelsAndMigrations.add(`Model \`${m.name}\` (\`${m.table}\`) at \`${m.path}\``);
    }
  }
  for (const c of codeAssets.controllers) {
    const hay = `${c.name} ${c.path}`.toLowerCase();
    if (keywords.some(k => hay.includes(k))) {
      controllersAndRequests.add(`Controller/Endpoint \`${c.name}\` at \`${c.path}\``);
    }
  }
  for (const v of codeAssets.views) {
    const hay = `${v.name} ${v.path}`.toLowerCase();
    if (keywords.some(k => hay.includes(k))) {
      uiAndLocators.add(`UI Component \`${v.name}\` at \`${v.path}\``);
    }
  }

  if (modelsAndMigrations.size === 0 && changes.length > 0) {
    modelsAndMigrations.add('Inspect `context/CODEBASE_MAP.md` Section 1 & 3 for schema/column impact (apply Expand/Contract if altering columns)');
  }
  if (controllersAndRequests.size === 0 && changes.length > 0) {
    controllersAndRequests.add('Update FormRequest / Validator constraints and Service business rule guards for modified `Target ID`s');
  }
  if (testSuites.size === 0 && changes.length > 0) {
    testSuites.add('Add `WAS -> CURRENT` boundary regression test cases mapped to affected `BR-*` / `AC-*` items');
  }

  if (wbsLineageRows.length === 0 && affectedStories.size > 0) {
    for (const sid of affectedStories) {
      const st = wbsData.stories.get(sid) || { id: sid, componentId: 'CMP-01', epicId: 'EPC-01', featureId: 'FEATURE-001', release: 'REL-1.0', sprint: 'S1', title: sid };
      const shortCode = sid.replace(/^STR-/, '');
      const tskIds = [`TSK-${shortCode}-BE`, `TSK-${shortCode}-WEB`, `TSK-${shortCode}-MOB`, `TSK-${shortCode}-QA`];
      wbsLineageRows.push({
        release: st.release || 'REL-1.0',
        lineage: `${st.componentId || 'CMP-01'} -> ${st.epicId || 'EPC-01'} -> ${st.featureId || 'FEATURE-001'} -> ${sid}`,
        tasks: tskIds
      });
      for (const tid of tskIds) {
        taskWorklist.push(`\`${tid}\` (\`${st.release || 'REL-1.0'}\` / \`${st.sprint || 'S1'}\`) — Apply delta patch for \`${sid}\``);
      }
    }
  }

  return {
    affectedFeatures: Array.from(affectedFeatures),
    wbsLineageRows,
    taskWorklist,
    modelsAndMigrations: Array.from(modelsAndMigrations),
    controllersAndRequests: Array.from(controllersAndRequests),
    seeders: Array.from(seeders),
    enums: Array.from(enums),
    uiAndLocators: Array.from(uiAndLocators),
    testSuites: Array.from(testSuites)
  };
}

function renderDeltaPlanMarkdown(bundle, stateRecord) {
  const work = buildWorklistForChanges(bundle.changes);
  const statusBadge = stateRecord?.status === 'APPLIED' ? '🟢 APPLIED' : '🟡 SYNCED (PENDING APPLICATION)';
  const bulletOrNone = arr => (arr.length > 0 ? arr.map(x => `- [ ] ${x}`).join('\n') : '- _(No changes required in this layer)_');

  return `# Deterministic Delta Execution Plan (\`${bundle.fromVersion} -> ${bundle.toVersion}\`)

> **Target Version:** \`${bundle.toVersion}\` | **Baseline:** \`${bundle.fromVersion}\`  
> **Source Delta Artifact:** \`${bundle.relFile}\`  
> **Execution State:** **${statusBadge}**  
> **Impacted Features:** ${work.affectedFeatures.length > 0 ? work.affectedFeatures.map(f => `\`${f}\``).join(', ') : '`Global / Core Catalogs`'}  
> **Generated At:** \`${new Date().toISOString()}\`

---

## 1. Normative \`WAS -> CURRENT\` Business Change Matrix

| Ver | Ref | Target ID | Category | WAS (Previous Baseline) | CURRENT (New Normative Contract) | Update Needed by Team |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${bundle.changes.length > 0
  ? bundle.changes.map(c => `| \`${c.version || bundle.toVersion}\` | \`${c.ref || '-'}\` | **\`${c.targetId}\`** | \`${classifyTarget(c.targetId)}\` | ${c.was || '-'} | ${c.current || '-'} | ${c.updateNeeded || 'Sync code, tests & handoffs'} |`).join('\n')
  : '| `-` | `-` | `-` | `-` | _(No structured rows detected)_ | - | - |'}

---

## 1B. 5-Level WBS Lineage & Department Task Impact (\`Component -> Epic -> Feature -> Story -> TSK-*\`)

| Target Release | WBS Lineage (\`Component -> Epic -> Feature -> Story\`) | Impacted Engineering Tasks (\`TSK-*\`) |
| :--- | :--- | :--- |
${work.wbsLineageRows.length > 0
  ? work.wbsLineageRows.map(r => `| \`${r.release}\` | \`${r.lineage}\` | ${r.tasks.map(t => `\`${t}\``).join(', ')} |`).join('\n')
  : '| `REL-1.0` | `CMP-01 -> EPC-01 -> Global Catalogs` | `TSK-DELTA-BE`, `TSK-DELTA-QA` |'}

### Department Task Worklist (\`TSK-*\`)
${bulletOrNone(work.taskWorklist)}

---

## 2. Surgical Engineering Worklist (Bound to \`CODEBASE_MAP.md\`)

### 2.1 Models & Zero-Downtime Migrations
${bulletOrNone(work.modelsAndMigrations)}

### 2.2 Controllers, Services & FormRequests / Validators
${bulletOrNone(work.controllersAndRequests)}

### 2.3 \`SEED-*\` Tracked Database Seeders
${bulletOrNone(work.seeders)}

### 2.4 \`ENUM-*\` Constants & Bilingual Status Badges
${bulletOrNone(work.enums)}

### 2.5 Web UI Views & \`data-testid\` Locators (§2 Screen / §3 Lifecycle)
${bulletOrNone(work.uiAndLocators)}

### 2.6 Automated Regression Test Suites
${bulletOrNone(work.testSuites)}

---

## 3. Downstream Re-Handoff Impact (Mobile & QA Gate B)

### 3.1 Mobile (\`02-FLUTTER ENGINE\`) Re-Handoff Checklist
- [ ] **OpenAPI Spec Sync:** Update \`docs/modules/{module}.json\` (or \`docs/openapi.json\`) request/response schemas and enum constraints for \`${bundle.toVersion}\`.
- [ ] **Living Integration Guide:** Refresh \`docs/handoff/{MODULE}_INTEGRATION_GUIDE.md\` with updated \`ENUM-*\` bilingual badges, §7 \`AR / EN\` copy keys, and \`MB-01..15\` (\`MB-12A\` Push / \`MB-12B\` Deep Link) payload changes.
- [ ] **Cycle Handoff Pack:** Run \`node bin/build-cycle-handoff.js --scope=DELTA-${bundle.toVersion} --mode=apply-delta\` to emit immutable \`docs/handoff/cycles/CYCLE-*_HANDOFF.md\` documenting \`WAS -> CURRENT\` DTO notes.
- [ ] **Client SDKs (if enabled):** Re-compile Dart/TS SDKs via \`node bin/build-client-sdk.js\`.

### 3.2 QA Automation Re-Handoff Checklist
- [ ] **Postman Collection v2.1:** Run \`node bin/build-postman.js\` to regenerate \`docs/postman/{module}.postman_collection.json\` with updated payloads & \`{{last_created_id}}\` chaining assertions.
- [ ] **UI Locator Parity:** Re-verify Playwright / Cypress / Appium selectors against updated \`data-testid\` attributes in Section 2.5.
- [ ] **Regression ACs & Seed Fixtures:** Re-run \`@seed-feature\` if \`SEED-*\` defaults changed, execute regression ACs for ${work.affectedFeatures.join(', ') || 'affected modules'}, and seal delta via \`node bin/delta-sync.js --mark-applied=${bundle.toVersion}\`.
`;
}

const deltasOutDir = path.join(docsDir, 'deltas');
if (!fs.existsSync(deltasOutDir)) fs.mkdirSync(deltasOutDir, { recursive: true });

const masterSections = [];
const summaryRecords = [];

for (const [vKey, bundle] of versionBundles.entries()) {
  const prev = deltaState.deltas[vKey];
  const isApplied = (markAppliedVersion && markAppliedVersion.toLowerCase() === vKey.toLowerCase()) || prev?.status === 'APPLIED';
  const versionPlanPath = path.join(deltasOutDir, `DELTA_PLAN_${vKey}.md`);
  const relPlanPath = path.relative(projectRoot, versionPlanPath).replace(/\\/g, '/');

  const record = {
    version: vKey,
    from_version: bundle.fromVersion,
    file: bundle.relFile,
    status: isApplied ? 'APPLIED' : 'SYNCED',
    synced_at: prev?.synced_at || new Date().toISOString(),
    applied_at: isApplied ? (prev?.applied_at || new Date().toISOString()) : null,
    plan_path: relPlanPath,
    changes_count: bundle.changes.length
  };

  deltaState.deltas[vKey] = record;

  const planMd = renderDeltaPlanMarkdown(bundle, record);
  fs.writeFileSync(versionPlanPath, planMd, 'utf8');
  masterSections.push(planMd);
  summaryRecords.push(record);
}

deltaState.updated_at = new Date().toISOString();
fs.writeFileSync(stateFilePath, JSON.stringify(deltaState, null, 2) + '\n', 'utf8');

const masterPlanPath = path.join(docsDir, 'DELTA_EXECUTION_PLAN.md');
if (masterSections.length > 0) {
  // Latest delta plan at top + ledger index if multiple versions exist
  const ordered = masterSections.slice().reverse();
  const ledgerTable = [
    '# Master Business Delta Execution Plan (`WAS -> CURRENT`)',
    '',
    `> **Updated:** \`${new Date().toISOString()}\` | **Tracked Versions:** \`${summaryRecords.length}\` | **State File:** \`docs/business-context/.delta-state.json\``,
    '',
    '| Version | Source Delta | Changes | Execution Status | Versioned Plan |',
    '| :--- | :--- | :-: | :--- | :--- |',
    ...summaryRecords.map(r => `| \`${r.version}\` | \`${r.file}\` | ${r.changes_count} | \`${r.status}\` | [DELTA_PLAN_${r.version}.md](deltas/DELTA_PLAN_${r.version}.md) |`),
    '',
    '---',
    '',
    ordered.join('\n\n---\n\n')
  ].join('\n');
  fs.writeFileSync(masterPlanPath, ledgerTable, 'utf8');
} else {
  const baselineMd = `# Master Business Delta Execution Plan (\`WAS -> CURRENT\`)

> **Updated:** \`${new Date().toISOString()}\` | **Tracked Versions:** \`0\` | **Status:** \`🟢 BASELINE_CLEAN\`

No unapplied \`03-version-deltas/DELTA_*.md\` artifacts detected in active workspace.
`;
  fs.writeFileSync(masterPlanPath, baselineMd, 'utf8');
}

if (isJson) {
  console.log(JSON.stringify({
    updated_at: deltaState.updated_at,
    master_plan: path.relative(projectRoot, masterPlanPath),
    state_file: path.relative(projectRoot, stateFilePath),
    deltas: Object.values(deltaState.deltas)
  }, null, 2));
} else {
  const elapsed = Date.now() - startTime;
  console.log(`✅ Delta Execution Compiler completed in ${elapsed}ms`);
  console.log(`📄 Master Delta Plan : ${path.relative(projectRoot, masterPlanPath)}`);
  console.log(`🗂️  Delta State Ledger: ${path.relative(projectRoot, stateFilePath)} (${Object.keys(deltaState.deltas).length} version(s) tracked)`);
}

