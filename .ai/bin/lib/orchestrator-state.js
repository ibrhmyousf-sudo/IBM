'use strict';

/**
 * 🧭 InnovaDigits Complete Core AI Orchestrator State Machine (`bin/lib/orchestrator-state.js` v4.3.0)
 * Zero external dependencies (Node.js built-ins only: `fs`, `path`, `crypto`, `child_process`).
 *
 * Manages `<projectRoot>/docs/project-context-hub/.os-state.json`:
 *   - 10 Canonical Main Pipeline Stages (`INTAKE` .. `RELEASE_SEAL`) + Controlled CR Evolution Track (`DELTA_EVOLVE`)
 *   - Human-in-the-Loop Checkpoints (`PENDING_HUMAN_APPROVAL`) with immutable `checkpointAuditTrail`
 *   - 3-Strike Circuit Breaker (`maxRetries = 3`, `CIRCUIT_OPEN_ESCALATED`), `remediationPacket` & `LESSONS_LEARNED.md` auto-append
 *   - Role Inbox & Handover Queue (`SOLO_FDE` vs `TEAM_RBAC` + `roleAssignments` validation)
 *   - Decoupled Add-on Lifecycle Hooks via `./orchestrator-plugins`
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const {
  expandCliPath,
  resolveHubWorkspace,
  parseFeatureDocument,
  evaluateGateBChecks,
  parseBacklogWbs,
  scanHubAndLegacyFeatures,
  collectSprintManifests,
  verifySrdMatch,
  stripMdFormatting,
  splitMarkdownRow
} = require('./hub-utils');
const srdV1 = require('./srd');
const {
  loadOrchestratorConfig,
  listLoadedAddons,
  dispatchLifecycleHook
} = require('./orchestrator-plugins');

const BIN_DIR = path.resolve(__dirname, '..');
const OS_ROOT = path.resolve(BIN_DIR, '..');
const BA_HUB_ROOT = path.resolve(OS_ROOT, '..', 'ba-context-hub-os');

const VALID_MODES = new Set(['SOLO_FDE', 'TEAM_RBAC']);
const VALID_ROLES = new Set(['BA', 'TECH_LEAD', 'DEV', 'SECURITY', 'QA', 'PM']);

const ANTI_PLACEHOLDER_BRACKET_RE =
  /\[(?:e\.g\.,|(?:1[–-]3 concise|Core capabilities|Planned future|Excluded capabilities|Exact rounding|Deactivated\/suspended|End-to-End Core|Asia\/Riyadh|Single-Tenant|Per approved|Payment Gateway|SMS \/ OTP|YYYY-MM-DD|Client CR-001|N(?!\/A\b)|K|X|Y|Z|M)\b)[^\]\n]*\]/;

const ANTI_EXAMPLE_LEFTOVER_RE = /\b(?:CR-001|FEATURE-004|SEED-BOOKING-CANCEL-WINDOW|UCMS)\b/;

const STAGE_DEFINITIONS = [
  {
    id: 'INTAKE',
    index: 1,
    track: 'MAIN',
    ownerRole: 'BA',
    checkpoint: false,
    title: 'Codebase & BRD Discovery Intake',
    targetPaths: ['.ai/context/CODEBASE_MAP.md', 'docs/project-context-hub/_intake/INTAKE_MANIFEST.md'],
    rules: [
      'Run deterministic codebase mapping (`build-codebase-map.js`) and reverse intake extraction (`reverse-architect.js --export-ba-intake`).',
      'Scaffold `_intake/INTAKE_MANIFEST.md` and initial hub structure without template junk.'
    ]
  },
  {
    id: 'CORE_BOOTSTRAP',
    index: 2,
    track: 'MAIN',
    ownerRole: 'BA',
    checkpoint: true,
    checkpointLabel: 'Pass 1 Core Architecture & Seed Decisions',
    title: 'Core Project Context & Catalogs Bootstrap',
    targetPaths: [
      'docs/project-context-hub/00-project-core/PROJECT_CONTEXT.md',
      'docs/project-context-hub/00-project-core/GLOSSARY_AND_ENUMS.md',
      'docs/project-context-hub/00-project-core/SEED_DEFAULTS_CATALOG.md'
    ],
    rules: [
      'Populate all 15 sections of `PROJECT_CONTEXT.md` with verified project facts (`BR-GLB-*`, `ROLE-*`, `CONV-SHD-*`, `WF-SHD-*`).',
      'Register all numeric/timer constants as `SEED-*` rows and status/badge vocabularies as `ENUM-*` bilingual rows.',
      'Strictly satisfy `ANTI-PLACEHOLDER-01`: zero bracket template placeholders, zero leftover `UCMS`/`CR-001` example tokens.',
      'Requires Human Checkpoint approval (`PENDING_HUMAN_APPROVAL`) before advancing when `requireHumanCheckpoints=true`.'
    ]
  },
  {
    id: 'SPRINT_PLAN',
    index: 3,
    track: 'MAIN',
    ownerRole: 'BA',
    checkpoint: false,
    title: 'Roadmap Wave Sequencing & 5-Level WBS Planning',
    targetPaths: [
      'docs/project-context-hub/01-roadmap-and-pm/SPRINT_MASTER_PLAN.md',
      'docs/project-context-hub/01-roadmap-and-pm/BACKLOG_WBS.md',
      'docs/project-context-hub/01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md'
    ],
    rules: [
      'Sequence sprints with explicit Wave digits (`1`, `2`, `3`) — never copy Sprint ID digits (e.g. `S4` -> `1..3`).',
      'Define the full 5-level WBS hierarchy (`CMP-* -> EPC-* -> FEATURE-* -> STR-*`) inside `BACKLOG_WBS.md`.',
      'Ensure `CHANGE_IMPACT_REGISTER.md` `Current Hub Version` matches `PROJECT_CONTEXT.md` `Semantic Version` (`ANTI-PLACEHOLDER-01`).'
    ]
  },
  {
    id: 'SPRINT_SPECS',
    index: 4,
    track: 'MAIN',
    ownerRole: 'BA',
    checkpoint: true,
    checkpointLabel: 'Consolidated Sprint Decisions Snapshot',
    title: 'Sprint Feature Specification Authoring (Gate A Readiness)',
    targetPaths: ['docs/project-context-hub/02-sprints/<SprintID>/FEATURE-*.md'],
    rules: [
      'Author all 11 canonical sections (`Sections 1-9` normative + `Section 10` Evolution + `Section 11` Gate B placeholder table).',
      'All applicable `BA-01..BA-14` checks must achieve `VALID = 100.0%` (`Gate A Status (BA): READY_FOR_DEV`).',
      'Bind every screen in §2 and all 6 UI states (`loading`, `empty`, `single-item`, `populated`, `disabled`, `error`) in §3.',
      'Requires Human Checkpoint approval of Consolidated Sprint Decisions Snapshot before sealing.'
    ]
  },
  {
    id: 'GATE_A_SEAL',
    index: 5,
    track: 'MAIN',
    ownerRole: 'BA',
    checkpoint: false,
    title: 'Strict Hub Verification, Sprint Manifest Sealing & RTM Export',
    targetPaths: [
      'docs/project-context-hub/02-sprints/<SprintID>/SPRINT_<SprintID>_MANIFEST.md',
      'docs/project-context-hub/04-traceability-and-exports/RTM_MATRIX.csv'
    ],
    rules: [
      'Execute `ba-hub verify --strict` with zero violations across all active specs and core catalogs.',
      'Seal `SPRINT_<SprintID>_MANIFEST.md` with deterministic `srd-v1` `feature_srd` digests (`Gate A`).',
      'Generate `04-traceability-and-exports/{RTM_MATRIX.csv,GATE_EVIDENCE.csv,SEED_DEFAULTS_EXPORT.csv}`.'
    ]
  },
  {
    id: 'GATE_B_ENG',
    index: 6,
    track: 'MAIN',
    ownerRole: 'TECH_LEAD',
    checkpoint: false,
    title: 'Engineering Gate B Readiness & Zero-Drift Clearance',
    targetPaths: ['docs/project-context-hub/02-sprints/<SprintID>/FEATURE-*.md (§11 ONLY)'],
    rules: [
      'NEVER edit normative Sections 1-9 of sealed `FEATURE-*.md` specs (preserves `feature_srd` SHA-256).',
      'Populate Section 11 (`ENG-01..ENG-10`) via `eng-gate.js --populate-hints` with literal `ENG-04` `data-testid`s.',
      'Clear `eng-gate.js --verify-only`, `sprint-plan.js`, and `drift-radar.js` (`CLEARANCE_GRANTED`).'
    ]
  },
  {
    id: 'DEV_IMPLEMENT',
    index: 7,
    track: 'MAIN',
    ownerRole: 'DEV',
    checkpoint: true,
    checkpointLabel: 'Turn 1 Wave Implementation Blueprint',
    title: 'Wave-Ordered Implementation (Wave 1 -> 2 -> 3) & Cycle Handoff',
    targetPaths: [
      'docs/business-context/SPRINT_EXECUTION_PLAN.md',
      'docs/business-context/DEV_IMPLEMENTATION_ATTESTATION.json',
      'docs/handoff/cycles/'
    ],
    rules: [
      'Verify Gate B `READY_TO_CODE` and unchanged normative `feature_srd` digests prior to coding.',
      'Execute implementation strictly in `Wave 1 -> Wave 2 -> Wave 3` DAG order and compile `build-cycle-handoff.js`.',
      'Requires Human Checkpoint approval on Turn 1 Wave Blueprint before advancing to Security & Performance Gate.'
    ]
  },
  {
    id: 'SECURITY_PERF_GATE',
    index: 8,
    track: 'MAIN',
    ownerRole: 'SECURITY',
    checkpoint: false,
    title: 'Static Security Fuzzer, Performance Predictor, Stack Audits & 183-Control Pentest',
    targetPaths: [
      'docs/security/SECURITY_AUDIT_REPORT.md',
      'docs/architecture/PERFORMANCE_BOTTLENECK_REPORT.md',
      'docs/security/SECURITY_DELIVERY_CHECKLIST.md'
    ],
    rules: [
      'Run `security-fuzzer.js --strict`, `perf-predictor.js`, `dotnet-audit.js --strict`, and `frontend-audit.js --strict`.',
      'Execute `pentest-suite.js` (`SEC-001..183`) and confirm `0` Critical and `0` High active security defects.'
    ]
  },
  {
    id: 'QA_HANDOFF',
    index: 9,
    track: 'MAIN',
    ownerRole: 'QA',
    checkpoint: false,
    title: 'Unified OpenAPI, Postman Chaining, Pentest DAST & QA Cycle Handoff Pack',
    targetPaths: [
      'docs/openapi.json',
      'docs/postman/',
      'docs/handoff/cycles/'
    ],
    rules: [
      'Compile unified OpenAPI 3.0 (`build-unified-openapi.js`), Postman v2.1 (`build-postman.js --force`), and Pentest DAST (`build-pentest-postman.js --force`).',
      'Emit immutable cycle handoff document (`build-cycle-handoff.js`) mapping API endpoints and literal `data-testid`s.'
    ]
  },
  {
    id: 'RELEASE_SEAL',
    index: 10,
    track: 'MAIN',
    ownerRole: 'PM',
    checkpoint: false,
    title: 'Final Release Readiness Attestation & Immutable State Lock',
    targetPaths: [
      'docs/project-context-hub/04-traceability-and-exports/RELEASE_<SprintID>_ATTESTATION.json',
      'docs/project-context-hub/04-traceability-and-exports/RELEASE_<SprintID>_ATTESTATION.md'
    ],
    rules: [
      'Confirm Stages 1-9 passed, 0 pending human checkpoints, and 0 open circuit breakers.',
      'Compute cryptographic attestation digest over Context Hub, Manifest, Security Checklist & Cycle Handoff and lock release.'
    ]
  },
  {
    id: 'DELTA_EVOLVE',
    index: 11,
    track: 'CR_DELTA',
    ownerRole: 'BA',
    checkpoint: false,
    title: 'Controlled Post-Baseline CR Evolution (Was -> Current Delta Track)',
    targetPaths: [
      'docs/project-context-hub/03-version-deltas/DELTA_<from>_to_<to>.md',
      'docs/business-context/DELTA_EXECUTION_PLAN.md'
    ],
    rules: [
      'Compile post-baseline Change Requests (`CR-*`) via `ba-hub build-delta` and `delta-sync.js` without resetting prior sealed stages.',
      'Synchronize `PROJECT_CONTEXT.md` `Semantic Version` + `§15 Evolution` with `CHANGE_IMPACT_REGISTER.md` `Current Hub Version`.'
    ]
  }
];

const MAIN_STAGE_DEFINITIONS = STAGE_DEFINITIONS.filter(s => s.track === 'MAIN');

function getStageDef(stageId) {
  return STAGE_DEFINITIONS.find(s => s.id === stageId) || null;
}

function getNextStageId(stageId) {
  const cur = getStageDef(stageId);
  if (!cur) return 'INTAKE';
  if (cur.track === 'CR_DELTA') return 'COMPLETED';
  const next = MAIN_STAGE_DEFINITIONS.find(s => s.index === cur.index + 1);
  return next ? next.id : 'COMPLETED';
}

function hasFullBaHubCli() {
  return (
    fs.existsSync(path.join(BA_HUB_ROOT, 'bin', 'ba-hub.js')) &&
    fs.existsSync(path.join(BA_HUB_ROOT, 'bin', 'lib', 'migrate.js')) &&
    fs.existsSync(path.join(BA_HUB_ROOT, 'bin', 'lib', 'pmtool-xlsx.js'))
  );
}

/**
 * Replaces the Semantic Digest (`feature_srd`) cell inside canonical hub Markdown.
 */
function replaceDigestInMarkdown(markdown, digest) {
  return String(markdown || '').replace(
    /(\|\s*\*\*Semantic Digest(?:\s*\(`feature_srd`\))?\*\*\s*\|\s*)`?[^|`]+`?(\s*\|)/i,
    `$1\`${digest}\`$2`
  );
}

/**
 * Fallback Project Context Hub initializer when full `ba-hub.js` modules (`migrate.js`/`pmtool-xlsx.js`) are unavailable.
 */
function initHubFallback({ target, project, name, scopeMode } = {}) {
  const absTarget = path.resolve(expandCliPath(target || process.cwd()));
  const projectCode = String(project || 'PRJ-001');
  const projectName = String(name || path.basename(absTarget));
  const modeStr = scopeMode === 'PARTIAL_JIT_ANCHOR' ? 'PARTIAL_JIT_ANCHOR' : 'FULL_PROJECT';
  const dateStr = new Date().toISOString().slice(0, 10);

  for (const sub of [
    '00-project-core',
    '01-roadmap-and-pm',
    '02-sprints',
    '03-version-deltas',
    '04-traceability-and-exports',
    '_intake'
  ]) {
    fs.mkdirSync(path.join(absTarget, sub), { recursive: true });
  }

  const tplRoot = path.join(BA_HUB_ROOT, 'templates', 'project-context-hub');
  const pairs = [
    ['00-project-core/PROJECT_CONTEXT.template.md', '00-project-core/PROJECT_CONTEXT.md', 'CTX'],
    ['00-project-core/GLOSSARY_AND_ENUMS.template.md', '00-project-core/GLOSSARY_AND_ENUMS.md', 'ENUM'],
    ['00-project-core/SEED_DEFAULTS_CATALOG.template.md', '00-project-core/SEED_DEFAULTS_CATALOG.md', 'SEED'],
    ['01-roadmap-and-pm/SPRINT_MASTER_PLAN.template.md', '01-roadmap-and-pm/SPRINT_MASTER_PLAN.md', null],
    ['01-roadmap-and-pm/BACKLOG_WBS.template.md', '01-roadmap-and-pm/BACKLOG_WBS.md', null],
    ['01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.template.md', '01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md', null]
  ];

  const instantiated = [];
  for (const [srcRel, destRel, digestPrefix] of pairs) {
    const srcPath = path.join(tplRoot, srcRel);
    if (!fs.existsSync(srcPath)) continue;
    let content = fs
      .readFileSync(srcPath, 'utf8')
      .replace(/\[PROJECT_NAME\]/g, projectName)
      .replace(/PRJ-\[CODE\]/g, projectCode)
      .replace(/YYYY-MM-DD/g, dateStr)
      .replace(/`FULL_PROJECT`\s*\\\|\s*`PARTIAL_JIT_ANCHOR`/g, `\`${modeStr}\``);

    if (digestPrefix) {
      content = replaceDigestInMarkdown(content, srdV1.computeSemanticDigest(content, digestPrefix));
    }
    const destPath = path.join(absTarget, destRel);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content, 'utf8');
    instantiated.push(destRel);
  }

  const ctxPath = path.join(absTarget, '00-project-core', 'PROJECT_CONTEXT.md');
  if (!fs.existsSync(ctxPath)) {
    const minCtx = [
      `# Project Context — \`${projectCode}\``,
      '',
      '| Metadata Field | Canonical Value |',
      '|---|---|',
      `| **Project Name** | ${projectName} |`,
      `| **Project Code** | \`${projectCode}\` |`,
      '| **Semantic Version** | `v1.0.0` |',
      `| **Scope Mode** | \`${modeStr}\` |`,
      `| **Last Updated** | \`${dateStr}\` |`,
      ''
    ].join('\n');
    fs.writeFileSync(ctxPath, minCtx, 'utf8');
    instantiated.push('00-project-core/PROJECT_CONTEXT.md');
  }

  const fallbackStubs = [
    ['00-project-core/GLOSSARY_AND_ENUMS.md', `# Glossary & Canonical Enums — \`${projectCode}\`\n\n| Enum ID | Domain Field | Allowed Values | Last Updated |\n|---|---|---|---|\n\n\`v1.0.0\`\n`],
    ['00-project-core/SEED_DEFAULTS_CATALOG.md', `# Seed Defaults Catalog — \`${projectCode}\`\n\n| Seed Key | Default Value | Description | Last Updated |\n|---|---|---|---|\n`],
    ['01-roadmap-and-pm/SPRINT_MASTER_PLAN.md', `# Sprint Master Plan — \`${projectCode}\`\n\n| Sprint | Wave | Scope Summary | Status |\n|---|---|---|---|\n`],
    ['01-roadmap-and-pm/BACKLOG_WBS.md', `# Backlog WBS — \`${projectCode}\`\n\n| Feature ID | Story ID | Wave | Title | Status |\n|---|---|---|---|---|\n`],
    ['01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md', `# Change Impact Register — \`${projectCode}\`\n\n| Metadata Field | Canonical Value |\n|---|---|\n| **Current Hub Version** | \`v1.0.0\` |\n| **Project Code** | \`${projectCode}\` |\n\n| CR ID | Version | Date | Target ID | Summary | Status |\n|---|---|---|---|---|---|\n`]
  ];
  for (const [relStub, bodyStub] of fallbackStubs) {
    const destStub = path.join(absTarget, relStub);
    if (!fs.existsSync(destStub)) {
      fs.mkdirSync(path.dirname(destStub), { recursive: true });
      fs.writeFileSync(destStub, bodyStub, 'utf8');
      instantiated.push(relStub);
    }
  }

  return { absTarget, projectCode, projectName, instantiated };
}

function runNodeCli(scriptPath, args, cwd) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function resolveProjectRootAndHub(projectRoot) {
  const absInput = path.resolve(expandCliPath(projectRoot || process.cwd()));
  const baseName = path.basename(absInput);
  const parentName = path.basename(path.dirname(absInput));
  const hasHubSubdirsAtInput =
    ['00-project-core', '01-roadmap-and-pm', '02-sprints', '_intake'].some(d =>
      fs.existsSync(path.join(absInput, d))
    ) && !fs.existsSync(path.join(absInput, 'docs', 'project-context-hub'));

  if (baseName === 'project-context-hub' && parentName === 'docs') {
    const absProject = path.resolve(absInput, '..', '..');
    const hubWorkspace = resolveHubWorkspace(absProject, { explicitHubPath: absInput });
    return {
      absProject,
      hubWorkspace: { ...hubWorkspace, isHubV2: true, hubRoot: absInput },
      hubRoot: absInput
    };
  }

  if (baseName === 'project-context-hub' || hasHubSubdirsAtInput) {
    const absProject = baseName === 'project-context-hub' ? path.dirname(absInput) : absInput;
    const hubWorkspace = resolveHubWorkspace(absProject, { explicitHubPath: absInput });
    return {
      absProject,
      hubWorkspace: { ...hubWorkspace, isHubV2: true, hubRoot: absInput },
      hubRoot: absInput
    };
  }

  const hubWorkspace = resolveHubWorkspace(absInput);
  const hubRoot = hubWorkspace.isHubV2
    ? hubWorkspace.hubRoot
    : path.join(absInput, 'docs', 'project-context-hub');
  return { absProject: absInput, hubWorkspace, hubRoot };
}

function resolveActorIdentity(projectRoot, explicitActor) {
  if (explicitActor && String(explicitActor).trim()) {
    return String(explicitActor).trim();
  }
  try {
    const gitUser = execFileSync('git', ['config', 'user.name'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500
    }).trim();
    if (gitUser) return gitUser;
  } catch {
    // non-git or unset git user.name
  }
  return process.env.USER || process.env.USERNAME || 'local-operator';
}

