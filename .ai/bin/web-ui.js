#!/usr/bin/env node
'use strict';

/**
 * 🌐 InnovaDigits Unified Dual-Core Web Control Plane (`bin/web-ui.js` v4.3.0)
 * Zero external dependencies — Node.js built-in modules ONLY (`http`, `fs`, `path`, `crypto`, `child_process`, `url`).
 *
 * Unifies:
 *   - Track A (`BA_SDLC`): Stages 1..5 (`INTAKE` .. `GATE_A_SEAL`) + `DELTA_EVOLVE`
 *   - Track B (`stack-aware`): Stages 6..10 (`GATE_B_ENG` .. `RELEASE_SEAL`)
 *   - Auto-detects `BA_ONLY_HUB` vs `FULL_LIFECYCLE`
 *
 * Security & Governance Invariants:
 *   - Zero LLM calls from Web UI (deterministic gates, approvals & Antigravity/Cursor dispatch bridge only)
 *   - Strictly binds to `127.0.0.1` (default port `4321`; refuses non-loopback hosts)
 *   - Generates CSPRNG 256-bit `sessionToken` on startup (never stored in `localStorage`)
 *   - Validates `Origin` header + timing-safe `X-Session-Token` on all mutating `POST` routes
 *   - Serializes `.os-state.json` & `.ai/.dispatch-queue.json` via `withStateLock()` + atomic `.tmp` rename
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { URL } = require('url');

const {
  STAGE_DEFINITIONS,
  VALID_ROLES,
  inspectProjectState,
  setOrchestratorMode,
  buildStageDirective,
  runGateAndAdvance,
  approveCheckpoint,
  evolveChangeRequest,
  getAuditTrail,
  scanAntiPlaceholders,
  runHubVerifier,
  resolveProjectRootAndHub,
  withStateLock,
  listWorkspaces,
  registerWorkspace,
  bootstrapProjectWorkspace,
  attachEngineeringOsToRepo
} = require('./lib/orchestrator-state');
const {
  expandCliPath,
  parseFeatureDocument,
  evaluateGateBChecks,
  scanHubAndLegacyFeatures,
  splitMarkdownRow,
  stripMdFormatting
} = require('./lib/hub-utils');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4321;
const MAX_POST_BYTES = 65536;
const MAX_INTAKE_UPLOAD_BYTES = 36 * 1024 * 1024;
const ALLOWED_INTAKE_EXTS = new Set(['.md', '.txt', '.pdf', '.docx', '.xlsx', '.sql']);
const POLL_INTERVAL_MS = 750;
const HEARTBEAT_INTERVAL_MS = 15000;
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::ffff:127.0.0.1', '::1']);
const ORDERED_ROLES = Array.from(VALID_ROLES);
const TRACK_A_IDS = ['INTAKE', 'CORE_BOOTSTRAP', 'SPRINT_PLAN', 'SPRINT_SPECS', 'GATE_A_SEAL', 'DELTA_EVOLVE'];
const TRACK_B_IDS = ['GATE_B_ENG', 'DEV_IMPLEMENT', 'SECURITY_PERF_GATE', 'QA_HANDOFF', 'RELEASE_SEAL'];
const LIFECYCLE_MODES = new Set(['AUTO', 'BA_ONLY_HUB', 'FULL_LIFECYCLE']);

function parseCliArgs(argv) {
  const opts = {
    projectRoot: null,
    explicitTarget: false,
    sprint: undefined,
    port: DEFAULT_PORT,
    lifecycleScope: 'AUTO',
    open: true,
    help: false
  };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--no-open') {
      opts.open = false;
    } else if (arg === '--open') {
      opts.open = true;
    } else if (arg.startsWith('--project=')) {
      opts.projectRoot = expandCliPath(arg.slice('--project='.length));
      opts.explicitTarget = true;
    } else if (arg.startsWith('--hub=')) {
      opts.projectRoot = expandCliPath(arg.slice('--hub='.length));
      opts.explicitTarget = true;
    } else if (arg.startsWith('--sprint=')) {
      opts.sprint = arg.slice('--sprint='.length).trim() || undefined;
    } else if (arg === '--ba-only') {
      opts.lifecycleScope = 'BA_ONLY_HUB';
    } else if (arg.startsWith('--lifecycle=')) {
      const val = arg.slice('--lifecycle='.length).trim().toUpperCase();
      if (LIFECYCLE_MODES.has(val)) {
        opts.lifecycleScope = val;
      }
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error(`Invalid --port value: '${arg.slice('--port='.length)}'. Expected integer 0..65535.`);
      }
      opts.port = parsed;
    } else if (!arg.startsWith('--') && !opts.positionalSeen) {
      opts.projectRoot = expandCliPath(arg);
      opts.explicitTarget = true;
      opts.positionalSeen = true;
    }
  }
  if (opts.projectRoot) {
    opts.projectRoot = path.resolve(opts.projectRoot);
  }
  return opts;
}

function openDefaultBrowser(targetUrl) {
  try {
    let child;
    if (process.platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '', targetUrl], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
    } else if (process.platform === 'darwin') {
      child = spawn('open', [targetUrl], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('xdg-open', [targetUrl], { detached: true, stdio: 'ignore' });
    }
    if (child) {
      child.on('error', () => {});
      if (typeof child.unref === 'function') child.unref();
    }
    return true;
  } catch {
    return false;
  }
}

function isLoopbackRemote(remoteAddress) {
  if (!remoteAddress) return false;
  return LOOPBACK_ADDRS.has(String(remoteAddress).trim());
}

function timingSafeTokenEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function setCommonSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, statusCode, payload) {
  setCommonSecurityHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2) + '\n');
}

function writeJsonAtomic(filePath, dataObj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const payload = JSON.stringify(dataObj, null, 2) + '\n';
  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore temp cleanup failure
    }
    throw err;
  }
}

function readRawBufferBody(req, maxBytes = MAX_INTAKE_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', chunk => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settled = true;
        const err = new Error(`Request body exceeded ${maxBytes} bytes.`);
        err.statusCode = 413;
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    req.on('error', err => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

async function readJsonBody(req, maxBytes = MAX_POST_BYTES) {
  const buf = await readRawBufferBody(req, maxBytes);
  const raw = buf.toString('utf8').trim();
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error('Malformed JSON request body.');
    err.statusCode = 400;
    err.code = 'INVALID_JSON';
    throw err;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const err = new Error('JSON body must be an object.');
    err.statusCode = 400;
    err.code = 'INVALID_JSON';
    throw err;
  }
  return parsed;
}

function formatSseFrame(eventName, dataObj) {
  return `event: ${eventName}\ndata: ${JSON.stringify(dataObj)}\n\n`;
}

function copyToSystemClipboard(text) {
  const candidates =
    process.platform === 'win32'
      ? [{ cmd: 'clip', args: [] }]
      : process.platform === 'darwin'
        ? [{ cmd: 'pbcopy', args: [] }]
        : [
            { cmd: 'wl-copy', args: [] },
            { cmd: 'xclip', args: ['-selection', 'clipboard'] },
            { cmd: 'xsel', args: ['--clipboard', '--input'] }
          ];

  for (const item of candidates) {
    try {
      const res = spawnSync(item.cmd, item.args, {
        input: String(text || ''),
        encoding: 'utf8',
        stdio: ['pipe', 'ignore', 'ignore'],
        timeout: 800
      });
      if (res && res.status === 0 && !res.error) {
        return { copied: true, tool: item.cmd };
      }
    } catch {
      // try next clipboard provider
    }
  }
  return { copied: false, tool: null };
}

function safeReadUtf8(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

function detectLifecycleScope(absProject, hubRoot, requestedScope, persistedScope) {
  const explicit = String(requestedScope || '').toUpperCase().trim();
  if (explicit === 'BA_ONLY_HUB' || explicit === 'FULL_LIFECYCLE') {
    return explicit;
  }
  const stored = String(persistedScope || '').toUpperCase().trim();
  if (stored === 'BA_ONLY_HUB' || stored === 'FULL_LIFECYCLE') {
    return stored;
  }
  const hasAiOrStack =
    fs.existsSync(path.join(absProject, '.ai')) ||
    fs.existsSync(path.join(absProject, 'stack.json'));
  const codebaseDirs = ['app', 'Modules', 'src', 'resources', 'database', 'packages', 'backend', 'frontend'];
  const hasCodebaseDir = codebaseDirs.some(d => fs.existsSync(path.join(absProject, d)));
  let hasRootProjectFile = false;
  if (fs.existsSync(absProject)) {
    try {
      hasRootProjectFile = fs
        .readdirSync(absProject)
        .some(f => f.endsWith('.sln') || f === 'composer.json' || f === 'package.json');
    } catch {
      hasRootProjectFile = false;
    }
  }
  const hasCodebase = absProject !== hubRoot && (hasCodebaseDir || hasRootProjectFile);
  return hasAiOrStack && hasCodebase ? 'FULL_LIFECYCLE' : 'BA_ONLY_HUB';
}

function listIntakeFiles(hubRoot) {
  const intakeDir = path.join(hubRoot, '_intake');
  if (!fs.existsSync(intakeDir)) return [];
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(intakeDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
  for (const ent of entries) {
    if (!ent.isFile() || ent.name.endsWith('.tmp')) continue;
    const full = path.join(intakeDir, ent.name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    out.push({
      name: ent.name,
      ext: path.extname(ent.name).toLowerCase(),
      sizeBytes: st.size,
      modifiedAt: new Date(st.mtimeMs).toISOString()
    });
  }
  return out;
}

function enumerateWindowsDrives() {
  const drives = [];
  for (let code = 65; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(drive)) {
        drives.push({
          name: drive,
          path: drive,
          isDrive: true,
          hasContextHub: false,
          hasAiOs: false,
          hasCodebase: false
        });
      }
    } catch {
      // ignore unready drive
    }
  }
  return drives;
}

function browseFilesystemDirectory(rawDir, activeProjectRoot) {
  const rawStr = rawDir === undefined || rawDir === null ? '' : String(rawDir).trim();
  if (rawStr.includes('\0')) {
    const err = new Error('Null byte rejected in browse path.');
    err.statusCode = 400;
    err.code = 'INVALID_PATH';
    throw err;
  }

  const home = os.homedir();
  const shortcuts = [
    { label: 'Home', path: home },
    ...[path.join(home, 'Desktop'), path.join(home, 'Documents'), path.join(home, 'workspace')]
      .filter(p => fs.existsSync(p))
      .map(p => ({ label: path.basename(p), path: p }))
  ];
  if (activeProjectRoot && fs.existsSync(activeProjectRoot)) {
    shortcuts.push({ label: 'Active Project', path: activeProjectRoot });
  }

  if (process.platform === 'win32' && rawStr === '__DRIVES__') {
    return {
      ok: true,
      currentDir: '__DRIVES__',
      parentDir: null,
      platform: process.platform,
      shortcuts,
      directories: enumerateWindowsDrives()
    };
  }

  const targetDir = rawStr ? path.resolve(expandCliPath(rawStr)) : home;
  if (!fs.existsSync(targetDir)) {
    const err = new Error(`Directory not found: '${targetDir}'.`);
    err.statusCode = 404;
    err.code = 'DIR_NOT_FOUND';
    throw err;
  }
  const st = fs.statSync(targetDir);
  if (!st.isDirectory()) {
    const err = new Error(`Path is not a directory: '${targetDir}'.`);
    err.statusCode = 400;
    err.code = 'NOT_A_DIRECTORY';
    throw err;
  }

  const rawParent = path.dirname(targetDir);
  const parentDir =
    rawParent === targetDir ? (process.platform === 'win32' ? '__DRIVES__' : null) : rawParent;

  let entries = [];
  try {
    entries = fs.readdirSync(targetDir, { withFileTypes: true });
  } catch (err) {
    const wrapped = new Error(`Cannot read directory '${targetDir}': ${err.message}`);
    wrapped.statusCode = 403;
    wrapped.code = 'DIR_FORBIDDEN';
    throw wrapped;
  }

  const directories = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === 'vendor') continue;
    const full = path.join(targetDir, ent.name);
    const hasContextHub =
      fs.existsSync(path.join(full, 'docs', 'project-context-hub', '00-project-core')) ||
      fs.existsSync(path.join(full, '00-project-core'));
    const hasAiOs = fs.existsSync(path.join(full, '.ai'));
    const hasCodebase =
      fs.existsSync(path.join(full, 'app')) ||
      fs.existsSync(path.join(full, 'src')) ||
      fs.existsSync(path.join(full, 'package.json')) ||
      fs.existsSync(path.join(full, 'composer.json'));
    directories.push({
      name: ent.name,
      path: full,
      hasContextHub,
      hasAiOs,
      hasCodebase
    });
  }
  directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    ok: true,
    currentDir: targetDir,
    parentDir,
    platform: process.platform,
    shortcuts,
    directories
  };
}

function sanitizeIntakeFilename(rawName) {
  const base = path.basename(String(rawName || '').trim()).replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_');
  if (!base || base === '.' || base === '..') return '';
  return base;
}

function writeIntakeFileAtomically(hubRoot, rawName, contentBuffer) {
  const safeName = sanitizeIntakeFilename(rawName);
  const ext = path.extname(safeName).toLowerCase();
  if (!safeName || !ALLOWED_INTAKE_EXTS.has(ext)) {
    const err = new Error(
      `Unsupported intake file type '${ext || '(none)'}' for '${rawName}'. Allowed extensions: ${Array.from(ALLOWED_INTAKE_EXTS).join(', ')}.`
    );
    err.statusCode = 400;
    err.code = 'UNSUPPORTED_FILE_TYPE';
    throw err;
  }

  const intakeDir = path.join(hubRoot, '_intake');
  fs.mkdirSync(intakeDir, { recursive: true });
  const destPath = path.resolve(intakeDir, safeName);
  const resolvedIntakeDir = path.resolve(intakeDir);
  if (!destPath.startsWith(resolvedIntakeDir + path.sep)) {
    const err = new Error('Resolved upload path escapes _intake directory.');
    err.statusCode = 400;
    err.code = 'INVALID_FILENAME';
    throw err;
  }

  const tmpPath = `${destPath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpPath, contentBuffer);
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }

  return {
    name: safeName,
    ext,
    sizeBytes: contentBuffer.length,
    relativePath: path.join('_intake', safeName).replace(/\\/g, '/')
  };
}

function parseChangeImpactEntries(cirRaw) {
  if (!cirRaw) return [];
  const entries = [];
  for (const line of cirRaw.split(/\r?\n/)) {
    const cells = splitMarkdownRow(line);
    if (!cells || cells.length < 4) continue;
    const col0 = stripMdFormatting(cells[0]);
    if (!/^CR-[A-Z0-9_-]+$/i.test(col0)) continue;
    entries.push({
      crId: col0,
      version: stripMdFormatting(cells[1] || ''),
      date: stripMdFormatting(cells[2] || ''),
      target: stripMdFormatting(cells[4] || cells[3] || ''),
      summary: stripMdFormatting(cells[5] || cells[6] || cells[3] || ''),
      status: stripMdFormatting(cells[cells.length - 1] || '')
    });
  }
  return entries;
}

function countOpenApiRoutesAndModules(absProject) {
  const modulesDir = path.join(absProject, 'docs', 'modules');
  const modules = [];
  let routeCount = 0;

  if (fs.existsSync(modulesDir)) {
    for (const file of fs.readdirSync(modulesDir).filter(f => f.endsWith('.json')).sort()) {
      modules.push(file);
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(modulesDir, file), 'utf8'));
        const pathsObj = parsed && typeof parsed.paths === 'object' ? parsed.paths : {};
        for (const pathItem of Object.values(pathsObj)) {
          if (!pathItem || typeof pathItem !== 'object') continue;
          const verbs = Object.keys(pathItem).filter(k =>
            ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(k.toLowerCase())
          );
          routeCount += verbs.length;
        }
      } catch {
        // ignore invalid openapi json
      }
    }
  }

  if (routeCount === 0) {
    const mapCandidates = [
      path.join(absProject, '.ai', 'context', 'CODEBASE_MAP.md'),
      path.join(absProject, 'context', 'CODEBASE_MAP.md')
    ];
    for (const mp of mapCandidates) {
      const raw = safeReadUtf8(mp);
      if (!raw) continue;
      for (const line of raw.split(/\r?\n/)) {
        if (/^\|\s*(?:GET|POST|PUT|PATCH|DELETE)\s*\|/i.test(line.trim())) {
          routeCount++;
        }
      }
      if (routeCount > 0) break;
    }
  }

  return { moduleCount: modules.length, modules, routeCount };
}

function countLiteralTestIdsFromSection11(section11) {
  if (!section11 || !section11.checks) return 0;
  const eng04 = section11.checks.get('ENG-04');
  if (!eng04 || !eng04.binding) return 0;
  const binding = String(eng04.binding);
  if (/\{component\}|\{element\}|<id>/i.test(binding)) return 0;
  const explicitMatches = binding.match(/[a-z0-9]+(?:-[a-z0-9_]+){2,}/gi) || [];
  if (explicitMatches.length > 0) return explicitMatches.length;
  const status = String(eng04.status || '').toUpperCase();
  if ((status === 'PASS' || status === 'VERIFIED' || status === 'VALID') && binding.length >= 3) {
    return 1;
  }
  return 0;
}

function computeFeatureValidityPct(doc, engEval, filePlaceholderCount) {
  if (
    (doc.gateA === 'READY_FOR_DEV' || doc.gateA === 'IMPLEMENTED') &&
    doc.openBlockers === 0 &&
    filePlaceholderCount === 0 &&
    Boolean(doc.declaredSrd || doc.computedSrdV1)
  ) {
    return 100;
  }
  let score = 0;
  if (doc.id) score += 15;
  if (doc.gateA === 'READY_FOR_DEV' || doc.gateA === 'IMPLEMENTED') score += 30;
  else if (doc.gateA === 'DRAFT') score += 10;
  if (doc.openBlockers === 0) score += 20;
  if (filePlaceholderCount === 0) score += 20;
  if (doc.hasScreenSection || doc.lifecycleStates.length > 0 || doc.i18nKeys.length > 0 || (engEval && engEval.passedCount > 0)) {
    score += 15;
  }
  return Math.max(0, Math.min(100, score));
}

function parseDriftRadarReport(absProject) {
  const driftPath = path.join(absProject, 'docs', 'business-context', 'DRIFT_RADAR_REPORT.md');
  const exists = fs.existsSync(driftPath);
  if (!exists) {
    return { exists: false, status: 'MISSING', healthScore: null, path: 'docs/business-context/DRIFT_RADAR_REPORT.md' };
  }
  const raw = safeReadUtf8(driftPath);
  const hasCritical = /CRITICAL_DRIFT/i.test(raw);
  const scoreMatch = raw.match(/(?:Health\s*Score|Parity|Alignment)\s*[:|*]*\s*`?(\d{1,3})\s*%`?/i);
  const healthScore = scoreMatch ? Math.min(100, Number(scoreMatch[1])) : (hasCritical ? 40 : 100);
  const status = hasCritical ? 'CRITICAL_DRIFT' : (/WARNING/i.test(raw) ? 'WARNING' : 'ALIGNED');
  return {
    exists: true,
    status,
    healthScore,
    path: 'docs/business-context/DRIFT_RADAR_REPORT.md'
  };
}

function readDispatchQueueFile(absProject) {
  const queuePath = path.join(absProject, '.ai', '.dispatch-queue.json');
  if (!fs.existsSync(queuePath)) {
    return { exists: false, path: '.ai/.dispatch-queue.json', lastDispatch: null, queue: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const queue = Array.isArray(parsed.queue) ? parsed.queue : [];
    return {
      exists: true,
      path: '.ai/.dispatch-queue.json',
      lastDispatch: parsed.stage
        ? {
            dispatchedAt: parsed.dispatchedAt || null,
            stage: parsed.stage,
            stageTitle: parsed.stageTitle || null,
            sprint: parsed.sprint || null,
            track: parsed.track || null,
            slashCommand: parsed.slashCommand || '/os-advance',
            promptCommand: parsed.promptCommand || '/os-advance',
            readyPrompt: parsed.readyPrompt || null,
            targetPaths: Array.isArray(parsed.targetPaths) ? parsed.targetPaths : []
          }
        : null,
      queue
    };
  } catch {
    return { exists: false, path: '.ai/.dispatch-queue.json', lastDispatch: null, queue: [] };
  }
}

/**
 * Collects unified Track A (`BA_SDLC`) and Track B (`stack-aware`) workspace metrics with zero LLM calls.
 */
