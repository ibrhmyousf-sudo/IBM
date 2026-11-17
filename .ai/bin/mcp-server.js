#!/usr/bin/env node
'use strict';

/**
 * 🌐 InnovaDigits Unified MCP Server (`bin/mcp-server.js` v4.3.0)
 * Zero-dependency Model Context Protocol (`2024-11-05` / JSON-RPC 2.0 over `stdio`) server.
 *
 * CRITICAL INVARIANT:
 *   - `process.stdout` carries ONLY valid JSON-RPC 2.0 messages.
 *   - All logs/diagnostics (`console.log`, `console.info`, `console.warn`, `console.debug`)
 *     are strictly redirected to `process.stderr`.
 *
 * Capabilities:
 *   - Tools (`10`): `os_bootstrap_project`, `os_inspect_project`, `os_get_stage_directive`,
 *                   `os_run_gate_and_advance`, `os_approve_checkpoint`, `os_evolve_cr`,
 *                   `os_generate_qa_pack`, `pmtool_inspect_board`, `pmtool_push_wbs`,
 *                   `pmtool_sync_gate_status`
 *   - Prompts (`4`): `os-orchestrate`, `os-advance`, `os-approve`, `os-evolve-cr`
 *   - Resources (`3`): `os://state/current`, `os://state/handoffs`, `os://audit/trail`
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const rawStdoutWrite = process.stdout.write.bind(process.stdout);

const logToStderr = (...args) => {
  process.stderr.write(`[mcp-server] ${util.format(...args)}\n`);
};
console.log = logToStderr;
console.info = logToStderr;
console.warn = logToStderr;
console.debug = logToStderr;

const {
  inspectProjectState,
  setOrchestratorMode,
  buildStageDirective,
  runGateAndAdvance,
  approveCheckpoint,
  evolveChangeRequest,
  generateQaPack,
  getAuditTrail,
  resolveProjectRootAndHub,
  listWorkspaces,
  bootstrapProjectWorkspace,
  attachEngineeringOsToRepo
} = require('./lib/orchestrator-state');
const { isAddonEnabled } = require('./lib/orchestrator-plugins');
const {
  inspectPmtoolBoard,
  pushWbsWave,
  syncGateStatus
} = require('./lib/pmtool-adapter');

const SERVER_INFO = {
  name: 'innova-ai-engineering-os',
  version: '4.3.0'
};
const PROTOCOL_VERSION = '2024-11-05';

const STAGES_ENUM = [
  'INTAKE',
  'CORE_BOOTSTRAP',
  'SPRINT_PLAN',
  'SPRINT_SPECS',
  'GATE_A_SEAL',
  'GATE_B_ENG',
  'DEV_IMPLEMENT',
  'SECURITY_PERF_GATE',
  'QA_HANDOFF',
  'RELEASE_SEAL',
  'DELTA_EVOLVE'
];

const ROLES_ENUM = ['BA', 'TECH_LEAD', 'DEV', 'SECURITY', 'QA', 'PM'];

let explicitSessionRoot = process.env.OS_PROJECT_ROOT || null;

function trackProjectRoot(candidate) {
  if (candidate && typeof candidate === 'string' && candidate.trim()) {
    explicitSessionRoot = candidate.trim();
    return explicitSessionRoot;
  }
  if (explicitSessionRoot) {
    return explicitSessionRoot;
  }
  try {
    const reg = listWorkspaces();
    const list = Array.isArray(reg?.workspaces) ? reg.workspaces : [];
    const active =
      list.find(w => w.id === reg.activeWorkspaceId && w.projectRoot && fs.existsSync(w.projectRoot)) ||
      list.find(w => w.projectRoot && fs.existsSync(w.projectRoot));
    if (active) {
      return active.projectRoot;
    }
  } catch {
    // Fallback cleanly to current working directory
  }
  return process.cwd();
}

function readPendingDispatchQueue(targetRoot) {
  try {
    const { absProject } = resolveProjectRootAndHub(targetRoot);
    const queuePath = path.join(absProject, '.ai', '.dispatch-queue.json');
    if (!fs.existsSync(queuePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const TOOLS_SPEC = [
  {
    name: 'os_bootstrap_project',
    description:
      'Zero-terminal workspace bootstrapper: initializes a brand-new BA_ONLY Project Context Hub or a FULL_LIFECYCLE engineering repo (installs .ai/ + .agrules, auto-detects tech stacks, builds CODEBASE_MAP.md & BA intake bundle, or attaches an existing sealed hub to a code repo) and registers it in ~/.innova-os/workspaces.json.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to target project directory (or code repo when attachFromHubRoot is provided).' },
        projectName: { type: 'string', description: 'Human-readable Project Name.' },
        projectCode: { type: 'string', description: 'Short uppercase Project Code (e.g. ORD, HRX, FIN).' },
        mode: { type: 'string', enum: ['BA_ONLY', 'FULL_LIFECYCLE'], description: 'Bootstrap mode (default: BA_ONLY).' },
        sprint: { type: 'string', description: 'Initial Sprint ID (default: S1).' },
        attachFromHubRoot: { type: 'string', description: 'Optional existing BA hub root to attach to `projectRoot` and promote to FULL_LIFECYCLE.' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'os_inspect_project',
    description:
      'Auto-detects project Context Hub state, active sprint, mode (SOLO_FDE vs TEAM_RBAC), 11-stage SDLC progress, pending Human Checkpoints, Circuit Breaker counts, Role Inbox, and loaded Add-on plugins.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to target engineering repository (default: cwd).' },
        sprint: { type: 'string', description: 'Optional Sprint ID filter (e.g. S1, S4).' },
        mode: { type: 'string', enum: ['SOLO_FDE', 'TEAM_RBAC'], description: 'Optional mode override or update.' },
        persistMode: { type: 'boolean', description: 'When true with `mode`, persists the mode to .os-state.json.' },
        requireHumanCheckpoints: { type: 'boolean', description: 'Optional override for mandatory human checkpoints.' }
      }
    }
  },
  {
    name: 'os_get_stage_directive',
    description:
      'Assembles a surgical, context-isolated Markdown prompt directive for the active or requested stage, enforcing TEAM_RBAC role locks + roleAssignments and surfacing missing files, checkpoint banners, or remediation items.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        stage: {
          type: 'string',
          enum: STAGES_ENUM,
          description: 'Optional stage override; defaults to current active stage.'
        },
        sprint: { type: 'string', description: 'Optional Sprint ID.' },
        mode: { type: 'string', enum: ['SOLO_FDE', 'TEAM_RBAC'], description: 'Optional mode override.' },
        role: { type: 'string', enum: ROLES_ENUM, description: 'Caller role required in TEAM_RBAC mode.' },
        actor: { type: 'string', description: 'Optional actor identity override for roleAssignments validation.' }
      }
    }
  },
  {
    name: 'os_run_gate_and_advance',
    description:
      'Executes deterministic verification across the 10-stage main pipeline, enforces Human Checkpoints (PENDING_HUMAN_APPROVAL), trips Circuit Breaker after 3 consecutive failures (CIRCUIT_OPEN_ESCALATED), auto-appends LESSONS_LEARNED.md on recovery, and dispatches decoupled add-on lifecycle hooks.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        stage: {
          type: 'string',
          enum: STAGES_ENUM.filter(s => s !== 'DELTA_EVOLVE'),
          description: 'Optional stage to verify and advance; defaults to current active stage.'
        },
        sprint: { type: 'string', description: 'Optional Sprint ID.' },
        mode: { type: 'string', enum: ['SOLO_FDE', 'TEAM_RBAC'], description: 'Optional mode override.' },
        role: { type: 'string', enum: ROLES_ENUM, description: 'Caller role enforced in TEAM_RBAC mode.' },
        actor: { type: 'string', description: 'Optional actor identity.' },
        requireHumanCheckpoints: { type: 'boolean', description: 'Override mandatory human checkpoint gating (default true).' },
        resetCircuit: { type: 'boolean', description: 'Force re-evaluation even if circuit breaker is open.' },
        projectCode: { type: 'string', description: 'Optional project code when running INTAKE.' },
        projectName: { type: 'string', description: 'Optional project display name when running INTAKE.' }
      }
    }
  },
  {
    name: 'os_approve_checkpoint',
    description:
      'Approves or rejects a pending Human-in-the-Loop checkpoint (CORE_BOOTSTRAP, SPRINT_SPECS, DEV_IMPLEMENT), recording an immutable cryptographic audit entry in .os-state.json and firing onCheckpointApproved hooks.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        stage: {
          type: 'string',
          enum: ['CORE_BOOTSTRAP', 'SPRINT_SPECS', 'DEV_IMPLEMENT'],
          description: 'Checkpoint stage to approve or reject (defaults to pendingCheckpoint stage).'
        },
        decision: {
          type: 'string',
          enum: ['APPROVED', 'REJECTED'],
          description: 'Approval decision (default: APPROVED).'
        },
        actor: { type: 'string', description: 'Human reviewer identifier (defaults to git user.name / USER).' },
        notes: { type: 'string', description: 'Audit notes or decision rationale.' },
        sprint: { type: 'string', description: 'Optional Sprint ID.' },
        mode: { type: 'string', enum: ['SOLO_FDE', 'TEAM_RBAC'], description: 'Optional mode override.' },
        role: { type: 'string', enum: ROLES_ENUM, description: 'Caller role enforced in TEAM_RBAC mode.' }
      }
    }
  },
  {
    name: 'os_evolve_cr',
    description:
      'Executes the Controlled CR Evolution Track (DELTA_EVOLVE): updates Semantic Version & CHANGE_IMPACT_REGISTER.md, generates DELTA_<from>_to_<to>.md + DELTA_EXECUTION_PLAN.md, and queues DEV/QA handoffs without resetting sealed features.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        crId: { type: 'string', description: 'Change Request ID (e.g. CR-101).' },
        fromVersion: { type: 'string', description: 'Baseline semantic version (default: current project version).' },
        toVersion: { type: 'string', description: 'Target semantic version (default: minor increment).' },
        targetId: { type: 'string', description: 'Affected Feature/BR/Entity ID (e.g. FEATURE-001).' },
        was: { type: 'string', description: 'Previous sealed baseline specification behavior.' },
        current: { type: 'string', description: 'Updated CR specification behavior.' },
        summary: { type: 'string', description: 'Human-readable CR summary.' },
        sprint: { type: 'string', description: 'Optional Sprint ID.' },
        mode: { type: 'string', enum: ['SOLO_FDE', 'TEAM_RBAC'], description: 'Optional mode override.' },
        role: { type: 'string', enum: ROLES_ENUM, description: 'Caller role enforced in TEAM_RBAC mode (BA).' },
        actor: { type: 'string', description: 'Authoring BA/operator identifier.' }
      },
      required: ['crId']
    }
  },
  {
    name: 'os_generate_qa_pack',
    description:
      'Generates unified OpenAPI 3.0 (docs/openapi.json), Postman v2.1 collections, Offensive Pentest DAST collection, and immutable Cycle Handoff markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        sprint: { type: 'string', description: 'Optional Sprint ID.' },
        mode: { type: 'string', enum: ['SOLO_FDE', 'TEAM_RBAC'], description: 'Optional mode override.' },
        role: { type: 'string', enum: ROLES_ENUM, description: 'Caller role required in TEAM_RBAC mode (QA).' },
        actor: { type: 'string', description: 'Optional QA actor identifier.' }
      }
    }
  },
  {
    name: 'pmtool_inspect_board',
    description:
      'Decoupled PMTool Add-on: inspects 5-level WBS hierarchy and PMTOOL_SYNC_MAP.json. Returns ADDON_DISABLED when addons.pmtool.enabled=false.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        sprint: { type: 'string', description: 'Optional Sprint ID filter.' },
        release: { type: 'string', description: 'Optional Release filter.' },
        forceAddon: { type: 'boolean', description: 'Run even if addons.pmtool.enabled is false.' }
      }
    }
  },
  {
    name: 'pmtool_push_wbs',
    description:
      'Decoupled PMTool Add-on: idempotently pushes 5-level WBS hierarchy to PMTool REST API or .xlsx/CSV boards (defaults to dryRun=true). Returns ADDON_DISABLED when addons.pmtool.enabled=false.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        sprint: { type: 'string', description: 'Optional Sprint ID filter.' },
        release: { type: 'string', description: 'Optional Release filter.' },
        wave: { type: 'string', enum: ['all', 'components', 'epics', 'features', 'stories', 'tasks'], description: 'WBS level or all levels sequentially.' },
        dryRun: { type: 'boolean', description: 'Defaults to true. Set false explicitly to execute API mutations / write files.' },
        forceAddon: { type: 'boolean', description: 'Run even if addons.pmtool.enabled is false.' }
      }
    }
  },
  {
    name: 'pmtool_sync_gate_status',
    description:
      'Decoupled PMTool Add-on: synchronizes Gate A (READY_FOR_DEV), Gate B (READY_TO_CODE), or QA status updates. Returns ADDON_DISABLED when addons.pmtool.enabled=false.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Target repository root path.' },
        gate: { type: 'string', enum: ['GATE_A', 'READY_FOR_DEV', 'GATE_B', 'READY_TO_CODE', 'QA'], description: 'Target milestone gate.' },
        sprint: { type: 'string', description: 'Optional Sprint ID filter.' },
        featureIds: { type: 'array', items: { type: 'string' }, description: 'Optional subset of FEATURE-* IDs.' },
        dryRun: { type: 'boolean', description: 'Preview target status updates without mutating remote/local state.' },
        forceAddon: { type: 'boolean', description: 'Run even if addons.pmtool.enabled is false.' }
      },
      required: ['gate']
    }
  }
];

const PROMPTS_SPEC = [
  {
    name: 'os-orchestrate',
    description: '/os-orchestrate — Inspect 11-stage SDLC status, Role Inbox, pending checkpoints, and emit the active stage directive.',
    arguments: [
      { name: 'projectRoot', description: 'Target repository root path', required: false },
      { name: 'sprint', description: 'Sprint ID filter (e.g. S1)', required: false },
      { name: 'role', description: 'Active role in TEAM_RBAC mode', required: false }
    ]
  },
  {
    name: 'os-advance',
    description: '/os-advance — Execute deterministic stage verification and advance pipeline or inspect circuit-breaker remediation packet.',
    arguments: [
      { name: 'projectRoot', description: 'Target repository root path', required: false },
      { name: 'stage', description: 'Stage ID to advance', required: false },
      { name: 'role', description: 'Active role in TEAM_RBAC mode', required: false }
    ]
  },
  {
    name: 'os-approve',
    description: '/os-approve — Review and record immutable Human-in-the-Loop checkpoint approval (CORE_BOOTSTRAP, SPRINT_SPECS, DEV_IMPLEMENT).',
    arguments: [
      { name: 'projectRoot', description: 'Target repository root path', required: false },
      { name: 'stage', description: 'Checkpoint stage ID', required: false },
      { name: 'decision', description: 'APPROVED or REJECTED', required: false },
      { name: 'notes', description: 'Reviewer audit rationale', required: false }
    ]
  },
  {
    name: 'os-evolve-cr',
    description: '/os-evolve-cr — Execute Controlled CR Evolution Track (DELTA_EVOLVE) without resetting prior sealed stages.',
    arguments: [
      { name: 'projectRoot', description: 'Target repository root path', required: false },
      { name: 'crId', description: 'Change Request ID (e.g. CR-101)', required: true },
      { name: 'toVersion', description: 'Target semantic version (e.g. v1.1.0)', required: false },
      { name: 'summary', description: 'Summary of the requested delta', required: false }
    ]
  }
];

const RESOURCES_SPEC = [
  {
    uri: 'os://state/current',
    name: 'Current 11-Stage Orchestrator State',
    description: 'Live 10-stage + DELTA_EVOLVE pipeline state, Human Checkpoints, Circuit Breaker counters, and loaded Add-ons.',
    mimeType: 'application/json'
  },
  {
    uri: 'os://state/handoffs',
    name: 'Cross-Role Handover Queue (Role Inbox)',
    description: 'Pending stage executions, human checkpoint approvals, circuit escalations, and CR delta handoffs grouped by role.',
    mimeType: 'application/json'
  },
  {
    uri: 'os://audit/trail',
    name: 'Orchestrator Immutable Audit Trail',
    description: 'Immutable checkpointAuditTrail entries, CR deltaHistory, circuit breaker history, release seal attestation, and addonLogs.',
    mimeType: 'application/json'
  }
];

function buildPmtoolDisabledPayload(projectRoot) {
  return {
    ok: true,
    addon: 'pmtool',
    addonEnabled: false,
    status: 'ADDON_DISABLED',
    projectRoot,
    message: 'PMTool add-on is disabled (addons.pmtool.enabled = false in .ai/orchestrator.config.json). Set addons.pmtool.enabled=true or pass forceAddon=true to invoke PMTool directly.'
  };
}

async function executeToolCall(name, args = {}) {
  const projectRoot = trackProjectRoot(args.projectRoot);

  switch (name) {
    case 'os_bootstrap_project': {
      const res = args.attachFromHubRoot
        ? attachEngineeringOsToRepo(args.attachFromHubRoot, projectRoot)
        : bootstrapProjectWorkspace({
            projectRoot,
            projectName: args.projectName,
            projectCode: args.projectCode,
            mode: args.mode || 'BA_ONLY',
            sprint: args.sprint
          });
      if (res && res.projectRoot) trackProjectRoot(res.projectRoot);
      return res;
    }
    case 'os_inspect_project': {
      if (args.persistMode && args.mode) {
        const res = setOrchestratorMode(projectRoot, args.mode, args.sprint, {
          requireHumanCheckpoints: args.requireHumanCheckpoints
        });
        if (!res.ok) return res;
      }
      return inspectProjectState(projectRoot, {
        sprint: args.sprint,
        mode: args.mode,
        persistMode: Boolean(args.persistMode),
        requireHumanCheckpoints: args.requireHumanCheckpoints
      });
    }
    case 'os_get_stage_directive':
      return buildStageDirective(projectRoot, args.stage, args.sprint, {
        mode: args.mode,
        role: args.role,
        actor: args.actor
      });
    case 'os_run_gate_and_advance':
      return runGateAndAdvance(projectRoot, {
        stage: args.stage,
        sprint: args.sprint,
        mode: args.mode,
        role: args.role,
        actor: args.actor,
        requireHumanCheckpoints: args.requireHumanCheckpoints,
        resetCircuit: Boolean(args.resetCircuit),
        projectCode: args.projectCode,
        projectName: args.projectName
      });
    case 'os_approve_checkpoint':
      return approveCheckpoint(projectRoot, {
        stage: args.stage,
        decision: args.decision,
        actor: args.actor,
        notes: args.notes,
        sprint: args.sprint,
        mode: args.mode,
        role: args.role
      });
    case 'os_evolve_cr':
      return evolveChangeRequest(projectRoot, {
        crId: args.crId,
        fromVersion: args.fromVersion,
        toVersion: args.toVersion,
        targetId: args.targetId,
        was: args.was,
        current: args.current,
        summary: args.summary,
        sprint: args.sprint,
        mode: args.mode,
        role: args.role,
        actor: args.actor
      });
    case 'os_generate_qa_pack':
      return generateQaPack(projectRoot, {
        sprint: args.sprint,
        mode: args.mode,
        role: args.role,
        actor: args.actor
      });
    case 'pmtool_inspect_board': {
      if (!args.forceAddon && !isAddonEnabled(projectRoot, 'pmtool')) {
        return buildPmtoolDisabledPayload(projectRoot);
      }
      const res = await inspectPmtoolBoard(projectRoot, {
        sprint: args.sprint,
        release: args.release
      });
      return { addon: 'pmtool', addonEnabled: true, ...res };
    }
    case 'pmtool_push_wbs': {
      if (!args.forceAddon && !isAddonEnabled(projectRoot, 'pmtool')) {
        return buildPmtoolDisabledPayload(projectRoot);
      }
      const res = await pushWbsWave(projectRoot, {
        sprint: args.sprint,
        release: args.release,
        wave: args.wave,
        dryRun: args.dryRun
      });
      return { addon: 'pmtool', addonEnabled: true, ...res };
    }
    case 'pmtool_sync_gate_status': {
      if (!args.forceAddon && !isAddonEnabled(projectRoot, 'pmtool')) {
        return buildPmtoolDisabledPayload(projectRoot);
      }
      const res = await syncGateStatus(projectRoot, {
        gate: args.gate,
        sprint: args.sprint,
        featureIds: args.featureIds,
        dryRun: args.dryRun
      });
      return { addon: 'pmtool', addonEnabled: true, ...res };
    }
    default:
      return null;
  }
}

function getPromptResult(rawName, args = {}) {
  const name = String(rawName || '').replace(/^\/+/, '').trim();
  const promptDef = PROMPTS_SPEC.find(p => p.name === name);
  if (!promptDef) return null;

  const targetRoot = trackProjectRoot(args.projectRoot);
  const state = inspectProjectState(targetRoot, { sprint: args.sprint });

  if (name === 'os-orchestrate') {
    const dir = buildStageDirective(targetRoot, state.currentStage, state.activeSprint, {
      mode: state.mode,
      role: args.role
    });
    const inboxSummary = state.pendingHandoffs.length > 0
      ? state.pendingHandoffs.map(h => `- [${h.role}] ${h.type}: ${h.summary}`).join('\n')
      : '- No pending role handoffs.';
    const text = [
      `# Workflow: /os-orchestrate`,
      `Project \`${state.projectCode}\` | Sprint \`${state.activeSprint}\` | Version \`${state.semanticVersion}\` | Progress \`${state.mainStagesPassed}/${state.mainStagesTotal}\` | Stage: \`${state.currentStage}\``,
      '',
      '## Role Inbox (Pending Handoffs)',
      inboxSummary,
      '',
      dir.allowed ? dir.directive : `Access check: ${dir.message}`
    ].join('\n');

    return {
      description: promptDef.description,
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }

  if (name === 'os-advance') {
    const dispatchQueue = readPendingDispatchQueue(targetRoot);
    const targetStage = args.stage || dispatchQueue?.stage || state.currentStage;
    const effectiveSprint = args.sprint || dispatchQueue?.sprint || state.activeSprint;
    const text = [
      `# Workflow: /os-advance`,
      `Run MCP tool \`os_run_gate_and_advance\` with:`,
      `- \`projectRoot\`: \`${targetRoot}\``,
      `- \`stage\`: \`${targetStage}\``,
      `- \`sprint\`: \`${effectiveSprint}\``,
      args.role ? `- \`role\`: \`${args.role}\`` : null,
      '',
      `Current Stage Status: \`${state.stages[targetStage]?.status || state.currentStage}\` (Circuit retries: ${state.stages[targetStage]?.retryCount || 0}/${state.circuitBreaker.maxRetries}).`,
      `If paused at \`PENDING_HUMAN_APPROVAL\`, execute \`/os-approve\`. If \`CIRCUIT_OPEN_ESCALATED\`, inspect \`remediationPacket\` and resolve failing files before retrying.`,
      dispatchQueue && dispatchQueue.stage === targetStage
        ? `\n## Queued Web UI Dispatch (${dispatchQueue.dispatchedAt || 'latest'} • Track: ${dispatchQueue.track || 'AUTO'})\n${dispatchQueue.directive || ''}`
        : null
    ].filter(Boolean).join('\n');

    return {
      description: promptDef.description,
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }

  if (name === 'os-approve') {
    const targetStage = args.stage || state.pendingCheckpoint?.stage || state.currentStage;
    const decision = args.decision || 'APPROVED';
    const text = [
      `# Workflow: /os-approve`,
      `Execute MCP tool \`os_approve_checkpoint\` to record immutable sign-off:`,
      `- \`projectRoot\`: \`${targetRoot}\``,
      `- \`stage\`: \`${targetStage}\``,
      `- \`decision\`: \`${decision}\``,
      args.notes ? `- \`notes\`: \`${args.notes}\`` : `- \`notes\`: "Reviewed and approved"`,
      '',
      state.pendingCheckpoint
        ? `Pending Checkpoint Digest: \`${state.pendingCheckpoint.digest}\` (${state.pendingCheckpoint.label})`
        : `No active checkpoint pause; tool call will record a pre-approval if valid.`
    ].join('\n');

    return {
      description: promptDef.description,
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }

  // os-evolve-cr
  const crId = args.crId || 'CR-101';
  const toVer = args.toVersion || '(next minor semver)';
  const text = [
    `# Workflow: /os-evolve-cr`,
    `Execute MCP tool \`os_evolve_cr\` to evolve sealed baseline \`${state.semanticVersion}\` without resetting completed stages:`,
    `- \`projectRoot\`: \`${targetRoot}\``,
    `- \`crId\`: \`${crId}\``,
    `- \`fromVersion\`: \`${state.semanticVersion}\``,
    `- \`toVersion\`: \`${toVer}\``,
    args.summary ? `- \`summary\`: \`${args.summary}\`` : null
  ].filter(Boolean).join('\n');

  return {
    description: promptDef.description,
    messages: [{ role: 'user', content: { type: 'text', text } }]
  };
}

function readResourceResult(rawUri, params = {}) {
  const uriStr = String(rawUri || '').trim();
  const qIdx = uriStr.indexOf('?');
  const baseUri = qIdx !== -1 ? uriStr.slice(0, qIdx) : uriStr;
  let queryProject = null;
  if (qIdx !== -1) {
    try {
      const sp = new URLSearchParams(uriStr.slice(qIdx + 1));
      queryProject = sp.get('projectRoot');
    } catch {
      queryProject = null;
    }
  }

  const targetRoot = trackProjectRoot(queryProject || params.projectRoot);

  if (baseUri === 'os://state/current') {
    const state = inspectProjectState(targetRoot, { sprint: params.sprint });
    const dispatchQueue = readPendingDispatchQueue(targetRoot);
    const payload = dispatchQueue ? { ...state, dispatchQueue } : state;
    return {
      contents: [
        {
          uri: baseUri,
          mimeType: 'application/json',
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  }

  if (baseUri === 'os://state/handoffs') {
    const state = inspectProjectState(targetRoot, { sprint: params.sprint });
    const payload = {
      ok: true,
      projectRoot: state.projectRoot,
      projectCode: state.projectCode,
      activeSprint: state.activeSprint,
      mode: state.mode,
      currentStage: state.currentStage,
      pendingCheckpoint: state.pendingCheckpoint,
      handoffQueue: state.handoffQueue,
      pendingHandoffs: state.pendingHandoffs
    };
    return {
      contents: [
        {
          uri: baseUri,
          mimeType: 'application/json',
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  }

  if (baseUri === 'os://audit/trail') {
    const payload = getAuditTrail(targetRoot, { sprint: params.sprint });
    return {
      contents: [
        {
          uri: baseUri,
          mimeType: 'application/json',
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  }

  return null;
}

function sendJsonRpc(message, useContentLength = false) {
  const json = JSON.stringify(message);
  if (useContentLength) {
    const byteLen = Buffer.byteLength(json, 'utf8');
    rawStdoutWrite(`Content-Length: ${byteLen}\r\n\r\n${json}`);
  } else {
    rawStdoutWrite(`${json}\n`);
  }
}

async function handleJsonRpcMessage(msg, useContentLength) {
  if (!msg || typeof msg !== 'object') return;

  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id') && msg.id !== undefined && msg.id !== null;
  const method = String(msg.method || '');

  // Notifications have no `id` and must NOT produce a stdout response
  if (!hasId) {
    return;
  }

  try {
    if (method === 'initialize') {
      sendJsonRpc(
        {
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              prompts: { listChanged: false },
              resources: { subscribe: false, listChanged: false }
            },
            serverInfo: SERVER_INFO
          }
        },
        useContentLength
      );
      return;
    }

    if (method === 'ping') {
      sendJsonRpc({ jsonrpc: '2.0', id: msg.id, result: {} }, useContentLength);
      return;
    }

    if (method === 'tools/list') {
      sendJsonRpc({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS_SPEC } }, useContentLength);
      return;
    }

    if (method === 'tools/call') {
      const toolName = String(msg.params?.name || '');
      const toolArgs = (msg.params && typeof msg.params.arguments === 'object' && msg.params.arguments !== null)
        ? msg.params.arguments
        : {};
      const exists = TOOLS_SPEC.some(t => t.name === toolName);
      if (!exists) {
        sendJsonRpc(
          {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32602, message: `Unknown MCP tool '${toolName}'.` }
          },
          useContentLength
        );
        return;
      }

      const payload = await executeToolCall(toolName, toolArgs);
      sendJsonRpc(
        {
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(payload, null, 2)
              }
            ],
            isError: payload?.ok === false
          }
        },
        useContentLength
      );
      return;
    }

    if (method === 'prompts/list') {
      sendJsonRpc({ jsonrpc: '2.0', id: msg.id, result: { prompts: PROMPTS_SPEC } }, useContentLength);
      return;
    }

    if (method === 'prompts/get') {
      const promptName = String(msg.params?.name || '');
      const promptArgs = (msg.params && typeof msg.params.arguments === 'object' && msg.params.arguments !== null)
        ? msg.params.arguments
        : {};
      const res = getPromptResult(promptName, promptArgs);
      if (!res) {
        sendJsonRpc(
          {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32602, message: `Unknown MCP prompt '${promptName}'.` }
          },
          useContentLength
        );
        return;
      }
      sendJsonRpc({ jsonrpc: '2.0', id: msg.id, result: res }, useContentLength);
      return;
    }

    if (method === 'resources/list') {
      sendJsonRpc({ jsonrpc: '2.0', id: msg.id, result: { resources: RESOURCES_SPEC } }, useContentLength);
      return;
    }

    if (method === 'resources/read') {
      const rawUri = String(msg.params?.uri || '');
      const res = readResourceResult(rawUri, msg.params || {});
      if (!res) {
        sendJsonRpc(
          {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32602, message: `Unknown MCP resource URI '${rawUri}'.` }
          },
          useContentLength
        );
        return;
      }
      sendJsonRpc({ jsonrpc: '2.0', id: msg.id, result: res }, useContentLength);
      return;
    }

    sendJsonRpc(
      {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${method}` }
      },
      useContentLength
    );
  } catch (err) {
    logToStderr(`MCP request '${method}' failed:`, err && err.stack ? err.stack : err);
    sendJsonRpc(
      {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) }
      },
      useContentLength
    );
  }
}

function startStdioServer() {
  let rxBuffer = Buffer.alloc(0);
  let processing = Promise.resolve();
  let embeddedWebUi = null;

  const webUiEnabled =
    process.env.OS_ENABLE_WEB_UI === '1' ||
    String(process.env.OS_ENABLE_WEB_UI || '').toLowerCase() === 'true';

  if (webUiEnabled) {
    try {
      const { startWebUiServer } = require('./web-ui');
      const webUiPort = process.env.OS_WEB_UI_PORT !== undefined ? Number(process.env.OS_WEB_UI_PORT) : 4321;
      startWebUiServer({ projectRoot: trackProjectRoot(), port: webUiPort })
        .then(srv => {
          embeddedWebUi = srv;
          logToStderr(`Web UI control plane listening at ${srv.url} (project=${srv.projectRoot})`);
        })
        .catch(err => {
          logToStderr(`Optional Web UI startup skipped: ${err && err.message ? err.message : err}`);
        });
    } catch (err) {
      logToStderr(`Optional Web UI module load failed: ${err && err.message ? err.message : err}`);
    }
  }

  const drainBuffer = async () => {
    while (rxBuffer.length > 0) {
      const asStr = rxBuffer.toString('utf8');

      if (/^Content-Length:\s*\d+/i.test(asStr)) {
        const headerEnd = rxBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = rxBuffer.slice(0, headerEnd).toString('utf8');
        const lenMatch = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!lenMatch) {
          rxBuffer = rxBuffer.slice(headerEnd + 4);
          continue;
        }
        const contentLen = parseInt(lenMatch[1], 10);
        const totalNeed = headerEnd + 4 + contentLen;
        if (rxBuffer.length < totalNeed) return;
        const bodyJson = rxBuffer.slice(headerEnd + 4, totalNeed).toString('utf8');
        rxBuffer = rxBuffer.slice(totalNeed);
        try {
          const parsed = JSON.parse(bodyJson);
          await handleJsonRpcMessage(parsed, true);
        } catch (err) {
          logToStderr('Failed to parse Content-Length JSON-RPC frame:', err.message);
        }
        continue;
      }

      const nlIdx = rxBuffer.indexOf('\n');
      if (nlIdx === -1) return;
      const line = rxBuffer.slice(0, nlIdx).toString('utf8').replace(/\r$/, '').trim();
      rxBuffer = rxBuffer.slice(nlIdx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        await handleJsonRpcMessage(parsed, false);
      } catch (err) {
        logToStderr('Failed to parse NDJSON JSON-RPC frame:', err.message);
      }
    }
  };

  process.stdin.on('data', chunk => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    rxBuffer = Buffer.concat([rxBuffer, buf]);
    processing = processing.then(drainBuffer);
  });

  process.stdin.on('end', () => {
    processing
      .finally(() => (embeddedWebUi ? embeddedWebUi.close().catch(() => {}) : Promise.resolve()))
      .finally(() => process.exit(0));
  });
}

if (require.main === module) {
  startStdioServer();
}

module.exports = {
  SERVER_INFO,
  PROTOCOL_VERSION,
  TOOLS_SPEC,
  PROMPTS_SPEC,
  RESOURCES_SPEC,
  executeToolCall,
  getPromptResult,
  readResourceResult
};
