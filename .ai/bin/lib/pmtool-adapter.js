'use strict';

/**
 * 🔌 InnovaDigits Hybrid PMTool Sync Adapter (`bin/lib/pmtool-adapter.js` v4.2.2)
 * Zero-dependency (Node.js built-ins only: `fs`, `path`, `http`, `https`, `url`, `child_process`).
 *
 * Capabilities:
 *   1. Resolves `.ai/pmtool.config.json` + env (`PMTOOL_BASE_URL`, `PMTOOL_API_TOKEN`, `PMTOOL_PROJECT_ID`, `PMTOOL_MODE`)
 *   2. Parses 5-level WBS (`CMP-* -> EPC-* -> FEATURE-* -> STR-* -> TSK-*`) from `BACKLOG_WBS.md` + `02-sprints/<Sprint>/FEATURE-*.md`
 *   3. `inspectPmtoolBoard`: summarizes local WBS/sync state + remote items (when REST API configured)
 *   4. `pushWbsWave`: `dryRun: true` default preview + idempotent sequential `externalKey` push (`Components -> Epics -> Features -> Stories -> Tasks`), persisting returned remote IDs to `PMTOOL_SYNC_MAP.json` and `BACKLOG_WBS.md`, or seamlessly falling back to `.xlsx` / `PMTOOL_SPRINT_TASKS.{md,csv,json}`
 *   5. `syncGateStatus`: updates remote & local work-item stage/status when features clear `Gate A`, `Gate B`, or `QA`
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { execFileSync } = require('child_process');
const {
  expandCliPath,
  resolveHubWorkspace,
  resolveWbsAndPmtoolPaths,
  parseFeatureDocument,
  parsePmtoolSyncMap,
  scanHubAndLegacyFeatures,
  splitMarkdownRow,
  isSeparatorRow,
  stripMdFormatting
} = require('./hub-utils');

const BIN_DIR = path.resolve(__dirname, '..');
const BA_HUB_ROOT = path.resolve(BIN_DIR, '..', '..', 'ba-context-hub-os');

const GATE_STAGE_MAP = {
  GATE_A: { stage: 'Ready for Dev', status: 'READY_FOR_DEV' },
  READY_FOR_DEV: { stage: 'Ready for Dev', status: 'READY_FOR_DEV' },
  GATE_B: { stage: 'Ready to Code', status: 'READY_TO_CODE' },
  READY_TO_CODE: { stage: 'Ready to Code', status: 'READY_TO_CODE' },
  QA: { stage: 'QA', status: 'IN_QA' },
  IN_QA: { stage: 'QA', status: 'IN_QA' },
  QA_HANDOFF: { stage: 'QA', status: 'IN_QA' }
};

const LEVEL_ORDER = ['components', 'epics', 'features', 'stories', 'tasks'];
const LEVEL_META = {
  components: { type: 'Component', label: 'Level 1 Component' },
  epics: { type: 'Epic', label: 'Level 2 Epic' },
  features: { type: 'Feature', label: 'Level 3 Feature' },
  stories: { type: 'Story', label: 'Level 4 Story' },
  tasks: { type: 'Task', label: 'Level 5 Task' }
};

function cleanToken(val) {
  return stripMdFormatting(val || '').trim();
}

function normalizeFeatId(raw) {
  const up = cleanToken(raw).toUpperCase();
  if (!up) return '';
  return up.startsWith('FEAT-') ? up.replace(/^FEAT-/, 'FEATURE-') : up;
}

function deriveStoryShortCode(storyId, featureId, idx) {
  const clean = String(storyId || '').toUpperCase().replace(/^STR-/, '');
  if (clean) return clean;
  const featNum = String(featureId || '001').replace(/^FEATURE-|^FEAT-/i, '');
  return `${featNum}-${String(idx + 1).padStart(2, '0')}`;
}

/**
 * Resolves PMTool configuration from `.ai/pmtool.config.json`, environment variables, and explicit overrides.
 * @param {string} projectRoot
 * @param {Record<string, any>} [overrides]
 */
function resolvePmtoolConfig(projectRoot, overrides = {}) {
  const absProject = path.resolve(expandCliPath(projectRoot || process.cwd()));
  const candidates = [
    path.join(absProject, '.ai', 'pmtool.config.json'),
    path.join(absProject, 'pmtool.config.json')
  ];

  let fileCfg = {};
  let configPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      configPath = p;
      try {
        fileCfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {
        fileCfg = {};
      }
      break;
    }
  }

  const baseUrlRaw = overrides.baseUrl ?? process.env.PMTOOL_BASE_URL ?? fileCfg.baseUrl ?? fileCfg.base_url ?? '';
  const baseUrl = String(baseUrlRaw || '').trim().replace(/\/+$/, '');
  const apiToken = String(overrides.apiToken ?? process.env.PMTOOL_API_TOKEN ?? fileCfg.apiToken ?? fileCfg.api_token ?? '').trim();
  const projectId = String(overrides.projectId ?? process.env.PMTOOL_PROJECT_ID ?? fileCfg.projectId ?? fileCfg.project_id ?? 'DEFAULT').trim();
  const requestedMode = String(overrides.mode ?? process.env.PMTOOL_MODE ?? fileCfg.mode ?? 'auto').trim().toLowerCase();
  const templateRaw = overrides.templatePath ?? process.env.PMTOOL_TEMPLATE_PATH ?? fileCfg.templatePath ?? fileCfg.template_path ?? '';
  let templatePath = templateRaw ? path.resolve(absProject, expandCliPath(String(templateRaw))) : null;

  if (!templatePath) {
    const defaultTemplates = [
      path.join(absProject, 'docs', 'project-context-hub', '04-traceability-and-exports', 'pmtool', 'backlog-import-template.xlsx'),
      path.join(absProject, 'docs', 'business-context', 'pmtool', 'backlog-import-template.xlsx')
    ];
    templatePath = defaultTemplates.find(p => fs.existsSync(p)) || null;
  }

  const effectiveMode = requestedMode === 'xlsx' ? 'xlsx' : (baseUrl ? 'api' : 'xlsx');

  return {
    projectRoot: absProject,
    configPath,
    baseUrl,
    apiToken,
    projectId,
    requestedMode,
    effectiveMode,
    templatePath,
    timeoutMs: Number(fileCfg.timeoutMs || 10000)
  };
}

/**
 * Pure Node.js HTTP/HTTPS JSON client.
 * @param {string} method
 * @param {string} targetUrl
 * @param {any} [body]
 * @param {Record<string, string>} [headers]
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: boolean, statusCode: number, data: any, raw: string }>}
 */
