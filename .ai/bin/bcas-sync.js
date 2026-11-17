#!/usr/bin/env node

/**
 * 🔄 Universal BCAS & BA_AI_SDLC v2.0.0 Context Hub Auto-Sync Engine (v4.0.0)
 * Zero-dependency workspace synchronizer supporting:
 *   1. BA_AI_SDLC v2.0.0 Centralized Project Context Hub (`00-project-core`, `01-roadmap-and-pm`, `02-sprints`, `03-version-deltas`)
 *   2. Legacy BCAS (`docs/business-context/features/<Sprint>/`) full backward compatibility
 *   3. Two-Gate (`Gate A` -> `Gate B`) & `feature_srd` SHA-256 indexing in `FEATURES_INDEX.md`
 *   4. Automatic cascade to `build-codebase-map.js`, `sprint-plan.js`, and `drift-radar.js` (unless `--no-cascade`)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  expandCliPath,
  resolveProjectAndAiRoot,
  isHubV2Directory,
  resolveHubWorkspace,
  parseFeatureDocument,
  parseMasterPlanWaves,
  parseBacklogWbs,
  parsePmtoolSyncMap,
  resolveWbsAndPmtoolPaths,
  collectSprintManifests,
  scanHubAndLegacyFeatures,
  computeSemanticDigest
} = require('./lib/hub-utils');

const startTime = Date.now();
const args = process.argv.slice(2);

let explicitSource = null;
let noCascade = false;

for (const arg of args) {
  if (arg.startsWith('--source=') || arg.startsWith('--hub=')) {
    explicitSource = path.resolve(expandCliPath(arg.split('=').slice(1).join('=')));
  } else if (arg === '--no-cascade') {
    noCascade = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Universal BCAS & BA_AI_SDLC v2.1.0 Context Hub Sync (v4.1.0)

Usage:
  node bin/bcas-sync.js [--source=<path>] [--hub=<path>] [--no-cascade]
`);
    process.exit(0);
  }
}

const { projectRoot, aiDir } = resolveProjectAndAiRoot(process.cwd(), __dirname);
const osRoot = path.resolve(__dirname, '..');
const templatesRoot = fs.existsSync(path.join(aiDir, 'templates', 'bcas'))
  ? path.join(aiDir, 'templates', 'bcas')
  : path.join(osRoot, 'templates', 'bcas');

const hubWorkspace = resolveHubWorkspace(projectRoot, { explicitHubPath: explicitSource, aiDir });
const docsDir = hubWorkspace.docsDir;
const legacyFeaturesDir = hubWorkspace.legacyFeaturesDir;
const destHubRoot = path.resolve(projectRoot, hubWorkspace.contextHub.hub_root || 'docs/project-context-hub');

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

// Ensure AI_REVIEWER_PROMPT.md exists in docs/business-context/
const reviewerTemplate = path.join(templatesRoot, 'AI_REVIEWER_PROMPT.md');
const reviewerDest = path.join(docsDir, 'AI_REVIEWER_PROMPT.md');
if (!fs.existsSync(reviewerDest) && fs.existsSync(reviewerTemplate)) {
  fs.copyFileSync(reviewerTemplate, reviewerDest);
  console.log(`📋 Initialized AI_REVIEWER_PROMPT.md in ${reviewerDest}`);
}

function safeCopyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (path.resolve(src) === path.resolve(dest)) return true;
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

// Auto-detect source handoff or local Hub v2 directory if not explicitly passed
let sourceDir = explicitSource;
if (!sourceDir) {
  const candidates = [
    destHubRoot,
    path.join(projectRoot, 'project-context-hub'),
    path.join(projectRoot, '09-Engineering-Handoff'),
    path.join(projectRoot, 'docs', '09-Engineering-Handoff'),
    path.join(projectRoot, 'handoff')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      sourceDir = c;
      break;
    }
  }
}

const sourceIsHubV2 = sourceDir ? isHubV2Directory(sourceDir) : isHubV2Directory(destHubRoot);
const projectContextDest = path.join(docsDir, 'PROJECT_CONTEXT.md');

if (sourceIsHubV2 && sourceDir && fs.existsSync(sourceDir)) {
  // Sync BA_AI_SDLC v2.1.0 Hub Structure cleanly into destHubRoot
  const coreFiles = [
    'PROJECT_CONTEXT.md',
    'GLOSSARY_AND_ENUMS.md',
    'SEED_DEFAULTS_CATALOG.md',
    'UX_DESIGN_BRIEF.md'
  ];
  for (const cf of coreFiles) {
    const src = path.join(sourceDir, '00-project-core', cf);
    if (fs.existsSync(src)) {
      safeCopyFile(src, path.join(destHubRoot, '00-project-core', cf));
      safeCopyFile(src, path.join(docsDir, cf));
    }
  }

  // Sync v2.1 _intake/{INTAKE_MANIFEST.md, PROTOTYPE_DISCOVERY_REPORT.md, ...} when present
  const srcIntakeDir = path.join(sourceDir, '_intake');
  if (fs.existsSync(srcIntakeDir)) {
    const destHubIntakeDir = path.join(destHubRoot, '_intake');
    const destDocsIntakeDir = path.join(docsDir, '_intake');
    if (!fs.existsSync(destHubIntakeDir)) fs.mkdirSync(destHubIntakeDir, { recursive: true });
    if (!fs.existsSync(destDocsIntakeDir)) fs.mkdirSync(destDocsIntakeDir, { recursive: true });
    for (const inf of fs.readdirSync(srcIntakeDir)) {
      if (inf.endsWith('.md') || inf.endsWith('.json')) {
        const srcInf = path.join(srcIntakeDir, inf);
        if (fs.statSync(srcInf).isFile()) {
          safeCopyFile(srcInf, path.join(destHubIntakeDir, inf));
          safeCopyFile(srcInf, path.join(destDocsIntakeDir, inf));
        }
      }
    }
  }

  const pmFiles = ['SPRINT_MASTER_PLAN.md', 'CHANGE_IMPACT_REGISTER.md', 'BACKLOG_WBS.md', 'PMTOOL_SYNC_MAP.json'];
  for (const pf of pmFiles) {
    const src = path.join(sourceDir, '01-roadmap-and-pm', pf);
    if (fs.existsSync(src)) {
      safeCopyFile(src, path.join(destHubRoot, '01-roadmap-and-pm', pf));
      safeCopyFile(src, path.join(docsDir, pf));
    }
  }

  // Sync 04-traceability-and-exports/pmtool/* when present
  const srcPmtoolExports = path.join(sourceDir, '04-traceability-and-exports', 'pmtool');
  if (fs.existsSync(srcPmtoolExports)) {
    const destHubPmtool = path.join(destHubRoot, '04-traceability-and-exports', 'pmtool');
    const destDocsPmtool = path.join(docsDir, 'pmtool');
    if (!fs.existsSync(destHubPmtool)) fs.mkdirSync(destHubPmtool, { recursive: true });
    if (!fs.existsSync(destDocsPmtool)) fs.mkdirSync(destDocsPmtool, { recursive: true });
    for (const pf of fs.readdirSync(srcPmtoolExports)) {
      const fullPf = path.join(srcPmtoolExports, pf);
      if (fs.statSync(fullPf).isFile()) {
        safeCopyFile(fullPf, path.join(destHubPmtool, pf));
        safeCopyFile(fullPf, path.join(destDocsPmtool, pf));
      }
    }
  }

  // Sync 02-sprints/<SprintID>/{SPRINT_*_MANIFEST.md, FEATURE-*.md} (excluding _template/ and *.template|example.md)
  const srcSprintsDir = path.join(sourceDir, '02-sprints');
  if (fs.existsSync(srcSprintsDir)) {
    for (const spEntry of fs.readdirSync(srcSprintsDir, { withFileTypes: true })) {
      if (!spEntry.isDirectory() || spEntry.name.startsWith('_') || spEntry.name.startsWith('.')) continue;
      const spSrc = path.join(srcSprintsDir, spEntry.name);
      const spDest = path.join(destHubRoot, '02-sprints', spEntry.name);
      if (!fs.existsSync(spDest)) fs.mkdirSync(spDest, { recursive: true });
      for (const f of fs.readdirSync(spSrc)) {
        if (!f.endsWith('.md') || f.endsWith('.template.md') || f.endsWith('.example.md')) continue;
        if (/^SPRINT_.*_MANIFEST\.md$/i.test(f) || f.startsWith('FEATURE-') || f.startsWith('CANDIDATE_FEATURE-') || f.endsWith('-spec.md')) {
          safeCopyFile(path.join(spSrc, f), path.join(spDest, f));
        }
      }
    }
  }

  // Sync 03-version-deltas/DELTA_*.md
  const srcDeltasDir = path.join(sourceDir, '03-version-deltas');
  if (fs.existsSync(srcDeltasDir)) {
    const destDeltasDir = path.join(destHubRoot, '03-version-deltas');
    if (!fs.existsSync(destDeltasDir)) fs.mkdirSync(destDeltasDir, { recursive: true });
    for (const df of fs.readdirSync(srcDeltasDir)) {
      if (df.startsWith('DELTA_') && df.endsWith('.md')) {
        safeCopyFile(path.join(srcDeltasDir, df), path.join(destDeltasDir, df));
      }
    }
  }

  console.log(`📥 Synchronized BA_AI_SDLC v2.0.0 Context Hub into ${path.relative(projectRoot, destHubRoot) || destHubRoot}`);
} else {
  // Legacy BCAS Mode: ensure docs/business-context/features exists
  if (!fs.existsSync(legacyFeaturesDir)) fs.mkdirSync(legacyFeaturesDir, { recursive: true });

  if (sourceDir && fs.existsSync(sourceDir)) {
    const reviewFile = path.join(sourceDir, 'PROJECT_CONTEXT_REVIEW.md');
    const baseContext = path.join(sourceDir, 'PROJECT_CONTEXT.md');
    if (fs.existsSync(reviewFile)) {
      safeCopyFile(reviewFile, projectContextDest);
      console.log(`📥 Ingested PROJECT_CONTEXT_REVIEW.md into ${projectContextDest}`);
    } else if (fs.existsSync(baseContext)) {
      safeCopyFile(baseContext, projectContextDest);
      console.log(`📥 Ingested PROJECT_CONTEXT.md from ${sourceDir}`);
    }

    function scanLegacySource(dir) {
      if (!fs.existsSync(dir)) return [];
      let out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out = out.concat(scanLegacySource(full));
        else if (entry.isFile() && (entry.name.startsWith('FEATURE-') || entry.name.startsWith('CANDIDATE_FEATURE-') || entry.name.endsWith('-spec.md'))) {
          out.push(full);
        }
      }
      return out;
    }

    for (const filePath of scanLegacySource(sourceDir)) {
      try {
        const parsed = parseFeatureDocument(filePath, { isHubV2: false });
        const sprintFolder = parsed.sprint && parsed.sprint !== 'General' ? parsed.sprint : 'Unassigned';
        const targetFolder = path.join(legacyFeaturesDir, sprintFolder);
        if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
        safeCopyFile(filePath, path.join(targetFolder, path.basename(filePath)));
      } catch (err) {
        console.error(`⚠️ Failed to ingest legacy feature ${filePath}: ${err.message}`);
      }
    }
  }
}

// Re-resolve active Hub Workspace after ingestion & enforce single canonical truth
const activeWorkspace = resolveHubWorkspace(projectRoot, { explicitHubPath: explicitSource, aiDir });
const hubV2Active = sourceIsHubV2 || activeWorkspace.isHubV2;
const canonicalCoreContext = path.join(destHubRoot, '00-project-core', 'PROJECT_CONTEXT.md');

if (hubV2Active) {
  // NEVER fall back to UCMS PROJECT_CONTEXT_TEMPLATE.md when Hub v2 layout is active
  if (fs.existsSync(canonicalCoreContext)) {
    safeCopyFile(canonicalCoreContext, projectContextDest);
  }
  if (fs.existsSync(legacyFeaturesDir)) {
    console.warn(
      '⚠️  [HYBRID-POLLUTION-GUARD] Legacy docs/business-context/features/ detected alongside active project-context-hub/. Ignoring legacy features to preserve 100% 02-sprints/ canonical truth.'
    );
  }
} else if (!fs.existsSync(projectContextDest)) {
  // Fallback to template ONLY in pure Legacy BCAS mode
  const contextTemplate = path.join(templatesRoot, 'PROJECT_CONTEXT_TEMPLATE.md');
  if (fs.existsSync(contextTemplate)) {
    fs.copyFileSync(contextTemplate, projectContextDest);
    console.log(`✨ Scaffolded PROJECT_CONTEXT.md from template in ${projectContextDest}`);
  }
}

const manifestMap = collectSprintManifests(activeWorkspace);
const masterPlanPath = fs.existsSync(path.join(activeWorkspace.hubRoot, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md'))
  ? path.join(activeWorkspace.hubRoot, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md')
  : path.join(docsDir, 'SPRINT_MASTER_PLAN.md');
const masterWaveMap = parseMasterPlanWaves(masterPlanPath);
const { wbsPath, syncMapPath } = resolveWbsAndPmtoolPaths(activeWorkspace);
const wbsData = parseBacklogWbs(wbsPath);
const pmtoolMap = parsePmtoolSyncMap(syncMapPath);

const featureFiles = scanHubAndLegacyFeatures(activeWorkspace, 'all');
const indexedFeatures = [];

for (const filePath of featureFiles) {
  try {
    const parsed = parseFeatureDocument(filePath, { isHubV2: activeWorkspace.isHubV2 });
    const manifestEntry = manifestMap.get(parsed.id);
    const planEntry = masterWaveMap.get(parsed.id);
    const wbsHierarchy = wbsData.featureHierarchy.get(parsed.id);

    const waveNum = parsed.wave || manifestEntry?.wave || planEntry?.wave || null;
    const archetype = (parsed.archetype && parsed.archetype !== 'STANDARD')
      ? parsed.archetype
      : (manifestEntry?.archetype || planEntry?.archetype || 'STANDARD');
    const version = parsed.version || manifestEntry?.version || '1.0.0';
    const componentId = parsed.componentId || wbsHierarchy?.componentId || 'CMP-01';
    const epicId = parsed.epicId || wbsHierarchy?.epicId || 'EPC-01';
    const release = parsed.targetRelease || wbsHierarchy?.release || 'REL-1.0';
    const storyList = parsed.stories.length > 0 ? parsed.stories : (wbsHierarchy?.stories || []);
    const storyCount = storyList.length;
    const pmtoolStatus = pmtoolMap.featureStatus.get(parsed.id) ||
      (storyList.length > 0 && storyList.some(s => pmtoolMap.storyStatus.has(s.id))
        ? pmtoolMap.storyStatus.get(storyList.find(s => pmtoolMap.storyStatus.has(s.id)).id)
        : (pmtoolMap.exists ? pmtoolMap.syncStatus : 'UNSYNCED'));
    const relFromDocs = path.relative(docsDir, filePath).replace(/\\/g, '/');

    indexedFeatures.push({
      id: parsed.id,
      title: parsed.title,
      component: componentId,
      epic: epicId,
      release,
      sprint: parsed.sprint,
      wave: waveNum ? `Wave ${waveNum}` : 'Auto',
      storyCount,
      pmtoolSyncStatus: pmtoolStatus,
      archetype,
      gateA: parsed.gateA,
      gateB: parsed.gateB,
      version,
      featureSrd: parsed.computedSrd.slice(0, 16),
      fullSrd: parsed.computedSrd,
      openBlockers: parsed.openBlockers > 0 ? `${parsed.openBlockers} Open` : '0',
      relPath: relFromDocs
    });
  } catch (err) {
    console.error(`⚠️ Failed parsing ${filePath}: ${err.message}`);
  }
}

indexedFeatures.sort((a, b) => a.sprint.localeCompare(b.sprint) || a.wave.localeCompare(b.wave) || a.id.localeCompare(b.id));

const syncedArtifactsBadges = [
  activeWorkspace.v21Artifacts?.hasIntakeManifest ? '`INTAKE_MANIFEST.md`' : null,
  activeWorkspace.v21Artifacts?.hasPrototypeDiscovery ? '`PROTOTYPE_DISCOVERY_REPORT.md`' : null,
  activeWorkspace.v21Artifacts?.hasUxDesignBrief ? '`UX_DESIGN_BRIEF.md`' : null,
  wbsData.exists ? '`BACKLOG_WBS.md`' : null,
  pmtoolMap.exists ? '`PMTOOL_SYNC_MAP.json`' : null
].filter(Boolean);

const indexLines = [
  '# Master Features Index (BA_AI_SDLC v2.1.0, 5-Level WBS & Two-Gate Matrix)',
  '',
  `> **Generated:** ${new Date().toISOString()} | **Layout:** \`${activeWorkspace.layout}\` | **Total Features:** ${indexedFeatures.length}`,
  `> **Scope Mode:** \`${activeWorkspace.scopeMode || 'FULL_PROJECT'}\` | **Intake Mode:** \`${activeWorkspace.intakeMode || 'standard'}\`${syncedArtifactsBadges.length > 0 ? ` | **v2.1 Artifacts:** ${syncedArtifactsBadges.join(', ')}` : ''}`,
  '> **Purpose:** Authoritative 5-Level WBS (`Component -> Epic -> Feature -> Story -> Task`), Two-Gate (`READY_FOR_DEV` -> `READY_TO_CODE`) readiness & `feature_srd` integrity ledger.',
  '',
  '| Feature ID | Title | Component | Epic | Release | Sprint | Wave | Story Count | PMTool Sync Status | Archetype | Gate A Status | Gate B Status | Version | `feature_srd` (SHA-256) | Blockers | Spec Link |',
  '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
];

if (indexedFeatures.length === 0) {
  indexLines.push('| _(None detected)_ | - | - | - | - | - | - | 0 | - | - | - | - | - | - | - | - |');
} else {
  for (const item of indexedFeatures) {
    indexLines.push(
      `| \`${item.id}\` | ${item.title} | \`${item.component}\` | \`${item.epic}\` | \`${item.release}\` | \`${item.sprint}\` | \`${item.wave}\` | ${item.storyCount} | \`${item.pmtoolSyncStatus}\` | \`${item.archetype}\` | \`${item.gateA}\` | \`${item.gateB}\` | \`${item.version}\` | \`${item.featureSrd}\` | ${item.openBlockers} | [${path.basename(item.relPath)}](${item.relPath}) |`
    );
  }
}
indexLines.push('');
fs.writeFileSync(path.join(docsDir, 'FEATURES_INDEX.md'), indexLines.join('\n'), 'utf8');

// Cascade Engines (unless --no-cascade)
const mapScript = path.join(__dirname, 'build-codebase-map.js');
const sprintPlanScript = path.join(__dirname, 'sprint-plan.js');
const driftRadarScript = path.join(__dirname, 'drift-radar.js');
const reverseArchScript = path.join(__dirname, 'reverse-architect.js');

if (!noCascade) {
  if (fs.existsSync(mapScript)) {
    try {
      execFileSync(process.execPath, [mapScript], { cwd: projectRoot, stdio: 'ignore' });
    } catch (err) {
      console.error(`⚠️ Codebase map build warning: ${err.message}`);
    }
  }
}

const mapCandidates = [
  path.join(projectRoot, 'context', 'CODEBASE_MAP.md'),
  path.join(projectRoot, '.ai', 'context', 'CODEBASE_MAP.md'),
  path.join(aiDir, 'context', 'CODEBASE_MAP.md')
];
const codebaseMapFile = mapCandidates.find(p => fs.existsSync(p));
let modelCount = 0;
let tableCount = 0;
let contractCount = 0;

if (codebaseMapFile) {
  const mapContent = fs.readFileSync(codebaseMapFile, 'utf8');
  const modelMatch = mapContent.match(/## 1\. (?:Backend|Eloquent) Models \((\d+)\)/);
  if (modelMatch) modelCount = parseInt(modelMatch[1], 10);
  const tableMatch = mapContent.match(/## \d+\. Database Tables & Migrations \((\d+)\)/);
  if (tableMatch) tableCount = parseInt(tableMatch[1], 10);
  const contractMatch = mapContent.match(/## \d+\. Contracts & Interfaces \((\d+)\)/);
  if (contractMatch) contractCount = parseInt(contractMatch[1], 10);
}

// Update Section 2A identically across canonical 00-project-core/PROJECT_CONTEXT.md and docs/business-context/PROJECT_CONTEXT.md
const section2aHeader = '## 2A. Verified Codebase Master Entities Map (Auto-Discovered)';
const section2aBlock = `${section2aHeader}

> **Authoritative Codebase Index:** \`.ai/context/CODEBASE_MAP.md\` (Auto-synced via \`node bin/bcas-sync.js\`)  
> **Discovered Codebase Assets:** **${modelCount}** Backend Models, **${tableCount}** Database Tables, **${contractCount}** Service Contracts.  
> **Architecture Invariant:** Cross-domain relationships MUST reference scalar IDs only (\`tenant_id\`, \`organization_id\`, \`user_id\`). Direct SQL \`JOIN\` across module table boundaries is strictly prohibited.
`;

function upsertSection2A(rawContent) {
  let contextContent = rawContent;
  if (contextContent.includes(section2aHeader)) {
    contextContent = contextContent.replace(
      new RegExp(`## 2A\\. Verified Codebase Master Entities Map[\\s\\S]*?(?=## 3\\.|## 4\\.|$)`),
      section2aBlock + '\n'
    );
  } else if (contextContent.includes('## 2.')) {
    if (/\n## 3\./.test(contextContent)) {
      contextContent = contextContent.replace(/(## 2\.[^\n]*[\s\S]*?(?=\n## 3\.))/m, `$1\n\n${section2aBlock}\n`);
    } else {
      contextContent = `${contextContent.trimEnd()}\n\n${section2aBlock}\n`;
    }
  } else {
    contextContent += `\n\n${section2aBlock}\n`;
  }
  if (/\|\s*\*\*Semantic Digest\*\*\s*\|\s*`?SRD-CTX-/i.test(contextContent)) {
    const newDigest = computeSemanticDigest(contextContent, 'CTX');
    contextContent = contextContent.replace(
      /(\|\s*\*\*Semantic Digest\*\*\s*\|\s*)`?[^|`\n]+`?(\s*\|)/i,
      `$1\`${newDigest}\`$2`
    );
  }
  return contextContent;
}

if (hubV2Active && fs.existsSync(canonicalCoreContext)) {
  const syncedContext = upsertSection2A(fs.readFileSync(canonicalCoreContext, 'utf8'));
  fs.writeFileSync(canonicalCoreContext, syncedContext, 'utf8');
  if (!fs.existsSync(path.dirname(projectContextDest))) {
    fs.mkdirSync(path.dirname(projectContextDest), { recursive: true });
  }
  fs.writeFileSync(projectContextDest, syncedContext, 'utf8');
} else if (fs.existsSync(projectContextDest)) {
  const updatedLegacy = upsertSection2A(fs.readFileSync(projectContextDest, 'utf8'));
  fs.writeFileSync(projectContextDest, updatedLegacy, 'utf8');
}

if (!noCascade) {
  for (const [scriptPath, label] of [
    [sprintPlanScript, '⚡ Sprint DAG Planner synchronized docs/business-context/SPRINT_EXECUTION_PLAN.md'],
    [driftRadarScript, '🛰️ Semantic Drift & Conflict Radar synchronized docs/business-context/DRIFT_RADAR_REPORT.md'],
    [reverseArchScript, '🏛️ Reverse Architecture Visualizer synchronized docs/architecture/LIVE_SYSTEM_ARCHITECTURE.md']
  ]) {
    if (fs.existsSync(scriptPath)) {
      try {
        execFileSync(process.execPath, [scriptPath], { cwd: projectRoot, stdio: 'ignore' });
        console.log(label);
      } catch {}
    }
  }
}

const duration = Date.now() - startTime;
console.log(`✅ Context Hub & BCAS Synchronization completed in ${duration}ms [Layout: ${activeWorkspace.layout} | Scope: ${activeWorkspace.scopeMode} | Intake: ${activeWorkspace.intakeMode}]`);
console.log(`📁 Business Context Root: ${docsDir}`);
console.log(`📑 Features Indexed: ${indexedFeatures.length} (Index: ${path.join(docsDir, 'FEATURES_INDEX.md')})`);
console.log(`🗺️ Codebase Map Bound: ${modelCount} Models, ${tableCount} Tables, ${contractCount} Contracts`);
