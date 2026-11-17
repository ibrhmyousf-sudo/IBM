'use strict';

/**
 * 🔌 InnovaDigits Orchestrator Add-on Plugin & Lifecycle Hook Registry (`bin/lib/orchestrator-plugins.js` v4.3.0)
 * Zero external dependencies (Node.js built-ins: `fs`, `path`).
 *
 * Isolates external integrations (such as PMTool) from the core 11-stage SDLC pipeline.
 * Supports built-in add-ons + custom workspace plugins in `.ai/plugins/*.js` implementing:
 *   - onBeforeStage(context)
 *   - onAfterGatePass(context)
 *   - onGateFail(context)
 *   - onCheckpointApproved(context)
 *   - onReleaseSealed(context)
 */

const fs = require('fs');
const path = require('path');
const pmtoolAdapter = require('./pmtool-adapter');
const { expandCliPath } = require('./hub-utils');

const LIFECYCLE_HOOKS = [
  'onBeforeStage',
  'onAfterGatePass',
  'onGateFail',
  'onCheckpointApproved',
  'onReleaseSealed'
];

const DEFAULT_ORCHESTRATOR_CONFIG = {
  schemaVersion: '4.3.0',
  mode: 'SOLO_FDE',
  requireHumanCheckpoints: true,
  checkpointStages: ['CORE_BOOTSTRAP', 'SPRINT_SPECS', 'DEV_IMPLEMENT'],
  circuitBreaker: {
    maxRetries: 3,
    autoAppendLessonsLearned: true
  },
  roleAssignments: {
    BA: ['*'],
    TECH_LEAD: ['*'],
    DEV: ['*'],
    SECURITY: ['*'],
    QA: ['*'],
    PM: ['*']
  },
  addons: {
    pmtool: {
      enabled: false,
      syncOnStages: ['GATE_A_SEAL', 'GATE_B_ENG'],
      dryRun: false
    }
  },
  pluginsDir: '.ai/plugins'
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_ORCHESTRATOR_CONFIG));
}