function httpJsonRequest(method, targetUrl, body = null, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (err) {
      reject(new Error(`Invalid PMTool URL '${targetUrl}': ${err.message}`));
      return;
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const payload = body !== null && body !== undefined ? JSON.stringify(body) : null;
    const reqHeaders = {
      Accept: 'application/json',
      ...headers
    };
    if (payload !== null) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload, 'utf8');
    }

    const req = transport.request(
      parsedUrl,
      {
        method: method.toUpperCase(),
        headers: reqHeaders,
        timeout: timeoutMs
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = null;
          if (raw.trim()) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = { raw };
            }
          }
          const statusCode = res.statusCode || 0;
          resolve({
            ok: statusCode >= 200 && statusCode < 300,
            statusCode,
            data,
            raw
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`PMTool HTTP request timed out after ${timeoutMs}ms (${method} ${targetUrl})`));
    });
    req.on('error', err => reject(err));

    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

function resolveRemoteIdFromMap(rawMap, itemKey) {
  if (!rawMap || typeof rawMap !== 'object') return null;
  const upperKey = String(itemKey || '').toUpperCase();
  const candidates = [upperKey];
  if (upperKey.startsWith('FEATURE-')) candidates.push(upperKey.replace(/^FEATURE-/, 'FEAT-'));
  else if (upperKey.startsWith('FEAT-')) candidates.push(upperKey.replace(/^FEAT-/, 'FEATURE-'));

  const pickId = entry => {
    if (!entry || typeof entry !== 'object') return null;
    const id = entry.dbId ?? entry.remoteId ?? entry.id ?? null;
    if (id === null || id === undefined || id === '' || /^PENDING$/i.test(String(id))) return null;
    return id;
  };

  for (const key of candidates) {
    if (rawMap.entities && typeof rawMap.entities === 'object') {
      const fromEntities = pickId(rawMap.entities[key]);
      if (fromEntities !== null) return fromEntities;
    }
    for (const bucket of ['components', 'epics', 'features', 'stories', 'tasks']) {
      if (rawMap[bucket] && typeof rawMap[bucket] === 'object') {
        const fromBucket = pickId(rawMap[bucket][key]);
        if (fromBucket !== null) return fromBucket;
      }
    }
  }
  return null;
}

/**
 * Parses `BACKLOG_WBS.md`, enriches from `02-sprints/<Sprint>/FEATURE-*.md`, and overlays `PMTOOL_SYNC_MAP.json`.
 * @param {string} projectRoot
 * @param {{ sprint?: string, release?: string }} [opts]
 */
