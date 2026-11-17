#!/usr/bin/env node

/**
 * ⚡ InnovaDigits Sprint DAG Planner & Two-Gate Radar Engine (v4.0.0)
 * Supports both BA_AI_SDLC v2.0.0 Centralized Context Hub (`02-sprints/<SprintID>/`)
 * and Legacy BCAS (`docs/business-context/features/<SprintID>/`).
 * Honors `SPRINT_MASTER_PLAN.md` wave hints, `Archetype` (`READ_VIEW | MUTATION_WORKFLOW | INTEGRATION_JOB`),
 * and reports both `Gate A (BA)` and `Gate B (Eng)` readiness columns.
 *
 * Usage:
 *   node bin/sprint-plan.js
 *   node bin/sprint-plan.js --sprint=S1
 *   node bin/sprint-plan.js --sprint=B0 --output=custom/path.md
 *   node bin/sprint-plan.js --json
 */

const fs = require('fs');
const path = require('path');
const {
  resolveProjectAndAiRoot,
  resolveHubWorkspace,
  parseFeatureDocument,
  parseMasterPlanWaves,
  parseBacklogWbs,
  resolveWbsAndPmtoolPaths,
  collectSprintManifests,
  scanHubAndLegacyFeatures
} = require('./lib/hub-utils');

const startTime = Date.now();

// 1. CLI Arguments Parsing
const args = process.argv.slice(2);
let sprintFilter = '';
let explicitHub = null;
let customOutputPath = null;
let isJson = false;

