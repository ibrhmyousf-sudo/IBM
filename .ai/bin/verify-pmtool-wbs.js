#!/usr/bin/env node

/**
 * 🧪 E2E Verification Suite: 5-Level WBS, Story-to-Task Decomposer & PMTool Board Sync (`v4.2.0`)
 * Executes isolated tests in `os.tmpdir()` (cleaned up in `finally`) verifying:
 *   [CHECK 1/5] `bcas-sync.js` ingesting `BACKLOG_WBS.md` (`CMP-01 -> EPC-01 -> FEAT-003 -> STR-003-01`),
 *               `PMTOOL_SYNC_MAP.json`, `04-traceability-and-exports/pmtool/`, and enriching `FEATURES_INDEX.md`.
 *   [CHECK 2/5] `sprint-plan.js` generating `SPRINT_EXECUTION_PLAN.md` with `Release`, `CMP -> EPC -> FEATURE -> STR`
 *               lineage, and `TSK-*` department worklists.
 *   [CHECK 3/5] `pmtool-board-sync.js` decomposing sealed `Gate B (READY_TO_CODE)` `§1B` Stories into
 *               `TSK-*-{BE,WEB,MOB,QA}`, writing `PMTOOL_SPRINT_TASKS.{md,csv}`, and updating `BACKLOG_WBS.md` (§4).
 *   [CHECK 4/5] `.xlsx` exporter preserving hidden validation dropdown columns `Y..AG` inside `xl/worksheets/sheet1.xml`
 *               while populating `A..O` rows.
 *   [CHECK 5/5] `delta-sync.js` + `pmtool-board-sync.js --delta=v1.1.0` compiling a `v1.1.0` CR story update with
 *               full `CMP -> EPC -> FEATURE -> STR -> TSK-*` lineage in `DELTA_EXECUTION_PLAN.md`.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { computeFeatureSrd } = require('./lib/hub-utils');

const REPO_ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(REPO_ROOT, 'bin');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function pass(msg) {
  totalChecks++;
  passedChecks++;
  console.log(`  \x1b[32m✔ PASS:\x1b[0m ${msg}`);
}

function fail(msg, detail = '') {
  totalChecks++;
  failedChecks++;
  console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${msg}`);
  if (detail) console.error(`    \x1b[33mDetail:\x1b[0m ${detail}`);
}

// Minimal pure-Node ZIP builder for creating mock backlog-import-template.xlsx
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}
function createMockXlsxTemplate(filePath) {
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="25" max="33" width="12" hidden="1"/>
  </cols>
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Work Item Type</t></is></c>
      <c r="B1" t="inlineStr"><is><t>ID</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Title</t></is></c>
      <c r="Y1" t="inlineStr"><is><t>AllowedTypes</t></is></c>
      <c r="Z1" t="inlineStr"><is><t>AllowedPriorities</t></is></c>
      <c r="AA1" t="inlineStr"><is><t>AllowedDepartments</t></is></c>
      <c r="AG1" t="inlineStr"><is><t>AllowedReleases</t></is></c>
    </row>
    <row r="2">
      <c r="Y2" t="inlineStr"><is><t>Component,Epic,Story,Task</t></is></c>
      <c r="Z2" t="inlineStr"><is><t>Critical,High,Medium,Low</t></is></c>
      <c r="AA2" t="inlineStr"><is><t>BE,WEB,MOB,QA</t></is></c>
      <c r="AG2" t="inlineStr"><is><t>REL-1.0,REL-1.1</t></is></c>
    </row>
  </sheetData>
  <dataValidations count="1">
    <dataValidation type="list" allowBlank="1" sqref="A2:A500"><formula1>$Y$2:$Y$10</formula1></dataValidation>
  </dataValidations>
</worksheet>`;

  const entries = [
    {
      fileName: '[Content_Types].xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`, 'utf8')
    },
    {
      fileName: 'xl/worksheets/sheet1.xml',
      data: Buffer.from(sheetXml, 'utf8')
    }
  ];

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.fileName, 'utf8');
    const uncompressed = entry.data;
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(localHeader, 30);
    localParts.push(localHeader, compressed);

    const cdHeader = Buffer.alloc(46 + nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(8, 10);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressed.length, 20);
    cdHeader.writeUInt32LE(uncompressed.length, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(cdHeader, 46);
    centralParts.push(cdHeader);

    offset += localHeader.length + compressed.length;
  }

  const cdBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([...localParts, cdBuf, eocd]));
}

function readSheet1XmlFromXlsx(xlsxPath) {
  const buf = fs.readFileSync(xlsxPath);
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  const cdCount = buf.readUInt16LE(eocdOffset + 10);
  let ptr = buf.readUInt32LE(eocdOffset + 16);
  for (let i = 0; i < cdCount; i++) {
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    if (name === 'xl/worksheets/sheet1.xml') {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.slice(start, start + compSize);
      return (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return '';
}

console.log('\n\x1b[1m=== InnovaDigits OS v4.2.0 — 5-Level WBS & PMTool Task Board E2E Verification ===\x1b[0m\n');

const tmpHubSrc = fs.mkdtempSync(path.join(os.tmpdir(), 'v420-wbs-hub-'));
const tmpProj = fs.mkdtempSync(path.join(os.tmpdir(), 'v420-wbs-proj-'));

try {
  // Setup mock project & Hub with BACKLOG_WBS.md, PMTOOL_SYNC_MAP.json, and FEATURE-003 (§1B STR-003-01)
  fs.copyFileSync(path.join(REPO_ROOT, 'stack.json'), path.join(tmpProj, 'stack.json'));
  fs.mkdirSync(path.join(tmpHubSrc, '00-project-core'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSrc, '01-roadmap-and-pm'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSrc, '02-sprints', 'S1'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSrc, '03-version-deltas'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSrc, '04-traceability-and-exports', 'pmtool'), { recursive: true });

  const templateXlsx = path.join(tmpHubSrc, '04-traceability-and-exports', 'pmtool', 'backlog-import-template.xlsx');
  createMockXlsxTemplate(templateXlsx);

  fs.writeFileSync(
    path.join(tmpHubSrc, '00-project-core', 'PROJECT_CONTEXT.md'),
    `# Project Context Master\n\n| Field | Value |\n| :--- | :--- |\n| **Scope Mode** | \`FULL_PROJECT\` |\n`
  );
  fs.writeFileSync(
    path.join(tmpHubSrc, '00-project-core', 'GLOSSARY_AND_ENUMS.md'),
    `# Glossary & Enums\n\n| Enum ID | Values | Labels |\n| :--- | :--- | :--- |\n| \`ENUM-ORDER-STATUS\` | \`draft, approved\` | مسودة / معتمد |\n`
  );
  fs.writeFileSync(
    path.join(tmpHubSrc, '00-project-core', 'SEED_DEFAULTS_CATALOG.md'),
    `# Seed Catalog\n\n| Seed ID | Table | Value |\n| :--- | :--- | :--- |\n| \`SEED-PAGE-LIMIT\` | \`settings\` | \`25\` |\n`
  );

  fs.writeFileSync(
    path.join(tmpHubSrc, '01-roadmap-and-pm', 'BACKLOG_WBS.md'),
    `# 5-Level Project Backlog WBS (\`BACKLOG_WBS.md\`)

## 1. Level 1 — Components (\`CMP-*\`)
| Component ID | Component Name | Owner |
| :--- | :--- | :--- |
| \`CMP-01\` | Order Management Core | Commerce Squad |

## 2. Releases & Sprints (\`REL-*\`)
| Release ID | Release Name | Sprints | Target Date |
| :--- | :--- | :--- | :--- |
| \`REL-1.0\` | MVP Commerce Launch | \`S1\` | 2026-12-01 |

## 3. Level 2 & 4 — Epics (\`EPC-*\`) & User Stories (\`STR-*\`)
| Story ID | Component | Epic | Feature ID | Story Title | Release | Sprint | Points | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :--- |
| \`STR-003-01\` | \`CMP-01\` | \`EPC-01\` | \`FEAT-003\` | Tenant Order History Filter & Export | \`REL-1.0\` | \`S1\` | 5 | \`READY_FOR_DEV\` |
`
  );

  fs.writeFileSync(
    path.join(tmpHubSrc, '01-roadmap-and-pm', 'PMTOOL_SYNC_MAP.json'),
    JSON.stringify({
      project_key: 'ORD-HUB',
      status: 'SYNCED',
      features: { 'FEAT-003': { status: 'SYNCED', release: 'REL-1.0', sprint: 'S1' } },
      stories: { 'STR-003-01': { feature_id: 'FEAT-003', status: 'SYNCED', release: 'REL-1.0', sprint: 'S1' } },
      tasks: {}
    }, null, 2)
  );

  const feat003Doc = `# FEATURE-003: Order History Directory

## 1. Feature Identity & Classification
| Field | Value |
| :--- | :--- |
| **Feature ID** | \`FEATURE-003\` |
| **Feature Name** | Order History Directory |
| **Component ID** | \`CMP-01\` |
| **Epic ID** | \`EPC-01\` |
| **Target Release** | \`REL-1.0\` |
| **Sprint** | \`S1\` |
| **Version** | \`v1.0.0\` |
| **Archetype** | \`READ_VIEW\` |
| **Gate A Status** | \`READY_FOR_DEV\` |

### 1B. Story Decomposition (\`STR-*\`)
| Story ID | Story Title | Release | Sprint | Points | AC Coverage | Status |
| :--- | :--- | :--- | :--- | :-: | :--- | :--- |
| \`STR-003-01\` | Tenant Order History Filter & Export | \`REL-1.0\` | \`S1\` | 5 | \`AC-01, AC-02\` | \`READY_FOR_DEV\` |

## 2. Visual Screen Decomposition
| Screen ID | Element | Role |
| :--- | :--- | :--- |
| \`SCR-ORD-01\` | Orders Filter Table | Paginated tenant order directory |

## 3. UI Lifecycle States
Supports \`LOADING\`, \`EMPTY\`, \`ERROR\`, and \`POPULATED\` states.

## 4. Business Rules
| Rule ID | Title | Statement |
| :--- | :--- | :--- |
| \`BR-ORD-01\` | Tenant Pagination | Paginate orders using \`SEED-PAGE-LIMIT\` and \`ENUM-ORDER-STATUS\` under \`DOM-ORD-SCOPE\`. |

## 5A. Read View Projection
\`GET /api/v1/orders\`

## 6. Security & Privacy
Authenticated tenant-scoped access.

## 7. Bilingual Copy Keys (AR / EN)
| Copy Key | AR | EN |
| :--- | :--- | :--- |
| \`orders.list.title\` | سجل الطلبات | Order History |

## 8. Acceptance Criteria
- \`AC-01\`: Lists tenant orders with \`ENUM-ORDER-STATUS\`.
- \`AC-02\`: Enforces \`SEED-PAGE-LIMIT\`.

## 9. Governance & Sign-Off
### 9.2 Open Business Decisions
| ID | Decision | Status |
| :--- | :--- | :--- |
| \`D-01\` | Page limit 25 | \`Resolved\` |

---

## 10. Evolution Ledger
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |

---

## 11. Gate B — Engineering Readiness Appendix

| Metadata | Value |
| :--- | :--- |
| **Gate B Status** | \`READY_TO_CODE\` |

| Check ID | Dimension | Engineering Binding & Codebase Evidence | Status |
| :--- | :--- | :--- | :--- |
| \`ENG-01\` | Model/Table Binding | \`app/Models/Order.php\` (\`orders\` table) | \`PASS\` |
| \`ENG-02\` | API Endpoint & Envelope Contract | \`GET /api/v1/orders\` in \`OrderController.php\` | \`PASS\` |
| \`ENG-03\` | SEED-* & ENUM-* Codebase Mapping | \`SEED-PAGE-LIMIT\` & \`ENUM-ORDER-STATUS\` | \`PASS\` |
| \`ENG-04\` | Visual Screen §2 & Lifecycle §3 data-testid Plan | \`data-testid="orders-table-list"\` | \`PASS\` |
| \`ENG-05\` | ESR Index & N+1 Prevention | \`idx_orders_tenant_status_created\` | \`PASS\` |
| \`ENG-06\` | Tenant/IDOR & RBAC Guard | \`OrderPolicy\` + \`tenant_id\` scope | \`PASS\` |
| \`ENG-07\` | IPDPL/PII Masking | \`LogContextScrubber\` | \`PASS\` |
| \`ENG-08\` | Archetype Concurrency/Idempotency Strategy | Cursor pagination & cache tag | \`PASS\` |
| \`ENG-09\` | Automated Test File Binding | \`tests/Feature/FEATURE-003Test.php\` | \`PASS\` |
| \`ENG-10\` | Mobile/QA Handoff Impact | \`docs/handoff/ORDERS_INTEGRATION_GUIDE.md\` (\`MB-01..15\`) | \`PASS\` |
`;

  const srd003 = computeFeatureSrd(feat003Doc);
  fs.writeFileSync(path.join(tmpHubSrc, '02-sprints', 'S1', 'FEATURE-003.md'), feat003Doc, 'utf8');
  fs.writeFileSync(
    path.join(tmpHubSrc, '02-sprints', 'S1', 'SPRINT_S1_MANIFEST.md'),
    `# Sprint S1 Manifest\n\n| Feature ID | Wave | Archetype | Gate A Status | Gate B Status | Version | feature_srd |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| \`FEATURE-003\` | \`Wave 1\` | \`READ_VIEW\` | \`READY_FOR_DEV\` | \`READY_TO_CODE\` | \`v1.0.0\` | \`${srd003}\` |\n`
  );

  // ---------------------------------------------------------------------------
  // [CHECK 1/5] bcas-sync.js WBS & PMTool Sync Ingestion + FEATURES_INDEX.md
  // ---------------------------------------------------------------------------
  console.log('\x1b[36m[CHECK 1/5] Testing bcas-sync.js 5-Level WBS & PMTool Sync Ingestion...\x1b[0m');
  execFileSync(process.execPath, [path.join(BIN_DIR, 'bcas-sync.js'), `--hub=${tmpHubSrc}`], {
    cwd: tmpProj,
    stdio: 'pipe'
  });

  const featuresIndex = fs.readFileSync(path.join(tmpProj, 'docs', 'business-context', 'FEATURES_INDEX.md'), 'utf8');
  const syncedTemplate = path.join(tmpProj, 'docs', 'project-context-hub', '04-traceability-and-exports', 'pmtool', 'backlog-import-template.xlsx');

  if (
    featuresIndex.includes('CMP-01') &&
    featuresIndex.includes('EPC-01') &&
    featuresIndex.includes('REL-1.0') &&
    featuresIndex.includes('SYNCED') &&
    fs.existsSync(syncedTemplate)
  ) {
    pass('bcas-sync.js synced BACKLOG_WBS.md, PMTOOL_SYNC_MAP.json, 04-traceability-and-exports/pmtool/*, and enriched FEATURES_INDEX.md.');
  } else {
    fail('bcas-sync.js failed to enrich FEATURES_INDEX.md or sync pmtool exports', featuresIndex);
  }

  // ---------------------------------------------------------------------------
  // [CHECK 2/5] sprint-plan.js 5-Level WBS Lineage & TSK-* Worklist
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 2/5] Testing sprint-plan.js 5-Level WBS Lineage & TSK-* Worklist...\x1b[0m');
  const sprintPlanMd = fs.readFileSync(path.join(tmpProj, 'docs', 'business-context', 'SPRINT_EXECUTION_PLAN.md'), 'utf8');
  if (
    sprintPlanMd.includes('REL-1.0') &&
    sprintPlanMd.includes('CMP-01 -> EPC-01 -> FEATURE-003 -> STR-003-01') &&
    sprintPlanMd.includes('TSK-003-01-BE') &&
    sprintPlanMd.includes('TSK-003-01-WEB') &&
    sprintPlanMd.includes('TSK-003-01-MOB') &&
    sprintPlanMd.includes('TSK-003-01-QA')
  ) {
    pass('sprint-plan.js generated SPRINT_EXECUTION_PLAN.md with Release, CMP->EPC->FEATURE->STR lineage, and TSK-* worklists.');
  } else {
    fail('sprint-plan.js missing expected WBS lineage or TSK-* worklist in SPRINT_EXECUTION_PLAN.md.');
  }

  // ---------------------------------------------------------------------------
  // [CHECK 3/5] pmtool-board-sync.js Story -> Task Decomposition & WBS Update
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 3/5] Testing pmtool-board-sync.js Story-to-Task Decomposition...\x1b[0m');
  const pmtoolOutRaw = execFileSync(
    process.execPath,
    [
      path.join(BIN_DIR, 'pmtool-board-sync.js'),
      '--sprint=S1',
      '--release=REL-1.0',
      `--template=${syncedTemplate}`,
      '--write-hub',
      '--json'
    ],
    { cwd: tmpProj, encoding: 'utf8', stdio: 'pipe' }
  );
  const pmtoolSummary = JSON.parse(pmtoolOutRaw);
  const tasksMd = fs.readFileSync(path.join(tmpProj, 'docs', 'business-context', 'PMTOOL_SPRINT_TASKS.md'), 'utf8');
  const tasksCsv = fs.readFileSync(path.join(tmpProj, 'docs', 'business-context', 'PMTOOL_SPRINT_TASKS.csv'), 'utf8');
  const updatedWbs = fs.readFileSync(path.join(tmpProj, 'docs', 'project-context-hub', '01-roadmap-and-pm', 'BACKLOG_WBS.md'), 'utf8');

  if (
    pmtoolSummary.storiesCount === 1 &&
    pmtoolSummary.tasksCount === 4 &&
    tasksMd.includes('TSK-003-01-BE') &&
    tasksMd.includes('TSK-003-01-WEB') &&
    tasksMd.includes('TSK-003-01-MOB') &&
    tasksMd.includes('TSK-003-01-QA') &&
    tasksCsv.includes('TSK-003-01-BE,STR-003-01,FEATURE-003,CMP-01,EPC-01') &&
    updatedWbs.includes('## 4. Level 5 — Engineering Tasks (`TSK-*`)') &&
    updatedWbs.includes('TSK-003-01-BE')
  ) {
    pass('pmtool-board-sync.js decomposed STR-003-01 into 4 department tasks (BE, WEB, MOB, QA) and updated BACKLOG_WBS.md (§4).');
  } else {
    fail('pmtool-board-sync.js failed task decomposition or BACKLOG_WBS.md update', JSON.stringify(pmtoolSummary));
  }

  // ---------------------------------------------------------------------------
  // [CHECK 4/5] .xlsx Hidden Validation Columns Y..AG Preservation
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 4/5] Verifying .xlsx Export Hidden Validation Columns (Y..AG) Preservation...\x1b[0m');
  const exportedXlsxAbs = path.join(tmpProj, pmtoolSummary.artifacts.xlsxPath);
  const sheetXml = readSheet1XmlFromXlsx(exportedXlsxAbs);

  const hasTaskRow = sheetXml.includes('TSK-003-01-BE') && sheetXml.includes('TSK-003-01-QA');
  const preservedY2 = sheetXml.includes('<c r="Y2" t="inlineStr"><is><t>Component,Epic,Story,Task</t></is></c>');
  const preservedZ2 = sheetXml.includes('<c r="Z2" t="inlineStr"><is><t>Critical,High,Medium,Low</t></is></c>');
  const preservedAA2 = sheetXml.includes('<c r="AA2" t="inlineStr"><is><t>BE,WEB,MOB,QA</t></is></c>');
  const preservedAG2 = sheetXml.includes('<c r="AG2" t="inlineStr"><is><t>REL-1.0,REL-1.1</t></is></c>');
  const preservedDataVal = sheetXml.includes('<dataValidations count="1">');

  if (hasTaskRow && preservedY2 && preservedZ2 && preservedAA2 && preservedAG2 && preservedDataVal) {
    pass('.xlsx exporter populated Task rows in A..O while 100% preserving hidden validation lookup columns Y..AG and <dataValidations>.');
  } else {
    fail('.xlsx exporter corrupted or dropped Y..AG validation columns', sheetXml);
  }

  // ---------------------------------------------------------------------------
  // [CHECK 5/5] delta-sync.js & pmtool-board-sync.js on v1.1.0 CR Story Update
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 5/5] Testing delta-sync.js & pmtool-board-sync.js on v1.1.0 CR Story Update...\x1b[0m');
  const deltaFile = path.join(tmpProj, 'docs', 'project-context-hub', '03-version-deltas', 'DELTA_v1.0.0_to_v1.1.0.md');
  fs.writeFileSync(
    deltaFile,
    `# Delta Specification: v1.0.0 -> v1.1.0\n\n| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| \`v1.1.0\` | 2026-11-12 | \`CR-101\` | \`STR-003-01\` | \`SEED-PAGE-LIMIT=25\` | \`SEED-PAGE-LIMIT=50\` on \`FEATURE-003\` | Update seeder, API pagination & QA assertions |\n`
  );

  execFileSync(process.execPath, [path.join(BIN_DIR, 'delta-sync.js'), '--to=v1.1.0'], {
    cwd: tmpProj,
    stdio: 'pipe'
  });
  const deltaPlanMd = fs.readFileSync(path.join(tmpProj, 'docs', 'business-context', 'DELTA_EXECUTION_PLAN.md'), 'utf8');

  const deltaTasksRaw = execFileSync(
    process.execPath,
    [path.join(BIN_DIR, 'pmtool-board-sync.js'), '--delta=v1.1.0', '--json'],
    { cwd: tmpProj, encoding: 'utf8', stdio: 'pipe' }
  );
  const deltaTasksSummary = JSON.parse(deltaTasksRaw);

  if (
    deltaPlanMd.includes('CMP-01 -> EPC-01 -> FEATURE-003 -> STR-003-01') &&
    deltaPlanMd.includes('TSK-003-01-BE') &&
    deltaTasksSummary.tasksCount === 4
  ) {
    pass('delta-sync.js & pmtool-board-sync.js (--delta=v1.1.0) compiled CR-101 story delta with full CMP->EPC->FEATURE->STR->TSK lineage.');
  } else {
    fail('delta-sync.js or pmtool-board-sync.js failed on v1.1.0 story delta', deltaPlanMd);
  }
} finally {
  try {
    fs.rmSync(tmpHubSrc, { recursive: true, force: true });
    fs.rmSync(tmpProj, { recursive: true, force: true });
  } catch { /* ignore */ }
}

console.log('\n------------------------------------------------------------');
console.log(`TOTAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
console.log('------------------------------------------------------------');

if (failedChecks === 0) {
  console.log('\x1b[32m\x1b[1m✨ ALL V4.2.0 5-LEVEL WBS & PMTOOL TASK BOARD CHECKS PASSED PERFECTLY\x1b[0m\n');
  process.exit(0);
} else {
  console.error('\x1b[31m\x1b[1m🚨 V4.2.0 PMTOOL WBS VERIFICATION FAILED\x1b[0m\n');
  process.exit(1);
}

