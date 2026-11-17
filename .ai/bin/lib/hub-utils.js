/**
 * 🔗 BA_AI_SDLC v2.1.0 Centralized Context Hub Shared Utilities (v4.1.0)
 * Pure Node.js zero-dependency helpers for:
 *   - CLI ~/ homedir path expansion (`expandCliPath`)
 *   - Context Hub discovery (`ba-hub-v2` vs `legacy-bcas`), `Scope Mode: FULL_PROJECT | PARTIAL_JIT_ANCHOR`, & `_intake/` / `UX_DESIGN_BRIEF.md` detection
 *   - Deterministic SHA-256 `feature_srd` normalization over Sections 1-9
 *   - `SPRINT_<ID>_MANIFEST.md` & `SPRINT_MASTER_PLAN.md` parsing
 *   - Two-Gate (`Gate A READY_FOR_DEV -> Gate B READY_TO_CODE` via `ENG-01..ENG-10`) parsing
 *   - Evolution Ledger & `DELTA_*.md` (`Was / Current / Update Needed`) extraction
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const srdV1 = require('./srd');

function expandCliPath(p) {
  if (p === null || p === undefined || typeof p !== 'string') return p;
  const trimmed = p.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return '';
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

const ENG_CHECKS_SPEC = [
  { id: 'ENG-01', title: 'Model/Table Binding' },
  { id: 'ENG-02', title: 'API Endpoint & Envelope Contract' },
  { id: 'ENG-03', title: 'SEED-* & ENUM-* Codebase Mapping' },
  { id: 'ENG-04', title: 'Visual Screen §2 & Lifecycle §3 data-testid Plan' },
  { id: 'ENG-05', title: 'ESR Index & N+1 Prevention' },
  { id: 'ENG-06', title: 'Tenant/IDOR & RBAC Guard' },
  { id: 'ENG-07', title: 'IPDPL/PII Masking' },
  { id: 'ENG-08', title: 'Archetype Concurrency/Idempotency Strategy' },
  { id: 'ENG-09', title: 'Automated Test File Binding' },
  { id: 'ENG-10', title: 'Mobile/QA Handoff Impact' }
];

const PLACEHOLDER_CELL_REGEX = /^(?:tbd|todo|pending|n\/a\s*\(pending\)|\[.*\]|-+|\?+|none|empty)$/i;

function resolveProjectAndAiRoot(cwd = process.cwd(), scriptDir = __dirname) {
  let projectRoot = cwd;
  let aiDir = path.join(projectRoot, '.ai');

  if (path.basename(projectRoot) === '.ai') {
    aiDir = projectRoot;
    projectRoot = path.resolve(projectRoot, '..');
  } else if (!fs.existsSync(aiDir)) {
    const osRoot = path.resolve(scriptDir, '..', '..');
    if (fs.existsSync(path.join(projectRoot, 'stack.json'))) {
      aiDir = projectRoot;
    } else if (fs.existsSync(path.join(osRoot, 'stack.json'))) {
      aiDir = osRoot;
    }
  }

  return { projectRoot, aiDir };
}

function loadStackAndHubConfig(projectRoot, aiDir) {
  const candidates = [
    path.join(projectRoot, '.ai', 'stack.json'),
    path.join(projectRoot, 'stack.json'),
    aiDir ? path.join(aiDir, 'stack.json') : null
  ].filter(Boolean);

  let stackConfig = {};
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        stackConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      } catch {}
    }
  }

  const contextHub = {
    layout: 'auto',
    hub_root: 'docs/project-context-hub',
    enforce_two_gate: true,
    verify_feature_srd: true,
    ...(stackConfig?.stacks?.context_hub || {}),
    ...(stackConfig?.context_hub || {})
  };

  return { stackConfig, contextHub };
}

function isHubV2Directory(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  try {
    const markers = ['00-project-core', '01-roadmap-and-pm', '02-sprints', '03-version-deltas', '_intake'];
    return markers.some(m => fs.existsSync(path.join(dirPath, m)));
  } catch {
    return false;
  }
}

function parseHubV21Metadata(hubRoot, docsDir) {
  const findExisting = candidates => candidates.filter(Boolean).find(p => fs.existsSync(p)) || null;

  const projectContextPath = findExisting([
    hubRoot ? path.join(hubRoot, '00-project-core', 'PROJECT_CONTEXT.md') : null,
    docsDir ? path.join(docsDir, 'PROJECT_CONTEXT.md') : null
  ]);

  const intakeManifestPath = findExisting([
    hubRoot ? path.join(hubRoot, '_intake', 'INTAKE_MANIFEST.md') : null,
    docsDir ? path.join(docsDir, '_intake', 'INTAKE_MANIFEST.md') : null,
    docsDir ? path.join(docsDir, 'INTAKE_MANIFEST.md') : null
  ]);

  const prototypeDiscoveryPath = findExisting([
    hubRoot ? path.join(hubRoot, '_intake', 'PROTOTYPE_DISCOVERY_REPORT.md') : null,
    docsDir ? path.join(docsDir, '_intake', 'PROTOTYPE_DISCOVERY_REPORT.md') : null,
    docsDir ? path.join(docsDir, 'PROTOTYPE_DISCOVERY_REPORT.md') : null
  ]);

  const uxDesignBriefPath = findExisting([
    hubRoot ? path.join(hubRoot, '00-project-core', 'UX_DESIGN_BRIEF.md') : null,
    docsDir ? path.join(docsDir, 'UX_DESIGN_BRIEF.md') : null
  ]);

  let scopeMode = 'FULL_PROJECT';
  let intakeMode = 'standard';

  const metadataSources = [projectContextPath, intakeManifestPath].filter(Boolean);
  for (const srcPath of metadataSources) {
    try {
      const text = fs.readFileSync(srcPath, 'utf8');
      const scopePatterns = [
        /\|\s*\*\*Scope\s+Mode\*\*\s*\|\s*`?(FULL_PROJECT|PARTIAL_JIT_ANCHOR)`?/i,
        /\*\*Scope\s+Mode\s*:?\*\*\s*`?(FULL_PROJECT|PARTIAL_JIT_ANCHOR)`?/i,
        /Scope\s+Mode\s*:\s*`?(FULL_PROJECT|PARTIAL_JIT_ANCHOR)`?/i
      ];
      for (const pat of scopePatterns) {
        const m = text.match(pat);
        if (m) {
          scopeMode = m[1].trim().toUpperCase();
          break;
        }
      }

      if (intakeMode === 'standard') {
        const intakePatterns = [
          /\|\s*\*\*Intake\s+Mode\*\*\s*\|\s*`?([A-Za-z0-9_-]+)`?/i,
          /\*\*Intake\s+Mode\s*:?\*\*\s*`?([A-Za-z0-9_-]+)`?/i,
          /Intake\s+Mode\s*:\s*`?([A-Za-z0-9_-]+)`?/i
        ];
        for (const pat of intakePatterns) {
          const m = text.match(pat);
          if (m && m[1]) {
            intakeMode = m[1].trim().toLowerCase();
            break;
          }
        }
      }
    } catch {}
  }

  if (intakeMode === 'standard') {
    if (scopeMode === 'PARTIAL_JIT_ANCHOR') intakeMode = 'brownfield-cr';
    else if (prototypeDiscoveryPath) intakeMode = 'prototype-code';
    else if (uxDesignBriefPath) intakeMode = 'figma-ux';
  }

  return {
    scopeMode,
    intakeMode,
    v21Artifacts: {
      projectContextPath,
      intakeManifestPath,
      prototypeDiscoveryPath,
      uxDesignBriefPath,
      hasIntakeManifest: Boolean(intakeManifestPath),
      hasPrototypeDiscovery: Boolean(prototypeDiscoveryPath),
      hasUxDesignBrief: Boolean(uxDesignBriefPath)
    }
  };
}

function resolveHubWorkspace(projectRoot, options = {}) {
  const { explicitHubPath = null, aiDir = null } = options;
  const { stackConfig, contextHub } = loadStackAndHubConfig(projectRoot, aiDir);
  const docsDir = path.join(projectRoot, 'docs', 'business-context');
  const legacyFeaturesDir = path.join(docsDir, 'features');
  const expandedHubRootCfg = expandCliPath(contextHub.hub_root || 'docs/project-context-hub');
  const configuredHubRoot = path.resolve(projectRoot, expandedHubRootCfg);
  const expandedExplicitHub = explicitHubPath ? path.resolve(expandCliPath(explicitHubPath)) : null;

  if (contextHub.layout === 'legacy-bcas' && !expandedExplicitHub) {
    const meta = parseHubV21Metadata(configuredHubRoot, docsDir);
    return {
      isHubV2: false,
      layout: 'legacy-bcas',
      hubRoot: configuredHubRoot,
      docsDir,
      legacyFeaturesDir,
      stackConfig,
      contextHub,
      ...meta
    };
  }

  const hubCandidates = [
    expandedExplicitHub,
    configuredHubRoot,
    path.join(projectRoot, 'docs', 'project-context-hub'),
    path.join(projectRoot, 'project-context-hub'),
    docsDir
  ].filter(Boolean);

  for (const candidate of hubCandidates) {
    if (isHubV2Directory(candidate)) {
      const meta = parseHubV21Metadata(candidate, docsDir);
      return {
        isHubV2: true,
        layout: 'ba-hub-v2',
        hubRoot: candidate,
        docsDir,
        legacyFeaturesDir,
        stackConfig,
        contextHub,
        ...meta
      };
    }
  }

  const fallbackHubRoot = expandedExplicitHub || configuredHubRoot;
  const meta = parseHubV21Metadata(fallbackHubRoot, docsDir);
  return {
    isHubV2: contextHub.layout === 'ba-hub-v2',
    layout: contextHub.layout === 'ba-hub-v2' ? 'ba-hub-v2' : 'legacy-bcas',
    hubRoot: fallbackHubRoot,
    docsDir,
    legacyFeaturesDir,
    stackConfig,
    contextHub,
    ...meta
  };
}

/**
 * Extracts and normalizes Sections 1-9 according to BA_AI_SDLC v2.0.0:
 * - Strips carriage returns (\r)
 * - Slices from Section 1 heading up to Section 10 or Section 11 heading
 * - Strips trailing whitespace on every line and trailing horizontal rule separators
 */