function collectDualCoreMetrics(projectRootInput, state, opts = {}) {
  const { absProject, hubRoot } = resolveProjectRootAndHub(projectRootInput);
  const lifecycleScope = detectLifecycleScope(
    absProject,
    hubRoot,
    opts.lifecycleScope,
    state.lifecycleScope
  );
  const trackBEnabled = lifecycleScope === 'FULL_LIFECYCLE';
  const intakeFiles = listIntakeFiles(hubRoot);

  const coreDir = path.join(hubRoot, '00-project-core');
  const coreFilesSpec = ['PROJECT_CONTEXT.md', 'SEED_DEFAULTS_CATALOG.md', 'GLOSSARY_AND_ENUMS.md', 'UX_DESIGN_BRIEF.md'];
  const coreFiles = {};
  for (const name of coreFilesSpec) {
    const fp = path.join(coreDir, name);
    const exists = fs.existsSync(fp);
    const raw = exists ? safeReadUtf8(fp) : '';
    coreFiles[name] = {
      exists,
      sizeBytes: exists ? Buffer.byteLength(raw, 'utf8') : 0,
      tokenCount:
        name === 'SEED_DEFAULTS_CATALOG.md'
          ? new Set(raw.match(/\bSEED-[A-Z0-9_-]+\b/g) || []).size
          : name === 'GLOSSARY_AND_ENUMS.md'
            ? new Set(raw.match(/\bENUM-[A-Z0-9_-]+\b/g) || []).size
            : undefined
    };
  }

  const placeholderViolations = fs.existsSync(hubRoot) ? scanAntiPlaceholders(hubRoot) : [];
  const phByFile = new Map();
  for (const v of placeholderViolations) {
    const rel = String(v.file || '').replace(/\\/g, '/');
    phByFile.set(rel, (phByFile.get(rel) || 0) + 1);
  }

  const featurePaths = scanHubAndLegacyFeatures(
    {
      isHubV2: fs.existsSync(hubRoot),
      hubRoot,
      legacyFeaturesDir: path.join(absProject, 'docs', 'business-context', 'features')
    },
    state.activeSprint
  );

  const featureMatrix = [];
  const executionWaves = { wave1: [], wave2: [], wave3: [], unassigned: [] };
  let totalEngPassed = 0;
  let totalEngPending = 0;
  let totalEngFailed = 0;
  let totalLiteralTestIds = 0;

  for (const fp of featurePaths) {
    let doc;
    try {
      doc = parseFeatureDocument(fp, { isHubV2: true });
    } catch {
      continue;
    }
    const relFromHub = path.relative(hubRoot, fp).replace(/\\/g, '/');
    const filePhCount = phByFile.get(relFromHub) || 0;
    const engEval = evaluateGateBChecks(doc.section11);
    const literalTestIdsCount = countLiteralTestIdsFromSection11(doc.section11);
    const validPct = computeFeatureValidityPct(doc, engEval, filePhCount);

    totalEngPassed += engEval.passedCount;
    totalEngPending += engEval.pendingCount;
    totalEngFailed += engEval.failedCount;
    totalLiteralTestIds += literalTestIdsCount;

    const item = {
      id: doc.id,
      title: doc.title,
      sprint: doc.sprint || state.activeSprint,
      wave: doc.wave || 1,
      archetype: doc.archetype,
      gateA: doc.gateA,
      gateB: doc.gateB,
      validPct,
      featureSrd: doc.declaredSrd || doc.computedSrdV1,
      srdMatches: !doc.declaredSrd || doc.declaredSrd === doc.computedSrd || doc.declaredSrd === doc.computedSrdV1,
      openBlockers: doc.openBlockers,
      storiesCount: doc.stories.length,
      engPassedCount: engEval.passedCount,
      engTotalCount: 10,
      literalTestIdsCount
    };
    featureMatrix.push(item);

    if (item.wave === 1) executionWaves.wave1.push(item);
    else if (item.wave === 2) executionWaves.wave2.push(item);
    else if (item.wave === 3) executionWaves.wave3.push(item);
    else executionWaves.unassigned.push(item);
  }

  const baStrictVerify = fs.existsSync(hubRoot)
    ? runHubVerifier(hubRoot, { sprint: state.activeSprint, strict: true })
    : { ok: false, violations: [], warnings: [] };

  const cirPath = path.join(hubRoot, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md');
  const cirEntries = parseChangeImpactEntries(safeReadUtf8(cirPath));
  const deltasDir = path.join(hubRoot, '03-version-deltas');
  const deltaFiles = fs.existsSync(deltasDir)
    ? fs.readdirSync(deltasDir).filter(f => /^DELTA_.*\.md$/i.test(f)).sort()
    : [];

  const baCheckpointDefs = STAGE_DEFINITIONS.filter(s => TRACK_A_IDS.includes(s.id) && s.checkpoint);
  const baCheckpoints = baCheckpointDefs.map(def => {
    const st = state.stages[def.id] || {};
    const trailEntry = [...(state.checkpointAuditTrail || [])]
      .reverse()
      .find(e => e.stage === def.id && (!e.sprint || e.sprint === state.activeSprint));
    return {
      stage: def.id,
      label: def.checkpointLabel || def.title,
      requiredRole: def.ownerRole,
      status: st.status || 'PENDING',
      isPendingApproval: Boolean(state.pendingCheckpoint && state.pendingCheckpoint.stage === def.id),
      digest:
        state.pendingCheckpoint && state.pendingCheckpoint.stage === def.id
          ? state.pendingCheckpoint.digest
          : (trailEntry ? trailEntry.digest : null),
      lastDecision: trailEntry || null
    };
  });

  const openApiSummary = countOpenApiRoutesAndModules(absProject);
  const driftRadar = parseDriftRadarReport(absProject);

  const secReportPath = path.join(absProject, 'docs', 'security', 'SECURITY_AUDIT_REPORT.md');
  const secChecklistPath = path.join(absProject, 'docs', 'security', 'SECURITY_DELIVERY_CHECKLIST.md');
  const secRaw = safeReadUtf8(secReportPath);
  const secExists = Boolean(secRaw);
  const alertRequired = secExists && /SECURITY_ALERT_REVIEW_REQUIRED/i.test(secRaw);

  const perfReportPath = path.join(absProject, 'docs', 'architecture', 'PERFORMANCE_BOTTLENECK_REPORT.md');
  const perfExists = fs.existsSync(perfReportPath);

  const postmanDir = path.join(absProject, 'docs', 'postman');
  const postmanCollections = fs.existsSync(postmanDir)
    ? fs.readdirSync(postmanDir).filter(f => f.endsWith('.json')).sort()
    : [];

  const cyclesDir = path.join(absProject, 'docs', 'handoff', 'cycles');
  const cycleFiles = fs.existsSync(cyclesDir)
    ? fs.readdirSync(cyclesDir).filter(f => /^CYCLE-.*_HANDOFF\.md$/i.test(f)).sort()
    : [];

  const AUTO_GENERATED_STAGE_IDS = new Set(['GATE_A_SEAL', 'RELEASE_SEAL', 'QA_HANDOFF', 'SECURITY_PERF_GATE']);

  function inspectStageTargetPath(relPattern, stageId) {
    const cleanRel = String(relPattern || '')
      .replace(/<SprintID>/g, state.activeSprint)
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim();
    const autoGenerated = AUTO_GENERATED_STAGE_IDS.has(stageId);
    if (!cleanRel) return { path: cleanRel, fullPath: absProject, exists: false, autoGenerated };

    const targetAbs = cleanRel.startsWith('docs/project-context-hub/')
      ? path.join(hubRoot, cleanRel.slice('docs/project-context-hub/'.length))
      : path.join(absProject, cleanRel);

    if (cleanRel.includes('*') || cleanRel.includes('<')) {
      const parentDir = path.dirname(targetAbs);
      if (!fs.existsSync(parentDir)) return { path: cleanRel, fullPath: targetAbs, exists: false, autoGenerated };
      try {
        const base = path.basename(targetAbs);
        let matcher = null;
        if (base.startsWith('FEATURE-')) matcher = /^FEATURE-.*\.md$/i;
        else if (base.startsWith('DELTA_')) matcher = /^DELTA_.*\.md$/i;
        else if (base.startsWith('CYCLE-')) matcher = /^CYCLE-.*_HANDOFF\.md$/i;
        const hits = fs.readdirSync(parentDir).filter(f => !f.endsWith('.template.md') && (!matcher || matcher.test(f)));
        return { path: cleanRel, fullPath: targetAbs, exists: hits.length > 0, autoGenerated };
      } catch {
        return { path: cleanRel, fullPath: targetAbs, exists: false, autoGenerated };
      }
    }

    if (cleanRel.endsWith('/')) {
      if (!fs.existsSync(targetAbs)) return { path: cleanRel, fullPath: targetAbs, exists: false, autoGenerated };
      try {
        return { path: cleanRel, fullPath: targetAbs, exists: fs.readdirSync(targetAbs).length > 0, autoGenerated };
      } catch {
        return { path: cleanRel, fullPath: targetAbs, exists: false, autoGenerated };
      }
    }

    return { path: cleanRel, fullPath: targetAbs, exists: fs.existsSync(targetAbs), autoGenerated };
  }

  const stageScopes = {};
  for (const def of STAGE_DEFINITIONS) {
    const st = state.stages[def.id] || {};
    const trailEntry = [...(state.checkpointAuditTrail || [])]
      .reverse()
      .find(e => e.stage === def.id && (!e.sprint || e.sprint === state.activeSprint));
    stageScopes[def.id] = {
      id: def.id,
      index: def.index,
      ownerRole: def.ownerRole,
      checkpoint: Boolean(def.checkpoint),
      checkpointLabel: def.checkpointLabel || null,
      status: st.status || 'PENDING',
      files: (def.targetPaths || []).map(p => inspectStageTargetPath(p, def.id)),
      rules: def.rules || [],
      lastCheckpointDecision: trailEntry || null
    };
  }

  const trackAStages = TRACK_A_IDS.map(id => ({ id, ...(state.stages[id] || {}) }));
  const trackBStages = TRACK_B_IDS.map(id => ({ id, ...(state.stages[id] || {}) }));

  return {
    lifecycle: {
      lifecycleScope,
      defaultTab: lifecycleScope === 'BA_ONLY_HUB' ? 'BA_SDLC' : (TRACK_B_IDS.includes(state.currentStage) ? 'STACK_AWARE' : 'BA_SDLC'),
      trackA: {
        id: 'BA_SDLC',
        label: 'BA_SDLC (Stages 1-5 + CRs)',
        enabled: true,
        passedCount: TRACK_A_IDS.filter(id => id !== 'DELTA_EVOLVE' && state.stages[id]?.status === 'PASSED').length,
        totalCount: 5,
        stages: trackAStages
      },
      trackB: {
        id: 'STACK_AWARE',
        label: 'stack-aware Engineering & QA (Stages 6-10)',
        enabled: trackBEnabled,
        passedCount: TRACK_B_IDS.filter(id => state.stages[id]?.status === 'PASSED').length,
        totalCount: 5,
        stages: trackBStages
      }
    },
    stageScopes,
    baSdlc: {
      coreHubHealth: {
        files: coreFiles,
        readyFilesCount: Object.values(coreFiles).filter(f => f.exists).length,
        totalCoreFiles: coreFilesSpec.length,
        antiPlaceholderViolationCount: placeholderViolations.length,
        antiPlaceholderViolations: placeholderViolations.slice(0, 15)
      },
      baCheckpoints,
      featureMatrix,
      baStrictVerify: {
        ok: Boolean(baStrictVerify.ok),
        violationCount: (baStrictVerify.violations || []).length,
        warningCount: (baStrictVerify.warnings || []).length,
        violations: (baStrictVerify.violations || []).slice(0, 20)
      },
      crEvolution: {
        registerCount: cirEntries.length,
        registerEntries: cirEntries,
        deltaFiles,
        deltaHistory: state.deltaHistory || []
      },
      intakeFiles
    },
    stackAware: {
      enabled: trackBEnabled,
      gateBAndDrift: {
        engPassedRows: totalEngPassed,
        engPendingRows: totalEngPending,
        engFailedRows: totalEngFailed,
        literalTestIdsCount: totalLiteralTestIds,
        discoveredApiRoutesCount: openApiSummary.routeCount,
        driftRadar
      },
      executionWaves,
      securityPerfQa: {
        securityAudit: {
          exists: secExists,
          checklistExists: fs.existsSync(secChecklistPath),
          alertReviewRequired: alertRequired,
          posture: !secExists ? 'MISSING' : (alertRequired ? 'REVIEW_REQUIRED' : 'PASS')
        },
        performanceReport: {
          exists: perfExists,
          status: perfExists ? 'GENERATED' : 'MISSING'
        },
        openApi: openApiSummary,
        postman: {
          collectionCount: postmanCollections.length,
          collections: postmanCollections
        },
        cycleHandoff: {
          count: cycleFiles.length,
          latestFile: cycleFiles.length > 0 ? cycleFiles[cycleFiles.length - 1] : null
        }
      }
    },
    dispatchBridge: readDispatchQueueFile(absProject)
  };
}

function renderDashboardHtml(sessionToken) {
  const rolesJson = JSON.stringify(ORDERED_ROLES);
  const trackAJson = JSON.stringify(TRACK_A_IDS);
  const trackBJson = JSON.stringify(TRACK_B_IDS);
  const stagesJson = JSON.stringify(
    STAGE_DEFINITIONS.map(s => ({
      id: s.id,
      index: s.index,
      track: TRACK_A_IDS.includes(s.id) ? 'BA_SDLC' : 'STACK_AWARE',
      ownerRole: s.ownerRole,
      checkpoint: Boolean(s.checkpoint),
      checkpointLabel: s.checkpointLabel || '',
      targetPaths: s.targetPaths || [],
      rules: s.rules || [],
      title: s.title
    }))
  );

  return `<!DOCTYPE html>
<html lang="en" dir="ltr" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="os-session-token" content="${sessionToken}" />
  <title>InnovaDigits Unified Dual-Core Control Plane</title>
  <style>
    :root {
      --brand: #03156B;
      --brand-2: #0D2B9B;
      --accent: #00A878;
      --warn: #D97706;
      --danger: #DC2626;
      --bg: #F4F6FB;
      --surface: #FFFFFF;
      --surface-alt: #F8FAFC;
      --text: #0F172A;
      --muted: #475569;
      --border: #E2E8F0;
      --shadow: 0 6px 20px rgba(3, 21, 107, 0.06);
      --radius: 12px;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", Arial, sans-serif;
    }
    html[data-theme="dark"] {
      --brand: #3B5BFF;
      --brand-2: #6880FF;
      --bg: #0B1120;
      --surface: #111827;
      --surface-alt: #1E293B;
      --text: #F8FAFC;
      --muted: #94A3B8;
      --border: #263349;
      --shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.5; }
    .topbar {
      background: linear-gradient(135deg, #03156B 0%, #0A279C 100%);
      color: #FFFFFF;
      padding: 12px 20px;
      box-shadow: 0 4px 16px rgba(3, 21, 107, 0.22);
    }
    .topbar-inner { max-width: 1120px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
    .topbar-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .brand-title h1 { margin: 0; font-size: 1.08rem; font-weight: 700; }
    .project-meta { font-family: var(--mono); font-size: 0.76rem; opacity: 0.9; word-break: break-all; }
    .controls-group { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .badge {
      display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px;
      font-size: 0.75rem; font-weight: 600; background: rgba(255,255,255,0.14); color: #FFF;
      border: 1px solid rgba(255,255,255,0.22);
    }
    .badge-ok { background: rgba(0,168,120,0.24); border-color: rgba(16,185,129,0.55); color: #065F46; }
    html[data-theme="dark"] .badge-ok { color: #6EE7B7; }
    .badge-warn { background: rgba(245,158,11,0.18); border-color: rgba(217,119,6,0.55); color: #92400E; }
    html[data-theme="dark"] .badge-warn { color: #FCD34D; }
    .badge-danger { background: rgba(220,38,38,0.18); border-color: rgba(220,38,38,0.55); color: #991B1B; }
    html[data-theme="dark"] .badge-danger { color: #FCA5A5; }
    .topbar .badge-ok { color: #D1FAE5; }
    .topbar .badge-warn { color: #FEF3C7; }
    .wizard-shell { max-width: 1020px; margin: 18px auto 36px; padding: 0 18px; display: flex; flex-direction: column; gap: 14px; }
    .role-bar {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 10px 14px; box-shadow: var(--shadow); display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    }
    .role-pill {
      position: relative; border: 1px solid var(--border); background: var(--surface-alt); color: var(--text);
      border-radius: 999px; padding: 6px 14px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px; transition: all 0.12s ease;
    }
    .role-pill:hover { border-color: var(--brand); }
    .role-pill.active { background: var(--brand); color: #FFF; border-color: var(--brand); }
    .role-dot { width: 8px; height: 8px; border-radius: 50%; background: #F59E0B; display: inline-block; }
    .role-done-tag { font-size: 0.72rem; opacity: 0.85; }
    .wizard-stepper-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 12px 14px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 8px;
    }
    .wizard-stepper { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
    .wizard-step-btn {
      flex: 1 1 165px; max-width: 240px; text-align: start; border: 1px solid var(--border);
      background: var(--surface-alt); color: var(--text); border-radius: 10px; padding: 9px 12px;
      cursor: pointer; display: flex; flex-direction: column; gap: 3px; transition: border-color 0.12s ease, transform 0.1s ease;
    }
    .wizard-step-btn:hover { border-color: var(--brand); }
    .wizard-step-btn.is-done { border-color: rgba(0,168,120,0.45); background: rgba(0,168,120,0.08); }
    .wizard-step-btn.is-active { border-color: #D97706; background: rgba(245,158,11,0.08); }
    .wizard-step-btn.is-selected { box-shadow: 0 0 0 2px var(--brand); border-color: var(--brand); }
    .wizard-step-num { font-family: var(--mono); font-size: 0.7rem; font-weight: 700; color: var(--muted); display: flex; justify-content: space-between; gap: 6px; }
    .wizard-step-label { font-size: 0.84rem; font-weight: 700; }
    .wizard-review-ribbon {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
      padding: 9px 12px; border-radius: 9px; border: 1px solid rgba(0,168,120,0.45); background: rgba(0,168,120,0.09); font-size: 0.82rem;
    }
    .wizard-nav-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px;
    }
    .checkpoint-box {
      border: 2px solid #F59E0B; background: rgba(245,158,11,0.08); border-radius: 10px; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .completed-box {
      border: 1px solid rgba(0,168,120,0.45); background: rgba(0,168,120,0.08); border-radius: 10px;
      padding: 12px 14px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
    }
    .step-id { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .step-status { font-size: 0.65rem; opacity: 0.92; }
    .btn {
      appearance: none; border: 1px solid var(--border); background: var(--surface); color: var(--text);
      border-radius: 8px; padding: 7px 12px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
    }
    .btn:hover:not(:disabled) { opacity: 0.9; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-xs { padding: 3px 7px; font-size: 0.68rem; border-radius: 6px; }
    .btn-header { background: rgba(255,255,255,0.14); color: #FFF; border-color: rgba(255,255,255,0.3); }
    .btn-primary { background: #03156B; color: #FFF; border-color: #03156B; }
    html[data-theme="dark"] .btn-primary { background: #3B5BFF; border-color: #3B5BFF; }
    .btn-approve { background: #047857; color: #FFF; border-color: #047857; }
    .btn-reject { background: #B91C1C; color: #FFF; border-color: #B91C1C; }
    .nav-bar {
      max-width: 1460px; margin: 16px auto 0; padding: 0 20px;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
    }
    .tab-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .view-tab {
      padding: 9px 16px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); font-weight: 700; font-size: 0.86rem; cursor: pointer;
    }
    .view-tab.active { background: #03156B; color: #FFF; border-color: #03156B; }
    html[data-theme="dark"] .view-tab.active { background: #3B5BFF; border-color: #3B5BFF; }
    .container { max-width: 1460px; margin: 14px auto 40px; padding: 0 20px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .span-full { grid-column: 1 / -1; }
    .hidden { display: none !important; }
    .card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: var(--shadow); padding: 18px; display: flex; flex-direction: column; gap: 12px;
    }
    .card-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
    .card-title { margin: 0; font-size: 0.98rem; font-weight: 700; color: var(--brand); }
    html[data-theme="dark"] .card-title { color: #93C5FD; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 10px; }
    .kpi-box { border: 1px solid var(--border); background: var(--surface-alt); border-radius: 10px; padding: 10px; }
    .kpi-label { font-size: 0.74rem; color: var(--muted); }
    .kpi-val { font-size: 1.05rem; font-weight: 700; font-family: var(--mono); }
    .role-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .role-box { border: 1px solid var(--border); background: var(--surface-alt); border-radius: 10px; padding: 10px; }
    .role-box.has-items { border-color: var(--brand); }
    .form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .field { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; font-weight: 600; }
    .input, .select {
      border: 1px solid var(--border); background: var(--surface-alt); color: var(--text);
      border-radius: 8px; padding: 8px 10px; font-size: 0.82rem; font-family: inherit; width: 100%;
    }
    .alert-box { border-radius: 10px; padding: 11px 14px; border: 1px solid #F59E0B; background: rgba(245,158,11,0.12); font-size: 0.83rem; }
    .alert-ok { border-color: var(--border); background: var(--surface-alt); }
    table.tbl { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
    table.tbl th, table.tbl td { border-bottom: 1px solid var(--border); padding: 7px 8px; text-align: start; vertical-align: top; }
    pre.codebox {
      margin: 0; padding: 12px; border-radius: 8px; background: #0F172A; color: #E2E8F0;
      font-family: var(--mono); font-size: 0.76rem; overflow: auto; max-height: 210px; white-space: pre-wrap; word-break: break-word;
    }
    .stream-log { max-height: 170px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
    .log-entry { padding: 7px 10px; border-radius: 8px; background: var(--surface-alt); border: 1px solid var(--border); font-size: 0.77rem; }
    .muted { color: var(--muted); font-size: 0.79rem; }
    .mono { font-family: var(--mono); }
    .ltr-path, .scope-chip, .project-meta, #guide-step2-path { direction: ltr; unicode-bidi: embed; }
    .scope-chip, .ltr-path { display: inline-block; max-width: 100%; word-break: break-all; }
    .action-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .toast { font-size: 0.8rem; font-weight: 600; min-height: 19px; }
    .toast.ok { color: #059669; }
    .toast.err { color: #DC2626; }
    .workspace-select {
      background: rgba(255,255,255,0.14); color: #FFF; border: 1px solid rgba(255,255,255,0.3);
      border-radius: 8px; padding: 6px 10px; font-size: 0.8rem; font-weight: 600; max-width: 260px;
    }
    .workspace-select option { color: #0F172A; background: #FFF; }
    .dropzone {
      border: 2px dashed var(--border); border-radius: 12px; padding: 20px; text-align: center;
      background: var(--surface-alt); cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;
    }
    .dropzone.dragover { border-color: var(--accent); background: rgba(0, 168, 120, 0.08); }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); z-index: 999;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .modal-card {
      background: var(--surface); color: var(--text); border: 1px solid var(--border);
      border-radius: 14px; max-width: 720px; width: 100%; max-height: 90vh; overflow: auto;
      padding: 20px; box-shadow: 0 20px 45px rgba(0,0,0,0.35); display: flex; flex-direction: column; gap: 14px;
    }
    .mode-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .mode-card {
      border: 2px solid var(--border); border-radius: 10px; padding: 12px; cursor: pointer;
      background: var(--surface-alt); display: flex; flex-direction: column; gap: 4px;
    }
    .mode-card.selected { border-color: var(--brand); background: rgba(3, 21, 107, 0.06); }
    html[data-theme="dark"] .mode-card.selected { background: rgba(59, 91, 255, 0.16); }
    .fs-panel {
      border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--surface-alt);
      display: flex; flex-direction: column; gap: 8px;
    }
    .fs-list { max-height: 190px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
    .fs-row {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      padding: 6px 10px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface);
      cursor: pointer; font-size: 0.8rem; text-align: start;
    }
    .fs-row:hover { border-color: var(--brand); }
    .mission-card { border-left: 4px solid var(--accent); }
    html[dir="rtl"] .mission-card { border-left: 1px solid var(--border); border-right: 4px solid var(--accent); }
    .mission-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .mission-step {
      border: 1px solid var(--border); background: var(--surface-alt); border-radius: 10px;
      padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px;
    }
    .mission-step.active-step { border-color: var(--brand); }
    .mission-scope-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .scope-chip {
      display: inline-block; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface-alt); font-family: var(--mono); font-size: 0.72rem; margin: 2px 4px 2px 0;
    }
    .scope-chip.missing { border-color: #DC2626; color: #B91C1C; background: rgba(220,38,38,0.08); }
    html[data-theme="dark"] .scope-chip.missing { color: #FCA5A5; }
    .diag-list { display: flex; flex-direction: column; gap: 6px; max-height: 165px; overflow: auto; }
    .diag-row {
      padding: 6px 9px; border-radius: 7px; border: 1px solid rgba(217,119,6,0.35);
      background: rgba(245,158,11,0.08); font-size: 0.76rem;
    }
    .prompt-box {
      font-family: var(--mono); font-size: 0.75rem; line-height: 1.45; resize: vertical;
      background: #0F172A; color: #E2E8F0; min-height: 195px;
    }
    .btn-mini-status { cursor: pointer; font-family: var(--mono); }
    @media (max-width: 1020px) {
      .tracks-wrapper, .container, .mission-steps, .mission-scope-grid { grid-template-columns: 1fr; }
      .role-grid, .form-grid, .mode-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px) { .role-grid, .form-grid, .mode-cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header class="topbar" data-testid="webui-header-bar">
    <div class="topbar-inner">
      <div class="topbar-row">
        <div class="brand-title">
          <div class="action-row">
            <h1 id="lbl-app-title">InnovaDigits Role Wizard</h1>
            <span class="badge" data-testid="webui-status-sse" id="status-sse">SSE</span>
          </div>
          <div class="project-meta" data-testid="webui-status-project" id="status-project">-</div>
        </div>
        <div class="controls-group">
          <select class="workspace-select" id="workspace-switcher" data-testid="webui-workspace-switcher" aria-label="Workspace Switcher"></select>
          <button type="button" class="btn btn-approve" id="btn-new-project" data-testid="webui-new-project-btn">+ New Project</button>
          <button type="button" class="btn btn-header hidden" id="btn-attach-repo" data-testid="webui-attach-repo-btn">Attach Code Repo</button>
          <button type="button" class="btn btn-header" data-testid="webui-lang-toggle-btn" id="btn-lang-toggle">العربية / EN</button>
          <button type="button" class="btn btn-header" data-testid="webui-theme-toggle-btn" id="btn-theme-toggle">Theme</button>
          <button type="button" class="btn btn-header" data-testid="webui-advanced-toggle-btn" id="btn-toggle-advanced">⚙️</button>
        </div>
      </div>
    </div>
  </header>

  <main class="wizard-shell">
    <!-- Empty / Welcome Card -->
    <section class="card hidden" id="welcome-banner" data-testid="webui-welcome-banner">
      <div class="card-header">
        <h2 class="card-title" id="lbl-welcome-title">Welcome to InnovaDigits AI Engineering OS</h2>
        <button type="button" class="btn btn-primary" id="btn-welcome-new-project" data-testid="webui-welcome-new-project-btn">+ Create Your First Project</button>
      </div>
      <p class="muted" id="lbl-welcome-desc" style="margin:0;">No workspace is active yet. Create a BA-Only hub from documents (BRD/RFP/PDF) or bootstrap a Full Lifecycle repository with automatic stack detection — zero terminal commands required.</p>
    </section>

    <!-- Role Selector Bar -->
    <section class="role-bar hidden" id="role-bar" data-testid="webui-role-bar">
      <strong class="muted" id="lbl-role-bar-title">My Role:</strong>
      <button type="button" class="role-pill active" data-role-pick="BA" data-testid="webui-tab-ba" id="tab-view-ba">BA Analyst</button>
      <button type="button" class="role-pill" data-role-pick="TECH_LEAD" data-testid="webui-role-pill-TECH_LEAD" id="role-pill-TECH_LEAD">Tech Lead</button>
      <button type="button" class="role-pill" data-role-pick="DEV" data-testid="webui-tab-eng" id="tab-view-eng">Developer</button>
      <button type="button" class="role-pill" data-role-pick="SECURITY" data-testid="webui-role-pill-SECURITY" id="role-pill-SECURITY">Security</button>
      <button type="button" class="role-pill" data-role-pick="QA" data-testid="webui-role-pill-QA" id="role-pill-QA">QA</button>
      <button type="button" class="role-pill" data-role-pick="PM" data-testid="webui-role-pill-PM" id="role-pill-PM">PM / Release</button>
      <button type="button" class="role-pill" data-role-pick="ALL" data-testid="webui-role-pill-ALL" id="role-pill-ALL">All Steps</button>
    </section>

    <!-- Progressive Wizard Stepper (Completed + Currently Available Only) -->
    <section class="wizard-stepper-card hidden" id="wizard-stepper-card" data-testid="webui-stage-stepper">
      <div class="action-row" style="justify-content:space-between;">
        <strong class="muted" id="lbl-stepper-title">Available &amp; Completed Steps for Your Role</strong>
        <span class="muted mono" id="wizard-stepper-meta">-</span>
      </div>
      <div class="wizard-stepper" id="wizard-stepper" data-testid="webui-wizard-stepper"></div>
    </section>

    <!-- Role Completed Notice -->
    <section class="alert-box alert-ok hidden" id="role-complete-banner" data-testid="webui-role-complete-banner"></section>

    <!-- Calm Waiting Card (when selected role has 0 unlocked steps yet) -->
    <section class="card hidden" id="wizard-waiting-card" data-testid="webui-wizard-waiting-card">
      <div class="card-header">
        <h2 class="card-title" id="lbl-waiting-title">Waiting for Earlier Steps</h2>
      </div>
      <p class="muted" id="wizard-waiting-text" style="margin:0;">-</p>
    </section>

    <!-- Single-Step Focused Wizard Page -->
    <article class="card mission-card hidden" id="active-stage-card" data-testid="webui-active-stage-card">
      <div class="wizard-review-ribbon hidden" id="wizard-review-ribbon">
        <span id="lbl-review-ribbon-text">You are reviewing a completed step.</span>
        <button type="button" class="btn btn-xs btn-primary" id="btn-return-current-step" data-testid="webui-return-current-step-btn">Go to Current Step</button>
      </div>

      <div class="card-header">
        <div class="action-row">
          <span class="badge" style="background:#03156B;color:#FFF;" id="active-stage-badge" data-testid="webui-active-stage-badge">#1</span>
          <h2 class="card-title" id="active-stage-title">-</h2>
        </div>
        <span class="badge badge-warn" id="active-stage-blocker-badge" data-testid="webui-active-stage-blocker-badge">-</span>
      </div>

      <p class="muted" id="active-stage-desc" style="margin:0;">-</p>

      <!-- Context Panes: STRICTLY ONE visible per Wizard step -->
      <div class="step-context-pane hidden" id="pane-INTAKE" data-testid="webui-intake-upload-card">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-intake-title">Upload Requirements &amp; Schemas (_intake/)</strong>
          <span class="muted mono" id="intake-files-count">0 files</span>
        </div>
        <div class="dropzone" id="intake-dropzone" data-testid="webui-intake-dropzone" tabindex="0">
          <strong id="lbl-dropzone-main">Drag &amp; drop BRD, RFP, PDF, DOCX, XLSX, SQL or Markdown files here — or click to browse</strong>
          <div class="muted" id="lbl-dropzone-sub">Allowed: .md, .txt, .pdf, .docx, .xlsx, .sql (stored safely in _intake/)</div>
          <input type="file" id="intake-file-input" data-testid="webui-intake-file-input" multiple accept=".md,.txt,.pdf,.docx,.xlsx,.sql" style="display:none;" />
        </div>
        <div class="toast" id="intake-feedback" data-testid="webui-intake-feedback"></div>
        <div class="stream-log" id="intake-files-list" data-testid="webui-intake-files-list" style="margin-top:8px;"></div>
      </div>

      <div class="step-context-pane hidden" id="pane-CORE_BOOTSTRAP" data-testid="webui-core-health-card">
        <strong class="muted" id="lbl-core-health">Core Hub Documents Status</strong>
        <div class="kpi-grid" id="core-health-kpis" style="margin-top:8px;"></div>
      </div>

      <div class="step-context-pane hidden" id="pane-SPRINT_PLAN">
        <strong class="muted" id="lbl-sprint-plan-pane">Roadmap Waves &amp; WBS Status</strong>
        <div class="kpi-grid" id="waves-summary" style="margin-top:8px;"></div>
      </div>

      <div class="step-context-pane hidden" id="pane-SPRINT_SPECS" data-testid="webui-feature-matrix-card">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-feature-matrix">Feature Specifications &amp; Gate A Matrix</strong>
          <span class="muted mono" id="feature-matrix-count">0 features</span>
        </div>
        <div style="overflow:auto;">
          <table class="tbl" data-testid="webui-feature-matrix-table">
            <thead><tr><th>Feature</th><th>Title</th><th>Wave</th><th>Gate A</th><th>Valid %</th><th>feature_srd</th><th>Gate B</th></tr></thead>
            <tbody id="feature-matrix-body"></tbody>
          </table>
        </div>
      </div>

      <div class="step-context-pane hidden" id="pane-GATE_A_SEAL">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-gatea-pane">Strict BA Hub Verification &amp; Manifest Seal</strong>
          <button type="button" class="btn btn-primary" id="btn-ba-verify" data-testid="webui-ba-verify-btn">Run BA Strict Verify</button>
        </div>
        <div id="core-verify-summary" class="alert-box alert-ok">-</div>
      </div>

      <div class="step-context-pane hidden" id="pane-GATE_B_ENG" data-testid="webui-gateb-drift-card">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-gateb-title">Gate B (ENG-01..10) &amp; Drift Radar</strong>
          <span class="muted mono" id="drift-status-badge">-</span>
        </div>
        <div class="kpi-grid" id="gateb-kpis"></div>
      </div>

      <div class="step-context-pane hidden" id="pane-DEV_IMPLEMENT" data-testid="webui-inbox-panel">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-inbox-title">Implementation Waves &amp; Role Handoffs</strong>
          <span class="muted mono" id="inbox-total-count">0 pending</span>
        </div>
        <div class="kpi-grid" id="dev-waves-summary" style="margin-bottom:8px;"></div>
        <div class="role-grid" id="inbox-roles-grid"></div>
      </div>

      <div class="step-context-pane hidden" id="pane-SECURITY_PERF_GATE" data-testid="webui-sec-perf-qa-card">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-secperf-title">Security Posture, 183-Control Checklist &amp; Performance</strong>
          <span class="muted mono" id="secperf-posture">-</span>
        </div>
        <div class="kpi-grid" id="secperf-kpis"></div>
      </div>

      <div class="step-context-pane hidden" id="pane-QA_HANDOFF">
        <strong class="muted" id="lbl-qa-pane">OpenAPI, Postman &amp; QA Cycle Handoff Pack</strong>
        <div class="kpi-grid" id="qa-handoff-kpis" style="margin-top:8px;"></div>
      </div>

      <div class="step-context-pane hidden" id="pane-RELEASE_SEAL">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-release-pane">Release Readiness &amp; Attestation Seal</strong>
          <span class="muted mono" id="audit-semver">v1.0.0</span>
        </div>
        <div class="alert-box alert-ok" id="release-seal-summary">-</div>
      </div>

      <div class="step-context-pane hidden" id="pane-DELTA_EVOLVE" data-testid="webui-cr-panel">
        <div class="action-row" style="justify-content:space-between;margin-bottom:8px;">
          <strong class="muted" id="lbl-cr-title">Change Request (CR) Delta Evolution</strong>
          <span class="muted mono" id="cr-count-label">0 CRs</span>
        </div>
        <div class="form-grid">
          <label class="field"><span>CR ID</span><input class="input" type="text" id="cr-id" data-testid="webui-cr-id" placeholder="CR-102" /></label>
          <label class="field"><span>Target Feature</span><input class="input" type="text" id="cr-target" data-testid="webui-cr-target" placeholder="FEATURE-001" /></label>
          <label class="field"><span>Summary</span><input class="input" type="text" id="cr-summary" data-testid="webui-cr-summary" placeholder="Business change summary..." /></label>
        </div>
        <div class="action-row" style="margin-top:8px;">
          <button type="button" class="btn btn-primary" id="btn-cr-evolve" data-testid="webui-cr-submit-btn">Trigger CR Delta Evolution</button>
          <span class="toast" id="cr-feedback" data-testid="webui-cr-feedback"></span>
        </div>
        <div id="cr-list" class="stream-log" style="margin-top:8px;"></div>
      </div>

      <!-- Scope Files & Live Blockers -->
      <div class="mission-scope-grid">
        <div>
          <strong class="muted" id="lbl-active-files-title">Files in Scope for This Step:</strong>
          <div id="active-stage-files" data-testid="webui-active-stage-files" style="margin-top:6px;"></div>
        </div>
        <div>
          <strong class="muted" id="lbl-active-diags-title">Step Checks / Remaining Items:</strong>
          <div class="diag-list" id="active-stage-diagnostics" data-testid="webui-active-stage-diagnostics" style="margin-top:6px;"></div>
        </div>
      </div>

      <!-- Inline Human Checkpoint Box (visible ONLY when current checkpoint is paused) -->
      <div class="checkpoint-box hidden" id="wizard-checkpoint-box" data-testid="webui-checkpoints-panel">
        <div class="action-row" style="justify-content:space-between;">
          <strong id="lbl-checkpoints-title">Human Checkpoint Approval Required</strong>
          <span class="mono muted" id="checkpoint-stage-badge">-</span>
        </div>
        <div id="checkpoint-banner" class="alert-box">-</div>
        <div class="form-grid">
          <label class="field"><span id="lbl-chk-actor">Your Name</span><input class="input" type="text" id="chk-actor" data-testid="webui-checkpoint-actor" placeholder="ahmed-ba" /></label>
          <label class="field"><span id="lbl-chk-role">Role</span><select class="select" id="chk-role" data-testid="webui-checkpoint-role"></select></label>
          <label class="field"><span id="lbl-chk-notes">Approval Notes</span><input class="input" type="text" id="chk-notes" data-testid="webui-checkpoint-notes" placeholder="Decision note..." /></label>
        </div>
        <div class="action-row">
          <button type="button" class="btn btn-approve" id="btn-chk-approve" data-testid="webui-checkpoint-approve-btn">Approve Step &amp; Continue</button>
          <button type="button" class="btn btn-reject" id="btn-chk-reject" data-testid="webui-checkpoint-reject-btn">Reject</button>
          <span class="toast" id="chk-feedback" data-testid="webui-checkpoint-feedback"></span>
        </div>
      </div>

      <!-- Active Step 3-Part Actions -->
      <div class="mission-steps" id="wizard-active-actions">
        <div class="mission-step active-step">
          <div>
            <strong id="lbl-step1-title">Step 1: Copy Ready AI Prompt</strong>
            <div class="muted" id="lbl-step1-desc">Generates a self-contained instruction with exact files and blockers for this step.</div>
          </div>
          <button type="button" class="btn btn-primary" id="btn-guide-dispatch" data-testid="webui-guide-copy-prompt-btn">Copy AI Prompt &amp; Open Guide</button>
        </div>
        <div class="mission-step">
          <div>
            <strong id="lbl-step2-title">Step 2: Paste in Antigravity / Cursor Chat</strong>
            <div class="muted" id="lbl-step2-desc">Open your project folder in the IDE, paste (Ctrl+V), and let the AI write/fix the target files.</div>
          </div>
          <div class="mono muted ltr-path" dir="ltr" id="guide-step2-path" style="word-break:break-all;">-</div>
        </div>
        <div class="mission-step">
          <div>
            <strong id="lbl-step3-title">Step 3: Verify Gate &amp; Advance</strong>
            <div class="muted" id="lbl-step3-desc">Checks all rules deterministically and unlocks the next step (or pauses for approval).</div>
          </div>
          <button type="button" class="btn btn-approve" id="btn-guide-advance" data-testid="webui-guide-advance-btn">Verify &amp; Next Step</button>
        </div>
      </div>

      <!-- Completed Step Actions -->
      <div class="completed-box hidden" id="wizard-completed-box">
        <strong id="lbl-step-completed-msg">✔ This step is complete and verified.</strong>
        <button type="button" class="btn" id="btn-review-dispatch" data-testid="webui-review-dispatch-btn">View / Copy Prompt for Review</button>
      </div>

      <div class="toast" id="guide-feedback" data-testid="webui-guide-feedback"></div>

      <!-- Wizard Prev / Next Stepper Controls -->
      <div class="wizard-nav-footer" id="wizard-nav-footer">
        <button type="button" class="btn" id="btn-wizard-prev" data-testid="webui-wizard-prev-btn">Previous Step</button>
        <span class="muted mono" id="wizard-step-counter">1 / 1</span>
        <button type="button" class="btn btn-primary" id="btn-wizard-next" data-testid="webui-wizard-next-btn">Next Step</button>
      </div>
    </article>

    <!-- Collapsible Technical / Admin Drawer (Hidden by default to eliminate clutter) -->
    <section class="card hidden" id="advanced-drawer" data-testid="webui-advanced-drawer">
      <div class="card-header">
        <h2 class="card-title" id="lbl-advanced-title">Advanced System Controls &amp; Audit Log</h2>
        <div class="action-row">
          <span class="badge badge-ok" data-testid="webui-status-lifecycle" id="status-lifecycle">Scope: AUTO</span>
          <span class="badge badge-ok" data-testid="webui-status-sprint" id="status-sprint">Sprint: -</span>
          <span class="badge badge-warn" data-testid="webui-status-mode" id="status-mode">Mode: SOLO_FDE</span>
          <span class="badge badge-ok" data-testid="webui-status-circuit" id="status-circuit">Circuit: HEALTHY</span>
          <button type="button" class="btn btn-xs" data-testid="webui-mode-toggle-btn" id="btn-mode-toggle">Switch Mode</button>
        </div>
      </div>
      <div class="action-row" style="justify-content:space-between;">
        <div class="action-row">
          <button type="button" class="btn btn-primary" id="btn-stage-advance" data-testid="webui-dispatch-advance-btn">Run Gate &amp; Advance Stage</button>
          <button type="button" class="btn btn-approve" id="btn-dispatch-active" data-testid="webui-dispatch-active-btn">Dispatch to Antigravity</button>
          <label class="action-row muted" style="gap:6px;cursor:pointer;">
            <input type="checkbox" id="chk-reset-circuit" data-testid="webui-dispatch-reset-circuit" />
            <span id="lbl-reset-circuit">Reset Circuit Breaker</span>
          </label>
        </div>
        <button type="button" class="btn btn-xs btn-mini-status" id="dispatch-status-mini" data-testid="webui-dispatch-status-mini">-</button>
      </div>
      <pre class="codebox" id="dispatch-output" data-testid="webui-dispatch-output"></pre>
      <div class="toast" id="dispatch-feedback" data-testid="webui-dispatch-feedback"></div>
      <h3 class="card-title" id="lbl-audit-title" style="font-size:0.88rem;margin:4px 0 0;">Live Audit Trail &amp; Add-ons</h3>
      <div class="stream-log" id="audit-stream" data-testid="webui-audit-stream"></div>
      <div id="addons-list" data-testid="webui-addons-list"></div>
    </section>
  </main>

  <!-- Modal 1: New Project Wizard + Built-in Folder Browser -->
  <div class="modal-backdrop hidden" id="modal-new-project" data-testid="webui-new-project-modal">
    <div class="modal-card">
      <div class="card-header">
        <h2 class="card-title" id="lbl-wizard-title">+ New Project / مشروع جديد</h2>
        <button type="button" class="btn btn-xs" id="btn-wizard-close" data-testid="webui-wizard-cancel-btn">Close</button>
      </div>
      <div class="mode-cards">
        <div class="mode-card selected" id="wizard-mode-ba" data-testid="webui-wizard-mode-ba" tabindex="0">
          <strong id="lbl-mode-ba-title">BA Only (From Documents)</strong>
          <span class="muted" id="lbl-mode-ba-desc">Starts BA Context Hub + _intake/ folder for BRD/RFP/PDF specs (no code required).</span>
        </div>
        <div class="mode-card" id="wizard-mode-full" data-testid="webui-wizard-mode-full" tabindex="0">
          <strong id="lbl-mode-full-title">Full Lifecycle (Existing Code / Prototype)</strong>
          <span class="muted" id="lbl-mode-full-desc">Auto-detects stack, installs .ai/ & .agrules, maps codebase & initializes BA Hub.</span>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
        <label class="field"><span id="lbl-wizard-name">Project Name</span><input class="input" type="text" id="wizard-name" data-testid="webui-wizard-name" placeholder="Enterprise Portal" /></label>
        <label class="field"><span id="lbl-wizard-code">Project Code</span><input class="input" type="text" id="wizard-code" data-testid="webui-wizard-code" placeholder="ENT" /></label>
      </div>
      <div class="field">
        <span id="lbl-wizard-path">Target Project Folder</span>
        <div class="action-row" style="flex-wrap:nowrap;">
          <input class="input" type="text" id="wizard-path" data-testid="webui-wizard-path" placeholder="/path/to/project-folder" />
          <button type="button" class="btn" id="btn-wizard-browse" data-testid="webui-wizard-browse-btn">Browse...</button>
        </div>
      </div>
      <div class="fs-panel hidden" id="fs-browser-panel" data-testid="webui-fs-browser-panel">
        <div class="action-row" style="justify-content:space-between;">
          <span class="mono muted" id="fs-current-dir">-</span>
          <div class="action-row">
            <button type="button" class="btn btn-xs" id="btn-fs-up" data-testid="webui-fs-up-btn">Up</button>
            <button type="button" class="btn btn-xs hidden" id="btn-fs-drives" data-testid="webui-fs-drives-btn">Drives</button>
          </div>
        </div>
        <div class="action-row" id="fs-shortcuts-row"></div>
        <div class="fs-list" id="fs-browser-list" data-testid="webui-fs-browser-list"></div>
        <div class="action-row" style="flex-wrap:nowrap;">
          <input class="input" type="text" id="fs-new-folder" data-testid="webui-fs-new-folder" placeholder="Optional new subfolder name..." />
          <button type="button" class="btn btn-approve" id="btn-fs-select" data-testid="webui-fs-select-btn">Use Folder</button>
        </div>
      </div>
      <div class="action-row" style="justify-content:space-between;">
        <span class="toast" id="wizard-feedback" data-testid="webui-wizard-feedback"></span>
        <button type="button" class="btn btn-primary" id="btn-wizard-submit" data-testid="webui-wizard-submit-btn">Create & Launch</button>
      </div>
    </div>
  </div>

  <!-- Modal 2: Attach Code Repository to BA_ONLY_HUB -->
  <div class="modal-backdrop hidden" id="modal-attach-repo" data-testid="webui-attach-repo-modal">
    <div class="modal-card">
      <div class="card-header">
        <h2 class="card-title" id="lbl-attach-title">Attach Code Repository / ربط بمستودع الكود</h2>
        <button type="button" class="btn btn-xs" id="btn-attach-close" data-testid="webui-attach-cancel-btn">Close</button>
      </div>
      <p class="muted" id="lbl-attach-desc" style="margin:0;">Links your current sealed Context Hub into the selected engineering code folder, installs .ai/ & .agrules, and promotes this workspace to FULL_LIFECYCLE.</p>
      <div class="field">
        <span id="lbl-attach-path">Target Code Repository Folder</span>
        <div class="action-row" style="flex-wrap:nowrap;">
          <input class="input" type="text" id="attach-path" data-testid="webui-attach-path" placeholder="/path/to/code-repo" />
          <button type="button" class="btn" id="btn-attach-browse" data-testid="webui-attach-browse-btn">Browse...</button>
        </div>
      </div>
      <div id="attach-fs-slot"></div>
      <div class="action-row" style="justify-content:space-between;">
        <span class="toast" id="attach-feedback" data-testid="webui-attach-feedback"></span>
        <button type="button" class="btn btn-primary" id="btn-attach-submit" data-testid="webui-attach-submit-btn">Attach &amp; Promote</button>
      </div>
    </div>
  </div>

  <!-- Modal 3: Stage Dispatch Action Guide -->
  <div class="modal-backdrop hidden" id="modal-dispatch-guide" data-testid="webui-dispatch-modal">
    <div class="modal-card" style="max-width:820px;">
      <div class="card-header">
        <div class="action-row">
          <h2 class="card-title" id="lbl-dispatch-modal-title">Stage Dispatch Guide</h2>
          <span class="badge badge-warn" id="dispatch-modal-blockers">-</span>
        </div>
        <button type="button" class="btn btn-xs" id="btn-dispatch-modal-close" data-testid="webui-modal-dispatch-close-btn">Close</button>
      </div>
      <div class="alert-box alert-ok" id="dispatch-modal-banner">-</div>
      <div id="dispatch-modal-steps" class="muted" style="line-height:1.55;">-</div>
      <div>
        <strong class="muted" id="lbl-dispatch-modal-files">Target Files in Scope:</strong>
        <div id="dispatch-modal-files" style="margin-top:4px;"></div>
      </div>
      <textarea readonly dir="ltr" class="input prompt-box" id="modal-dispatch-prompt" data-testid="webui-dispatch-modal-prompt" rows="10"></textarea>
      <div class="action-row">
        <button type="button" class="btn btn-primary" id="btn-modal-copy-full" data-testid="webui-modal-copy-full-btn">Copy Full AI Prompt</button>
        <button type="button" class="btn" id="btn-modal-copy-slash" data-testid="webui-modal-copy-slash-btn">Copy /os-advance (MCP)</button>
        <button type="button" class="btn btn-approve" id="btn-modal-advance" data-testid="webui-modal-advance-btn">Verify Gate &amp; Advance Stage</button>
        <button type="button" class="btn btn-approve hidden" id="btn-modal-approve-chk" data-testid="webui-modal-approve-chk-btn">Approve Checkpoint</button>
      </div>
      <div class="toast" id="dispatch-modal-feedback" data-testid="webui-dispatch-modal-feedback"></div>
    </div>
  </div>

  <script>
    (function () {
      'use strict';

      var STAGES_META = ${stagesJson};
      var ROLES_META = ${rolesJson};
      var TRACK_A = ${trackAJson};
      var TRACK_B = ${trackBJson};
      var SESSION_TOKEN = (document.querySelector('meta[name="os-session-token"]') || {}).content || '';

      var I18N = {
        en: {
          appTitle: 'InnovaDigits Role Wizard',
          newProjectBtn: '+ New Project',
          attachRepoBtn: 'Attach Code Repo',
          welcomeTitle: 'Welcome to InnovaDigits AI Engineering OS',
          welcomeDesc: 'No workspace is active yet. Create a BA-Only hub from documents (BRD/RFP/PDF) or bootstrap a Full Lifecycle repository with automatic stack detection — zero terminal commands required.',
          welcomeCta: '+ Create Your First Project',
          roleBarTitle: 'My Role:',
          roleNames: {
            BA: 'BA Analyst',
            TECH_LEAD: 'Tech Lead',
            DEV: 'Developer',
            SECURITY: 'Security',
            QA: 'QA',
            PM: 'PM / Release',
            ALL: 'All Steps'
          },
          stepperTitle: 'Your Unlocked & Completed Steps',
          stepperMetaFmt: '{n} step(s) visible',
          stepStatusDone: 'Completed',
          stepStatusCurrent: 'Current',
          stepStatusPaused: 'Needs Approval',
          waitingTitle: 'Waiting for Earlier Steps',
          waitingDescFmt: 'Project is currently at step #{idx} ({stage}) owned by {owner}. Your step will unlock here automatically once ready.',
          roleCompleteText: 'All steps for {role} are complete and handed over! Click any completed step below to review it.',
          reviewRibbonText: 'You are reviewing an earlier completed step.',
          returnCurrentBtn: 'Go to Active Step',
          intakeTitle: 'Upload Requirements & Schemas (_intake/)',
          dropzoneMain: 'Drag & drop BRD, RFP, PDF, DOCX, XLSX, SQL or Markdown files here — or click to browse',
          dropzoneSub: 'Allowed: .md, .txt, .pdf, .docx, .xlsx, .sql (stored safely in _intake/)',
          wizardTitle: '+ New Project Wizard',
          attachTitle: 'Attach Code Repository (Promote to Full Lifecycle)',
          wizardSubmit: 'Create & Launch',
          attachSubmit: 'Attach & Promote',
          coreHealth: 'Core Hub Documents Status',
          sprintPlanPane: 'Roadmap Waves & WBS Status',
          featureMatrix: 'Feature Specifications & Gate A Matrix',
          gateaPane: 'Strict BA Hub Verification & Manifest Seal',
          gatebTitle: 'Gate B (ENG-01..10) & Drift Radar',
          inboxTitle: 'Implementation Waves & Role Handoffs',
          secperfTitle: 'Security Posture, 183-Control Checklist & Performance',
          qaPane: 'OpenAPI, Postman & QA Cycle Handoff Pack',
          releasePane: 'Release Readiness & Attestation Seal',
          crTitle: 'Change Request (CR) Delta Evolution',
          checkpointsTitle: 'Human Checkpoint Approval Required',
          chkActorLabel: 'Your Name',
          chkRoleLabel: 'Role',
          chkNotesLabel: 'Approval Notes',
          dispatchTitle: 'Advanced Prompt Output & Manual Gate Runner',
          auditTitle: 'Live Audit Trail & Add-ons',
          advancedTitle: 'Advanced System Controls & Audit Log',
          baVerifyBtn: 'Run BA Strict Verify',
          approveBtn: 'Approve Step & Continue',
          rejectBtn: 'Reject',
          advanceBtn: 'Run Gate & Advance Stage',
          dispatchBtn: 'Dispatch to Antigravity',
          resetCircuit: 'Reset Circuit Breaker',
          switchMode: 'Switch Mode',
          themeBtn: 'Theme',
          pendingWaiting: 'Checkpoint awaiting your decision',
          noCheckpointPending: 'No checkpoint currently paused.',
          sseConnected: 'SSE: LIVE',
          sseError: 'SSE: RECONNECTING',
          dispatchedMsg: 'Ready AI Prompt copied! Paste it into Antigravity / Cursor chat, then click Verify & Next Step.',
          step1Title: 'Step 1: Copy Ready AI Prompt',
          step1Desc: 'Generates a self-contained prompt with exact files, _intake/ sources, and blockers for this step.',
          guideDispatchBtn: 'Copy AI Prompt & Open Guide',
          step2Title: 'Step 2: Paste in Antigravity / Cursor Chat',
          step2Desc: 'Open this project folder in your IDE chat, paste (Ctrl+V), and let the AI write/fix the target files.',
          step3Title: 'Step 3: Verify & Continue',
          step3Desc: 'Checks all rules deterministically and unlocks the next step (or pauses for approval).',
          guideAdvanceBtn: 'Verify & Next Step',
          activeFilesTitle: 'Files in Scope for This Step:',
          activeDiagsTitle: 'Step Checks / Remaining Items:',
          stepCompletedMsg: 'This step is complete and verified.',
          reviewDispatchBtn: 'View / Copy Prompt for Review',
          prevStepBtn: 'Previous Step',
          nextStepBtn: 'Next Step',
          noBlockersMsg: '0 blockers detected — click Verify & Next Step!',
          blockersFound: 'item(s) to fix',
          readyVerifyBadge: 'Ready to Verify',
          awaitingApprovalBadge: 'Awaiting Approval',
          completedBadge: 'Completed',
          autoGenLabel: 'auto-generated on Verify',
          missingLabel: 'missing',
          dispatchModalTitle: 'Step Action Guide — Send to AI Chat',
          modalFilesTitle: 'Target Files in Scope:',
          copyFullBtn: 'Copy Full AI Prompt',
          copySlashBtn: 'Copy /os-advance (MCP)',
          closeBtn: 'Close',
          copiedBanner: 'AI Step Prompt copied to clipboard! Paste (Ctrl+V) in Antigravity / Cursor chat on this project.',
          copyFallbackBanner: 'Prompt ready below — click "Copy Full AI Prompt", then paste in Antigravity / Cursor chat.',
          dispatchStepsLead: 'What to do next:',
          lastDispatchedLabel: 'Open Last Dispatch Guide:',
          noDispatchYet: 'No IDE prompt dispatched yet',
          stageGuides: {
            INTAKE: { short: '1. Intake & Docs', title: 'Step 1: Codebase & BRD Discovery Intake', desc: 'Upload BRDs, RFPs, SQL schemas, or inspect prototype intake artifacts before writing specs.' },
            CORE_BOOTSTRAP: { short: '2. Core Hub Setup', title: 'Step 2: Core Project Context & Catalogs', desc: 'Populate PROJECT_CONTEXT.md, GLOSSARY_AND_ENUMS.md, and SEED_DEFAULTS_CATALOG.md with zero placeholders.' },
            SPRINT_PLAN: { short: '3. Sprint Plan', title: 'Step 3: Roadmap Waves & 5-Level WBS', desc: 'Complete SPRINT_MASTER_PLAN.md, BACKLOG_WBS.md, and CHANGE_IMPACT_REGISTER.md with real domain waves.' },
            SPRINT_SPECS: { short: '4. Feature Specs', title: 'Step 4: Sprint Feature Specifications (Gate A)', desc: 'Author complete FEATURE-*.md specs inside 02-sprints/ with 0 placeholders before sealing Gate A.' },
            GATE_A_SEAL: { short: '5. Seal Gate A', title: 'Step 5: Strict Verification & BA Seal', desc: 'Pass strict verification, seal SPRINT_<ID>_MANIFEST.md, and export RTM_MATRIX.csv for Engineering handover.' },
            GATE_B_ENG: { short: '6. Gate B Eng', title: 'Step 6: Engineering Gate B & Drift Check', desc: 'Populate Section 11 (ENG-01..10) on sealed features via eng-gate and verify zero architecture drift.' },
            DEV_IMPLEMENT: { short: '7. Implement', title: 'Step 7: Wave Implementation & Attestation', desc: 'Build backend & frontend modules in Wave 1 -> 2 -> 3 order and emit DEV_IMPLEMENTATION_ATTESTATION.json.' },
            SECURITY_PERF_GATE: { short: '8. Security & Perf', title: 'Step 8: Security, Perf & 183-Control Pentest', desc: 'Clear security fuzzer, performance predictor, and 183-control checklist with 0 Critical/High defects.' },
            QA_HANDOFF: { short: '9. QA Handoff', title: 'Step 9: OpenAPI, Postman & QA Pack', desc: 'Compile unified OpenAPI, chained Postman collections, and deterministic CYCLE-*_HANDOFF.md docs.' },
            RELEASE_SEAL: { short: '10. Release Seal', title: 'Step 10: Final Release Attestation', desc: 'Confirm all compliance gates passed and seal RELEASE_<ID>_ATTESTATION.json.' },
            DELTA_EVOLVE: { short: 'CR / Delta', title: 'Change Request: Was -> Current Delta', desc: 'Compile a traceable Change Request delta against sealed features without breaking baseline history.' },
            COMPLETED: { short: 'Completed', title: 'All Pipeline Steps Complete', desc: 'Baseline release is sealed. Review any step or trigger a Change Request.' }
          }
        },
        ar: {
          appTitle: 'معالج المراحل حسب الدور — InnovaDigits',
          newProjectBtn: '+ مشروع جديد',
          attachRepoBtn: 'ربط بمستودع الكود',
          welcomeTitle: 'مرحباً بك في نظام InnovaDigits للهندسة الذكية',
          welcomeDesc: 'لا يوجد مشروع نشط حالياً. أنشئ مشروع تحليل أعمال من المستندات (BRD/RFP/PDF) أو اربط مستودع كود قائم — بدون أي أوامر طرفية.',
          welcomeCta: '+ إنشاء أول مشروع',
          roleBarTitle: 'أنا أعمل بدور:',
          roleNames: {
            BA: 'محلل الأعمال (BA)',
            TECH_LEAD: 'القائد التقني (Tech Lead)',
            DEV: 'المطور (Developer)',
            SECURITY: 'الأمن والأداء',
            QA: 'ضمان الجودة (QA)',
            PM: 'مدير المشروع / الإطلاق',
            ALL: 'كل الخطوات'
          },
          stepperTitle: 'الخطوات المكتملة والمتاحة لك حالياً',
          stepperMetaFmt: 'يظهر {n} خطوات',
          stepStatusDone: 'مكتملة',
          stepStatusCurrent: 'الحالية',
          stepStatusPaused: 'بانتظار الاعتماد',
          waitingTitle: 'بانتظار إكمال المراحل السابقة',
          waitingDescFmt: 'المشروع حالياً في الخطوة #{idx} ({stage}) لدى دور {owner}. ستظهر خطوتك هنا تلقائياً فور فتحها.',
          roleCompleteText: 'اكتملت جميع خطوات {role} بنجاح! يمكنك الضغط على أي خطوة مكتملة أدناه لمراجعتها.',
          reviewRibbonText: 'أنت تستعرض الآن خطوة مكتملة للمراجعة فقط.',
          returnCurrentBtn: 'العودة للخطوة الحالية',
          intakeTitle: 'رفع ملفات المتطلبات وقواعد البيانات (_intake/)',
          dropzoneMain: 'اسحب وأفلت ملفات BRD / RFP / PDF / DOCX / XLSX / SQL هنا — أو انقر للاختيار',
          dropzoneSub: 'الامتدادات المسموحة: .md, .txt, .pdf, .docx, .xlsx, .sql',
          wizardTitle: '+ معالج إنشاء مشروع جديد',
          attachTitle: 'ربط بمستودع الكود (ترقية إلى دورة حياة كاملة)',
          wizardSubmit: 'إنشاء وتشغيل',
          attachSubmit: 'ربط وترقية المشروع',
          coreHealth: 'حالة مستندات المحور الأساسي',
          sprintPlanPane: 'حالة موجات التنفيذ وتخطيط السبرنت',
          featureMatrix: 'مواصفات المزايا ومصفوفة Gate A',
          gateaPane: 'الفحص الصارم وختم مانيفيست التحليل',
          gatebTitle: 'بوابة الهندسة Gate B ومؤشر الانجراف',
          inboxTitle: 'موجات التنفيذ وصندوق تسليم الأدوار',
          secperfTitle: 'الوضع الأمني (183 معياراً) وتقرير الأداء',
          qaPane: 'عقود OpenAPI ومجموعات Postman وتسليم الـ QA',
          releasePane: 'شهادة جاهزية الإطلاق وختم الإصدار',
          crTitle: 'إدارة طلبات التغيير (Change Requests)',
          checkpointsTitle: 'مطلوب اعتمادك البشري للاستمرار',
          chkActorLabel: 'الاسم',
          chkRoleLabel: 'الدور',
          chkNotesLabel: 'ملاحظات الاعتماد',
          dispatchTitle: 'مخرجات التوجيه التفصيلية وتشغيل البوابة يدوياً',
          auditTitle: 'سجل التدقيق والإضافات',
          advancedTitle: 'إعدادات النظام المتقدمة وسجل التدقيق',
          baVerifyBtn: 'تشغيل فحص BA الصارم',
          approveBtn: 'اعتماد الخطوة والمتابعة',
          rejectBtn: 'رفض',
          advanceBtn: 'تشغيل البوابة والتقدم',
          dispatchBtn: 'إرسال إلى Antigravity',
          resetCircuit: 'إعادة ضبط قاطع الدائرة',
          switchMode: 'تبديل الوضع',
          themeBtn: 'المظهر',
          pendingWaiting: 'نقطة اعتماد بانتظار قرارك',
          noCheckpointPending: 'لا توجد نقطة اعتماد متوقفة حالياً.',
          sseConnected: 'متصل مباشر',
          sseError: 'إعادة اتصال',
          dispatchedMsg: 'تم نسخ التوجيه الكامل! الصقه في محادثة Antigravity / Cursor ثم اضغط "فحص والانتقال للتالي".',
          step1Title: 'الخطوة 1: نسخ التوجيه الجاهز للذكاء الاصطناعي',
          step1Desc: 'ينسخ أمراً متكاملاً يتضمن الملفات المطلوبة ومصادر _intake/ والملاحظات الحالية لهذه الخطوة.',
          guideDispatchBtn: 'نسخ التوجيه وفتح الدليل',
          step2Title: 'الخطوة 2: اللصق في محادثة Antigravity / Cursor',
          step2Desc: 'افتح مجلد المشروع في بيئة التطوير، الصق النص (Ctrl+V)، ودع الذكاء الاصطناعي يكتب/يحدّث الملفات المطلوبة.',
          step3Title: 'الخطوة 3: الفحص والمتابعة',
          step3Desc: 'يفحص كافة الشروط برمجياً ويفتح الخطوة التالية (أو يطلب اعتمادك البشري).',
          guideAdvanceBtn: 'فحص والانتقال للتالي',
          activeFilesTitle: 'الملفات المطلوب العمل عليها في هذه الخطوة:',
          activeDiagsTitle: 'الفحوصات / البنود المتبقية لاجتياز الخطوة:',
          stepCompletedMsg: 'تم إكمال هذه الخطوة واجتياز فحصها بنجاح.',
          reviewDispatchBtn: 'عرض / نسخ التوجيه للمراجعة',
          prevStepBtn: 'الخطوة السابقة',
          nextStepBtn: 'الخطوة التالية',
          noBlockersMsg: 'لا توجد أي أخطاء متبقية — اضغط "فحص والانتقال للتالي"!',
          blockersFound: 'بنود تحتاج معالجة',
          readyVerifyBadge: 'جاهز للفحص',
          awaitingApprovalBadge: 'بانتظار الاعتماد البشري',
          completedBadge: 'مكتملة',
          autoGenLabel: 'يُنشأ تلقائياً عند الفحص',
          missingLabel: 'مفقود',
          dispatchModalTitle: 'دليل تنفيذ الخطوة — إرسال لمحادثة الذكاء الاصطناعي',
          modalFilesTitle: 'الملفات المطلوبة في هذه الخطوة:',
          copyFullBtn: 'نسخ التوجيه الكامل',
          copySlashBtn: 'نسخ /os-advance (MCP)',
          closeBtn: 'إغلاق',
          copiedBanner: 'تم نسخ التوجيه الكامل! الصقه (Ctrl+V) في محادثة Antigravity / Cursor على هذا المشروع.',
          copyFallbackBanner: 'التوجيه جاهز بالأسفل — اضغط "نسخ التوجيه الكامل" ثم الصقه في محادثة Antigravity / Cursor.',
          dispatchStepsLead: 'ما يجب فعله الآن:',
          lastDispatchedLabel: 'فتح دليل آخر إرسال:',
          noDispatchYet: 'لم يتم إرسال أي توجيه بعد',
          stageGuides: {
            INTAKE: { short: '1. رفع المتطلبات', title: 'الخطوة 1: استكشاف الكود ورفع المتطلبات', desc: 'ارفع ملفات BRD / RFP / SQL أو راجع حزمة الاستكشاف قبل كتابة المواصفات.' },
            CORE_BOOTSTRAP: { short: '2. تأسيس المحور', title: 'الخطوة 2: تأسيس ملفات المحور الأساسي والكتالوجات', desc: 'تعبئة PROJECT_CONTEXT و GLOSSARY_AND_ENUMS و SEED_DEFAULTS بدون أي نصوص مؤقتة.' },
            SPRINT_PLAN: { short: '3. خطة السبرنت', title: 'الخطوة 3: تخطيط موجات التنفيذ والـ WBS', desc: 'إكمال SPRINT_MASTER_PLAN و BACKLOG_WBS و CHANGE_IMPACT_REGISTER بالموجات الفعلية.' },
            SPRINT_SPECS: { short: '4. مواصفات المزايا', title: 'الخطوة 4: كتابة مواصفات المزايا (Gate A)', desc: 'إعداد ملفات FEATURE-*.md في 02-sprints/ كاملة 100% تمهيداً لختم التحليل.' },
            GATE_A_SEAL: { short: '5. ختم التحليل', title: 'الخطوة 5: الفحص الصارم وختم Gate A', desc: 'اجتياز الفحص الصارم، ختم SPRINT_MANIFEST، وتصدير RTM_MATRIX.csv للتطوير.' },
            GATE_B_ENG: { short: '6. بوابة الهندسة', title: 'الخطوة 6: الجاهزية الهندسية Gate B وفحص الانجراف', desc: 'ربط القسم 11 (ENG-01..10) بالمزايا المعتمدة والتأكد من التطابق المعماري مع الكود.' },
            DEV_IMPLEMENT: { short: '7. تنفيذ الكود', title: 'الخطوة 7: بناء الوحدات وتوثيق التنفيذ', desc: 'تنفيذ وحدات الخلفية والواجهة على موجات (Wave 1 -> 2 -> 3) وتوثيق الشهادة.' },
            SECURITY_PERF_GATE: { short: '8. الأمن والأداء', title: 'الخطوة 8: فحص الأمان (183 معياراً) والأداء', desc: 'اجتياز فحوصات الأمان والأداء وقائمة الـ 183 بنداً بدون أي ثغرات حرجة أو عالية.' },
            QA_HANDOFF: { short: '9. تسليم QA', title: 'الخطوة 9: حزمة OpenAPI و Postman وملف الـ QA', desc: 'توليد عقد OpenAPI و Postman Collections ووثائق CYCLE-*_HANDOFF لاختبار النظام.' },
            RELEASE_SEAL: { short: '10. ختم الإصدار', title: 'الخطوة 10: شهادة الإطلاق النهائية', desc: 'التأكد من جميع البوابات وإصدار RELEASE_ATTESTATION وختم خط الأساس.' },
            DELTA_EVOLVE: { short: 'طلبات التغيير CR', title: 'مسار التغيير: توثيق الفروقات (Was -> Current)', desc: 'إصدار تعديلات ما بعد الإطلاق بأمان مع الحفاظ التام على المزايا المختومة.' },
            COMPLETED: { short: 'مكتمل', title: 'تم إكمال جميع الخطوات بنجاح', desc: 'الإصدار الأساسي مختوم. يمكنك مراجعة أي خطوة أو فتح طلب تغيير جديد.' }
          }
        }
      };

      var ROLE_STAGE_MAP = {
        BA: ['INTAKE', 'CORE_BOOTSTRAP', 'SPRINT_PLAN', 'SPRINT_SPECS', 'GATE_A_SEAL', 'DELTA_EVOLVE'],
        TECH_LEAD: ['GATE_B_ENG'],
        DEV: ['DEV_IMPLEMENT'],
        SECURITY: ['SECURITY_PERF_GATE'],
        QA: ['QA_HANDOFF'],
        PM: ['RELEASE_SEAL'],
        ALL: STAGES_META.map(function (s) { return s.id; })
      };

      var uiState = {
        lang: 'en',
        theme: 'light',
        selectedRole: 'BA',
        selectedWizardStage: null,
        lastSnapProjectKey: '',
        lastObservedCurrentStage: '',
        wizardMode: 'BA_ONLY',
        browserTarget: 'wizard',
        currentBrowseDir: '',
        browseParentDir: null,
        lastDispatchedPayload: null,
        snapshot: null,
        eventFeed: []
      };

      function esc(val) {
        return String(val === null || val === undefined ? '' : val)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }
      function t(k) { return (I18N[uiState.lang] && I18N[uiState.lang][k]) || I18N.en[k] || k; }

      function pushFeed(type, msg) {
        uiState.eventFeed.unshift({ time: new Date().toLocaleTimeString(), type: type, message: msg });
        if (uiState.eventFeed.length > 25) uiState.eventFeed.length = 25;
        renderFeed();
      }

      function renderFeed() {
        var el = document.getElementById('audit-stream');
        if (!el) return;
        el.innerHTML = uiState.eventFeed.length === 0
          ? '<div class="muted">-</div>'
          : uiState.eventFeed.map(function (ev) {
              return '<div class="log-entry"><span class="mono muted">[' + esc(ev.time) + ']</span> <strong>' + esc(ev.type) + '</strong>: ' + esc(ev.message) + '</div>';
            }).join('');
      }

      function computeVisibleSteps(snap, role) {
        var ids = ROLE_STAGE_MAP[role] || ROLE_STAGE_MAP.BA;
        var lcScope = (snap.lifecycle && snap.lifecycle.lifecycleScope) || 'FULL_LIFECYCLE';
        if (lcScope === 'BA_ONLY_HUB' && role === 'ALL') {
          ids = ROLE_STAGE_MAP.BA;
        }
        return ids.filter(function (id) {
          var st = (snap.stages && snap.stages[id]) || {};
          if (st.status === 'PASSED') return true;
          if (id === 'DELTA_EVOLVE') {
            var gateA = (snap.stages && snap.stages.GATE_A_SEAL) || {};
            return gateA.status === 'PASSED' || snap.currentStage === 'DELTA_EVOLVE';
          }
          return snap.currentStage === id;
        });
      }

      function applyLocaleAndTheme() {
        var html = document.documentElement;
        html.lang = uiState.lang;
        html.dir = uiState.lang === 'ar' ? 'rtl' : 'ltr';
        html.setAttribute('data-theme', uiState.theme);
        document.getElementById('lbl-app-title').textContent = t('appTitle');
        document.getElementById('btn-new-project').textContent = t('newProjectBtn');
        document.getElementById('btn-attach-repo').textContent = t('attachRepoBtn');
        document.getElementById('lbl-welcome-title').textContent = t('welcomeTitle');
        document.getElementById('lbl-welcome-desc').textContent = t('welcomeDesc');
        document.getElementById('btn-welcome-new-project').textContent = t('welcomeCta');
        document.getElementById('lbl-role-bar-title').textContent = t('roleBarTitle');
        var rn = t('roleNames') || {};
        document.getElementById('tab-view-ba').textContent = rn.BA || 'BA Analyst';
        document.getElementById('role-pill-TECH_LEAD').textContent = rn.TECH_LEAD || 'Tech Lead';
        document.getElementById('tab-view-eng').textContent = rn.DEV || 'Developer';
        document.getElementById('role-pill-SECURITY').textContent = rn.SECURITY || 'Security';
        document.getElementById('role-pill-QA').textContent = rn.QA || 'QA';
        document.getElementById('role-pill-PM').textContent = rn.PM || 'PM';
        document.getElementById('role-pill-ALL').textContent = rn.ALL || 'All Steps';
        document.getElementById('lbl-stepper-title').textContent = t('stepperTitle');
        document.getElementById('lbl-waiting-title').textContent = t('waitingTitle');
        document.getElementById('lbl-review-ribbon-text').textContent = t('reviewRibbonText');
        document.getElementById('btn-return-current-step').textContent = t('returnCurrentBtn');
        document.getElementById('lbl-intake-title').textContent = t('intakeTitle');
        document.getElementById('lbl-dropzone-main').textContent = t('dropzoneMain');
        document.getElementById('lbl-dropzone-sub').textContent = t('dropzoneSub');
        document.getElementById('lbl-wizard-title').textContent = t('wizardTitle');
        document.getElementById('lbl-attach-title').textContent = t('attachTitle');
        document.getElementById('btn-wizard-submit').textContent = t('wizardSubmit');
        document.getElementById('btn-attach-submit').textContent = t('attachSubmit');
        document.getElementById('lbl-core-health').textContent = t('coreHealth');
        document.getElementById('lbl-sprint-plan-pane').textContent = t('sprintPlanPane');
        document.getElementById('lbl-feature-matrix').textContent = t('featureMatrix');
        document.getElementById('lbl-gatea-pane').textContent = t('gateaPane');
        document.getElementById('lbl-gateb-title').textContent = t('gatebTitle');
        document.getElementById('lbl-inbox-title').textContent = t('inboxTitle');
        document.getElementById('lbl-secperf-title').textContent = t('secperfTitle');
        document.getElementById('lbl-qa-pane').textContent = t('qaPane');
        document.getElementById('lbl-release-pane').textContent = t('releasePane');
        document.getElementById('lbl-cr-title').textContent = t('crTitle');
        document.getElementById('lbl-checkpoints-title').textContent = t('checkpointsTitle');
        document.getElementById('lbl-chk-actor').textContent = t('chkActorLabel');
        document.getElementById('lbl-chk-role').textContent = t('chkRoleLabel');
        document.getElementById('lbl-chk-notes').textContent = t('chkNotesLabel');
        document.getElementById('lbl-audit-title').textContent = t('auditTitle');
        document.getElementById('lbl-advanced-title').textContent = t('advancedTitle');
        document.getElementById('btn-ba-verify').textContent = t('baVerifyBtn');
        document.getElementById('btn-chk-approve').textContent = t('approveBtn');
        document.getElementById('btn-chk-reject').textContent = t('rejectBtn');
        document.getElementById('btn-stage-advance').textContent = t('advanceBtn');
        document.getElementById('btn-dispatch-active').textContent = t('dispatchBtn');
        document.getElementById('lbl-reset-circuit').textContent = t('resetCircuit');
        document.getElementById('btn-mode-toggle').textContent = t('switchMode');
        document.getElementById('btn-theme-toggle').textContent = t('themeBtn');
        document.getElementById('lbl-step1-title').textContent = t('step1Title');
        document.getElementById('lbl-step1-desc').textContent = t('step1Desc');
        document.getElementById('btn-guide-dispatch').textContent = t('guideDispatchBtn');
        document.getElementById('lbl-step2-title').textContent = t('step2Title');
        document.getElementById('lbl-step2-desc').textContent = t('step2Desc');
        document.getElementById('lbl-step3-title').textContent = t('step3Title');
        document.getElementById('lbl-step3-desc').textContent = t('step3Desc');
        document.getElementById('btn-guide-advance').textContent = t('guideAdvanceBtn');
        document.getElementById('lbl-active-files-title').textContent = t('activeFilesTitle');
        document.getElementById('lbl-active-diags-title').textContent = t('activeDiagsTitle');
        document.getElementById('lbl-step-completed-msg').textContent = '✔ ' + t('stepCompletedMsg');
        document.getElementById('btn-review-dispatch').textContent = t('reviewDispatchBtn');
        document.getElementById('btn-wizard-prev').textContent = (uiState.lang === 'ar' ? '→ ' : '← ') + t('prevStepBtn');
        document.getElementById('btn-wizard-next').textContent = t('nextStepBtn') + (uiState.lang === 'ar' ? ' ←' : ' →');
        document.getElementById('lbl-dispatch-modal-title').textContent = t('dispatchModalTitle');
        document.getElementById('lbl-dispatch-modal-files').textContent = t('modalFilesTitle');
        document.getElementById('btn-modal-copy-full').textContent = t('copyFullBtn');
        document.getElementById('btn-modal-copy-slash').textContent = t('copySlashBtn');
        document.getElementById('btn-modal-advance').textContent = t('guideAdvanceBtn');
        document.getElementById('btn-modal-approve-chk').textContent = t('approveBtn');
        document.getElementById('btn-dispatch-modal-close').textContent = t('closeBtn');
        if (uiState.snapshot) renderAll(uiState.snapshot);
      }

      function renderAll(snap) {
        uiState.snapshot = snap;
        var lc = snap.lifecycle || {};
        var isWelcome = Boolean(snap.welcomeMode);
        var projKey = String(snap.projectRoot || '') + '::' + String(snap.activeSprint || 'S1');

        if (!isWelcome) {
          if (projKey !== uiState.lastSnapProjectKey) {
            uiState.lastSnapProjectKey = projKey;
            uiState.lastObservedCurrentStage = '';
            uiState.selectedWizardStage = null;
          }
          if (lc.lifecycleScope === 'BA_ONLY_HUB' && ['TECH_LEAD', 'DEV', 'SECURITY', 'QA'].indexOf(uiState.selectedRole) !== -1) {
            uiState.selectedRole = 'BA';
          }
        }

        document.getElementById('status-project').textContent = isWelcome
          ? 'No active workspace'
          : ((snap.projectCode || 'PRJ') + ' • ' + (snap.projectRoot || '-') + '  |  Sprint ' + (snap.activeSprint || 'S1') + ' (' + (snap.semanticVersion || 'v1.0.0') + ')');
        document.getElementById('status-lifecycle').textContent = 'Scope: ' + (lc.lifecycleScope || 'AUTO');
        document.getElementById('status-sprint').textContent = 'Sprint: ' + (snap.activeSprint || 'S1') + ' (' + (snap.semanticVersion || 'v1.0.0') + ')';
        document.getElementById('status-mode').textContent = 'Mode: ' + (snap.mode || 'SOLO_FDE');
        document.getElementById('audit-semver').textContent = (snap.semanticVersion || 'v1.0.0') + (snap.releaseSealed ? ' • SEALED' : '');

        var openKeys = Object.keys((snap.circuitBreaker && snap.circuitBreaker.openStages) || {});
        var circuitEl = document.getElementById('status-circuit');
        circuitEl.className = openKeys.length > 0 ? 'badge badge-danger' : 'badge badge-ok';
        circuitEl.textContent = openKeys.length > 0 ? 'Circuit: TRIPPED (' + openKeys.join(', ') + ')' : 'Circuit: HEALTHY';

        var ba = snap.baSdlc || {};
        var ch = ba.coreHubHealth || {};
        var filesObj = ch.files || {};
        var coreKpis = Object.keys(filesObj).map(function (fn) {
          var f = filesObj[fn];
          return '<div class="kpi-box"><div class="kpi-label">' + esc(fn) + '</div><div class="kpi-val">' +
            (f.exists ? 'READY' : 'MISSING') + (f.tokenCount !== undefined ? ' (' + f.tokenCount + ')' : '') + '</div></div>';
        }).join('') +
        '<div class="kpi-box"><div class="kpi-label">ANTI-PLACEHOLDER-01</div><div class="kpi-val">' + esc(ch.antiPlaceholderViolationCount || 0) + ' violations</div></div>';
        document.getElementById('core-health-kpis').innerHTML = coreKpis;

        var vRes = ba.baStrictVerify || {};
        var verifyEl = document.getElementById('core-verify-summary');
        verifyEl.className = vRes.ok ? 'alert-box alert-ok' : 'alert-box';
        verifyEl.innerHTML = '<strong>BA Strict Verify:</strong> ' + (vRes.ok ? 'PASS' : 'ISSUES FOUND') +
          ' | Violations: ' + esc(vRes.violationCount || 0) + ' | Warnings: ' + esc(vRes.warningCount || 0);

        var features = ba.featureMatrix || [];
        document.getElementById('feature-matrix-count').textContent = features.length + ' features';
        document.getElementById('feature-matrix-body').innerHTML = features.length === 0
          ? '<tr><td colspan="7" class="muted">No features in active sprint.</td></tr>'
          : features.map(function (f) {
              return '<tr><td class="mono">' + esc(f.id) + '</td><td>' + esc(f.title) + '</td><td class="mono">W' + esc(f.wave) + '</td>' +
                '<td class="mono">' + esc(f.gateA) + '</td><td class="mono">' + esc(f.validPct) + '%</td>' +
                '<td class="mono">' + esc(f.featureSrd || '-') + '</td><td class="mono">' + esc(f.gateB) + '</td></tr>';
            }).join('');

        var cr = ba.crEvolution || {};
        var crEntries = cr.registerEntries || [];
        document.getElementById('cr-count-label').textContent = crEntries.length + ' CRs / ' + (cr.deltaFiles || []).length + ' Deltas';
        document.getElementById('cr-list').innerHTML = crEntries.map(function (r) {
          return '<div class="log-entry"><span class="mono">' + esc(r.crId) + '</span> [' + esc(r.version) + '] -> ' + esc(r.summary || r.target) + ' (' + esc(r.status) + ')</div>';
        }).join('') || '<div class="muted">No Change Requests recorded.</div>';

        var sa = snap.stackAware || {};
        var gb = sa.gateBAndDrift || {};
        var drift = gb.driftRadar || {};
        document.getElementById('drift-status-badge').textContent = (drift.status || 'MISSING') + (drift.healthScore !== null ? ' • ' + drift.healthScore + '%' : '');
        document.getElementById('gateb-kpis').innerHTML =
          '<div class="kpi-box"><div class="kpi-label">ENG-01..10 Passed</div><div class="kpi-val">' + esc(gb.engPassedRows || 0) + ' / ' + esc((gb.engPassedRows || 0) + (gb.engPendingRows || 0) + (gb.engFailedRows || 0)) + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">API Routes Discovered</div><div class="kpi-val">' + esc(gb.discoveredApiRoutesCount || 0) + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Literal data-testid Bindings</div><div class="kpi-val">' + esc(gb.literalTestIdsCount || 0) + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Drift Radar Health</div><div class="kpi-val">' + esc(drift.healthScore !== null ? drift.healthScore + '%' : drift.status) + '</div></div>';

        var sp = sa.securityPerfQa || {};
        document.getElementById('secperf-posture').textContent = (sp.securityAudit && sp.securityAudit.posture) || 'MISSING';
        document.getElementById('secperf-kpis').innerHTML =
          '<div class="kpi-box"><div class="kpi-label">Security Audit</div><div class="kpi-val">' + esc((sp.securityAudit && sp.securityAudit.posture) || 'MISSING') + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Perf Predictor</div><div class="kpi-val">' + esc((sp.performanceReport && sp.performanceReport.status) || 'MISSING') + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Checklist</div><div class="kpi-val">' + esc((sp.securityAudit && sp.securityAudit.checklistExists) ? 'READY' : 'MISSING') + '</div></div>';

        document.getElementById('qa-handoff-kpis').innerHTML =
          '<div class="kpi-box"><div class="kpi-label">OpenAPI Modules</div><div class="kpi-val">' + esc((sp.openApi && sp.openApi.moduleCount) || 0) + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Postman Collections</div><div class="kpi-val">' + esc((sp.postman && sp.postman.collectionCount) || 0) + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Cycle Handoff</div><div class="kpi-val">' + esc((sp.cycleHandoff && sp.cycleHandoff.latestFile) || 'MISSING') + '</div></div>';

        var waves = sa.executionWaves || {};
        var wavesHtml =
          '<div class="kpi-box"><div class="kpi-label">Wave 1 Features</div><div class="kpi-val">' + esc((waves.wave1 || []).length) + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Wave 2 Features</div><div class="kpi-val">' + esc((waves.wave2 || []).length) + '</div></div>' +
          '<div class="kpi-box"><div class="kpi-label">Wave 3 Features</div><div class="kpi-val">' + esc((waves.wave3 || []).length) + '</div></div>';
        document.getElementById('waves-summary').innerHTML = wavesHtml;
        document.getElementById('dev-waves-summary').innerHTML = wavesHtml;

        var q = snap.handoffQueue || {};
        var totalPending = Object.keys(q).reduce(function (acc, k) { return acc + ((q[k] && q[k].length) || 0); }, 0);
        document.getElementById('inbox-total-count').textContent = totalPending + ' pending';
        document.getElementById('inbox-roles-grid').innerHTML = ROLES_META.map(function (role) {
          var items = q[role] || [];
          return '<div class="role-box ' + (items.length > 0 ? 'has-items' : '') + '" data-testid="webui-inbox-role-' + esc(role) + '">' +
            '<strong>' + esc(role) + ' (' + items.length + ')</strong>' +
            (items.map(function (it) { return '<div class="muted">' + esc(it.stage || it.type) + ': ' + esc(it.title || it.summary) + '</div>'; }).join('') || '<div class="muted">-</div>') +
            '</div>';
        }).join('');

        var releaseEl = document.getElementById('release-seal-summary');
        var releaseInfo = snap.stages && snap.stages.RELEASE_SEAL;
        releaseEl.className = (releaseInfo && releaseInfo.status === 'PASSED') ? 'completed-box' : 'alert-box alert-ok';
        releaseEl.textContent = (releaseInfo && releaseInfo.status === 'PASSED')
          ? ('✔ Baseline sealed at ' + (snap.semanticVersion || 'v1.0.0') + ' (RELEASE_' + (snap.activeSprint || 'S1') + '_ATTESTATION.json)')
          : ('Stages passed: ' + (snap.mainStagesPassed || 0) + '/' + (snap.mainStagesTotal || 10) + ' — Seal baseline when ready.');

        var db = snap.dispatchBridge || {};
        document.getElementById('dispatch-status-mini').textContent = db.lastDispatch
          ? t('lastDispatchedLabel') + ' ' + db.lastDispatch.stage + ' ↗'
          : t('noDispatchYet');
        document.getElementById('dispatch-output').textContent =
          (snap.directive && (snap.directive.readyPrompt || snap.directive.directive)) || ('/os-advance stage=' + (snap.currentStage || 'INTAKE'));

        var addons = Array.isArray(snap.addons) ? snap.addons : [];
        document.getElementById('addons-list').innerHTML = addons.map(function (a) {
          return '<div class="log-entry"><strong>' + esc(a.id) + '</strong> (' + (a.enabled ? 'ENABLED' : 'DISABLED') + ')</div>';
        }).join('');

        document.getElementById('welcome-banner').classList.toggle('hidden', !isWelcome);
        document.getElementById('role-bar').classList.toggle('hidden', isWelcome);
        document.getElementById('btn-attach-repo').classList.toggle('hidden', isWelcome || lc.lifecycleScope !== 'BA_ONLY_HUB');

        if (isWelcome) {
          document.getElementById('wizard-stepper-card').classList.add('hidden');
          document.getElementById('role-complete-banner').classList.add('hidden');
          document.getElementById('wizard-waiting-card').classList.add('hidden');
          document.getElementById('active-stage-card').classList.add('hidden');
        } else {
          // Role Bar state & active-role dots
          var curMetaGlobal = STAGES_META.find(function (s) { return s.id === snap.currentStage; }) || null;
          var activeOwnerRole = (curMetaGlobal && snap.currentStage !== 'COMPLETED') ? curMetaGlobal.ownerRole : null;
          var rnMap = t('roleNames') || {};
          var rolePills = document.querySelectorAll('#role-bar [data-role-pick]');
          for (var rp = 0; rp < rolePills.length; rp++) {
            var btn = rolePills[rp];
            var rk = btn.getAttribute('data-role-pick');
            var hideInBaOnly = lc.lifecycleScope === 'BA_ONLY_HUB' && ['TECH_LEAD', 'DEV', 'SECURITY', 'QA'].indexOf(rk) !== -1;
            btn.classList.toggle('hidden', hideInBaOnly);
            btn.classList.toggle('active', rk === uiState.selectedRole);
            var labelText = rnMap[rk] || rk;
            var hasActiveWork = activeOwnerRole === rk;
            var roleMainIds = (ROLE_STAGE_MAP[rk] || []).filter(function (id) { return id !== 'DELTA_EVOLVE'; });
            var allDoneForRole = roleMainIds.length > 0 && roleMainIds.every(function (id) {
              return snap.stages && snap.stages[id] && snap.stages[id].status === 'PASSED';
            });
            btn.innerHTML = esc(labelText) +
              (hasActiveWork ? ' <span class="role-dot" title="Active now"></span>' : (allDoneForRole && rk !== 'ALL' ? ' <span class="role-done-tag">✔</span>' : ''));
          }

          var visibleSteps = computeVisibleSteps(snap, uiState.selectedRole);
          if (visibleSteps.length === 0) {
            uiState.selectedWizardStage = null;
          } else if (
            snap.currentStage !== uiState.lastObservedCurrentStage &&
            visibleSteps.indexOf(snap.currentStage) !== -1
          ) {
            uiState.selectedWizardStage = snap.currentStage;
          } else if (!uiState.selectedWizardStage || visibleSteps.indexOf(uiState.selectedWizardStage) === -1) {
            if (visibleSteps.indexOf(snap.currentStage) !== -1) {
              uiState.selectedWizardStage = snap.currentStage;
            } else {
              var roleMainOnly = (ROLE_STAGE_MAP[uiState.selectedRole] || []).filter(function (id) {
                return id !== 'DELTA_EVOLVE' && visibleSteps.indexOf(id) !== -1;
              });
              uiState.selectedWizardStage = roleMainOnly.length > 0 ? roleMainOnly[roleMainOnly.length - 1] : visibleSteps[visibleSteps.length - 1];
            }
          }
          uiState.lastObservedCurrentStage = snap.currentStage || '';

          var guideMap = t('stageGuides') || {};
          document.getElementById('wizard-stepper-card').classList.toggle('hidden', visibleSteps.length === 0);
          document.getElementById('wizard-stepper-meta').textContent = t('stepperMetaFmt').replace('{n}', String(visibleSteps.length));

          document.getElementById('wizard-stepper').innerHTML = visibleSteps.map(function (id) {
            var meta = STAGES_META.find(function (s) { return s.id === id; }) || { index: '?', ownerRole: '-' };
            var st = (snap.stages && snap.stages[id]) || { status: 'PENDING' };
            var g = guideMap[id] || { short: id };
            var isDone = st.status === 'PASSED';
            var isCur = snap.currentStage === id;
            var isSel = uiState.selectedWizardStage === id;
            var cls = 'wizard-step-btn' + (isDone ? ' is-done' : (isCur ? ' is-active' : '')) + (isSel ? ' is-selected' : '');
            var statusLbl = st.status === 'PENDING_HUMAN_APPROVAL'
              ? ('⏸ ' + t('stepStatusPaused'))
              : (isDone ? ('✔ ' + t('stepStatusDone')) : (isCur ? ('● ' + t('stepStatusCurrent')) : st.status));
            return '<button type="button" class="' + cls + '" data-wizard-step="' + esc(id) + '" data-testid="webui-stage-step-' + esc(id) + '">' +
              '<span class="wizard-step-num"><span>#' + esc(meta.index) + '</span><span>' + esc(statusLbl) + '</span></span>' +
              '<span class="wizard-step-label">' + esc(g.short || id) + '</span>' +
              '</button>';
          }).join('');

          // Check role completion or waiting state
          var activeRoleMain = (ROLE_STAGE_MAP[uiState.selectedRole] || []).filter(function (id) { return id !== 'DELTA_EVOLVE'; });
          var roleAllComplete = activeRoleMain.length > 0 && activeRoleMain.every(function (id) {
            return snap.stages && snap.stages[id] && snap.stages[id].status === 'PASSED';
          });
          var roleCompleteEl = document.getElementById('role-complete-banner');
          if (roleAllComplete && uiState.selectedRole !== 'ALL') {
            roleCompleteEl.classList.remove('hidden');
            roleCompleteEl.textContent = '🎉 ' + t('roleCompleteText').replace('{role}', rnMap[uiState.selectedRole] || uiState.selectedRole);
          } else {
            roleCompleteEl.classList.add('hidden');
          }

          var waitCard = document.getElementById('wizard-waiting-card');
          var activeCard = document.getElementById('active-stage-card');
          if (visibleSteps.length === 0) {
            waitCard.classList.remove('hidden');
            activeCard.classList.add('hidden');
            var curM = curMetaGlobal || { index: '?', ownerRole: 'BA', title: snap.currentStage || '-' };
            document.getElementById('wizard-waiting-text').textContent = t('waitingDescFmt')
              .replace('{idx}', String(curM.index))
              .replace('{stage}', String(snap.currentStage || '-'))
              .replace('{owner}', String(rnMap[curM.ownerRole] || curM.ownerRole));
          } else {
            waitCard.classList.add('hidden');
            activeCard.classList.remove('hidden');

            var selId = uiState.selectedWizardStage;
            var selMeta = STAGES_META.find(function (s) { return s.id === selId; }) || { index: '?', ownerRole: 'BA', title: selId };
            var selSt = (snap.stages && snap.stages[selId]) || { status: 'PENDING' };
            var isSelPassed = selSt.status === 'PASSED';
            var isSelGlobalCurrent = snap.currentStage === selId;
            var pendingChk = snap.pendingCheckpoint;
            var isSelCheckpointPaused = Boolean(pendingChk && pendingChk.stage === selId) || selSt.status === 'PENDING_HUMAN_APPROVAL';
            var gSel = guideMap[selId] || { title: selMeta.title || selId, desc: '' };

            // Review ribbon only if viewing a PASSED step while another step in visibleSteps is still active
            var showReturnBtn = isSelPassed && !isSelGlobalCurrent && visibleSteps.indexOf(snap.currentStage) !== -1;
            document.getElementById('wizard-review-ribbon').classList.toggle('hidden', !showReturnBtn);

            document.getElementById('active-stage-badge').textContent = '#' + selMeta.index + ' • ' + (rnMap[selMeta.ownerRole] || selMeta.ownerRole);
            document.getElementById('active-stage-title').textContent = gSel.title;
            document.getElementById('active-stage-desc').textContent = gSel.desc;
            document.getElementById('guide-step2-path').textContent = snap.projectRoot || '-';

            // Show ONLY the context pane for selId
            var panes = document.querySelectorAll('.step-context-pane');
            for (var pi = 0; pi < panes.length; pi++) {
              panes[pi].classList.toggle('hidden', panes[pi].id !== ('pane-' + selId));
            }

            // Scope Files & Checks for selId
            var scopeEntry = (snap.stageScopes && snap.stageScopes[selId]) || null;
            var dirObj = snap.directive || {};
            var filesListHtml = '';
            var checksListHtml = '';
            var blkEl = document.getElementById('active-stage-blocker-badge');

            if (isSelGlobalCurrent && dirObj.stage === selId) {
              var dirDiags = Array.isArray(dirObj.diagnostics) ? dirObj.diagnostics : [];
              var dirMissing = Array.isArray(dirObj.missingFiles) ? dirObj.missingFiles : [];
              var dirTargets = Array.isArray(dirObj.targetPaths) && dirObj.targetPaths.length > 0 ? dirObj.targetPaths : dirMissing;

              if (isSelCheckpointPaused) {
                blkEl.className = 'badge badge-warn';
                blkEl.textContent = '⏸ ' + t('awaitingApprovalBadge');
              } else if (dirDiags.length > 0 || dirMissing.length > 0) {
                blkEl.className = 'badge badge-warn';
                blkEl.textContent = (dirDiags.length + dirMissing.length) + ' ' + t('blockersFound');
              } else {
                blkEl.className = 'badge badge-ok';
                blkEl.textContent = '✔ ' + t('readyVerifyBadge');
              }

              var isAutoGenStage = ['GATE_A_SEAL', 'RELEASE_SEAL', 'QA_HANDOFF', 'SECURITY_PERF_GATE'].indexOf(selId) !== -1;
              var scopeFilesForCur = (scopeEntry && Array.isArray(scopeEntry.files)) ? scopeEntry.files : [];
              filesListHtml = dirTargets.length === 0
                ? '<div class="muted">-</div>'
                : dirTargets.map(function (fp) {
                    var sf = scopeFilesForCur.find(function (x) { return x.path === fp || x.fullPath === fp; }) || null;
                    var isMissing = dirMissing.indexOf(fp) !== -1;
                    var displayPath = (sf && sf.fullPath) ? sf.fullPath : fp;
                    var tag = '';
                    if (isAutoGenStage && !(sf && sf.exists)) {
                      tag = ' (' + t('autoGenLabel') + ')';
                    } else if (isMissing || (sf && !sf.exists && !isAutoGenStage)) {
                      tag = ' (' + t('missingLabel') + ')';
                    }
                    return '<span class="scope-chip' + (isMissing ? ' missing' : '') + '" dir="ltr">' + esc(displayPath + tag) + '</span>';
                  }).join('');

              var diagRows = [];
              dirMissing.forEach(function (mf) {
                diagRows.push('<div class="diag-row"><strong>[MISSING]</strong> <span class="mono ltr-path" dir="ltr">' + esc(mf) + '</span></div>');
              });
              dirDiags.slice(0, 5).forEach(function (d) {
                var dispFile = d.projectPath || d.file || 'hub';
                diagRows.push('<div class="diag-row"><strong>[' + esc(d.rule || d.category || 'CHECK') + ']</strong> <span class="mono ltr-path" dir="ltr">' +
                  esc(dispFile + (d.line ? ':' + d.line : '')) + '</span> — ' + esc(d.message) + '</div>');
              });
              if (dirDiags.length > 5) {
                diagRows.push('<div class="muted">+ ' + esc(dirDiags.length - 5) + ' more in full AI prompt...</div>');
              }
              checksListHtml = diagRows.length === 0
                ? '<div class="muted">' + esc(t('noBlockersMsg')) + '</div>'
                : diagRows.join('');
            } else {
              var scopeFiles = (scopeEntry && Array.isArray(scopeEntry.files)) ? scopeEntry.files : [];
              blkEl.className = isSelPassed ? 'badge badge-ok' : 'badge badge-warn';
              blkEl.textContent = isSelPassed ? ('✔ ' + t('completedBadge')) : selSt.status;

              filesListHtml = scopeFiles.length === 0
                ? '<div class="muted">-</div>'
                : scopeFiles.map(function (f) {
                    var disp = f.fullPath || f.path;
                    var tag = f.exists ? '' : (f.autoGenerated ? (' (' + t('autoGenLabel') + ')') : (' (' + t('missingLabel') + ')'));
                    return '<span class="scope-chip' + (!f.exists && !f.autoGenerated ? ' missing' : '') + '" dir="ltr">' + esc(disp + tag) + '</span>';
                  }).join('');

              var signoff = scopeEntry && scopeEntry.lastCheckpointDecision;
              checksListHtml = isSelPassed
                ? ('<div class="log-entry">✔ ' + esc(t('stepCompletedMsg')) +
                    (signoff ? (' <span class="muted">(' + esc(signoff.actor || 'user') + ' • ' + esc(signoff.decision || 'APPROVED') + ')</span>') : '') + '</div>')
                : ('<div class="muted">' + esc((selMeta.rules || []).join(' | ')) + '</div>');
            }

            document.getElementById('active-stage-files').innerHTML = filesListHtml;
            document.getElementById('active-stage-diagnostics').innerHTML = checksListHtml;

            // Inline Human Checkpoint Box
            var chkBox = document.getElementById('wizard-checkpoint-box');
            chkBox.classList.toggle('hidden', !isSelCheckpointPaused);
            document.getElementById('checkpoint-stage-badge').textContent = pendingChk ? pendingChk.stage : selId;
            var bannerEl = document.getElementById('checkpoint-banner');
            if (isSelCheckpointPaused && pendingChk) {
              bannerEl.className = 'alert-box';
              bannerEl.innerHTML = '<strong>' + esc(t('pendingWaiting')) + ':</strong> <span class="mono">' +
                esc(pendingChk.stage) + '</span> — ' + esc(pendingChk.label || '') + ' <span class="mono">(' + esc(pendingChk.digest || '') + ')</span>';
              var roleSelectEl = document.getElementById('chk-role');
              if (roleSelectEl && selMeta.ownerRole) roleSelectEl.value = selMeta.ownerRole;
            } else {
              bannerEl.className = 'alert-box alert-ok';
              bannerEl.textContent = t('noCheckpointPending');
            }

            // Action Strip vs Completed Strip
            var showActiveStrip = isSelGlobalCurrent && !isSelPassed && !isSelCheckpointPaused;
            document.getElementById('wizard-active-actions').classList.toggle('hidden', !showActiveStrip);
            document.getElementById('wizard-completed-box').classList.toggle('hidden', !isSelPassed);

            // Prev / Next Footer
            var stepIdx = visibleSteps.indexOf(selId);
            document.getElementById('btn-wizard-prev').disabled = stepIdx <= 0;
            document.getElementById('btn-wizard-next').disabled = stepIdx < 0 || stepIdx >= visibleSteps.length - 1;
            document.getElementById('wizard-step-counter').textContent = (stepIdx + 1) + ' / ' + visibleSteps.length;
          }
        }

        // Workspace Switcher dropdown
        var wsList = Array.isArray(snap.workspaces) ? snap.workspaces : [];
        var wsSelect = document.getElementById('workspace-switcher');
        if (wsList.length === 0) {
          wsSelect.innerHTML = '<option value="">' + (uiState.lang === 'ar' ? 'لا توجد مشاريع بعد' : 'No workspaces yet') + '</option>';
        } else {
          wsSelect.innerHTML = wsList.map(function (w) {
            var isCur = snap.projectRoot && w.projectRoot === snap.projectRoot;
            return '<option value="' + esc(w.projectRoot) + '"' + (isCur ? ' selected' : '') + '>' +
              esc((w.code || 'PRJ') + ' — ' + (w.name || w.projectRoot) + ' [' + (w.scope || 'BA_ONLY_HUB') + ']') + '</option>';
          }).join('');
        }

        // Intake Uploaded Files list
        var intakeFiles = Array.isArray(ba.intakeFiles) ? ba.intakeFiles : [];
        document.getElementById('intake-files-count').textContent = intakeFiles.length + ' files';
        document.getElementById('intake-files-list').innerHTML = intakeFiles.length === 0
          ? '<div class="muted">' + (uiState.lang === 'ar' ? 'لا توجد ملفات في _intake/ بعد.' : 'No files in _intake/ yet. Drop BRD/RFP/SQL/PDF files above.') + '</div>'
          : intakeFiles.map(function (it) {
              return '<div class="log-entry" data-testid="webui-intake-file-row-' + esc(it.name) + '"><strong>' +
                esc(it.name) + '</strong> <span class="mono muted">(' + esc(it.sizeBytes) + ' bytes)</span></div>';
            }).join('');
      }

      async function getJson(endpoint) {
        var res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'X-Session-Token': SESSION_TOKEN }
        });
        return { httpOk: res.ok, status: res.status, data: await res.json() };
      }

      async function postJson(endpoint, body) {
        var res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Token': SESSION_TOKEN },
          body: JSON.stringify(body || {})
        });
        return { httpOk: res.ok, status: res.status, data: await res.json() };
      }

      function setWizardMode(mode) {
        uiState.wizardMode = mode;
        document.getElementById('wizard-mode-ba').classList.toggle('selected', mode === 'BA_ONLY');
        document.getElementById('wizard-mode-full').classList.toggle('selected', mode === 'FULL_LIFECYCLE');
      }

      async function loadBrowseDirectory(dirPath) {
        var qs = dirPath ? ('?dir=' + encodeURIComponent(dirPath)) : '';
        var res = await getJson('/api/fs/browse' + qs);
        var data = res.data || {};
        if (!data.ok) return;
        uiState.currentBrowseDir = data.currentDir || '';
        uiState.browseParentDir = data.parentDir || null;
        document.getElementById('fs-current-dir').textContent = data.currentDir || '-';
        document.getElementById('btn-fs-up').disabled = !data.parentDir;
        document.getElementById('btn-fs-drives').classList.toggle('hidden', data.platform !== 'win32');

        var shortcutsRow = document.getElementById('fs-shortcuts-row');
        shortcutsRow.innerHTML = (data.shortcuts || []).map(function (s) {
          return '<button type="button" class="btn btn-xs" data-browse-dir="' + esc(s.path) + '">' + esc(s.label) + '</button>';
        }).join('');

        var listEl = document.getElementById('fs-browser-list');
        listEl.innerHTML = (data.directories || []).map(function (d) {
          var badge = d.hasCodebase ? '[Code]' : (d.hasContextHub ? '[Hub]' : '');
          return '<button type="button" class="fs-row" data-browse-dir="' + esc(d.path) + '">' +
            '<span>📁 ' + esc(d.name) + '</span>' +
            '<span class="mono muted">' + esc(badge) + '</span></button>';
        }).join('') || '<div class="muted">Empty folder</div>';
      }

      function mountBrowserInModal(targetMode, currentPathValue) {
        uiState.browserTarget = targetMode;
        var panel = document.getElementById('fs-browser-panel');
        panel.classList.remove('hidden');
        if (targetMode === 'attach') {
          document.getElementById('attach-fs-slot').appendChild(panel);
        } else {
          var modal = document.getElementById('modal-new-project').querySelector('.modal-card');
          var actions = document.getElementById('wizard-feedback').parentNode;
          modal.insertBefore(panel, actions);
        }
        loadBrowseDirectory(currentPathValue || '');
      }

      function uploadIntakeFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        if (files.length === 0) return;
        var fb = document.getElementById('intake-feedback');
        fb.className = 'toast';
        fb.textContent = '...';
        Promise.all(files.map(function (f) {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
              var result = String(reader.result || '');
              var comma = result.indexOf(',');
              resolve({ filename: f.name, contentBase64: comma >= 0 ? result.slice(comma + 1) : result });
            };
            reader.onerror = function () { reject(new Error('Failed to read ' + f.name)); };
            reader.readAsDataURL(f);
          });
        })).then(function (payloadFiles) {
          return postJson('/api/intake/upload', { files: payloadFiles });
        }).then(function (res) {
          fb.className = res.data.ok ? 'toast ok' : 'toast err';
          fb.textContent = res.data.ok ? ('Uploaded ' + (res.data.uploaded || []).length + ' file(s) cleanly') : (res.data.message || 'Upload failed');
          if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        }).catch(function (err) {
          fb.className = 'toast err';
          fb.textContent = err.message || 'Upload failed';
        });
      }

      async function copyTextToBrowserClipboard(text) {
        if (!text) return false;
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(String(text));
            return true;
          }
        } catch {
          // Clipboard permission may be unavailable; fallback handled cleanly via modal textarea
        }
        return false;
      }

      function openDispatchModal(payload, copiedFlag) {
        var snap = uiState.snapshot || {};
        var stageId = (payload && payload.stage) || snap.currentStage || 'INTAKE';
        var guideMap = t('stageGuides') || {};
        var gInfo = guideMap[stageId] || {};
        var promptText = (payload && (payload.readyPrompt || payload.directive)) ||
          (snap.directive && (snap.directive.readyPrompt || snap.directive.directive)) ||
          ('/os-advance stage=' + stageId);
        var targets = (payload && Array.isArray(payload.targetPaths) && payload.targetPaths) ||
          (snap.directive && Array.isArray(snap.directive.targetPaths) && snap.directive.targetPaths) || [];
        var missing = (payload && Array.isArray(payload.missingFiles) && payload.missingFiles) ||
          (snap.directive && Array.isArray(snap.directive.missingFiles) && snap.directive.missingFiles) || [];
        var diagCount = (payload && typeof payload.diagnosticsCount === 'number')
          ? payload.diagnosticsCount
          : ((snap.directive && Array.isArray(snap.directive.diagnostics) && snap.directive.diagnostics.length) || 0);

        document.getElementById('lbl-dispatch-modal-title').textContent = t('dispatchModalTitle') + ' (' + stageId + ')';
        var blkBadge = document.getElementById('dispatch-modal-blockers');
        var totalBlockers = diagCount + missing.length;
        blkBadge.className = totalBlockers > 0 ? 'badge badge-warn' : 'badge badge-ok';
        blkBadge.textContent = totalBlockers > 0 ? (totalBlockers + ' ' + t('blockersFound')) : ('✔ ' + t('readyVerifyBadge'));

        var bannerEl = document.getElementById('dispatch-modal-banner');
        bannerEl.className = copiedFlag ? 'alert-box alert-ok' : 'alert-box';
        bannerEl.textContent = (copiedFlag ? '✔ ' + t('copiedBanner') : t('copyFallbackBanner')) +
          (gInfo.desc ? (' — ' + gInfo.desc) : '');

        document.getElementById('dispatch-modal-steps').innerHTML =
          '<strong>' + esc(t('dispatchStepsLead')) + '</strong><br />' +
          '1. ' + esc(t('step2Desc')) + ' (<span class="mono">' + esc(snap.projectRoot || '-') + '</span>)<br />' +
          '2. ' + esc(t('step3Desc'));

        document.getElementById('dispatch-modal-files').innerHTML = targets.length === 0
          ? '<span class="muted">-</span>'
          : targets.map(function (fp) {
              var isMissing = missing.indexOf(fp) !== -1;
              return '<span class="scope-chip' + (isMissing ? ' missing' : '') + '" dir="ltr">' + esc(fp) + '</span>';
            }).join('');

        document.getElementById('modal-dispatch-prompt').value = promptText;
        document.getElementById('dispatch-modal-feedback').textContent = '';
        document.getElementById('btn-modal-approve-chk').classList.toggle('hidden', !(snap.pendingCheckpoint));
        document.getElementById('modal-dispatch-guide').classList.remove('hidden');
      }

      async function runStageGateAdvance(fbEl, endpoint) {
        var snap = uiState.snapshot || {};
        if (fbEl) {
          fbEl.className = 'toast';
          fbEl.textContent = '...';
        }
        var res = await postJson(endpoint || '/api/stage/advance', {
          sprint: snap.activeSprint,
          resetCircuit: Boolean(document.getElementById('chk-reset-circuit').checked),
          actor: (document.getElementById('chk-actor').value || '').trim() || undefined,
          role: document.getElementById('chk-role').value || undefined
        });
        if (fbEl) {
          var firstDiag = (res.data && Array.isArray(res.data.diagnostics) && res.data.diagnostics[0]) || null;
          var extra = firstDiag ? (' — ' + (firstDiag.projectPath || firstDiag.file || '') + ': ' + (firstDiag.message || '')) : '';
          fbEl.className = (res.data.ok && res.data.advanced !== false) ? 'toast ok' : 'toast err';
          fbEl.textContent = (res.data.message || res.data.status || 'Done') + extra;
        }
        if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        return res;
      }

      async function runApproveCheckpoint(fbEl, decision) {
        var snap = uiState.snapshot || {};
        if (fbEl) {
          fbEl.className = 'toast';
          fbEl.textContent = '...';
        }
        var res = await postJson('/api/checkpoint/approve', {
          stage: (snap.pendingCheckpoint && snap.pendingCheckpoint.stage) || snap.currentStage,
          decision: decision || 'APPROVED',
          actor: (document.getElementById('chk-actor').value || '').trim() || undefined,
          role: document.getElementById('chk-role').value || undefined,
          notes: (document.getElementById('chk-notes').value || '').trim(),
          sprint: snap.activeSprint
        });
        if (fbEl) {
          fbEl.className = res.data.ok ? 'toast ok' : 'toast err';
          fbEl.textContent = res.data.message || 'Done';
        }
        if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        return res;
      }

      async function dispatchStage(stageId) {
        var snap = uiState.snapshot || {};
        var fb = document.getElementById('dispatch-feedback');
        var guideFb = document.getElementById('guide-feedback');
        fb.textContent = '...';
        if (guideFb) {
          guideFb.className = 'toast';
          guideFb.textContent = '...';
        }
        var res = await postJson('/api/dispatch', {
          stage: stageId || (snap.currentStage === 'COMPLETED' ? 'RELEASE_SEAL' : snap.currentStage),
          sprint: snap.activeSprint,
          actor: (document.getElementById('chk-actor').value || '').trim() || undefined,
          role: document.getElementById('chk-role').value || undefined
        });
        var copiedInBrowser = false;
        if (res.data && res.data.ok) {
          uiState.lastDispatchedPayload = res.data;
          copiedInBrowser = await copyTextToBrowserClipboard(res.data.readyPrompt || res.data.directive);
        }
        var okMsg = res.data.ok ? t('dispatchedMsg') : (res.data.message || 'Dispatch failed');
        fb.className = res.data.ok ? 'toast ok' : 'toast err';
        fb.textContent = okMsg;
        if (guideFb) {
          guideFb.className = res.data.ok ? 'toast ok' : 'toast err';
          guideFb.textContent = okMsg;
        }
        if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        if (res.data && res.data.ok) {
          openDispatchModal(res.data, copiedInBrowser || Boolean(res.data.clipboard && res.data.clipboard.copied));
        }
      }

      function bindEvents() {
        document.getElementById('chk-role').innerHTML = ROLES_META.map(function (r) {
          return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
        }).join('');
        document.getElementById('btn-lang-toggle').addEventListener('click', function () {
          uiState.lang = uiState.lang === 'en' ? 'ar' : 'en';
          applyLocaleAndTheme();
        });
        document.getElementById('btn-theme-toggle').addEventListener('click', function () {
          uiState.theme = uiState.theme === 'light' ? 'dark' : 'light';
          applyLocaleAndTheme();
        });
        document.getElementById('btn-mode-toggle').addEventListener('click', async function () {
          var next = ((uiState.snapshot && uiState.snapshot.mode) === 'SOLO_FDE') ? 'TEAM_RBAC' : 'SOLO_FDE';
          var res = await postJson('/api/mode', { mode: next, sprint: uiState.snapshot && uiState.snapshot.activeSprint });
          if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        });
        document.getElementById('btn-ba-verify').addEventListener('click', async function () {
          var res = await postJson('/api/gate/run', { action: 'ba_verify', strict: true, sprint: uiState.snapshot && uiState.snapshot.activeSprint });
          if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        });
        document.getElementById('btn-chk-approve').addEventListener('click', function () {
          runApproveCheckpoint(document.getElementById('chk-feedback'), 'APPROVED');
        });
        document.getElementById('btn-chk-reject').addEventListener('click', function () {
          runApproveCheckpoint(document.getElementById('chk-feedback'), 'REJECTED');
        });
        document.getElementById('btn-stage-advance').addEventListener('click', function () {
          runStageGateAdvance(document.getElementById('dispatch-feedback'), '/api/gate/run');
        });
        document.getElementById('btn-dispatch-active').addEventListener('click', function () { dispatchStage(); });
        document.getElementById('btn-guide-dispatch').addEventListener('click', function () {
          var snap = uiState.snapshot || {};
          dispatchStage(uiState.selectedWizardStage || snap.currentStage);
        });
        document.getElementById('btn-review-dispatch').addEventListener('click', function () {
          var snap = uiState.snapshot || {};
          dispatchStage(uiState.selectedWizardStage || snap.currentStage);
        });
        document.getElementById('btn-guide-advance').addEventListener('click', function () {
          runStageGateAdvance(document.getElementById('guide-feedback'), '/api/stage/advance');
        });
        document.getElementById('btn-return-current-step').addEventListener('click', function () {
          var snap = uiState.snapshot || {};
          var vis = computeVisibleSteps(snap, uiState.selectedRole);
          if (snap.currentStage && vis.indexOf(snap.currentStage) !== -1) {
            uiState.selectedWizardStage = snap.currentStage;
            renderAll(snap);
          }
        });
        document.getElementById('btn-wizard-prev').addEventListener('click', function () {
          var snap = uiState.snapshot || {};
          var vis = computeVisibleSteps(snap, uiState.selectedRole);
          var idx = vis.indexOf(uiState.selectedWizardStage);
          if (idx > 0) {
            uiState.selectedWizardStage = vis[idx - 1];
            renderAll(snap);
          }
        });
        document.getElementById('btn-wizard-next').addEventListener('click', function () {
          var snap = uiState.snapshot || {};
          var vis = computeVisibleSteps(snap, uiState.selectedRole);
          var idx = vis.indexOf(uiState.selectedWizardStage);
          if (idx >= 0 && idx < vis.length - 1) {
            uiState.selectedWizardStage = vis[idx + 1];
            renderAll(snap);
          }
        });
        document.getElementById('btn-toggle-advanced').addEventListener('click', function () {
          document.getElementById('advanced-drawer').classList.toggle('hidden');
        });
        document.getElementById('dispatch-status-mini').addEventListener('click', function () {
          var snap = uiState.snapshot || {};
          var payload = uiState.lastDispatchedPayload || ((snap.dispatchBridge && snap.dispatchBridge.lastDispatch) ? {
            stage: snap.dispatchBridge.lastDispatch.stage,
            readyPrompt: snap.dispatchBridge.lastDispatch.readyPrompt || (snap.directive && snap.directive.readyPrompt),
            targetPaths: snap.dispatchBridge.lastDispatch.targetPaths || (snap.directive && snap.directive.targetPaths)
          } : null);
          openDispatchModal(payload, false);
        });
        document.getElementById('btn-dispatch-modal-close').addEventListener('click', function () {
          document.getElementById('modal-dispatch-guide').classList.add('hidden');
        });
        document.getElementById('btn-modal-copy-full').addEventListener('click', async function () {
          var ok = await copyTextToBrowserClipboard(document.getElementById('modal-dispatch-prompt').value);
          var fb = document.getElementById('dispatch-modal-feedback');
          fb.className = ok ? 'toast ok' : 'toast err';
          fb.textContent = ok ? t('copiedBanner') : t('copyFallbackBanner');
        });
        document.getElementById('btn-modal-copy-slash').addEventListener('click', async function () {
          var ok = await copyTextToBrowserClipboard('/os-advance');
          var fb = document.getElementById('dispatch-modal-feedback');
          fb.className = ok ? 'toast ok' : 'toast err';
          fb.textContent = ok ? '/os-advance copied!' : 'Copy /os-advance manually.';
        });
        document.getElementById('btn-modal-advance').addEventListener('click', async function () {
          var res = await runStageGateAdvance(document.getElementById('dispatch-modal-feedback'), '/api/stage/advance');
          if (res && res.data && res.data.snapshot && !res.data.snapshot.pendingCheckpoint && res.data.ok && res.data.advanced) {
            document.getElementById('modal-dispatch-guide').classList.add('hidden');
          }
        });
        document.getElementById('btn-modal-approve-chk').addEventListener('click', async function () {
          var res = await runApproveCheckpoint(document.getElementById('dispatch-modal-feedback'), 'APPROVED');
          if (res && res.data && res.data.ok) {
            document.getElementById('modal-dispatch-guide').classList.add('hidden');
          }
        });
        document.getElementById('modal-dispatch-prompt').addEventListener('click', function (evt) {
          if (evt.target && typeof evt.target.select === 'function') evt.target.select();
        });
        document.getElementById('btn-cr-evolve').addEventListener('click', async function () {
          var snap = uiState.snapshot || {};
          var res = await postJson('/api/cr/evolve', {
            crId: document.getElementById('cr-id').value.trim(),
            targetId: document.getElementById('cr-target').value.trim(),
            summary: document.getElementById('cr-summary').value.trim(),
            sprint: snap.activeSprint,
            actor: (document.getElementById('chk-actor').value || '').trim() || undefined,
            role: document.getElementById('chk-role').value || undefined
          });
          var fb = document.getElementById('cr-feedback');
          fb.className = res.data.ok ? 'toast ok' : 'toast err';
          fb.textContent = res.data.message || 'Done';
          if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        });
        document.addEventListener('click', function (evt) {
          var roleBtn = evt.target && evt.target.closest ? evt.target.closest('[data-role-pick]') : null;
          if (roleBtn) {
            uiState.selectedRole = roleBtn.getAttribute('data-role-pick') || 'BA';
            uiState.selectedWizardStage = null;
            if (uiState.snapshot) renderAll(uiState.snapshot);
            return;
          }
          var stepBtn = evt.target && evt.target.closest ? evt.target.closest('[data-wizard-step]') : null;
          if (stepBtn) {
            uiState.selectedWizardStage = stepBtn.getAttribute('data-wizard-step');
            var gf = document.getElementById('guide-feedback');
            if (gf) gf.textContent = '';
            if (uiState.snapshot) renderAll(uiState.snapshot);
            return;
          }
          var target = evt.target && evt.target.closest ? evt.target.closest('[data-dispatch-stage]') : null;
          if (target) dispatchStage(target.getAttribute('data-dispatch-stage'));
          var dirBtn = evt.target && evt.target.closest ? evt.target.closest('[data-browse-dir]') : null;
          if (dirBtn) loadBrowseDirectory(dirBtn.getAttribute('data-browse-dir'));
        });

        // Workspace switcher
        document.getElementById('workspace-switcher').addEventListener('change', async function (evt) {
          var chosenRoot = evt.target.value;
          if (!chosenRoot) return;
          var res = await postJson('/api/workspaces', { projectRoot: chosenRoot });
          if (res.data && res.data.snapshot) renderAll(res.data.snapshot);
        });

        // New Project Wizard modal controls
        var openWizardModal = function () {
          document.getElementById('modal-new-project').classList.remove('hidden');
        };
        document.getElementById('btn-new-project').addEventListener('click', openWizardModal);
        document.getElementById('btn-welcome-new-project').addEventListener('click', openWizardModal);
        document.getElementById('btn-wizard-close').addEventListener('click', function () {
          document.getElementById('modal-new-project').classList.add('hidden');
        });
        document.getElementById('wizard-mode-ba').addEventListener('click', function () { setWizardMode('BA_ONLY'); });
        document.getElementById('wizard-mode-full').addEventListener('click', function () { setWizardMode('FULL_LIFECYCLE'); });
        document.getElementById('btn-wizard-browse').addEventListener('click', function () {
          mountBrowserInModal('wizard', document.getElementById('wizard-path').value.trim());
        });
        document.getElementById('btn-fs-up').addEventListener('click', function () {
          if (uiState.browseParentDir) loadBrowseDirectory(uiState.browseParentDir);
        });
        document.getElementById('btn-fs-drives').addEventListener('click', function () {
          loadBrowseDirectory('__DRIVES__');
        });
        document.getElementById('btn-fs-select').addEventListener('click', function () {
          var base = uiState.currentBrowseDir && uiState.currentBrowseDir !== '__DRIVES__' ? uiState.currentBrowseDir : '';
          var sub = (document.getElementById('fs-new-folder').value || '').trim();
          var joined = sub && base ? (base.replace(/[\\\\/]+$/, '') + (base.indexOf('\\\\') >= 0 ? '\\\\' : '/') + sub) : base;
          if (uiState.browserTarget === 'attach') {
            document.getElementById('attach-path').value = joined;
          } else {
            document.getElementById('wizard-path').value = joined;
          }
          document.getElementById('fs-browser-panel').classList.add('hidden');
        });
        document.getElementById('btn-wizard-submit').addEventListener('click', async function () {
          var fb = document.getElementById('wizard-feedback');
          fb.className = 'toast';
          fb.textContent = '...';
          var res = await postJson('/api/project/bootstrap', {
            projectName: document.getElementById('wizard-name').value.trim(),
            projectCode: document.getElementById('wizard-code').value.trim(),
            projectRoot: document.getElementById('wizard-path').value.trim(),
            mode: uiState.wizardMode
          });
          fb.className = res.data.ok ? 'toast ok' : 'toast err';
          fb.textContent = res.data.ok ? 'Project created & active!' : (res.data.message || 'Bootstrap failed');
          if (res.data && res.data.snapshot) {
            renderAll(res.data.snapshot);
            document.getElementById('modal-new-project').classList.add('hidden');
          }
        });

        // Attach Code Repo modal controls
        document.getElementById('btn-attach-repo').addEventListener('click', function () {
          document.getElementById('modal-attach-repo').classList.remove('hidden');
        });
        document.getElementById('btn-attach-close').addEventListener('click', function () {
          document.getElementById('modal-attach-repo').classList.add('hidden');
        });
        document.getElementById('btn-attach-browse').addEventListener('click', function () {
          mountBrowserInModal('attach', document.getElementById('attach-path').value.trim());
        });
        document.getElementById('btn-attach-submit').addEventListener('click', async function () {
          var fb = document.getElementById('attach-feedback');
          fb.className = 'toast';
          fb.textContent = '...';
          var snap = uiState.snapshot || {};
          var res = await postJson('/api/project/attach-repo', {
            hubRoot: snap.hubRoot,
            targetCodeRoot: document.getElementById('attach-path').value.trim()
          });
          fb.className = res.data.ok ? 'toast ok' : 'toast err';
          fb.textContent = res.data.ok ? 'Code repo attached & promoted to FULL_LIFECYCLE!' : (res.data.message || 'Attach failed');
          if (res.data && res.data.snapshot) {
            renderAll(res.data.snapshot);
            document.getElementById('modal-attach-repo').classList.add('hidden');
          }
        });

        // Intake Dropzone & click-to-upload
        var dropzone = document.getElementById('intake-dropzone');
        var fileInput = document.getElementById('intake-file-input');
        dropzone.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (evt) {
          uploadIntakeFiles(evt.target.files);
          fileInput.value = '';
        });
        dropzone.addEventListener('dragover', function (evt) {
          evt.preventDefault();
          dropzone.classList.add('dragover');
        });
        dropzone.addEventListener('dragleave', function () {
          dropzone.classList.remove('dragover');
        });
        dropzone.addEventListener('drop', function (evt) {
          evt.preventDefault();
          dropzone.classList.remove('dragover');
          if (evt.dataTransfer && evt.dataTransfer.files) uploadIntakeFiles(evt.dataTransfer.files);
        });
      }

      function connectSse() {
        var sseEl = document.getElementById('status-sse');
        var src = new EventSource('/api/events');
        src.onopen = function () { sseEl.className = 'badge badge-ok'; sseEl.textContent = t('sseConnected'); };
        src.addEventListener('state', function (evt) {
          try {
            var p = JSON.parse(evt.data || '{}');
            sseEl.className = 'badge badge-ok'; sseEl.textContent = t('sseConnected');
            renderAll(p);
            pushFeed(p.reason || 'state', 'Stage=' + (p.currentStage || '-') + ' Scope=' + ((p.lifecycle && p.lifecycle.lifecycleScope) || '-'));
          } catch {}
        });
        src.onerror = function () { sseEl.className = 'badge badge-warn'; sseEl.textContent = t('sseError'); };
      }

      async function boot() {
        bindEvents();
        applyLocaleAndTheme();
        try {
          var res = await fetch('/api/state');
          renderAll(await res.json());
          pushFeed('init', 'Loaded Dual-Core state');
        } catch {}
        connectSse();
      }
      boot();
    })();
  </script>
</body>
</html>
`;
}

function collectWatchTreeSignature(absProject, hubRoot) {
  if (!absProject || !hubRoot) return 'welcome';
  const roots = [path.join(hubRoot, '.os-state.json'), hubRoot];
  const docsDir = path.join(absProject, 'docs');
  if (docsDir !== hubRoot && !docsDir.startsWith(hubRoot + path.sep) && !hubRoot.startsWith(docsDir + path.sep)) {
    roots.push(docsDir);
  }
  roots.push(path.join(absProject, '.ai', '.dispatch-queue.json'));

  const parts = [];
  function scanEntry(p, depth) {
    if (depth > 4 || !fs.existsSync(p)) return;
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isFile()) {
      parts.push(`${p}:${st.mtimeMs}:${st.size}`);
      return;
    }
    if (st.isDirectory()) {
      let entries = [];
      try {
        entries = fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return;
      }
      for (const ent of entries) {
        if (ent.name === '.git' || ent.name === 'node_modules') continue;
        scanEntry(path.join(p, ent.name), depth + 1);
      }
    }
  }

  for (const r of roots) {
    scanEntry(r, 0);
  }
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

/**
 * Creates the unstarted Unified Dual-Core Web UI server (`127.0.0.1`-only).
 */
function createWebUiServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  if (host !== DEFAULT_HOST) {
    const secErr = new Error(`Security Violation: web-ui host must strictly be '${DEFAULT_HOST}', received '${host}'.`);
    secErr.code = 'SECURITY_VIOLATION';
    throw secErr;
  }

  const registryPathOpt = options.registryPath || undefined;
  const explicitTarget = options.hubRoot || options.projectRoot || null;
  let absProject = null;
  let hubRoot = null;
  let welcomeMode = false;

  if (explicitTarget) {
    const resolved = resolveProjectRootAndHub(explicitTarget);
    absProject = resolved.absProject;
    hubRoot = resolved.hubRoot;
    if (fs.existsSync(hubRoot) && options.registerOnStart !== false) {
      try {
        registerWorkspace({ projectRoot: absProject, hubRoot }, { registryPath: registryPathOpt });
      } catch {
        // ignore non-fatal registry write issues on startup
      }
    }
  } else {
    const reg = listWorkspaces({ registryPath: registryPathOpt });
    const existing = reg.workspaces.filter(w => w.exists);
    const chosen = existing.find(w => w.id === reg.activeWorkspaceId) || existing[0] || null;
    if (chosen) {
      const resolved = resolveProjectRootAndHub(chosen.projectRoot);
      absProject = resolved.absProject;
      hubRoot = chosen.hubRoot || resolved.hubRoot;
    } else {
      welcomeMode = true;
    }
  }

  const defaultSprint = options.sprint || undefined;
  let lifecycleScopeOpt = options.lifecycleScope || 'AUTO';
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const sseClients = new Set();

  let lastObservedDigest = null;
  let lastTreeSig = null;
  let pollTimer = null;
  let heartbeatTimer = null;
  let server = null;

  function buildSnapshot(sprintOverride) {
    const workspacesInfo = listWorkspaces({ registryPath: registryPathOpt });
    if (welcomeMode || !absProject || !hubRoot) {
      return {
        ok: true,
        schemaVersion: '4.3.0',
        welcomeMode: true,
        projectRoot: null,
        hubRoot: null,
        projectCode: 'WELCOME',
        projectName: 'Welcome — No Active Workspace',
        activeSprint: 'S1',
        semanticVersion: 'v1.0.0',
        mode: 'SOLO_FDE',
        currentStage: 'INTAKE',
        stages: {},
        circuitBreaker: { maxRetries: 3, retryCounts: {}, openStages: {} },
        pendingCheckpoint: null,
        checkpointAuditTrail: [],
        handoffQueue: {},
        pendingHandoffs: 0,
        addons: [],
        deltaHistory: [],
        releaseSealed: false,
        workspaces: workspacesInfo.workspaces,
        activeWorkspaceId: workspacesInfo.activeWorkspaceId,
        lifecycle: {
          lifecycleScope: 'WELCOME',
          defaultTab: 'BA_SDLC',
          trackA: { id: 'BA_SDLC', label: 'BA_SDLC (Stages 1-5 + CRs)', enabled: true, passedCount: 0, totalCount: 5, stages: [] },
          trackB: { id: 'STACK_AWARE', label: 'stack-aware Engineering & QA (Stages 6-10)', enabled: false, passedCount: 0, totalCount: 5, stages: [] }
        },
        baSdlc: {
          coreHubHealth: { files: {}, readyFilesCount: 0, totalCoreFiles: 4, antiPlaceholderViolationCount: 0, antiPlaceholderViolations: [] },
          baCheckpoints: [],
          featureMatrix: [],
          baStrictVerify: { ok: false, violationCount: 0, warningCount: 0, violations: [] },
          crEvolution: { registerCount: 0, registerEntries: [], deltaFiles: [], deltaHistory: [] },
          intakeFiles: []
        },
        stackAware: { enabled: false },
        dispatchBridge: { exists: false, queue: [], lastDispatch: null },
        snapshotDigest: `welcome-${workspacesInfo.workspaces.length}`,
        serverTime: new Date().toISOString()
      };
    }

    const effectiveSprint = sprintOverride || defaultSprint;
    const state = inspectProjectState(absProject, { sprint: effectiveSprint });
    const directiveStage = state.currentStage === 'COMPLETED' ? 'RELEASE_SEAL' : state.currentStage;
    const directive = buildStageDirective(absProject, directiveStage, state.activeSprint, { mode: state.mode });
    const audit = getAuditTrail(absProject, { sprint: state.activeSprint, mode: state.mode });
    const dualCore = collectDualCoreMetrics(absProject, state, { lifecycleScope: lifecycleScopeOpt });

    const snapshotDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ state, audit, dualCore, wsCount: workspacesInfo.workspaces.length }))
      .digest('hex');

    return {
      ...state,
      welcomeMode: false,
      state,
      ...dualCore,
      workspaces: workspacesInfo.workspaces,
      activeWorkspaceId: workspacesInfo.activeWorkspaceId,
      directive,
      audit,
      snapshotDigest,
      serverTime: new Date().toISOString()
    };
  }

  function broadcastState(reason = 'update', extra = {}) {
    const snapshot = buildSnapshot(extra.sprint);
    lastObservedDigest = snapshot.snapshotDigest;
    lastTreeSig = collectWatchTreeSignature(absProject, hubRoot);
    const frame = formatSseFrame('state', {
      ...snapshot,
      reason,
      ...(extra.lastAction ? { lastAction: extra.lastAction } : {})
    });
    for (const clientRes of Array.from(sseClients)) {
      if (clientRes.writableEnded || clientRes.destroyed) {
        sseClients.delete(clientRes);
        continue;
      }
      try {
        clientRes.write(frame);
      } catch {
        sseClients.delete(clientRes);
      }
    }
    return snapshot;
  }

  function validateOriginOnly(req) {
    const boundPort = server && server.address() ? server.address().port : DEFAULT_PORT;
    const expectedOrigin = `http://${DEFAULT_HOST}:${boundPort}`;
    const originHeader = req.headers.origin;
    if (!originHeader || originHeader !== expectedOrigin) {
      return {
        ok: false,
        code: 'FORBIDDEN_ORIGIN',
        message: `Forbidden or missing Origin header. Expected '${expectedOrigin}'.`
      };
    }
    return { ok: true };
  }

  function validateSessionTokenOnly(req, body = null) {
    const headerToken = typeof req.headers['x-session-token'] === 'string' ? req.headers['x-session-token'].trim() : '';
    const bodyToken = body && typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
    if (!timingSafeTokenEqual(headerToken || bodyToken, sessionToken)) {
      return {
        ok: false,
        code: 'INVALID_SESSION_TOKEN',
        message: 'Missing or invalid session token for protected request.'
      };
    }
    return { ok: true };
  }

  function validateMutatingPostSecurity(req, body) {
    const originGuard = validateOriginOnly(req);
    if (!originGuard.ok) return originGuard;
    return validateSessionTokenOnly(req, body);
  }

  server = http.createServer(async (req, res) => {
    if (!isLoopbackRemote(req.socket && req.socket.remoteAddress)) {
      sendJson(res, 403, { ok: false, code: 'NON_LOOPBACK_FORBIDDEN', message: 'Access restricted to 127.0.0.1.' });
      return;
    }

    const boundPort = server && server.address() ? server.address().port : DEFAULT_PORT;
    let urlObj;
    try {
      urlObj = new URL(req.url || '/', `http://${DEFAULT_HOST}:${boundPort}`);
    } catch {
      sendJson(res, 400, { ok: false, code: 'BAD_URL', message: 'Malformed request URL.' });
      return;
    }

    const pathname = urlObj.pathname;
    const sprintParam = urlObj.searchParams.get('sprint') || undefined;

    try {
      if (req.method === 'GET' && pathname === '/') {
        setCommonSecurityHeaders(res);
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderDashboardHtml(sessionToken));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/state') {
        const snapshot = buildSnapshot(sprintParam);
        lastObservedDigest = snapshot.snapshotDigest;
        lastTreeSig = collectWatchTreeSignature(absProject, hubRoot);
        sendJson(res, 200, snapshot);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/workspaces') {
        const tokenGuard = validateSessionTokenOnly(req);
        if (!tokenGuard.ok) {
          sendJson(res, 403, tokenGuard);
          return;
        }
        const reg = listWorkspaces({ registryPath: registryPathOpt });
        sendJson(res, 200, {
          ok: true,
          welcomeMode,
          activeProjectRoot: absProject,
          activeHubRoot: hubRoot,
          ...reg
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/fs/browse') {
        const tokenGuard = validateSessionTokenOnly(req);
        if (!tokenGuard.ok) {
          sendJson(res, 403, tokenGuard);
          return;
        }
        try {
          const browsePayload = browseFilesystemDirectory(urlObj.searchParams.get('dir') || '', absProject);
          sendJson(res, 200, browsePayload);
        } catch (browseErr) {
          sendJson(res, browseErr.statusCode || 400, {
            ok: false,
            code: browseErr.code || 'BROWSE_FAILED',
            message: browseErr.message
          });
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer'
        });
        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        res.write('retry: 2000\n');
        const initialSnapshot = buildSnapshot(sprintParam);
        lastObservedDigest = initialSnapshot.snapshotDigest;
        lastTreeSig = collectWatchTreeSignature(absProject, hubRoot);
        res.write(formatSseFrame('state', { ...initialSnapshot, reason: 'initial' }));

        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/intake/upload') {
        const originGuard = validateOriginOnly(req);
        if (!originGuard.ok) {
          sendJson(res, 403, originGuard);
          return;
        }

        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        const isJsonUpload = contentType.includes('application/json');

        if (!isJsonUpload) {
          const tokenGuard = validateSessionTokenOnly(req);
          if (!tokenGuard.ok) {
            sendJson(res, 403, tokenGuard);
            return;
          }
        }

        let rawBuf;
        try {
          rawBuf = await readRawBufferBody(req, MAX_INTAKE_UPLOAD_BYTES);
        } catch (readErr) {
          sendJson(res, readErr.statusCode || 400, {
            ok: false,
            code: readErr.code || 'BAD_REQUEST',
            message: readErr.message
          });
          return;
        }

        let itemsToSave = [];
        let parsedBody = null;
        if (isJsonUpload) {
          try {
            parsedBody = JSON.parse(rawBuf.toString('utf8') || '{}');
          } catch {
            sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: 'Malformed JSON upload payload.' });
            return;
          }
          const tokenGuard = validateSessionTokenOnly(req, parsedBody);
          if (!tokenGuard.ok) {
            sendJson(res, 403, tokenGuard);
            return;
          }
          const list = Array.isArray(parsedBody.files)
            ? parsedBody.files
            : (parsedBody.filename ? [{ filename: parsedBody.filename, contentBase64: parsedBody.contentBase64, contentText: parsedBody.contentText }] : []);
          itemsToSave = list.map(f => {
            if (typeof f.contentText === 'string') {
              return { filename: f.filename, buffer: Buffer.from(f.contentText, 'utf8') };
            }
            const rawB64 = String(f.contentBase64 || '').replace(/^data:[^;]+;base64,/i, '');
            return { filename: f.filename, buffer: Buffer.from(rawB64, 'base64') };
          });
        } else {
          const rawFilename = req.headers['x-upload-filename'] || urlObj.searchParams.get('filename') || '';
          itemsToSave = [{ filename: String(rawFilename), buffer: rawBuf }];
        }

        if (welcomeMode || !hubRoot) {
          sendJson(res, 400, {
            ok: false,
            code: 'NO_ACTIVE_PROJECT',
            message: 'Create or select a project workspace before uploading intake files.'
          });
          return;
        }
        if (itemsToSave.length === 0) {
          sendJson(res, 400, { ok: false, code: 'NO_FILES_PROVIDED', message: 'No upload files received.' });
          return;
        }

        try {
          const uploaded = itemsToSave.map(item => writeIntakeFileAtomically(hubRoot, item.filename, item.buffer));
          const snapshot = broadcastState('intake_upload', { lastAction: { uploaded } });
          sendJson(res, 200, {
            ok: true,
            uploaded,
            intakeFiles: listIntakeFiles(hubRoot),
            snapshot
          });
        } catch (upErr) {
          sendJson(res, upErr.statusCode || 400, {
            ok: false,
            code: upErr.code || 'UPLOAD_FAILED',
            message: upErr.message
          });
        }
        return;
      }

      const mutatingRoutes = new Set([
        '/api/checkpoint/approve',
        '/api/gate/run',
        '/api/stage/advance',
        '/api/dispatch',
        '/api/cr/evolve',
        '/api/mode',
        '/api/workspaces',
        '/api/workspaces/select',
        '/api/project/bootstrap',
        '/api/project/attach-repo'
      ]);

      if (req.method === 'POST' && mutatingRoutes.has(pathname)) {
        const originGuard = validateOriginOnly(req);
        if (!originGuard.ok) {
          sendJson(res, 403, originGuard);
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch (parseErr) {
          sendJson(res, parseErr.statusCode || 400, {
            ok: false,
            code: parseErr.code || 'BAD_REQUEST',
            message: parseErr.message
          });
          return;
        }

        const guard = validateMutatingPostSecurity(req, body);
        if (!guard.ok) {
          sendJson(res, 403, guard);
          return;
        }

        if (pathname === '/api/workspaces' || pathname === '/api/workspaces/select') {
          const regBefore = listWorkspaces({ registryPath: registryPathOpt });
          let targetRoot = body.projectRoot || null;
          if (!targetRoot && body.id) {
            const found = regBefore.workspaces.find(w => w.id === body.id);
            if (!found) {
              sendJson(res, 404, { ok: false, code: 'WORKSPACE_NOT_FOUND', message: `Workspace '${body.id}' not found.` });
              return;
            }
            targetRoot = found.projectRoot;
          }
          if (!targetRoot) {
            sendJson(res, 400, { ok: false, code: 'WORKSPACE_REQUIRED', message: 'Provide id or projectRoot to switch workspace.' });
            return;
          }
          const resolved = resolveProjectRootAndHub(targetRoot);
          if (!fs.existsSync(resolved.absProject) && !fs.existsSync(resolved.hubRoot)) {
            sendJson(res, 404, { ok: false, code: 'WORKSPACE_PATH_MISSING', message: `Directory '${resolved.absProject}' does not exist.` });
            return;
          }
          absProject = resolved.absProject;
          hubRoot = resolved.hubRoot;
          welcomeMode = false;
          lifecycleScopeOpt = 'AUTO';
          const reg = registerWorkspace({ projectRoot: absProject, hubRoot }, { registryPath: registryPathOpt });
          const snapshot = broadcastState('workspace_switched', { lastAction: reg.workspace });
          sendJson(res, 200, { ok: true, workspace: reg.workspace, workspaces: reg.workspaces, snapshot });
          return;
        }

        if (pathname === '/api/project/bootstrap') {
          const result = bootstrapProjectWorkspace({
            projectRoot: body.projectRoot,
            projectName: body.projectName || body.name,
            projectCode: body.projectCode || body.code,
            mode: body.mode || 'BA_ONLY',
            sprint: body.sprint || sprintParam || defaultSprint || 'S1',
            overwriteStack: Boolean(body.overwriteStack),
            registryPath: registryPathOpt
          });
          if (!result.ok) {
            sendJson(res, 400, result);
            return;
          }
          absProject = result.projectRoot;
          hubRoot = result.hubRoot;
          welcomeMode = false;
          lifecycleScopeOpt = 'AUTO';
          const snapshot = broadcastState('project_bootstrapped', { lastAction: result.workspace });
          sendJson(res, 200, { ...result, snapshot });
          return;
        }

        if (pathname === '/api/project/attach-repo') {
          const srcHub = body.hubRoot || hubRoot;
          const result = attachEngineeringOsToRepo(srcHub, body.targetCodeRoot, {
            overwriteStack: Boolean(body.overwriteStack),
            registryPath: registryPathOpt
          });
          if (!result.ok) {
            sendJson(res, 400, result);
            return;
          }
          absProject = result.projectRoot;
          hubRoot = result.hubRoot;
          welcomeMode = false;
          lifecycleScopeOpt = 'AUTO';
          const snapshot = broadcastState('repo_attached', { lastAction: result.workspace });
          sendJson(res, 200, { ...result, snapshot });
          return;
        }

        if (welcomeMode || !absProject || !hubRoot) {
          sendJson(res, 400, {
            ok: false,
            code: 'NO_ACTIVE_PROJECT',
            message: 'No active workspace selected. Create or select a project first.'
          });
          return;
        }

        const targetSprint = body.sprint || sprintParam || defaultSprint;

        if (pathname === '/api/checkpoint/approve') {
          const result = await withStateLock(absProject, () =>
            approveCheckpoint(absProject, {
              stage: body.stage,
              decision: body.decision || 'APPROVED',
              actor: body.actor,
              role: body.role,
              notes: body.notes,
              sprint: targetSprint,
              mode: body.mode
            })
          );
          const snapshot = broadcastState('checkpoint_approve', { lastAction: result, sprint: targetSprint });
          const status = result.code === 'INVALID_DECISION' || result.code === 'UNKNOWN_STAGE' ? 400 : 200;
          sendJson(res, status, { ...result, snapshot });
          return;
        }

        if (pathname === '/api/gate/run' || pathname === '/api/stage/advance') {
          if (pathname === '/api/gate/run' && body.action === 'ba_verify') {
            const verifyResult = runHubVerifier(hubRoot, {
              sprint: targetSprint,
              strict: body.strict !== false,
              partial: Boolean(body.partial)
            });
            const snapshot = broadcastState('ba_verify', { lastAction: verifyResult, sprint: targetSprint });
            sendJson(res, 200, {
              ok: verifyResult.ok,
              action: 'ba_verify',
              verifyResult,
              snapshot
            });
            return;
          }

          const result = await withStateLock(absProject, () =>
            runGateAndAdvance(absProject, {
              stage: body.stage,
              sprint: targetSprint,
              mode: body.mode,
              role: body.role,
              actor: body.actor,
              requireHumanCheckpoints: body.requireHumanCheckpoints,
              resetCircuit: Boolean(body.resetCircuit),
              projectCode: body.projectCode,
              projectName: body.projectName
            })
          );
          const reason = pathname === '/api/stage/advance' ? 'stage_advance' : 'gate_run';
          const snapshot = broadcastState(reason, { lastAction: result, sprint: targetSprint });
          const status = result.code === 'UNKNOWN_STAGE' ? 400 : 200;
          sendJson(res, status, { ...result, snapshot });
          return;
        }

        if (pathname === '/api/dispatch') {
          const currentSnap = inspectProjectState(absProject, { sprint: targetSprint });
          const stageToDispatch = body.stage
            ? String(body.stage).toUpperCase().trim()
            : (currentSnap.currentStage === 'COMPLETED' ? 'RELEASE_SEAL' : currentSnap.currentStage);
          const dirRes = buildStageDirective(absProject, stageToDispatch, targetSprint || currentSnap.activeSprint, {
            mode: body.mode || currentSnap.mode,
            role: body.role,
            actor: body.actor
          });
          if (!dirRes.allowed) {
            sendJson(res, 403, dirRes);
            return;
          }

          const queuePath = path.join(absProject, '.ai', '.dispatch-queue.json');
          const track = TRACK_A_IDS.includes(stageToDispatch) ? 'BA_SDLC' : 'STACK_AWARE';
          const slashCommand = '/os-advance';
          const promptCommand = `/os-advance stage=${stageToDispatch} sprint=${targetSprint || currentSnap.activeSprint}`;
          const readyPrompt = dirRes.readyPrompt || dirRes.directive || promptCommand;
          const nowIso = new Date().toISOString();

          await withStateLock(absProject, () => {
            let prevQueue = [];
            if (fs.existsSync(queuePath)) {
              try {
                const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
                if (Array.isArray(parsed.queue)) prevQueue = parsed.queue;
              } catch {
                prevQueue = [];
              }
            }
            const entry = {
              id: `DSP-${Date.now()}`,
              dispatchedAt: nowIso,
              stage: stageToDispatch,
              stageTitle: dirRes.stageTitle || stageToDispatch,
              track,
              sprint: targetSprint || currentSnap.activeSprint,
              role: body.role || currentSnap.stages?.[stageToDispatch]?.ownerRole || 'BA',
              actor: body.actor || 'web-ui',
              slashCommand,
              promptCommand,
              targetPaths: dirRes.targetPaths || []
            };
            writeJsonAtomic(queuePath, {
              schemaVersion: '4.3.0',
              dispatchedAt: nowIso,
              projectRoot: absProject,
              hubRoot,
              sprint: targetSprint || currentSnap.activeSprint,
              stage: stageToDispatch,
              stageTitle: dirRes.stageTitle || stageToDispatch,
              track,
              slashCommand,
              promptCommand,
              readyPrompt,
              targetPaths: dirRes.targetPaths || [],
              directive: dirRes.directive,
              missingFiles: dirRes.missingFiles || [],
              rules: dirRes.rules || [],
              queue: [entry, ...prevQueue].slice(0, 15)
            });
          });

          const textToCopy = body.copyMode === 'slash' ? slashCommand : readyPrompt;
          const clipboard = body.skipClipboard === true ? { copied: false, tool: null } : copyToSystemClipboard(textToCopy);
          const snapshot = broadcastState('dispatch', {
            sprint: targetSprint || currentSnap.activeSprint,
            lastAction: { stage: stageToDispatch, slashCommand }
          });

          sendJson(res, 200, {
            ok: true,
            stage: stageToDispatch,
            stageTitle: dirRes.stageTitle || stageToDispatch,
            track,
            sprint: targetSprint || currentSnap.activeSprint,
            slashCommand,
            promptCommand,
            readyPrompt,
            targetPaths: dirRes.targetPaths || [],
            missingFiles: dirRes.missingFiles || [],
            diagnostics: (dirRes.diagnostics || []).slice(0, 15),
            diagnosticsCount: (dirRes.diagnostics || []).length,
            gateCliCommand: dirRes.gateCliCommand || '',
            dispatchFile: '.ai/.dispatch-queue.json',
            clipboard,
            directive: dirRes.directive,
            snapshot
          });
          return;
        }

        if (pathname === '/api/cr/evolve') {
          const result = await withStateLock(absProject, () =>
            evolveChangeRequest(absProject, {
              crId: body.crId,
              fromVersion: body.fromVersion,
              toVersion: body.toVersion,
              targetId: body.targetId,
              was: body.was,
              current: body.current,
              summary: body.summary,
              sprint: targetSprint,
              mode: body.mode,
              role: body.role,
              actor: body.actor
            })
          );
          const snapshot = broadcastState('cr_evolve', { lastAction: result, sprint: targetSprint });
          sendJson(res, result.ok ? 200 : 400, { ...result, snapshot });
          return;
        }

        if (pathname === '/api/mode') {
          const result = await withStateLock(absProject, () =>
            setOrchestratorMode(absProject, body.mode, targetSprint, {
              requireHumanCheckpoints: body.requireHumanCheckpoints
            })
          );
          const snapshot = broadcastState('mode_change', { lastAction: result, sprint: targetSprint });
          sendJson(res, result.code === 'INVALID_MODE' ? 400 : 200, { ...result, snapshot });
          return;
        }
      }

      sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: `Route '${req.method} ${pathname}' not found.` });
    } catch (err) {
      sendJson(res, 500, { ok: false, code: 'INTERNAL_ERROR', message: err && err.message ? err.message : String(err) });
    }
  });

  function startWatchers() {
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        if (sseClients.size === 0) return;
        try {
          const sig = collectWatchTreeSignature(absProject, hubRoot);
          if (sig !== lastTreeSig) {
            lastTreeSig = sig;
            const snapshot = buildSnapshot();
            if (snapshot.snapshotDigest !== lastObservedDigest) {
              broadcastState('external_sync');
            }
          }
        } catch {
          // ignore transient poll race during atomic rename
        }
      }, POLL_INTERVAL_MS);
      pollTimer.unref();
    }

    if (!heartbeatTimer) {
      heartbeatTimer = setInterval(() => {
        for (const clientRes of Array.from(sseClients)) {
          if (clientRes.writableEnded || clientRes.destroyed) {
            sseClients.delete(clientRes);
            continue;
          }
          try {
            clientRes.write(': keepalive\n\n');
          } catch {
            sseClients.delete(clientRes);
          }
        }
      }, HEARTBEAT_INTERVAL_MS);
      heartbeatTimer.unref();
    }
  }

  function close() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    for (const clientRes of Array.from(sseClients)) {
      try {
        clientRes.end();
      } catch {
        // ignore
      }
      sseClients.delete(clientRes);
    }
    return new Promise(resolve => {
      if (!server || !server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    });
  }

  return {
    server,
    host: DEFAULT_HOST,
    get projectRoot() {
      return absProject;
    },
    get hubRoot() {
      return hubRoot;
    },
    get welcomeMode() {
      return welcomeMode;
    },
    sessionToken,
    startWatchers,
    broadcastState,
    close
  };
}

