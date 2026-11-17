#!/usr/bin/env node

/**
 * 📊 InnovaDigits Governed Telemetry Logger (v3.9.4)
 * Records execution telemetry into .ai/telemetry/runs.jsonl with strict status and mode validation.
 *
 * Usage:
 *   node bin/log-telemetry.js --feature=FEATURE-001 --mode="Mode 0" --status=PASS --files=4 --model="gemini-2.5-pro" --tokens-in=1200 --tokens-out=350
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VALID_STATUSES = ['PASS', 'BLOCKED', 'ACTION_REQ', 'REMEDIATION_REQUIRED', 'HEALTHY'];
const VALID_MODES = [
  'Mode 0', 'Mode 1', 'Mode 2', 'Mode 3', 'Mode 4', 'Mode 5', 'Mode 6', 'Mode 7', 'Mode 8', 'Mode 9',
  'implement', 'feature', 'bug', 'review', 'pentest', 'pentest-audit', 'pentest-postman', 'compliance', 'direct', 'devops',
  'handoff', 'cycle-handoff', 'sprint-plan', 'seed-feature', 'client-sdk', 'drift-radar',
  'arch-visualize', 'predict-perf', 'refactor-legacy', 'apply-delta', 'eng-gate', 'bcas-init', 'review-spec', 'pmtool-sync', 'release'
];

// 1. Parse CLI Arguments
const args = process.argv.slice(2);
function getArg(prefix, fallback = '') {
  const match = args.find(a => a.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1).trim() : fallback;
}

const feature = getArg('--feature', 'CORE-ENGINEERING');
const rawMode = getArg('--mode', 'direct');
const rawStatus = getArg('--status', 'PASS').toUpperCase();
const filesChanged = parseInt(getArg('--files', '0'), 10) || 0;
const model = getArg('--model', 'antigravity-gemini');
const tokensIn = parseInt(getArg('--tokens-in', '0'), 10) || 0;
const tokensAnalysis = parseInt(getArg('--tokens-analysis', '0'), 10) || 0;
const tokensOut = parseInt(getArg('--tokens-out', '0'), 10) || 0;

// Validate Status
if (!VALID_STATUSES.includes(rawStatus)) {
  console.error(`❌ Invalid status: '${rawStatus}'. Must be one of: ${VALID_STATUSES.join(', ')}`);
  process.exit(1);
}

// Validate Mode
const normalizedMode = VALID_MODES.find(m => m.toLowerCase() === rawMode.toLowerCase()) || rawMode;
if (!VALID_MODES.includes(normalizedMode)) {
  console.error(`❌ Invalid mode: '${rawMode}'. Must be one of: ${VALID_MODES.join(', ')}`);
  process.exit(1);
}

// 2. Resolve Username
let username = 'developer';
try {
  const gitUser = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (gitUser) {
    username = gitUser.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  }
} catch {
  username = process.env.USER || process.env.LOGNAME || process.env.USERNAME || 'fotta';
}

// 3. Resolve Telemetry Directory & File
const projectRoot = process.cwd();
const telemetryDir = path.join(projectRoot, '.ai', 'telemetry');
if (!fs.existsSync(telemetryDir)) {
  fs.mkdirSync(telemetryDir, { recursive: true });
}

const runsJsonlPath = path.join(telemetryDir, 'runs.jsonl');

const record = {
  ts: new Date().toISOString(),
  user: username,
  feature,
  mode: normalizedMode,
  status: rawStatus,
  files_changed: filesChanged,
  model,
  tokens: {
    input: tokensIn,
    analysis: tokensAnalysis,
    output: tokensOut,
    total: tokensIn + tokensAnalysis + tokensOut
  }
};

fs.appendFileSync(runsJsonlPath, JSON.stringify(record) + '\n', 'utf8');
console.log(`✅ Telemetry logged to ${path.relative(projectRoot, runsJsonlPath)}: status=${rawStatus} feature=${feature} mode=${normalizedMode}`);