function loadUnifiedWbsAndSyncMap(projectRoot, opts = {}) {
  const absProject = path.resolve(expandCliPath(projectRoot || process.cwd()));
  const hubWorkspace = resolveHubWorkspace(absProject);
  const resolvedPaths = resolveWbsAndPmtoolPaths(hubWorkspace);

  const defaultWbsPath = hubWorkspace.isHubV2
    ? path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md')
    : path.join(hubWorkspace.docsDir, 'BACKLOG_WBS.md');
  const defaultSyncMapPath = hubWorkspace.isHubV2
    ? path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'PMTOOL_SYNC_MAP.json')
    : path.join(hubWorkspace.docsDir, 'PMTOOL_SYNC_MAP.json');

  const wbsPath = resolvedPaths.wbsPath || defaultWbsPath;
  const syncMapPath = resolvedPaths.syncMapPath || defaultSyncMapPath;
  const pmtoolParsed = parsePmtoolSyncMap(syncMapPath);
  const rawSyncMap = (pmtoolParsed.raw && typeof pmtoolParsed.raw === 'object')
    ? JSON.parse(JSON.stringify(pmtoolParsed.raw))
    : { projectCode: '', status: 'UNSYNCED', entities: {}, features: {}, stories: {}, tasks: {} };

  const components = new Map();
  const epics = new Map();
  const features = new Map();
  const stories = new Map();
  const tasks = new Map();

  // Direct multi-schema parser over BACKLOG_WBS.md tables
  if (fs.existsSync(wbsPath)) {
    const rawWbs = fs.readFileSync(wbsPath, 'utf8').replace(/\r\n/g, '\n');
    const lines = rawWbs.split('\n');
    let headers = null;

    for (const line of lines) {
      const cells = splitMarkdownRow(line);
      if (!cells) {
        if (line.trim() === '' || line.startsWith('#')) headers = null;
        continue;
      }
      if (isSeparatorRow(cells)) continue;

      const lower = cells.map(c => cleanToken(c).toLowerCase());
      const looksHeader = !headers && (
        lower[0].includes('id') ||
        lower[0].includes('code') ||
        lower.some(h => ['component', 'epic', 'feature', 'story', 'task'].some(k => h.includes(k)))
      );
      if (looksHeader && !/\b(?:CMP|EPC|FEATURE|FEAT|STR|TSK)-[A-Z0-9]/i.test(cells.map(cleanToken).join(' '))) {
        headers = lower;
        continue;
      }

      const hdr = headers || [];
      const h0 = hdr[0] || '';
      const getCol = patterns => {
        const idx = hdr.findIndex(h => patterns.some(p => h === p || h.includes(p)));
        return idx !== -1 && idx < cells.length ? cleanToken(cells[idx]) : '';
      };

      const c0 = cleanToken(cells[0]);
      if (!c0 || /^_\(none/i.test(c0)) continue;

      const rowText = cells.map(cleanToken).join(' | ');
      const cmpMatch = rowText.match(/\b(CMP-[A-Za-z0-9_-]+)\b/i);
      const epcMatch = rowText.match(/\b(EPC-[A-Za-z0-9_-]+)\b/i);
      const featMatch = rowText.match(/\b((?:FEATURE|FEAT)-[A-Za-z0-9_-]+)\b/i);
      const strMatch = rowText.match(/\b(STR-[A-Za-z0-9_-]+)\b/i);
      const tskMatch = rowText.match(/\b(TSK-[A-Za-z0-9_-]+)\b/i);
      const relMatch = rowText.match(/\b(REL-[A-Za-z0-9._-]+)\b/i);

      const explicitPmtool = getCol(['pmtool id', 'pmtool', 'remote id']);
      const pmtoolFromCell = explicitPmtool && !/^PENDING$/i.test(explicitPmtool) ? explicitPmtool : null;

      if (h0.includes('task id') || (!strMatch && tskMatch)) {
        const id = (tskMatch ? tskMatch[1] : c0).toUpperCase();
        const storyId = (getCol(['parent story', 'story id', 'story']) || (strMatch ? strMatch[1] : '')).toUpperCase();
        const featureId = normalizeFeatId(getCol(['feature id', 'feature']) || (featMatch ? featMatch[1] : ''));
        const department = getCol(['dept', 'department']) || (id.endsWith('-BE') ? 'BE' : id.endsWith('-WEB') ? 'WEB' : id.endsWith('-MOB') ? 'MOB' : 'QA');
        const title = getCol(['task title', 'title', 'summary', 'description']) || cleanToken(cells[2] || cells[1] || id);
        const release = (getCol(['release']) || (relMatch ? relMatch[1] : 'REL-1.0')).toUpperCase();
        const sprint = getCol(['sprint', 'iteration']) || 'S1';
        const estRaw = getCol(['est', 'estimate', 'hours']).replace(/h$/i, '');
        const estimateHours = Number(estRaw) || 4;
        const status = getCol(['status', 'state']) || 'READY_TO_CODE';
        tasks.set(id, {
          level: 'tasks',
          type: 'Task',
          externalKey: id,
          parentKey: storyId,
          featureId,
          department,
          title,
          release,
          sprint,
          estimateHours,
          priority: 'High',
          status,
          remoteId: resolveRemoteIdFromMap(rawSyncMap, id) || pmtoolFromCell
        });
      } else if (h0.includes('story id') || (!tskMatch && strMatch)) {
        const id = (strMatch ? strMatch[1] : c0).toUpperCase();
        const featureId = normalizeFeatId(getCol(['parent feature', 'feature id', 'feature']) || (featMatch ? featMatch[1] : ''));
        const epicId = (getCol(['parent epic', 'epic id', 'epic']) || (epcMatch ? epcMatch[1] : '')).toUpperCase();
        const componentId = (getCol(['parent component', 'component id', 'component']) || (cmpMatch ? cmpMatch[1] : '')).toUpperCase();
        const title = getCol(['story title', 'user story', 'title', 'summary']) || cleanToken(cells[3] || cells[2] || cells[1] || id);
        const release = (getCol(['release', 'target release']) || (relMatch ? relMatch[1] : 'REL-1.0')).toUpperCase();
        const sprint = getCol(['sprint', 'iteration']) || 'S1';
        const priority = getCol(['priority']) || 'High';
        const stage = getCol(['stage', 'status', 'state']) || 'Todo';
        const points = getCol(['points', 'sp']) || '3';
        const remoteId = resolveRemoteIdFromMap(rawSyncMap, id) || pmtoolFromCell;
        stories.set(id, {
          level: 'stories',
          type: 'Story',
          externalKey: id,
          parentKey: featureId,
          epicId,
          componentId,
          title,
          release,
          sprint,
          points,
          priority,
          stage,
          status: stage,
          remoteId
        });
      } else if (h0.includes('feature id') || (featMatch && !epcMatch && !strMatch && !cmpMatch) || (featMatch && h0.includes('feature'))) {
        const id = normalizeFeatId(featMatch ? featMatch[1] : c0);
        const epicId = (getCol(['parent epic', 'epic id', 'epic']) || (epcMatch ? epcMatch[1] : 'EPC-01')).toUpperCase();
        const title = getCol(['feature title', 'title', 'name']) || cleanToken(cells[2] || cells[1] || id);
        const release = (getCol(['release']) || (relMatch ? relMatch[1] : 'REL-1.0')).toUpperCase();
        const sprint = getCol(['sprint']) || 'S1';
        const priority = getCol(['priority']) || 'High';
        const remoteId = resolveRemoteIdFromMap(rawSyncMap, id) || pmtoolFromCell;
        features.set(id, {
          level: 'features',
          type: 'Feature',
          externalKey: id,
          parentKey: epicId,
          title,
          release,
          sprint,
          priority,
          status: 'Todo',
          remoteId
        });
      } else if (h0.includes('epic id') || (epcMatch && !strMatch && !featMatch)) {
        const id = (epcMatch ? epcMatch[1] : c0).toUpperCase();
        const componentId = (getCol(['parent component', 'component id', 'component']) || (cmpMatch ? cmpMatch[1] : 'CMP-01')).toUpperCase();
        const title = getCol(['epic title', 'epic name', 'title', 'name']) || cleanToken(cells[2] || cells[1] || id);
        const release = (getCol(['release']) || (relMatch ? relMatch[1] : 'REL-1.0')).toUpperCase();
        const priority = getCol(['priority']) || 'High';
        const remoteId = resolveRemoteIdFromMap(rawSyncMap, id) || pmtoolFromCell;
        epics.set(id, {
          level: 'epics',
          type: 'Epic',
          externalKey: id,
          parentKey: componentId,
          title,
          release,
          priority,
          status: 'Todo',
          remoteId
        });
      } else if (h0.includes('component id') || (cmpMatch && !epcMatch && !featMatch && !strMatch)) {
        const id = (cmpMatch ? cmpMatch[1] : c0).toUpperCase();
        const title = getCol(['component title', 'component name', 'title', 'name']) || cleanToken(cells[1] || id);
        const owner = getCol(['owner', 'team', 'lead']) || '';
        const remoteId = resolveRemoteIdFromMap(rawSyncMap, id) || pmtoolFromCell;
        components.set(id, {
          level: 'components',
          type: 'Component',
          externalKey: id,
          parentKey: '',
          title,
          owner,
          priority: 'High',
          status: 'Todo',
          remoteId
        });
      }
    }
  }

  // Enrich missing Components/Epics/Features/Stories from sealed Feature specs
  const featureFiles = scanHubAndLegacyFeatures(hubWorkspace, opts.sprint || 'all');
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

  const parsedFeatureDocs = [];
  for (const fp of featureFiles) {
    try {
      const doc = parseFeatureDocument(fp, { isHubV2: hubWorkspace.isHubV2 });
      parsedFeatureDocs.push(doc);

      const compId = (doc.componentId || 'CMP-01').toUpperCase();
      const epicId = (doc.epicId || 'EPC-01').toUpperCase();
      const featId = normalizeFeatId(doc.id);
      const release = (doc.targetRelease || 'REL-1.0').toUpperCase();
      const sprint = doc.sprint || 'S1';

      if (compId && !components.has(compId)) {
        components.set(compId, {
          level: 'components',
          type: 'Component',
          externalKey: compId,
          parentKey: '',
          title: compId,
          owner: '',
          priority: 'High',
          status: 'Todo',
          remoteId: resolveRemoteIdFromMap(rawSyncMap, compId)
        });
      }
      if (epicId && !epics.has(epicId)) {
        epics.set(epicId, {
          level: 'epics',
          type: 'Epic',
          externalKey: epicId,
          parentKey: compId,
          title: epicId,
          release,
          priority: 'High',
          status: 'Todo',
          remoteId: resolveRemoteIdFromMap(rawSyncMap, epicId)
        });
      }
      if (featId && !features.has(featId)) {
        features.set(featId, {
          level: 'features',
          type: 'Feature',
          externalKey: featId,
          parentKey: epicId,
          title: doc.title || featId,
          release,
          sprint,
          priority: 'High',
          status: doc.gateB === 'READY_TO_CODE' ? 'READY_TO_CODE' : doc.gateA,
          remoteId: resolveRemoteIdFromMap(rawSyncMap, featId)
        });
      } else if (featId && features.has(featId)) {
        const f = features.get(featId);
        if (!f.parentKey) f.parentKey = epicId;
        if (!f.release) f.release = release;
        if (!f.sprint) f.sprint = sprint;
      }

      if (Array.isArray(doc.stories)) {
        for (const st of doc.stories) {
          const stId = String(st.id || '').toUpperCase();
          if (!stId) continue;
          if (!stories.has(stId)) {
            stories.set(stId, {
              level: 'stories',
              type: 'Story',
              externalKey: stId,
              parentKey: featId,
              epicId,
              componentId: compId,
              title: st.title || stId,
              release: (st.release || release).toUpperCase(),
              sprint: st.sprint || sprint,
              points: st.points || '3',
              priority: 'High',
              stage: st.status || 'Todo',
              status: st.status || 'Todo',
              remoteId: resolveRemoteIdFromMap(rawSyncMap, stId)
            });
          } else {
            const cur = stories.get(stId);
            if (!cur.parentKey) cur.parentKey = featId;
            if (!cur.epicId) cur.epicId = epicId;
            if (!cur.componentId) cur.componentId = compId;
          }
        }
      }
    } catch {
      // Skip unreadable spec files cleanly
    }
  }

  // Synthesize missing parent Components/Epics/Features referenced by Stories, plus missing Tasks if none defined
  for (const st of stories.values()) {
    if (st.componentId && !components.has(st.componentId)) {
      components.set(st.componentId, {
        level: 'components',
        type: 'Component',
        externalKey: st.componentId,
        parentKey: '',
        title: st.componentId,
        priority: 'High',
        status: 'Todo',
        remoteId: resolveRemoteIdFromMap(rawSyncMap, st.componentId)
      });
    }
    if (st.epicId && !epics.has(st.epicId)) {
      epics.set(st.epicId, {
        level: 'epics',
        type: 'Epic',
        externalKey: st.epicId,
        parentKey: st.componentId || 'CMP-01',
        title: st.epicId,
        release: st.release || 'REL-1.0',
        priority: 'High',
        status: 'Todo',
        remoteId: resolveRemoteIdFromMap(rawSyncMap, st.epicId)
      });
    }
    if (st.parentKey && !features.has(st.parentKey)) {
      features.set(st.parentKey, {
        level: 'features',
        type: 'Feature',
        externalKey: st.parentKey,
        parentKey: st.epicId || 'EPC-01',
        title: st.parentKey,
        release: st.release || 'REL-1.0',
        sprint: st.sprint || 'S1',
        priority: 'High',
        status: 'READY_FOR_DEV',
        remoteId: resolveRemoteIdFromMap(rawSyncMap, st.parentKey)
      });
    }
  }

  // Ensure Tasks exist per Story (decompose when tasks map has no children for a Story)
  let stIdx = 0;
  for (const st of stories.values()) {
    const hasTasks = [...tasks.values()].some(t => t.parentKey === st.externalKey);
    if (!hasTasks) {
      const shortCode = deriveStoryShortCode(st.externalKey, st.parentKey, stIdx);
      const deps = ['BE'];
      if (webStackActive) deps.push('WEB');
      if (mobileHandoffActive) deps.push('MOB');
      deps.push('QA');
      for (const dept of deps) {
        const tid = `TSK-${shortCode}-${dept}`;
        if (!tasks.has(tid)) {
          tasks.set(tid, {
            level: 'tasks',
            type: 'Task',
            externalKey: tid,
            parentKey: st.externalKey,
            featureId: st.parentKey,
            department: dept,
            title: `[${dept}] ${st.title}`,
            release: st.release || 'REL-1.0',
            sprint: st.sprint || 'S1',
            estimateHours: dept === 'QA' ? 3 : 4,
            priority: st.priority || 'High',
            status: 'READY_TO_CODE',
            remoteId: resolveRemoteIdFromMap(rawSyncMap, tid)
          });
        }
      }
    }
    stIdx++;
  }

  // Scope filter (`sprint`, `release`, `wave`)
  const filterSprint = opts.sprint && String(opts.sprint).toLowerCase() !== 'all' ? String(opts.sprint).trim() : '';
  const filterRelease = opts.release && String(opts.release).toLowerCase() !== 'all' ? String(opts.release).trim().toUpperCase() : '';

  const filteredStories = [...stories.values()].filter(s => {
    if (filterSprint && String(s.sprint || '').toLowerCase() !== filterSprint.toLowerCase()) return false;
    if (filterRelease && String(s.release || '').toUpperCase() !== filterRelease) return false;
    return true;
  });
  const storyKeySet = new Set(filteredStories.map(s => s.externalKey));

  const filteredTasks = [...tasks.values()].filter(t => {
    if ((filterSprint || filterRelease) && !storyKeySet.has(t.parentKey)) {
      if (filterSprint && String(t.sprint || '').toLowerCase() !== filterSprint.toLowerCase()) return false;
      if (filterRelease && String(t.release || '').toUpperCase() !== filterRelease) return false;
    }
    return true;
  });

  const filteredFeatures = [...features.values()].filter(f => {
    if (filterSprint && String(f.sprint || '').toLowerCase() !== filterSprint.toLowerCase() &&
        !filteredStories.some(s => s.parentKey === f.externalKey)) return false;
    if (filterRelease && String(f.release || '').toUpperCase() !== filterRelease &&
        !filteredStories.some(s => s.parentKey === f.externalKey)) return false;
    return true;
  });
  const epicKeySet = new Set([
    ...filteredFeatures.map(f => f.parentKey),
    ...filteredStories.map(s => s.epicId)
  ].filter(Boolean));
  const filteredEpics = [...epics.values()].filter(e => {
    if (!filterSprint && !filterRelease) return true;
    return epicKeySet.has(e.externalKey) || (filterRelease && String(e.release || '').toUpperCase() === filterRelease);
  });
  const compKeySet = new Set(filteredEpics.map(e => e.parentKey).filter(Boolean));
  const filteredComponents = [...components.values()].filter(c => {
    if (!filterSprint && !filterRelease) return true;
    return compKeySet.has(c.externalKey);
  });

  const hierarchy = {
    components: filteredComponents,
    epics: filteredEpics,
    features: filteredFeatures,
    stories: filteredStories,
    tasks: filteredTasks
  };

  return {
    projectRoot: absProject,
    hubWorkspace,
    wbsPath,
    syncMapPath,
    rawSyncMap,
    parsedFeatureDocs,
    hierarchy
  };
}