function extractMetaField(rawMd, keyPattern) {
  const lines = String(rawMd || '').split(/\r?\n/);
  for (const line of lines) {
    if (/^##\s+1\./.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const cells = splitMarkdownRow(line);
    if (!cells || cells.length < 2) continue;
    const k = stripMdFormatting(cells[0]);
    if (keyPattern.test(k)) {
      return stripMdFormatting(cells[1]);
    }
  }
  return '';
}

function collectMarkdownFilesInDirs(absHub, subDirs) {
  const files = [];
  for (const relSub of subDirs) {
    const fullDir = path.join(absHub, relSub);
    if (!fs.existsSync(fullDir)) continue;
    const walk = dir => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith('_') || ent.name.startsWith('.')) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile() && ent.name.endsWith('.md')) {
          if (ent.name.endsWith('.template.md') || ent.name.endsWith('.example.md')) continue;
          files.push(full);
        }
      }
    };
    walk(fullDir);
  }
  return files;
}

/**
 * Deterministic `ANTI-PLACEHOLDER-01` scanner (aligned with `ba-context-hub-os/bin/lib/verifier.js`).
 * @param {string} absHub
 * @param {string[]} [scopeSubDirs]
 */
function scanAntiPlaceholders(absHub, scopeSubDirs = null) {
  const subDirs = scopeSubDirs || ['00-project-core', '01-roadmap-and-pm', '02-sprints'];
  const violations = [];

  const mdFiles = collectMarkdownFilesInDirs(absHub, subDirs);
  for (const fullPath of mdFiles) {
    const rel = path.relative(absHub, fullPath).replace(/\\/g, '/');
    const raw = fs.readFileSync(fullPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const m = lines[idx].match(ANTI_PLACEHOLDER_BRACKET_RE);
      if (m) {
        violations.push({
          rule: 'ANTI-PLACEHOLDER-01',
          category: 'ANTI-PLACEHOLDER-01',
          file: rel,
          line: idx + 1,
          token: m[0],
          message: `Unreplaced template bracket placeholder '${m[0]}' remains in '${rel}' at line ${idx + 1}.`,
          remediation: `Replace template placeholder '${m[0]}' in '${rel}' (line ${idx + 1}) with verified project-specific content.`
        });
      }
    }
  }

  const ctxPath = path.join(absHub, '00-project-core', 'PROJECT_CONTEXT.md');
  const cirPath = path.join(absHub, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md');
  const ctxRaw = fs.existsSync(ctxPath) ? fs.readFileSync(ctxPath, 'utf8') : '';
  const cirRaw = fs.existsSync(cirPath) ? fs.readFileSync(cirPath, 'utf8') : '';
  const projectCode = extractMetaField(ctxRaw, /^Project\s+Code$/i);

  if (projectCode.toUpperCase() !== 'UCMS') {
    const targets = [];
    if (subDirs.some(d => d.startsWith('00-project-core')) && ctxRaw) {
      targets.push(['00-project-core/PROJECT_CONTEXT.md', ctxRaw]);
    }
    if (subDirs.some(d => d.startsWith('01-roadmap-and-pm')) && cirRaw) {
      targets.push(['01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md', cirRaw]);
    }
    for (const [rel, content] of targets) {
      const lines = content.split(/\r?\n/);
      for (let idx = 0; idx < lines.length; idx++) {
        const m = lines[idx].match(ANTI_EXAMPLE_LEFTOVER_RE);
        if (m) {
          violations.push({
            rule: 'ANTI-PLACEHOLDER-01',
            category: 'ANTI-PLACEHOLDER-01',
            file: rel,
            line: idx + 1,
            token: m[0],
            message: `Leftover template example token '${m[0]}' detected in '${rel}' line ${idx + 1} while Project Code is '${projectCode || 'UNSET'}' (not 'UCMS').`,
            remediation: `Remove or replace leftover template token '${m[0]}' in '${rel}' (line ${idx + 1}).`
          });
        }
      }
    }
  }

  if (subDirs.some(d => d.startsWith('01-roadmap-and-pm')) && ctxRaw && cirRaw) {
    const ctxVer = extractMetaField(ctxRaw, /^Semantic\s+Version$/i);
    const cirVer = extractMetaField(cirRaw, /^Current\s+Hub\s+Version$/i);
    if (ctxVer && cirVer && ctxVer !== cirVer) {
      violations.push({
        rule: 'ANTI-PLACEHOLDER-01',
        category: 'ANTI-PLACEHOLDER-01',
        file: '01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md',
        line: 1,
        token: `${cirVer} != ${ctxVer}`,
        message: `CHANGE_IMPACT_REGISTER.md 'Current Hub Version' ('${cirVer}') does not match PROJECT_CONTEXT.md 'Semantic Version' ('${ctxVer}').`,
        remediation: `Update Current Hub Version in 01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md to '${ctxVer}'.`
      });
    }
  }

  return violations;
}

/**
 * Runs Context Hub verification via `ba-hub.js` or `ba-context-hub-os/bin/lib/verifier.js`, augmented with `ANTI-PLACEHOLDER-01`.
 * @param {string} absHub
 * @param {{ sprint?: string, strict?: boolean, partial?: boolean, ignoreCategories?: string[] }} [opts]
 */
function runHubVerifier(absHub, opts = {}) {
  const placeholderViolations = scanAntiPlaceholders(absHub);
  const ignoreSet = new Set(Array.isArray(opts.ignoreCategories) ? opts.ignoreCategories : []);
  let baHubResult = null;

  if (hasFullBaHubCli()) {
    const cliArgs = [path.join(BA_HUB_ROOT, 'bin', 'ba-hub.js'), 'verify', `--hub=${absHub}`, '--json'];
    if (opts.sprint) cliArgs.push(`--sprint=${opts.sprint}`);
    if (opts.strict) cliArgs.push('--strict');
    if (opts.partial) cliArgs.push('--partial');
    try {
      const stdout = runNodeCli(cliArgs[0], cliArgs.slice(1), path.dirname(absHub));
      baHubResult = JSON.parse(stdout);
    } catch (err) {
      const out = String(err.stdout || '').trim();
      if (out.startsWith('{')) {
        try {
          baHubResult = JSON.parse(out);
        } catch {
          // ignore parse failure
        }
      }
    }
  }

  if (!baHubResult) {
    const verifierPath = path.join(BA_HUB_ROOT, 'bin', 'lib', 'verifier.js');
    if (fs.existsSync(verifierPath)) {
      try {
        const { verifyHub } = require(verifierPath);
        baHubResult = verifyHub({
          hubDir: absHub,
          sprint: opts.sprint || undefined,
          strict: Boolean(opts.strict),
          partial: Boolean(opts.partial)
        });
      } catch (err) {
        baHubResult = {
          violations: [
            {
              category: 'VERIFIER_ERROR',
              file: 'hub',
              message: err instanceof Error ? err.message : String(err)
            }
          ]
        };
      }
    }
  }

  const combined = [...placeholderViolations];
  const seenKey = new Set(combined.map(v => `${v.rule || v.category}|${v.file}|${v.message}`));
  if (baHubResult && Array.isArray(baHubResult.violations)) {
    for (const v of baHubResult.violations) {
      const cat = v.category || v.rule || 'HUB_VERIFY';
      if (ignoreSet.has(cat)) continue;
      const norm = {
        rule: v.rule || cat,
        category: cat,
        file: v.file || 'hub',
        line: v.line || null,
        message: v.message || String(v),
        remediation: v.remediation || `Fix '${cat}' in '${v.file || 'hub'}': ${v.message}`
      };
      const k = `${norm.rule}|${norm.file}|${norm.message}`;
      if (!seenKey.has(k)) {
        seenKey.add(k);
        combined.push(norm);
      }
    }
  }

  return {
    ok: combined.length === 0,
    violations: combined,
    warnings: baHubResult?.warnings || [],
    featureSummaries: baHubResult?.featureSummaries || []
  };
}

/**
 * Validates mode, role lock, and `roleAssignments` membership in `TEAM_RBAC` mode.
 */
function checkRoleAccess(mode, stageId, actorRole, opts = {}) {
  const normMode = VALID_MODES.has(String(mode || '').toUpperCase())
    ? String(mode).toUpperCase()
    : 'SOLO_FDE';
  const def = getStageDef(stageId);
  const requiredRole = def ? def.ownerRole : 'BA';
  const cleanRole = actorRole ? String(actorRole).trim().toUpperCase() : '';
  const absProject = path.resolve(expandCliPath(opts.projectRoot || process.cwd()));
  const actor = resolveActorIdentity(absProject, opts.actor);
  const cfg = opts.config || loadOrchestratorConfig(absProject);

  if (normMode === 'SOLO_FDE') {
    return {
      ok: true,
      allowed: true,
      mode: 'SOLO_FDE',
      stage: stageId,
      requiredRole,
      actorRole: cleanRole || 'SOLO_FDE',
      actor
    };
  }

  if (!cleanRole || !VALID_ROLES.has(cleanRole) || cleanRole !== requiredRole) {
    return {
      ok: false,
      allowed: false,
      code: 'RBAC_ROLE_LOCKED',
      mode: 'TEAM_RBAC',
      stage: stageId,
      requiredRole,
      actorRole: cleanRole || 'UNSPECIFIED',
      actor,
      message: `Stage '${stageId}' requires role '${requiredRole}' in TEAM_RBAC mode (caller role: '${cleanRole || 'UNSPECIFIED'}').`
    };
  }

  const assigned = cfg?.roleAssignments?.[requiredRole];
  if (Array.isArray(assigned) && assigned.length > 0 && !assigned.includes('*')) {
    const matched = assigned.some(a => String(a).trim().toLowerCase() === actor.toLowerCase());
    if (!matched) {
      return {
        ok: false,
        allowed: false,
        code: 'RBAC_ACTOR_UNAUTHORIZED',
        mode: 'TEAM_RBAC',
        stage: stageId,
        requiredRole,
        actorRole: cleanRole,
        actor,
        allowedActors: assigned,
        message: `Actor '${actor}' is not in roleAssignments.${requiredRole} ([${assigned.join(', ')}]).`
      };
    }
  }

  return {
    ok: true,
    allowed: true,
    mode: 'TEAM_RBAC',
    stage: stageId,
    requiredRole,
    actorRole: cleanRole,
    actor
  };
}

function discoverSprintIds(absHub) {
  const sprintsRoot = path.join(absHub, '02-sprints');
  if (!fs.existsSync(sprintsRoot)) return [];
  return fs.readdirSync(sprintsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort();
}

function readPersistedState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const inProcessStateLocks = new Map();

function writePersistedState(statePath, stateObj) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const payload = JSON.stringify(stateObj, null, 2) + '\n';
  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, statePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore temp cleanup failure
    }
    throw err;
  }
}

/**
 * Serializes state mutations across both in-process callers and separate CLI/MCP/WebUI processes
 * using a queued mutex plus an exclusive advisory `.os-state.lock` file in `hubRoot`.
 * @template T
 * @param {string} projectRoot
 * @param {() => Promise<T>|T} fn
 * @param {{ timeoutMs?: number, staleMs?: number, pollMs?: number }} [opts]
 * @returns {Promise<T>}
 */
async function withStateLock(projectRoot, fn, opts = {}) {
  const { hubRoot } = resolveProjectRootAndHub(projectRoot);
  fs.mkdirSync(hubRoot, { recursive: true });
  const lockPath = path.join(hubRoot, '.os-state.lock');
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 10000;
  const staleMs = Number(opts.staleMs) > 0 ? Number(opts.staleMs) : 30000;
  const pollMs = Number(opts.pollMs) > 0 ? Number(opts.pollMs) : 25;

  const previous = inProcessStateLocks.get(lockPath) || Promise.resolve();
  let releaseQueue;
  const currentQueue = new Promise(resolve => {
    releaseQueue = resolve;
  });
  const chained = previous.catch(() => {}).then(() => currentQueue);
  inProcessStateLocks.set(lockPath, chained);

  await previous.catch(() => {});

  let lockAcquired = false;
  try {
    const deadline = Date.now() + timeoutMs;
    while (!lockAcquired) {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        try {
          fs.writeFileSync(
            fd,
            JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }) + '\n',
            'utf8'
          );
        } finally {
          fs.closeSync(fd);
        }
        lockAcquired = true;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > staleMs) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch (statErr) {
          if (statErr.code === 'ENOENT') continue;
        }
        if (Date.now() >= deadline) {
          const timeoutErr = new Error(`Timed out waiting for state lock '${lockPath}' after ${timeoutMs}ms.`);
          timeoutErr.code = 'STATE_LOCK_TIMEOUT';
          throw timeoutErr;
        }
        await new Promise(resolve => setTimeout(resolve, pollMs));
      }
    }

    return await fn();
  } finally {
    if (lockAcquired) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore lock removal errors
      }
    }
    releaseQueue();
    if (inProcessStateLocks.get(lockPath) === chained) {
      inProcessStateLocks.delete(lockPath);
    }
  }
}

function hasApprovedCheckpoint(persisted, stageId, sprintId) {
  const trail = Array.isArray(persisted?.checkpointAuditTrail) ? persisted.checkpointAuditTrail : [];
  return trail.some(
    entry =>
      entry &&
      entry.stage === stageId &&
      (!sprintId || !entry.sprint || entry.sprint === sprintId) &&
      entry.decision === 'APPROVED'
  );
}

/**
 * Computes deterministic SHA-256 digest (`sha256:<16 hex>`) across files in scope for a given stage.
 */