function probeExistingServer(port) {
  return new Promise(resolve => {
    const req = http.get(
      { host: DEFAULT_HOST, port, path: '/api/state', timeout: 1200 },
      res => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Starts the Unified Dual-Core Web UI server on `127.0.0.1` and resolves with bound metadata.
 */
function startWebUiServer(options = {}) {
  const port = options.port !== undefined ? Number(options.port) : DEFAULT_PORT;
  const controller = createWebUiServer(options);

  return new Promise((resolve, reject) => {
    controller.server.once('error', reject);
    controller.server.listen(port, DEFAULT_HOST, () => {
      controller.server.removeListener('error', reject);
      const addr = controller.server.address();
      const boundPort = addr && typeof addr === 'object' ? addr.port : port;
      controller.startWatchers();
      resolve({
        ...controller,
        projectRoot: controller.projectRoot,
        hubRoot: controller.hubRoot,
        welcomeMode: controller.welcomeMode,
        port: boundPort,
        url: `http://${DEFAULT_HOST}:${boundPort}`
      });
    });
  });
}

function printHelp() {
  console.log(`
InnovaDigits Unified Dual-Core Web Control Plane (v4.4.0)

Usage:
  node bin/web-ui.js [--project=<dir> | --hub=<dir>] [--sprint=<S1>] [--port=4321] [--lifecycle=AUTO|BA_ONLY_HUB|FULL_LIFECYCLE] [--no-open]

Options:
  --project=<dir>            Target repository root containing docs/project-context-hub
  --hub=<dir>                Target project-context-hub folder (works for BA_ONLY_HUB mode)
  --sprint=<ID>              Default sprint override (e.g., S1, S4)
  --port=<N>                 Local port on 127.0.0.1 (default: 4321; use 0 for ephemeral)
  --lifecycle=<MODE>         AUTO | BA_ONLY_HUB | FULL_LIFECYCLE
  --ba-only                  Shortcut for --lifecycle=BA_ONLY_HUB
  --no-open                  Do not automatically launch the default system browser
  --help                     Show usage help
`);
}

if (require.main === module) {
  (async () => {
    const cli = parseCliArgs(process.argv.slice(2));
    if (cli.help) {
      printHelp();
      process.exit(0);
    }
    let instance;
    try {
      instance = await startWebUiServer({
        projectRoot: cli.explicitTarget ? cli.projectRoot : undefined,
        sprint: cli.sprint,
        port: cli.port,
        lifecycleScope: cli.lifecycleScope
      });
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        const existingUrl = `http://${DEFAULT_HOST}:${cli.port}`;
        const alive = await probeExistingServer(cli.port);
        if (alive) {
          console.log(`\n🌐 InnovaDigits AI OS Web Control Plane is already running at ${existingUrl}`);
          if (cli.open !== false) openDefaultBrowser(existingUrl);
          process.exit(0);
        }
      }
      throw err;
    }

    const scope = instance.welcomeMode
      ? 'WELCOME'
      : detectLifecycleScope(instance.projectRoot, instance.hubRoot, cli.lifecycleScope);
    console.log(`\n🌐 InnovaDigits Unified Dual-Core Web Control Plane`);
    console.log(`   URL       : ${instance.url}`);
    console.log(`   Project   : ${instance.projectRoot || '(Welcome Wizard — create or select workspace in browser)'}`);
    console.log(`   Hub       : ${instance.hubRoot || '-'}`);
    console.log(`   Lifecycle : ${scope}`);
    console.log(`   Security  : 127.0.0.1 loopback-only • Origin + X-Session-Token enforced`);
    console.log(`   Press Ctrl+C to stop.\n`);

    if (cli.open !== false) {
      openDefaultBrowser(instance.url);
    }

    const shutdown = async () => {
      await instance.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })().catch(err => {
    console.error('❌ Failed to start Web UI:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  ALLOWED_INTAKE_EXTS,
  detectLifecycleScope,
  collectDualCoreMetrics,
  copyToSystemClipboard,
  openDefaultBrowser,
  browseFilesystemDirectory,
  createWebUiServer,
  startWebUiServer,
  renderDashboardHtml
};