/**
 * Fetches remote work items from PMTool REST API (best-effort; empty map if offline/unsupported).
 * @param {ReturnType<typeof resolvePmtoolConfig>} cfg
 * @returns {Promise<{ reachable: boolean, itemsByKey: Map<string, any>, statusCode?: number, error?: string }>}
 */
async function fetchRemoteWorkItems(cfg) {
  const itemsByKey = new Map();
  if (!cfg.baseUrl) return { reachable: false, itemsByKey };

  const headers = {};
  if (cfg.apiToken) headers.Authorization = `Bearer ${cfg.apiToken}`;
  const url = `${cfg.baseUrl}/api/projects/${encodeURIComponent(cfg.projectId)}/work-items`;

  try {
    const res = await httpJsonRequest('GET', url, null, headers, cfg.timeoutMs);
    if (!res.ok) {
      return { reachable: res.statusCode > 0, itemsByKey, statusCode: res.statusCode };
    }
    const list = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.data?.items)
        ? res.data.items
        : Array.isArray(res.data?.data)
          ? res.data.data
          : [];
    for (const item of list) {
      const key = String(item?.externalKey || item?.external_key || item?.wbsId || '').toUpperCase();
      if (key) itemsByKey.set(key, item);
    }
    return { reachable: true, itemsByKey, statusCode: res.statusCode };
  } catch (err) {
    return { reachable: false, itemsByKey, error: err.message };
  }
}