function deepMergeConfig(base, ext) {
  const out = JSON.parse(JSON.stringify(base || DEFAULT_ORCHESTRATOR_CONFIG));
  if (!ext || typeof ext !== 'object') return out;

  for (const [k, v] of Object.entries(ext)) {
    if (k === 'circuitBreaker' && v && typeof v === 'object') {
      out.circuitBreaker = { ...(out.circuitBreaker || {}), ...v };
    } else if (k === 'roleAssignments' && v && typeof v === 'object') {
      out.roleAssignments = { ...(out.roleAssignments || {}), ...v };
    } else if (k === 'addons' && v && typeof v === 'object') {
      out.addons = out.addons || {};
      for (const [addonId, addonCfg] of Object.entries(v)) {
        out.addons[addonId] = {
          ...(out.addons[addonId] || {}),
          ...(addonCfg && typeof addonCfg === 'object' ? addonCfg : {})
        };
      }
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Loads `<projectRoot>/.ai/orchestrator.config.json` merged over defaults and optional overrides.
 * `addons.pmtool.enabled` strictly defaults to `false` unless explicitly enabled.
 * @param {string} projectRoot
 * @param {Record<string, any>} [overrides]
 */
function loadOrchestratorConfig(projectRoot, overrides = {}) {
  const absProject = path.resolve(expandCliPath(projectRoot || process.cwd()));
  const configPath = path.join(absProject, '.ai', 'orchestrator.config.json');

  let rawCfg = null;
  let configError = null;
  if (fs.existsSync(configPath)) {
    try {
      rawCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      configError = err instanceof Error ? err.message : String(err);
    }
  }

  let merged = deepMergeConfig(DEFAULT_ORCHESTRATOR_CONFIG, rawCfg || {});
  if (overrides && typeof overrides === 'object') {
    const cleanOverrides = { ...overrides };
    if (cleanOverrides.requireHumanCheckpoints === undefined) {
      delete cleanOverrides.requireHumanCheckpoints;
    }
    merged = deepMergeConfig(merged, cleanOverrides);
  }

  merged.addons = merged.addons || {};
  merged.addons.pmtool = {
    enabled: false,
    syncOnStages: ['GATE_A_SEAL', 'GATE_B_ENG'],
    dryRun: false,
    ...(merged.addons.pmtool || {})
  };
  merged.addons.pmtool.enabled = merged.addons.pmtool.enabled === true;

  return {
    ...merged,
    projectRoot: absProject,
    configPath,
    configExists: fs.existsSync(configPath),
    configError
  };
}

/**
 * Returns true if the requested add-on ID is enabled in `.ai/orchestrator.config.json` (or overrides).
 * @param {string} projectRoot
 * @param {string} addonId
 * @param {Record<string, any>} [overrides]
 */
function isAddonEnabled(projectRoot, addonId, overrides = {}) {
  const cfg = loadOrchestratorConfig(projectRoot, overrides);
  return Boolean(cfg.addons?.[addonId]?.enabled === true);
}

function buildBuiltinPmtoolPlugin(cfg) {
  const pmCfg = cfg.addons?.pmtool || {};
  return {
    id: 'pmtool',
    name: 'Hybrid PMTool 5-Level WBS & Gate Sync',
    builtin: true,
    enabled: pmCfg.enabled === true,
    source: 'bin/lib/pmtool-adapter.js',
    loadError: null,
    async onAfterGatePass(ctx) {
      const syncStages = Array.isArray(pmCfg.syncOnStages) && pmCfg.syncOnStages.length > 0
        ? pmCfg.syncOnStages
        : ['GATE_A_SEAL', 'GATE_B_ENG'];
      if (!syncStages.includes(ctx.stage)) {
        return { skipped: true, reason: `Stage '${ctx.stage}' not in pmtool.syncOnStages` };
      }

      const dryRun = Boolean(pmCfg.dryRun);
      const pushRes = await pmtoolAdapter.pushWbsWave(ctx.projectRoot, {
        sprint: ctx.sprint,
        dryRun
      });
      const gateName = ctx.stage === 'GATE_A_SEAL' ? 'READY_FOR_DEV' : 'READY_TO_CODE';
      const gateRes = await pmtoolAdapter.syncGateStatus(ctx.projectRoot, {
        gate: gateName,
        sprint: ctx.sprint,
        dryRun
      });

      if (!pushRes.ok || !gateRes.ok) {
        const msg = [
          !pushRes.ok ? `pushWbsWave failed: ${JSON.stringify(pushRes.errors || pushRes.message || 'error')}` : null,
          !gateRes.ok ? `syncGateStatus failed: ${gateRes.message || 'error'}` : null
        ].filter(Boolean).join('; ');
        throw new Error(msg || 'PMTool sync failed');
      }

      return {
        mode: pushRes.mode,
        gate: gateName,
        counts: pushRes.counts || null
      };
    }
  };
}

/**
 * Discovers built-in and `.ai/plugins/*.js` workspace add-ons, isolating load errors.
 * @param {string} projectRoot
 * @param {Record<string, any>} [overrides]
 */
function loadWorkspacePlugins(projectRoot, overrides = {}) {
  const cfg = loadOrchestratorConfig(projectRoot, overrides);
  const plugins = [buildBuiltinPmtoolPlugin(cfg)];

  const pluginsDirRel = cfg.pluginsDir || '.ai/plugins';
  const pluginsDirAbs = path.isAbsolute(pluginsDirRel)
    ? pluginsDirRel
    : path.join(cfg.projectRoot, pluginsDirRel);

  if (fs.existsSync(pluginsDirAbs)) {
    const files = fs.readdirSync(pluginsDirAbs)
      .filter(f => f.endsWith('.js') && !f.startsWith('.'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(pluginsDirAbs, file);
      const relSource = path.relative(cfg.projectRoot, fullPath).replace(/\\/g, '/');
      const fallbackId = path.basename(file, '.js');

      try {
        try {
          const resolved = require.resolve(fullPath);
          delete require.cache[resolved];
        } catch {
          // ignore resolve cache miss
        }

        const loaded = require(fullPath);
        const mod = loaded && typeof loaded === 'object' ? loaded : {};
        const id = String(mod.id || fallbackId).trim();
        const name = String(mod.name || id).trim();
        const cfgOverride = cfg.addons?.[id];
        const enabled = cfgOverride && cfgOverride.enabled !== undefined
          ? Boolean(cfgOverride.enabled)
          : mod.enabled !== false;

        const pluginObj = {
          id,
          name,
          builtin: false,
          enabled,
          source: relSource,
          loadError: null
        };

        for (const hookName of LIFECYCLE_HOOKS) {
          if (typeof mod[hookName] === 'function') {
            pluginObj[hookName] = mod[hookName].bind(mod);
          } else if (mod.hooks && typeof mod.hooks[hookName] === 'function') {
            pluginObj[hookName] = mod.hooks[hookName].bind(mod.hooks);
          }
        }

        plugins.push(pluginObj);
      } catch (err) {
        plugins.push({
          id: fallbackId,
          name: fallbackId,
          builtin: false,
          enabled: false,
          source: relSource,
          loadError: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  return { cfg, plugins };
}

/**
 * Lists all registered add-on plugins and their active status / hooks.
 * @param {string} projectRoot
 * @param {Record<string, any>} [overrides]
 */
function listLoadedAddons(projectRoot, overrides = {}) {
  const { cfg, plugins } = loadWorkspacePlugins(projectRoot, overrides);
  return {
    ok: true,
    projectRoot: cfg.projectRoot,
    configPath: path.relative(cfg.projectRoot, cfg.configPath).replace(/\\/g, '/'),
    configExists: cfg.configExists,
    configError: cfg.configError,
    addons: plugins.map(p => ({
      id: p.id,
      name: p.name,
      builtin: Boolean(p.builtin),
      enabled: Boolean(p.enabled),
      source: p.source,
      hooks: LIFECYCLE_HOOKS.filter(h => typeof p[h] === 'function'),
      loadError: p.loadError || null
    }))
  };
}

function summarizePluginResult(res) {
  if (res === undefined || res === null) return 'executed';
  if (typeof res === 'string') return res.slice(0, 200);
  if (typeof res === 'object') {
    if (res.skipped) return `skipped (${res.reason || 'condition'})`;
    try {
      return JSON.stringify(res).slice(0, 240);
    } catch {
      return 'executed';
    }
  }
  return String(res);
}

function appendAddonLogsToState(statePath, entries) {
  if (!statePath || entries.length === 0) return;
  if (!fs.existsSync(statePath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return;
    const prevLogs = Array.isArray(raw.addonLogs) ? raw.addonLogs : [];
    const combined = [...prevLogs, ...entries];
    raw.addonLogs = combined.slice(-100);
    fs.writeFileSync(statePath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[orchestrator-plugins] Failed appending addonLogs: ${err.message}\n`);
  }
}

/**
 * Dispatches a lifecycle hook across all enabled plugins, isolating all errors into `addonLogs`.
 * Never throws or blocks core SDLC transitions.
 * @param {string} hookName
 * @param {Record<string, any>} context
 * @param {{ statePath?: string, appendToState?: boolean, overrides?: Record<string, any> }} [opts]
 */
async function dispatchLifecycleHook(hookName, context = {}, opts = {}) {
  const absProject = path.resolve(expandCliPath(context.projectRoot || process.cwd()));
  const safeContext = { ...context, projectRoot: absProject, hook: hookName };
  const { plugins } = loadWorkspacePlugins(absProject, opts.overrides || {});

  const entries = [];
  let executedCount = 0;
  let errorCount = 0;

  for (const plugin of plugins) {
    if (plugin.loadError) {
      errorCount++;
      entries.push({
        timestamp: new Date().toISOString(),
        pluginId: plugin.id,
        hook: hookName,
        stage: safeContext.stage || null,
        sprint: safeContext.sprint || null,
        status: 'ERROR',
        durationMs: 0,
        summary: null,
        error: `Plugin load failed: ${plugin.loadError}`
      });
      continue;
    }

    if (!plugin.enabled || typeof plugin[hookName] !== 'function') {
      continue;
    }

    const start = Date.now();
    try {
      const result = await plugin[hookName](safeContext);
      executedCount++;
      entries.push({
        timestamp: new Date().toISOString(),
        pluginId: plugin.id,
        hook: hookName,
        stage: safeContext.stage || null,
        sprint: safeContext.sprint || null,
        status: 'OK',
        durationMs: Date.now() - start,
        summary: summarizePluginResult(result),
        error: null
      });
    } catch (err) {
      executedCount++;
      errorCount++;
      const errMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[orchestrator-plugins] Plugin '${plugin.id}' failed on ${hookName}: ${errMsg}\n`);
      entries.push({
        timestamp: new Date().toISOString(),
        pluginId: plugin.id,
        hook: hookName,
        stage: safeContext.stage || null,
        sprint: safeContext.sprint || null,
        status: 'ERROR',
        durationMs: Date.now() - start,
        summary: null,
        error: errMsg
      });
    }
  }

  const defaultStatePath = path.join(
    safeContext.hubRoot || path.join(absProject, 'docs', 'project-context-hub'),
    '.os-state.json'
  );
  const targetStatePath = opts.statePath || (fs.existsSync(defaultStatePath) ? defaultStatePath : null);
  if (opts.appendToState !== false && targetStatePath) {
    appendAddonLogsToState(targetStatePath, entries);
  }

  return {
    hook: hookName,
    executedCount,
    errorCount,
    entries
  };
}

module.exports = {
  LIFECYCLE_HOOKS,
  DEFAULT_ORCHESTRATOR_CONFIG,
  loadOrchestratorConfig,
  isAddonEnabled,
  loadWorkspacePlugins,
  listLoadedAddons,
  dispatchLifecycleHook
};
