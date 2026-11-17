#!/usr/bin/env node
'use strict';

/**
 * 🎛️ InnovaDigits Interactive Orchestrator CLI (`bin/orchestrator-cli.js` v4.3.0)
 * Zero-dependency (Node.js built-ins: `readline/promises`, `path`) terminal orchestrator.
 *
 * Features:
 *   - 11-Stage SDLC Progress Bar (`1..10` Main Pipeline + `11. DELTA_EVOLVE` CR Track)
 *   - Human-in-the-Loop Checkpoints (`--approve`), 3-Strike Circuit Breaker Telemetry, & Role Inbox (`pendingHandoffs`)
 *   - Controlled CR Delta Evolution (`--cr=<CR-ID>`) without resetting sealed features
 *   - Decoupled Add-on Plugin Registry inspection (`--list-addons`)
 *
 * Scriptable Non-Interactive Flags:
 *   --project=<dir>  --sprint=<ID>  --mode=SOLO_FDE|TEAM_RBAC  --role=BA|TECH_LEAD|DEV|SECURITY|QA|PM
 *   --stage=<ID>     --actor=<name> --status | --directive | --advance | --approve | --cr=<ID>
 *   --list-addons    --qa-pack | --json | --help
 */

const path = require('path');
const readline = require('readline/promises');
const { startWebUiServer, detectLifecycleScope } = require('./web-ui');
const {
  STAGE_DEFINITIONS,
  VALID_MODES,
  VALID_ROLES,
  inspectProjectState,
  setOrchestratorMode,
  buildStageDirective,
  runGateAndAdvance,
  approveCheckpoint,
  evolveChangeRequest,
  generateQaPack
} = require('./lib/orchestrator-state');
const {
  isAddonEnabled,
  listLoadedAddons
} = require('./lib/orchestrator-plugins');
const {
  inspectPmtoolBoard,
  pushWbsWave
} = require('./lib/pmtool-adapter');
const { expandCliPath } = require('./lib/hub-utils');