function computeStageDigest(absProject, hubRoot, stageId, activeSprint) {
  const hash = crypto.createHash('sha256');
  const candidates = [];

  if (stageId === 'INTAKE') {
    candidates.push(
      path.join(absProject, '.ai', 'context', 'CODEBASE_MAP.md'),
      path.join(absProject, 'context', 'CODEBASE_MAP.md'),
      path.join(hubRoot, '_intake', 'INTAKE_MANIFEST.md')
    );
  } else if (stageId === 'CORE_BOOTSTRAP') {
    candidates.push(
      path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'),
      path.join(hubRoot, '00-project-core', 'GLOSSARY_AND_ENUMS.md'),
      path.join(hubRoot, '00-project-core', 'SEED_DEFAULTS_CATALOG.md')
    );
  } else if (stageId === 'SPRINT_PLAN') {
    candidates.push(
      path.join(hubRoot, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md'),
      path.join(hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md'),
      path.join(hubRoot, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md')
    );
  } else if (stageId === 'SPRINT_SPECS' || stageId === 'GATE_A_SEAL' || stageId === 'GATE_B_ENG') {
    const sprintDir = path.join(hubRoot, '02-sprints', activeSprint);
    if (fs.existsSync(sprintDir)) {
      for (const f of fs.readdirSync(sprintDir).sort()) {
        if (f.endsWith('.md')) candidates.push(path.join(sprintDir, f));
      }
    }
    if (stageId === 'GATE_A_SEAL') {
      candidates.push(path.join(hubRoot, '04-traceability-and-exports', 'RTM_MATRIX.csv'));
    }
    if (stageId === 'GATE_B_ENG') {
      candidates.push(
        path.join(absProject, 'docs', 'business-context', 'DRIFT_RADAR_REPORT.md'),
        path.join(absProject, 'docs', 'business-context', 'SPRINT_EXECUTION_PLAN.md')
      );
    }
  } else if (stageId === 'DEV_IMPLEMENT') {
    candidates.push(
      path.join(absProject, 'docs', 'business-context', 'SPRINT_EXECUTION_PLAN.md'),
      path.join(absProject, 'docs', 'business-context', 'DEV_IMPLEMENTATION_ATTESTATION.json')
    );
  } else if (stageId === 'SECURITY_PERF_GATE') {
    candidates.push(
      path.join(absProject, 'docs', 'security', 'SECURITY_AUDIT_REPORT.md'),
      path.join(absProject, 'docs', 'architecture', 'PERFORMANCE_BOTTLENECK_REPORT.md'),
      path.join(absProject, 'docs', 'security', 'SECURITY_DELIVERY_CHECKLIST.md')
    );
  } else if (stageId === 'QA_HANDOFF') {
    candidates.push(path.join(absProject, 'docs', 'openapi.json'));
  } else if (stageId === 'RELEASE_SEAL') {
    candidates.push(
      path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'),
      path.join(hubRoot, '02-sprints', activeSprint, `SPRINT_${activeSprint}_MANIFEST.md`),
      path.join(absProject, 'docs', 'security', 'SECURITY_DELIVERY_CHECKLIST.md')
    );
  }

  let hashedAny = false;
  for (const fp of candidates) {
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      hash.update(path.relative(absProject, fp));
      hash.update('\0');
      hash.update(fs.readFileSync(fp));
      hash.update('\n');
      hashedAny = true;
    }
  }
  if (!hashedAny) {
    hash.update(`empty:${stageId}:${activeSprint}`);
  }
  return `sha256:${hash.digest('hex').slice(0, 16)}`;
}

function buildHandoffQueue({ absProject, currentStage, activeSprint, pendingCheckpoint, openStages, deltaHistory }) {
  const queue = { BA: [], TECH_LEAD: [], DEV: [], SECURITY: [], QA: [], PM: [] };
  const pendingHandoffs = [];

  if (currentStage && currentStage !== 'COMPLETED') {
    const def = getStageDef(currentStage);
    if (def && queue[def.ownerRole]) {
      let itemType = 'STAGE_EXECUTION';
      let summary = `Execute stage '${def.id}' (${def.title}) for Sprint ${activeSprint}`;
      if (pendingCheckpoint && pendingCheckpoint.stage === def.id) {
        itemType = 'HUMAN_CHECKPOINT';
        summary = `Approve Human Checkpoint '${def.checkpointLabel || def.id}' for Sprint ${activeSprint}`;
      } else if (openStages && openStages[def.id]) {
        itemType = 'CIRCUIT_ESCALATION';
        summary = `Circuit breaker open on '${def.id}' (${openStages[def.id].retryCount} failures); manual intervention required`;
      }

      const entry = {
        role: def.ownerRole,
        stage: def.id,
        sprint: activeSprint,
        type: itemType,
        summary,
        targetPaths: def.targetPaths.map(p => p.replace('<SprintID>', activeSprint))
      };
      queue[def.ownerRole].push(entry);
      pendingHandoffs.push(entry);
    }
  }

  const deltaStatePath = path.join(absProject, 'docs', 'business-context', '.delta-state.json');
  let appliedVersions = new Set();
  if (fs.existsSync(deltaStatePath)) {
    try {
      const ds = JSON.parse(fs.readFileSync(deltaStatePath, 'utf8'));
      for (const [ver, info] of Object.entries(ds.deltas || {})) {
        if (info && info.status === 'APPLIED') appliedVersions.add(String(ver).toLowerCase());
      }
    } catch {
      // ignore
    }
  }

  if (Array.isArray(deltaHistory)) {
    for (const d of deltaHistory) {
      if (!d || !d.toVersion) continue;
      if (appliedVersions.has(String(d.toVersion).toLowerCase())) continue;
      const devItem = {
        role: 'DEV',
        stage: 'DELTA_EVOLVE',
        sprint: activeSprint,
        crId: d.crId,
        version: d.toVersion,
        type: 'DELTA_IMPLEMENTATION',
        summary: `Implement ${d.crId} (${d.fromVersion} -> ${d.toVersion}) on ${d.targetId}`,
        targetPaths: [d.deltaPackPath, d.executionPlanPath].filter(Boolean)
      };
      const qaItem = {
        role: 'QA',
        stage: 'DELTA_EVOLVE',
        sprint: activeSprint,
        crId: d.crId,
        version: d.toVersion,
        type: 'DELTA_REGRESSION',
        summary: `Verify CR regression coverage for ${d.crId} (${d.toVersion})`,
        targetPaths: [d.deltaPackPath].filter(Boolean)
      };
      queue.DEV.push(devItem);
      queue.QA.push(qaItem);
      pendingHandoffs.push(devItem, qaItem);
    }
  }

  return { handoffQueue: queue, pendingHandoffs };
}

/**
 * Inspects project & Context Hub artifacts on disk + `.os-state.json` to synthesize authoritative 11-stage state.
 * @param {string} projectRoot
 * @param {{ sprint?: string, mode?: string, persistMode?: boolean, requireHumanCheckpoints?: boolean }} [opts]
 */
function inspectProjectState(projectRoot, opts = {}) {
  const { absProject, hubWorkspace, hubRoot } = resolveProjectRootAndHub(projectRoot);
  const statePath = path.join(hubRoot, '.os-state.json');
  const persisted = readPersistedState(statePath);
  const orchConfig = loadOrchestratorConfig(absProject, {
    requireHumanCheckpoints: opts.requireHumanCheckpoints
  });

  const requestedMode = opts.mode ? String(opts.mode).toUpperCase() : '';
  const persistedMode = persisted?.mode ? String(persisted.mode).toUpperCase() : '';
  const configMode = orchConfig.mode ? String(orchConfig.mode).toUpperCase() : '';
  const mode = VALID_MODES.has(requestedMode)
    ? requestedMode
    : (VALID_MODES.has(persistedMode)
      ? persistedMode
      : (VALID_MODES.has(configMode) ? configMode : 'SOLO_FDE'));

  const requireHumanCheckpoints = opts.requireHumanCheckpoints !== undefined
    ? Boolean(opts.requireHumanCheckpoints)
    : (persisted?.requireHumanCheckpoints !== undefined
      ? Boolean(persisted.requireHumanCheckpoints)
      : Boolean(orchConfig.requireHumanCheckpoints));

  const checkpointStages = Array.isArray(orchConfig.checkpointStages)
    ? orchConfig.checkpointStages
    : ['CORE_BOOTSTRAP', 'SPRINT_SPECS', 'DEV_IMPLEMENT'];

  const discoveredSprints = discoverSprintIds(hubRoot);
  const activeSprint = String(
    opts.sprint || persisted?.activeSprint || discoveredSprints[0] || 'S1'
  ).trim();

  const ctxPath = path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md');
  const enumPath = path.join(hubRoot, '00-project-core', 'GLOSSARY_AND_ENUMS.md');
  const seedPath = path.join(hubRoot, '00-project-core', 'SEED_DEFAULTS_CATALOG.md');
  const intakeManifestPath = path.join(hubRoot, '_intake', 'INTAKE_MANIFEST.md');
  const masterPlanPath = path.join(hubRoot, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md');
  const wbsPath = path.join(hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md');
  const cirPath = path.join(hubRoot, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md');
  const sprintDir = path.join(hubRoot, '02-sprints', activeSprint);
  const manifestPath = path.join(sprintDir, `SPRINT_${activeSprint}_MANIFEST.md`);
  const rtmPath = path.join(hubRoot, '04-traceability-and-exports', 'RTM_MATRIX.csv');
  const driftReportPath = path.join(absProject, 'docs', 'business-context', 'DRIFT_RADAR_REPORT.md');
  const devAttestPath = path.join(absProject, 'docs', 'business-context', 'DEV_IMPLEMENTATION_ATTESTATION.json');
  const secAuditPath = path.join(absProject, 'docs', 'security', 'SECURITY_AUDIT_REPORT.md');
  const perfReportPath = path.join(absProject, 'docs', 'architecture', 'PERFORMANCE_BOTTLENECK_REPORT.md');
  const pentestChecklistPath = path.join(absProject, 'docs', 'security', 'SECURITY_DELIVERY_CHECKLIST.md');
  const cyclesDir = path.join(absProject, 'docs', 'handoff', 'cycles');
  const postmanDir = path.join(absProject, 'docs', 'postman');
  const qaAttestPath = path.join(absProject, 'docs', 'business-context', 'QA_HANDOFF_ATTESTATION.json');
  const releaseAttestPath = path.join(
    hubRoot,
    '04-traceability-and-exports',
    `RELEASE_${activeSprint}_ATTESTATION.json`
  );

  const ctxRaw = fs.existsSync(ctxPath) ? fs.readFileSync(ctxPath, 'utf8') : '';
  const projectCode = extractMetaField(ctxRaw, /^Project\s+Code$/i) || persisted?.projectCode || 'PRJ';
  const projectName = persisted?.projectName || extractMetaField(ctxRaw, /^Project\s+Name$/i) || path.basename(absProject);
  const semanticVersion = persisted?.semanticVersion || extractMetaField(ctxRaw, /^Semantic\s+Version$/i) || 'v1.0.0';
  const lifecycleScope = persisted?.lifecycleScope || null;

  const sprintFeaturePaths = scanHubAndLegacyFeatures(
    { ...hubWorkspace, isHubV2: fs.existsSync(hubRoot), hubRoot },
    activeSprint
  );
  const parsedFeatures = [];
  for (const fp of sprintFeaturePaths) {
    try {
      parsedFeatures.push(parseFeatureDocument(fp, { isHubV2: true }));
    } catch {
      // ignore unparseable feature file here; caught in verifier
    }
  }

  const corePh = scanAntiPlaceholders(hubRoot, ['00-project-core']);
  const planPh = scanAntiPlaceholders(hubRoot, ['01-roadmap-and-pm']);
  const specsPh = scanAntiPlaceholders(hubRoot, [path.join('02-sprints', activeSprint)]);

  const stage1Passed = fs.existsSync(intakeManifestPath) || fs.existsSync(ctxPath);

  const stage2DiskReady =
    fs.existsSync(ctxPath) &&
    fs.existsSync(enumPath) &&
    fs.existsSync(seedPath) &&
    corePh.length === 0;
  const stage2CheckpointOk =
    !requireHumanCheckpoints ||
    !checkpointStages.includes('CORE_BOOTSTRAP') ||
    hasApprovedCheckpoint(persisted, 'CORE_BOOTSTRAP', activeSprint) ||
    persisted?.stages?.CORE_BOOTSTRAP === 'PASSED' ||
    fs.existsSync(manifestPath);
  const stage2Passed = stage2DiskReady && stage2CheckpointOk;

  const stage3Passed =
    stage2Passed &&
    fs.existsSync(masterPlanPath) &&
    fs.existsSync(wbsPath) &&
    fs.existsSync(cirPath) &&
    planPh.length === 0;

  const stage4DiskReady =
    stage3Passed &&
    parsedFeatures.length > 0 &&
    parsedFeatures.every(f => f.gateA === 'READY_FOR_DEV' || f.gateA === 'IMPLEMENTED') &&
    specsPh.length === 0;
  const stage4CheckpointOk =
    !requireHumanCheckpoints ||
    !checkpointStages.includes('SPRINT_SPECS') ||
    hasApprovedCheckpoint(persisted, 'SPRINT_SPECS', activeSprint) ||
    persisted?.stages?.SPRINT_SPECS === 'PASSED' ||
    fs.existsSync(manifestPath);
  const stage4Passed = stage4DiskReady && stage4CheckpointOk;

  const stage5Passed =
    stage4Passed &&
    fs.existsSync(manifestPath) &&
    fs.existsSync(rtmPath);

  const stage6Passed =
    stage5Passed &&
    parsedFeatures.length > 0 &&
    parsedFeatures.every(f => f.gateB === 'READY_TO_CODE') &&
    fs.existsSync(driftReportPath) &&
    !fs.readFileSync(driftReportPath, 'utf8').includes('CRITICAL_DRIFT');

  const hasCycleHandoff = fs.existsSync(cyclesDir) &&
    fs.readdirSync(cyclesDir).some(f => /^CYCLE-.*_HANDOFF\.md$/i.test(f));

  const stage7DiskReady =
    stage6Passed &&
    hasCycleHandoff &&
    fs.existsSync(devAttestPath);
  const stage7CheckpointOk =
    !requireHumanCheckpoints ||
    !checkpointStages.includes('DEV_IMPLEMENT') ||
    hasApprovedCheckpoint(persisted, 'DEV_IMPLEMENT', activeSprint) ||
    persisted?.stages?.DEV_IMPLEMENT === 'PASSED' ||
    Boolean(persisted?.releaseSealed);
  const stage7Passed = stage7DiskReady && stage7CheckpointOk;

  const stage8Passed =
    stage7Passed &&
    fs.existsSync(secAuditPath) &&
    !fs.readFileSync(secAuditPath, 'utf8').includes('SECURITY_ALERT_REVIEW_REQUIRED') &&
    fs.existsSync(perfReportPath) &&
    fs.existsSync(pentestChecklistPath) &&
    persisted?.stages?.SECURITY_PERF_GATE !== 'BLOCKED' &&
    persisted?.lastDiagnostics?.stage !== 'SECURITY_PERF_GATE' &&
    !persisted?.circuitBreaker?.openStages?.SECURITY_PERF_GATE;

  const hasPostman = fs.existsSync(postmanDir) &&
    fs.readdirSync(postmanDir).some(f => f.endsWith('.json'));
  const stage9Passed =
    stage8Passed &&
    hasCycleHandoff &&
    hasPostman &&
    (fs.existsSync(qaAttestPath) || persisted?.stages?.QA_HANDOFF === 'PASSED' || Boolean(persisted?.releaseSealed));

  const stage10Passed =
    stage9Passed &&
    Boolean(persisted?.releaseSealed) &&
    fs.existsSync(releaseAttestPath);

  const deltaHistory = Array.isArray(persisted?.deltaHistory) ? persisted.deltaHistory : [];
  const deltaPassed = deltaHistory.length > 0 || persisted?.stages?.DELTA_EVOLVE === 'PASSED';

  const diskResults = {
    INTAKE: stage1Passed,
    CORE_BOOTSTRAP: stage2Passed,
    SPRINT_PLAN: stage3Passed,
    SPRINT_SPECS: stage4Passed,
    GATE_A_SEAL: stage5Passed,
    GATE_B_ENG: stage6Passed,
    DEV_IMPLEMENT: stage7Passed,
    SECURITY_PERF_GATE: stage8Passed,
    QA_HANDOFF: stage9Passed,
    RELEASE_SEAL: stage10Passed,
    DELTA_EVOLVE: deltaPassed
  };

  let earliestIncomplete = 'COMPLETED';
  for (const def of MAIN_STAGE_DEFINITIONS) {
    if (!diskResults[def.id]) {
      earliestIncomplete = def.id;
      break;
    }
  }

  let currentStage = earliestIncomplete;
  if (persisted?.currentStage && persisted.currentStage !== 'COMPLETED') {
    const pDef = getStageDef(persisted.currentStage);
    const dDef = getStageDef(earliestIncomplete);
    if (pDef && dDef && pDef.track === 'MAIN' && pDef.index < dDef.index) {
      currentStage = persisted.currentStage;
    }
  }

  const maxRetries = orchConfig.circuitBreaker?.maxRetries ?? 3;
  const retryCounts = { ...(persisted?.circuitBreaker?.retryCounts || {}) };
  const openStages = { ...(persisted?.circuitBreaker?.openStages || {}) };
  const pendingCheckpoint = persisted?.pendingCheckpoint &&
    !diskResults[persisted.pendingCheckpoint.stage]
    ? persisted.pendingCheckpoint
    : null;

  const stageStatuses = {};
  for (const def of STAGE_DEFINITIONS) {
    let status = def.track === 'CR_DELTA' ? 'STANDBY' : 'PENDING';
    if (diskResults[def.id]) {
      status = 'PASSED';
    } else if (openStages[def.id]) {
      status = 'CIRCUIT_OPEN_ESCALATED';
    } else if (pendingCheckpoint && pendingCheckpoint.stage === def.id) {
      status = 'PENDING_HUMAN_APPROVAL';
    } else if (persisted?.stages?.[def.id] === 'PENDING_HUMAN_APPROVAL' && def.id === currentStage) {
      status = 'PENDING_HUMAN_APPROVAL';
    } else if (def.id === currentStage) {
      status = persisted?.lastDiagnostics?.stage === def.id ? 'BLOCKED' : 'IN_PROGRESS';
    }
    stageStatuses[def.id] = {
      index: def.index,
      stage: def.id,
      track: def.track,
      title: def.title,
      ownerRole: def.ownerRole,
      checkpoint: Boolean(def.checkpoint),
      status,
      diskReady: Boolean(diskResults[def.id]),
      retryCount: Number(retryCounts[def.id] || 0),
      maxRetries
    };
  }

  const { handoffQueue, pendingHandoffs } = buildHandoffQueue({
    absProject,
    currentStage,
    activeSprint,
    pendingCheckpoint,
    openStages,
    deltaHistory
  });

  if (opts.persistMode) {
    const nextState = {
      ...(persisted || {}),
      schemaVersion: '4.3.0',
      projectCode,
      projectName,
      semanticVersion,
      lifecycleScope,
      mode,
      requireHumanCheckpoints,
      activeSprint,
      currentStage,
      stages: Object.fromEntries(STAGE_DEFINITIONS.map(s => [s.id, stageStatuses[s.id].status])),
      pendingCheckpoint,
      checkpointAuditTrail: Array.isArray(persisted?.checkpointAuditTrail) ? persisted.checkpointAuditTrail : [],
      circuitBreaker: { maxRetries, retryCounts, openStages },
      handoffQueue,
      pendingHandoffs,
      addonLogs: Array.isArray(persisted?.addonLogs) ? persisted.addonLogs : [],
      deltaHistory,
      releaseSealed: Boolean(persisted?.releaseSealed),
      sealedRelease: persisted?.sealedRelease || null,
      lastDiagnostics: persisted?.lastDiagnostics || null,
      updatedAt: new Date().toISOString()
    };
    writePersistedState(statePath, nextState);
  }

  const addonsSummary = listLoadedAddons(absProject);

  return {
    ok: true,
    schemaVersion: '4.3.0',
    projectRoot: absProject,
    hubRoot,
    hubExists: fs.existsSync(hubRoot),
    stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
    stateExists: fs.existsSync(statePath),
    mode,
    lifecycleScope,
    requireHumanCheckpoints,
    checkpointStages,
    projectCode,
    projectName,
    semanticVersion,
    activeSprint,
    discoveredSprints,
    currentStage,
    pipelineComplete: currentStage === 'COMPLETED',
    mainStagesPassed: MAIN_STAGE_DEFINITIONS.filter(s => stageStatuses[s.id].status === 'PASSED').length,
    mainStagesTotal: MAIN_STAGE_DEFINITIONS.length,
    stages: stageStatuses,
    pendingCheckpoint,
    checkpointAuditTrail: Array.isArray(persisted?.checkpointAuditTrail) ? persisted.checkpointAuditTrail : [],
    circuitBreaker: { maxRetries, retryCounts, openStages },
    handoffQueue,
    pendingHandoffs,
    addons: addonsSummary.addons,
    addonLogs: Array.isArray(persisted?.addonLogs) ? persisted.addonLogs : [],
    deltaHistory,
    releaseSealed: Boolean(persisted?.releaseSealed),
    sealedRelease: persisted?.sealedRelease || null,
    featuresSummary: {
      count: parsedFeatures.length,
      gateAReadyCount: parsedFeatures.filter(f => f.gateA === 'READY_FOR_DEV' || f.gateA === 'IMPLEMENTED').length,
      gateBReadyCount: parsedFeatures.filter(f => f.gateB === 'READY_TO_CODE').length,
      features: parsedFeatures.map(f => ({
        id: f.id,
        title: f.title,
        wave: f.wave,
        gateA: f.gateA,
        gateB: f.gateB
      }))
    },
    lastDiagnostics: persisted?.lastDiagnostics || null
  };
}

/**
 * Updates Orchestrator mode (`SOLO_FDE` | `TEAM_RBAC`) inside `.os-state.json`.
 */
function setOrchestratorMode(projectRoot, newMode, sprint, opts = {}) {
  const norm = String(newMode || '').toUpperCase().trim();
  if (!VALID_MODES.has(norm)) {
    return {
      ok: false,
      code: 'INVALID_MODE',
      message: `Invalid mode '${newMode}'. Allowed values: SOLO_FDE, TEAM_RBAC.`
    };
  }
  return inspectProjectState(projectRoot, {
    sprint,
    mode: norm,
    persistMode: true,
    requireHumanCheckpoints: opts.requireHumanCheckpoints
  });
}

/**
 * Resolves a hub-relative or repo-relative artifact path into a clean absolute path inside `projectRoot`.
 */
function resolveFullProjectFilePath(projectRoot, hubRoot, rawFile) {
  const clean = String(rawFile || '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
  if (!clean || clean === 'hub') {
    return hubRoot;
  }
  if (path.isAbsolute(clean)) {
    return path.normalize(clean);
  }
  const slashNorm = clean.replace(/\\/g, '/').replace(/^\.\//, '');
  if (slashNorm.startsWith('docs/project-context-hub/')) {
    return path.join(hubRoot, slashNorm.slice('docs/project-context-hub/'.length));
  }
  if (/^(?:00-project-core|01-roadmap-and-pm|02-sprints|03-version-deltas|04-traceability-and-exports|_intake)(?:\/|$)/i.test(slashNorm)) {
    return path.join(hubRoot, slashNorm);
  }
  return path.join(projectRoot, slashNorm);
}

/**
 * Computes stage-scoped missing files and live verifier diagnostics for `buildStageDirective`.
 */
function collectStageScopeDetails(state, stageId) {
  const { projectRoot, hubRoot, activeSprint } = state;
  const missingFiles = [];
  let diagnostics = [];

  if (stageId === 'INTAKE') {
    if (!fs.existsSync(path.join(projectRoot, '.ai', 'context', 'CODEBASE_MAP.md'))) {
      missingFiles.push('.ai/context/CODEBASE_MAP.md');
    }
    if (!fs.existsSync(path.join(hubRoot, '_intake', 'INTAKE_MANIFEST.md'))) {
      missingFiles.push('docs/project-context-hub/_intake/INTAKE_MANIFEST.md');
    }
  } else if (stageId === 'CORE_BOOTSTRAP') {
    for (const rel of ['PROJECT_CONTEXT.md', 'GLOSSARY_AND_ENUMS.md', 'SEED_DEFAULTS_CATALOG.md']) {
      if (!fs.existsSync(path.join(hubRoot, '00-project-core', rel))) {
        missingFiles.push(`docs/project-context-hub/00-project-core/${rel}`);
      }
    }
    diagnostics = scanAntiPlaceholders(hubRoot, ['00-project-core']);
  } else if (stageId === 'SPRINT_PLAN') {
    for (const rel of ['SPRINT_MASTER_PLAN.md', 'BACKLOG_WBS.md', 'CHANGE_IMPACT_REGISTER.md']) {
      if (!fs.existsSync(path.join(hubRoot, '01-roadmap-and-pm', rel))) {
        missingFiles.push(`docs/project-context-hub/01-roadmap-and-pm/${rel}`);
      }
    }
    diagnostics = scanAntiPlaceholders(hubRoot, ['00-project-core', '01-roadmap-and-pm']);
  } else if (stageId === 'SPRINT_SPECS') {
    const sprintDir = path.join(hubRoot, '02-sprints', activeSprint);
    const hasFeat = fs.existsSync(sprintDir) && fs.readdirSync(sprintDir).some(f => /^FEATURE-.*\.md$/i.test(f));
    if (!hasFeat) {
      missingFiles.push(`docs/project-context-hub/02-sprints/${activeSprint}/FEATURE-<ID>.md`);
    } else {
      diagnostics = runHubVerifier(hubRoot, {
        sprint: activeSprint,
        strict: true,
        ignoreCategories: ['MANIFEST_STALE', 'MANIFEST_MISSING']
      }).violations;
    }
  } else if (stageId === 'GATE_A_SEAL') {
    diagnostics = runHubVerifier(hubRoot, {
      sprint: activeSprint,
      strict: true,
      ignoreCategories: ['MANIFEST_STALE', 'MANIFEST_MISSING']
    }).violations;
  } else if (stageId === 'GATE_B_ENG') {
    const featureFiles = scanHubAndLegacyFeatures(
      { isHubV2: true, hubRoot, legacyFeaturesDir: path.join(projectRoot, 'docs', 'business-context', 'features') },
      activeSprint
    );
    for (const fp of featureFiles) {
      try {
        const doc = parseFeatureDocument(fp, { isHubV2: true });
        const gb = evaluateGateBChecks(doc.section11);
        if (!gb.allValid) {
          const pendingIds = gb.results.filter(r => !r.valid).map(r => r.id);
          diagnostics.push({
            rule: 'GATE_B_ENG',
            file: path.relative(hubRoot, fp).replace(/\\/g, '/'),
            message: `${doc.id}: Gate B checks incomplete (${pendingIds.join(', ')})`,
            remediation: `Click Verify & Next Step or bind ${pendingIds.join(', ')} in Section 11 ONLY.`
          });
        }
      } catch {
        // ignore
      }
    }
  }

  if (state.lastDiagnostics && state.lastDiagnostics.stage === stageId && Array.isArray(state.lastDiagnostics.violations)) {
    const seen = new Set(diagnostics.map(d => `${d.rule}|${d.file}|${d.message}`));
    for (const prev of state.lastDiagnostics.violations) {
      const k = `${prev.rule}|${prev.file}|${prev.message}`;
      if (!seen.has(k)) {
        seen.add(k);
        diagnostics.push(prev);
      }
    }
  }

  const enrichedDiagnostics = diagnostics.map(d => ({
    ...d,
    projectPath: d.projectPath || resolveFullProjectFilePath(projectRoot, hubRoot, d.file)
  }));

  return { missingFiles, diagnostics: enrichedDiagnostics };
}

/**
 * Builds a concise, context-isolated stage directive for an AI coding agent or human operator.
 */
function buildStageDirective(projectRoot, stage, sprint, opts = {}) {
  const state = inspectProjectState(projectRoot, { sprint, mode: opts.mode });
  const targetStage = stage ? String(stage).toUpperCase().trim() : state.currentStage;

  if (targetStage === 'COMPLETED') {
    const completedDirective = [
      `# Pipeline Complete (${state.projectCode} / Sprint \`${state.activeSprint}\` / Version \`${state.semanticVersion}\`)`,
      `All 10 canonical Engineering OS stages (` + MAIN_STAGE_DEFINITIONS.map(s => s.id).join(' -> ') + `) passed verification.`,
      `For post-baseline Change Requests, invoke \`os_evolve_cr\` (` + '`DELTA_EVOLVE`' + `) to emit a Was -> Current delta pack without resetting sealed features.`
    ].join('\n');
    return {
      ok: true,
      allowed: true,
      mode: state.mode,
      role: opts.role || state.mode,
      stage: 'COMPLETED',
      stageTitle: 'Pipeline Complete',
      checkpoint: false,
      sprint: state.activeSprint,
      ownerRole: 'PM',
      targetPaths: [],
      missingFiles: [],
      rules: [],
      diagnostics: [],
      intakeSources: [],
      gateCliCommand: '',
      readyPrompt: completedDirective,
      directive: completedDirective
    };
  }

  const stageDef = getStageDef(targetStage);
  if (!stageDef) {
    return {
      ok: false,
      allowed: false,
      code: 'UNKNOWN_STAGE',
      message: `Unknown stage '${targetStage}'. Valid stages: ${STAGE_DEFINITIONS.map(s => s.id).join(', ')}.`
    };
  }

  const access = checkRoleAccess(state.mode, targetStage, opts.role, {
    projectRoot: state.projectRoot,
    actor: opts.actor
  });
  if (!access.allowed) {
    return access;
  }

  const { missingFiles, diagnostics } = collectStageScopeDetails(state, targetStage);
  const diagLines = diagnostics.length > 0
    ? diagnostics.map((d, i) => `${i + 1}. **[${d.rule || d.category}]** \`${d.file || 'hub'}\`${d.line ? ` (line ${d.line})` : ''}: ${d.message}\n   - **Fix:** ${d.remediation || 'Resolve violation and re-run os_run_gate_and_advance.'}`)
    : ['_0 active violations detected in this stage scope._'];

  const resolvedTargetPaths = (stageDef.targetPaths || [])
    .map(p => p.replace(/<SprintID>/g, state.activeSprint));

  const targetLines = (missingFiles.length > 0 ? missingFiles : resolvedTargetPaths)
    .map(p => `- \`${p}\``);

  const intakeDir = path.join(state.hubRoot, '_intake');
  let intakeSources = [];
  if (fs.existsSync(intakeDir)) {
    try {
      intakeSources = fs.readdirSync(intakeDir)
        .filter(f => !f.startsWith('.') && fs.statSync(path.join(intakeDir, f)).isFile())
        .sort()
        .map(f => resolveFullProjectFilePath(state.projectRoot, state.hubRoot, `_intake/${f}`));
    } catch {
      intakeSources = [];
    }
  }

  const localOrchCli = path.join(state.projectRoot, '.ai', 'bin', 'orchestrator-cli.js');
  const hasLocalCli = fs.existsSync(localOrchCli);
  const gateCliCommand = hasLocalCli
    ? `node .ai/bin/orchestrator-cli.js --advance --stage=${stageDef.id} --sprint=${state.activeSprint}`
    : '';

  const stageInfo = state.stages[targetStage] || {};
  const statusBanner = stageInfo.status === 'PENDING_HUMAN_APPROVAL'
    ? `\n> ⏸ **HUMAN CHECKPOINT ACTIVE (${stageDef.checkpointLabel}):** Invoke \`os_approve_checkpoint\` (or \`--approve\`) to record immutable sign-off and unlock \`${getNextStageId(stageDef.id)}\`.\n`
    : (stageInfo.status === 'CIRCUIT_OPEN_ESCALATED'
      ? `\n> 🔴 **CIRCUIT BREAKER OPEN (${stageInfo.retryCount}/${stageInfo.maxRetries} retries):** Manual remediation is required before re-running \`os_run_gate_and_advance\`.\n`
      : '');

  const directive = [
    `# Stage Directive [${stageDef.index}/${STAGE_DEFINITIONS.length}]: \`${stageDef.id}\` — ${stageDef.title}`,
    `- **Project:** \`${state.projectCode}\` | **Sprint:** \`${state.activeSprint}\` | **Version:** \`${state.semanticVersion}\` | **Mode:** \`${state.mode}\` | **Authorized Role:** \`${access.actorRole}\` (\`${access.actor}\`, Owner: \`${stageDef.ownerRole}\`)`,
    statusBanner,
    '## Exact Files in Scope (Do NOT edit files outside this stage boundary)',
    ...targetLines,
    '',
    '## Mandatory Stage Invariants',
    ...stageDef.rules.map(r => `- ${r}`),
    '',
    '## Live Verifier Diagnostics & Surgical Remediation Queue',
    ...diagLines,
    '',
    `> When ready, invoke \`os_run_gate_and_advance\` with \`projectRoot="${state.projectRoot}"\` and \`stage="${stageDef.id}"\` to verify deterministically and advance.`
  ].join('\n');

  const fullTargetPaths = resolvedTargetPaths.map(p => resolveFullProjectFilePath(state.projectRoot, state.hubRoot, p));
  const fullMissingFiles = missingFiles.map(m => resolveFullProjectFilePath(state.projectRoot, state.hubRoot, m));
  const autoSealingStage = new Set(['GATE_A_SEAL', 'RELEASE_SEAL']).has(stageDef.id);
  const uniqueDiagFiles = [...new Set(diagnostics.map(d => d.projectPath).filter(Boolean))];
  const topDiagLines = diagnostics.slice(0, 20).map(
    (d, i) => `${i + 1}. [${d.rule || d.category || 'CHECK'}] ${d.projectPath || d.file || 'hub'}${d.line ? `:${d.line}` : ''} — ${d.message}${d.remediation ? ` (Fix: ${d.remediation})` : ''}`
  );
  if (diagnostics.length > 20) {
    topDiagLines.push(`... and ${diagnostics.length - 20} more diagnostics in this stage scope.`);
  }

  const section2Header = autoSealingStage && uniqueDiagFiles.length > 0
    ? `2. Failing Files You Must Fix Inside "${state.projectRoot}" (Do NOT hand-write ${resolvedTargetPaths.join(', ')} — Web UI auto-seals them on Verify):`
    : `2. Target Files You Must Populate / Complete Inside "${state.projectRoot}" (ONLY edit files inside "${state.hubRoot}"):`;
  const section2List = autoSealingStage && uniqueDiagFiles.length > 0
    ? uniqueDiagFiles.map(fp => `- ${fp}`)
    : (autoSealingStage
        ? [`- No manual file edits required — all ${stageDef.id} outputs are generated & sealed automatically when the user clicks "Verify & Next Step" in the Web UI.`]
        : fullTargetPaths.map(p => `- ${p}`));

  const verificationStepLines = hasLocalCli
    ? [
        `- Optionally run inside "${state.projectRoot}": ${gateCliCommand}`,
        `- Or via MCP tool: os_run_gate_and_advance (projectRoot="${state.projectRoot}", stage="${stageDef.id}", sprint="${state.activeSprint}", role="${stageDef.ownerRole}")`,
        `- Or tell the user to click "Verify & Next Step" in the Web UI.`
      ]
    : [
        `- Do NOT run any terminal gate scripts or commands outside "${state.projectRoot}".`,
        `- If MCP tools are connected, you may call: os_run_gate_and_advance (projectRoot="${state.projectRoot}", stage="${stageDef.id}", sprint="${state.activeSprint}", role="${stageDef.ownerRole}")`,
        `- Otherwise, save all edits inside "${state.projectRoot}", STOP, and tell the user to click "Verify & Next Step" in the open Web UI.`
      ];

  const readyPrompt = [
    `Execute Stage #${stageDef.index} (${stageDef.id} — ${stageDef.title}) for InnovaDigits Project "${state.projectName || state.projectCode}" (${state.projectCode}, Sprint ${state.activeSprint}).`,
    '',
    'CRITICAL WORKSPACE LOCK:',
    `- Active Project Root: ${state.projectRoot}`,
    `- Context Hub Root: ${state.hubRoot}`,
    `- Work STRICTLY inside "${state.projectRoot}". Do NOT read, write, or execute any files or CLI scripts outside "${state.projectRoot}".`,
    `Current Stage Status: ${stageInfo.status || 'PENDING'}${stageDef.checkpoint ? ` | Human Checkpoint After Gate: ${stageDef.checkpointLabel}` : ''}`,
    ...(statusBanner ? ['', statusBanner.trim()] : []),
    '',
    '1. Ground-Truth Intake Sources Available:',
    ...(intakeSources.length > 0 ? intakeSources.map(s => `- ${s}`) : [`- (None found in ${path.join(state.hubRoot, '_intake')} — inspect existing files inside "${state.projectRoot}" before writing)`]),
    '',
    section2Header,
    ...section2List,
    ...(fullMissingFiles.length > 0 ? ['', '   Missing Files:', ...fullMissingFiles.map(m => `   - ${m}`)] : []),
    '',
    '3. Mandatory Stage Invariants:',
    ...stageDef.rules.map(r => `- ${r}`),
    '',
    `4. Active Verifier Diagnostics to Resolve (${diagnostics.length}):`,
    ...(topDiagLines.length > 0 ? topDiagLines : ['- 0 blocking diagnostics currently detected. Ready for verification in the Web UI.']),
    '',
    '5. When Done — Verify & Advance:',
    ...verificationStepLines,
    ...(stageDef.checkpoint ? [`- Note: Passing the gate pauses at Human Checkpoint (${stageDef.checkpointLabel}) for explicit user approval in the Web UI.`] : [])
  ].join('\n');

  return {
    ok: true,
    allowed: true,
    mode: state.mode,
    role: access.actorRole,
    actor: access.actor,
    stage: stageDef.id,
    stageTitle: stageDef.title,
    stageIndex: stageDef.index,
    checkpoint: Boolean(stageDef.checkpoint),
    sprint: state.activeSprint,
    ownerRole: stageDef.ownerRole,
    targetPaths: resolvedTargetPaths,
    missingFiles,
    rules: stageDef.rules,
    diagnostics,
    intakeSources,
    gateCliCommand,
    readyPrompt,
    directive
  };
}

function updateRegisterVersion(absHub, targetVer) {
  const cirPath = path.join(absHub, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md');
  if (!fs.existsSync(cirPath)) return;
  const raw = fs.readFileSync(cirPath, 'utf8');
  const next = raw.replace(
    /(\|\s*\*\*Current\s+Hub\s+Version\*\*\s*\|\s*)`?[^|`\n]+`?(\s*\|)/i,
    `$1\`${targetVer}\`$2`
  );
  if (next !== raw) fs.writeFileSync(cirPath, next, 'utf8');
}

/**
 * Deterministic Gate A Seal + CSV Export fallback when standalone `ba-hub.js` sub-modules aren't mounted.
 */
function sealAndExportSprintFallback(absHub, projectCode, sprintId) {
  const sprintDir = path.join(absHub, '02-sprints', sprintId);
  if (!fs.existsSync(sprintDir)) {
    throw new Error(`Sprint folder '02-sprints/${sprintId}' does not exist.`);
  }
  const featureFiles = fs.readdirSync(sprintDir)
    .filter(f => /^FEATURE-.*\.md$/i.test(f) && !f.endsWith('.template.md'))
    .sort()
    .map(f => path.join(sprintDir, f));

  if (featureFiles.length === 0) {
    throw new Error(`No FEATURE-*.md specifications found inside '02-sprints/${sprintId}/'.`);
  }

  const ctxPath = path.join(absHub, '00-project-core', 'PROJECT_CONTEXT.md');
  const seedPath = path.join(absHub, '00-project-core', 'SEED_DEFAULTS_CATALOG.md');
  let ctxRaw = fs.existsSync(ctxPath) ? fs.readFileSync(ctxPath, 'utf8') : '';
  let seedRaw = fs.existsSync(seedPath) ? fs.readFileSync(seedPath, 'utf8') : '';
  const ctxVer = extractMetaField(ctxRaw, /^Semantic\s+Version$/i) || 'v1.0.0';
  const ctxSrd = srdV1.computeSemanticDigest(ctxRaw || '# empty', 'CTX');
  const seedSrd = srdV1.computeSemanticDigest(seedRaw || '# empty', 'SEED');
  const dateStr = new Date().toISOString().slice(0, 10);

  const nextCtx = replaceDigestInMarkdown(ctxRaw, ctxSrd);
  if (ctxRaw && nextCtx !== ctxRaw) {
    fs.writeFileSync(ctxPath, nextCtx, 'utf8');
    ctxRaw = nextCtx;
  }
  const nextSeed = replaceDigestInMarkdown(seedRaw, seedSrd);
  if (seedRaw && nextSeed !== seedRaw) {
    fs.writeFileSync(seedPath, nextSeed, 'utf8');
    seedRaw = nextSeed;
  }
  updateRegisterVersion(absHub, ctxVer);

  const rosterRows = [];
  const rtmRows = ['Feature_ID,Title,Sprint,Wave,Archetype,Gate_A,Feature_SRD'];
  const gateRows = ['Feature_ID,Gate_A,Gate_B,Feature_SRD,Sprint'];

  for (const fp of featureFiles) {
    let raw = fs.readFileSync(fp, 'utf8');
    const meta = srdV1.parseMetadataTable(raw);
    const fid = meta['Feature ID'] || path.basename(fp, '.md');
    const title = meta['Title'] || fid;
    const rawSw = meta['Sprint / Wave'] || `${sprintId} / Wave 1`;
    const waveMatch = rawSw.match(/Wave\s*([123])/i) || (rawSw.includes('/') ? rawSw.split('/').slice(1).join('/').match(/([123])/) : null);
    const wave = waveMatch ? waveMatch[1] : '1';
    const archetype = meta['Archetype'] || 'MUTATION_WORKFLOW';
    const channels = meta['Channels'] || 'Web';
    const gateA = meta['Gate A Status (BA)'] || meta['Gate A Status'] || 'READY_FOR_DEV';
    const gateB = meta['Gate B Status (Eng)'] || meta['Gate B Status'] || 'PENDING';
    // Match verifier.js & contract-checks.js prefix convention (`FEATURE-` -> `F`)
    const prefix = fid.replace(/^FEATURE-/i, 'F');
    const digest = srdV1.computeSemanticDigest(raw, prefix);

    const nextRaw = replaceDigestInMarkdown(raw, digest);
    if (nextRaw !== raw) {
      fs.writeFileSync(fp, nextRaw, 'utf8');
      raw = nextRaw;
    }

    rosterRows.push(
      `| \`${wave}\` | \`${fid}\` | \`./${path.basename(fp)}\` | \`${archetype}\` | \`${channels}\` | \`${gateA}\` | \`100.0%\` | \`${digest}\` | \`${gateB}\` |`
    );
    rtmRows.push(`"${fid}","${title.replace(/"/g, '""')}","${sprintId}","${wave}","${archetype}","${gateA}","${digest}"`);
    gateRows.push(`"${fid}","${gateA}","${gateB}","${digest}","${sprintId}"`);
  }

  const manifestPath = path.join(sprintDir, `SPRINT_${sprintId}_MANIFEST.md`);
  const manifestMd = [
    `# SPRINT MANIFEST & HANDOFF PACK — \`${sprintId}\``,
    '',
    '| Metadata Field | Canonical Value |',
    '|---|---|',
    `| **Project Code** | \`${projectCode}\` |`,
    `| **Sprint / Batch ID** | \`${sprintId}\` |`,
    `| **Manifest Version** | \`${ctxVer}\` |`,
    `| **Bound Project Context** | \`00-project-core/PROJECT_CONTEXT.md @ ${ctxVer} (${ctxSrd})\` |`,
    `| **Bound Seed Catalog** | \`00-project-core/SEED_DEFAULTS_CATALOG.md @ ${ctxVer} (${seedSrd})\` |`,
    `| **Batch Gate A Status** | \`ALL_READY_FOR_DEV\` |`,
    `| **Batch Gate B Status** | \`PENDING_ENG_AUDIT\` |`,
    `| **Last Updated** | \`${dateStr}\` |`,
    '',
    '## 2. Feature Readiness & Scoped Semantic Digest Roster',
    '| Wave (`1`/`2`/`3`) | Feature ID | Spec File | Archetype | Channels | Gate A (`BA`) | `VALID %` | Semantic Rule Digest (`feature_srd`) | Gate B (`Eng`) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rosterRows,
    ''
  ].join('\n');
  fs.writeFileSync(manifestPath, manifestMd, 'utf8');

  const exportDir = path.join(absHub, '04-traceability-and-exports');
  fs.mkdirSync(exportDir, { recursive: true });
  fs.writeFileSync(path.join(exportDir, 'RTM_MATRIX.csv'), rtmRows.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(exportDir, 'GATE_EVIDENCE.csv'), gateRows.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(exportDir, 'SEED_DEFAULTS_EXPORT.csv'), 'Seed_ID,Status\n', 'utf8');

  return { manifestPath, featureCount: featureFiles.length };
}

/**
 * Generates unified OpenAPI, Postman v2.1, Pentest Postman, and Cycle Handoff deliverables (`QA_HANDOFF`).
 */
function generateQaPack(projectRoot, opts = {}) {
  const state = inspectProjectState(projectRoot, { sprint: opts.sprint, mode: opts.mode });
  const access = checkRoleAccess(state.mode, 'QA_HANDOFF', opts.role, {
    projectRoot: state.projectRoot,
    actor: opts.actor
  });
  if (!access.allowed) {
    return access;
  }

  const { projectRoot: absProject, activeSprint } = state;
  const executed = [];
  const warnings = [];

  const steps = [
    {
      name: 'build-unified-openapi',
      script: path.join(BIN_DIR, 'build-unified-openapi.js'),
      args: [],
      condition: () => fs.existsSync(path.join(absProject, 'docs', 'modules'))
    },
    {
      name: 'build-postman',
      script: path.join(BIN_DIR, 'build-postman.js'),
      args: ['--force'],
      condition: () => true
    },
    {
      name: 'build-pentest-postman',
      script: path.join(BIN_DIR, 'build-pentest-postman.js'),
      args: ['--force'],
      condition: () => true
    },
    {
      name: 'build-cycle-handoff',
      script: path.join(BIN_DIR, 'build-cycle-handoff.js'),
      args: ['--force', `--scope=${activeSprint}`],
      condition: () => true
    }
  ];

  for (const step of steps) {
    if (!fs.existsSync(step.script) || !step.condition()) continue;
    try {
      const output = runNodeCli(step.script, step.args, absProject);
      executed.push({ tool: step.name, ok: true, summary: output.trim().split('\n').slice(-2).join(' | ') });
    } catch (err) {
      warnings.push({ tool: step.name, error: String(err.stderr || err.message || err) });
      executed.push({ tool: step.name, ok: false, error: err.message });
    }
  }

  const cyclesDir = path.join(absProject, 'docs', 'handoff', 'cycles');
  const cycleFiles = fs.existsSync(cyclesDir)
    ? fs.readdirSync(cyclesDir).filter(f => /^CYCLE-.*_HANDOFF\.md$/i.test(f)).sort()
    : [];
  const postmanDir = path.join(absProject, 'docs', 'postman');
  const postmanFiles = fs.existsSync(postmanDir)
    ? fs.readdirSync(postmanDir).filter(f => f.endsWith('.json')).sort()
    : [];

  const qaOk = cycleFiles.length > 0 && postmanFiles.length > 0;
  if (qaOk) {
    const qaAttestPath = path.join(absProject, 'docs', 'business-context', 'QA_HANDOFF_ATTESTATION.json');
    fs.mkdirSync(path.dirname(qaAttestPath), { recursive: true });
    fs.writeFileSync(
      qaAttestPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          sprint: activeSprint,
          actor: access.actor,
          openapiPath: fs.existsSync(path.join(absProject, 'docs', 'openapi.json')) ? 'docs/openapi.json' : null,
          postmanFiles: postmanFiles.map(f => `docs/postman/${f}`),
          latestCycleHandoff: `docs/handoff/cycles/${cycleFiles[cycleFiles.length - 1]}`
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
  }

  return {
    ok: qaOk,
    stage: 'QA_HANDOFF',
    sprint: activeSprint,
    actor: access.actor,
    executed,
    warnings,
    artifacts: {
      openapiPath: fs.existsSync(path.join(absProject, 'docs', 'openapi.json')) ? 'docs/openapi.json' : null,
      postmanCount: postmanFiles.length,
      postmanFiles: postmanFiles.map(f => `docs/postman/${f}`),
      latestCycleHandoff: cycleFiles.length > 0 ? `docs/handoff/cycles/${cycleFiles[cycleFiles.length - 1]}` : null
    }
  };
}

/**
 * Appends resolved recurring root causes into `<projectRoot>/.ai/context/LESSONS_LEARNED.md` (deduplicated).
 */
function appendRecurringLessonLearned(absProject, stageId, lastDiagnostics, retryCount) {
  const llPath = path.join(absProject, '.ai', 'context', 'LESSONS_LEARNED.md');
  fs.mkdirSync(path.dirname(llPath), { recursive: true });

  const prevViolations = Array.isArray(lastDiagnostics?.violations) ? lastDiagnostics.violations : [];
  const rules = [...new Set(prevViolations.map(v => v.rule || v.category || stageId))];
  const ruleKey = rules.join(', ') || stageId;
  const sampleMsg = prevViolations[0]?.message || `Stage '${stageId}' failed ${retryCount} times before resolution.`;
  const sampleFix = prevViolations[0]?.remediation || `Verify ${stageId} invariants cleanly before advancing.`;
  const dateStr = new Date().toISOString().slice(0, 10);

  let raw = '';
  if (fs.existsSync(llPath)) {
    raw = fs.readFileSync(llPath, 'utf8');
  } else {
    raw = [
      '# Institutional Memory & Self-Healing Project Knowledge (`LESSONS_LEARNED.md`)',
      '',
      '| ID | Domain / Component | Context & Anti-Pattern Discovered | Hard Institutional Invariant | Resolved Date |',
      '| :--- | :--- | :--- | :--- | :--- |',
      ''
    ].join('\n');
  }

  const dedupMarker = `${stageId} / ${ruleKey}`;
  if (raw.includes(dedupMarker)) {
    return null;
  }

  const existingIds = [...raw.matchAll(/\*\*LL-(\d+)\*\*/g)].map(m => parseInt(m[1], 10));
  const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const nextId = `LL-${String(nextNum).padStart(2, '0')}`;
  const cleanCell = s => String(s || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').slice(0, 180);

  const row = `| **${nextId}** | \`${cleanCell(dedupMarker)}\` | Recurring gate failure (${retryCount} retries): ${cleanCell(sampleMsg)} | ${cleanCell(sampleFix)} | ${dateStr} |`;
  fs.writeFileSync(llPath, raw.trimEnd() + '\n' + row + '\n', 'utf8');
  return nextId;
}

function buildRemediationPacket(stageId, activeSprint, retryCount, maxRetries, circuitOpen, violations) {
  return {
    stage: stageId,
    sprint: activeSprint,
    retryCount,
    maxRetries,
    circuitStatus: circuitOpen ? 'CIRCUIT_OPEN_ESCALATED' : 'CLOSED',
    ruleIds: [...new Set(violations.map(v => v.rule || v.category || `${stageId}_CHECK`))],
    affectedFiles: [...new Set(violations.map(v => v.file).filter(Boolean))],
    surgicalFixes: violations.map(v => ({
      ruleId: v.rule || v.category || `${stageId}_CHECK`,
      file: v.file || 'hub',
      line: v.line || null,
      issue: v.message,
      fixInstruction: v.remediation || `Fix '${v.rule || 'violation'}' in '${v.file || 'hub'}'.`
    }))
  };
}

function bumpMinorSemver(verStr) {
  const m = String(verStr || '').match(/v?(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return 'v1.1.0';
  return `v${Number(m[1])}.${Number(m[2]) + 1}.0`;
}

/**
 * Executes Human-in-the-Loop Checkpoint approval or rejection and records immutable audit entry in `.os-state.json`.
 * @param {string} projectRoot
 * @param {{ stage?: string, decision?: string, actor?: string, notes?: string, sprint?: string, mode?: string, role?: string }} [opts]
 */
async function approveCheckpoint(projectRoot, opts = {}) {
  const initialState = inspectProjectState(projectRoot, { sprint: opts.sprint, mode: opts.mode });
  const { projectRoot: absProject, hubRoot, activeSprint, projectCode, mode } = initialState;
  const statePath = path.join(hubRoot, '.os-state.json');
  const persisted = readPersistedState(statePath) || {};

  const targetStage = opts.stage
    ? String(opts.stage).toUpperCase().trim()
    : (persisted.pendingCheckpoint?.stage || initialState.currentStage);

  const stageDef = getStageDef(targetStage);
  if (!stageDef) {
    return {
      ok: false,
      approved: false,
      advanced: false,
      code: 'UNKNOWN_STAGE',
      message: `Unknown checkpoint stage '${targetStage}'.`
    };
  }

  const access = checkRoleAccess(mode, targetStage, opts.role, {
    projectRoot: absProject,
    actor: opts.actor
  });
  if (!access.allowed) {
    return { ...access, approved: false, advanced: false };
  }

  const normDecision = String(opts.decision || 'APPROVED').toUpperCase().trim();
  if (normDecision !== 'APPROVED' && normDecision !== 'REJECTED') {
    return {
      ok: false,
      approved: false,
      advanced: false,
      code: 'INVALID_DECISION',
      message: `Invalid checkpoint decision '${opts.decision}'. Allowed values: APPROVED, REJECTED.`
    };
  }

  const nowIso = new Date().toISOString();
  const digest = persisted.pendingCheckpoint?.stage === targetStage && persisted.pendingCheckpoint?.digest
    ? persisted.pendingCheckpoint.digest
    : computeStageDigest(absProject, hubRoot, targetStage, activeSprint);

  const auditEntry = {
    id: `CHK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: nowIso,
    actor: access.actor,
    role: access.actorRole,
    stage: targetStage,
    sprint: activeSprint,
    decision: normDecision,
    notes: String(opts.notes || '').trim(),
    digest
  };

  const prevTrail = Array.isArray(persisted.checkpointAuditTrail) ? persisted.checkpointAuditTrail : [];
  const nextTrail = [...prevTrail, auditEntry];

  const isWaitingApproval =
    persisted.pendingCheckpoint?.stage === targetStage ||
    persisted.stages?.[targetStage] === 'PENDING_HUMAN_APPROVAL' ||
    initialState.stages?.[targetStage]?.status === 'PENDING_HUMAN_APPROVAL';

  if (normDecision === 'REJECTED') {
    const diagPayload = {
      stage: targetStage,
      sprint: activeSprint,
      timestamp: nowIso,
      violations: [
        {
          rule: 'HUMAN_CHECKPOINT_REJECTED',
          file: stageDef.targetPaths[0],
          message: `Human checkpoint rejected by '${access.actor}': ${auditEntry.notes || 'Revisions requested.'}`,
          remediation: auditEntry.notes || `Address reviewer feedback for '${targetStage}' and re-run os_run_gate_and_advance.`
        }
      ]
    };
    const nextStagesMap = {
      ...Object.fromEntries(STAGE_DEFINITIONS.map(s => [s.id, initialState.stages[s.id]?.status || 'PENDING'])),
      [targetStage]: 'BLOCKED'
    };
    const nextStateObj = {
      ...persisted,
      schemaVersion: '4.3.0',
      projectCode,
      semanticVersion: initialState.semanticVersion,
      mode,
      requireHumanCheckpoints: initialState.requireHumanCheckpoints,
      activeSprint,
      currentStage: targetStage,
      stages: nextStagesMap,
      pendingCheckpoint: null,
      checkpointAuditTrail: nextTrail,
      lastDiagnostics: diagPayload,
      updatedAt: nowIso
    };
    writePersistedState(statePath, nextStateObj);
    const refreshed = inspectProjectState(absProject, { sprint: activeSprint, mode });
    writePersistedState(statePath, {
      ...nextStateObj,
      handoffQueue: refreshed.handoffQueue,
      pendingHandoffs: refreshed.pendingHandoffs
    });

    return {
      ok: true,
      approved: false,
      advanced: false,
      status: 'CHECKPOINT_REJECTED',
      stage: targetStage,
      currentStage: targetStage,
      sprint: activeSprint,
      auditEntry,
      stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
      message: `Checkpoint for '${targetStage}' REJECTED by '${access.actor}'.`
    };
  }

  // APPROVED
  const nextStage = isWaitingApproval ? getNextStageId(targetStage) : initialState.currentStage;
  const retryCounts = { ...(persisted.circuitBreaker?.retryCounts || {}), [targetStage]: 0 };
  const openStages = { ...(persisted.circuitBreaker?.openStages || {}) };
  delete openStages[targetStage];

  const nextStagesMap = {};
  for (const s of STAGE_DEFINITIONS) {
    if (isWaitingApproval && s.track === 'MAIN' && s.index <= stageDef.index) {
      nextStagesMap[s.id] = 'PASSED';
    } else {
      nextStagesMap[s.id] = persisted.stages?.[s.id] || initialState.stages?.[s.id]?.status || 'PENDING';
    }
  }

  const baseState = {
    ...persisted,
    schemaVersion: '4.3.0',
    projectCode,
    semanticVersion: initialState.semanticVersion,
    mode,
    requireHumanCheckpoints: initialState.requireHumanCheckpoints,
    activeSprint,
    currentStage: nextStage,
    stages: nextStagesMap,
    pendingCheckpoint: null,
    checkpointAuditTrail: nextTrail,
    circuitBreaker: {
      maxRetries: initialState.circuitBreaker.maxRetries,
      retryCounts,
      openStages
    },
    lastDiagnostics: isWaitingApproval ? null : (persisted.lastDiagnostics || null),
    updatedAt: nowIso
  };
  writePersistedState(statePath, baseState);

  if (isWaitingApproval) {
    const refreshed = inspectProjectState(absProject, { sprint: activeSprint, mode });
    writePersistedState(statePath, {
      ...readPersistedState(statePath),
      handoffQueue: refreshed.handoffQueue,
      pendingHandoffs: refreshed.pendingHandoffs
    });
  }

  await dispatchLifecycleHook(
    'onCheckpointApproved',
    {
      projectRoot: absProject,
      hubRoot,
      stage: targetStage,
      nextStage,
      sprint: activeSprint,
      actor: access.actor,
      auditEntry
    },
    { statePath }
  );

  if (isWaitingApproval) {
    await dispatchLifecycleHook(
      'onAfterGatePass',
      {
        projectRoot: absProject,
        hubRoot,
        stage: targetStage,
        nextStage,
        sprint: activeSprint,
        actor: access.actor,
        viaCheckpointApproval: true
      },
      { statePath }
    );
  }

  return {
    ok: true,
    approved: true,
    advanced: isWaitingApproval,
    status: isWaitingApproval ? 'APPROVED' : 'PRE_APPROVED',
    stage: targetStage,
    previousStage: isWaitingApproval ? targetStage : undefined,
    currentStage: nextStage,
    sprint: activeSprint,
    actor: access.actor,
    role: access.actorRole,
    auditEntry,
    stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
    message: isWaitingApproval
      ? `Checkpoint '${targetStage}' APPROVED by '${access.actor}' (${digest}). Pipeline advanced to '${nextStage}'.`
      : `Checkpoint pre-approval recorded for '${targetStage}' by '${access.actor}'.`
  };
}

/**
 * Executes deterministic gate verification for the active stage, manages Human Checkpoints,
 * trips the 3-strike Circuit Breaker on repeated failures, and fires add-on lifecycle hooks.
 */
async function runGateAndAdvance(projectRoot, opts = {}) {
  const initialState = inspectProjectState(projectRoot, {
    sprint: opts.sprint,
    mode: opts.mode,
    requireHumanCheckpoints: opts.requireHumanCheckpoints
  });
  const targetStage = opts.stage ? String(opts.stage).toUpperCase().trim() : initialState.currentStage;

  if (targetStage === 'COMPLETED') {
    return {
      ok: true,
      advanced: false,
      stage: 'COMPLETED',
      currentStage: 'COMPLETED',
      sprint: initialState.activeSprint,
      message: 'Pipeline is already COMPLETED.'
    };
  }

  const stageDef = getStageDef(targetStage);
  if (!stageDef) {
    return {
      ok: false,
      advanced: false,
      code: 'UNKNOWN_STAGE',
      message: `Unknown stage '${targetStage}'.`
    };
  }

  const orchConfig = loadOrchestratorConfig(initialState.projectRoot, {
    requireHumanCheckpoints: opts.requireHumanCheckpoints
  });
  const access = checkRoleAccess(initialState.mode, targetStage, opts.role, {
    projectRoot: initialState.projectRoot,
    actor: opts.actor,
    config: orchConfig
  });
  if (!access.allowed) {
    return { ...access, advanced: false };
  }

  const {
    projectRoot: absProject,
    hubRoot,
    activeSprint,
    projectCode,
    semanticVersion,
    mode,
    requireHumanCheckpoints,
    checkpointStages
  } = initialState;
  const statePath = path.join(hubRoot, '.os-state.json');
  const persistedBefore = readPersistedState(statePath) || {};
  const maxRetries = orchConfig.circuitBreaker?.maxRetries ?? 3;
  const scopeDigest = computeStageDigest(absProject, hubRoot, targetStage, activeSprint);

  // Circuit breaker fast-fail if tripped and unchanged on disk without explicit reset
  const existingOpen = persistedBefore.circuitBreaker?.openStages?.[targetStage];
  if (existingOpen && existingOpen.failedDigest === scopeDigest && !opts.resetCircuit) {
    return {
      ok: false,
      advanced: false,
      status: 'CIRCUIT_OPEN_ESCALATED',
      circuitOpen: true,
      code: 'CIRCUIT_BREAKER_OPEN',
      retryCount: existingOpen.retryCount || maxRetries,
      maxRetries,
      mode,
      role: access.actorRole,
      actor: access.actor,
      stage: targetStage,
      nextStage: targetStage,
      sprint: activeSprint,
      violations: existingOpen.violations || [],
      remediationPacket: existingOpen.remediationPacket,
      selfHealingDirective: buildStageDirective(absProject, targetStage, activeSprint, {
        mode,
        role: access.actorRole,
        actor: access.actor
      }).directive || '',
      stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
      message: `Circuit breaker is OPEN for '${targetStage}' (${existingOpen.retryCount}/${maxRetries} failures). Resolve failing files on disk before retrying.`
    };
  }

  await dispatchLifecycleHook(
    'onBeforeStage',
    {
      projectRoot: absProject,
      hubRoot,
      stage: targetStage,
      sprint: activeSprint,
      actor: access.actor
    },
    { statePath }
  );

  const violations = [];
  const artifacts = [];

  try {
    if (targetStage === 'INTAKE') {
      runNodeCli(path.join(BIN_DIR, 'build-codebase-map.js'), [absProject], absProject);
      const intakeDir = path.join(absProject, 'docs', 'business-context', 'intake');
      runNodeCli(path.join(BIN_DIR, 'reverse-architect.js'), [`--export-ba-intake=${intakeDir}`], absProject);

      const bundlePath = path.join(intakeDir, 'REVERSE_INTAKE_BUNDLE.json');
      if (!fs.existsSync(path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'))) {
        if (hasFullBaHubCli()) {
          const intakeArgs = [
            path.join(BA_HUB_ROOT, 'bin', 'ba-hub.js'),
            'intake',
            `--hub=${hubRoot}`,
            '--mode=prototype-code',
            `--project=${opts.projectCode || projectCode || 'PRJ-001'}`,
            `--name=${opts.projectName || path.basename(absProject)}`,
            `--sprint=${activeSprint}`
          ];
          if (fs.existsSync(bundlePath)) intakeArgs.push(`--bundle=${bundlePath}`);
          runNodeCli(intakeArgs[0], intakeArgs.slice(1), absProject);
        } else {
          const intakeMod = path.join(BA_HUB_ROOT, 'bin', 'lib', 'intake.js');
          const hasIntakeTpl = fs.existsSync(
            path.join(BA_HUB_ROOT, 'templates', 'project-context-hub', '_intake', 'INTAKE_MANIFEST.template.md')
          );
          if (fs.existsSync(intakeMod) && hasIntakeTpl) {
            const { executeIntake } = require(intakeMod);
            executeIntake({
              hub: hubRoot,
              mode: 'prototype-code',
              bundle: fs.existsSync(bundlePath) ? bundlePath : undefined,
              project: opts.projectCode || projectCode || 'PRJ-001',
              name: opts.projectName || path.basename(absProject),
              sprint: activeSprint,
              initHubFn: initHubFallback,
              syncMasterPlanFn: () => {}
            });
          } else {
            initHubFallback({
              target: hubRoot,
              project: opts.projectCode || projectCode || 'PRJ-001',
              name: opts.projectName || path.basename(absProject),
              scopeMode: 'FULL_PROJECT'
            });
            fs.mkdirSync(path.join(hubRoot, '_intake'), { recursive: true });
            fs.writeFileSync(
              path.join(hubRoot, '_intake', 'INTAKE_MANIFEST.md'),
              `# Intake Manifest\n\n- **Project Code:** \`${opts.projectCode || projectCode || 'PRJ-001'}\`\n- **Sprint:** \`${activeSprint}\`\n`,
              'utf8'
            );
          }
        }
      }
      artifacts.push('.ai/context/CODEBASE_MAP.md', 'docs/project-context-hub/_intake/INTAKE_MANIFEST.md');
    } else if (targetStage === 'CORE_BOOTSTRAP') {
      for (const rel of ['PROJECT_CONTEXT.md', 'GLOSSARY_AND_ENUMS.md', 'SEED_DEFAULTS_CATALOG.md']) {
        const fp = path.join(hubRoot, '00-project-core', rel);
        if (!fs.existsSync(fp)) {
          violations.push({
            rule: 'MISSING_CORE_ARTIFACT',
            file: `00-project-core/${rel}`,
            message: `Required core hub file '00-project-core/${rel}' is missing.`,
            remediation: `Author complete '00-project-core/${rel}' before advancing CORE_BOOTSTRAP.`
          });
        }
      }
      violations.push(...scanAntiPlaceholders(hubRoot, ['00-project-core']));
      if (violations.length === 0) {
        artifacts.push(
          'docs/project-context-hub/00-project-core/PROJECT_CONTEXT.md',
          'docs/project-context-hub/00-project-core/GLOSSARY_AND_ENUMS.md',
          'docs/project-context-hub/00-project-core/SEED_DEFAULTS_CATALOG.md'
        );
      }
    } else if (targetStage === 'SPRINT_PLAN') {
      for (const rel of ['SPRINT_MASTER_PLAN.md', 'BACKLOG_WBS.md', 'CHANGE_IMPACT_REGISTER.md']) {
        const fp = path.join(hubRoot, '01-roadmap-and-pm', rel);
        if (!fs.existsSync(fp)) {
          violations.push({
            rule: 'MISSING_ROADMAP_ARTIFACT',
            file: `01-roadmap-and-pm/${rel}`,
            message: `Required roadmap file '01-roadmap-and-pm/${rel}' is missing.`,
            remediation: `Create '01-roadmap-and-pm/${rel}' with valid Waves 1..3 and 5-level WBS.`
          });
        }
      }
      violations.push(...scanAntiPlaceholders(hubRoot, ['00-project-core', '01-roadmap-and-pm']));
      const wbsFile = path.join(hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md');
      if (fs.existsSync(wbsFile)) {
        const wbsParsed = parseBacklogWbs(wbsFile);
        if (wbsParsed.stories.size === 0 && wbsParsed.featureHierarchy.size === 0 && wbsParsed.components.size === 0) {
          violations.push({
            rule: 'WBS_EMPTY',
            file: '01-roadmap-and-pm/BACKLOG_WBS.md',
            message: 'BACKLOG_WBS.md contains no parsed CMP-*/EPC-*/FEATURE-*/STR-* WBS rows.',
            remediation: 'Populate Component, Epic, Feature, and Story tables in BACKLOG_WBS.md.'
          });
        }
      }
      if (violations.length === 0) {
        artifacts.push(
          'docs/project-context-hub/01-roadmap-and-pm/SPRINT_MASTER_PLAN.md',
          'docs/project-context-hub/01-roadmap-and-pm/BACKLOG_WBS.md',
          'docs/project-context-hub/01-roadmap-and-pm/CHANGE_IMPACT_REGISTER.md'
        );
      }
    } else if (targetStage === 'SPRINT_SPECS') {
      const sprintDir = path.join(hubRoot, '02-sprints', activeSprint);
      const specFiles = fs.existsSync(sprintDir)
        ? fs.readdirSync(sprintDir).filter(f => /^FEATURE-.*\.md$/i.test(f) && !f.endsWith('.template.md')).sort()
        : [];
      if (specFiles.length === 0) {
        violations.push({
          rule: 'SPRINT_SPECS_EMPTY',
          file: `02-sprints/${activeSprint}/`,
          message: `No FEATURE-*.md files found in '02-sprints/${activeSprint}/'.`,
          remediation: `Author canonical 11-section FEATURE-*.md specs inside '02-sprints/${activeSprint}/'.`
        });
      } else {
        const verifyRes = runHubVerifier(hubRoot, {
          sprint: activeSprint,
          strict: true,
          ignoreCategories: ['MANIFEST_STALE', 'MANIFEST_MISSING']
        });
        violations.push(...verifyRes.violations);
        for (const fname of specFiles) {
          const doc = parseFeatureDocument(path.join(sprintDir, fname), { isHubV2: true });
          if (doc.gateA !== 'READY_FOR_DEV' && doc.gateA !== 'IMPLEMENTED') {
            violations.push({
              rule: 'GATE_A_NOT_READY',
              file: `02-sprints/${activeSprint}/${fname}`,
              message: `${doc.id} Gate A Status is '${doc.gateA}' (expected READY_FOR_DEV).`,
              remediation: `Complete BA-01..BA-14 checks and set Gate A Status (BA) to READY_FOR_DEV in '${fname}'.`
            });
          }
        }
      }
      if (violations.length === 0) {
        artifacts.push(...specFiles.map(f => `docs/project-context-hub/02-sprints/${activeSprint}/${f}`));
      }
    } else if (targetStage === 'GATE_A_SEAL') {
      const preCheck = runHubVerifier(hubRoot, {
        sprint: activeSprint,
        strict: true,
        ignoreCategories: ['MANIFEST_STALE']
      });
      if (!preCheck.ok) {
        violations.push(...preCheck.violations);
      } else {
        if (hasFullBaHubCli()) {
          const baHubCli = path.join(BA_HUB_ROOT, 'bin', 'ba-hub.js');
          runNodeCli(baHubCli, ['seal-sprint', `--hub=${hubRoot}`, `--sprint=${activeSprint}`, '--strict'], absProject);
          runNodeCli(baHubCli, ['export', `--hub=${hubRoot}`], absProject);
        } else {
          sealAndExportSprintFallback(hubRoot, projectCode, activeSprint);
        }
        const postCheck = runHubVerifier(hubRoot, { sprint: activeSprint, strict: true });
        violations.push(...postCheck.violations);
      }
      if (violations.length === 0) {
        artifacts.push(
          `docs/project-context-hub/02-sprints/${activeSprint}/SPRINT_${activeSprint}_MANIFEST.md`,
          'docs/project-context-hub/04-traceability-and-exports/RTM_MATRIX.csv'
        );
      }
    } else if (targetStage === 'GATE_B_ENG') {
      try {
        const intakeDir = path.join(absProject, 'docs', 'business-context', 'intake');
        const bundlePath = path.join(intakeDir, 'REVERSE_INTAKE_BUNDLE.json');
        if (!fs.existsSync(bundlePath)) {
          runNodeCli(path.join(BIN_DIR, 'build-codebase-map.js'), [absProject], absProject);
          runNodeCli(path.join(BIN_DIR, 'reverse-architect.js'), [`--export-ba-intake=${intakeDir}`], absProject);
        }
        runNodeCli(path.join(BIN_DIR, 'bcas-sync.js'), [`--hub=${hubRoot}`, '--no-cascade'], absProject);
        runNodeCli(path.join(BIN_DIR, 'eng-gate.js'), [`--hub=${hubRoot}`, `--sprint=${activeSprint}`, '--populate-hints'], absProject);
        runNodeCli(path.join(BIN_DIR, 'eng-gate.js'), [`--hub=${hubRoot}`, `--sprint=${activeSprint}`, '--verify-only'], absProject);
        runNodeCli(path.join(BIN_DIR, 'sprint-plan.js'), [`--hub=${hubRoot}`, `--sprint=${activeSprint}`], absProject);
        const driftOut = runNodeCli(path.join(BIN_DIR, 'drift-radar.js'), [`--hub=${hubRoot}`, `--sprint=${activeSprint}`], absProject);
        if (!driftOut.includes('CLEARANCE_GRANTED')) {
          violations.push({
            rule: 'DRIFT_RADAR_BLOCKED',
            file: 'docs/business-context/DRIFT_RADAR_REPORT.md',
            message: 'Drift radar did not report CLEARANCE_GRANTED.',
            remediation: 'Resolve drift, SRD, or catalog parity findings in DRIFT_RADAR_REPORT.md.'
          });
        } else {
          artifacts.push(
            'docs/business-context/SPRINT_EXECUTION_PLAN.md',
            'docs/business-context/DRIFT_RADAR_REPORT.md'
          );
        }
      } catch (err) {
        violations.push({
          rule: 'GATE_B_ENG_FAILED',
          file: `02-sprints/${activeSprint}/`,
          message: String(err.stderr || err.stdout || err.message || err).trim(),
          remediation: 'Inspect Gate B errors in Section 11 / DRIFT_RADAR_REPORT.md and re-run GATE_B_ENG.'
        });
      }
    } else if (targetStage === 'DEV_IMPLEMENT') {
      const featureFiles = scanHubAndLegacyFeatures(
        { isHubV2: true, hubRoot, legacyFeaturesDir: path.join(absProject, 'docs', 'business-context', 'features') },
        activeSprint
      );
      if (featureFiles.length === 0) {
        violations.push({
          rule: 'DEV_NO_FEATURES',
          file: `02-sprints/${activeSprint}/`,
          message: `No sealed features found in sprint '${activeSprint}'.`,
          remediation: `Ensure Gate A & Gate B completed for sprint '${activeSprint}'.`
        });
      } else {
        const manifestMap = collectSprintManifests({
          hubRoot,
          docsDir: path.join(absProject, 'docs', 'business-context')
        });
        const waves = { 1: [], 2: [], 3: [] };

        for (const fp of featureFiles) {
          const doc = parseFeatureDocument(fp, { isHubV2: true });
          if (doc.gateB !== 'READY_TO_CODE') {
            violations.push({
              rule: 'DEV_GATE_B_NOT_READY',
              file: path.relative(hubRoot, fp).replace(/\\/g, '/'),
              message: `${doc.id} Gate B status is '${doc.gateB}' (expected READY_TO_CODE).`,
              remediation: `Complete Gate B checks for ${doc.id} before starting DEV_IMPLEMENT.`
            });
          }
          const mEntry = manifestMap.get(doc.id);
          if (mEntry) {
            const srdRes = verifySrdMatch(doc.computedSrd, mEntry.featureSrd, doc.computedSrdV1);
            if (srdRes.comparable && !srdRes.matches) {
              violations.push({
                rule: 'NORMATIVE_SRD_DRIFT',
                file: path.relative(hubRoot, fp).replace(/\\/g, '/'),
                message: `${doc.id} normative Sections 1-9 mutated post-seal (expected ${srdRes.expected}).`,
                remediation: `Restore sealed normative Sections 1-9 for ${doc.id} or issue a controlled CR delta via os_evolve_cr.`
              });
            }
          }
          const wNum = [1, 2, 3].includes(Number(doc.wave)) ? Number(doc.wave) : 1;
          waves[wNum].push(doc.id);
        }

        if (violations.length === 0) {
          runNodeCli(path.join(BIN_DIR, 'sprint-plan.js'), [`--hub=${hubRoot}`, `--sprint=${activeSprint}`], absProject);
          runNodeCli(path.join(BIN_DIR, 'build-cycle-handoff.js'), ['--force', `--scope=${activeSprint}`], absProject);

          const attestPath = path.join(absProject, 'docs', 'business-context', 'DEV_IMPLEMENTATION_ATTESTATION.json');
          fs.mkdirSync(path.dirname(attestPath), { recursive: true });
          fs.writeFileSync(
            attestPath,
            JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                sprint: activeSprint,
                actor: access.actor,
                waveExecutionOrder: [
                  { wave: 1, features: waves[1] },
                  { wave: 2, features: waves[2] },
                  { wave: 3, features: waves[3] }
                ],
                normativeSrdVerified: true
              },
              null,
              2
            ) + '\n',
            'utf8'
          );
          artifacts.push(
            'docs/business-context/SPRINT_EXECUTION_PLAN.md',
            'docs/business-context/DEV_IMPLEMENTATION_ATTESTATION.json'
          );
        }
      }
    } else if (targetStage === 'SECURITY_PERF_GATE') {
      const checks = [
        {
          id: 'SECURITY_FUZZER',
          script: path.join(BIN_DIR, 'security-fuzzer.js'),
          args: ['--strict'],
          report: 'docs/security/SECURITY_AUDIT_REPORT.md'
        },
        {
          id: 'PERF_PREDICTOR',
          script: path.join(BIN_DIR, 'perf-predictor.js'),
          args: [],
          report: 'docs/architecture/PERFORMANCE_BOTTLENECK_REPORT.md'
        },
        {
          id: 'DOTNET_AUDIT',
          script: path.join(BIN_DIR, 'dotnet-audit.js'),
          args: [absProject, '--strict'],
          report: null
        },
        {
          id: 'FRONTEND_AUDIT',
          script: path.join(BIN_DIR, 'frontend-audit.js'),
          args: [absProject, '--strict'],
          report: null
        },
        {
          id: 'PENTEST_SUITE',
          script: path.join(BIN_DIR, 'pentest-suite.js'),
          args: [`--target=${absProject}`],
          report: 'docs/security/SECURITY_DELIVERY_CHECKLIST.md'
        }
      ];

      for (const chk of checks) {
        if (!fs.existsSync(chk.script)) continue;
        try {
          const out = runNodeCli(chk.script, chk.args, absProject);
          if (chk.id === 'PENTEST_SUITE') {
            const defMatch = out.match(/Active Security Defects:\s*(\d+)\s*Critical\s*\|\s*(\d+)\s*High/i);
            if (defMatch && (Number(defMatch[1]) > 0 || Number(defMatch[2]) > 0)) {
              violations.push({
                rule: 'PENTEST_ACTIVE_DEFECTS',
                file: 'docs/security/PENTEST_FINDINGS_REGISTER.md',
                message: `Pentest suite detected active security defects (${defMatch[1]} Critical, ${defMatch[2]} High).`,
                remediation: 'Remediate all Critical and High findings in PENTEST_FINDINGS_REGISTER.md.'
              });
            }
          }
          if (chk.report) artifacts.push(chk.report);
        } catch (err) {
          violations.push({
            rule: `${chk.id}_FAILED`,
            file: chk.report || 'docs/security/',
            message: String(err.stderr || err.stdout || err.message || err).trim(),
            remediation: `Resolve all Critical/High issues flagged by '${path.basename(chk.script)}' and re-run SECURITY_PERF_GATE.`
          });
        }
      }
    } else if (targetStage === 'QA_HANDOFF') {
      const qaRes = generateQaPack(absProject, {
        sprint: activeSprint,
        mode,
        role: access.actorRole,
        actor: access.actor
      });
      if (!qaRes.ok) {
        violations.push({
          rule: 'QA_HANDOFF_FAILED',
          file: 'docs/handoff/cycles/',
          message: 'QA pack generation did not produce both Postman v2.1 collections and a Cycle Handoff markdown artifact.',
          remediation: 'Verify OpenAPI/feature specs and re-run os_generate_qa_pack.'
        });
      } else {
        if (qaRes.artifacts?.openapiPath) artifacts.push(qaRes.artifacts.openapiPath);
        if (qaRes.artifacts?.latestCycleHandoff) artifacts.push(qaRes.artifacts.latestCycleHandoff);
        artifacts.push('docs/business-context/QA_HANDOFF_ATTESTATION.json');
      }
    } else if (targetStage === 'RELEASE_SEAL') {
      if (initialState.pendingCheckpoint) {
        violations.push({
          rule: 'RELEASE_PENDING_CHECKPOINT',
          file: initialState.stateFilePath,
          message: `Human checkpoint on '${initialState.pendingCheckpoint.stage}' is still PENDING_HUMAN_APPROVAL.`,
          remediation: `Approve pending checkpoint '${initialState.pendingCheckpoint.stage}' via os_approve_checkpoint.`
        });
      }
      if (Object.keys(initialState.circuitBreaker.openStages || {}).length > 0) {
        violations.push({
          rule: 'RELEASE_OPEN_CIRCUIT',
          file: initialState.stateFilePath,
          message: `Open circuit breaker(s) exist: ${Object.keys(initialState.circuitBreaker.openStages).join(', ')}.`,
          remediation: 'Resolve all open circuit breaker issues prior to release sealing.'
        });
      }
      for (const sDef of MAIN_STAGE_DEFINITIONS) {
        if (sDef.index < 10 && initialState.stages[sDef.id]?.status !== 'PASSED') {
          violations.push({
            rule: 'RELEASE_PREREQ_INCOMPLETE',
            file: initialState.stateFilePath,
            message: `Prerequisite stage '${sDef.id}' has status '${initialState.stages[sDef.id]?.status}' (expected PASSED).`,
            remediation: `Complete stage '${sDef.id}' before sealing the release.`
          });
        }
      }

      if (violations.length === 0) {
        const attestDigest = computeStageDigest(absProject, hubRoot, 'RELEASE_SEAL', activeSprint);
        const nowIso = new Date().toISOString();
        const exportDir = path.join(hubRoot, '04-traceability-and-exports');
        fs.mkdirSync(exportDir, { recursive: true });
        const jsonRel = `docs/project-context-hub/04-traceability-and-exports/RELEASE_${activeSprint}_ATTESTATION.json`;
        const mdRel = `docs/project-context-hub/04-traceability-and-exports/RELEASE_${activeSprint}_ATTESTATION.md`;

        const attestationPayload = {
          schemaVersion: '4.3.0',
          projectCode,
          sprint: activeSprint,
          semanticVersion,
          sealedAt: nowIso,
          sealedBy: access.actor,
          role: access.actorRole,
          attestationDigest: attestDigest,
          checkpointCount: (initialState.checkpointAuditTrail || []).length,
          featuresCount: initialState.featuresSummary.count,
          status: 'RELEASE_SEALED'
        };

        fs.writeFileSync(
          path.join(exportDir, `RELEASE_${activeSprint}_ATTESTATION.json`),
          JSON.stringify(attestationPayload, null, 2) + '\n',
          'utf8'
        );
        fs.writeFileSync(
          path.join(exportDir, `RELEASE_${activeSprint}_ATTESTATION.md`),
          [
            `# RELEASE READINESS ATTESTATION — \`${projectCode}\` (\`${activeSprint}\`)`,
            '',
            `| Field | Value |`,
            `|---|---|`,
            `| **Semantic Version** | \`${semanticVersion}\` |`,
            `| **Attestation Digest** | \`${attestDigest}\` |`,
            `| **Sealed By** | \`${access.actor}\` (\`${access.actorRole}\`) |`,
            `| **Sealed At** | \`${nowIso}\` |`,
            `| **Human Checkpoints Recorded** | \`${attestationPayload.checkpointCount}\` |`,
            `| **Release Status** | \`RELEASE_SEALED\` |`,
            ''
          ].join('\n'),
          'utf8'
        );
        artifacts.push(jsonRel, mdRel);
      }
    }
  } catch (err) {
    violations.push({
      rule: `${targetStage}_EXECUTION_ERROR`,
      file: stageDef.targetPaths[0],
      message: err instanceof Error ? err.message : String(err),
      remediation: `Resolve execution error in stage '${targetStage}' and retry.`
    });
  }

  // Handle failure -> Circuit Breaker + Remediation Packet
  if (violations.length > 0) {
    const prevRetry = Number(persistedBefore.circuitBreaker?.retryCounts?.[targetStage] || 0);
    const retryCount = prevRetry + 1;
    const circuitOpen = retryCount >= maxRetries;
    const stageStatus = circuitOpen ? 'CIRCUIT_OPEN_ESCALATED' : 'BLOCKED';
    const remediationPacket = buildRemediationPacket(
      targetStage,
      activeSprint,
      retryCount,
      maxRetries,
      circuitOpen,
      violations
    );

    const retryCounts = {
      ...(persistedBefore.circuitBreaker?.retryCounts || {}),
      [targetStage]: retryCount
    };
    const openStages = { ...(persistedBefore.circuitBreaker?.openStages || {}) };
    if (circuitOpen) {
      openStages[targetStage] = {
        stage: targetStage,
        sprint: activeSprint,
        retryCount,
        openedAt: new Date().toISOString(),
        failedDigest: scopeDigest,
        violations,
        remediationPacket
      };
    }

    const diagPayload = {
      stage: targetStage,
      sprint: activeSprint,
      timestamp: new Date().toISOString(),
      violations
    };

    const nextStagesMap = {
      ...Object.fromEntries(STAGE_DEFINITIONS.map(s => [s.id, initialState.stages[s.id]?.status || 'PENDING'])),
      [targetStage]: stageStatus
    };

    const { handoffQueue, pendingHandoffs } = buildHandoffQueue({
      absProject,
      currentStage: targetStage,
      activeSprint,
      pendingCheckpoint: null,
      openStages,
      deltaHistory: initialState.deltaHistory
    });

    writePersistedState(statePath, {
      ...persistedBefore,
      schemaVersion: '4.3.0',
      projectCode,
      semanticVersion,
      mode,
      requireHumanCheckpoints,
      activeSprint,
      currentStage: targetStage,
      stages: nextStagesMap,
      circuitBreaker: { maxRetries, retryCounts, openStages },
      handoffQueue,
      pendingHandoffs,
      lastDiagnostics: diagPayload,
      updatedAt: diagPayload.timestamp
    });

    await dispatchLifecycleHook(
      'onGateFail',
      {
        projectRoot: absProject,
        hubRoot,
        stage: targetStage,
        sprint: activeSprint,
        actor: access.actor,
        retryCount,
        maxRetries,
        circuitOpen,
        remediationPacket
      },
      { statePath }
    );

    const directiveObj = buildStageDirective(absProject, targetStage, activeSprint, {
      mode,
      role: access.actorRole,
      actor: access.actor
    });

    return {
      ok: false,
      advanced: false,
      status: stageStatus,
      circuitOpen,
      retryCount,
      maxRetries,
      mode,
      role: access.actorRole,
      actor: access.actor,
      stage: targetStage,
      nextStage: targetStage,
      sprint: activeSprint,
      violations,
      remediationPacket,
      selfHealingDirective: directiveObj.directive || '',
      stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
      message: circuitOpen
        ? `CIRCUIT_OPEN_ESCALATED: '${targetStage}' failed ${retryCount}/${maxRetries} consecutive attempts. Human intervention required.`
        : `Gate '${targetStage}' failed (${violations.length} violation(s); retry ${retryCount}/${maxRetries}).`
    };
  }

  // Gate checks passed -> Reset circuit breaker & auto-append Lesson Learned if previously failing repeatedly
  const prevRetryCount = Number(persistedBefore.circuitBreaker?.retryCounts?.[targetStage] || 0);
  const hadOpenCircuit = Boolean(persistedBefore.circuitBreaker?.openStages?.[targetStage]);
  let recordedLessonId = null;
  if ((prevRetryCount >= 2 || hadOpenCircuit) && orchConfig.circuitBreaker?.autoAppendLessonsLearned !== false) {
    recordedLessonId = appendRecurringLessonLearned(
      absProject,
      targetStage,
      persistedBefore.lastDiagnostics,
      Math.max(prevRetryCount, hadOpenCircuit ? maxRetries : prevRetryCount)
    );
  }

  const resetRetryCounts = {
    ...(persistedBefore.circuitBreaker?.retryCounts || {}),
    [targetStage]: 0
  };
  const resetOpenStages = { ...(persistedBefore.circuitBreaker?.openStages || {}) };
  delete resetOpenStages[targetStage];

  // Pause at Human Checkpoint if enabled for this stage and not yet approved
  const needsHumanCheckpoint =
    requireHumanCheckpoints &&
    checkpointStages.includes(targetStage) &&
    !hasApprovedCheckpoint(persistedBefore, targetStage, activeSprint);

  const nowIso = new Date().toISOString();

  if (needsHumanCheckpoint) {
    const checkpointDigest = computeStageDigest(absProject, hubRoot, targetStage, activeSprint);
    const pendingCheckpoint = {
      stage: targetStage,
      sprint: activeSprint,
      label: stageDef.checkpointLabel || targetStage,
      requiredRole: stageDef.ownerRole,
      digest: checkpointDigest,
      requestedAt: nowIso
    };
    const nextStagesMap = {
      ...Object.fromEntries(STAGE_DEFINITIONS.map(s => [s.id, initialState.stages[s.id]?.status || 'PENDING'])),
      [targetStage]: 'PENDING_HUMAN_APPROVAL'
    };
    const { handoffQueue, pendingHandoffs } = buildHandoffQueue({
      absProject,
      currentStage: targetStage,
      activeSprint,
      pendingCheckpoint,
      openStages: resetOpenStages,
      deltaHistory: initialState.deltaHistory
    });

    writePersistedState(statePath, {
      ...persistedBefore,
      schemaVersion: '4.3.0',
      projectCode,
      semanticVersion,
      mode,
      requireHumanCheckpoints,
      activeSprint,
      currentStage: targetStage,
      stages: nextStagesMap,
      pendingCheckpoint,
      checkpointAuditTrail: Array.isArray(persistedBefore.checkpointAuditTrail) ? persistedBefore.checkpointAuditTrail : [],
      circuitBreaker: { maxRetries, retryCounts: resetRetryCounts, openStages: resetOpenStages },
      handoffQueue,
      pendingHandoffs,
      lastDiagnostics: null,
      updatedAt: nowIso
    });

    return {
      ok: true,
      advanced: false,
      checkpointRequired: true,
      status: 'PENDING_HUMAN_APPROVAL',
      mode,
      role: access.actorRole,
      actor: access.actor,
      stage: targetStage,
      currentStage: targetStage,
      nextStageAfterApproval: getNextStageId(targetStage),
      sprint: activeSprint,
      artifacts,
      recordedLessonId,
      pendingCheckpoint,
      stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
      message: `Stage '${targetStage}' passed technical verification and is now PAUSED at Human Checkpoint (${pendingCheckpoint.label}). Invoke os_approve_checkpoint to proceed.`
    };
  }

  // Advance directly to next stage (never overwrite prior non-PASSED stages)
  const nextStage = getNextStageId(targetStage);
  const nextStagesMap = {};
  for (const s of STAGE_DEFINITIONS) {
    if (s.id === targetStage) {
      nextStagesMap[s.id] = 'PASSED';
    } else if (s.track === 'MAIN' && stageDef.track === 'MAIN' && s.index < stageDef.index) {
      nextStagesMap[s.id] = initialState.stages?.[s.id]?.status === 'PASSED'
        ? 'PASSED'
        : (persistedBefore.stages?.[s.id] || initialState.stages?.[s.id]?.status || 'PENDING');
    } else {
      nextStagesMap[s.id] = persistedBefore.stages?.[s.id] || initialState.stages?.[s.id]?.status || 'PENDING';
    }
  }

  const isReleaseSeal = targetStage === 'RELEASE_SEAL';
  const sealedRelease = isReleaseSeal
    ? {
        sprint: activeSprint,
        version: semanticVersion,
        actor: access.actor,
        role: access.actorRole,
        sealedAt: nowIso,
        attestationPath: `docs/project-context-hub/04-traceability-and-exports/RELEASE_${activeSprint}_ATTESTATION.json`
      }
    : (persistedBefore.sealedRelease || null);

  const { handoffQueue, pendingHandoffs } = buildHandoffQueue({
    absProject,
    currentStage: nextStage,
    activeSprint,
    pendingCheckpoint: null,
    openStages: resetOpenStages,
    deltaHistory: initialState.deltaHistory
  });

  writePersistedState(statePath, {
    ...persistedBefore,
    schemaVersion: '4.3.0',
    projectCode,
    semanticVersion,
    mode,
    requireHumanCheckpoints,
    activeSprint,
    currentStage: nextStage,
    stages: nextStagesMap,
    pendingCheckpoint: null,
    checkpointAuditTrail: Array.isArray(persistedBefore.checkpointAuditTrail) ? persistedBefore.checkpointAuditTrail : [],
    circuitBreaker: { maxRetries, retryCounts: resetRetryCounts, openStages: resetOpenStages },
    handoffQueue,
    pendingHandoffs,
    releaseSealed: isReleaseSeal ? true : Boolean(persistedBefore.releaseSealed),
    sealedRelease,
    lastDiagnostics: null,
    updatedAt: nowIso
  });

  await dispatchLifecycleHook(
    'onAfterGatePass',
    {
      projectRoot: absProject,
      hubRoot,
      stage: targetStage,
      nextStage,
      sprint: activeSprint,
      actor: access.actor,
      artifacts
    },
    { statePath }
  );

  if (isReleaseSeal) {
    await dispatchLifecycleHook(
      'onReleaseSealed',
      {
        projectRoot: absProject,
        hubRoot,
        stage: targetStage,
        sprint: activeSprint,
        version: semanticVersion,
        actor: access.actor,
        sealedRelease
      },
      { statePath }
    );
  }

  return {
    ok: true,
    advanced: true,
    status: isReleaseSeal ? 'RELEASE_SEALED' : 'PASSED',
    mode,
    role: access.actorRole,
    actor: access.actor,
    previousStage: targetStage,
    currentStage: nextStage,
    sprint: activeSprint,
    artifacts,
    recordedLessonId,
    sealedRelease: isReleaseSeal ? sealedRelease : undefined,
    stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
    message: `Stage '${targetStage}' PASSED. Pipeline advanced to '${nextStage}'.`
  };
}

/**
 * Controlled Post-Baseline CR Evolution (`DELTA_EVOLVE`):
 * Updates Semantic Version, Evolution Ledger, CHANGE_IMPACT_REGISTER.md, generates DELTA_<from>_to_<to>.md,
 * compiles DELTA_EXECUTION_PLAN.md via `delta-sync.js`, and queues DEV/QA handoffs WITHOUT resetting prior sealed stages.
 */
async function evolveChangeRequest(projectRoot, opts = {}) {
  const initialState = inspectProjectState(projectRoot, { sprint: opts.sprint, mode: opts.mode });
  const { projectRoot: absProject, hubRoot, activeSprint, projectCode, mode } = initialState;
  const orchConfig = loadOrchestratorConfig(absProject);

  const access = checkRoleAccess(mode, 'DELTA_EVOLVE', opts.role, {
    projectRoot: absProject,
    actor: opts.actor,
    config: orchConfig
  });
  if (!access.allowed) {
    return access;
  }

  const crId = String(opts.crId || '').trim();
  if (!crId || !/^[A-Za-z]+-[A-Za-z0-9_-]+$/.test(crId)) {
    return {
      ok: false,
      code: 'INVALID_CR_ID',
      message: `Valid Change Request ID is required (e.g. 'CR-101'); received '${crId}'.`
    };
  }
  if (crId.toUpperCase() === 'CR-001' && projectCode.toUpperCase() !== 'UCMS') {
    return {
      ok: false,
      code: 'ANTI_PLACEHOLDER_CR_ID',
      message: `CR ID 'CR-001' is forbidden outside 'UCMS' (ANTI-PLACEHOLDER-01). Supply a project-specific ID such as 'CR-101'.`
    };
  }

  const fromVer = String(opts.fromVersion || initialState.semanticVersion || 'v1.0.0').trim();
  const toVer = String(opts.toVersion || bumpMinorSemver(fromVer)).trim();
  const targetId = String(opts.targetId || 'ALL').trim();
  const wasDesc = String(opts.was || 'Prior sealed baseline specification').trim();
  const curDesc = String(opts.current || opts.summary || `Updated specification per ${crId}`).trim();
  const summary = String(opts.summary || `${wasDesc} -> ${curDesc}`).trim();
  const dateStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  // 1. Update PROJECT_CONTEXT.md Semantic Version & Section 15 Evolution Ledger
  const ctxPath = path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md');
  if (fs.existsSync(ctxPath)) {
    let ctxTxt = fs.readFileSync(ctxPath, 'utf8');
    if (/\|\s*\*\*Semantic\s+Version\*\*\s*\|/i.test(ctxTxt)) {
      ctxTxt = ctxTxt.replace(
        /(\|\s*\*\*Semantic\s+Version\*\*\s*\|\s*)`?[^|`\n]+`?(\s*\|)/i,
        `$1\`${toVer}\`$2`
      );
    }
    if (/\|\s*\*\*Last\s+Updated\*\*\s*\|/i.test(ctxTxt)) {
      ctxTxt = ctxTxt.replace(
        /(\|\s*\*\*Last\s+Updated\*\*\s*\|\s*)`?[^|`\n]+`?(\s*\|)/i,
        `$1\`${dateStr}\`$2`
      );
    }
    const ledgerRow = `| \`${toVer}\` | \`${dateStr}\` | \`${crId}\` | \`${targetId}\` | ${wasDesc} | ${curDesc} | \`BA\`: CR delta issued \\| \`PM\`: Schedule ${crId} \\| \`Dev\`: Implement ${toVer} \\| \`QA\`: Regression suite |`;
    if (/##\s+15\.\s+Evolution/i.test(ctxTxt)) {
      ctxTxt = ctxTxt.trimEnd() + '\n' + ledgerRow + '\n';
    } else {
      ctxTxt = ctxTxt.trimEnd() + '\n\n## 15. Evolution & Version History\n\n| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |\n|---|---|---|---|---|---|---|\n' + ledgerRow + '\n';
    }
    if (/SRD-CTX-/i.test(ctxTxt)) {
      ctxTxt = replaceDigestInMarkdown(ctxTxt, srdV1.computeSemanticDigest(ctxTxt, 'CTX'));
    }
    fs.writeFileSync(ctxPath, ctxTxt, 'utf8');
  }

  // 2. Sync CHANGE_IMPACT_REGISTER.md Current Hub Version (ANTI-PLACEHOLDER-01 parity)
  const cirPath = path.join(hubRoot, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md');
  fs.mkdirSync(path.dirname(cirPath), { recursive: true });
  if (fs.existsSync(cirPath)) {
    let cirTxt = fs.readFileSync(cirPath, 'utf8');
    if (/\|\s*\*\*Current\s+Hub\s+Version\*\*\s*\|/i.test(cirTxt)) {
      cirTxt = cirTxt.replace(
        /(\|\s*\*\*Current\s+Hub\s+Version\*\*\s*\|\s*)`?[^|`\n]+`?(\s*\|)/i,
        `$1\`${toVer}\`$2`
      );
    }
    cirTxt = cirTxt.trimEnd() + `\n| \`${crId}\` | \`${toVer}\` | \`${targetId}\` | ${summary} | \`${dateStr}\` |\n`;
    fs.writeFileSync(cirPath, cirTxt, 'utf8');
  } else {
    fs.writeFileSync(
      cirPath,
      [
        `# Change Impact Register — \`${projectCode}\``,
        '',
        `| Metadata Field | Canonical Value |`,
        `|---|---|`,
        `| **Current Hub Version** | \`${toVer}\` |`,
        `| **Last Updated** | \`${dateStr}\` |`,
        '',
        '| CR ID | Hub Version | Target ID | Summary | Date |',
        '|---|---|---|---|---|',
        `| \`${crId}\` | \`${toVer}\` | \`${targetId}\` | ${summary} | \`${dateStr}\` |`,
        ''
      ].join('\n'),
      'utf8'
    );
  }

  // 3. Generate DELTA_<from>_to_<to>.md via `ba-hub build-delta` or built-in generator
  const deltaRelPath = `docs/project-context-hub/03-version-deltas/DELTA_${fromVer}_to_${toVer}.md`;
  const deltaFullPath = path.join(hubRoot, '03-version-deltas', `DELTA_${fromVer}_to_${toVer}.md`);
  fs.mkdirSync(path.dirname(deltaFullPath), { recursive: true });

  if (hasFullBaHubCli()) {
    runNodeCli(
      path.join(BA_HUB_ROOT, 'bin', 'ba-hub.js'),
      ['build-delta', `--hub=${hubRoot}`, `--from=${fromVer}`, `--to=${toVer}`],
      absProject
    );
  } else {
    const deltaMd = [
      `# RELEASE DELTA PACK — \`DELTA_${fromVer}_to_${toVer}\``,
      '',
      '| Metadata Field | Canonical Value |',
      '|---|---|',
      `| **Project Code** | \`${projectCode}\` |`,
      `| **Version Transition** | \`From Version: ${fromVer}\` -> \`To Version: ${toVer}\` |`,
      `| **Release Date** | \`${dateStr}\` |`,
      `| **Change Triggers** | \`${crId}\` |`,
      `| **Target Entity / Feature** | \`${targetId}\` |`,
      '',
      '---',
      '',
      '## 1. Unified `WAS -> CURRENT` Diff Table',
      `| Hub Artifact | Target ID | Change Kind | WAS (\`${fromVer}\`) | CURRENT (\`${toVer}\`) | Trigger Ref |`,
      '|---|---|---|---|---|---|',
      `| \`00-project-core/PROJECT_CONTEXT.md\` | \`${targetId}\` | \`MODIFY\` | ${wasDesc} | ${curDesc} | \`${crId}\` |`,
      '',
      '## 2. Auto-Extracted Department Action Checklists',
      `- [ ] **Dev (\`${targetId}\` / \`${crId}\`):** Implement delta transition ${wasDesc} -> ${curDesc}.`,
      `- [ ] **QA (\`${targetId}\` / \`${crId}\`):** Execute regression checks for \`${toVer}\`.`,
      ''
    ].join('\n');
    fs.writeFileSync(deltaFullPath, deltaMd, 'utf8');
  }

  // 4. Compile Delta Execution Plan via delta-sync.js
  runNodeCli(path.join(BIN_DIR, 'delta-sync.js'), [`--hub=${hubRoot}`, `--to=${toVer}`], absProject);
  const executionPlanPath = 'docs/business-context/DELTA_EXECUTION_PLAN.md';

  // 5. Record CR in .os-state.json WITHOUT resetting prior stages 1..10 or touching FEATURE-*.md §§1-9
  const statePath = path.join(hubRoot, '.os-state.json');
  const persisted = readPersistedState(statePath) || {};
  const deltaEntry = {
    crId,
    fromVersion: fromVer,
    toVersion: toVer,
    targetId,
    was: wasDesc,
    current: curDesc,
    summary,
    actor: access.actor,
    role: access.actorRole,
    timestamp: nowIso,
    deltaPackPath: deltaRelPath,
    executionPlanPath
  };
  const nextDeltaHistory = [...(Array.isArray(persisted.deltaHistory) ? persisted.deltaHistory : []), deltaEntry];

  const preservedStages = {};
  for (const s of STAGE_DEFINITIONS) {
    if (s.id === 'DELTA_EVOLVE') {
      preservedStages[s.id] = 'PASSED';
    } else {
      preservedStages[s.id] = persisted.stages?.[s.id] || initialState.stages[s.id]?.status || 'PENDING';
    }
  }

  const { handoffQueue, pendingHandoffs } = buildHandoffQueue({
    absProject,
    currentStage: initialState.currentStage,
    activeSprint,
    pendingCheckpoint: persisted.pendingCheckpoint || null,
    openStages: persisted.circuitBreaker?.openStages || {},
    deltaHistory: nextDeltaHistory
  });

  writePersistedState(statePath, {
    ...persisted,
    schemaVersion: '4.3.0',
    projectCode,
    semanticVersion: toVer,
    mode,
    requireHumanCheckpoints: initialState.requireHumanCheckpoints,
    activeSprint,
    currentStage: initialState.currentStage,
    stages: preservedStages,
    deltaHistory: nextDeltaHistory,
    handoffQueue,
    pendingHandoffs,
    updatedAt: nowIso
  });

  await dispatchLifecycleHook(
    'onAfterGatePass',
    {
      projectRoot: absProject,
      hubRoot,
      stage: 'DELTA_EVOLVE',
      sprint: activeSprint,
      actor: access.actor,
      crId,
      fromVersion: fromVer,
      toVersion: toVer,
      deltaEntry
    },
    { statePath }
  );

  return {
    ok: true,
    stage: 'DELTA_EVOLVE',
    crId,
    fromVersion: fromVer,
    toVersion: toVer,
    targetId,
    actor: access.actor,
    priorStagesPreserved: true,
    deltaPackPath: deltaRelPath,
    executionPlanPath,
    deltaEntry,
    handoffQueue,
    stateFilePath: path.relative(absProject, statePath).replace(/\\/g, '/'),
    message: `CR '${crId}' evolved (${fromVer} -> ${toVer}) via DELTA_EVOLVE without resetting prior sealed stages.`
  };
}

/**
 * Returns immutable checkpoints, CR evolution deltas, circuit breaker telemetry, and add-on logs.
 */
function getAuditTrail(projectRoot, opts = {}) {
  const state = inspectProjectState(projectRoot, { sprint: opts.sprint, mode: opts.mode });
  return {
    ok: true,
    projectRoot: state.projectRoot,
    projectCode: state.projectCode,
    activeSprint: state.activeSprint,
    semanticVersion: state.semanticVersion,
    releaseSealed: state.releaseSealed,
    sealedRelease: state.sealedRelease,
    checkpointAuditTrail: state.checkpointAuditTrail,
    deltaHistory: state.deltaHistory,
    circuitBreaker: state.circuitBreaker,
    addonLogs: state.addonLogs
  };
}

// ============================================================================
// Multi-Project Workspace Registry & Zero-Terminal Bootstrap Engine (v4.4.0)
// ============================================================================

function computeWorkspaceId(projectRootPath) {
  const resolved = path.resolve(expandCliPath(projectRootPath || process.cwd()));
  const normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return 'ws-' + crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

function sanitizeProjectCode(rawCode, fallbackName) {
  const cleaned = String(rawCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 20);
  if (cleaned.length >= 2) return cleaned;
  const words = String(fallbackName || 'PRJ')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return words.map(w => w[0]).join('').toUpperCase().slice(0, 6) || 'PRJ-01';
  }
  const single = (words[0] || 'PRJ').toUpperCase().slice(0, 6);
  return single.length >= 2 ? single : 'PRJ-01';
}

function resolveWorkspacesRegistryPath(customPath) {
  const explicit = customPath || process.env.OS_WORKSPACES_REGISTRY;
  const primary = explicit
    ? path.resolve(expandCliPath(explicit))
    : path.join(os.homedir(), '.innova-os', 'workspaces.json');
  const fallback = path.join(os.tmpdir(), 'innova-os-registry', 'workspaces.json');

  if (!explicit) {
    try {
      fs.mkdirSync(path.dirname(primary), { recursive: true });
      return primary;
    } catch {
      if (fs.existsSync(fallback)) return fallback;
      try {
        fs.mkdirSync(path.dirname(fallback), { recursive: true });
      } catch {
        // ignore
      }
      return fallback;
    }
  }
  return primary;
}

function readWorkspacesRegistryRaw(registryPath) {
  if (!registryPath || !fs.existsSync(registryPath)) {
    return { schemaVersion: '4.4.0', activeWorkspaceId: null, workspaces: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return { schemaVersion: '4.4.0', activeWorkspaceId: null, workspaces: [] };
    }
    return {
      schemaVersion: parsed.schemaVersion || '4.4.0',
      activeWorkspaceId: typeof parsed.activeWorkspaceId === 'string' ? parsed.activeWorkspaceId : null,
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : []
    };
  } catch {
    return { schemaVersion: '4.4.0', activeWorkspaceId: null, workspaces: [] };
  }
}

function listWorkspaces(opts = {}) {
  const registryPath = resolveWorkspacesRegistryPath(opts.registryPath);
  const raw = readWorkspacesRegistryRaw(registryPath);
  const enriched = raw.workspaces
    .filter(w => w && w.projectRoot)
    .map(w => {
      const absProj = path.resolve(w.projectRoot);
      const absHub = w.hubRoot ? path.resolve(w.hubRoot) : path.join(absProj, 'docs', 'project-context-hub');
      const exists = fs.existsSync(absProj) || fs.existsSync(absHub);
      return {
        ...w,
        id: w.id || computeWorkspaceId(absProj),
        projectRoot: absProj,
        hubRoot: absHub,
        exists
      };
    })
    .sort((a, b) => String(b.lastOpenedAt || '').localeCompare(String(a.lastOpenedAt || '')));

  return {
    ok: true,
    registryPath,
    activeWorkspaceId: raw.activeWorkspaceId,
    workspaces: enriched
  };
}

function normalizeScopeLabel(rawScope, absProject, hubRoot) {
  const up = String(rawScope || '').toUpperCase().trim();
  if (up === 'BA_ONLY' || up === 'BA_ONLY_HUB') return 'BA_ONLY_HUB';
  if (up === 'FULL_LIFECYCLE' || up === 'FULL_PROJECT') return 'FULL_LIFECYCLE';
  const hasAiOrStack =
    fs.existsSync(path.join(absProject, '.ai')) || fs.existsSync(path.join(absProject, 'stack.json'));
  const hasCode = ['app', 'Modules', 'src', 'resources', 'database', 'packages', 'backend', 'frontend'].some(d =>
    fs.existsSync(path.join(absProject, d))
  );
  return absProject !== hubRoot && hasAiOrStack && hasCode ? 'FULL_LIFECYCLE' : 'BA_ONLY_HUB';
}

function registerWorkspace(input = {}, opts = {}) {
  const inputObj = typeof input === 'string' ? { projectRoot: input } : (input || {});
  const targetPath = inputObj.projectRoot || inputObj.hubRoot || process.cwd();
  const { absProject, hubRoot: resolvedHub } = resolveProjectRootAndHub(targetPath);
  const hubRoot = inputObj.hubRoot ? path.resolve(expandCliPath(inputObj.hubRoot)) : resolvedHub;
  const ctxPath = path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md');
  const ctxRaw = fs.existsSync(ctxPath) ? fs.readFileSync(ctxPath, 'utf8') : '';

  const fallbackName = path.basename(absProject) || 'Project';
  const name = String(
    inputObj.name || inputObj.projectName || extractMetaField(ctxRaw, /^Project\s+Name$/i) || fallbackName
  ).trim();
  const code = sanitizeProjectCode(
    inputObj.code || inputObj.projectCode || extractMetaField(ctxRaw, /^Project\s+Code$/i),
    name
  );
  const scope = normalizeScopeLabel(inputObj.scope, absProject, hubRoot);
  const id = inputObj.id || computeWorkspaceId(absProject);
  const nowIso = new Date().toISOString();

  const registryPath = resolveWorkspacesRegistryPath(opts.registryPath || inputObj.registryPath);
  const raw = readWorkspacesRegistryRaw(registryPath);
  const replaceHub = inputObj.replaceHubRoot ? path.resolve(inputObj.replaceHubRoot) : null;

  const filtered = raw.workspaces.filter(w => {
    if (!w || !w.projectRoot) return false;
    if (w.id === id) return false;
    const sameProj =
      (process.platform === 'win32'
        ? path.resolve(w.projectRoot).toLowerCase() === absProject.toLowerCase()
        : path.resolve(w.projectRoot) === absProject);
    if (sameProj) return false;
    if (replaceHub && w.hubRoot && path.resolve(w.hubRoot) === replaceHub && w.scope === 'BA_ONLY_HUB') {
      return false;
    }
    return true;
  });

  const entry = {
    id,
    name,
    code,
    projectRoot: absProject,
    hubRoot,
    scope,
    lastOpenedAt: nowIso
  };
  const nextList = [entry, ...filtered].slice(0, 50);

  writePersistedState(registryPath, {
    schemaVersion: '4.4.0',
    activeWorkspaceId: id,
    updatedAt: nowIso,
    workspaces: nextList
  });

  return {
    ok: true,
    registryPath,
    activeWorkspaceId: id,
    workspace: entry,
    workspaces: listWorkspaces({ registryPath }).workspaces
  };
}

function safeReadJson(filePath) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
  } catch {
    return null;
  }
}

function collectPackageDeps(targetRoot) {
  const pkgPaths = [
    path.join(targetRoot, 'package.json'),
    path.join(targetRoot, 'frontend', 'package.json'),
    path.join(targetRoot, 'client', 'package.json'),
    path.join(targetRoot, 'web', 'package.json'),
    path.join(targetRoot, 'src', 'Web', 'ClientApp', 'package.json')
  ];
  const deps = {};
  for (const p of pkgPaths) {
    const pkg = safeReadJson(p);
    if (!pkg || typeof pkg !== 'object') continue;
    Object.assign(deps, pkg.dependencies || {}, pkg.devDependencies || {});
  }
  return deps;
}

function hasAnyExtRecursive(dir, exts, maxDepth = 3, depth = 0) {
  if (depth > maxDepth || !fs.existsSync(dir)) return false;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === 'vendor' || ent.name === '.git' || ent.name === 'bin' || ent.name === 'obj') {
      continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isFile()) {
      if (exts.some(ext => ent.name.toLowerCase().endsWith(ext))) return true;
    } else if (ent.isDirectory()) {
      if (hasAnyExtRecursive(full, exts, maxDepth, depth + 1)) return true;
    }
  }
  return false;
}