function extractNormalizedSections1To9(rawContent) {
  const lf = String(rawContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = lf.split('\n');

  let startIdx = -1;
  let endIdx = lines.length;

  const sec1Regex = /^##\s+(?:Section\s+)?(?:0?1)(?:\b|\.|[:\s—-])/i;
  const sec10Or11Regex = /^##\s+(?:Section\s+)?1[01](?:\b|\.|[:\s—-])/i;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (startIdx === -1 && sec1Regex.test(trimmed)) {
      startIdx = i;
      continue;
    }
    if (startIdx !== -1 && sec10Or11Regex.test(trimmed)) {
      endIdx = i;
      break;
    }
  }

  let targetLines;
  if (startIdx !== -1) {
    targetLines = lines.slice(startIdx, endIdx);
  } else {
    // Fallback when numbered headings are absent: exclude Section 10/11 and any Gate B metadata line
    let fallbackEnd = lines.findIndex(l => sec10Or11Regex.test(l.trim()) || /^##\s+.*Gate\s+B/i.test(l.trim()));
    if (fallbackEnd === -1) fallbackEnd = lines.length;
    targetLines = lines.slice(0, fallbackEnd).filter(l => !/\bGate\s+B\s+Status\b/i.test(l));
  }

  const normalizedLines = targetLines.map(line => line.replace(/[ \t]+$/g, ''));
  let joined = normalizedLines.join('\n').trim();
  joined = joined.replace(/(?:\n---\s*)+$/g, '').trim();
  return joined;
}

