#!/usr/bin/env node
'use strict';

/**
 * 🧪 E2E Verification Suite: Core AI Orchestrator, Checkpoints, Circuit Breaker, Add-on Hooks, Web UI & Zero-Terminal UX (`v4.4.0`)
 * Zero external dependencies (`fs`, `os`, `path`, `http`, `child_process`).
 *
 * Tests in isolated `os.tmpdir()` (cleaned up cleanly in `finally`):
 *   [CHECK 1/9] MCP `2024-11-05` Capabilities (`tools`, `prompts`, `resources`), 10 Tools, 4 Slash Prompts, 3 Resource URIs & pure `stdout`
 *   [CHECK 2/9] `INTAKE` Stage 1 + 6-Role `TEAM_RBAC` locks, `roleAssignments` validation & Role Inbox (`os://state/handoffs`)
 *   [CHECK 3/9] 3-Strike Circuit Breaker (`CIRCUIT_OPEN_ESCALATED`), `remediationPacket`, Reset on Fix & `LESSONS_LEARNED.md` auto-append
 *   [CHECK 4/9] Human-in-the-Loop Checkpoints (`PENDING_HUMAN_APPROVAL`) & `os_approve_checkpoint` immutable `os://audit/trail`
 *   [CHECK 5/9] Full 10-Stage Main Pipeline Progression + Custom Add-on Plugin Hooks (`onAfterGatePass`, `onReleaseSealed`, Fault Isolation) with `PMTool` disabled
 *   [CHECK 6/9] Controlled CR Evolution (`DELTA_EVOLVE` via `os_evolve_cr`), preserved sealed stages + Optional PMTool Add-on REST/XLSX activation & CLI checks
 *   [CHECK 7/9] Unified Dual-Core Web Control Plane (`bin/web-ui.js` `FULL_LIFECYCLE`): `BA_SDLC` + `stack-aware` metrics, `POST /api/gate/run`, `/api/dispatch` -> `.ai/.dispatch-queue.json`, CSRF & `docs/` SSE sync
 *   [CHECK 8/9] Standalone `BA_ONLY_HUB` auto-detection, `ba-hub ui` launcher, `orchestrator-cli --ui` & `MCP OS_ENABLE_WEB_UI=1`
 *   [CHECK 9/9] Zero-Terminal UX (`v4.4.0`): Multi-project registry, `bootstrapProjectWorkspace`, `attachEngineeringOsToRepo`, Web Wizard/Browser/Attach/Intake Upload APIs, `os_bootstrap_project` MCP tool, launchers & desktop shortcuts
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { computeFeatureSrd } = require('./lib/hub-utils');
const {
  listWorkspaces,
  buildStageDirective,
  bootstrapProjectWorkspace,
  attachEngineeringOsToRepo
} = require('./lib/orchestrator-state');
const { startWebUiServer } = require('./web-ui');
const { installDesktopShortcut } = require('./install-desktop-shortcut');

const BA_HUB_CLI = path.resolve(__dirname, '..', '..', 'ba-context-hub-os', 'bin', 'ba-hub.js');

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

function createMcpTestClient(extraEnv = {}) {
  const child = spawn(process.execPath, [path.join(BIN_DIR, 'mcp-server.js')], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdoutBuf = '';
  let nextId = 1;
  const pending = new Map();
  const stderrLogs = [];
  const invalidStdoutLines = [];

  child.stderr.on('data', chunk => {
    stderrLogs.push(chunk.toString('utf8'));
  });

  child.stdout.on('data', chunk => {
    stdoutBuf += chunk.toString('utf8');
    let nlIdx;
    while ((nlIdx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nlIdx).replace(/\r$/, '').trim();
      stdoutBuf = stdoutBuf.slice(nlIdx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        invalidStdoutLines.push(line);
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });

  function sendNotification(method, params = {}) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  function request(method, params = {}, timeoutMs = 20000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request '${method}' (id=${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async function callTool(name, args = {}) {
    const rpc = await request('tools/call', { name, arguments: args });
    if (rpc.error) {
      throw new Error(`JSON-RPC error calling ${name}: ${JSON.stringify(rpc.error)}`);
    }
    const text = rpc.result?.content?.[0]?.text || '{}';
    return {
      isError: Boolean(rpc.result?.isError),
      payload: JSON.parse(text),
      raw: rpc
    };
  }

  function close() {
    try {
      child.stdin.end();
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }

  return { request, sendNotification, callTool, close, invalidStdoutLines, stderrLogs };
}

function startMockPmtoolServer() {
  let seq = 1000;
  const items = new Map();
  const keyToId = new Map();
  const stats = { getCount: 0, postCount: 0, putCount: 0, patchCount: 0, createOrder: [] };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const bodyStr = Buffer.concat(chunks).toString('utf8');
      let body = {};
      if (bodyStr.trim()) {
        try {
          body = JSON.parse(bodyStr);
        } catch {
          body = {};
        }
      }

      const urlPath = (req.url || '').split('?')[0];
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && /^\/api\/projects\/[^/]+\/work-items$/.test(urlPath)) {
        stats.getCount++;
        res.statusCode = 200;
        res.end(JSON.stringify({ items: [...items.values()] }));
        return;
      }

      if (req.method === 'POST' && /^\/api\/projects\/[^/]+\/work-items$/.test(urlPath)) {
        stats.postCount++;
        const extKey = String(body.externalKey || '').toUpperCase();
        if (keyToId.has(extKey)) {
          res.statusCode = 409;
          res.end(JSON.stringify({ error: 'Duplicate externalKey', id: keyToId.get(extKey) }));
          return;
        }
        const id = ++seq;
        const record = {
          id,
          externalKey: extKey,
          type: body.type,
          title: body.title,
          parentKey: body.parentKey || null,
          parentId: body.parentId ?? null,
          stage: body.stage || 'Todo',
          status: body.status || 'Todo'
        };
        items.set(String(id), record);
        keyToId.set(extKey, id);
        stats.createOrder.push({ externalKey: extKey, type: body.type, id, parentId: record.parentId });
        res.statusCode = 201;
        res.end(JSON.stringify(record));
        return;
      }

      const putMatch = urlPath.match(/^\/api\/projects\/[^/]+\/work-items\/([^/]+)$/);
      if (req.method === 'PUT' && putMatch) {
        stats.putCount++;
        const id = putMatch[1];
        const existing = items.get(id);
        if (!existing) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        const updated = { ...existing, ...body, id: existing.id };
        items.set(id, updated);
        res.statusCode = 200;
        res.end(JSON.stringify(updated));
        return;
      }

      const patchMatch = urlPath.match(/^\/api\/projects\/[^/]+\/work-items\/([^/]+)\/status$/);
      if (req.method === 'PATCH' && patchMatch) {
        stats.patchCount++;
        const id = patchMatch[1];
        const existing = items.get(id);
        if (!existing) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        const updated = {
          ...existing,
          stage: body.stage || existing.stage,
          status: body.status || existing.status,
          gate: body.gate || existing.gate
        };
        items.set(id, updated);
        res.statusCode = 200;
        res.end(JSON.stringify(updated));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Unhandled route: ${req.method} ${urlPath}` }));
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port, items, keyToId, stats });
    });
  });
}

function httpRequest(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const rawBuf =
      opts.rawBody !== undefined
        ? Buffer.isBuffer(opts.rawBody)
          ? opts.rawBody
          : Buffer.from(String(opts.rawBody), 'utf8')
        : opts.body !== undefined
        ? Buffer.from(JSON.stringify(opts.body), 'utf8')
        : null;
    const headers = {
      Connection: 'close',
      ...(opts.headers || {})
    };
    if (rawBuf !== null) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      if (!headers['Content-Length']) {
        headers['Content-Length'] = rawBuf.length;
      }
    }
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: opts.method || 'GET',
        headers
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            // HTML or non-JSON body
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      }
    );
    req.on('error', reject);
    if (rawBuf !== null) req.write(rawBuf);
    req.end();
  });
}

function connectSseStream(urlStr, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const events = [];
    const waiters = [];
    let buffer = '';
    let settled = false;

    const initialTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`SSE connection to ${urlStr} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    function notifyWaiters(ev) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.predicate(ev)) {
          clearTimeout(w.timer);
          waiters.splice(i, 1);
          w.resolve(ev);
        }
      }
    }

    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: {
          Accept: 'text/event-stream',
          Connection: 'close'
        }
      },
      res => {
        res.setEncoding('utf8');
        res.on('data', chunk => {
          buffer += chunk.replace(/\r\n/g, '\n');
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLines = frame
              .split('\n')
              .filter(l => l.startsWith('data:'))
              .map(l => l.slice(5).trim());
            if (dataLines.length === 0) continue;
            try {
              const payload = JSON.parse(dataLines.join('\n'));
              events.push(payload);
              notifyWaiters(payload);
            } catch {
              // ignore non-JSON frame
            }
          }
          if (!settled && events.length >= 1) {
            settled = true;
            clearTimeout(initialTimer);
            resolve({
              status: res.statusCode,
              headers: res.headers,
              events,
              waitForEvent(predicate, waitTimeoutMs = 5000) {
                const existing = events.find(predicate);
                if (existing) return Promise.resolve(existing);
                return new Promise((resWait, rejWait) => {
                  const timer = setTimeout(() => {
                    rejWait(new Error(`Timed out waiting for SSE event after ${waitTimeoutMs}ms`));
                  }, waitTimeoutMs);
                  waiters.push({ predicate, resolve: resWait, timer });
                });
              },
              close() {
                try {
                  req.destroy();
                  res.destroy();
                } catch {
                  // ignore
                }
              }
            });
          }
        });
      }
    );

    req.on('error', err => {
      if (!settled) {
        settled = true;
        clearTimeout(initialTimer);
        reject(err);
      }
    });
  });
}

function buildCleanProjectContext() {
  return `# Project Context — \`ORD\`

| Metadata Field | Canonical Value |
|---|---|
| **Project Name** | Order Hub |
| **Project Code** | \`ORD\` |
| **Context Status** | \`BA_SEALED_BASELINE\` |
| **Semantic Version** | \`v1.0.0\` |
| **Scope Mode** | \`FULL_PROJECT\` |
| **Semantic Digest (\`feature_srd\`)** | \`SRD-CTX-000000000000\` |
| **Last Updated** | \`2026-11-15\` |

## 1. Purpose
Provide deterministic enterprise order tracking and directory settlement across multi-branch operations.

## 2. Actors & Roles
| Role ID | Title | Permissions |
|---|---|---|
| \`ROLE-ADMIN\` | Branch Admin | Manage and view orders |

## 3. Global Business Rules, Conventions & Shared Workflows
| ID | Title | Statement |
|---|---|---|
| \`BR-GLB-001\` | Tenant Scope | All queries isolate records by branch tenant identifier. |
| \`CONV-SHD-001\` | Standard API Response | Endpoints return canonical resource id, code, and status fields. |
| \`WF-SHD-001\` | Order Directory Pagination | Paginated lists enforce upper bound defined in \`SEED-ORD-PAGE-SIZE\`. |

## 14. Open Escalations
| Escalation ID | Owner | Status |
|---|---|---|
| \`NONE\` | — | \`CLOSED\` |

## 15. Evolution & Version History
| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |
|---|---|---|---|---|---|---|
| \`v1.0.0\` | \`2026-11-15\` | \`BA_SEAL\` | \`ALL\` | Initial baseline | Order Hub baseline | \`BA\`: Sealed \\| \`Dev\`: Implement S1 |
`;
}

function buildStrictCompliantFeatureSpec() {
  return `# FEATURE-001: Order History Directory

| Metadata Field | Canonical Value |
|---|---|
| **Project Code** | \`ORD\` |
| **Feature ID** | \`FEATURE-001\` |
| **Title** | Order History Directory |
| **Sprint / Wave** | \`S1 / Wave 1\` |
| **Archetype** | \`READ_VIEW\` |
| **Channels** | \`Web\` |
| **Screen Refs** | \`SCR-ORD-01\` |
| **Version** | \`v1.0.0\` |
| **Gate A Status (BA)** | \`READY_FOR_DEV\` |
| **Gate B Status (Eng)** | \`PENDING\` |
| **Semantic Digest (\`feature_srd\`)** | \`SRD-F001-000000000000\` |

---

## 1. Business Objective & Actor Matrix
| Actor Role | Access Level | Summary |
|---|---|---|
| \`ROLE-ADMIN\` | Read | View paginated tenant-scoped order directory |

### 1B. User Stories & Release/Sprint Decomposition
| Story ID | Component | Epic | Release | Sprint | Title | Role |
|---|---|---|---|---|---|---|
| \`STR-001-01\` | \`CMP-01\` | \`EPC-01\` | \`REL-1.0\` | \`S1\` | List Orders View | \`ROLE-ADMIN\` |

### 1C. Scope Boundaries & Related Flows
- In Scope: Paginated listing of \`orders\` via \`Order\` model.
- Out of Scope: Payment checkout capture.

## 2. Visual Screen Decomposition Matrix
| Element ID | Screen ID | Element | Interaction | TestID Slug |
|---|---|---|---|---|
| \`EL-ORD-LIST\` | \`SCR-ORD-01\` | Orders Data Table | Paginated list & status badge filter | \`orders-list-table\` |

## 3. UI Lifecycle & Screen States Matrix
| State | Trigger | Visible Behavior |
|---|---|---|
| \`loading\` | Initial API fetch | Skeleton table rows shown |
| \`empty\` | Zero orders returned | Empty state localized banner rendered |
| \`single-item\` | Exactly 1 order returned | Single row rendered with status badge |
| \`populated\` | 2..20 orders returned | Full paginated directory rendered |
| \`disabled\` | Missing \`ROLE-ADMIN\` permission | Filter actions disabled |
| \`error\` | API 5xx / timeout | Retryable error banner shown |

## 4. Deterministic Business Rules, Eligibility Formulas & Seed Bindings
| Rule ID | Title | Statement |
|---|---|---|
| \`BR-ORD-01\` | Tenant Order Filter | Query \`orders\` scoped via \`BR-GLB-001\` capped by \`SEED-ORD-PAGE-SIZE\` displaying \`ENUM-ORDER-STATUS\` badges and honoring \`CONV-SHD-001\` and \`WF-SHD-001\`. |

### 4B. Functional Requirements
| FR ID | Story ID | Requirement | Covered By (AC) |
|---|---|---|---|
| \`FR-01\` | \`STR-001-01\` | Query paginated orders scoped by tenant with status badges | \`AC-01\` |

## 5. Archetype Operational Contract
- Archetype: \`READ_VIEW\` (` + '`GET /api/orders`' + `) backed by \`Order\` model (\`orders\` table).

## 6. Domain Edge Cases & Concurrency / Resilience Matrix

### 6A. Domain Business Edge Cases
| Case ID | Condition | Expected Behavior |
|---|---|---|
| \`DOM-ORD-01\` | Requested page size exceeds \`SEED-ORD-PAGE-SIZE\` | Clamp page limit to \`20\` per \`SEED-ORD-PAGE-SIZE\`. |

### 6B. Resilience & Mobile Contract
| Scenario ID | Risk / Interruption Case | Applicability | Expected Business Outcome | Owner Layer | Linked AC |
|---|---|---|---|---|---|
| \`SCN-01\` | Duplicate Refresh Request | Applicable | Idempotent read query returns consistent order list | \`BACKEND_OWNED\` | \`AC-01\` |
| \`SCN-02\` | Stale Pagination Cursor | N/A — Offset pagination is stateless for read directory | Return first valid page safely | \`BACKEND_OWNED\` | \`N/A\` |
| \`SCN-03\` | Concurrent Status Mutation | N/A — Read-only directory view performs zero writes | Reflect committed status | \`BACKEND_OWNED\` | \`N/A\` |
| \`SCN-04\` | Session Token Expiry | N/A — Handled globally by auth middleware | Redirect to sign-in | \`SHARED_WEB\` | \`N/A\` |
| \`SCN-05\` | Offline Cache Fallback | N/A — Web channel only read view | Show retryable error state | \`SHARED_WEB\` | \`N/A\` |
| \`SCN-06\` | Background Sync Interrupt | N/A — Web channel requires active session without background job | No background sync | \`SHARED_WEB\` | \`N/A\` |

## 7. Bilingual Copy & Localization Table
| Copy Key | AR | EN |
|---|---|---|
| \`orders.list.title\` | سجل الطلبات | Order History |
| \`orders.list.empty\` | لا توجد طلبات | No orders found |

## 8. Deterministic Acceptance Criteria
| AC ID | Criterion | Traced REQ / Rule / Element | Test File |
|---|---|---|---|
| \`AC-01\` | Returns tenant-scoped orders capped at \`SEED-ORD-PAGE-SIZE\` for \`ROLE-ADMIN\` | \`FR-01\`, \`STR-001-01\`, \`BR-ORD-01\`, \`EL-ORD-LIST\`, \`DOM-ORD-01\`, \`SCN-01\` | \`tests/Feature/FEATURE-001Test.php\` |

## 9. Gate A — BA Sealing Scorecard, Ownership Routing & Decisions Snapshot

### 9.1 Key Business Decisions Snapshot
| Decision ID | Provenance Tag | Decision | Reference |
|---|---|---|---|
| \`D-01\` | \`PROJECT_CONTEXT\` | Default directory page size fixed at 20 rows | \`00-project-core/SEED_DEFAULTS_CATALOG.md\` |

**Snapshot Approval:** \`APPROVED\`

### 9.2 Canonical 14-Check Audit Table
- Summary Score: \`P = 10 | F = 0 | U = 0 | N = 4\` -> \`VALID = 100.0%\`
- Verdicts: \`BA-01..08 = PASS\`, \`BA-09 = N/A\`, \`BA-10..11 = PASS\`, \`BA-12..14 = N/A\`

### 9.3 Ownership Routing
N/A — Single-feature Web directory scope resolved inside BA governance.

---

## 10. Feature Evolution & Version History
| Ver | Date | Trigger / CR | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |
|---|---|---|---|---|---|---|
| \`v1.0.0\` | \`2026-11-15\` | \`BA_SEAL\` | \`FEATURE-001\` | Draft spec | Sealed S1 specification | \`BA\`: Sealed \\| \`Dev\`: Complete §11 \\| \`QA\`: Map AC-01 |

---

## 11. Gate B — Engineering Readiness Appendix

| Metadata | Value |
|---|---|
| **Gate B Status** | \`PENDING\` |

| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |
|---|---|---|---|
| \`ENG-01\` | Model/Table Binding | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-02\` | API Endpoint & Envelope Contract | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-03\` | SEED-* & ENUM-* Codebase Mapping | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-04\` | Visual Screen §2 & Lifecycle §3 data-testid Plan | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-05\` | ESR Index & N+1 Prevention | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-06\` | Tenant/IDOR & RBAC Guard | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-07\` | IPDPL/PII Masking | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-08\` | Archetype Concurrency/Idempotency Strategy | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-09\` | Automated Test File Binding | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
| \`ENG-10\` | Mobile/QA Handoff Impact | \`PENDING\` | \`PENDING_ENG_AUDIT\` |
`;
}

async function runSuite() {
  console.log('\n\x1b[1m=== InnovaDigits OS v4.4.0 — Orchestrator, Dual-Core Web UI, MCP & Zero-Terminal UX Suite ===\x1b[0m\n');

  const tmpProj = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v430-orch-'));
  const tmpRegistryFile = path.join(os.tmpdir(), `ai-os-v440-registry-${Date.now()}-${process.pid}.json`);
  const prevRegistryEnv = process.env.OS_WORKSPACES_REGISTRY;
  process.env.OS_WORKSPACES_REGISTRY = tmpRegistryFile;
  const v440TempDirs = [];
  let tmpBaOnlyHub = null;
  const mcp = createMcpTestClient({ OS_WORKSPACES_REGISTRY: tmpRegistryFile });
  let mockPmtool = null;
  let webUi = null;
  let baWebUi = null;
  let wizardUi = null;
  let sseClient = null;

  try {
    // -------------------------------------------------------------------------
    // CHECK 1: MCP Capabilities, 10 Tools, Prompts (list/get) & Resources (list/read)
    // -------------------------------------------------------------------------
    console.log('\x1b[36m[CHECK 1/9] Testing MCP 2024-11-05 capabilities, 10 tools, 4 prompts & 3 resources...\x1b[0m');
    fs.mkdirSync(path.join(tmpProj, '.ai', 'plugins'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'stack.json'), path.join(tmpProj, 'stack.json'));
    const hubRoot = path.join(tmpProj, 'docs', 'project-context-hub');
    fs.mkdirSync(path.join(hubRoot, '00-project-core'), { recursive: true });
    fs.mkdirSync(path.join(hubRoot, '01-roadmap-and-pm'), { recursive: true });
    fs.mkdirSync(path.join(hubRoot, '02-sprints', 'S1'), { recursive: true });

    const initRes = await mcp.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'verify-mcp-suite', version: '2.0.0' }
    });
    mcp.sendNotification('notifications/initialized', {});

    const toolsList = await mcp.request('tools/list', {});
    const toolNames = (toolsList.result?.tools || []).map(t => t.name);
    const expectedTools = [
      'os_inspect_project',
      'os_get_stage_directive',
      'os_run_gate_and_advance',
      'os_approve_checkpoint',
      'os_evolve_cr',
      'os_generate_qa_pack',
      'os_bootstrap_project',
      'pmtool_inspect_board',
      'pmtool_push_wbs',
      'pmtool_sync_gate_status'
    ];

    const promptsList = await mcp.request('prompts/list', {});
    const promptNames = (promptsList.result?.prompts || []).map(p => p.name);
    const promptOrchestrate = await mcp.request('prompts/get', {
      name: '/os-orchestrate',
      arguments: { projectRoot: tmpProj }
    });
    const promptEvolve = await mcp.request('prompts/get', {
      name: 'os-evolve-cr',
      arguments: { projectRoot: tmpProj, crId: 'CR-101', toVersion: 'v1.1.0' }
    });

    const resourcesList = await mcp.request('resources/list', {});
    const resourceUris = (resourcesList.result?.resources || []).map(r => r.uri);
    const resCurrent = await mcp.request('resources/read', {
      uri: `os://state/current?projectRoot=${encodeURIComponent(tmpProj)}`
    });
    const resCurrentJson = JSON.parse(resCurrent.result?.contents?.[0]?.text || '{}');

    if (
      initRes.result?.protocolVersion === '2024-11-05' &&
      initRes.result?.capabilities?.prompts &&
      initRes.result?.capabilities?.resources &&
      expectedTools.every(t => toolNames.includes(t)) &&
      toolNames.length === 10 &&
      ['os-orchestrate', 'os-advance', 'os-approve', 'os-evolve-cr'].every(p => promptNames.includes(p)) &&
      promptOrchestrate.result?.messages?.[0]?.content?.text.includes('/os-orchestrate') &&
      promptEvolve.result?.messages?.[0]?.content?.text.includes('CR-101') &&
      ['os://state/current', 'os://state/handoffs', 'os://audit/trail'].every(u => resourceUris.includes(u)) &&
      resCurrentJson.ok === true &&
      resCurrentJson.currentStage === 'INTAKE' &&
      mcp.invalidStdoutLines.length === 0
    ) {
      pass('MCP initialized (2024-11-05) with 10 tools, 4 slash prompts, 3 resources & 0 non-JSON stdout frames.');
    } else {
      fail('MCP capabilities/prompts/resources check failed', JSON.stringify({ initRes, toolNames, promptNames, resourceUris, resCurrentJson }));
    }

    // -------------------------------------------------------------------------
    // CHECK 2: INTAKE (Stage 1) + TEAM_RBAC Role Locks, roleAssignments & Role Inbox
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 2/9] Testing INTAKE Stage 1, 6-Role TEAM_RBAC, roleAssignments & Role Inbox...\x1b[0m');
    fs.mkdirSync(path.join(tmpProj, 'app', 'Models'), { recursive: true });
    fs.mkdirSync(path.join(tmpProj, 'app', 'Http', 'Controllers'), { recursive: true });
    fs.mkdirSync(path.join(tmpProj, 'database', 'migrations'), { recursive: true });
    fs.mkdirSync(path.join(tmpProj, 'tests', 'Feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpProj, 'docs', 'modules'), { recursive: true });

    fs.writeFileSync(
      path.join(tmpProj, 'app', 'Models', 'Order.php'),
      `<?php\nnamespace App\\Models;\nuse Illuminate\\Database\\Eloquent\\Model;\nclass Order extends Model {\n  protected $table = 'orders';\n  protected $fillable = ['code', 'status'];\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpProj, 'app', 'Http', 'Controllers', 'OrderController.php'),
      `<?php\nnamespace App\\Http\\Controllers;\nclass OrderController {\n  public function index() { return []; }\n}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpProj, 'database', 'migrations', '2026_11_15_000001_create_orders_table.php'),
      `<?php\nSchema::create('orders', function ($table) { $table->id(); $table->unsignedBigInteger('tenant_id'); $table->string('status'); $table->index(['tenant_id', 'status', 'created_at']); });\n`,
      'utf8'
    );
    fs.writeFileSync(path.join(tmpProj, 'tests', 'Feature', 'FEATURE-001Test.php'), '<?php // AC-01\n', 'utf8');
    fs.writeFileSync(
      path.join(tmpProj, 'docs', 'modules', 'orders.json'),
      JSON.stringify(
        {
          openapi: '3.0.0',
          info: { title: 'Orders API', version: '1.0.0' },
          servers: [{ url: 'http://localhost:8000' }],
          paths: {
            '/api/orders': {
              get: { summary: 'List orders', responses: { '200': { description: 'OK' } } }
            }
          }
        },
        null,
        2
      ),
      'utf8'
    );
    execFileSync(
      process.execPath,
      [path.join(BIN_DIR, 'build-security-cicd.js'), '--provider=github', `--target=${tmpProj}`, '--force'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );

    // Configure TEAM_RBAC + explicit roleAssignments (PMTool add-on remains disabled!)
    const orchConfig = {
      schemaVersion: '4.3.0',
      mode: 'TEAM_RBAC',
      requireHumanCheckpoints: true,
      checkpointStages: ['CORE_BOOTSTRAP', 'SPRINT_SPECS', 'DEV_IMPLEMENT'],
      circuitBreaker: { maxRetries: 3, autoAppendLessonsLearned: true },
      roleAssignments: {
        BA: ['alice-ba'],
        TECH_LEAD: ['*'],
        DEV: ['*'],
        SECURITY: ['*'],
        QA: ['*'],
        PM: ['*']
      },
      addons: {
        pmtool: { enabled: false }
      },
      pluginsDir: '.ai/plugins'
    };
    fs.writeFileSync(path.join(tmpProj, '.ai', 'orchestrator.config.json'), JSON.stringify(orchConfig, null, 2), 'utf8');

    const lockQaOnIntake = await mcp.callTool('os_get_stage_directive', {
      projectRoot: tmpProj,
      stage: 'INTAKE',
      role: 'QA'
    });
    const denyWrongBaActor = await mcp.callTool('os_run_gate_and_advance', {
      projectRoot: tmpProj,
      stage: 'INTAKE',
      role: 'BA',
      actor: 'bob-unauthorized'
    });
    const lockBaOnSecurity = await mcp.callTool('os_run_gate_and_advance', {
      projectRoot: tmpProj,
      stage: 'SECURITY_PERF_GATE',
      role: 'BA',
      actor: 'alice-ba'
    });
    const passIntake = await mcp.callTool('os_run_gate_and_advance', {
      projectRoot: tmpProj,
      stage: 'INTAKE',
      role: 'BA',
      actor: 'alice-ba',
      projectCode: 'ORD',
      projectName: 'Order Hub'
    });

    const handoffRes = await mcp.request('resources/read', {
      uri: `os://state/handoffs?projectRoot=${encodeURIComponent(tmpProj)}`
    });
    const handoffJson = JSON.parse(handoffRes.result?.contents?.[0]?.text || '{}');

    if (
      lockQaOnIntake.isError === true &&
      lockQaOnIntake.payload.code === 'RBAC_ROLE_LOCKED' &&
      denyWrongBaActor.isError === true &&
      denyWrongBaActor.payload.code === 'RBAC_ACTOR_UNAUTHORIZED' &&
      lockBaOnSecurity.isError === true &&
      lockBaOnSecurity.payload.requiredRole === 'SECURITY' &&
      passIntake.payload.ok === true &&
      passIntake.payload.currentStage === 'CORE_BOOTSTRAP' &&
      handoffJson.handoffQueue?.BA?.length === 1 &&
      handoffJson.handoffQueue.BA[0].stage === 'CORE_BOOTSTRAP'
    ) {
      pass('INTAKE advanced to CORE_BOOTSTRAP, TEAM_RBAC + roleAssignments blocked unauthorized caller, and Role Inbox queued BA.');
    } else {
      fail('CHECK 2/9 failed', JSON.stringify({ lockQaOnIntake, denyWrongBaActor, lockBaOnSecurity, passIntake, handoffJson }));
    }

    // -------------------------------------------------------------------------
    // CHECK 3: 3-Strike Circuit Breaker, Remediation Packet & LESSONS_LEARNED Auto-Append
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 3/9] Testing Circuit Breaker (maxRetries=3 -> CIRCUIT_OPEN_ESCALATED) & auto-heal LESSONS_LEARNED...\x1b[0m');
    const dirtyCtx = `# Project Context — \`ORD\`

| Metadata Field | Canonical Value |
|---|---|
| **Project Name** | Order Hub |
| **Project Code** | \`ORD\` |
| **Semantic Version** | \`v1.0.0\` |
| **Scope Mode** | \`FULL_PROJECT\` |

## 1. Purpose
- **Vision:** [1–3 concise sentences describing observable outcome]
- **Ref:** \`CR-001\` leftover example token
`;
    fs.writeFileSync(path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'), dirtyCtx, 'utf8');
    fs.writeFileSync(
      path.join(hubRoot, '00-project-core', 'GLOSSARY_AND_ENUMS.md'),
      '# Glossary & Canonical Enums\n\n| Enum ID | Values | Labels |\n|---|---|---|\n| `ENUM-ORDER-STATUS` | `draft, confirmed` | مسودة / مؤكد |\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(hubRoot, '00-project-core', 'SEED_DEFAULTS_CATALOG.md'),
      '# Seed Defaults Catalog\n\n| Seed ID | Value | Sign-Off |\n|---|---|---|\n| `SEED-ORD-PAGE-SIZE` | `20` | `APPROVED` |\n',
      'utf8'
    );

    const strike1 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'CORE_BOOTSTRAP', role: 'BA', actor: 'alice-ba' });
    const strike2 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'CORE_BOOTSTRAP', role: 'BA', actor: 'alice-ba' });
    const strike3 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'CORE_BOOTSTRAP', role: 'BA', actor: 'alice-ba' });
    const strike4FastFail = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'CORE_BOOTSTRAP', role: 'BA', actor: 'alice-ba' });

    // Fix files cleanly on disk -> circuit resets and appends LESSONS_LEARNED.md!
    fs.writeFileSync(path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md'), buildCleanProjectContext(), 'utf8');
    const afterFixCore = await mcp.callTool('os_run_gate_and_advance', {
      projectRoot: tmpProj,
      stage: 'CORE_BOOTSTRAP',
      role: 'BA',
      actor: 'alice-ba'
    });

    const projectLessonsPath = path.join(tmpProj, '.ai', 'context', 'LESSONS_LEARNED.md');
    const lessonsExists = fs.existsSync(projectLessonsPath);
    const lessonsText = lessonsExists ? fs.readFileSync(projectLessonsPath, 'utf8') : '';

    if (
      strike1.payload.retryCount === 1 &&
      strike1.payload.circuitOpen === false &&
      strike2.payload.retryCount === 2 &&
      strike3.payload.retryCount === 3 &&
      strike3.payload.circuitOpen === true &&
      strike3.payload.status === 'CIRCUIT_OPEN_ESCALATED' &&
      strike3.payload.remediationPacket?.ruleIds?.includes('ANTI-PLACEHOLDER-01') &&
      strike4FastFail.payload.code === 'CIRCUIT_BREAKER_OPEN' &&
      afterFixCore.payload.ok === true &&
      afterFixCore.payload.status === 'PENDING_HUMAN_APPROVAL' &&
      afterFixCore.payload.advanced === false &&
      lessonsExists &&
      lessonsText.includes('ANTI-PLACEHOLDER-01')
    ) {
      pass('Circuit breaker tripped at retry 3 (CIRCUIT_OPEN_ESCALATED), fast-failed strike 4, reset on fix, auto-logged LESSONS_LEARNED.md, and paused at PENDING_HUMAN_APPROVAL.');
    } else {
      fail('CHECK 3/9 failed', JSON.stringify({ strike1: strike1.payload, strike3: strike3.payload, strike4FastFail: strike4FastFail.payload, afterFixCore: afterFixCore.payload, lessonsExists }));
    }

    // -------------------------------------------------------------------------
    // CHECK 4: Human-in-the-Loop Checkpoints & os_approve_checkpoint Audit Trail
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 4/9] Testing Human Checkpoint Pause & os_approve_checkpoint immutable audit trail...\x1b[0m');
    const approveCore = await mcp.callTool('os_approve_checkpoint', {
      projectRoot: tmpProj,
      stage: 'CORE_BOOTSTRAP',
      decision: 'APPROVED',
      actor: 'alice-ba',
      role: 'BA',
      notes: 'Pass 1 Core context & SEED-ORD-PAGE-SIZE approved'
    });
    const auditAfterChk = await mcp.request('resources/read', {
      uri: `os://audit/trail?projectRoot=${encodeURIComponent(tmpProj)}`
    });
    const auditJson = JSON.parse(auditAfterChk.result?.contents?.[0]?.text || '{}');

    if (
      approveCore.payload.ok === true &&
      approveCore.payload.approved === true &&
      approveCore.payload.advanced === true &&
      approveCore.payload.currentStage === 'SPRINT_PLAN' &&
      Array.isArray(auditJson.checkpointAuditTrail) &&
      auditJson.checkpointAuditTrail.length === 1 &&
      auditJson.checkpointAuditTrail[0].actor === 'alice-ba' &&
      auditJson.checkpointAuditTrail[0].decision === 'APPROVED' &&
      /^sha256:[a-f0-9]{16}$/.test(auditJson.checkpointAuditTrail[0].digest)
    ) {
      pass('CORE_BOOTSTRAP Human Checkpoint approved with immutable SHA-256 audit entry in os://audit/trail.');
    } else {
      fail('CHECK 4/9 failed', JSON.stringify({ approveCore: approveCore.payload, auditJson }));
    }

    // -------------------------------------------------------------------------
    // CHECK 5: Stages 3..10 Full Progression + Add-on Plugin Hooks (PMTool Disabled)
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 5/9] Testing Stages 3..10 (SPRINT_PLAN..RELEASE_SEAL) & decoupled Add-on Hooks...\x1b[0m');
    // Confirm PMTool is disabled by default & non-blocking
    const pmDisabledInspect = await mcp.callTool('pmtool_inspect_board', { projectRoot: tmpProj, sprint: 'S1' });
    const pmDisabledPush = await mcp.callTool('pmtool_push_wbs', { projectRoot: tmpProj, sprint: 'S1' });

    // Install custom audit plugin + faulty plugin to verify hook execution & fault isolation
    const pluginEventsPath = path.join(tmpProj, '.ai', 'plugin-events.json');
    fs.writeFileSync(
      path.join(tmpProj, '.ai', 'plugins', 'audit-hook.js'),
      `const fs = require('fs');
const out = ${JSON.stringify(pluginEventsPath)};
function rec(ev) {
  const arr = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  arr.push(ev);
  fs.writeFileSync(out, JSON.stringify(arr, null, 2));
}
module.exports = {
  id: 'audit-hook',
  name: 'Workspace Audit Recorder',
  onBeforeStage(ctx) { rec({ hook: 'onBeforeStage', stage: ctx.stage }); },
  onAfterGatePass(ctx) { rec({ hook: 'onAfterGatePass', stage: ctx.stage }); },
  onCheckpointApproved(ctx) { rec({ hook: 'onCheckpointApproved', stage: ctx.stage }); },
  onReleaseSealed(ctx) { rec({ hook: 'onReleaseSealed', stage: ctx.stage, version: ctx.version }); }
};
`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpProj, '.ai', 'plugins', 'broken-hook.js'),
      `module.exports = {
  id: 'broken-hook',
  name: 'Broken Plugin Simulator',
  onAfterGatePass(ctx) {
    if (ctx.stage === 'GATE_A_SEAL') throw new Error('Simulated third-party timeout');
  }
};
`,
      'utf8'
    );

    fs.writeFileSync(
      path.join(hubRoot, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md'),
      `# Sprint Master Plan

| Metadata Field | Canonical Value |
|---|---|
| **Planned Sprints / Batches** | \`1\` (S1) |
| **Archetype Breakdown** | \`READ_VIEW: 1\` \\| \`MUTATION_WORKFLOW: 0\` \\| \`INTEGRATION_JOB: 0\` |
| **Gate A (\`READY_FOR_DEV\`) Sealed** | \`1 / 1\` |
| **Gate B (\`READY_TO_CODE\`) Cleared** | \`0 / 1\` |
| **Last Updated** | \`2026-11-15\` |

## 2. Sprint Allocation Matrix
| Sprint ID | Wave (\`1\`/\`2\`/\`3\`) | Feature ID | Title | Archetype | Channels | Upstream Dependencies | Gate A | Gate B |
|---|---|---|---|---|---|---|---|---|
| \`S1\` | \`1\` | \`FEATURE-001\` | Order History Directory | \`READ_VIEW\` | \`Web\` | \`NONE\` | \`READY_FOR_DEV\` | \`PENDING\` |
`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md'),
      `# 5-Level Project Backlog WBS

## 1. Level 1 — Components (\`CMP-*\`)
| Component ID | Title | PMTool ID |
|---|---|---|
| \`CMP-01\` | Order Core | \`PENDING\` |

## 2. Level 2 — Epics (\`EPC-*\`)
| Epic ID | Parent Component | Title | Release | Priority | PMTool ID |
|---|---|---|---|---|---|
| \`EPC-01\` | \`CMP-01\` | Order Checkout | \`REL-1.0\` | \`high\` | \`PENDING\` |

## 3. Level 3 — Features (\`FEATURE-*\`) & Stories (\`STR-*\`)
| Feature ID | Parent Epic | Title | Release | Sprint | Priority | PMTool ID |
|---|---|---|---|---|---|---|
| \`FEATURE-001\` | \`EPC-01\` | Order History Directory | \`REL-1.0\` | \`S1\` | \`high\` | \`PENDING\` |

| Story ID | Parent Feature | Title | Release | Sprint | Priority | Stage | Assignee Role | PMTool ID |
|---|---|---|---|---|---|---|---|---|
| \`STR-001-01\` | \`FEATURE-001\` | List Orders View | \`REL-1.0\` | \`S1\` | \`high\` | \`Todo\` | \`Backend\` | \`PENDING\` |

## 4. Level 5 — Tasks (\`TSK-*\`)
| Task ID | Parent Story | Department | Title | Release | Sprint | Est (h) | PMTool ID |
|---|---|---|---|---|---|---|---|
| \`TSK-001-01-BE\` | \`STR-001-01\` | \`BE\` | [BE] List Orders Endpoint | \`REL-1.0\` | \`S1\` | 4h | \`PENDING\` |
| \`TSK-001-01-QA\` | \`STR-001-01\` | \`QA\` | [QA] List Orders Assertions | \`REL-1.0\` | \`S1\` | 3h | \`PENDING\` |
`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(hubRoot, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md'),
      `# Change Impact Register — \`ORD\`

| Metadata Field | Canonical Value |
|---|---|
| **Current Hub Version** | \`v1.0.0\` |
| **Last Updated** | \`2026-11-15\` |

| CR ID | Hub Version | Target ID | Summary | Date |
|---|---|---|---|---|
| \`CR-ORD-000\` | \`v1.0.0\` | \`ALL\` | Initial S1 Baseline | \`2026-11-15\` |
`,
      'utf8'
    );

    const feature001Path = path.join(hubRoot, '02-sprints', 'S1', 'FEATURE-001.md');
    fs.writeFileSync(feature001Path, buildStrictCompliantFeatureSpec(), 'utf8');

    // Stage 3: SPRINT_PLAN
    const st3 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'SPRINT_PLAN', role: 'BA', actor: 'alice-ba' });
    // Stage 4: SPRINT_SPECS -> pauses at checkpoint -> approve via orchestrator-cli --approve!
    const st4 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'SPRINT_SPECS', role: 'BA', actor: 'alice-ba' });
    const st4ApproveCli = JSON.parse(
      execFileSync(
        process.execPath,
        [
          path.join(BIN_DIR, 'orchestrator-cli.js'),
          `--project=${tmpProj}`,
          '--approve',
          '--stage=SPRINT_SPECS',
          '--role=BA',
          '--actor=alice-ba',
          '--notes=Sprint S1 decisions snapshot signed',
          '--json'
        ],
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    );
    // Stage 5: GATE_A_SEAL (runs audit-hook + isolates broken-hook crash without blocking!)
    const st5 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'GATE_A_SEAL', role: 'BA', actor: 'alice-ba' });
    const sealedFeatSrd = computeFeatureSrd(fs.readFileSync(feature001Path, 'utf8'));

    // Stage 6: GATE_B_ENG (TECH_LEAD)
    const st6 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'GATE_B_ENG', role: 'TECH_LEAD' });
    // Stage 7: DEV_IMPLEMENT (DEV) -> pauses at checkpoint -> approve via os_approve_checkpoint
    const st7 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'DEV_IMPLEMENT', role: 'DEV' });
    const st7Approve = await mcp.callTool('os_approve_checkpoint', {
      projectRoot: tmpProj,
      stage: 'DEV_IMPLEMENT',
      decision: 'APPROVED',
      role: 'DEV',
      notes: 'Wave 1 Turn 1 blueprint approved'
    });
    // Stage 8: SECURITY_PERF_GATE (SECURITY)
    const st8 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'SECURITY_PERF_GATE', role: 'SECURITY' });
    // Stage 9: QA_HANDOFF (QA)
    const st9 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'QA_HANDOFF', role: 'QA' });
    // Stage 10: RELEASE_SEAL (PM)
    const st10 = await mcp.callTool('os_run_gate_and_advance', { projectRoot: tmpProj, stage: 'RELEASE_SEAL', role: 'PM' });

    const finalAudit = JSON.parse(
      (await mcp.request('resources/read', { uri: `os://audit/trail?projectRoot=${encodeURIComponent(tmpProj)}` }))
        .result?.contents?.[0]?.text || '{}'
    );
    const recordedPluginEvents = fs.existsSync(pluginEventsPath) ? JSON.parse(fs.readFileSync(pluginEventsPath, 'utf8')) : [];
    const hasReleaseSealedHook = recordedPluginEvents.some(e => e.hook === 'onReleaseSealed' && e.stage === 'RELEASE_SEAL');
    const hasIsolatedBrokenLog = (finalAudit.addonLogs || []).some(l => l.pluginId === 'broken-hook' && l.status === 'ERROR' && l.error.includes('Simulated third-party timeout'));

    if (
      pmDisabledInspect.payload.status === 'ADDON_DISABLED' &&
      pmDisabledPush.payload.status === 'ADDON_DISABLED' &&
      st3.payload.currentStage === 'SPRINT_SPECS' &&
      st4.payload.status === 'PENDING_HUMAN_APPROVAL' &&
      st4ApproveCli.approved === true &&
      st4ApproveCli.currentStage === 'GATE_A_SEAL' &&
      st5.payload.currentStage === 'GATE_B_ENG' &&
      st6.payload.currentStage === 'DEV_IMPLEMENT' &&
      st7.payload.status === 'PENDING_HUMAN_APPROVAL' &&
      st7Approve.payload.currentStage === 'SECURITY_PERF_GATE' &&
      st8.payload.currentStage === 'QA_HANDOFF' &&
      st9.payload.currentStage === 'RELEASE_SEAL' &&
      st10.payload.status === 'RELEASE_SEALED' &&
      st10.payload.currentStage === 'COMPLETED' &&
      finalAudit.releaseSealed === true &&
      finalAudit.checkpointAuditTrail.length === 3 &&
      hasReleaseSealedHook &&
      hasIsolatedBrokenLog
    ) {
      pass('Full 10-stage pipeline completed to RELEASE_SEAL, 3 checkpoints audited, PMTool remained disabled, and broken-hook crash was isolated in addonLogs.');
    } else {
      fail(
        'CHECK 5/9 failed',
        JSON.stringify({
          pmDisabledInspect: pmDisabledInspect.payload,
          st3: st3.payload,
          st4: st4.payload,
          st4ApproveCli,
          st5: st5.payload,
          st6: st6.payload,
          st7: st7.payload,
          st7Approve: st7Approve.payload,
          st8: st8.payload,
          st9: st9.payload,
          st10: st10.payload,
          hasReleaseSealedHook,
          hasIsolatedBrokenLog
        })
      );
    }

    // -------------------------------------------------------------------------
    // CHECK 6: DELTA_EVOLVE CR Track + Optional PMTool Add-on REST/XLSX & CLI Checks
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 6/9] Testing DELTA_EVOLVE CR track, preserved stages, PMTool add-on activation & CLI...\x1b[0m');
    const crRes = await mcp.callTool('os_evolve_cr', {
      projectRoot: tmpProj,
      crId: 'CR-101',
      fromVersion: 'v1.0.0',
      toVersion: 'v1.1.0',
      targetId: 'FEATURE-001',
      was: 'SEED-ORD-PAGE-SIZE = 20',
      current: 'SEED-ORD-PAGE-SIZE = 50',
      summary: 'Expand directory page limit to 50 rows',
      role: 'BA',
      actor: 'alice-ba'
    });
    const postCrState = (await mcp.callTool('os_inspect_project', { projectRoot: tmpProj })).payload;
    const postCrFeatSrd = computeFeatureSrd(fs.readFileSync(feature001Path, 'utf8'));

    // Activate PMTool Add-on explicitly in .ai/orchestrator.config.json
    orchConfig.addons.pmtool.enabled = true;
    fs.writeFileSync(path.join(tmpProj, '.ai', 'orchestrator.config.json'), JSON.stringify(orchConfig, null, 2), 'utf8');

    mockPmtool = await startMockPmtoolServer();
    fs.writeFileSync(
      path.join(tmpProj, '.ai', 'pmtool.config.json'),
      JSON.stringify({ baseUrl: `http://127.0.0.1:${mockPmtool.port}`, apiToken: 'verify-mcp-token', projectId: 'ORD' }, null, 2),
      'utf8'
    );

    const inspectBoard = await mcp.callTool('pmtool_inspect_board', { projectRoot: tmpProj, sprint: 'S1' });
    const dryPush = await mcp.callTool('pmtool_push_wbs', { projectRoot: tmpProj, sprint: 'S1' });
    const postsAfterDryRun = mockPmtool.stats.postCount;
    const livePush1 = await mcp.callTool('pmtool_push_wbs', { projectRoot: tmpProj, sprint: 'S1', dryRun: false });
    const livePush2 = await mcp.callTool('pmtool_push_wbs', { projectRoot: tmpProj, sprint: 'S1', dryRun: false });

    // Remove .ai/pmtool.config.json to verify XLSX fallback
    fs.rmSync(path.join(tmpProj, '.ai', 'pmtool.config.json'), { force: true });
    const xlsxPush = await mcp.callTool('pmtool_push_wbs', { projectRoot: tmpProj, sprint: 'S1', dryRun: false });

    // CLI scriptable + interactive checks
    const cliStatus = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(BIN_DIR, 'orchestrator-cli.js'), `--project=${tmpProj}`, '--status', '--json'],
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    );
    const cliAddons = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(BIN_DIR, 'orchestrator-cli.js'), `--project=${tmpProj}`, '--list-addons', '--json'],
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    );
    const cliInteractive = execFileSync(
      process.execPath,
      [path.join(BIN_DIR, 'orchestrator-cli.js'), `--project=${tmpProj}`],
      { cwd: REPO_ROOT, input: '2\nq\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (
      crRes.payload.ok === true &&
      crRes.payload.toVersion === 'v1.1.0' &&
      fs.existsSync(path.join(hubRoot, '03-version-deltas', 'DELTA_v1.0.0_to_v1.1.0.md')) &&
      fs.existsSync(path.join(tmpProj, 'docs', 'business-context', 'DELTA_EXECUTION_PLAN.md')) &&
      postCrState.semanticVersion === 'v1.1.0' &&
      postCrState.releaseSealed === true &&
      postCrState.mainStagesPassed === 10 &&
      postCrState.stages.DELTA_EVOLVE.status === 'PASSED' &&
      postCrFeatSrd === sealedFeatSrd &&
      inspectBoard.payload.addonEnabled === true &&
      dryPush.payload.dryRun === true &&
      postsAfterDryRun === 0 &&
      livePush1.payload.counts.created === 6 &&
      livePush2.payload.counts.created === 0 &&
      livePush2.payload.counts.updated === 6 &&
      xlsxPush.payload.mode === 'xlsx' &&
      cliStatus.ok === true &&
      cliAddons.addons.some(a => a.id === 'pmtool' && a.enabled === true) &&
      cliInteractive.includes('InnovaDigits AI Engineering OS') &&
      cliInteractive.includes('11-Stage SDLC Progress')
    ) {
      pass('DELTA_EVOLVE compiled CR-101 (v1.0.0 -> v1.1.0) preserving all 10 sealed stages + feature_srd, PMTool REST/XLSX add-on passed when enabled, and 11-stage CLI passed.');
    } else {
      fail(
        'CHECK 6/9 failed',
        JSON.stringify({
          crRes: crRes.payload,
          postCrState: {
            ver: postCrState.semanticVersion,
            sealed: postCrState.releaseSealed,
            passed: postCrState.mainStagesPassed,
            deltaStatus: postCrState.stages?.DELTA_EVOLVE?.status
          },
          srdPreserved: postCrFeatSrd === sealedFeatSrd,
          postsAfterDryRun,
          livePush1: livePush1.payload,
          livePush2: livePush2.payload,
          xlsxPush: xlsxPush.payload
        })
      );
    }

    // -------------------------------------------------------------------------
    // CHECK 7: Unified Dual-Core Web UI, CSRF Guard, BA/Eng Gates, Dispatch & SSE
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 7/9] Testing Unified Dual-Core Web UI (`bin/web-ui.js`), CSRF Guard, BA Verify, Dispatch & SSE Sync...\x1b[0m');
    webUi = await startWebUiServer({ projectRoot: tmpProj, port: 0 });
    const baseUrl = webUi.url;

    const htmlRes = await httpRequest(`${baseUrl}/`);
    const tokenMatch = htmlRes.text.match(/<meta\s+name="os-session-token"\s+content="([a-f0-9]{64})"/i);
    const extractedToken = tokenMatch ? tokenMatch[1] : '';

    const apiStateRes = await httpRequest(`${baseUrl}/api/state`);
    sseClient = await connectSseStream(`${baseUrl}/api/events`);

    // CSRF / Origin / Session Token negative checks
    const rejectMissingOrigin = await httpRequest(`${baseUrl}/api/checkpoint/approve`, {
      method: 'POST',
      headers: { 'X-Session-Token': extractedToken },
      body: { sprint: 'S2', stage: 'CORE_BOOTSTRAP', decision: 'APPROVED' }
    });
    const rejectEvilOrigin = await httpRequest(`${baseUrl}/api/checkpoint/approve`, {
      method: 'POST',
      headers: { Origin: 'http://evil.example', 'X-Session-Token': extractedToken },
      body: { sprint: 'S2', stage: 'CORE_BOOTSTRAP', decision: 'APPROVED' }
    });
    const rejectBadToken = await httpRequest(`${baseUrl}/api/checkpoint/approve`, {
      method: 'POST',
      headers: { Origin: baseUrl, 'X-Session-Token': 'forged-session-token' },
      body: { sprint: 'S2', stage: 'CORE_BOOTSTRAP', decision: 'APPROVED' }
    });

    const validHeaders = { Origin: baseUrl, 'X-Session-Token': extractedToken };

    // Track A zero-token BA strict verification action + SSE
    const baVerifyRes = await httpRequest(`${baseUrl}/api/gate/run`, {
      method: 'POST',
      headers: validHeaders,
      body: { action: 'ba_verify' }
    });
    const sseAfterBaVerify = await sseClient.waitForEvent(ev => ev.reason === 'ba_verify', 5000);

    // Run gate for Sprint S2 -> pauses at CORE_BOOTSTRAP Human Checkpoint & emits SSE
    const webAdvanceRes = await httpRequest(`${baseUrl}/api/gate/run`, {
      method: 'POST',
      headers: validHeaders,
      body: { sprint: 'S2', stage: 'CORE_BOOTSTRAP', role: 'BA', actor: 'alice-ba' }
    });
    const sseAfterAdvance = await sseClient.waitForEvent(
      ev => ev.reason === 'gate_run' && ev.activeSprint === 'S2' && ev.pendingCheckpoint?.stage === 'CORE_BOOTSTRAP',
      5000
    );

    // Approve Human Checkpoint via Web UI -> advances to SPRINT_PLAN, persists audit trail & emits SSE
    const webApproveRes = await httpRequest(`${baseUrl}/api/checkpoint/approve`, {
      method: 'POST',
      headers: validHeaders,
      body: {
        sprint: 'S2',
        stage: 'CORE_BOOTSTRAP',
        decision: 'APPROVED',
        role: 'BA',
        actor: 'alice-ba',
        notes: 'Approved via Web UI E2E'
      }
    });
    const sseAfterApprove = await sseClient.waitForEvent(
      ev =>
        ev.reason === 'checkpoint_approve' &&
        ev.currentStage === 'SPRINT_PLAN' &&
        Array.isArray(ev.checkpointAuditTrail) &&
        ev.checkpointAuditTrail.some(entry => entry.notes === 'Approved via Web UI E2E'),
      5000
    );

    // Antigravity/Cursor dispatch bridge -> .ai/.dispatch-queue.json + MCP os-advance prompt pickup
    const dispatchRes = await httpRequest(`${baseUrl}/api/dispatch`, {
      method: 'POST',
      headers: validHeaders,
      body: { stage: 'SPRINT_PLAN', sprint: 'S2', role: 'BA', actor: 'alice-ba', skipClipboard: true }
    });
    const dispatchQueueFile = path.join(tmpProj, '.ai', '.dispatch-queue.json');
    const dispatchQueueExists = fs.existsSync(dispatchQueueFile);

    const invokeMcpRpc = (client, method, params) => {
      if (typeof client.request === 'function') return client.request(method, params);
      if (typeof client.sendRequest === 'function') return client.sendRequest(method, params);
      if (typeof client.rpc === 'function') return client.rpc(method, params);
      throw new Error('Unsupported MCP test client RPC method');
    };
    const osAdvancePrompt = await invokeMcpRpc(mcp, 'prompts/get', {
      name: 'os-advance',
      arguments: { sprint: 'S2' }
    });
    const osAdvancePromptText = JSON.stringify(osAdvancePrompt || {});

    // External workspace edit -> SSE external_sync live update
    fs.writeFileSync(
      path.join(hubRoot, '00-project-core', 'UX_DESIGN_BRIEF.md'),
      '# UX Design Brief — ORD\n\n## 1. Visual Tokens\nPrimary navy `#03156B` and bilingual RTL/LTR layout.\n',
      'utf8'
    );
    const sseAfterExternalSync = await sseClient.waitForEvent(ev => ev.reason === 'external_sync', 5000);

    const apiStateAfter = await httpRequest(`${baseUrl}/api/state`);
    const lockLeftover = fs.existsSync(path.join(hubRoot, '.os-state.lock'));
    const initialFeat001 = Array.isArray(apiStateRes.json?.baSdlc?.featureMatrix)
      ? apiStateRes.json.baSdlc.featureMatrix.find(f => String(f.id || f.featureId || '').includes('FEATURE-001'))
      : null;

    if (
      webUi.host === '127.0.0.1' &&
      htmlRes.status === 200 &&
      String(htmlRes.headers['content-type'] || '').includes('text/html') &&
      htmlRes.text.includes('#03156B') &&
      htmlRes.text.includes('data-testid="webui-tab-ba"') &&
      htmlRes.text.includes('data-testid="webui-tab-eng"') &&
      htmlRes.text.includes('data-testid="webui-ba-verify-btn"') &&
      htmlRes.text.includes('data-testid="webui-dispatch-active-btn"') &&
      htmlRes.text.includes('data-testid="webui-checkpoint-approve-btn"') &&
      htmlRes.text.includes('data-testid="webui-workspace-switcher"') &&
      htmlRes.text.includes('data-testid="webui-new-project-btn"') &&
      htmlRes.text.includes('data-testid="webui-attach-repo-btn"') &&
      htmlRes.text.includes('data-testid="webui-intake-dropzone"') &&
      htmlRes.text.includes('data-testid="webui-active-stage-card"') &&
      htmlRes.text.includes('data-testid="webui-dispatch-modal"') &&
      htmlRes.text.includes('data-testid="webui-guide-copy-prompt-btn"') &&
      htmlRes.text.includes('data-testid="webui-role-bar"') &&
      htmlRes.text.includes('data-testid="webui-wizard-stepper"') &&
      htmlRes.text.includes('data-testid="webui-wizard-prev-btn"') &&
      htmlRes.text.includes('data-testid="webui-wizard-next-btn"') &&
      Array.isArray(apiStateRes.json?.stageScopes?.CORE_BOOTSTRAP?.files) &&
      apiStateRes.json.stageScopes.CORE_BOOTSTRAP.files.length >= 3 &&
      htmlRes.text.includes('معالج المراحل حسب الدور') &&
      extractedToken.length === 64 &&
      apiStateRes.status === 200 &&
      apiStateRes.json?.ok === true &&
      apiStateRes.json?.projectCode === 'ORD' &&
      apiStateRes.json?.lifecycle?.lifecycleScope === 'FULL_LIFECYCLE' &&
      Boolean(apiStateRes.json?.baSdlc?.coreHubHealth) &&
      Boolean(initialFeat001) &&
      initialFeat001.validPct === 100 &&
      initialFeat001.gateA === 'READY_FOR_DEV' &&
      Boolean(initialFeat001.featureSrd) &&
      Number(apiStateRes.json?.stackAware?.gateBAndDrift?.discoveredApiRoutesCount || 0) >= 1 &&
      Object.keys(apiStateRes.json?.stages || {}).length === 11 &&
      sseClient.status === 200 &&
      String(sseClient.headers['content-type'] || '').includes('text/event-stream') &&
      sseClient.events.length >= 1 &&
      rejectMissingOrigin.status === 403 &&
      rejectMissingOrigin.json?.code === 'FORBIDDEN_ORIGIN' &&
      rejectEvilOrigin.status === 403 &&
      rejectEvilOrigin.json?.code === 'FORBIDDEN_ORIGIN' &&
      rejectBadToken.status === 403 &&
      rejectBadToken.json?.code === 'INVALID_SESSION_TOKEN' &&
      baVerifyRes.status === 200 &&
      baVerifyRes.json?.ok === true &&
      sseAfterBaVerify?.reason === 'ba_verify' &&
      webAdvanceRes.status === 200 &&
      webAdvanceRes.json?.status === 'PENDING_HUMAN_APPROVAL' &&
      sseAfterAdvance?.pendingCheckpoint?.stage === 'CORE_BOOTSTRAP' &&
      webApproveRes.status === 200 &&
      webApproveRes.json?.approved === true &&
      webApproveRes.json?.advanced === true &&
      webApproveRes.json?.currentStage === 'SPRINT_PLAN' &&
      sseAfterApprove?.currentStage === 'SPRINT_PLAN' &&
      dispatchRes.status === 200 &&
      dispatchRes.json?.ok === true &&
      typeof dispatchRes.json?.readyPrompt === 'string' &&
      dispatchRes.json.readyPrompt.includes(tmpProj) &&
      dispatchRes.json.readyPrompt.includes('SPRINT_PLAN') &&
      Array.isArray(dispatchRes.json?.targetPaths) &&
      dispatchQueueExists &&
      osAdvancePromptText.includes('SPRINT_PLAN') &&
      sseAfterExternalSync?.reason === 'external_sync' &&
      apiStateAfter.json?.currentStage === 'SPRINT_PLAN' &&
      !lockLeftover
    ) {
      pass('Dual-Core Web UI (`bin/web-ui.js`) bound 127.0.0.1, rejected invalid Origin/token (403), ran BA verify & gate/checkpoint mutations, bridged dispatch queue to MCP `os-advance`, and pushed live SSE updates.');
    } else {
      fail(
        'CHECK 7/9 failed',
        JSON.stringify({
          htmlStatus: htmlRes.status,
          hasToken: Boolean(extractedToken),
          apiStateStatus: apiStateRes.status,
          lifecycleScope: apiStateRes.json?.lifecycle?.lifecycleScope,
          initialFeat001,
          discoveredApiRoutesCount: apiStateRes.json?.stackAware?.gateBAndDrift?.discoveredApiRoutesCount,
          rejectMissingOrigin,
          rejectEvilOrigin,
          rejectBadToken,
          baVerifyRes: baVerifyRes.json,
          sseAfterBaVerify: sseAfterBaVerify?.reason,
          webAdvanceRes: webAdvanceRes.json,
          webApproveRes: webApproveRes.json,
          dispatchRes: dispatchRes.json,
          dispatchQueueExists,
          osAdvanceHasStage: osAdvancePromptText.includes('SPRINT_PLAN'),
          sseAfterExternalSync: sseAfterExternalSync?.reason,
          sseEventsCount: sseClient.events.length,
          apiStateAfterStage: apiStateAfter.json?.currentStage,
          lockLeftover
        })
      );
    }

    // -------------------------------------------------------------------------
    // CHECK 8: BA_ONLY_HUB Scope Detection, `ba-hub ui` Launcher, CLI `--ui` & MCP Auto-Start
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 8/9] Testing BA_ONLY_HUB Scope, `ba-hub ui` Launcher, `orchestrator-cli --ui` & MCP `OS_ENABLE_WEB_UI=1`...\x1b[0m');
    const { spawnSync } = require('child_process');
    tmpBaOnlyHub = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ai-os-v430-ba-only-'));
    fs.mkdirSync(path.join(tmpBaOnlyHub, '00-project-core'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpBaOnlyHub, '00-project-core', 'PROJECT_CONTEXT.md'),
      buildCleanProjectContext().replace('FULL_PROJECT', 'BA_ONLY').replace('ORD', 'BAO'),
      'utf8'
    );

    baWebUi = await startWebUiServer({ hubRoot: tmpBaOnlyHub, port: 0 });
    const baOnlyStateRes = await httpRequest(`${baWebUi.url}/api/state`);
    const baOnlyTrackBEnabled =
      baOnlyStateRes.json?.lifecycle?.trackB?.enabled ?? baOnlyStateRes.json?.trackB?.enabled;

    const baHubDryRun = spawnSync(
      process.execPath,
      [BA_HUB_CLI, 'ui', `--hub=${tmpBaOnlyHub}`, '--port=0', '--dry-run'],
      { encoding: 'utf8' }
    );
    const orchCliHelp = spawnSync(
      process.execPath,
      [path.join(__dirname, 'orchestrator-cli.js'), '--help'],
      { encoding: 'utf8' }
    );

    let mcpWithUi = null;
    let mcpInitRes = null;
    let mcpStderrJoined = '';
    try {
      mcpWithUi = createMcpTestClient({
        OS_ENABLE_WEB_UI: '1',
        OS_WEB_UI_PORT: '0',
        OS_PROJECT_ROOT: tmpProj,
        OS_WORKSPACES_REGISTRY: tmpRegistryFile
      });
      mcpInitRes = await invokeMcpRpc(mcpWithUi, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'verify-mcp-ui', version: '1.0.0' }
      });
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        mcpStderrJoined = Array.isArray(mcpWithUi.stderrLogs) ? mcpWithUi.stderrLogs.join('\n') : '';
        if (mcpStderrJoined.includes('Web UI control plane listening at http://127.0.0.1:')) {
          break;
        }
        await new Promise(r => setTimeout(r, 50));
      }
      mcpStderrJoined = Array.isArray(mcpWithUi.stderrLogs) ? mcpWithUi.stderrLogs.join('\n') : '';
    } finally {
      if (mcpWithUi) {
        mcpWithUi.close();
      }
    }

    if (
      baWebUi.host === '127.0.0.1' &&
      baOnlyStateRes.status === 200 &&
      baOnlyStateRes.json?.lifecycle?.lifecycleScope === 'BA_ONLY_HUB' &&
      baOnlyTrackBEnabled === false &&
      baHubDryRun.status === 0 &&
      String(baHubDryRun.stdout || '').includes('UI_LAUNCHER_READY') &&
      String(baHubDryRun.stdout || '').includes('BA_ONLY_HUB') &&
      orchCliHelp.status === 0 &&
      String(orchCliHelp.stdout || '').includes('--ui') &&
      Boolean(mcpInitRes?.result?.serverInfo || mcpInitRes?.result?.protocolVersion) &&
      mcpStderrJoined.includes('Web UI control plane listening at http://127.0.0.1:')
    ) {
      pass('BA_ONLY_HUB scope disabled Track B cleanly, `ba-hub ui --dry-run` and `orchestrator-cli --help` passed, and MCP `OS_ENABLE_WEB_UI=1` kept stdout pure JSON-RPC while logging Web UI URL on stderr.');
    } else {
      fail(
        'CHECK 8/9 failed',
        JSON.stringify({
          baOnlyStatus: baOnlyStateRes.status,
          baOnlyScope: baOnlyStateRes.json?.lifecycle?.lifecycleScope,
          baOnlyTrackBEnabled,
          baHubDryRunStatus: baHubDryRun.status,
          baHubDryRunStdout: baHubDryRun.stdout,
          baHubDryRunStderr: baHubDryRun.stderr,
          orchCliHelpStatus: orchCliHelp.status,
          orchCliHelpHasUi: String(orchCliHelp.stdout || '').includes('--ui'),
          mcpInitRes,
          mcpStderrJoined
        })
      );
    }

    // -------------------------------------------------------------------------
    // CHECK 9: Zero-Terminal UX (Registry, Bootstrap, Attach, Web Wizard, Upload, MCP & Launchers)
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m[CHECK 9/9] Testing Zero-Terminal UX (Registry, Bootstrap, Attach, Web Wizard, Intake Upload, `os_bootstrap_project` & Launchers)...\x1b[0m');
    const tmpBaWizardProj = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v440-ba-wiz-'));
    const tmpAttachedRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v440-attach-'));
    const tmpFullLifecycleProj = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v440-full-'));
    const tmpEmptyRegistry = path.join(os.tmpdir(), `ai-os-v440-empty-reg-${Date.now()}-${process.pid}.json`);
    const tmpUiWizardProj = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v440-ui-wiz-'));
    const tmpUiAttachRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v440-ui-attach-'));
    const tmpMcpBootProj = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v440-mcp-boot-'));
    const tmpShortcutDesktop = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v440-desktop-'));
    v440TempDirs.push(
      tmpBaWizardProj,
      tmpAttachedRepo,
      tmpFullLifecycleProj,
      tmpEmptyRegistry,
      tmpUiWizardProj,
      tmpUiAttachRepo,
      tmpMcpBootProj,
      tmpShortcutDesktop
    );

    // 9A. Programmatic BA_ONLY bootstrap + registry + attachEngineeringOsToRepo (.csproj + React)
    const baBootRes = bootstrapProjectWorkspace({
      projectRoot: tmpBaWizardProj,
      projectName: 'CRM Intake Hub',
      projectCode: 'CRM',
      mode: 'BA_ONLY',
      sprint: 'S1',
      registryPath: tmpRegistryFile
    });
    const regAfterBa = listWorkspaces({ registryPath: tmpRegistryFile });
    const baGateADir = buildStageDirective(tmpBaWizardProj, 'GATE_A_SEAL', 'S1');

    fs.writeFileSync(
      path.join(tmpAttachedRepo, 'Crm.Api.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpAttachedRepo, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.2.0', tailwindcss: '^3.4.0' }, devDependencies: { vite: '^5.0.0' } }, null, 2),
      'utf8'
    );
    const attachRes = attachEngineeringOsToRepo(baBootRes.hubRoot, tmpAttachedRepo, {
      registryPath: tmpRegistryFile
    });

    // 9B. Programmatic FULL_LIFECYCLE bootstrap on Laravel + Vue repo
    fs.writeFileSync(
      path.join(tmpFullLifecycleProj, 'composer.json'),
      JSON.stringify({ require: { 'laravel/framework': '^11.0' } }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpFullLifecycleProj, 'package.json'),
      JSON.stringify({ dependencies: { vue: '^3.4.0' } }, null, 2),
      'utf8'
    );
    const fullBootRes = bootstrapProjectWorkspace({
      projectRoot: tmpFullLifecycleProj,
      projectName: 'Billing Engine',
      projectCode: 'BILL',
      mode: 'FULL_LIFECYCLE',
      sprint: 'S1',
      registryPath: tmpRegistryFile
    });

    // 9C. Zero-Terminal Web UI Wizard (empty welcomeMode -> browse -> bootstrap -> intake upload -> attach -> switcher)
    wizardUi = await startWebUiServer({ registryPath: tmpEmptyRegistry, registerOnStart: false, port: 0 });
    const wHtmlRes = await httpRequest(`${wizardUi.url}/`);
    const wTokenMatch = wHtmlRes.text.match(/<meta\s+name="os-session-token"\s+content="([a-f0-9]{64})"/i);
    const wToken = wTokenMatch ? wTokenMatch[1] : '';
    const wValidHeaders = { Origin: wizardUi.url, 'X-Session-Token': wToken };

    const wInitState = await httpRequest(`${wizardUi.url}/api/state`);
    const denyGetWsNoTok = await httpRequest(`${wizardUi.url}/api/workspaces`);
    const denyBrowseNoTok = await httpRequest(`${wizardUi.url}/api/fs/browse`);
    const denyBootBadOrigin = await httpRequest(`${wizardUi.url}/api/project/bootstrap`, {
      method: 'POST',
      headers: { Origin: 'http://evil.example', 'X-Session-Token': wToken },
      body: { projectRoot: tmpFullLifecycleProj, mode: 'BA_ONLY' }
    });
    const denyUploadBadTok = await httpRequest(`${wizardUi.url}/api/intake/upload`, {
      method: 'POST',
      headers: { Origin: wizardUi.url, 'X-Session-Token': 'forged-token' },
      body: { filename: 'brd.md', contentBase64: Buffer.from('# BRD\n').toString('base64') }
    });

    const wBrowseRes = await httpRequest(
      `${wizardUi.url}/api/fs/browse?dir=${encodeURIComponent(os.tmpdir())}`,
      { headers: { 'X-Session-Token': wToken } }
    );
    const wBootRes = await httpRequest(`${wizardUi.url}/api/project/bootstrap`, {
      method: 'POST',
      headers: wValidHeaders,
      body: {
        projectRoot: tmpUiWizardProj,
        projectName: 'UI Wizard Project',
        projectCode: 'UIW',
        mode: 'BA_ONLY',
        sprint: 'S1'
      }
    });

    const uploadJsonRes = await httpRequest(`${wizardUi.url}/api/intake/upload`, {
      method: 'POST',
      headers: wValidHeaders,
      body: {
        filename: 'spec.md',
        contentBase64: Buffer.from('# BRD Spec\nUser login & onboarding flow\n', 'utf8').toString('base64')
      }
    });
    const uploadBinRes = await httpRequest(`${wizardUi.url}/api/intake/upload`, {
      method: 'POST',
      headers: {
        ...wValidHeaders,
        'Content-Type': 'application/octet-stream',
        'X-Upload-Filename': 'schema.sql'
      },
      rawBody: Buffer.from('CREATE TABLE users (id INT PRIMARY KEY);\n', 'utf8')
    });
    const uploadExeRes = await httpRequest(`${wizardUi.url}/api/intake/upload`, {
      method: 'POST',
      headers: wValidHeaders,
      body: {
        filename: 'malware.exe',
        contentBase64: Buffer.from('MZ', 'utf8').toString('base64')
      }
    });

    fs.writeFileSync(
      path.join(tmpUiAttachRepo, 'package.json'),
      JSON.stringify({ dependencies: { nuxt: '^3.10.0', vue: '^3.4.0' } }, null, 2),
      'utf8'
    );
    const wAttachRes = await httpRequest(`${wizardUi.url}/api/project/attach-repo`, {
      method: 'POST',
      headers: wValidHeaders,
      body: { targetCodeRoot: tmpUiAttachRepo }
    });

    const wSwitchRes = await httpRequest(`${wizardUi.url}/api/workspaces`, {
      method: 'POST',
      headers: wValidHeaders,
      body: { projectRoot: tmpFullLifecycleProj }
    });
    const wListRes = await httpRequest(`${wizardUi.url}/api/workspaces`, {
      headers: { 'X-Session-Token': wToken }
    });

    // 9D. MCP `os_bootstrap_project` tool call
    const mcpBootRes = await mcp.callTool('os_bootstrap_project', {
      projectRoot: tmpMcpBootProj,
      projectName: 'MCP Bootstrapped',
      projectCode: 'MCPB',
      mode: 'BA_ONLY',
      sprint: 'S1'
    });

    // 9E. Cross-platform launchers & desktop shortcut generator
    const batPath = path.join(REPO_ROOT, 'Start-AI-OS.bat');
    const cmdPath = path.join(REPO_ROOT, 'Start-AI-OS.command');
    const shPath = path.join(REPO_ROOT, 'Start-AI-OS.sh');
    const launchersExist = fs.existsSync(batPath) && fs.existsSync(cmdPath) && fs.existsSync(shPath);
    const posixExecOk =
      process.platform === 'win32' ||
      ((fs.statSync(cmdPath).mode & 0o111) !== 0 && (fs.statSync(shPath).mode & 0o111) !== 0);

    const scWin = installDesktopShortcut({ platform: 'win32', desktopDir: tmpShortcutDesktop });
    const scMac = installDesktopShortcut({ platform: 'darwin', desktopDir: tmpShortcutDesktop });
    const scLin = installDesktopShortcut({ platform: 'linux', desktopDir: tmpShortcutDesktop });

    if (
      baBootRes.ok === true &&
      baBootRes.lifecycleScope === 'BA_ONLY_HUB' &&
      !baGateADir.readyPrompt.includes(REPO_ROOT) &&
      !baGateADir.readyPrompt.includes('stack-aware-ai-engineering') &&
      baGateADir.readyPrompt.includes(tmpBaWizardProj) &&
      Array.isArray(baGateADir.missingFiles) &&
      baGateADir.missingFiles.length === 0 &&
      fs.existsSync(path.join(tmpBaWizardProj, 'docs', 'project-context-hub', '00-project-core', 'PROJECT_CONTEXT.md')) &&
      regAfterBa.workspaces.some(w => w.code === 'CRM') &&
      attachRes.ok === true &&
      attachRes.lifecycleScope === 'FULL_LIFECYCLE' &&
      attachRes.stackConfig?.stacks?.backend?.dotnet === true &&
      attachRes.stackConfig?.stacks?.frontend?.react === true &&
      fs.existsSync(path.join(tmpAttachedRepo, '.ai', 'stack.json')) &&
      fs.existsSync(path.join(tmpAttachedRepo, '.agrules')) &&
      fs.existsSync(path.join(tmpAttachedRepo, '.ai', 'bin', 'eng-gate.js')) &&
      fs.existsSync(path.join(tmpAttachedRepo, 'docs', 'project-context-hub', '00-project-core', 'PROJECT_CONTEXT.md')) &&
      fullBootRes.ok === true &&
      fullBootRes.lifecycleScope === 'FULL_LIFECYCLE' &&
      fullBootRes.stackConfig?.stacks?.backend?.laravel === true &&
      fullBootRes.stackConfig?.stacks?.frontend?.vue === true &&
      fs.existsSync(path.join(tmpFullLifecycleProj, '.ai', 'context', 'CODEBASE_MAP.md')) &&
      fs.existsSync(path.join(tmpFullLifecycleProj, 'docs', 'project-context-hub', '_intake', 'REVERSE_INTAKE_BUNDLE.json')) &&
      fs.existsSync(path.join(tmpFullLifecycleProj, 'docs', 'project-context-hub', '.os-state.json')) &&
      wToken.length === 64 &&
      wInitState.status === 200 &&
      wInitState.json?.welcomeMode === true &&
      denyGetWsNoTok.status === 403 &&
      denyGetWsNoTok.json?.code === 'INVALID_SESSION_TOKEN' &&
      denyBrowseNoTok.status === 403 &&
      denyBrowseNoTok.json?.code === 'INVALID_SESSION_TOKEN' &&
      denyBootBadOrigin.status === 403 &&
      denyBootBadOrigin.json?.code === 'FORBIDDEN_ORIGIN' &&
      denyUploadBadTok.status === 403 &&
      denyUploadBadTok.json?.code === 'INVALID_SESSION_TOKEN' &&
      wBrowseRes.status === 200 &&
      wBrowseRes.json?.ok === true &&
      Array.isArray(wBrowseRes.json?.directories) &&
      wBootRes.status === 200 &&
      wBootRes.json?.ok === true &&
      wBootRes.json?.snapshot?.welcomeMode === false &&
      wBootRes.json?.snapshot?.projectCode === 'UIW' &&
      wBootRes.json?.snapshot?.lifecycle?.lifecycleScope === 'BA_ONLY_HUB' &&
      uploadJsonRes.status === 200 &&
      fs.existsSync(path.join(tmpUiWizardProj, 'docs', 'project-context-hub', '_intake', 'spec.md')) &&
      uploadBinRes.status === 200 &&
      fs.existsSync(path.join(tmpUiWizardProj, 'docs', 'project-context-hub', '_intake', 'schema.sql')) &&
      uploadBinRes.json?.intakeFiles?.some(f => f.name === 'spec.md') &&
      uploadBinRes.json?.intakeFiles?.some(f => f.name === 'schema.sql') &&
      uploadExeRes.status === 400 &&
      uploadExeRes.json?.code === 'UNSUPPORTED_FILE_TYPE' &&
      wAttachRes.status === 200 &&
      wAttachRes.json?.ok === true &&
      wAttachRes.json?.lifecycleScope === 'FULL_LIFECYCLE' &&
      wAttachRes.json?.snapshot?.projectRoot === tmpUiAttachRepo &&
      fs.existsSync(path.join(tmpUiAttachRepo, '.ai', 'stack.json')) &&
      wSwitchRes.status === 200 &&
      wSwitchRes.json?.snapshot?.projectCode === 'BILL' &&
      wListRes.status === 200 &&
      (wListRes.json?.workspaces || []).length >= 2 &&
      !mcpBootRes.isError &&
      mcpBootRes.payload?.ok === true &&
      mcpBootRes.payload?.projectCode === 'MCPB' &&
      mcpBootRes.payload?.lifecycleScope === 'BA_ONLY_HUB' &&
      launchersExist &&
      posixExecOk &&
      scWin.ok && fs.existsSync(scWin.shortcutPath) &&
      scMac.ok && fs.existsSync(scMac.shortcutPath) &&
      scLin.ok && fs.existsSync(scLin.shortcutPath)
    ) {
      pass('Zero-Terminal UX verified: multi-project registry, BA_ONLY & FULL_LIFECYCLE bootstrap, attachEngineeringOsToRepo, welcomeMode Web Wizard, folder browser, JSON & binary intake upload, MCP `os_bootstrap_project`, root launchers & cross-platform desktop shortcuts.');
    } else {
      fail(
        'CHECK 9/9 failed',
        JSON.stringify({
          baBootOk: baBootRes.ok,
          attachResOk: attachRes.ok,
          attachStacks: attachRes.stackConfig?.stacks,
          fullBootOk: fullBootRes.ok,
          fullStacks: fullBootRes.stackConfig?.stacks,
          wInitWelcome: wInitState.json?.welcomeMode,
          denyGetWsNoTok,
          denyBrowseNoTok,
          denyBootBadOrigin,
          denyUploadBadTok,
          wBrowseStatus: wBrowseRes.status,
          wBootRes: wBootRes.json && { ok: wBootRes.json.ok, scope: wBootRes.json.lifecycleScope, code: wBootRes.json.snapshot?.projectCode },
          uploadJsonStatus: uploadJsonRes.status,
          uploadBinStatus: uploadBinRes.status,
          uploadExeRes,
          wAttachRes: wAttachRes.json && { ok: wAttachRes.json.ok, scope: wAttachRes.json.lifecycleScope },
          wSwitchCode: wSwitchRes.json?.snapshot?.projectCode,
          wListCount: wListRes.json?.workspaces?.length,
          mcpBootRes: mcpBootRes.payload,
          launchersExist,
          posixExecOk,
          scWin: scWin.ok,
          scMac: scMac.ok,
          scLin: scLin.ok
        })
      );
    }
  } finally {
    if (sseClient) {
      sseClient.close();
    }
    if (webUi) {
      await webUi.close();
    }
    if (baWebUi) {
      await baWebUi.close();
    }
    if (wizardUi) {
      await wizardUi.close();
    }
    mcp.close();
    if (mockPmtool?.server) {
      await new Promise(r => mockPmtool.server.close(() => r()));
    }
    if (prevRegistryEnv === undefined) {
      delete process.env.OS_WORKSPACES_REGISTRY;
    } else {
      process.env.OS_WORKSPACES_REGISTRY = prevRegistryEnv;
    }
    for (const target of [tmpProj, tmpBaOnlyHub, tmpRegistryFile, ...v440TempDirs]) {
      if (!target) continue;
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }

  console.log('\n------------------------------------------------------------');
  console.log(`TOTAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
  console.log('------------------------------------------------------------');
  if (failedChecks === 0) {
    console.log('\x1b[32m✨ ALL V4.4.0 ORCHESTRATOR, DUAL-CORE WEB UI, MCP & ZERO-TERMINAL UX CHECKS PASSED PERFECTLY\x1b[0m\n');
    process.exit(0);
  } else {
    console.error('\x1b[31m❌ SOME ORCHESTRATOR VERIFICATION CHECKS FAILED\x1b[0m\n');
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