for (const arg of args) {
  if (arg.startsWith('--sprint=')) {
    sprintFilter = arg.split('=')[1].trim();
  } else if (arg.startsWith('--hub=')) {
    explicitHub = path.resolve(arg.split('=')[1].trim());
  } else if (arg.startsWith('--output=')) {
    customOutputPath = arg.split('=')[1].trim();
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Sprint DAG Planner CLI (v4.0.0)

Options:
  --sprint=<ID>      Target sprint/batch identifier (e.g. S1, B0, Sprint-1, all)
  --hub=<path>       Optional project-context-hub root override
  --output=<path>    Custom destination markdown path (Default: docs/business-context/SPRINT_EXECUTION_PLAN.md)
  --json             Output raw JSON plan to stdout
  --help, -h         Show help instructions
`);
    process.exit(0);
  }
}

// 2. Resolve Project Root, Context Hub & Features Directory
const { projectRoot, aiDir } = resolveProjectAndAiRoot(process.cwd(), __dirname);
const hubWorkspace = resolveHubWorkspace(projectRoot, { explicitHubPath: explicitHub, aiDir });
const docsDir = hubWorkspace.docsDir;
const effectiveSprintLabel = sprintFilter || (hubWorkspace.isHubV2 ? 'all' : 'B0');
const defaultOutputFile = path.join(docsDir, 'SPRINT_EXECUTION_PLAN.md');
const outputFile = customOutputPath ? path.resolve(customOutputPath) : defaultOutputFile;

const manifestMap = collectSprintManifests(hubWorkspace);
const masterPlanCandidates = [
  path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md'),
  path.join(docsDir, 'SPRINT_MASTER_PLAN.md'),
  path.join(docsDir, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md')
];
const masterPlanFile = masterPlanCandidates.find(p => fs.existsSync(p));
const masterWaveMap = parseMasterPlanWaves(masterPlanFile);
const { wbsPath } = resolveWbsAndPmtoolPaths(hubWorkspace);
const wbsData = parseBacklogWbs(wbsPath);

let featureFilePaths = scanHubAndLegacyFeatures(hubWorkspace, effectiveSprintLabel);
if (featureFilePaths.length === 0 && effectiveSprintLabel.toLowerCase() !== 'all') {
  featureFilePaths = scanHubAndLegacyFeatures(hubWorkspace, 'all');
}

// 2b. Load Discovered Codebase Models & Minimal API / Controller Routes
function loadCodebaseInventory(rootDir) {
  const models = [];
  const routes = [];
  const seenModels = new Set();
  const seenRoutes = new Set();

  const mapPath = [
    path.join(rootDir, 'context', 'CODEBASE_MAP.md'),
    path.join(rootDir, '.ai', 'context', 'CODEBASE_MAP.md')
  ].find(p => fs.existsSync(p));

  if (mapPath) {
    const mapContent = fs.readFileSync(mapPath, 'utf8');
    const sec1Match = mapContent.match(/## 1\. Backend Models[\s\S]*?(?=\n## |$)/);
    if (sec1Match) {
      for (const m of sec1Match[0].matchAll(/\|\s*`([A-Za-z0-9_]+)`\s*\|\s*[^|]+\|\s*`([^`]+)`\s*\|/g)) {
        const modelName = m[1].trim();
        const tableName = m[2].trim();
        if (!seenModels.has(modelName)) {
          seenModels.add(modelName);
          models.push({ modelName, tableName });
        }
      }
    }

    const epSecMatch = mapContent.match(/## API Endpoints \(Minimal APIs \/ Controllers\)[\s\S]*?(?=\n## |$)/);
    if (epSecMatch) {
      for (const r of epSecMatch[0].matchAll(/\|\s*`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`\s*\|\s*[^|]*\|\s*[^|]*\|\s*`([^`]+)`\s*\|/gi)) {
        const method = r[1].toUpperCase();
        const route = r[2].trim();
        const sourceFile = r[3].trim();
        const key = `${method}:${route.toLowerCase()}`;
        if (!seenRoutes.has(key)) {
          seenRoutes.add(key);
          routes.push({ method, route, sourceFile });
        }
      }
    }
  }

  let projName = path.basename(rootDir);
  for (const sj of [path.join(rootDir, '.ai', 'stack.json'), path.join(rootDir, 'stack.json')]) {
    if (fs.existsSync(sj)) {
      try { projName = JSON.parse(fs.readFileSync(sj, 'utf8'))?.name || projName; break; } catch {}
    }
  }
  const modulesDir = path.join(rootDir, 'docs', 'modules');
  const projSlug = String(projName).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (fs.existsSync(modulesDir)) {
    for (const f of fs.readdirSync(modulesDir)) {
      if (!f.endsWith('.json') || f === 'modules_config.json' || f === 'openapi.json' || f === 'unified.json' || f === `${projSlug}.json` || f.endsWith('_master.json')) continue;
      try {
        const spec = JSON.parse(fs.readFileSync(path.join(modulesDir, f), 'utf8'));
        for (const [routePath, methodsObj] of Object.entries(spec.paths || {})) {
          if (!methodsObj || typeof methodsObj !== 'object') continue;
          for (const verb of ['get', 'post', 'put', 'patch', 'delete']) {
            if (!methodsObj[verb]) continue;
            const method = verb.toUpperCase();
            const key = `${method}:${routePath.toLowerCase()}`;
            if (!seenRoutes.has(key)) {
              seenRoutes.add(key);
              routes.push({ method, route: routePath, sourceFile: `docs/modules/${f}` });
            }
          }
        }
      } catch {}
    }
  }

  return { models, routes };
}

const codebaseInventory = loadCodebaseInventory(projectRoot);

// 3. Parse Feature Specification Documents
function parseFeatureForDag(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFeatureDocument(filePath, { isHubV2: hubWorkspace.isHubV2 });
  const manifestEntry = manifestMap.get(parsed.id);
  const planEntry = masterWaveMap.get(parsed.id);
  const wbsH = wbsData.featureHierarchy.get(parsed.id);

  const explicitWave = parsed.wave || manifestEntry?.wave || planEntry?.wave || null;
  const archetype = (parsed.archetype && parsed.archetype !== 'STANDARD')
    ? parsed.archetype
    : (manifestEntry?.archetype || planEntry?.archetype || 'STANDARD');
  const componentId = parsed.componentId || wbsH?.componentId || 'CMP-01';
  const epicId = parsed.epicId || wbsH?.epicId || 'EPC-01';
  const release = parsed.targetRelease || wbsH?.release || 'REL-1.0';
  const stories = parsed.stories.length > 0 ? parsed.stories : (wbsH?.stories || [
    {
      id: `STR-${parsed.id.replace(/^FEATURE-|^FEAT-/i, '')}-01`,
      title: `${parsed.title} Core Delivery`,
      release,
      sprint: parsed.sprint || effectiveSprintLabel
    }
  ]);
  const taskIds = [];
  stories.forEach((st, idx) => {
    const shortCode = String(st.id || '').toUpperCase().replace(/^STR-/, '') || `${parsed.id.replace(/^FEATURE-/i, '')}-${String(idx + 1).padStart(2, '0')}`;
    taskIds.push(`TSK-${shortCode}-BE`, `TSK-${shortCode}-WEB`, `TSK-${shortCode}-MOB`, `TSK-${shortCode}-QA`);
  });

  const meta = {
    id: parsed.id,
    title: parsed.title,
    componentId,
    epicId,
    release,
    stories,
    taskIds,
    sprint: parsed.sprint || effectiveSprintLabel,
    archetype,
    gateA: parsed.gateA,
    gateB: parsed.gateB,
    readiness: parsed.gateA, // Backward-compatible alias
    version: parsed.version || manifestEntry?.version || '1.0.0',
    featureSrd: parsed.computedSrd,
    risk: 'STANDARD',
    entities: new Set(),
    apiPaths: [],
    upstream: [],
    downstream: [],
    explicitWave,
    wave: explicitWave || 2,
    filePath: path.relative(projectRoot, filePath).replace(/\\/g, '/')
  };

  const riskMatch = content.match(/\|\s*\*\*Risk Profile\*\*\s*\|\s*`?([A-Za-z0-9_]+)`?/i);
  if (riskMatch) meta.risk = riskMatch[1].toUpperCase();

  const upstreamMatch = content.match(/-\s*\*\*Upstream(?:\s+Flows|\s+Dependencies)?:\*\*\s*(.+)$/im) ||
                        content.match(/\|\s*\*\*Upstream(?:\s+Dependencies)?\*\*\s*\|\s*([^|\n]+)\|/i);
  if (upstreamMatch) {
    const refs = upstreamMatch[1].match(/\b(FEATURE-[A-Z0-9_-]+|[A-Z]{2,6}-F?[0-9]+)\b/gi);
    if (refs) meta.upstream = refs.map(r => r.toUpperCase()).filter(r => r !== meta.id);
  }

  const downstreamMatch = content.match(/-\s*\*\*Downstream(?:\s+Flows|\s+Dependencies)?:\*\*\s*(.+)$/im) ||
                          content.match(/\|\s*\*\*Downstream(?:\s+Dependencies)?\*\*\s*\|\s*([^|\n]+)\|/i);
  if (downstreamMatch) {
    const refs = downstreamMatch[1].match(/\b(FEATURE-[A-Z0-9_-]+|[A-Z]{2,6}-F?[0-9]+)\b/gi);
    if (refs) meta.downstream = refs.map(r => r.toUpperCase()).filter(r => r !== meta.id);
  }

  const masterTableMatches = content.match(/\|\s*`?([a-z0-9_]+)`?\s*\(Master\)\s*\|/gi);
  if (masterTableMatches) {
    masterTableMatches.forEach(m => {
      const clean = m.replace(/\||\s|`|\(Master\)/gi, '').trim();
      if (clean && clean.length > 2) meta.entities.add(clean);
    });
  }

  const commonEntities = [
    'users', 'members', 'branches', 'facilities', 'work_orders',
    'maintenance_operations', 'assets', 'technicians', 'invoices',
    'subscriptions', 'payments', 'categories', 'notifications',
    'audit_logs', 'settings', 'roles', 'permissions', 'departments'
  ];

  const lowerContent = content.toLowerCase();
  for (const ent of commonEntities) {
    if (lowerContent.includes(`mod_${ent}`) || lowerContent.includes(`table: ${ent}`) || lowerContent.includes(`'${ent}'`) || lowerContent.includes(`\`${ent}\``)) {
      meta.entities.add(ent);
    }
  }

  for (const cm of codebaseInventory.models) {
    if (cm.modelName.length < 3) continue;
    const escapedModel = cm.modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escapedModel}\\b`).test(content) || lowerContent.includes(`\`${cm.tableName.toLowerCase()}\``)) {
      meta.entities.add(cm.modelName);
    }
  }

  const seenRouteKeys = new Set();
  function pushUniqueRoute(method, rawPath) {
    const cleanMethod = String(method || '').toUpperCase();
    const cleanPath = String(rawPath || '').replace(/`/g, '').trim();
    if (!cleanMethod || !cleanPath) return;
    const normKey = `${cleanMethod}:${cleanPath.replace(/[-_]/g, '').toLowerCase()}`;
    if (!seenRouteKeys.has(normKey)) {
      seenRouteKeys.add(normKey);
      meta.apiPaths.push(`${cleanMethod} ${cleanPath}`);
    }
  }

  const routeRegex = /(GET|POST|PUT|PATCH|DELETE)\s+(`?\/api\/[a-zA-Z0-9_{}:/-]+`?)/gi;
  let rMatch;
  while ((rMatch = routeRegex.exec(content)) !== null) {
    pushUniqueRoute(rMatch[1], rMatch[2]);
  }

  const tableRouteRegex = /\|\s*`?(GET|POST|PUT|PATCH|DELETE)`?\s*\|\s*`?(\/api\/[a-zA-Z0-9_{}:/-]+)`?/gi;
  let trMatch;
  while ((trMatch = tableRouteRegex.exec(content)) !== null) {
    pushUniqueRoute(trMatch[1], trMatch[2]);
  }

  const normContentRoutes = content.replace(/[-_]/g, '').toLowerCase();
  const explicitApiPrefixes = new Set(
    meta.apiPaths.map(rp => {
      const p = rp.split(/\s+/)[1] || '';
      const segs = p.split('/').filter(s => s && !s.startsWith('{') && s !== 'api' && !/^v\d+$/i.test(s));
      return segs[0] ? `/api/${segs[0].replace(/[-_]/g, '').toLowerCase()}` : '';
    }).filter(Boolean)
  );

  for (const ep of codebaseInventory.routes) {
    const srcBase = path.basename(ep.sourceFile || '');
    const epSegs = ep.route.split('/').filter(s => s && !s.startsWith('{') && s !== 'api' && !/^v\d+$/i.test(s));
    const normGroupPrefix = epSegs[0] ? `/api/${epSegs[0].replace(/[-_]/g, '').toLowerCase()}` : '';
    const hasSrcMatch = srcBase && srcBase.endsWith('.cs') && content.includes(srcBase);
    const hasPrefixMatch = normGroupPrefix && (explicitApiPrefixes.has(normGroupPrefix) || normContentRoutes.includes(normGroupPrefix));
    if (hasSrcMatch || hasPrefixMatch) {
      pushUniqueRoute(ep.method, ep.route);
    }
  }

  meta.entities = Array.from(meta.entities).slice(0, 8);
  return meta;
}

const features = featureFilePaths.map(parseFeatureForDag);

// 4. Compute Execution Directed Acyclic Graph (DAG) & Waves
function computeDAG(featureList) {
  const featureMap = new Map();
  featureList.forEach(f => featureMap.set(f.id, f));

  featureList.forEach(f => {
    if (f.explicitWave && [1, 2, 3].includes(f.explicitWave)) {
      f.wave = f.explicitWave;
      return;
    }

    if (f.archetype === 'READ_VIEW' && f.upstream.length === 0) {
      f.wave = 1;
      return;
    }
    if (f.archetype === 'INTEGRATION_JOB') {
      f.wave = 3;
      return;
    }

    const text = `${f.id} ${f.title} ${f.filePath}`.toLowerCase();
    const isWave1 = text.includes('setting') ||
                    text.includes('lookup') ||
                    text.includes('catalog') ||
                    text.includes('category') ||
                    text.includes('master') ||
                    (f.upstream.length === 0 && (text.includes('view') || text.includes('list') || text.includes('profile')));

    const isWave3 = text.includes('approval') ||
                    text.includes('review') ||
                    text.includes('rate') ||
                    text.includes('rating') ||
                    text.includes('notification') ||
                    text.includes('report') ||
                    text.includes('settle') ||
                    text.includes('close') ||
                    text.includes('complete') ||
                    f.upstream.length > 0;

    if (isWave1 && !isWave3) f.wave = 1;
    else if (isWave3) f.wave = 3;
    else f.wave = 2;
  });

  // Topological wave adjustment only for features without a locked explicit BA wave
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    featureList.forEach(f => {
      if (f.explicitWave) return;
      for (const upId of f.upstream) {
        if (featureMap.has(upId)) {
          const upFeature = featureMap.get(upId);
          if (f.wave <= upFeature.wave) {
            f.wave = Math.min(3, upFeature.wave + 1);
            changed = true;
          }
        }
      }
    });
  }

  featureList.sort((a, b) => (a.wave - b.wave) || a.id.localeCompare(b.id));
  return featureList;
}

const plannedFeatures = computeDAG(features);

// 5. Generate Execution Plan Markdown Document
function buildMarkdownReport(featureList, sprintName) {
  const gateAReadyCount = featureList.filter(f => f.gateA === 'READY_FOR_DEV' || f.gateA === 'IMPLEMENTED').length;
  const gateBReadyCount = featureList.filter(f => f.gateB === 'READY_TO_CODE').length;
  const implementedCount = featureList.filter(f => f.gateA === 'IMPLEMENTED').length;
  const blockedCount = featureList.filter(
    f => f.gateA === 'BLOCKED' || f.gateA === 'CANDIDATE' || f.gateA === 'DRAFT' || f.gateB === 'BLOCKED_BY_BA_GAP'
  ).length;
  const total = featureList.length;

  const wave1 = featureList.filter(f => f.wave === 1);
  const wave2 = featureList.filter(f => f.wave === 2);
  const wave3 = featureList.filter(f => f.wave === 3);

  function renderWaveRows(list) {
    if (list.length === 0) return '| - | None | - | - | - | - | - |';
    return list.map(f =>
      `| **${f.id}** | ${f.title} | \`${f.archetype}\` | \`${f.gateA}\` | \`${f.gateB}\` | ${f.entities.length > 0 ? f.entities.join(', ') : 'Local'} | \`${f.apiPaths.length} routes\` |`
    ).join('\n');
  }

  let doc = `# Sprint Execution Plan & Dependency DAG (${sprintName})

> **Sprint:** \`${sprintName}\` | **Layout:** \`${hubWorkspace.layout}\` | **Total Features:** \`${total}\` | **Generated:** \`${new Date().toISOString()}\`  
> **Two-Gate Governance:** Gate A (\`READY_FOR_DEV\` BA Seal) ➔ Gate B (\`READY_TO_CODE\` via \`ENG-01..ENG-10\`).

---

## 1. Executive Two-Gate Readiness Summary

| Metric | Count | Ratio | Status |
| :--- | :--- | :--- | :--- |
| **Gate A (BA) Ready (\`READY_FOR_DEV\`)** | \`${gateAReadyCount}\` | ${total > 0 ? Math.round((gateAReadyCount / total) * 100) : 0}% | ${gateAReadyCount > 0 ? '🟢 BA SEALED' : '🟡 AWAITING BA'} |
| **Gate B (Eng) Ready (\`READY_TO_CODE\`)** | \`${gateBReadyCount}\` | ${total > 0 ? Math.round((gateBReadyCount / total) * 100) : 0}% | ${gateBReadyCount > 0 ? '🟢 ENG SEALED' : (hubWorkspace.isHubV2 ? '🟡 RUN eng:gate' : '⚪ LEGACY MODE')} |
| **Already Implemented (\`IMPLEMENTED\`)** | \`${implementedCount}\` | ${total > 0 ? Math.round((implementedCount / total) * 100) : 0}% | 🔵 BASELINE |
| **Draft / Blocked (\`BLOCKED\` / \`BLOCKED_BY_BA_GAP\`)** | \`${blockedCount}\` | ${total > 0 ? Math.round((blockedCount / total) * 100) : 0}% | ${blockedCount === 0 ? '🟢 ZERO BLOCKERS' : '⚠️ REVIEW REQUIRED'} |
| **Total Features in Sprint Scope** | \`${total}\` | 100% | 📊 FULL REGISTRY |

---

## 2. Dependency Directed Acyclic Graph (Mermaid DAG)

\`\`\`mermaid
graph TD
    classDef w1 fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0369a1;
    classDef w2 fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#92400e;
    classDef w3 fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#15803d;

    subgraph Wave_1["🌊 Wave 1: Foundation & Read Views"]
${wave1.length > 0 ? wave1.map(f => `        ${f.id.replace(/-/g, '_')}["${f.id}: ${f.title.slice(0, 24)} (${f.archetype})"]:::w1`).join('\n') : '        W1_EMPTY["(No Wave 1 Features)"]:::w1'}
    end

    subgraph Wave_2["🌊 Wave 2: Core State & Mutation Workflows"]
${wave2.length > 0 ? wave2.map(f => `        ${f.id.replace(/-/g, '_')}["${f.id}: ${f.title.slice(0, 24)} (${f.archetype})"]:::w2`).join('\n') : '        W2_EMPTY["(No Wave 2 Features)"]:::w2'}
    end

    subgraph Wave_3["🌊 Wave 3: Downstream Lifecycle & Integration Jobs"]
${wave3.length > 0 ? wave3.map(f => `        ${f.id.replace(/-/g, '_')}["${f.id}: ${f.title.slice(0, 24)} (${f.archetype})"]:::w3`).join('\n') : '        W3_EMPTY["(No Wave 3 Features)"]:::w3'}
    end
`;

  featureList.forEach(f => {
    f.upstream.forEach(up => {
      doc += `    ${up.replace(/-/g, '_')} --> ${f.id.replace(/-/g, '_')}\n`;
    });
  });

  doc += `\`\`\`

---

## 3. Wave-by-Wave Execution Plan

### 🌊 Wave 1: Foundation & Master Entities (Parallel Track A)
- **Goal:** Establish lookup tables, \`SEED-*\` / \`ENUM-*\` catalogs, and \`READ_VIEW\` APIs without cross-table lock contention.
| Feature ID | Feature Name | Archetype | Gate A (BA) | Gate B (Eng) | Reused Entities | APIs Mapped |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${renderWaveRows(wave1)}

### 🌊 Wave 2: Core State & Mutations (Parallel Track B)
- **Goal:** Implement \`MUTATION_WORKFLOW\` state transitions, creation forms, and atomic \`X-Idempotency-Key\` locks.
| Feature ID | Feature Name | Archetype | Gate A (BA) | Gate B (Eng) | Reused Entities | APIs Mapped |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${renderWaveRows(wave2)}

### 🌊 Wave 3: Downstream Lifecycle & Side-Effects (Parallel Track C)
- **Goal:** Complete approval gates, \`INTEGRATION_JOB\` workers, push/deep-link dispatch (\`MB-12A/B\`), and analytics exports.
| Feature ID | Feature Name | Archetype | Gate A (BA) | Gate B (Eng) | Reused Entities | APIs Mapped |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${renderWaveRows(wave3)}

---

## 4. 5-Level WBS Lineage & Multi-Stack Task Decomposition (\`CMP -> EPC -> FEATURE -> STR -> TSK\`)

| Feature ID | Release | Lineage (\`Component -> Epic -> Feature -> Story\`) | Archetype | Department Task Worklist (\`TSK-*\`) |
| :--- | :--- | :--- | :--- | :--- |
${featureList.length > 0
  ? featureList.map(f => {
      const storyRefs = (f.stories || []).map(s => s.id).join(', ') || `STR-${f.id.replace(/^FEATURE-/i, '')}-01`;
      const tskRefs = (f.taskIds || []).map(t => `\`${t}\``).join(', ');
      return `| **${f.id}** | \`${f.release}\` | \`${f.componentId} -> ${f.epicId} -> ${f.id} -> ${storyRefs}\` | \`${f.archetype}\` | ${tskRefs} |`;
    }).join('\n')
  : '| - | - | - | - | - |'}

