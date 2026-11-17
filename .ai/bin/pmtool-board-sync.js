#!/usr/bin/env node

/**
 * 📋 InnovaDigits 5-Level WBS & Story-to-Task Engineering Decomposer (`bin/pmtool-board-sync.js` v4.2.0)
 * Decomposes `Gate B (READY_TO_CODE)` features & `§1B` Stories (`STR-*`) into concrete department tasks (`TSK-*`):
 *   - `TSK-<StoryNum>-BE`  : Backend API, Migration/Model, `SEED-*` Seeder, Security/IDOR tests (`ENG-01..03, 05..08`)
 *   - `TSK-<StoryNum>-WEB` : Frontend View/Component, `ENUM-*` badges, `data-testid` injection (`ENG-04`, when web stack active)
 *   - `TSK-<StoryNum>-MOB` : `02-FLUTTER ENGINE` screen integration, `MB-01..15` states (`ENG-10`, when mobile handoff applies)
 *   - `TSK-<StoryNum>-QA`  : Postman runner assertions, `AC-*` & `DOM-*` E2E verification (`ENG-09, ENG-10`)
 *
 * Outputs:
 *   - `docs/business-context/PMTOOL_SPRINT_TASKS.md`
 *   - `docs/business-context/PMTOOL_SPRINT_TASKS.csv`
 *   - Updates `BACKLOG_WBS.md` (Section 4) & `PMTOOL_SYNC_MAP.json` when `--write-hub` is passed
 *   - Exports `.xlsx` import sheets preserving `Y..AG` dropdown lists when `--template=<xlsx>` is passed
 *
 * Zero external npm dependencies (uses Node.js built-in `fs`, `path`, `zlib`).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  expandCliPath,
  resolveProjectAndAiRoot,
  resolveHubWorkspace,
  parseFeatureDocument,
  parseBacklogWbs,
  parsePmtoolSyncMap,
  resolveWbsAndPmtoolPaths,
  parseEvolutionTables,
  scanHubAndLegacyFeatures
} = require('./lib/hub-utils');

const startTime = Date.now();
const args = process.argv.slice(2);

let explicitHub = null;
let sprintFilter = '';
let releaseFilter = '';
let deltaFilter = '';
let templateXlsxPath = null;
let customOutputXlsx = null;
let writeHub = false;
let waveMode = 'tasks'; // 'stories' | 'tasks' | 'all'
let isJson = false;

for (const arg of args) {
  if (arg.startsWith('--hub=')) {
    explicitHub = path.resolve(expandCliPath(arg.slice('--hub='.length)));
  } else if (arg.startsWith('--sprint=')) {
    sprintFilter = arg.slice('--sprint='.length).trim();
  } else if (arg.startsWith('--release=')) {
    releaseFilter = arg.slice('--release='.length).trim().toUpperCase();
  } else if (arg.startsWith('--delta=')) {
    deltaFilter = arg.slice('--delta='.length).trim();
  } else if (arg.startsWith('--template=')) {
    templateXlsxPath = path.resolve(expandCliPath(arg.slice('--template='.length)));
  } else if (arg.startsWith('--output-xlsx=')) {
    customOutputXlsx = path.resolve(expandCliPath(arg.slice('--output-xlsx='.length)));
  } else if (arg.startsWith('--wave=') || arg.startsWith('--type=')) {
    waveMode = arg.split('=')[1].trim().toLowerCase();
  } else if (arg === '--write-hub') {
    writeHub = true;
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits 5-Level WBS & PMTool Task Board Decomposer (v4.2.0)

Usage:
  node bin/pmtool-board-sync.js [options]

Options:
  --hub=<path>             Project Context Hub root override (supports ~/...)
  --sprint=<SprintID>      Filter stories & tasks by Sprint ID (e.g. S1)
  --release=<RelCode>      Filter stories & tasks by Release Code (e.g. REL-1.0)
  --delta=<vX.Y.Z>         Filter/annotate tasks impacted by a target Delta version (e.g. v1.1.0)
  --template=<xlsx>        Optional PMTool backlog-import-template.xlsx to populate (preserves Y..AG dropdowns)
  --output-xlsx=<xlsx>     Optional output path for generated .xlsx import sheet
  --wave=<stories|tasks>   Export wave type when generating .xlsx (default: tasks)
  --write-hub              Update BACKLOG_WBS.md (Section 4) and PMTOOL_SYNC_MAP.json in Hub
  --json                   Output structured JSON summary to stdout
`);
    process.exit(0);
  }
}

const { projectRoot, aiDir } = resolveProjectAndAiRoot(process.cwd(), __dirname);
const hubWorkspace = resolveHubWorkspace(projectRoot, { explicitHubPath: explicitHub, aiDir });
const docsDir = hubWorkspace.docsDir;
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const stackCfg = hubWorkspace.stackConfig || {};
const frontendFlags = stackCfg?.stacks?.frontend || {};
const webStackActive = Object.values(frontendFlags).some(Boolean) ||
  stackCfg?.security_profile?.surfaces?.web_spa !== false;
const mobileHandoffActive = Boolean(
  stackCfg?.stacks?.workflows?.handoff ||
  stackCfg?.stacks?.workflows?.cycle_handoff ||
  stackCfg?.stacks?.client_sdk?.dart ||
  stackCfg?.security_profile?.surfaces?.mobile_app
);

const { wbsPath, syncMapPath } = resolveWbsAndPmtoolPaths(hubWorkspace);
const wbsData = parseBacklogWbs(wbsPath);
const pmtoolMap = parsePmtoolSyncMap(syncMapPath);

// Collect Delta impacted IDs when --delta=<vX.Y.Z> is provided
const deltaImpactedIds = new Set();
const deltaNotesByTarget = new Map();
if (deltaFilter) {
  const normDelta = deltaFilter.replace(/^v/i, '');
  const deltaDirs = [
    path.join(hubWorkspace.hubRoot, '03-version-deltas'),
    path.join(docsDir, '03-version-deltas')
  ];
  for (const dd of deltaDirs) {
    if (!fs.existsSync(dd)) continue;
    for (const f of fs.readdirSync(dd)) {
      if (f.startsWith('DELTA_') && f.endsWith('.md') && f.toLowerCase().includes(normDelta.toLowerCase())) {
        const raw = fs.readFileSync(path.join(dd, f), 'utf8');
        const rows = parseEvolutionTables(raw, f);
        for (const r of rows) {
          const text = `${r.targetId} ${r.was} ${r.current} ${r.updateNeeded}`;
          for (const m of text.matchAll(/\b((?:FEATURE|FEAT|STR|BR|SEED|ENUM|DOM|SCR|AC)-[A-Za-z0-9_-]+)\b/gi)) {
            const token = m[1].toUpperCase().replace(/^FEAT-/, 'FEATURE-');
            deltaImpactedIds.add(token);
            deltaNotesByTarget.set(token, `${r.targetId}: WAS (${r.was}) -> CURRENT (${r.current})`);
          }
        }
      }
    }
  }
}

const featureFiles = scanHubAndLegacyFeatures(hubWorkspace, sprintFilter || 'all');
const parsedFeatures = [];

for (const fp of featureFiles) {
  try {
    const doc = parseFeatureDocument(fp, { isHubV2: hubWorkspace.isHubV2 });
    parsedFeatures.push(doc);
  } catch {}
}

// Prefer Gate B (READY_TO_CODE) or Gate A (READY_FOR_DEV) features
const eligibleFeatures = parsedFeatures.filter(
  f => f.gateB === 'READY_TO_CODE' || f.gateA === 'READY_FOR_DEV' || f.gateA === 'IMPLEMENTED'
);
const activeFeatures = eligibleFeatures.length > 0 ? eligibleFeatures : parsedFeatures;

function deriveStoryShortCode(storyId, featureId, idx) {
  const strClean = String(storyId || '').toUpperCase().replace(/^STR-/, '');
  if (strClean) return strClean;
  const featNum = String(featureId || '001').replace(/^FEATURE-|^FEAT-/i, '');
  return `${featNum}-${String(idx + 1).padStart(2, '0')}`;
}

function getEngBinding(doc, checkId, fallback) {
  const row = doc.section11?.checks?.get(checkId);
  if (row && row.binding && row.binding.length >= 3) return row.binding;
  return fallback;
}

const allStories = [];
const allTasks = [];

for (const doc of activeFeatures) {
  const wbsH = wbsData.featureHierarchy.get(doc.id);
  const componentId = doc.componentId || wbsH?.componentId || 'CMP-01';
  const epicId = doc.epicId || wbsH?.epicId || 'EPC-01';
  const featureRelease = doc.targetRelease || wbsH?.release || 'REL-1.0';
  const featureSprint = doc.sprint || wbsH?.sprint || 'S1';

  let stories = doc.stories && doc.stories.length > 0
    ? doc.stories
    : (wbsH?.stories && wbsH.stories.length > 0 ? wbsH.stories : []);

  if (stories.length === 0) {
    const featNum = doc.id.replace(/^FEATURE-|^FEAT-/i, '');
    stories = [
      {
        id: `STR-${featNum}-01`,
        featureId: doc.id,
        componentId,
        epicId,
        title: `${doc.title} Core Delivery`,
        release: featureRelease,
        sprint: featureSprint,
        points: '5',
        acRefs: 'AC-01..AC-04',
        status: doc.gateB === 'READY_TO_CODE' ? 'READY_TO_CODE' : doc.gateA
      }
    ];
  }

  stories.forEach((st, idx) => {
    const storyRelease = (st.release || featureRelease || 'REL-1.0').toUpperCase();
    const storySprint = st.sprint || featureSprint || 'S1';

    if (releaseFilter && storyRelease !== releaseFilter) return;
    if (sprintFilter && sprintFilter.toLowerCase() !== 'all' && storySprint.toLowerCase() !== sprintFilter.toLowerCase()) return;

    if (deltaFilter && deltaImpactedIds.size > 0) {
      const hit = deltaImpactedIds.has(doc.id) ||
        deltaImpactedIds.has(st.id) ||
        doc.seedRefs.some(s => deltaImpactedIds.has(s)) ||
        doc.enumRefs.some(e => deltaImpactedIds.has(e));
      if (!hit) return;
    }

    const shortCode = deriveStoryShortCode(st.id, doc.id, idx);
    const deltaNote = deltaNotesByTarget.get(st.id) || deltaNotesByTarget.get(doc.id) || '';
    const enrichedStory = {
      id: st.id,
      featureId: doc.id,
      featureTitle: doc.title,
      componentId: st.componentId || componentId,
      epicId: st.epicId || epicId,
      title: st.title,
      release: storyRelease,
      sprint: storySprint,
      points: st.points || '3',
      acRefs: st.acRefs || 'AC-01',
      gateB: doc.gateB,
      archetype: doc.archetype,
      deltaVersion: deltaFilter || '',
      deltaNote
    };
    allStories.push(enrichedStory);

    const eng01 = getEngBinding(doc, 'ENG-01', 'Domain Model & Migration');
    const eng02 = getEngBinding(doc, 'ENG-02', 'REST API Endpoint & Envelope');
    const eng03 = getEngBinding(doc, 'ENG-03', [doc.seedRefs.join(', '), doc.enumRefs.join(', ')].filter(Boolean).join(' & ') || 'Catalogs');
    const eng04 = getEngBinding(doc, 'ENG-04', `UI Screen (${doc.screenRefs.join(', ') || '§2'}) & data-testid locators`);
    const eng06 = getEngBinding(doc, 'ENG-06', 'Tenant/IDOR & RBAC Policy Guard');
    const eng09 = getEngBinding(doc, 'ENG-09', `Automated test suite (${doc.id}Test)`);
    const eng10 = getEngBinding(doc, 'ENG-10', 'Mobile Integration Guide (MB-01..15) & Postman v2.1');

    // 1. Backend Task (TSK-*-BE)
    allTasks.push({
      id: `TSK-${shortCode}-BE`,
      storyId: enrichedStory.id,
      featureId: doc.id,
      componentId: enrichedStory.componentId,
      epicId: enrichedStory.epicId,
      department: 'BE',
      assigneeRole: 'Backend Engineer',
      title: `[BE] ${enrichedStory.title} — API, Model/Migration, Seeders & IDOR Guard`,
      description: `Implement ${eng01}; expose ${eng02}; bind ${eng03}; enforce ${eng06}.${deltaNote ? ` [Delta ${deltaFilter}: ${deltaNote}]` : ''}`,
      release: storyRelease,
      sprint: storySprint,
      estimateHours: doc.archetype === 'READ_VIEW' ? 4 : 6,
      priority: 'High',
      status: pmtoolMap.taskStatus.get(`TSK-${shortCode}-BE`) || 'READY_TO_CODE',
      engBinding: `${eng01} | ${eng02}`
    });

    // 2. Frontend Web Task (TSK-*-WEB) — when web stack is active
    if (webStackActive) {
      allTasks.push({
        id: `TSK-${shortCode}-WEB`,
        storyId: enrichedStory.id,
        featureId: doc.id,
        componentId: enrichedStory.componentId,
        epicId: enrichedStory.epicId,
        department: 'WEB',
        assigneeRole: 'Frontend Engineer',
        title: `[WEB] ${enrichedStory.title} — UI View, ENUM Badges & data-testid`,
        description: `Build §2/§3 UI states (${doc.lifecycleStates.join(', ') || 'LOADING, EMPTY, ERROR, POPULATED'}), bind ${ doc.enumRefs.join(', ') || 'ENUM-*' } badges & §7 AR/EN copy, inject ${eng04}.${deltaNote ? ` [Delta ${deltaFilter}: ${deltaNote}]` : ''}`,
        release: storyRelease,
        sprint: storySprint,
        estimateHours: 4,
        priority: 'High',
        status: pmtoolMap.taskStatus.get(`TSK-${shortCode}-WEB`) || 'READY_TO_CODE',
        engBinding: eng04
      });
    }

    // 3. Mobile Task (TSK-*-MOB) — when mobile handoff applies
    if (mobileHandoffActive) {
      allTasks.push({
        id: `TSK-${shortCode}-MOB`,
        storyId: enrichedStory.id,
        featureId: doc.id,
        componentId: enrichedStory.componentId,
        epicId: enrichedStory.epicId,
        department: 'MOB',
        assigneeRole: 'Mobile Engineer (Flutter)',
        title: `[MOB] ${enrichedStory.title} — 02-FLUTTER ENGINE Screen & MB-01..15 States`,
        description: `Integrate ${eng02} into Flutter screen, handle MB-01..15 (offline/retry/deep-link) states & §7 AR/EN localization per ${eng10}.${deltaNote ? ` [Delta ${deltaFilter}: ${deltaNote}]` : ''}`,
        release: storyRelease,
        sprint: storySprint,
        estimateHours: 4,
        priority: 'Medium',
        status: pmtoolMap.taskStatus.get(`TSK-${shortCode}-MOB`) || 'READY_TO_CODE',
        engBinding: eng10
      });
    }

    // 4. QA Task (TSK-*-QA)
    allTasks.push({
      id: `TSK-${shortCode}-QA`,
      storyId: enrichedStory.id,
      featureId: doc.id,
      componentId: enrichedStory.componentId,
      epicId: enrichedStory.epicId,
      department: 'QA',
      assigneeRole: 'QA Automation Engineer',
      title: `[QA] ${enrichedStory.title} — Postman Assertions, AC & DOM-* E2E Suite`,
      description: `Verify ${enrichedStory.acRefs} & ${doc.domRefs.join(', ') || 'DOM-*'} invariants via ${eng09}, Postman v2.1 runner assertions, and ${eng04} E2E selectors.${deltaNote ? ` [Delta ${deltaFilter}: ${deltaNote}]` : ''}`,
      release: storyRelease,
      sprint: storySprint,
      estimateHours: 3,
      priority: 'High',
      status: pmtoolMap.taskStatus.get(`TSK-${shortCode}-QA`) || 'READY_TO_CODE',
      engBinding: `${eng09} | ${eng10}`
    });
  });
}

// -----------------------------------------------------------------------------
// 1. Write docs/business-context/PMTOOL_SPRINT_TASKS.md & .csv
// -----------------------------------------------------------------------------
const mdOutPath = path.join(docsDir, 'PMTOOL_SPRINT_TASKS.md');
const csvOutPath = path.join(docsDir, 'PMTOOL_SPRINT_TASKS.csv');

const mdLines = [
  '# PMTool 5-Level WBS & Sprint Engineering Task Board',
  '',
  `> **Generated:** \`${new Date().toISOString()}\` | **Sprint Scope:** \`${sprintFilter || 'ALL'}\` | **Release Scope:** \`${releaseFilter || 'ALL'}\`${deltaFilter ? ` | **Delta Scope:** \`${deltaFilter}\`` : ''}`,
  `> **Hierarchy:** \`Component (CMP-*) -> Epic (EPC-*) -> Feature (FEATURE-*) -> Story (STR-*) -> Task (TSK-*)\``,
  `> **Totals:** \`${allStories.length} Stories\` decomposed into \`${allTasks.length} Department Tasks\` (\`BE\`, \`WEB\`, \`MOB\`, \`QA\`).`,
  '',
  '---',
  '',
  '## 1. Story Lineage Matrix (`CMP -> EPC -> FEATURE -> STR`)',
  '',
  '| Story ID | Component | Epic | Feature ID | Story Title | Release | Sprint | Points | Gate B |',
  '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :--- |',
  ...(allStories.length > 0
    ? allStories.map(s => `| \`${s.id}\` | \`${s.componentId}\` | \`${s.epicId}\` | \`${s.featureId}\` | ${s.title} | \`${s.release}\` | \`${s.sprint}\` | ${s.points} | \`${s.gateB}\` |`)
    : ['| _(None)_ | - | - | - | - | - | - | - | - |']),
  '',
  '---',
  '',
  '## 2. Department Engineering Tasks (`STR-* -> TSK-*`)',
  '',
  '| Task ID | Story ID | Feature ID | Dept | Release | Sprint | Est (h) | Title | Codebase / Gate B Binding | Status |',
  '| :--- | :--- | :--- | :-: | :--- | :--- | :-: | :--- | :--- | :--- |',
  ...(allTasks.length > 0
    ? allTasks.map(t => `| \`${t.id}\` | \`${t.storyId}\` | \`${t.featureId}\` | \`${t.department}\` | \`${t.release}\` | \`${t.sprint}\` | ${t.estimateHours}h | ${t.title} | \`${t.engBinding.replace(/\|/g, '/')}\` | \`${t.status}\` |`)
    : ['| _(None)_ | - | - | - | - | - | - | - | - | - |']),
  ''
];
fs.writeFileSync(mdOutPath, mdLines.join('\n'), 'utf8');

function csvEscape(val) {
  const s = String(val == null ? '' : val).replace(/\r?\n/g, ' ');
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const csvHeader = [
  'Task ID', 'Story ID', 'Feature ID', 'Component ID', 'Epic ID',
  'Department', 'Assignee Role', 'Release', 'Sprint', 'Estimate Hours',
  'Priority', 'Status', 'Title', 'Description', 'Engineering Binding'
];
const csvRows = [csvHeader.map(csvEscape).join(',')];
for (const t of allTasks) {
  csvRows.push([
    t.id, t.storyId, t.featureId, t.componentId, t.epicId,
    t.department, t.assigneeRole, t.release, t.sprint, t.estimateHours,
    t.priority, t.status, t.title, t.description, t.engBinding
  ].map(csvEscape).join(','));
}
fs.writeFileSync(csvOutPath, csvRows.join('\n') + '\n', 'utf8');

// -----------------------------------------------------------------------------
// 2. Update BACKLOG_WBS.md (Section 4) & PMTOOL_SYNC_MAP.json when --write-hub
// -----------------------------------------------------------------------------
const updatedWbsFiles = [];
if (writeHub) {
  const targetWbsFiles = [
    path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md'),
    path.join(docsDir, 'BACKLOG_WBS.md')
  ];
  const sec4Header = '## 4. Level 5 — Engineering Tasks (`TSK-*`)';
  const sec4Table = [
    sec4Header,
    '',
    '| Task ID | Story ID | Feature ID | Dept | Release | Sprint | Est (h) | Task Title | Status |',
    '| :--- | :--- | :--- | :-: | :--- | :--- | :-: | :--- | :--- |',
    ...(allTasks.length > 0
      ? allTasks.map(t => `| \`${t.id}\` | \`${t.storyId}\` | \`${t.featureId}\` | \`${t.department}\` | \`${t.release}\` | \`${t.sprint}\` | ${t.estimateHours}h | ${t.title} | \`${t.status}\` |`)
      : ['| _(None)_ | - | - | - | - | - | - | - | - |']),
    ''
  ].join('\n');

  const seenWbs = new Set();
  for (const wf of targetWbsFiles) {
    const abs = path.resolve(wf);
    if (seenWbs.has(abs)) continue;
    seenWbs.add(abs);
    if (!fs.existsSync(abs) && wf.includes('docs/business-context') && !fs.existsSync(path.dirname(abs))) continue;
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '# 5-Level Project Backlog WBS (`BACKLOG_WBS.md`)\n\n';
    if (/##\s+4\.[^\n]*Tasks/i.test(existing)) {
      existing = existing.replace(/##\s+4\.[^\n]*Tasks[\s\S]*?(?=\n##\s+5\.|$)/i, sec4Table);
    } else {
      existing = existing.trimEnd() + '\n\n' + sec4Table + '\n';
    }
    fs.writeFileSync(abs, existing, 'utf8');
    updatedWbsFiles.push(path.relative(projectRoot, abs));
  }

  // Update PMTOOL_SYNC_MAP.json
  const targetSyncFiles = [
    path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'PMTOOL_SYNC_MAP.json'),
    path.join(docsDir, 'PMTOOL_SYNC_MAP.json')
  ];
  const baseSyncObj = pmtoolMap.raw && typeof pmtoolMap.raw === 'object'
    ? { ...pmtoolMap.raw }
    : { project_key: 'PMTOOL', status: 'SYNCED', features: {}, stories: {}, tasks: {} };
  baseSyncObj.updated_at = new Date().toISOString();
  baseSyncObj.status = 'SYNCED';
  baseSyncObj.features = baseSyncObj.features && typeof baseSyncObj.features === 'object' ? baseSyncObj.features : {};
  baseSyncObj.stories = baseSyncObj.stories && typeof baseSyncObj.stories === 'object' ? baseSyncObj.stories : {};
  baseSyncObj.tasks = baseSyncObj.tasks && typeof baseSyncObj.tasks === 'object' ? baseSyncObj.tasks : {};

  for (const s of allStories) {
    baseSyncObj.features[s.featureId] = { status: 'SYNCED', release: s.release, sprint: s.sprint };
    baseSyncObj.stories[s.id] = { feature_id: s.featureId, status: 'SYNCED', release: s.release, sprint: s.sprint };
  }
  for (const t of allTasks) {
    baseSyncObj.tasks[t.id] = {
      story_id: t.storyId,
      feature_id: t.featureId,
      department: t.department,
      release: t.release,
      sprint: t.sprint,
      status: 'SYNCED'
    };
  }

  const seenSync = new Set();
  for (const sf of targetSyncFiles) {
    const abs = path.resolve(sf);
    if (seenSync.has(abs)) continue;
    seenSync.add(abs);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(baseSyncObj, null, 2) + '\n', 'utf8');
  }
}

// -----------------------------------------------------------------------------
// 3. Pure Node.js .xlsx ZIP Reader/Writer Preserving Columns Y..AG Dropdowns
// -----------------------------------------------------------------------------
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function readZipEntries(zipBuffer) {
  const entries = [];
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Invalid ZIP/XLSX archive (EOCD not found)');

  const cdCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  let ptr = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (zipBuffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const compressionMethod = zipBuffer.readUInt16LE(ptr + 10);
    const compressedSize = zipBuffer.readUInt32LE(ptr + 20);
    const fileNameLen = zipBuffer.readUInt16LE(ptr + 28);
    const extraLen = zipBuffer.readUInt16LE(ptr + 30);
    const commentLen = zipBuffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(ptr + 42);
    const fileName = zipBuffer.slice(ptr + 46, ptr + 46 + fileNameLen).toString('utf8');

    const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawComp = zipBuffer.slice(dataStart, dataStart + compressedSize);
    const data = compressionMethod === 8 ? zlib.inflateRawSync(rawComp) : Buffer.from(rawComp);

    entries.push({ fileName, data });
    ptr += 46 + fileNameLen + extraLen + commentLen;
  }
  return entries;
}

function writeZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.fileName, 'utf8');
    const uncompressed = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, compressed);

    const cdHeader = Buffer.alloc(46 + nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0, 8);
    cdHeader.writeUInt16LE(8, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressed.length, 20);
    cdHeader.writeUInt32LE(uncompressed.length, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(cdHeader, 46);

    centralParts.push(cdHeader);
    offset += localHeader.length + compressed.length;
  }

  const cdBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

function xmlEscape(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isHiddenValidationColumn(colLetters) {
  // Columns Y..Z and AA..AG hold PMTool template dropdown lookup lists
  const col = String(colLetters || '').toUpperCase();
  if (col === 'Y' || col === 'Z') return true;
  if (col.length === 2 && col[0] === 'A' && col[1] >= 'A' && col[1] <= 'G') return true;
  return false;
}

function injectRowsPreservingYtoAG(sheetXml, rowsData) {
  const rowCellMap = new Map(); // rowNumber (2..) -> Array of { col, value }
  rowsData.forEach((r, idx) => {
    const rowNum = idx + 2;
    rowCellMap.set(rowNum, r);
  });

  // Extract existing rows inside <sheetData>...</sheetData>
  return sheetXml.replace(/<sheetData>([\s\S]*?)<\/sheetData>/, (_full, inner) => {
    const existingRows = new Map();
    const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
    let m;
    while ((m = rowRegex.exec(inner)) !== null) {
      const attrs = m[1];
      const body = m[2];
      const rMatch = attrs.match(/\br="(\d+)"/);
      if (!rMatch) continue;
      const rNum = parseInt(rMatch[1], 10);
      existingRows.set(rNum, { attrs, body });
    }

    const allRowNums = new Set([...existingRows.keys(), ...rowCellMap.keys()]);
    const sortedRowNums = Array.from(allRowNums).sort((a, b) => a - b);

    const renderedRows = sortedRowNums.map(rNum => {
      const ex = existingRows.get(rNum);
      if (rNum === 1 && ex) {
        return `<row${ex.attrs}>${ex.body}</row>`;
      }

      // Preserve any cells in columns Y..AG from the template row
      const preservedYtoAG = [];
      if (ex) {
        const cellRegex = /<c\b[^>]*\br="([A-Z]+)\d+"[^>]*>(?:[\s\S]*?<\/c>)|<c\b[^>]*\br="([A-Z]+)\d+"[^>]*\/>/g;
        let cm;
        while ((cm = cellRegex.exec(ex.body)) !== null) {
          const colLet = cm[1] || cm[2];
          if (isHiddenValidationColumn(colLet)) {
            preservedYtoAG.push(cm[0]);
          }
        }
      }

      const newCells = rowCellMap.get(rNum) || [];
      const renderedAtoW = newCells.map(({ col, value }) => {
        if (typeof value === 'number') {
          return `<c r="${col}${rNum}"><v>${value}</v></c>`;
        }
        return `<c r="${col}${rNum}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
      });

      const attrs = ex ? ex.attrs : ` r="${rNum}"`;
      return `<row${attrs}>${renderedAtoW.join('')}${preservedYtoAG.join('')}</row>`;
    });

    return `<sheetData>${renderedRows.join('')}</sheetData>`;
  });
}

let exportedXlsxPath = null;
if (templateXlsxPath && fs.existsSync(templateXlsxPath)) {
  const entries = readZipEntries(fs.readFileSync(templateXlsxPath));
  const exportRows = (waveMode === 'story' || waveMode === 'stories')
    ? allStories.map(s => [
        { col: 'A', value: 'Story' },
        { col: 'B', value: s.id },
        { col: 'C', value: s.title },
        { col: 'D', value: s.componentId },
        { col: 'E', value: s.epicId },
        { col: 'F', value: s.featureId },
        { col: 'G', value: s.release },
        { col: 'H', value: s.sprint },
        { col: 'I', value: Number(s.points) || 3 },
        { col: 'J', value: s.gateB }
      ])
    : allTasks.map(t => [
        { col: 'A', value: 'Task' },
        { col: 'B', value: t.id },
        { col: 'C', value: t.title },
        { col: 'D', value: t.componentId },
        { col: 'E', value: t.epicId },
        { col: 'F', value: t.featureId },
        { col: 'G', value: t.storyId },
        { col: 'H', value: t.release },
        { col: 'I', value: t.sprint },
        { col: 'J', value: t.department },
        { col: 'K', value: t.assigneeRole },
        { col: 'L', value: Number(t.estimateHours) || 4 },
        { col: 'M', value: t.priority },
        { col: 'N', value: t.status },
        { col: 'O', value: t.description }
      ]);

  const updatedEntries = entries.map(e => {
    if (e.fileName === 'xl/worksheets/sheet1.xml') {
      const xml = e.data.toString('utf8');
      return { fileName: e.fileName, data: Buffer.from(injectRowsPreservingYtoAG(xml, exportRows), 'utf8') };
    }
    return e;
  });

  const pmtoolOutDir = path.join(docsDir, 'pmtool');
  if (!fs.existsSync(pmtoolOutDir)) fs.mkdirSync(pmtoolOutDir, { recursive: true });
  const defaultXlsxName = (waveMode === 'story' || waveMode === 'stories')
    ? `pmtool-wave4-stories-${sprintFilter || 'all'}.xlsx`
    : `pmtool-wave5-tasks-${sprintFilter || 'all'}.xlsx`;
  exportedXlsxPath = customOutputXlsx || path.join(pmtoolOutDir, defaultXlsxName);
  const outBuf = writeZipBuffer(updatedEntries);
  fs.writeFileSync(exportedXlsxPath, outBuf);

  if (writeHub) {
    const hubPmtoolDir = path.join(hubWorkspace.hubRoot, '04-traceability-and-exports', 'pmtool');
    if (!fs.existsSync(hubPmtoolDir)) fs.mkdirSync(hubPmtoolDir, { recursive: true });
    fs.writeFileSync(path.join(hubPmtoolDir, path.basename(exportedXlsxPath)), outBuf);
  }
}

const summary = {
  sprint: sprintFilter || 'ALL',
  release: releaseFilter || 'ALL',
  delta: deltaFilter || null,
  storiesCount: allStories.length,
  tasksCount: allTasks.length,
  departments: {
    BE: allTasks.filter(t => t.department === 'BE').length,
    WEB: allTasks.filter(t => t.department === 'WEB').length,
    MOB: allTasks.filter(t => t.department === 'MOB').length,
    QA: allTasks.filter(t => t.department === 'QA').length
  },
  artifacts: {
    markdownPath: path.relative(projectRoot, mdOutPath),
    csvPath: path.relative(projectRoot, csvOutPath),
    xlsxPath: exportedXlsxPath ? path.relative(projectRoot, exportedXlsxPath) : null,
    updatedWbsFiles
  }
};

if (isJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const elapsed = Date.now() - startTime;
  console.log(`✅ [PMTool WBS Decomposer v4.2.0] Decomposed ${allStories.length} Story(ies) -> ${allTasks.length} Department Tasks in ${elapsed}ms`);
  console.log(`  ✔ Markdown Board : ${summary.artifacts.markdownPath}`);
  console.log(`  ✔ CSV Export     : ${summary.artifacts.csvPath}`);
  if (summary.artifacts.xlsxPath) {
    console.log(`  ✔ XLSX Export    : ${summary.artifacts.xlsxPath} (preserved Y..AG validation columns)`);
  }
}