function autoDetectStackConfig(targetRoot) {
  const absTarget = path.resolve(expandCliPath(targetRoot || process.cwd()));
  const baseTemplate = safeReadJson(path.join(OS_ROOT, 'stack.json')) || {};
  const cfg = JSON.parse(JSON.stringify(baseTemplate));

  cfg.architecture = { hmvc: false, monolith: true };
  cfg.stacks = cfg.stacks || {};
  cfg.stacks.backend = {
    laravel: false,
    cakephp: false,
    php_native: false,
    dotnet: false,
    node: false
  };
  cfg.stacks.frontend = {
    vue: false,
    nuxt: false,
    tanstack: false,
    react: false,
    angular: false,
    blade: false,
    cakephp_templates: false,
    php_native_html: false
  };

  const isDotNet = hasAnyExtRecursive(absTarget, ['.sln', '.slnx', '.csproj'], 2);
  const composer = safeReadJson(path.join(absTarget, 'composer.json'));
  const composerDeps = { ...(composer?.require || {}), ...(composer?.['require-dev'] || {}) };
  const isCakePhp = Boolean(composerDeps['cakephp/cakephp']) || (fs.existsSync(path.join(absTarget, 'src', 'Controller')) && !isDotNet && Boolean(composer));
  const isLaravel =
    fs.existsSync(path.join(absTarget, 'artisan')) ||
    Boolean(composerDeps['laravel/framework']) ||
    fs.existsSync(path.join(absTarget, 'Modules')) ||
    (fs.existsSync(path.join(absTarget, 'app', 'Models')) && hasAnyExtRecursive(path.join(absTarget, 'app'), ['.php'], 2));
  const deps = collectPackageDeps(absTarget);
  const isNodeBackend = Boolean(
    deps.express || deps.fastify || deps['@nestjs/core'] || deps.koa || deps.hono
  );

  if (isDotNet) {
    cfg.stacks.backend.dotnet = true;
    cfg.architecture = { hmvc: false, monolith: true };
  } else if (isCakePhp) {
    cfg.stacks.backend.cakephp = true;
    cfg.architecture = {
      hmvc: fs.existsSync(path.join(absTarget, 'plugins')) || fs.existsSync(path.join(absTarget, 'Modules')),
      monolith: !(fs.existsSync(path.join(absTarget, 'plugins')) || fs.existsSync(path.join(absTarget, 'Modules')))
    };
  } else if (isLaravel) {
    cfg.stacks.backend.laravel = true;
    const hmvc = fs.existsSync(path.join(absTarget, 'Modules')) || fs.existsSync(path.join(absTarget, 'packages'));
    cfg.architecture = { hmvc, monolith: !hmvc };
  } else if (isNodeBackend) {
    cfg.stacks.backend.node = true;
    cfg.architecture = { hmvc: false, monolith: true };
  } else {
    cfg.stacks.backend.laravel = true;
    cfg.architecture = { hmvc: true, monolith: false };
  }

  if (deps['@tanstack/react-router'] || deps['@tanstack/react-query'] || deps['@tanstack/react-start']) {
    cfg.stacks.frontend.tanstack = true;
    cfg.stacks.frontend.react = true;
  } else if (deps.react || deps['next']) {
    cfg.stacks.frontend.react = true;
  }
  if (deps.nuxt || fs.existsSync(path.join(absTarget, 'nuxt.config.ts')) || fs.existsSync(path.join(absTarget, 'nuxt.config.js'))) {
    cfg.stacks.frontend.nuxt = true;
    cfg.stacks.frontend.vue = true;
  } else if (deps.vue) {
    cfg.stacks.frontend.vue = true;
  }
  if (deps['@angular/core']) {
    cfg.stacks.frontend.angular = true;
  }
  if (hasAnyExtRecursive(path.join(absTarget, 'resources', 'views'), ['.blade.php'], 3)) {
    cfg.stacks.frontend.blade = true;
  }

  cfg.stacks.context_hub = {
    layout: 'auto',
    hub_root: 'docs/project-context-hub',
    enforce_two_gate: true,
    verify_feature_srd: true
  };

  return cfg;
}