function stripOuterQuotes(v) {
  return String(v || '').replace(/^["']|["']$/g, '').trim();
}

function parseCliArgs(argv) {
  const opts = {
    projectRoot: process.cwd(),
    sprint: undefined,
    mode: undefined,
    role: undefined,
    stage: undefined,
    actor: undefined,
    decision: 'APPROVED',
    notes: '',
    crId: undefined,
    fromVersion: undefined,
    toVersion: undefined,
    targetId: undefined,
    was: undefined,
    current: undefined,
    summary: undefined,
    requireHumanCheckpoints: undefined,
    resetCircuit: false,
    status: false,
    directive: false,
    advance: false,
    approve: false,
    listAddons: false,
    qaPack: false,
    ui: false,
    port: 4321,
    json: false,
    help: false
  };

  for (const arg of argv) {
    if (arg.startsWith('--project=')) {
      opts.projectRoot = path.resolve(expandCliPath(arg.slice('--project='.length)));
    } else if (arg.startsWith('--sprint=')) {
      opts.sprint = arg.slice('--sprint='.length).trim();
    } else if (arg.startsWith('--mode=')) {
      opts.mode = arg.slice('--mode='.length).trim().toUpperCase();
    } else if (arg.startsWith('--role=')) {
      opts.role = arg.slice('--role='.length).trim().toUpperCase();
    } else if (arg.startsWith('--stage=')) {
      opts.stage = arg.slice('--stage='.length).trim().toUpperCase();
    } else if (arg.startsWith('--actor=')) {
      opts.actor = stripOuterQuotes(arg.slice('--actor='.length));
    } else if (arg.startsWith('--decision=')) {
      opts.decision = stripOuterQuotes(arg.slice('--decision='.length)).toUpperCase();
    } else if (arg.startsWith('--notes=')) {
      opts.notes = stripOuterQuotes(arg.slice('--notes='.length));
    } else if (arg.startsWith('--cr=')) {
      opts.crId = stripOuterQuotes(arg.slice('--cr='.length));
    } else if (arg.startsWith('--from=')) {
      opts.fromVersion = stripOuterQuotes(arg.slice('--from='.length));
    } else if (arg.startsWith('--to=')) {
      opts.toVersion = stripOuterQuotes(arg.slice('--to='.length));
    } else if (arg.startsWith('--target=')) {
      opts.targetId = stripOuterQuotes(arg.slice('--target='.length));
    } else if (arg.startsWith('--was=')) {
      opts.was = stripOuterQuotes(arg.slice('--was='.length));
    } else if (arg.startsWith('--current=')) {
      opts.current = stripOuterQuotes(arg.slice('--current='.length));
    } else if (arg.startsWith('--summary=')) {
      opts.summary = stripOuterQuotes(arg.slice('--summary='.length));
    } else if (arg === '--no-checkpoints') {
      opts.requireHumanCheckpoints = false;
    } else if (arg === '--reset-circuit') {
      opts.resetCircuit = true;
    } else if (arg === '--status') {
      opts.status = true;
    } else if (arg === '--directive') {
      opts.directive = true;
    } else if (arg === '--advance') {
      opts.advance = true;
    } else if (arg === '--approve') {
      opts.approve = true;
    } else if (arg === '--list-addons') {
      opts.listAddons = true;
    } else if (arg === '--qa-pack') {
      opts.qaPack = true;
    } else if (arg === '--ui') {
      opts.ui = true;
    } else if (arg.startsWith('--port=')) {
      const p = Number(arg.slice('--port='.length));
      if (Number.isInteger(p) && p >= 0 && p <= 65535) opts.port = p;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function renderProgressBar(passedCount, totalCount) {
  const filled = Math.max(0, Math.min(totalCount, passedCount));
  const empty = Math.max(0, totalCount - filled);
  return `[${'#'.repeat(filled)}${'.'.repeat(empty)}] ${passedCount}/${totalCount}`;
}

function renderDashboard(state, activeRole) {
  const bar = renderProgressBar(state.mainStagesPassed || 0, state.mainStagesTotal || 10);
  const deltaStatus = state.stages?.DELTA_EVOLVE?.status || 'STANDBY';
  const lines = [
    '',
    '\x1b[1m\x1b[36m==============================================================================\x1b[0m',
    `\x1b[1m  InnovaDigits AI Engineering OS — Orchestrator Console (v4.3.0)\x1b[0m`,
    '\x1b[36m==============================================================================\x1b[0m',
    `  Project Root : ${state.projectRoot}`,
    `  Project Code : \x1b[1m${state.projectCode}\x1b[0m | Sprint: \x1b[1m${state.activeSprint}\x1b[0m | Version: ${state.semanticVersion} | Sealed: ${state.releaseSealed ? 'YES' : 'NO'}`,
    `  Mode / Role  : \x1b[33m${state.mode}\x1b[0m${state.mode === 'TEAM_RBAC' ? ` (Role: \x1b[1m${activeRole || 'UNSET'}\x1b[0m)` : ''} | Human Checkpoints: ${state.requireHumanCheckpoints ? 'ON' : 'OFF'}`,
    `  Pipeline Bar : \x1b[32m${bar} Main Stages\x1b[0m | Current: \x1b[1m${state.currentStage}\x1b[0m | CR Delta: ${deltaStatus} (${(state.deltaHistory || []).length})`,
    `  Features     : ${state.featuresSummary.count} (Gate A: ${state.featuresSummary.gateAReadyCount}/${state.featuresSummary.count}, Gate B: ${state.featuresSummary.gateBReadyCount}/${state.featuresSummary.count})`,
    '------------------------------------------------------------------------------',
    '  11-Stage SDLC Progress:'
  ];

  for (const def of STAGE_DEFINITIONS) {
    const info = state.stages[def.id] || { status: 'PENDING', retryCount: 0, maxRetries: 3 };
    let badge = '\x1b[90m[WAIT]\x1b[0m';
    if (info.status === 'PASSED') badge = '\x1b[32m[PASS]\x1b[0m';
    else if (info.status === 'PENDING_HUMAN_APPROVAL') badge = '\x1b[35m[APPR]\x1b[0m';
    else if (info.status === 'CIRCUIT_OPEN_ESCALATED') badge = '\x1b[31m[OPEN]\x1b[0m';
    else if (info.status === 'BLOCKED') badge = '\x1b[31m[FAIL]\x1b[0m';
    else if (def.id === state.currentStage) badge = '\x1b[33m[NEXT]\x1b[0m';
    else if (info.status === 'STANDBY') badge = '\x1b[90m[STBY]\x1b[0m';

    const retryNote = info.retryCount > 0 ? ` \x1b[31m[retries: ${info.retryCount}/${info.maxRetries}]\x1b[0m` : '';
    const idxLabel = String(def.index).padStart(2, ' ');
    lines.push(`    ${idxLabel}. ${badge} ${def.id.padEnd(19)} (${def.ownerRole.padEnd(9)}) — ${def.title}${retryNote}`);
  }

  if (state.pendingCheckpoint) {
    lines.push('------------------------------------------------------------------------------');
    lines.push(
      `  \x1b[35m⏸ Active Human Checkpoint:\x1b[0m ${state.pendingCheckpoint.stage} — ${state.pendingCheckpoint.label} (Role: ${state.pendingCheckpoint.requiredRole}, Digest: ${state.pendingCheckpoint.digest})`
    );
  }

  if (Array.isArray(state.pendingHandoffs) && state.pendingHandoffs.length > 0) {
    lines.push('------------------------------------------------------------------------------');
    lines.push(`  \x1b[36mRole Inbox (Pending Handovers: ${state.pendingHandoffs.length}):\x1b[0m`);
    for (const h of state.pendingHandoffs.slice(0, 6)) {
      lines.push(`    - [${h.role}] (${h.type}) ${h.summary}`);
    }
  }

  const openCircuitKeys = Object.keys(state.circuitBreaker?.openStages || {});
  if (openCircuitKeys.length > 0) {
    lines.push('------------------------------------------------------------------------------');
    lines.push(`  \x1b[31m🔴 Open Circuit Breakers (${openCircuitKeys.length}):\x1b[0m ${openCircuitKeys.join(', ')}`);
  }

  lines.push('------------------------------------------------------------------------------');
  const addonItems = (state.addons || []).map(a => `${a.id}:${a.enabled ? 'ON' : 'OFF'}`);
  lines.push(`  Add-on Plugins (${(state.addons || []).length}): ${addonItems.join(', ') || 'none'}`);

  if (state.lastDiagnostics && Array.isArray(state.lastDiagnostics.violations) && state.lastDiagnostics.violations.length > 0) {
    lines.push('------------------------------------------------------------------------------');
    lines.push(`  \x1b[31mLast Gate Diagnostics (${state.lastDiagnostics.stage}):\x1b[0m ${state.lastDiagnostics.violations.length} violation(s)`);
    for (const v of state.lastDiagnostics.violations.slice(0, 5)) {
      lines.push(`    - [${v.rule}] ${v.file}: ${v.message}`);
    }
  }
  lines.push('\x1b[36m==============================================================================\x1b[0m');
  return lines.join('\n');
}

async function askSafe(rl, prompt) {
  try {
    return (await rl.question(prompt)).trim();
  } catch {
    return 'q';
  }
}

async function runInteractiveLoop(opts) {
  let activeRole = opts.role || 'BA';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    let keepRunning = true;
    while (keepRunning) {
      const state = inspectProjectState(opts.projectRoot, {
        sprint: opts.sprint,
        mode: opts.mode,
        requireHumanCheckpoints: opts.requireHumanCheckpoints
      });
      console.log(renderDashboard(state, activeRole));
      console.log('  Actions:');
      console.log('    [1] Refresh Status      [2] Print Stage Directive     [3] Run Gate & Advance');
      console.log('    [4] Approve Checkpoint  [5] Trigger CR Evolution      [6] Switch Mode / Role');
      console.log('    [7] Add-ons / PMTool    [8] Generate QA Pack          [9] Launch Web UI       [q] Quit');

      const choice = (await askSafe(rl, '\n  Select action [1-9, q]: ')).toLowerCase();
      if (choice === 'q' || choice === 'quit' || choice === 'exit') {
        keepRunning = false;
        break;
      }

      if (choice === '1') {
        continue;
      } else if (choice === '2') {
        const res = buildStageDirective(opts.projectRoot, opts.stage, opts.sprint, {
          mode: state.mode,
          role: activeRole,
          actor: opts.actor
        });
        console.log('\n' + (res.allowed ? res.directive : `\x1b[31m${res.message}\x1b[0m`) + '\n');
      } else if (choice === '3') {
        const res = await runGateAndAdvance(opts.projectRoot, {
          stage: opts.stage,
          sprint: opts.sprint,
          mode: state.mode,
          role: activeRole,
          actor: opts.actor,
          requireHumanCheckpoints: opts.requireHumanCheckpoints,
          resetCircuit: opts.resetCircuit
        });
        if (res.ok) {
          console.log(`\n\x1b[32m${res.message}\x1b[0m`);
        } else {
          console.log(`\n\x1b[31mGate Blocked:\x1b[0m ${res.message || `${(res.violations || []).length} violation(s)`}`);
          if (res.selfHealingDirective) {
            console.log('\n' + res.selfHealingDirective);
          }
        }
      } else if (choice === '4') {
        const targetChk = state.pendingCheckpoint?.stage || state.currentStage;
        const notes = await askSafe(rl, `  Approval notes for '${targetChk}' [optional]: `);
        if (notes.toLowerCase() === 'q') break;
        const res = await approveCheckpoint(opts.projectRoot, {
          stage: targetChk,
          decision: 'APPROVED',
          notes,
          actor: opts.actor,
          sprint: opts.sprint,
          mode: state.mode,
          role: activeRole
        });
        console.log('\n' + (res.ok ? `\x1b[32m${res.message}\x1b[0m` : `\x1b[31m${res.message}\x1b[0m`));
      } else if (choice === '5') {
        const crId = await askSafe(rl, '  Enter CR ID (e.g. CR-101): ');
        if (!crId || crId.toLowerCase() === 'q') continue;
        const summary = await askSafe(rl, '  Enter CR summary: ');
        if (summary.toLowerCase() === 'q') continue;
        const res = await evolveChangeRequest(opts.projectRoot, {
          crId,
          summary,
          sprint: opts.sprint,
          mode: state.mode,
          role: activeRole,
          actor: opts.actor
        });
        console.log('\n' + (res.ok ? `\x1b[32m${res.message}\x1b[0m` : `\x1b[31m${res.message}\x1b[0m`));
      } else if (choice === '6') {
        const nextModeInput = await askSafe(rl, `  Enter mode (${[...VALID_MODES].join(' / ')}) [${state.mode}]: `);
        if (nextModeInput.toLowerCase() === 'q') break;
        const nextMode = nextModeInput.toUpperCase() || state.mode;
        if (VALID_MODES.has(nextMode)) {
          setOrchestratorMode(opts.projectRoot, nextMode, opts.sprint);
          opts.mode = nextMode;
          console.log(`  ✔ Mode updated to ${nextMode}`);
        } else {
          console.log(`  ✖ Unknown mode '${nextMode}'`);
        }
        if (nextMode === 'TEAM_RBAC') {
          const nextRoleInput = await askSafe(rl, `  Enter active role (${[...VALID_ROLES].join(' / ')}) [${activeRole}]: `);
          if (nextRoleInput.toLowerCase() === 'q') break;
          const nextRole = nextRoleInput.toUpperCase() || activeRole;
          if (VALID_ROLES.has(nextRole)) {
            activeRole = nextRole;
            console.log(`  ✔ Active role set to ${activeRole}`);
          } else {
            console.log(`  ✖ Unknown role '${nextRole}'`);
          }
        }
      } else if (choice === '7') {
        const addonsRes = listLoadedAddons(opts.projectRoot);
        console.log('\n' + JSON.stringify(addonsRes.addons, null, 2));
        if (isAddonEnabled(opts.projectRoot, 'pmtool')) {
          const board = await inspectPmtoolBoard(opts.projectRoot, { sprint: opts.sprint });
          console.log(`\n  PMTool Mode: ${board.mode} | Counts: ${JSON.stringify(board.counts)}`);
          const preview = await pushWbsWave(opts.projectRoot, { sprint: opts.sprint, dryRun: true });
          console.log(`  Dry-Run: ${preview.message}`);
        }
      } else if (choice === '8') {
        const qaRes = generateQaPack(opts.projectRoot, {
          sprint: opts.sprint,
          mode: state.mode,
          role: activeRole,
          actor: opts.actor
        });
        console.log('\n' + JSON.stringify(qaRes, null, 2));
      } else if (choice === '9') {
        const uiSrv = await startWebUiServer({
          projectRoot: opts.projectRoot,
          sprint: opts.sprint,
          port: opts.port
        });
        console.log(`\n  🌐 Web UI running at ${uiSrv.url}`);
        await askSafe(rl, '  Press ENTER to stop Web UI server and return to menu...');
        await uiSrv.close();
      }
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(`
InnovaDigits AI Engineering OS — Orchestrator Console (v4.3.0)

Usage:
  node bin/orchestrator-cli.js [options]

Options:
  --project=<dir>                            Target engineering repository root (default: cwd)
  --sprint=<ID>                              Sprint filter (e.g. S1, S4)
  --mode=SOLO_FDE|TEAM_RBAC                  Persist or apply execution mode
  --role=BA|TECH_LEAD|DEV|SECURITY|QA|PM     Active RBAC role for TEAM_RBAC mode
  --stage=<STAGE_ID>                         Explicit stage override
  --actor=<name>                             Explicit operator/reviewer actor identity
  --status                                   Print 11-stage status dashboard and exit
  --directive                                Print stage-isolated AI prompt directive and exit
  --advance                                  Execute active stage gate and advance .os-state.json
  --approve                                  Approve pending Human Checkpoint (--decision=APPROVED|REJECTED, --notes=...)
  --cr=<CR-ID>                               Evolve sealed baseline via DELTA_EVOLVE (--from, --to, --target, --summary)
  --list-addons                              List built-in and custom add-on plugins (.ai/orchestrator.config.json)
  --qa-pack                                  Generate OpenAPI + Postman + Pentest + Cycle Handoff pack
  --ui                                       Launch Unified Dual-Core Web Control Plane on http://127.0.0.1:4321
  --port=<N>                                 Port for --ui server (default: 4321)
  --no-checkpoints                           Bypass human checkpoint pauses for automated batch execution
  --reset-circuit                            Force re-evaluation of an open circuit breaker stage
  --json                                     Emit machine-readable JSON output
  --help, -h                                 Show help
`);
    process.exit(0);
  }

  if (
    opts.mode &&
    !opts.status &&
    !opts.directive &&
    !opts.advance &&
    !opts.approve &&
    !opts.crId &&
    !opts.listAddons &&
    !opts.qaPack
  ) {
    setOrchestratorMode(opts.projectRoot, opts.mode, opts.sprint, {
      requireHumanCheckpoints: opts.requireHumanCheckpoints
    });
  }

  if (opts.listAddons) {
    const res = listLoadedAddons(opts.projectRoot);
    if (opts.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`\nLoaded Add-on Plugins (${res.addons.length}) [config: ${res.configPath}, exists: ${res.configExists}]:`);
      for (const a of res.addons) {
        console.log(`  - ${a.id} (${a.enabled ? 'ENABLED' : 'DISABLED'}) [${a.builtin ? 'builtin' : 'workspace'}] hooks=[${a.hooks.join(', ')}] source=${a.source}${a.loadError ? ` ERROR=${a.loadError}` : ''}`);
      }
    }
    process.exit(0);
  }

  if (opts.status) {
    const state = inspectProjectState(opts.projectRoot, {
      sprint: opts.sprint,
      mode: opts.mode,
      persistMode: Boolean(opts.mode),
      requireHumanCheckpoints: opts.requireHumanCheckpoints
    });
    if (opts.json) console.log(JSON.stringify(state, null, 2));
    else console.log(renderDashboard(state, opts.role));
    process.exit(0);
  }

  if (opts.directive) {
    const res = buildStageDirective(opts.projectRoot, opts.stage, opts.sprint, {
      mode: opts.mode,
      role: opts.role,
      actor: opts.actor
    });
    if (opts.json) console.log(JSON.stringify(res, null, 2));
    else console.log(res.allowed ? res.directive : `ERROR [${res.code}]: ${res.message}`);
    process.exit(res.allowed ? 0 : 1);
  }

  if (opts.approve) {
    const res = await approveCheckpoint(opts.projectRoot, {
      stage: opts.stage,
      decision: opts.decision,
      actor: opts.actor,
      notes: opts.notes,
      sprint: opts.sprint,
      mode: opts.mode,
      role: opts.role
    });
    if (opts.json) console.log(JSON.stringify(res, null, 2));
    else console.log(res.ok ? res.message : `APPROVAL_FAILED [${res.code}]: ${res.message}`);
    process.exit(res.ok ? 0 : 1);
  }

  if (opts.crId) {
    const res = await evolveChangeRequest(opts.projectRoot, {
      crId: opts.crId,
      fromVersion: opts.fromVersion,
      toVersion: opts.toVersion,
      targetId: opts.targetId,
      was: opts.was,
      current: opts.current,
      summary: opts.summary,
      sprint: opts.sprint,
      mode: opts.mode,
      role: opts.role,
      actor: opts.actor
    });
    if (opts.json) console.log(JSON.stringify(res, null, 2));
    else console.log(res.ok ? res.message : `EVOLVE_FAILED [${res.code}]: ${res.message}`);
    process.exit(res.ok ? 0 : 1);
  }

  if (opts.advance) {
    const res = await runGateAndAdvance(opts.projectRoot, {
      stage: opts.stage,
      sprint: opts.sprint,
      mode: opts.mode,
      role: opts.role,
      actor: opts.actor,
      requireHumanCheckpoints: opts.requireHumanCheckpoints,
      resetCircuit: opts.resetCircuit
    });
    if (opts.json) console.log(JSON.stringify(res, null, 2));
    else console.log(res.ok ? res.message : `GATE_FAILED: ${res.message || res.selfHealingDirective}`);
    process.exit(res.ok ? 0 : 1);
  }

  if (opts.qaPack) {
    const res = generateQaPack(opts.projectRoot, {
      sprint: opts.sprint,
      mode: opts.mode,
      role: opts.role,
      actor: opts.actor
    });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  }

  if (opts.ui) {
    const uiSrv = await startWebUiServer({
      projectRoot: opts.projectRoot,
      sprint: opts.sprint,
      port: opts.port
    });
    const scope = detectLifecycleScope(uiSrv.projectRoot, uiSrv.hubRoot, 'AUTO');
    console.log(`🌐 Unified Dual-Core Web UI running at ${uiSrv.url} (Scope: ${scope})`);
    const shutdown = async () => {
      await uiSrv.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  await runInteractiveLoop(opts);
}

main().catch(err => {
  console.error(`ORCHESTRATOR_CLI_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