---

## 5. Table Concurrency & Collision Guard

| Table Name | Referencing Features | Concurrency Policy | Hazard Level |
| :--- | :--- | :--- | :--- |
`;

  const entityMap = new Map();
  featureList.forEach(f => {
    f.entities.forEach(ent => {
      if (!entityMap.has(ent)) entityMap.set(ent, []);
      entityMap.get(ent).push(f.id);
    });
  });

  if (entityMap.size === 0) {
    doc += `| \`system_tables\` | Global Scope | Isolated Module Scoping | \`LOW (ISOLATED)\` |\n`;
  } else {
    for (const [table, featIds] of entityMap.entries()) {
      const hazard = featIds.length > 2 ? 'HIGH_CONTENTION' : (featIds.length > 1 ? 'SHARED_READ' : 'LOW_ISOLATED');
      doc += `| \`${table}\` | ${featIds.join(', ')} | ${hazard === 'HIGH_CONTENTION' ? 'Enforce Optimistic Locking / Serialized Wave Execution' : 'Shared Read-Only Access'} | \`${hazard}\` |\n`;
    }
  }

  doc += `
---
*Automated Plan compiled by InnovaDigits Sprint DAG Engine (v4.0.0).*
`;

  return doc;
}

const displaySprint = sprintFilter || (plannedFeatures[0]?.sprint || (hubWorkspace.isHubV2 ? 'ALL' : 'B0'));
const reportMarkdown = buildMarkdownReport(plannedFeatures, displaySprint);