function syncAiOsToTarget(targetRoot, opts = {}) {
  const absTarget = path.resolve(expandCliPath(targetRoot || process.cwd()));
  fs.mkdirSync(absTarget, { recursive: true });

  if (absTarget === OS_ROOT) {
    const existing = safeReadJson(path.join(OS_ROOT, 'stack.json'));
    return existing || autoDetectStackConfig(absTarget);
  }

  const aiDir = path.join(absTarget, '.ai');
  fs.mkdirSync(aiDir, { recursive: true });
  fs.mkdirSync(path.join(aiDir, 'context'), { recursive: true });

  const copyDirSafely = (srcDir, destDir) => {
    if (!fs.existsSync(srcDir)) return;
    fs.cpSync(srcDir, destDir, { recursive: true, force: true, dereference: true });
  };

  copyDirSafely(path.join(OS_ROOT, 'bin'), path.join(aiDir, 'bin'));
  copyDirSafely(path.join(OS_ROOT, '.ai', 'skills'), path.join(aiDir, 'skills'));
  copyDirSafely(path.join(OS_ROOT, 'templates'), path.join(aiDir, 'templates'));

  const srcOrchCfg = path.join(OS_ROOT, '.ai', 'orchestrator.config.json');
  const destOrchCfg = path.join(aiDir, 'orchestrator.config.json');
  if (fs.existsSync(srcOrchCfg) && !fs.existsSync(destOrchCfg)) {
    fs.copyFileSync(srcOrchCfg, destOrchCfg);
  }

  const srcLessons = path.join(OS_ROOT, 'context', 'LESSONS_LEARNED.md');
  const destLessons = path.join(aiDir, 'context', 'LESSONS_LEARNED.md');
  if (fs.existsSync(srcLessons) && !fs.existsSync(destLessons)) {
    fs.copyFileSync(srcLessons, destLessons);
  }

  const detectedStack = autoDetectStackConfig(absTarget);
  const stackPath = path.join(aiDir, 'stack.json');
  let finalStack = detectedStack;
  if (fs.existsSync(stackPath) && !opts.overwriteStack) {
    const prevStack = safeReadJson(stackPath);
    if (prevStack && typeof prevStack === 'object') {
      finalStack = {
        ...prevStack,
        stacks: {
          ...(prevStack.stacks || {}),
          context_hub: {
            layout: 'auto',
            hub_root: 'docs/project-context-hub',
            enforce_two_gate: true,
            verify_feature_srd: true,
            ...(prevStack.stacks?.context_hub || {})
          }
        }
      };
    }
  }
  writePersistedState(stackPath, finalStack);

  const srcAgrules = path.join(OS_ROOT, '.agrules');
  if (fs.existsSync(srcAgrules)) {
    if (opts.syncRules !== false || !fs.existsSync(path.join(absTarget, '.agrules'))) {
      fs.copyFileSync(srcAgrules, path.join(absTarget, '.agrules'));
    }
    if (opts.syncRules !== false || !fs.existsSync(path.join(aiDir, '.agrules'))) {
      fs.copyFileSync(srcAgrules, path.join(aiDir, '.agrules'));
    }
  }

  return finalStack;
}