/**
 * Updates `PMTool ID` cells inside `BACKLOG_WBS.md` when numeric/remote IDs are written.
 * @param {string} wbsPath
 * @param {Record<string, string|number>} idByKey
 */
function syncRemoteIdsIntoBacklogWbs(wbsPath, idByKey) {
  if (!wbsPath || !fs.existsSync(wbsPath)) return false;
  const lines = fs.readFileSync(wbsPath, 'utf8').split(/\r?\n/);
  let changed = false;
  let currentHeaders = null;

  const updated = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
      if (trimmed === '' || trimmed.startsWith('#')) currentHeaders = null;
      return line;
    }
    const rawCells = trimmed.slice(1, -1).split(/(?<!\\)\|/);
    if (rawCells.every(c => /^\s*:?-+:?\s*$/.test(c))) return line;

    const cleanCells = rawCells.map(c => cleanToken(c));
    if (!currentHeaders) {
      currentHeaders = cleanCells.map(c => c.toLowerCase());
      return line;
    }

    const firstKey = cleanCells[0].toUpperCase();
    const altKey = firstKey.startsWith('FEAT-') ? firstKey.replace(/^FEAT-/, 'FEATURE-') : firstKey;
    const remoteId = idByKey[firstKey] ?? idByKey[altKey];
    if (remoteId === undefined || remoteId === null) return line;

    const pmtoolColIdx = currentHeaders.findIndex(h => h.includes('pmtool') || h.includes('remote id') || h.includes('external id'));
    const targetIdx = pmtoolColIdx !== -1 ? pmtoolColIdx : rawCells.length - 1;
    const lastHeader = currentHeaders[targetIdx] || '';
    const curVal = cleanToken(rawCells[targetIdx]);
    const nextValStr = String(remoteId);

    const safeColumn = pmtoolColIdx !== -1 || curVal === 'PENDING' || /^\d+$/.test(curVal) || lastHeader.includes('id');
    if (safeColumn && curVal !== nextValStr) {
      rawCells[targetIdx] = ` \`${nextValStr}\` `;
      changed = true;
      return '|' + rawCells.join('|') + '|';
    }
    return line;
  });

  if (changed) {
    fs.writeFileSync(wbsPath, updated.join('\n'), 'utf8');
  }
  return changed;
}

function savePmtoolSyncMap(syncMapPath, mapObj) {
  fs.mkdirSync(path.dirname(syncMapPath), { recursive: true });
  fs.writeFileSync(syncMapPath, JSON.stringify(mapObj, null, 2) + '\n', 'utf8');
}

function upsertSyncMapEntry(mapObj, item, remoteId, extra = {}) {
  mapObj.entities = mapObj.entities && typeof mapObj.entities === 'object' ? mapObj.entities : {};
  const bucketKey = `${item.level}`;
  mapObj[bucketKey] = mapObj[bucketKey] && typeof mapObj[bucketKey] === 'object' ? mapObj[bucketKey] : {};

  const prev = mapObj.entities[item.externalKey] || {};
  const entry = {
    ...prev,
    type: item.type,
    externalKey: item.externalKey,
    dbId: remoteId !== undefined && remoteId !== null ? remoteId : (prev.dbId ?? null),
    remoteId: remoteId !== undefined && remoteId !== null ? remoteId : (prev.remoteId ?? null),
    dropdownValue: (remoteId !== undefined && remoteId !== null)
      ? `[${item.externalKey}] ${item.title} (#${remoteId})`
      : (prev.dropdownValue ?? null),
    parentKey: item.parentKey || null,
    parentId: item.parentKey || null,
    parentRemoteId: extra.parentRemoteId ?? prev.parentRemoteId ?? null,
    release: item.release || prev.release || null,
    sprint: item.sprint || prev.sprint || null,
    department: item.department || prev.department || undefined,
    stage: extra.stage || item.stage || prev.stage || 'Todo',
    status: extra.status || item.status || prev.status || 'SYNCED',
    title: item.title,
    syncedAt: extra.syncedAt || new Date().toISOString()
  };

  mapObj.entities[item.externalKey] = entry;
  mapObj[bucketKey][item.externalKey] = {
    dbId: entry.dbId,
    remoteId: entry.remoteId,
    parentKey: entry.parentKey,
    parentRemoteId: entry.parentRemoteId,
    release: entry.release,
    sprint: entry.sprint,
    stage: entry.stage,
    status: entry.status,
    title: entry.title
  };
}