if (isJson) {
  console.log(JSON.stringify({
    sprint: displaySprint,
    layout: hubWorkspace.layout,
    timestamp: new Date().toISOString(),
    total_features: plannedFeatures.length,
    features: plannedFeatures
  }, null, 2));
} else {
  const outDir = path.dirname(outputFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputFile, reportMarkdown);

  const elapsed = Date.now() - startTime;
  console.log('');
  console.log('================================================================================');
  console.log('       INNOVADIGITS SPRINT DAG PLANNER & TWO-GATE RADAR ENGINE (v4.0.0)         ');
  console.log('================================================================================');
  console.log(`Sprint Scope     : ${displaySprint} [Layout: ${hubWorkspace.layout}]`);
  console.log(`Features Scanned : ${plannedFeatures.length} specifications`);
  console.log(`Destination      : ${outputFile}`);
  console.log(`Execution Time   : ${elapsed}ms`);
  console.log('--------------------------------------------------------------------------------');
  console.log('| Wave   | Feature ID     | Archetype         | Gate A (BA)   | Gate B (Eng)   |');
  console.log('|:-------|:---------------|:------------------|:--------------|:---------------|');

  for (const f of plannedFeatures) {
    const wavePad = `Wave ${f.wave}`.padEnd(6, ' ');
    const idPad = f.id.padEnd(14, ' ');
    const archPad = f.archetype.slice(0, 17).padEnd(17, ' ');
    const gaPad = f.gateA.slice(0, 13).padEnd(13, ' ');
    const gbPad = f.gateB.slice(0, 14).padEnd(14, ' ');
    console.log(`| ${wavePad} | ${idPad} | ${archPad} | ${gaPad} | ${gbPad} |`);
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(
    `>>> SPRINT RADAR: Gate A ${plannedFeatures.filter(f => f.gateA === 'READY_FOR_DEV').length}/${plannedFeatures.length} | Gate B ${plannedFeatures.filter(f => f.gateB === 'READY_TO_CODE').length}/${plannedFeatures.length}`
  );
  console.log('================================================================================\n');
}