function runBaHubInitOrFallback({ hubRoot, projectCode, projectName, projectRoot }) {
  fs.mkdirSync(hubRoot, { recursive: true });
  if (fs.existsSync(path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'))) {
    fs.mkdirSync(path.join(hubRoot, '_intake'), { recursive: true });
    return { method: 'existing' };
  }

  const baHubCli = path.join(BA_HUB_ROOT, 'bin', 'ba-hub.js');
  if (hasFullBaHubCli() && fs.existsSync(baHubCli)) {
    try {
      runNodeCli(
        baHubCli,
        ['init', `--target=${hubRoot}`, `--project=${projectCode}`, `--name=${projectName}`],
        projectRoot
      );
      fs.mkdirSync(path.join(hubRoot, '_intake'), { recursive: true });
      return { method: 'ba-hub' };
    } catch {
      // Fallback cleanly if external ba-context-hub-os helper is blocked by environment
    }
  }

  initHubFallback({
    target: hubRoot,
    project: projectCode,
    name: projectName,
    scopeMode: 'FULL_PROJECT'
  });
  fs.mkdirSync(path.join(hubRoot, '_intake'), { recursive: true });
  return { method: 'fallback' };
}

/**
 * Zero-terminal workspace bootstrapper supporting `BA_ONLY` (documents-only hub)
 * and `FULL_LIFECYCLE` (installs `.ai/` + `.agrules`, auto-detects tech stack, builds map + intake bundle).
 * @param {{ projectRoot: string, projectName?: string, name?: string, projectCode?: string, code?: string, mode?: 'BA_ONLY'|'FULL_LIFECYCLE', sprint?: string, overwriteStack?: boolean, registryPath?: string }} [options]
 */
function bootstrapProjectWorkspace(options = {}) {
  if (!options || !options.projectRoot || !String(options.projectRoot).trim()) {
    return {
      ok: false,
      code: 'INVALID_PROJECT_ROOT',
      message: 'projectRoot is required to bootstrap a workspace.'
    };
  }

  const rawMode = String(options.mode || 'BA_ONLY').toUpperCase().trim();
  let mode;
  let lifecycleScope;
  if (rawMode === 'BA_ONLY' || rawMode === 'BA_ONLY_HUB') {
    mode = 'BA_ONLY';
    lifecycleScope = 'BA_ONLY_HUB';
  } else if (rawMode === 'FULL_LIFECYCLE') {
    mode = 'FULL_LIFECYCLE';
    lifecycleScope = 'FULL_LIFECYCLE';
  } else {
    return {
      ok: false,
      code: 'INVALID_BOOTSTRAP_MODE',
      message: `Invalid bootstrap mode '${options.mode}'. Allowed: BA_ONLY, FULL_LIFECYCLE.`
    };
  }

  const absProject = path.resolve(expandCliPath(String(options.projectRoot)));
  fs.mkdirSync(absProject, { recursive: true });

  const projectName = String(options.projectName || options.name || path.basename(absProject) || 'New Project').trim();
  const projectCode = sanitizeProjectCode(options.projectCode || options.code, projectName);
  const activeSprint = String(options.sprint || 'S1').trim() || 'S1';
  const hubRoot = path.join(absProject, 'docs', 'project-context-hub');
  const warnings = [];

  const initResult = runBaHubInitOrFallback({
    hubRoot,
    projectCode,
    projectName,
    projectRoot: absProject
  });

  let stackConfig = null;
  if (mode === 'FULL_LIFECYCLE') {
    stackConfig = syncAiOsToTarget(absProject, { overwriteStack: Boolean(options.overwriteStack) });
    try {
      runNodeCli(
        path.join(BIN_DIR, 'build-codebase-map.js'),
        [absProject, path.join(absProject, '.ai', 'context', 'CODEBASE_MAP.md')],
        absProject
      );
    } catch (err) {
      warnings.push(`build-codebase-map warning: ${err && err.message ? err.message : String(err)}`);
    }

    const intakeDir = path.join(absProject, 'docs', 'business-context', 'intake');
    fs.mkdirSync(intakeDir, { recursive: true });
    try {
      runNodeCli(path.join(BIN_DIR, 'reverse-architect.js'), [`--export-ba-intake=${intakeDir}`], absProject);
    } catch (err) {
      warnings.push(`reverse-architect warning: ${err && err.message ? err.message : String(err)}`);
    }

    const hubIntakeDir = path.join(hubRoot, '_intake');
    fs.mkdirSync(hubIntakeDir, { recursive: true });
    for (const artName of ['REVERSE_INTAKE_BUNDLE.json', 'PROTOTYPE_DISCOVERY_REPORT.md']) {
      const srcArt = path.join(intakeDir, artName);
      if (fs.existsSync(srcArt)) {
        fs.copyFileSync(srcArt, path.join(hubIntakeDir, artName));
      }
    }

    const manifestFile = path.join(hubIntakeDir, 'INTAKE_MANIFEST.md');
    if (!fs.existsSync(manifestFile)) {
      fs.writeFileSync(
        manifestFile,
        [
          `# Intake Manifest — \`${projectCode}\``,
          '',
          `- **Project Name:** ${projectName}`,
          `- **Project Code:** \`${projectCode}\``,
          '- **Scope Mode:** `FULL_PROJECT`',
          `- **Sprint:** \`${activeSprint}\``,
          `- **Generated At:** \`${new Date().toISOString()}\``,
          ''
        ].join('\n'),
        'utf8'
      );
    }
  }

  const statePath = path.join(hubRoot, '.os-state.json');
  const existingState = readPersistedState(statePath) || {};
  writePersistedState(statePath, {
    ...existingState,
    schemaVersion: '4.3.0',
    projectCode,
    projectName,
    lifecycleScope,
    mode: existingState.mode || options.orchestratorMode || 'SOLO_FDE',
    activeSprint,
    updatedAt: new Date().toISOString()
  });

  const initialState = inspectProjectState(absProject, {
    sprint: activeSprint,
    mode: options.orchestratorMode || 'SOLO_FDE',
    persistMode: true
  });

  const reg = registerWorkspace(
    {
      name: projectName,
      code: projectCode,
      projectRoot: absProject,
      hubRoot,
      scope: lifecycleScope
    },
    { registryPath: options.registryPath }
  );

  return {
    ok: true,
    mode,
    lifecycleScope,
    initMethod: initResult.method,
    projectRoot: absProject,
    hubRoot,
    projectName,
    projectCode,
    stackConfig,
    warnings,
    workspace: reg.workspace,
    workspaces: reg.workspaces,
    state: initialState
  };
}

/**
 * One-click promotion of an existing BA Context Hub (`BA_ONLY_HUB`) into a target
 * engineering code repository (`FULL_LIFECYCLE`) without terminal commands.
 * @param {string} hubRootInput
 * @param {string} targetCodeRootInput
 * @param {{ overwriteStack?: boolean, registryPath?: string }} [opts]
 */
function attachEngineeringOsToRepo(hubRootInput, targetCodeRootInput, opts = {}) {
  if (!hubRootInput || !String(hubRootInput).trim()) {
    return { ok: false, code: 'HUB_ROOT_REQUIRED', message: 'Source hubRoot path is required.' };
  }
  if (!targetCodeRootInput || !String(targetCodeRootInput).trim()) {
    return { ok: false, code: 'CODE_ROOT_REQUIRED', message: 'Target code repository path is required.' };
  }

  const rawHub = path.resolve(expandCliPath(String(hubRootInput)));
  const resolvedSrc = resolveProjectRootAndHub(rawHub);
  const srcHubRoot = fs.existsSync(path.join(rawHub, '00-project-core')) ? rawHub : resolvedSrc.hubRoot;

  if (!fs.existsSync(path.join(srcHubRoot, '00-project-core'))) {
    return {
      ok: false,
      code: 'HUB_NOT_FOUND',
      message: `Valid BA Context Hub not found at '${srcHubRoot}' (missing 00-project-core/).`
    };
  }

  const absCodeRoot = path.resolve(expandCliPath(String(targetCodeRootInput)));
  fs.mkdirSync(absCodeRoot, { recursive: true });

  const stackConfig = syncAiOsToTarget(absCodeRoot, { overwriteStack: Boolean(opts.overwriteStack) });
  const targetHubPath = path.join(absCodeRoot, 'docs', 'project-context-hub');
  fs.mkdirSync(path.dirname(targetHubPath), { recursive: true });

  let linkedVia = 'in_place';
  const sameHub =
    process.platform === 'win32'
      ? path.resolve(srcHubRoot).toLowerCase() === path.resolve(targetHubPath).toLowerCase()
      : path.resolve(srcHubRoot) === path.resolve(targetHubPath);

  if (!sameHub) {
    if (!fs.existsSync(targetHubPath)) {
      try {
        fs.symlinkSync(srcHubRoot, targetHubPath, process.platform === 'win32' ? 'junction' : 'dir');
        linkedVia = 'symlink';
      } catch {
        fs.cpSync(srcHubRoot, targetHubPath, { recursive: true, force: true });
        linkedVia = 'copy';
      }
    } else {
      linkedVia = 'existing';
    }
  }

  const warnings = [];
  try {
    runNodeCli(
      path.join(BIN_DIR, 'build-codebase-map.js'),
      [absCodeRoot, path.join(absCodeRoot, '.ai', 'context', 'CODEBASE_MAP.md')],
      absCodeRoot
    );
  } catch (err) {
    warnings.push(`build-codebase-map warning: ${err && err.message ? err.message : String(err)}`);
  }

  try {
    runNodeCli(path.join(BIN_DIR, 'bcas-sync.js'), [`--hub=${targetHubPath}`], absCodeRoot);
  } catch (err) {
    warnings.push(`bcas-sync warning: ${err && err.message ? err.message : String(err)}`);
  }

  const statePath = path.join(targetHubPath, '.os-state.json');
  const existingState = readPersistedState(statePath) || {};
  const ctxRaw = safeReadUtf8OrEmpty(path.join(targetHubPath, '00-project-core', 'PROJECT_CONTEXT.md'));
  const projectName =
    existingState.projectName || extractMetaField(ctxRaw, /^Project\s+Name$/i) || path.basename(absCodeRoot);
  const projectCode =
    existingState.projectCode || extractMetaField(ctxRaw, /^Project\s+Code$/i) || sanitizeProjectCode('', projectName);

  writePersistedState(statePath, {
    ...existingState,
    schemaVersion: '4.3.0',
    projectName,
    projectCode,
    lifecycleScope: 'FULL_LIFECYCLE',
    updatedAt: new Date().toISOString()
  });

  const nextState = inspectProjectState(absCodeRoot);
  const reg = registerWorkspace(
    {
      name: projectName,
      code: projectCode,
      projectRoot: absCodeRoot,
      hubRoot: targetHubPath,
      scope: 'FULL_LIFECYCLE',
      replaceHubRoot: srcHubRoot
    },
    { registryPath: opts.registryPath }
  );

  return {
    ok: true,
    lifecycleScope: 'FULL_LIFECYCLE',
    projectRoot: absCodeRoot,
    hubRoot: targetHubPath,
    sourceHubRoot: srcHubRoot,
    linkedVia,
    stackConfig,
    warnings,
    workspace: reg.workspace,
    workspaces: reg.workspaces,
    state: nextState
  };
}

function safeReadUtf8OrEmpty(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

module.exports = {
  STAGE_DEFINITIONS,
  MAIN_STAGE_DEFINITIONS,
  VALID_MODES,
  VALID_ROLES,
  ANTI_PLACEHOLDER_BRACKET_RE,
  ANTI_EXAMPLE_LEFTOVER_RE,
  getStageDef,
  getNextStageId,
  resolveProjectRootAndHub,
  resolveActorIdentity,
  checkRoleAccess,
  scanAntiPlaceholders,
  runHubVerifier,
  inspectProjectState,
  setOrchestratorMode,
  buildStageDirective,
  runGateAndAdvance,
  approveCheckpoint,
  evolveChangeRequest,
  generateQaPack,
  getAuditTrail,
  withStateLock,
  resolveWorkspacesRegistryPath,
  listWorkspaces,
  registerWorkspace,
  autoDetectStackConfig,
  bootstrapProjectWorkspace,
  attachEngineeringOsToRepo
};