/**
 * Inspects local 5-level WBS state + remote PMTool board state.
 * @param {string} projectRoot
 * @param {{ sprint?: string, release?: string, fetchRemote?: boolean }} [opts]
 */
async function inspectPmtoolBoard(projectRoot, opts = {}) {
  const cfg = resolvePmtoolConfig(projectRoot, opts);
  const wbsState = loadUnifiedWbsAndSyncMap(cfg.projectRoot, opts);
  const remote = (cfg.effectiveMode === 'api' && opts.fetchRemote !== false)
    ? await fetchRemoteWorkItems(cfg)
    : { reachable: false, itemsByKey: new Map() };

  const allItems = LEVEL_ORDER.flatMap(lvl => wbsState.hierarchy[lvl]);
  let synced = 0;
  let pending = 0;
  for (const item of allItems) {
    const remoteEntry = remote.itemsByKey.get(item.externalKey);
    const hasId = Boolean(item.remoteId || remoteEntry?.id);
    if (hasId) synced++;
    else pending++;
  }

  return {
    ok: true,
    mode: cfg.effectiveMode,
    baseUrlConfigured: Boolean(cfg.baseUrl),
    baseUrl: cfg.baseUrl || null,
    projectId: cfg.projectId,
    remoteReachable: remote.reachable,
    configPath: cfg.configPath ? path.relative(cfg.projectRoot, cfg.configPath) : null,
    wbsPath: fs.existsSync(wbsState.wbsPath) ? path.relative(cfg.projectRoot, wbsState.wbsPath) : null,
    syncMapPath: path.relative(cfg.projectRoot, wbsState.syncMapPath),
    templatePath: cfg.templatePath ? path.relative(cfg.projectRoot, cfg.templatePath) : null,
    counts: {
      components: wbsState.hierarchy.components.length,
      epics: wbsState.hierarchy.epics.length,
      features: wbsState.hierarchy.features.length,
      stories: wbsState.hierarchy.stories.length,
      tasks: wbsState.hierarchy.tasks.length,
      total: allItems.length,
      synced,
      pending
    },
    hierarchy: wbsState.hierarchy
  };
}

/**
 * Idempotent hierarchical WBS push (`Components -> Epics -> Features -> Stories -> Tasks`).
 * Always defaults to `dryRun: true` unless `opts.dryRun === false` is explicitly supplied.
 * @param {string} projectRoot
 * @param {{ sprint?: string, release?: string, wave?: string, dryRun?: boolean, templatePath?: string, mode?: string }} [opts]
 */