function computeFeatureSrd(rawContent) {
  const normalized = extractNormalizedSections1To9(rawContent);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function cleanSrdToken(rawToken) {
  if (!rawToken) return '';
  const cleaned = String(rawToken)
    .replace(/[`"'[\]()]/g, '')
    .replace(/^sha256:/i, '')
    .trim();
  if (!cleaned || /^(?:tbd|pending|none|n\/a|-+)$/i.test(cleaned)) return '';
  if (/^[a-f0-9]{8,64}$/i.test(cleaned)) return cleaned.toLowerCase();
  const srdHex = srdV1.extractDeclaredHex(cleaned);
  return srdHex || '';
}

function verifySrdMatch(computedHex, expectedRaw, altSrdV1Hex = '') {
  const cleaned = cleanSrdToken(expectedRaw);
  if (!cleaned) return { comparable: false, matches: true, expected: '' };
  const comp = String(computedHex || '').toLowerCase();
  const alt = String(altSrdV1Hex || '').toLowerCase();
  const matchesPrimary = cleaned.length === 64 ? comp === cleaned : comp.startsWith(cleaned);
  const matchesAlt = Boolean(alt) && (cleaned.length === 64 ? alt === cleaned : alt.startsWith(cleaned));
  return { comparable: true, matches: matchesPrimary || matchesAlt, expected: cleaned };
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(c => c.trim());
}

function isSeparatorRow(cells) {
  return Array.isArray(cells) && cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c) || c === '');
}

function stripMdFormatting(val) {
  return String(val || '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^\[|\]$/g, '')
    .trim();
}

function parseSprintManifest(manifestPath) {
  const map = new Map();
  if (!manifestPath || !fs.existsSync(manifestPath)) return map;

  const content = fs.readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  let headers = null;
  for (const line of lines) {
    const cells = splitMarkdownRow(line);
    if (!cells) {
      if (line.trim() === '' || line.startsWith('#')) headers = null;
      continue;
    }
    if (isSeparatorRow(cells)) continue;

    const lowerCells = cells.map(c => stripMdFormatting(c).toLowerCase());
    if (!headers && lowerCells.some(c => c.includes('feature') || c === 'id')) {
      headers = lowerCells;
      continue;
    }

    if (headers) {
      const rowObj = {};
      headers.forEach((h, idx) => {
        rowObj[h] = stripMdFormatting(cells[idx] || '');
      });

      const idCol = headers.findIndex(h => h.includes('feature id') || h === 'id' || h === 'feature');
      const rawId = idCol !== -1 ? stripMdFormatting(cells[idCol]) : '';
      const featMatch = rawId.match(/(FEATURE-[A-Za-z0-9_-]+)/i) || line.match(/(FEATURE-[A-Za-z0-9_-]+)/i);
      if (!featMatch) continue;

      const featureId = featMatch[1].toUpperCase();
      const waveCol = headers.findIndex(h => h.includes('wave'));
      const archCol = headers.findIndex(h => h.includes('archetype') || h.includes('type'));
      const gateACol = headers.findIndex(h => h.includes('gate a') || h.includes('ba status') || h === 'readiness');
      const gateBCol = headers.findIndex(h => h.includes('gate b') || h.includes('eng status'));
      const verCol = headers.findIndex(h => h.includes('ver'));
      const srdCol = headers.findIndex(h => h.includes('srd') || h.includes('digest') || h.includes('sha') || h.includes('hash'));

      let wave = null;
      if (waveCol !== -1 && cells[waveCol]) {
        const wm = cells[waveCol].match(/([123])/);
        if (wm) wave = parseInt(wm[1], 10);
      }

      let featureSrd = srdCol !== -1 ? cleanSrdToken(cells[srdCol]) : '';
      if (!featureSrd) {
        const srdTok = line.match(/\bSRD-[A-Za-z0-9-]+-([A-Fa-f0-9]{8,64})\b/i);
        const inlineHex = srdTok || line.match(/\b(?:sha256:)?([a-f0-9]{12,64})\b/i);
        if (inlineHex) featureSrd = inlineHex[1].toLowerCase();
      }

      map.set(featureId, {
        id: featureId,
        wave,
        archetype: archCol !== -1 ? stripMdFormatting(cells[archCol]).toUpperCase() : '',
        gateA: gateACol !== -1 ? stripMdFormatting(cells[gateACol]).toUpperCase() : '',
        gateB: gateBCol !== -1 ? stripMdFormatting(cells[gateBCol]).toUpperCase() : '',
        version: verCol !== -1 ? stripMdFormatting(cells[verCol]) : '',
        featureSrd,
        manifestPath
      });
    }
  }

  return map;
}

function parseMasterPlanWaves(masterPlanPath) {
  const map = new Map();
  if (!masterPlanPath || !fs.existsSync(masterPlanPath)) return map;

  const content = fs.readFileSync(masterPlanPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  let currentHeadingWave = null;
  let currentHeadingSprint = null;
  let headers = null;

  for (const line of lines) {
    const hWave = line.match(/^#{2,4}\s+.*?\bWave\s*([123])\b/i);
    if (hWave) currentHeadingWave = parseInt(hWave[1], 10);

    const hSprint = line.match(/^#{2,4}\s+.*?\b(S[0-9]+|Sprint[-_ ]?[0-9]+|B[0-9]+)\b/i);
    if (hSprint) currentHeadingSprint = hSprint[1].replace(/\s+/g, '-');

    const cells = splitMarkdownRow(line);
    if (!cells) {
      if (line.trim() === '' || line.startsWith('#')) headers = null;
      const bulletFeat = line.match(/\b(FEATURE-[A-Za-z0-9_-]+)\b/i);
      if (bulletFeat && currentHeadingWave) {
        const fid = bulletFeat[1].toUpperCase();
        if (!map.has(fid)) {
          map.set(fid, { wave: currentHeadingWave, sprint: currentHeadingSprint, archetype: '' });
        }
      }
      continue;
    }

    if (isSeparatorRow(cells)) continue;
    const lowerCells = cells.map(c => stripMdFormatting(c).toLowerCase());
    if (!headers && lowerCells.some(c => c.includes('feature') || c === 'id')) {
      headers = lowerCells;
      continue;
    }

    const featMatch = line.match(/\b(FEATURE-[A-Za-z0-9_-]+)\b/i);
    if (!featMatch) continue;
    const fid = featMatch[1].toUpperCase();

    let wave = currentHeadingWave;
    let sprint = currentHeadingSprint;
    let archetype = '';

    if (headers) {
      const waveIdx = headers.findIndex(h => h.includes('wave'));
      if (waveIdx !== -1 && cells[waveIdx]) {
        const wm = cells[waveIdx].match(/([123])/);
        if (wm) wave = parseInt(wm[1], 10);
      }
      const spIdx = headers.findIndex(h => h.includes('sprint') || h.includes('batch'));
      if (spIdx !== -1 && cells[spIdx]) {
        sprint = stripMdFormatting(cells[spIdx]);
      }
      const archIdx = headers.findIndex(h => h.includes('archetype'));
      if (archIdx !== -1 && cells[archIdx]) {
        archetype = stripMdFormatting(cells[archIdx]).toUpperCase();
      }
    } else {
      const wm = line.match(/\bWave\s*([123])\b|\bW([123])\b/i);
      if (wm) wave = parseInt(wm[1] || wm[2], 10);
    }

    map.set(fid, { wave, sprint, archetype });
  }

  return map;
}

function parseSection11GateB(content) {
  const lf = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sec11Match = lf.match(/^##\s+(?:Section\s+)?11(?:\b|\.|[:\s—-])[^\n]*([\s\S]*)$/im);
  const checks = new Map();

  if (!sec11Match) {
    return {
      exists: false,
      gateBStatus: null,
      sealedSrd: '',
      checks,
      raw: ''
    };
  }

  const sec11Body = sec11Match[0];
  let gateBStatus = null;
  const statusPatterns = [
    /\|\s*\*\*Gate\s+B\s+Status\*\*\s*\|\s*`?([A-Z_]+)`?/i,
    /\*\*Gate\s+B\s+Status\s*:?\*\*\s*`?([A-Z_]+)`?/i,
    /Gate\s+B\s+Status\s*:\s*`?([A-Z_]+)`?/i
  ];
  for (const pat of statusPatterns) {
    const m = sec11Body.match(pat);
    if (m) {
      gateBStatus = m[1].trim().toUpperCase();
      break;
    }
  }

  let sealedSrd = '';
  const srdMatch = sec11Body.match(/(?:feature_srd|Semantic\s+Digest|Sealed\s+Hash|Normative\s+Hash)[^|\n:]*[:|]\s*([^\n|]+)/i);
  if (srdMatch) sealedSrd = cleanSrdToken(srdMatch[1]);

  const lines = sec11Body.split('\n');
  for (const line of lines) {
    const cells = splitMarkdownRow(line);
    if (!cells || cells.length < 3 || isSeparatorRow(cells)) continue;
    const idCell = stripMdFormatting(cells[0]).toUpperCase();
    if (!/^ENG-(?:0[1-9]|10)$/.test(idCell)) continue;

    // Support 3-col (ID | Binding | Status) or 4-col (ID | Check Name | Binding | Status)
    let checkLabel = '';
    let binding = '';
    let status = '';
    if (cells.length >= 4) {
      checkLabel = stripMdFormatting(cells[1]);
      binding = stripMdFormatting(cells[2]);
      status = stripMdFormatting(cells[cells.length - 1]).toUpperCase();
    } else {
      const spec = ENG_CHECKS_SPEC.find(s => s.id === idCell);
      checkLabel = spec ? spec.title : idCell;
      binding = stripMdFormatting(cells[1]);
      status = stripMdFormatting(cells[2]).toUpperCase();
    }

    checks.set(idCell, {
      id: idCell,
      label: checkLabel,
      binding,
      status
    });
  }

  return {
    exists: true,
    gateBStatus,
    sealedSrd,
    checks,
    raw: sec11Body
  };
}

function evaluateGateBChecks(section11) {
  const results = [];
  let passedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  for (const spec of ENG_CHECKS_SPEC) {
    const row = section11.checks.get(spec.id);
    if (!row) {
      pendingCount++;
      results.push({ id: spec.id, title: spec.title, valid: false, state: 'MISSING', reason: `${spec.id} row missing in Section 11` });
      continue;
    }

    const rawStatus = row.status;
    const isFail = rawStatus.includes('FAIL') || rawStatus.includes('BLOCKED');
    const isPending = !rawStatus || rawStatus.includes('PENDING') || rawStatus === 'TBD' || rawStatus === 'TODO' || rawStatus === '-';
    const isPassStatus = rawStatus === 'PASS' || rawStatus === 'VERIFIED' || rawStatus === 'VALID' || rawStatus.startsWith('N/A');
    const hasConcreteBinding = Boolean(row.binding) && row.binding.length >= 3 && !PLACEHOLDER_CELL_REGEX.test(row.binding.trim());

    if (isFail) {
      failedCount++;
      results.push({ id: spec.id, title: spec.title, valid: false, state: 'FAIL', reason: `${spec.id} marked ${rawStatus}` });
    } else if (isPending || !hasConcreteBinding || !isPassStatus) {
      pendingCount++;
      const reason = !hasConcreteBinding
        ? `${spec.id} lacks concrete codebase binding ('${row.binding || 'empty'}')`
        : `${spec.id} status is '${rawStatus || 'PENDING'}'`;
      results.push({ id: spec.id, title: spec.title, valid: false, state: 'PENDING', reason });
    } else {
      passedCount++;
      results.push({ id: spec.id, title: spec.title, valid: true, state: 'PASS', binding: row.binding });
    }
  }

  return {
    allValid: passedCount === 10 && failedCount === 0 && pendingCount === 0,
    passedCount,
    failedCount,
    pendingCount,
    results
  };
}

function parseEvolutionTables(markdown, sourceLabel = '') {
  const deltas = [];
  if (!markdown) return deltas;
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');

  let headers = null;
  for (const line of lines) {
    const cells = splitMarkdownRow(line);
    if (!cells) {
      if (line.trim() === '' || line.startsWith('#')) headers = null;
      continue;
    }
    if (isSeparatorRow(cells)) continue;

    const lower = cells.map(c => stripMdFormatting(c).toLowerCase());
    const hasWas = lower.some(c => c === 'was' || c.startsWith('was ') || c.includes('previous'));
    const hasCurrent = lower.some(c => c === 'current' || c.startsWith('current ') || c === 'now');
    const hasTarget = lower.some(c => c.includes('target') || c === 'id' || c.includes('artifact') || c.includes('item'));

    if (!headers && hasWas && hasCurrent && hasTarget) {
      headers = lower;
      continue;
    }

    if (headers) {
      const idxVer = headers.findIndex(h => h.startsWith('ver'));
      const idxDate = headers.findIndex(h => h.includes('date'));
      const idxRef = headers.findIndex(h => h.includes('ref') || h.includes('cr') || h.includes('change'));
      const idxTarget = headers.findIndex(h => h.includes('target') || h === 'id' || h.includes('artifact') || h.includes('item'));
      const idxWas = headers.findIndex(h => h === 'was' || h.startsWith('was ') || h.includes('previous'));
      const idxCurrent = headers.findIndex(h => h === 'current' || h.startsWith('current ') || h === 'now');
      const idxUpdate = headers.findIndex(h => h.includes('update') || h.includes('impact') || h.includes('action'));

      const targetId = idxTarget !== -1 ? stripMdFormatting(cells[idxTarget]) : '';
      const wasVal = idxWas !== -1 ? stripMdFormatting(cells[idxWas]) : '';
      const currentVal = idxCurrent !== -1 ? stripMdFormatting(cells[idxCurrent]) : '';

      if (!targetId || PLACEHOLDER_CELL_REGEX.test(targetId) || (PLACEHOLDER_CELL_REGEX.test(wasVal) && PLACEHOLDER_CELL_REGEX.test(currentVal))) {
        continue;
      }

      deltas.push({
        version: idxVer !== -1 ? stripMdFormatting(cells[idxVer]) : '',
        date: idxDate !== -1 ? stripMdFormatting(cells[idxDate]) : '',
        ref: idxRef !== -1 ? stripMdFormatting(cells[idxRef]) : '',
        targetId,
        was: wasVal,
        current: currentVal,
        updateNeeded: idxUpdate !== -1 ? stripMdFormatting(cells[idxUpdate]) : '',
        source: sourceLabel
      });
    }
  }

  return deltas;
}

/**
 * Parses 01-roadmap-and-pm/BACKLOG_WBS.md (5-Level WBS: Components, Epics, Releases, Sprints, Stories, Tasks)
 */
function parseBacklogWbs(wbsPath) {
  const result = {
    exists: false,
    wbsPath: wbsPath || null,
    components: new Map(),
    epics: new Map(),
    releases: new Map(),
    sprints: new Map(),
    stories: new Map(),
    tasks: new Map(),
    featureHierarchy: new Map() // FEATURE-XXX -> { componentId, epicId, release, sprint, stories: [] }
  };

  if (!wbsPath || !fs.existsSync(wbsPath)) return result;
  result.exists = true;

  const content = fs.readFileSync(wbsPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  let headers = null;
  for (const line of lines) {
    const cells = splitMarkdownRow(line);
    if (!cells) {
      if (line.trim() === '' || line.startsWith('#')) headers = null;
      continue;
    }
    if (isSeparatorRow(cells)) continue;

    const lower = cells.map(c => stripMdFormatting(c).toLowerCase());
    if (
      !headers &&
      lower.some(h =>
        h.includes('component') ||
        h.includes('epic') ||
        h.includes('release') ||
        h.includes('sprint') ||
        h.includes('story') ||
        h.includes('task') ||
        h === 'id'
      )
    ) {
      headers = lower;
      continue;
    }

    if (!headers) continue;

    const getCol = patterns => {
      const idx = headers.findIndex(h => patterns.some(p => h === p || h.includes(p)));
      return idx !== -1 ? stripMdFormatting(cells[idx] || '') : '';
    };

    const rowText = cells.map(stripMdFormatting).join(' | ');
    const cmpMatch = rowText.match(/\b(CMP-[A-Za-z0-9_-]+)\b/i);
    const epcMatch = rowText.match(/\b(EPC-[A-Za-z0-9_-]+)\b/i);
    const relMatch = rowText.match(/\b(REL-[A-Za-z0-9._-]+)\b/i);
    const featMatch = rowText.match(/\b(FEATURE-[A-Za-z0-9_-]+|FEAT-[A-Za-z0-9_-]+)\b/i);
    const strMatch = rowText.match(/\b(STR-[A-Za-z0-9_-]+)\b/i);
    const tskMatch = rowText.match(/\b(TSK-[A-Za-z0-9_-]+)\b/i);

    const normalizeFeatId = raw => {
      if (!raw) return '';
      const up = raw.toUpperCase();
      return up.startsWith('FEAT-') ? up.replace(/^FEAT-/, 'FEATURE-') : up;
    };

    if (tskMatch) {
      const tskId = tskMatch[1].toUpperCase();
      const storyId = strMatch ? strMatch[1].toUpperCase() : getCol(['story']).toUpperCase();
      const featureId = normalizeFeatId(featMatch ? featMatch[1] : getCol(['feature']));
      const release = relMatch ? relMatch[1].toUpperCase() : getCol(['release']);
      const sprint = getCol(['sprint', 'iteration']) || 'S1';
      const department = getCol(['dept', 'department', 'track', 'team', 'role']) || (tskId.endsWith('-BE') ? 'BE' : tskId.endsWith('-WEB') ? 'WEB' : tskId.endsWith('-MOB') ? 'MOB' : 'QA');
      const title = getCol(['task title', 'title', 'summary', 'description', 'name']) || tskId;
      const status = getCol(['status', 'state']) || 'READY';
      result.tasks.set(tskId, {
        id: tskId,
        storyId,
        featureId,
        department,
        title,
        release,
        sprint,
        status
      });
      continue;
    }

    if (strMatch) {
      const strId = strMatch[1].toUpperCase();
      const cmpId = cmpMatch ? cmpMatch[1].toUpperCase() : getCol(['component']);
      const epcId = epcMatch ? epcMatch[1].toUpperCase() : getCol(['epic']);
      const featId = normalizeFeatId(featMatch ? featMatch[1] : getCol(['feature']));
      const release = relMatch ? relMatch[1].toUpperCase() : (getCol(['release', 'target release']) || 'REL-1.0');
      const sprint = getCol(['sprint', 'iteration']) || 'S1';
      const title = getCol(['story title', 'story name', 'title', 'user story', 'summary', 'name']) || strId;
      const points = getCol(['points', 'sp', 'estimate']) || '3';
      const status = getCol(['status', 'state']) || 'READY_FOR_DEV';
      const acRefs = getCol(['ac', 'acceptance']);

      const storyObj = {
        id: strId,
        componentId: cmpId,
        epicId: epcId,
        featureId: featId,
        title,
        release,
        sprint,
        points,
        status,
        acRefs
      };
      result.stories.set(strId, storyObj);

      if (featId) {
        if (!result.featureHierarchy.has(featId)) {
          result.featureHierarchy.set(featId, {
            componentId: cmpId || '',
            epicId: epcId || '',
            release: release || '',
            sprint: sprint || '',
            stories: []
          });
        }
        const fh = result.featureHierarchy.get(featId);
        if (cmpId && !fh.componentId) fh.componentId = cmpId;
        if (epcId && !fh.epicId) fh.epicId = epcId;
        if (release && !fh.release) fh.release = release;
        if (sprint && !fh.sprint) fh.sprint = sprint;
        if (!fh.stories.some(s => s.id === strId)) fh.stories.push(storyObj);
      }
      continue;
    }

    if (featMatch && (cmpMatch || epcMatch || relMatch)) {
      const featId = normalizeFeatId(featMatch[1]);
      const cmpId = cmpMatch ? cmpMatch[1].toUpperCase() : getCol(['component']);
      const epcId = epcMatch ? epcMatch[1].toUpperCase() : getCol(['epic']);
      const release = relMatch ? relMatch[1].toUpperCase() : getCol(['release']);
      const sprint = getCol(['sprint']) || '';
      if (!result.featureHierarchy.has(featId)) {
        result.featureHierarchy.set(featId, {
          componentId: cmpId || '',
          epicId: epcId || '',
          release: release || '',
          sprint: sprint || '',
          stories: []
        });
      } else {
        const fh = result.featureHierarchy.get(featId);
        if (cmpId && !fh.componentId) fh.componentId = cmpId;
        if (epcId && !fh.epicId) fh.epicId = epcId;
        if (release && !fh.release) fh.release = release;
        if (sprint && !fh.sprint) fh.sprint = sprint;
      }
    }

    if (epcMatch && !strMatch) {
      const epcId = epcMatch[1].toUpperCase();
      const cmpId = cmpMatch ? cmpMatch[1].toUpperCase() : getCol(['component']);
      const release = relMatch ? relMatch[1].toUpperCase() : getCol(['release']);
      const name = getCol(['epic name', 'epic title', 'title', 'name', 'summary']) || epcId;
      result.epics.set(epcId, { id: epcId, componentId: cmpId, name, release });
    }

    if (cmpMatch && !epcMatch && !strMatch) {
      const cmpId = cmpMatch[1].toUpperCase();
      const name = getCol(['component name', 'component title', 'title', 'name', 'domain']) || cmpId;
      const owner = getCol(['owner', 'lead', 'team']) || '';
      result.components.set(cmpId, { id: cmpId, name, owner });
    }

    if (relMatch && !epcMatch && !strMatch && !featMatch) {
      const relId = relMatch[1].toUpperCase();
      const name = getCol(['release name', 'title', 'name', 'version', 'scope']) || relId;
      const sprints = getCol(['sprint', 'sprints']);
      const targetDate = getCol(['date', 'target']);
      result.releases.set(relId, { id: relId, name, sprints, targetDate });
    }
  }

  return result;
}

/**
 * Parses 01-roadmap-and-pm/PMTOOL_SYNC_MAP.json
 */
function parsePmtoolSyncMap(syncMapPath) {
  const fallback = {
    exists: false,
    syncMapPath: syncMapPath || null,
    raw: null,
    projectKey: '',
    syncStatus: 'UNSYNCED',
    featureStatus: new Map(),
    storyStatus: new Map(),
    taskStatus: new Map()
  };

  if (!syncMapPath || !fs.existsSync(syncMapPath)) return fallback;
  try {
    const raw = JSON.parse(fs.readFileSync(syncMapPath, 'utf8'));
    fallback.exists = true;
    fallback.raw = raw;
    fallback.projectKey = raw.project_key || raw.projectKey || raw.workspace || 'PMTOOL';
    fallback.syncStatus = (raw.status || raw.sync_status || 'SYNCED').toUpperCase();

    const normalizeFeatKey = k => {
      const up = String(k || '').toUpperCase();
      return up.startsWith('FEAT-') ? up.replace(/^FEAT-/, 'FEATURE-') : up;
    };

    const featuresObj = raw.features || raw.feature_map || {};
    if (Array.isArray(featuresObj)) {
      for (const item of featuresObj) {
        const fid = normalizeFeatKey(item.id || item.feature_id);
        if (fid) fallback.featureStatus.set(fid, (item.status || item.sync_status || 'SYNCED').toUpperCase());
      }
    } else if (featuresObj && typeof featuresObj === 'object') {
      for (const [k, v] of Object.entries(featuresObj)) {
        const fid = normalizeFeatKey(k);
        const st = typeof v === 'string' ? v : (v?.status || v?.sync_status || 'SYNCED');
        fallback.featureStatus.set(fid, String(st).toUpperCase());
      }
    }

    const storiesObj = raw.stories || raw.story_map || {};
    if (Array.isArray(storiesObj)) {
      for (const item of storiesObj) {
        const sid = String(item.id || item.story_id || '').toUpperCase();
        if (sid) {
          fallback.storyStatus.set(sid, (item.status || item.sync_status || 'SYNCED').toUpperCase());
          const fid = normalizeFeatKey(item.feature_id || item.featureId);
          if (fid && !fallback.featureStatus.has(fid)) {
            fallback.featureStatus.set(fid, (item.status || item.sync_status || 'SYNCED').toUpperCase());
          }
        }
      }
    } else if (storiesObj && typeof storiesObj === 'object') {
      for (const [k, v] of Object.entries(storiesObj)) {
        const sid = String(k).toUpperCase();
        const st = typeof v === 'string' ? v : (v?.status || v?.sync_status || 'SYNCED');
        fallback.storyStatus.set(sid, String(st).toUpperCase());
        const fid = normalizeFeatKey(v?.feature_id || v?.featureId);
        if (fid && !fallback.featureStatus.has(fid)) {
          fallback.featureStatus.set(fid, String(st).toUpperCase());
        }
      }
    }

    const tasksObj = raw.tasks || raw.task_map || {};
    if (Array.isArray(tasksObj)) {
      for (const item of tasksObj) {
        const tid = String(item.id || item.task_id || '').toUpperCase();
        if (tid) fallback.taskStatus.set(tid, (item.status || item.sync_status || 'SYNCED').toUpperCase());
      }
    } else if (tasksObj && typeof tasksObj === 'object') {
      for (const [k, v] of Object.entries(tasksObj)) {
        const tid = String(k).toUpperCase();
        const st = typeof v === 'string' ? v : (v?.status || v?.sync_status || 'SYNCED');
        fallback.taskStatus.set(tid, String(st).toUpperCase());
      }
    }

    // Ingest ba-context-hub-os PMTOOL_SYNC_MAP.json `entities` dictionary (`dbId` / skeleton entries)
    if (raw.entities && typeof raw.entities === 'object' && !Array.isArray(raw.entities)) {
      for (const [rawKey, entry] of Object.entries(raw.entities)) {
        const upperKey = String(rawKey || '').toUpperCase();
        if (!upperKey || !entry || typeof entry !== 'object') continue;
        const kind = String(entry.type || '').toLowerCase();
        const st = String(entry.dbId ? 'SYNCED' : (entry.status || entry.sync_status || 'SKELETON')).toUpperCase();
        if (kind === 'feature' || /^FEATU?RE?-/i.test(upperKey) || /^FEAT-/i.test(upperKey)) {
          const fid = normalizeFeatKey(upperKey);
          if (!fallback.featureStatus.has(fid)) fallback.featureStatus.set(fid, st);
        } else if (kind === 'story' || /^STR-/i.test(upperKey)) {
          if (!fallback.storyStatus.has(upperKey)) fallback.storyStatus.set(upperKey, st);
        } else if (kind === 'task' || /^TSK-/i.test(upperKey)) {
          if (!fallback.taskStatus.has(upperKey)) fallback.taskStatus.set(upperKey, st);
        }
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function resolveWbsAndPmtoolPaths(hubWorkspace) {
  const candidatesWbs = [
    hubWorkspace?.hubRoot ? path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'BACKLOG_WBS.md') : null,
    hubWorkspace?.docsDir ? path.join(hubWorkspace.docsDir, 'BACKLOG_WBS.md') : null,
    hubWorkspace?.docsDir ? path.join(hubWorkspace.docsDir, '01-roadmap-and-pm', 'BACKLOG_WBS.md') : null
  ].filter(Boolean);

  const candidatesSync = [
    hubWorkspace?.hubRoot ? path.join(hubWorkspace.hubRoot, '01-roadmap-and-pm', 'PMTOOL_SYNC_MAP.json') : null,
    hubWorkspace?.docsDir ? path.join(hubWorkspace.docsDir, 'PMTOOL_SYNC_MAP.json') : null,
    hubWorkspace?.docsDir ? path.join(hubWorkspace.docsDir, '01-roadmap-and-pm', 'PMTOOL_SYNC_MAP.json') : null
  ].filter(Boolean);

  return {
    wbsPath: candidatesWbs.find(p => fs.existsSync(p)) || null,
    syncMapPath: candidatesSync.find(p => fs.existsSync(p)) || null
  };
}

/**
 * Parses Section 1B Story Decomposition Table (STR-* rows mapped to Release & Sprint)
 */
function parseSection1BStories(rawContent, defaults = {}) {
  const lf = String(rawContent || '').replace(/\r\n/g, '\n');
  const lines = lf.split('\n');
  const stories = [];
  const seenIds = new Set();

  let headers = null;
  for (const line of lines) {
    const cells = splitMarkdownRow(line);
    if (!cells) {
      if (line.trim() === '' || line.startsWith('#')) headers = null;
      continue;
    }
    if (isSeparatorRow(cells)) continue;

    const lower = cells.map(c => stripMdFormatting(c).toLowerCase());
    if (!headers && lower.some(h => h.includes('story') || h === 'str id' || h === 'id')) {
      headers = lower;
      continue;
    }

    const rowStr = cells.map(stripMdFormatting).join(' | ');
    const strMatch = rowStr.match(/\b(STR-[A-Za-z0-9_-]+)\b/i);
    if (!strMatch) continue;

    const strId = strMatch[1].toUpperCase();
    if (seenIds.has(strId)) continue;
    seenIds.add(strId);

    const getCol = patterns => {
      if (!headers) return '';
      const idx = headers.findIndex(h => patterns.some(p => h === p || h.includes(p)));
      return idx !== -1 ? stripMdFormatting(cells[idx] || '') : '';
    };

    const relMatch = rowStr.match(/\b(REL-[A-Za-z0-9._-]+)\b/i);
    const title = getCol(['story title', 'story name', 'title', 'user story', 'summary', 'description', 'story']) ||
      stripMdFormatting(cells[1] || strId);
    const release = getCol(['release', 'target release', 'rel']) ||
      (relMatch ? relMatch[1].toUpperCase() : (defaults.release || 'REL-1.0'));
    const sprint = getCol(['sprint', 'iteration']) || defaults.sprint || 'S1';
    const points = getCol(['points', 'sp', 'estimate']) || '3';
    const acRefs = getCol(['ac', 'acceptance']) || (rowStr.match(/\bAC-[0-9A-Za-z_., -]+\b/g) || []).join(', ');
    const status = getCol(['status', 'state']) || defaults.status || 'READY_FOR_DEV';

    stories.push({
      id: strId,
      featureId: defaults.featureId || '',
      componentId: defaults.componentId || '',
      epicId: defaults.epicId || '',
      title: title === strId && cells[1] ? stripMdFormatting(cells[1]) : title,
      release,
      sprint,
      points,
      acRefs,
      status
    });
  }

  return stories;
}

function parseFeatureDocument(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lf = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const basename = path.basename(filePath, '.md').replace(/^CANDIDATE_/, '');

  // Feature ID
  let id = basename;
  const idMatch = lf.match(/\|\s*\*\*Feature ID\*\*\s*\|\s*`?\[?([A-Za-z0-9_-]+)\]?`?/i) ||
                  lf.match(/^#\s+(FEATURE-[A-Za-z0-9_-]+)/im);
  if (idMatch) id = idMatch[1].trim().toUpperCase();

  // Title
  let title = id;
  const nameMatch = lf.match(/\|\s*\*\*(?:Feature\s+(?:Name|Title)|Title)\*\*\s*\|\s*`?\[?([^\]|\n`]+)\]?`?/i);
  if (nameMatch) {
    title = nameMatch[1].trim();
  } else {
    const h1 = lf.match(/^#\s+(.+)$/m);
    if (h1) {
      title = h1[1]
        .replace(/^FEATURE-[A-Za-z0-9_-]+\s*[:—-]\s*/i, '')
        .replace(/Feature Specification Document|BCAS Modular Spec/gi, '')
        .trim() || id;
    }
  }

  // Sprint inference
  const parts = filePath.split(path.sep);
  const sprintsIdx = parts.indexOf('02-sprints');
  const featuresIdx = parts.indexOf('features');
  let folderSprint = 'General';
  if (sprintsIdx !== -1 && parts[sprintsIdx + 1] && !parts[sprintsIdx + 1].endsWith('.md')) {
    folderSprint = parts[sprintsIdx + 1];
  } else if (featuresIdx !== -1 && parts[featuresIdx + 1] && !parts[featuresIdx + 1].endsWith('.md')) {
    folderSprint = parts[featuresIdx + 1];
  }

  let sprint = folderSprint;
  let waveFromSprintRow = null;
  const sprintWaveMatch = lf.match(/\|\s*\*\*Sprint\s*\/\s*Wave\*\*\s*\|\s*`?\[?([^\]|\n`]+)\]?`?/i);
  if (sprintWaveMatch && sprintWaveMatch[1].trim()) {
    const rawSw = sprintWaveMatch[1].trim();
    if (rawSw.includes('/')) {
      const [leftPart, ...rightParts] = rawSw.split('/');
      const leftClean = leftPart.trim();
      if (leftClean) sprint = leftClean.replace(/\s+/g, '-');
      const rightStr = rightParts.join('/');
      const rightWaveMatch = rightStr.match(/\bWave\s*([123])\b/i) || rightStr.match(/\b([123])\b/);
      if (rightWaveMatch) waveFromSprintRow = parseInt(rightWaveMatch[1], 10);
    } else {
      sprint = rawSw.replace(/\s+/g, '-');
    }
  } else {
    const sprintMatch = lf.match(/\|\s*\*\*Sprint(?:\s*\/\s*(?:Release|Batch))?\*\*\s*\|\s*`?\[?([^\]|\n]+)\]?`?/i);
    if (sprintMatch && sprintMatch[1].trim()) {
      sprint = sprintMatch[1].trim().replace(/\s+/g, '-');
    }
  }

  // Version
  let version = '1.0.0';
  const verMatch = lf.match(/\|\s*\*\*(?:Spec\s+)?Version\*\*\s*\|\s*`?\[?([^\]|\n`]+)\]?`?/i);
  if (verMatch) version = verMatch[1].trim();

  // Component ID, Epic ID, Target Release
  let componentId = '';
  const cmpMatch = lf.match(/\|\s*\*\*Component(?:\s+ID)?\*\*\s*\|\s*`?\[?([^\]|\n`]+)\]?`?/i);
  if (cmpMatch && !PLACEHOLDER_CELL_REGEX.test(cmpMatch[1].trim())) {
    componentId = cmpMatch[1].trim().toUpperCase();
  }

  let epicId = '';
  const epcMatch = lf.match(/\|\s*\*\*Epic(?:\s+ID)?\*\*\s*\|\s*`?\[?([^\]|\n`]+)\]?`?/i);
  if (epcMatch && !PLACEHOLDER_CELL_REGEX.test(epcMatch[1].trim())) {
    epicId = epcMatch[1].trim().toUpperCase();
  }

  let targetRelease = '';
  const relMatch = lf.match(/\|\s*\*\*(?:Target\s+)?Release(?:\s+ID|\s+Code)?\*\*\s*\|\s*`?\[?([^\]|\n`]+)\]?`?/i);
  if (relMatch && !PLACEHOLDER_CELL_REGEX.test(relMatch[1].trim())) {
    targetRelease = relMatch[1].trim().toUpperCase();
  }

  // Archetype
  let archetype = 'STANDARD';
  const archMatch = lf.match(/\|\s*\*\*(?:Feature\s+)?Archetype\*\*\s*\|\s*`?\[?([A-Za-z0-9_]+)\]?`?/i) ||
                    lf.match(/\b(READ_VIEW|MUTATION_WORKFLOW|INTEGRATION_JOB)\b/);
  if (archMatch) archetype = archMatch[1].trim().toUpperCase();

  // Section 1B Story Decomposition Table (STR-* mapped to Release & Sprint)
  const stories = parseSection1BStories(lf, {
    featureId: id,
    componentId,
    epicId,
    release: targetRelease || 'REL-1.0',
    sprint
  });
  if (!targetRelease && stories.length > 0 && stories[0].release) {
    targetRelease = stories[0].release;
  }

  // Wave hint inside spec (prefer explicit Wave token from Sprint / Wave, never digits from Sprint ID like S4)
  let wave = waveFromSprintRow;
  if (wave === null) {
    const waveMatch = lf.match(/\|\s*\*\*(?:Execution\s+)?Wave\*\*\s*\|\s*`?\[?(?:Wave\s*)?([123])\]?`?/i);
    if (waveMatch) wave = parseInt(waveMatch[1], 10);
  }

  // Gate A Status (BA)
  let gateA = 'CANDIDATE';
  const gateAMatch = lf.match(/\|\s*\*\*(?:Gate A(?:\s+Status(?:\s*\(BA\))?)?|BA Readiness|Readiness Status|Status)\*\*\s*\|\s*`?([A-Za-z0-9_]+)`?/i) ||
                     lf.match(/\*\*Gate A Status(?:\s*\(BA\))?\s*:?\*\*\s*`?([A-Za-z0-9_]+)`?/i);
  if (gateAMatch) {
    const st = gateAMatch[1].toUpperCase();
    if (st.includes('READY_FOR_DEV')) gateA = 'READY_FOR_DEV';
    else if (st.includes('IMPLEMENTED')) gateA = 'IMPLEMENTED';
    else if (st.includes('BLOCKED') || st.includes('NOT_READY')) gateA = 'BLOCKED';
    else if (st.includes('DRAFT')) gateA = 'DRAFT';
    else gateA = st;
  } else if (/Verdict:.*READY_FOR_DEV/i.test(lf) || /BCAS_SPEC_SEALED.*READY_FOR_DEV/i.test(lf)) {
    gateA = 'READY_FOR_DEV';
  }

  // Section 11 & Gate B Status (Engineering)
  const section11 = parseSection11GateB(lf);
  let headerGateB = null;
  const headerGateBMatch = lf.match(/\|\s*\*\*(?:Gate B(?:\s+Status(?:\s*\(Eng\))?)?|Engineering Readiness)\*\*\s*\|\s*`?([A-Za-z0-9_]+)`?/i);
  if (headerGateBMatch) headerGateB = headerGateBMatch[1].trim().toUpperCase();

  const isHubFeature = section11.exists || sprintsIdx !== -1 || /\bGate A Status\b/i.test(lf) || options.isHubV2 === true;
  let gateB = section11.gateBStatus || headerGateB || (isHubFeature ? 'PENDING' : 'N/A');

  // Declared SRD in header or Section 11
  let declaredSrd = section11.sealedSrd || '';
  if (!declaredSrd) {
    const hdrSrd = lf.match(/\|\s*\*\*(?:Semantic Digest(?:\s*\(`?feature_srd`?\))?|feature_srd)\*\*\s*\|\s*([^\n|]+)/i);
    if (hdrSrd) declaredSrd = cleanSrdToken(hdrSrd[1]);
  }

  const computedSrd = computeFeatureSrd(lf);
  const computedSrdV1 = srdV1.computeSemanticSha256(lf);
  const normativeText = extractNormalizedSections1To9(lf);

  // Open Business Decisions in Section 9 / 9.2
  let openBlockers = 0;
  const sec9Match = lf.match(/##\s+(?:9(?:\.2)?|Section\s+9)[^\n]*(?:Open Business Decisions|Governance|Sign-Off)([\s\S]*?)(?=\n##\s+1[01]|\n##\s+9\.3|$)/i) ||
                    lf.match(/##\s+9\.2\s+Open Business Decisions([\s\S]*?)(?=\n##|$)/i);
  if (sec9Match) {
    const openRows = sec9Match[1].match(/\|\s*`?Open`?\s*\|/gi);
    if (openRows) openBlockers = openRows.length;
  }

  // Catalog & Domain Tokens referenced in Normative Sections 1-9
  const seedRefs = Array.from(new Set((normativeText.match(/\bSEED-[A-Z0-9_-]+\b/g) || [])));
  const enumRefs = Array.from(new Set((normativeText.match(/\bENUM-[A-Z0-9_-]+\b/g) || [])));
  const domRefs = Array.from(new Set((normativeText.match(/\bDOM-[A-Z0-9_-]+\b/g) || [])));

  // Section 2: Screen Decomposition Refs (SCR-* or table rows under ## 2.)
  const screenRefs = new Set((normativeText.match(/\bSCR-[A-Z0-9_-]+\b/g) || []));
  const sec2Match = normativeText.match(/^##\s+(?:Section\s+)?2(?:\b|\.)([\s\S]*?)(?=^##\s+(?:Section\s+)?[3-9](?:\b|\.)|(?![\s\S]))/im);
  let hasScreenSection = false;
  if (sec2Match) {
    const s2 = sec2Match[1];
    if (/Screen|Component|Element|UI|Widget|Field/i.test(s2)) {
      const tableRows = s2.split('\n').map(splitMarkdownRow).filter(r => r && !isSeparatorRow(r));
      if (tableRows.length > 1) hasScreenSection = true;
    }
  }

  // Section 3: UI Lifecycle States
  const lifecycleStates = new Set();
  const sec3Match = normativeText.match(/^##\s+(?:Section\s+)?3(?:\b|\.)([\s\S]*?)(?=^##\s+(?:Section\s+)?[4-9](?:\b|\.)|(?![\s\S]))/im);
  if (sec3Match) {
    const s3 = sec3Match[1];
    for (const st of ['LOADING', 'EMPTY', 'ERROR', 'SUCCESS', 'POPULATED', 'OFFLINE', 'DISABLED', 'SUBMITTING', 'RETRY']) {
      if (new RegExp(`\\b${st}\\b`, 'i').test(s3)) lifecycleStates.add(st);
    }
  }

  // Section 7: Bilingual AR/EN Copy Keys
  const i18nKeys = [];
  const sec7Match = normativeText.match(/^##\s+(?:Section\s+)?(?:7|5\.2)(?:\b|\.)([\s\S]*?)(?=^##\s+(?:Section\s+)?[689](?:\b|\.)|(?![\s\S]))/im);
  if (sec7Match) {
    const lines7 = sec7Match[1].split('\n');
    let h7 = null;
    for (const l of lines7) {
      const cells = splitMarkdownRow(l);
      if (!cells) continue;
      if (isSeparatorRow(cells)) continue;
      const lower = cells.map(c => stripMdFormatting(c).toLowerCase());
      if (!h7 && lower.some(c => c.includes('key') || c.includes('ar') || c.includes('arabic'))) {
        h7 = lower;
        continue;
      }
      if (h7 && cells.length >= 3) {
        const kIdx = h7.findIndex(c => c.includes('key') || c.includes('id'));
        const arIdx = h7.findIndex(c => c.includes('ar'));
        const enIdx = h7.findIndex(c => c.includes('en'));
        const key = stripMdFormatting(cells[kIdx !== -1 ? kIdx : 0]);
        const ar = stripMdFormatting(cells[arIdx !== -1 ? arIdx : 1]);
        const en = stripMdFormatting(cells[enIdx !== -1 ? enIdx : 2]);
        if (key && !PLACEHOLDER_CELL_REGEX.test(key)) {
          i18nKeys.push({ key, ar, en });
        }
      }
    }
  }

  // Section 10: Evolution Ledger
  const sec10Match = lf.match(/^##\s+(?:Section\s+)?10(?:\b|\.)([\s\S]*?)(?=^##\s+(?:Section\s+)?11(?:\b|\.)|(?![\s\S]))/im);
  const section10Deltas = sec10Match ? parseEvolutionTables(sec10Match[1], `${id} (§10)`) : [];

  return {
    id,
    title,
    sprint,
    version,
    componentId,
    epicId,
    targetRelease,
    release: targetRelease,
    stories,
    storyCount: stories.length,
    archetype,
    wave,
    gateA,
    gateB,
    declaredSrd,
    computedSrd,
    computedSrdV1,
    openBlockers,
    seedRefs,
    enumRefs,
    domRefs,
    screenRefs: Array.from(screenRefs),
    hasScreenSection: hasScreenSection || screenRefs.size > 0,
    lifecycleStates: Array.from(lifecycleStates),
    i18nKeys,
    section10Deltas,
    section11,
    filePath
  };
}

function scanHubAndLegacyFeatures(hubWorkspace, sprintFilter = 'all') {
  const { isHubV2, hubRoot, legacyFeaturesDir } = hubWorkspace;
  const seenPaths = new Set();
  const results = [];

  function matchesSprint(folderName) {
    if (!sprintFilter || sprintFilter.toLowerCase() === 'all') return true;
    const f = folderName.toLowerCase();
    const s = sprintFilter.toLowerCase();
    return f === s || f.includes(s) || (s === 'b0' && (f === 'batch-0' || f === 'batch0'));
  }

  // 1. Scan Hub v2 02-sprints/<SprintID>/FEATURE-*.md
  const hubSprintsDirs = [
    path.join(hubRoot, '02-sprints'),
    path.join(path.dirname(legacyFeaturesDir), '02-sprints')
  ];

  for (const sprintsBase of hubSprintsDirs) {
    if (!fs.existsSync(sprintsBase)) continue;
    const entries = fs.readdirSync(sprintsBase, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      if (!matchesSprint(entry.name)) continue;
      const spDir = path.join(sprintsBase, entry.name);
      for (const f of fs.readdirSync(spDir)) {
        if (!f.endsWith('.md') || f.endsWith('.template.md') || f.endsWith('.example.md')) continue;
        if (/^SPRINT_.*_MANIFEST\.md$/i.test(f) || f.startsWith('README')) continue;
        if (f.startsWith('FEATURE-') || f.startsWith('CANDIDATE_FEATURE-') || f.endsWith('-spec.md')) {
          const abs = path.resolve(spDir, f);
          if (!seenPaths.has(abs)) {
            seenPaths.add(abs);
            results.push(abs);
          }
        }
      }
    }
  }

  // 2. Scan legacy docs/business-context/features/ ONLY in non-Hub-v2 (legacy-bcas) layouts
  if (!isHubV2) {
    function walkLegacy(dir, parentMatched) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const matched = parentMatched || matchesSprint(entry.name);
          walkLegacy(full, matched);
        } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('README')) {
          if (parentMatched || !sprintFilter || sprintFilter.toLowerCase() === 'all') {
            const abs = path.resolve(full);
            if (!seenPaths.has(abs)) {
              seenPaths.add(abs);
              results.push(abs);
            }
          }
        }
      }
    }
    walkLegacy(legacyFeaturesDir, !sprintFilter || sprintFilter.toLowerCase() === 'all');
  }

  return results;
}

function collectSprintManifests(hubWorkspace) {
  const combined = new Map();
  const sprintsBases = [
    path.join(hubWorkspace.hubRoot, '02-sprints'),
    path.join(hubWorkspace.docsDir, '02-sprints')
  ];

  for (const base of sprintsBases) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const spDir = path.join(base, entry.name);
      for (const f of fs.readdirSync(spDir)) {
        if (/^SPRINT_.*_MANIFEST\.md$/i.test(f)) {
          const mMap = parseSprintManifest(path.join(spDir, f));
          for (const [k, v] of mMap.entries()) {
            combined.set(k, v);
          }
        }
      }
    }
  }
  return combined;
}

module.exports = {
  ENG_CHECKS_SPEC,
  PLACEHOLDER_CELL_REGEX,
  expandCliPath,
  resolveProjectAndAiRoot,
  loadStackAndHubConfig,
  isHubV2Directory,
  parseHubV21Metadata,
  resolveHubWorkspace,
  extractNormalizedSections1To9,
  computeFeatureSrd,
  computeSemanticDigest: srdV1.computeSemanticDigest,
  computeSemanticSha256: srdV1.computeSemanticSha256,
  cleanSrdToken,
  verifySrdMatch,
  splitMarkdownRow,
  isSeparatorRow,
  stripMdFormatting,
  parseSprintManifest,
  parseMasterPlanWaves,
  parseSection11GateB,
  evaluateGateBChecks,
  parseEvolutionTables,
  parseBacklogWbs,
  parsePmtoolSyncMap,
  resolveWbsAndPmtoolPaths,
  parseSection1BStories,
  parseFeatureDocument,
  scanHubAndLegacyFeatures,
  collectSprintManifests
};