async function pushWbsWave(projectRoot, opts = {}) {
  const dryRun = opts.dryRun !== false;
  const cfg = resolvePmtoolConfig(projectRoot, opts);
  const wbsState = loadUnifiedWbsAndSyncMap(cfg.projectRoot, opts);

  const requestedWave = String(opts.wave || 'all').toLowerCase().trim();
  const targetLevels = requestedWave === 'all'
    ? LEVEL_ORDER
    : (LEVEL_ORDER.includes(requestedWave) ? [requestedWave] : LEVEL_ORDER);

  const remote = cfg.effectiveMode === 'api'
    ? await fetchRemoteWorkItems(cfg)
    : { reachable: false, itemsByKey: new Map() };

  const operations = [];
  const countsByLevel = {};
  let toCreate = 0;
  let toUpdate = 0;

  for (const lvl of targetLevels) {
    const items = wbsState.hierarchy[lvl] || [];
    let lvlCreate = 0;
    let lvlUpdate = 0;
    for (const item of items) {
      const remoteMatch = remote.itemsByKey.get(item.externalKey);
      const existingRemoteId = item.remoteId ?? remoteMatch?.id ?? remoteMatch?.dbId ?? null;
      const action = existingRemoteId !== null && existingRemoteId !== undefined && existingRemoteId !== '' ? 'UPDATE' : 'CREATE';
      if (action === 'CREATE') {
        toCreate++;
        lvlCreate++;
      } else {
        toUpdate++;
        lvlUpdate++;
      }
      operations.push({
        level: lvl,
        type: item.type,
        externalKey: item.externalKey,
        parentKey: item.parentKey || null,
        title: item.title,
        action,
        existingRemoteId: existingRemoteId ?? null,
        release: item.release || null,
        sprint: item.sprint || null
      });
    }
    countsByLevel[lvl] = { total: items.length, toCreate: lvlCreate, toUpdate: lvlUpdate };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      mode: cfg.effectiveMode,
      projectId: cfg.projectId,
      baseUrl: cfg.baseUrl || null,
      wave: requestedWave,
      counts: {
        total: operations.length,
        toCreate,
        toUpdate,
        byLevel: countsByLevel
      },
      operations,
      syncMapPath: path.relative(cfg.projectRoot, wbsState.syncMapPath),
      message: `Dry-run preview ready: ${toCreate} to CREATE, ${toUpdate} to UPDATE across [${targetLevels.join(', ')}] (mode=${cfg.effectiveMode}). Pass dryRun=false to execute.`
    };
  }

  const nowIso = new Date().toISOString();
  const syncMap = wbsState.rawSyncMap;
  syncMap.updatedAt = nowIso;
  syncMap.projectId = cfg.projectId;
  syncMap.status = 'SYNCED';
  syncMap.mode = cfg.effectiveMode;

  if (cfg.effectiveMode === 'api') {
    const headers = {};
    if (cfg.apiToken) headers.Authorization = `Bearer ${cfg.apiToken}`;
    const baseWorkItemsUrl = `${cfg.baseUrl}/api/projects/${encodeURIComponent(cfg.projectId)}/work-items`;

    // Track remote IDs in-memory so child levels receive parentRemoteId immediately
    const resolvedIds = new Map();
    for (const lvl of LEVEL_ORDER) {
      for (const item of wbsState.hierarchy[lvl] || []) {
        const remoteMatch = remote.itemsByKey.get(item.externalKey);
        const rid = item.remoteId ?? remoteMatch?.id ?? remoteMatch?.dbId ?? null;
        if (rid !== null && rid !== undefined && rid !== '') {
          resolvedIds.set(item.externalKey, rid);
        }
      }
    }

    const created = [];
    const updated = [];
    const errors = [];
    const idByKey = {};

    for (const lvl of targetLevels) {
      const items = wbsState.hierarchy[lvl] || [];
      for (const item of items) {
        const existingId = resolvedIds.get(item.externalKey) ?? null;
        const parentRemoteId = item.parentKey ? (resolvedIds.get(item.parentKey) ?? null) : null;
        const payload = {
          externalKey: item.externalKey,
          type: item.type,
          level: lvl,
          title: item.title,
          parentKey: item.parentKey || null,
          parentId: parentRemoteId,
          release: item.release || null,
          sprint: item.sprint || null,
          priority: item.priority || 'High',
          stage: item.stage || 'Todo',
          status: item.status || 'Todo',
          department: item.department || undefined,
          estimateHours: item.estimateHours || undefined
        };

        try {
          let res;
          if (existingId !== null && existingId !== undefined && existingId !== '') {
            res = await httpJsonRequest('PUT', `${baseWorkItemsUrl}/${encodeURIComponent(String(existingId))}`, { ...payload, id: existingId }, headers, cfg.timeoutMs);
          } else {
            res = await httpJsonRequest('POST', baseWorkItemsUrl, payload, headers, cfg.timeoutMs);
          }

          if (!res.ok) {
            errors.push({
              externalKey: item.externalKey,
              level: lvl,
              action: existingId ? 'UPDATE' : 'CREATE',
              statusCode: res.statusCode,
              error: res.data?.message || res.data?.error || res.raw || `HTTP ${res.statusCode}`
            });
            continue;
          }

          const remoteId = res.data?.id ?? res.data?.dbId ?? res.data?.data?.id ?? existingId;
          resolvedIds.set(item.externalKey, remoteId);
          idByKey[item.externalKey] = remoteId;
          upsertSyncMapEntry(syncMap, item, remoteId, { parentRemoteId, syncedAt: nowIso });

          if (existingId !== null && existingId !== undefined && existingId !== '') {
            updated.push({ externalKey: item.externalKey, level: lvl, remoteId, parentRemoteId });
          } else {
            created.push({ externalKey: item.externalKey, level: lvl, remoteId, parentRemoteId });
          }
        } catch (err) {
          errors.push({
            externalKey: item.externalKey,
            level: lvl,
            action: existingId ? 'UPDATE' : 'CREATE',
            error: err.message
          });
        }
      }
    }

    savePmtoolSyncMap(wbsState.syncMapPath, syncMap);
    const wbsUpdated = syncRemoteIdsIntoBacklogWbs(wbsState.wbsPath, idByKey);

    // Emit local JSON summary artifact without clobbering synced remote IDs
    const docsDir = wbsState.hubWorkspace.docsDir || path.join(cfg.projectRoot, 'docs', 'business-context');
    fs.mkdirSync(docsDir, { recursive: true });
    const tasksJsonOut = path.join(docsDir, 'PMTOOL_SPRINT_TASKS.json');
    fs.writeFileSync(
      tasksJsonOut,
      JSON.stringify(
        {
          generatedAt: nowIso,
          mode: 'api',
          projectId: cfg.projectId,
          counts: { created: created.length, updated: updated.length, errors: errors.length },
          entities: syncMap.entities
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    return {
      ok: errors.length === 0,
      dryRun: false,
      mode: 'api',
      projectId: cfg.projectId,
      wave: requestedWave,
      counts: {
        created: created.length,
        updated: updated.length,
        errors: errors.length,
        totalProcessed: created.length + updated.length
      },
      created,
      updated,
      errors,
      wbsUpdated,
      syncMapPath: path.relative(cfg.projectRoot, wbsState.syncMapPath),
      tasksJsonPath: path.relative(cfg.projectRoot, tasksJsonOut)
    };
  }

  // Fallback mode: `.xlsx` & `PMTOOL_SPRINT_TASKS.{md,csv,json}` generation
  const boardSyncScript = path.join(BIN_DIR, 'pmtool-board-sync.js');
  const cliArgs = [boardSyncScript, '--write-hub', '--json'];
  if (opts.sprint && String(opts.sprint).toLowerCase() !== 'all') cliArgs.push(`--sprint=${opts.sprint}`);
  if (opts.release && String(opts.release).toLowerCase() !== 'all') cliArgs.push(`--release=${opts.release}`);
  if (cfg.templatePath && fs.existsSync(cfg.templatePath)) cliArgs.push(`--template=${cfg.templatePath}`);
  if (requestedWave === 'stories' || requestedWave === 'tasks') cliArgs.push(`--wave=${requestedWave}`);

  let boardSummary = null;
  if (fs.existsSync(boardSyncScript)) {
    const rawOut = execFileSync(process.execPath, cliArgs, {
      cwd: cfg.projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    try {
      boardSummary = JSON.parse(rawOut);
    } catch {
      boardSummary = { rawOut };
    }
  }

  // Ensure every item in targetLevels is registered in PMTOOL_SYNC_MAP.json
  const latestMap = fs.existsSync(wbsState.syncMapPath)
    ? JSON.parse(fs.readFileSync(wbsState.syncMapPath, 'utf8'))
    : syncMap;
  latestMap.updatedAt = nowIso;
  latestMap.mode = 'xlsx';
  latestMap.status = 'EXPORTED_XLSX';
  for (const lvl of targetLevels) {
    for (const item of wbsState.hierarchy[lvl] || []) {
      upsertSyncMapEntry(latestMap, item, item.remoteId ?? null, {
        status: item.remoteId ? 'SYNCED' : 'EXPORTED_XLSX',
        syncedAt: nowIso
      });
    }
  }
  savePmtoolSyncMap(wbsState.syncMapPath, latestMap);

  const docsDir = wbsState.hubWorkspace.docsDir || path.join(cfg.projectRoot, 'docs', 'business-context');
  fs.mkdirSync(docsDir, { recursive: true });
  const tasksJsonOut = path.join(docsDir, 'PMTOOL_SPRINT_TASKS.json');
  fs.writeFileSync(
    tasksJsonOut,
    JSON.stringify(
      {
        generatedAt: nowIso,
        mode: 'xlsx',
        boardSummary,
        hierarchyCounts: {
          components: wbsState.hierarchy.components.length,
          epics: wbsState.hierarchy.epics.length,
          features: wbsState.hierarchy.features.length,
          stories: wbsState.hierarchy.stories.length,
          tasks: wbsState.hierarchy.tasks.length
        }
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  // Also invoke ba-hub pmtool-sync if a real .xlsx template + full ba-context-hub-os modules are present
  let baHubXlsx = null;
  const pmtoolXlsxLib = path.join(BA_HUB_ROOT, 'bin', 'lib', 'pmtool-xlsx.js');
  const baHubCli = path.join(BA_HUB_ROOT, 'bin', 'ba-hub.js');
  if (cfg.templatePath && fs.existsSync(cfg.templatePath) && fs.existsSync(pmtoolXlsxLib) && fs.existsSync(baHubCli)) {
    try {
      const baArgs = [
        baHubCli,
        'pmtool-sync',
        `--hub=${wbsState.hubWorkspace.hubRoot}`,
        `--template=${cfg.templatePath}`,
        `--wave=${requestedWave === 'all' ? 'auto' : requestedWave}`
      ];
      if (opts.sprint && String(opts.sprint).toLowerCase() !== 'all') baArgs.push(`--sprint=${opts.sprint}`);
      if (opts.release && String(opts.release).toLowerCase() !== 'all') baArgs.push(`--release=${opts.release}`);
      const baOut = execFileSync(process.execPath, baArgs, {
        cwd: cfg.projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      baHubXlsx = baOut.trim();
    } catch {
      // Non-fatal fallback; pmtool-board-sync.js already produced full outputs
    }
  }

  return {
    ok: true,
    dryRun: false,
    mode: 'xlsx',
    wave: requestedWave,
    counts: {
      totalProcessed: operations.length,
      storiesCount: boardSummary?.storiesCount ?? wbsState.hierarchy.stories.length,
      tasksCount: boardSummary?.tasksCount ?? wbsState.hierarchy.tasks.length
    },
    artifacts: {
      ...(boardSummary?.artifacts || {}),
      tasksJsonPath: path.relative(cfg.projectRoot, tasksJsonOut),
      syncMapPath: path.relative(cfg.projectRoot, wbsState.syncMapPath),
      baHubXlsx
    }
  };
}

/**
 * Synchronizes Gate A (`READY_FOR_DEV`), Gate B (`READY_TO_CODE`), or `QA` statuses to remote PMTool and `PMTOOL_SYNC_MAP.json`.
 * @param {string} projectRoot
 * @param {{ gate: string, sprint?: string, featureIds?: string[], dryRun?: boolean }} opts
 */
async function syncGateStatus(projectRoot, opts = {}) {
  const gateInput = String(opts.gate || 'GATE_B').trim().toUpperCase();
  const mapping = GATE_STAGE_MAP[gateInput];
  if (!mapping) {
    return {
      ok: false,
      code: 'INVALID_GATE',
      message: `Unknown gate '${opts.gate}'. Expected one of: GATE_A, READY_FOR_DEV, GATE_B, READY_TO_CODE, QA.`
    };
  }

  const dryRun = Boolean(opts.dryRun);
  const cfg = resolvePmtoolConfig(projectRoot, opts);
  const wbsState = loadUnifiedWbsAndSyncMap(cfg.projectRoot, opts);
  const targetFeatureSet = Array.isArray(opts.featureIds) && opts.featureIds.length > 0
    ? new Set(opts.featureIds.map(normalizeFeatId))
    : null;

  const targetFeatures = wbsState.hierarchy.features.filter(f => !targetFeatureSet || targetFeatureSet.has(f.externalKey));
  const targetFeatureKeys = new Set(targetFeatures.map(f => f.externalKey));
  const targetStories = wbsState.hierarchy.stories.filter(s => targetFeatureKeys.has(s.parentKey));
  const targetItems = [...targetFeatures, ...targetStories];

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      mode: cfg.effectiveMode,
      gate: gateInput,
      targetStage: mapping.stage,
      targetStatus: mapping.status,
      targetCount: targetItems.length,
      targets: targetItems.map(i => ({ externalKey: i.externalKey, type: i.type, remoteId: i.remoteId || null }))
    };
  }

  const nowIso = new Date().toISOString();
  const syncMap = wbsState.rawSyncMap;
  syncMap.updatedAt = nowIso;
  const headers = {};
  if (cfg.apiToken) headers.Authorization = `Bearer ${cfg.apiToken}`;

  const updatedItems = [];
  const errors = [];

  for (const item of targetItems) {
    let remoteUpdated = false;
    if (cfg.effectiveMode === 'api' && item.remoteId) {
      const baseItemUrl = `${cfg.baseUrl}/api/projects/${encodeURIComponent(cfg.projectId)}/work-items/${encodeURIComponent(String(item.remoteId))}`;
      try {
        let res = await httpJsonRequest(
          'PATCH',
          `${baseItemUrl}/status`,
          { externalKey: item.externalKey, gate: gateInput, stage: mapping.stage, status: mapping.status },
          headers,
          cfg.timeoutMs
        );
        if (res.statusCode === 404 || res.statusCode === 405) {
          res = await httpJsonRequest(
            'PUT',
            baseItemUrl,
            { id: item.remoteId, externalKey: item.externalKey, gate: gateInput, stage: mapping.stage, status: mapping.status },
            headers,
            cfg.timeoutMs
          );
        }
        if (!res.ok) {
          errors.push({ externalKey: item.externalKey, remoteId: item.remoteId, statusCode: res.statusCode, error: res.raw });
          continue;
        }
        remoteUpdated = true;
      } catch (err) {
        errors.push({ externalKey: item.externalKey, remoteId: item.remoteId, error: err.message });
        continue;
      }
    }

    upsertSyncMapEntry(syncMap, item, item.remoteId ?? null, {
      stage: mapping.stage,
      status: mapping.status,
      syncedAt: nowIso
    });
    if (syncMap.entities[item.externalKey]) {
      syncMap.entities[item.externalKey].gateSyncedAt = nowIso;
      syncMap.entities[item.externalKey].gate = gateInput;
    }

    updatedItems.push({
      externalKey: item.externalKey,
      type: item.type,
      remoteId: item.remoteId || null,
      remoteUpdated,
      stage: mapping.stage,
      status: mapping.status
    });
  }

  savePmtoolSyncMap(wbsState.syncMapPath, syncMap);

  return {
    ok: errors.length === 0,
    dryRun: false,
    mode: cfg.effectiveMode,
    gate: gateInput,
    targetStage: mapping.stage,
    targetStatus: mapping.status,
    updatedCount: updatedItems.length,
    updatedItems,
    errors,
    syncMapPath: path.relative(cfg.projectRoot, wbsState.syncMapPath)
  };
}

module.exports = {
  resolvePmtoolConfig,
  loadUnifiedWbsAndSyncMap,
  inspectPmtoolBoard,
  pushWbsWave,
  syncGateStatus
};
