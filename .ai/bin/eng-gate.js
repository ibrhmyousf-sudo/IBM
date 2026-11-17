#!/usr/bin/env node

/**
 * 🛡️ Two-Gate Engineering Readiness Validator & Promoter (`bin/eng-gate.js` v4.0.0)
 * Enforces BA_AI_SDLC v2.0.0 Two-Gate Progression (`READY_FOR_DEV` -> `READY_TO_CODE`):
 *   1. Normative Integrity Guard: Verifies SHA-256 `feature_srd` over Sections 1-9 against `SPRINT_<ID>_MANIFEST.md`
 *   2. Gate B (`ENG-01..ENG-10`) Validator & Promoter on Section 11 (`Gate B — Engineering Readiness Appendix`)
 *   3. Structured BA Gap Emitter (`--emit-gap` / `BLOCKED_BY_BA_GAP`) -> `docs/business-context/ENGINEERING_GAP_FEEDBACK.md`
 *
 * Usage:
 *   node bin/eng-gate.js --feature=FEATURE-003
 *   node bin/eng-gate.js --sprint=S1 --verify-only
 *   node bin/eng-gate.js --feature=FEATURE-004 --emit-gap="Clarify partial refund fee calculation in BR-004"
 */

const fs = require('fs');
const path = require('path');
const {
  ENG_CHECKS_SPEC,
  PLACEHOLDER_CELL_REGEX,
  expandCliPath,
  resolveProjectAndAiRoot,
  resolveHubWorkspace,
  computeFeatureSrd,
  verifySrdMatch,
  parseFeatureDocument,
  evaluateGateBChecks,
  scanHubAndLegacyFeatures,
  collectSprintManifests
} = require('./lib/hub-utils');

const args = process.argv.slice(2);
let featureFilter = '';
let sprintFilter = 'all';
let explicitHub = null;
let explicitBundlePath = null;
let populateHints = false;
let verifyOnly = false;
let emitGapSummary = '';
let isJson = false;

for (const arg of args) {
  if (arg.startsWith('--feature=')) {
    featureFilter = arg.slice('--feature='.length).trim().toUpperCase();
    if (featureFilter && !featureFilter.startsWith('FEATURE-') && /^\d+$/.test(featureFilter)) {
      featureFilter = `FEATURE-${featureFilter}`;
    }
  } else if (arg.startsWith('--sprint=')) {
    sprintFilter = arg.slice('--sprint='.length).trim();
  } else if (arg.startsWith('--hub=')) {
    explicitHub = path.resolve(expandCliPath(arg.slice('--hub='.length)));
  } else if (arg === '--auto-bind-bundle') {
    populateHints = true;
  } else if (arg.startsWith('--auto-bind-bundle=')) {
    explicitBundlePath = path.resolve(expandCliPath(arg.slice('--auto-bind-bundle='.length)));
  } else if (arg === '--populate-hints') {
    populateHints = true;
  } else if (arg === '--verify-only') {
    verifyOnly = true;
  } else if (arg.startsWith('--emit-gap=')) {
    emitGapSummary = arg.slice('--emit-gap='.length).replace(/^["']|["']$/g, '').trim();
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Two-Gate Engineering Sealer CLI (v4.1.0)

Options:
  --feature=<ID>             Target specific Feature ID (e.g. FEATURE-003)
  --sprint=<SprintID>        Target specific Sprint folder (e.g. S1)
  --auto-bind-bundle=<path>  Path to REVERSE_INTAKE_BUNDLE.json (auto-detected under docs/business-context/intake/ if omitted)
  --populate-hints           Pre-fill Section 11 (ENG-01..ENG-10) candidate bindings from reverse-intake bundle without touching Sections 1-9
  --verify-only              Validate Gate A, feature_srd integrity, and READY_TO_CODE ENG-01..10 completeness without promoting Gate B
  --emit-gap="<summary>"     Append structured BA clarification gap to ENGINEERING_GAP_FEEDBACK.md (for @ba-evolve)
  --hub=<path>               Custom project-context-hub root
  --json                     Emit JSON report
`);
    process.exit(0);
  }
}

const { projectRoot, aiDir } = resolveProjectAndAiRoot(process.cwd(), __dirname);
const hubWorkspace = resolveHubWorkspace(projectRoot, { explicitHubPath: explicitHub, aiDir });
const docsDir = hubWorkspace.docsDir;
const enforceSrd = hubWorkspace.contextHub.verify_feature_srd !== false;

const manifestMap = collectSprintManifests(hubWorkspace);
let candidateFiles = scanHubAndLegacyFeatures(hubWorkspace, sprintFilter);

if (featureFilter) {
  candidateFiles = candidateFiles.filter(fp => {
    const base = path.basename(fp, '.md').toUpperCase();
    if (base === featureFilter || base.includes(featureFilter)) return true;
    try {
      const parsed = parseFeatureDocument(fp, { isHubV2: hubWorkspace.isHubV2 });
      return parsed.id.toUpperCase() === featureFilter;
    } catch {
      return false;
    }
  });

  if (candidateFiles.length === 0) {
    console.error(`❌ [ENG-GATE] Feature '${featureFilter}' not found in Context Hub or BCAS directory.`);
    process.exit(1);
  }
}

function appendGapFeedback(featureDoc, gapText) {
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  const feedbackPath = path.join(docsDir, 'ENGINEERING_GAP_FEEDBACK.md');
  const existing = fs.existsSync(feedbackPath) ? fs.readFileSync(feedbackPath, 'utf8') : '';

  // Deduplicate identical open gap for same feature + summary
  if (existing.includes(`Feature: \`${featureDoc.id}\``) && existing.includes(gapText)) {
    return feedbackPath;
  }

  const existingGapCount = (existing.match(/^###\s+`GAP-\d+`/gm) || []).length;
  const gapId = `GAP-${String(existingGapCount + 1).padStart(3, '0')}`;
  const nowIso = new Date().toISOString();

  let header = '';
  if (!existing) {
    header = `# Engineering Clarification & Specification Gap Ledger (\`ENGINEERING_GAP_FEEDBACK.md\`)

> **INTAKE TARGET:** Business Analyst Team via \`@ba-evolve\` (\`BA_AI_SDLC v2.0.0\`)  
> **GOVERNANCE RULE:** Engineering NEVER silently alters normative Sections 1–9. Ambiguities or missing business rules discovered during Gate B (\`ENG-01..ENG-10\`) are logged below for authoritative BA resolution and \`Was -> Current\` delta issuance.

---
`;
  }

  const record = `
### \`${gapId}\` — Feature: \`${featureDoc.id}\` (${featureDoc.title})
- **Logged At:** \`${nowIso}\`
- **Sprint / Version:** \`${featureDoc.sprint}\` / \`${featureDoc.version}\`
- **Normative \`feature_srd\`:** \`${featureDoc.computedSrd}\`
- **Gate Status:** \`Gate A: ${featureDoc.gateA}\` | \`Gate B: BLOCKED_BY_BA_GAP\`
- **Clarification / Blocking Ambiguity:** ${gapText}
- **BA Intake Action:** Run \`@ba-evolve ${featureDoc.id}\` to resolve business rule gap, seal updated \`SPRINT_${featureDoc.sprint}_MANIFEST.md\`, and emit \`03-version-deltas/DELTA_*.md\`.

---
`;

  fs.writeFileSync(feedbackPath, (existing || header).trimEnd() + '\n' + record, 'utf8');
  return feedbackPath;
}

function updateSection11StatusInFile(filePath, newStatus, computedSrd) {
  const originalContent = fs.readFileSync(filePath, 'utf8');
  const preSrd = computeFeatureSrd(originalContent);
  const lf = originalContent.replace(/\r\n/g, '\n');

  // Split safely before Section 1, Sections 1-9 (+10), and Section 11 so Sections 1-9 are NEVER touched
  const lines = lf.split('\n');
  const sec1Idx = lines.findIndex(l => /^##\s+(?:Section\s+)?(?:0?1)(?:\b|\.|[:\s—-])/i.test(l.trim()));
  const sec11Idx = lines.findIndex((l, idx) => idx > Math.max(0, sec1Idx) && /^##\s+(?:Section\s+)?11(?:\b|\.|[:\s—-])/i.test(l.trim()));

  // Update optional pre-Section-1 banner Gate B Status if present
  if (sec1Idx > 0) {
    for (let i = 0; i < sec1Idx; i++) {
      if (/\|\s*\*\*Gate\s+B(?:\s+Status(?:\s*\(Eng\))?)?\*\*\s*\|/i.test(lines[i])) {
        lines[i] = lines[i].replace(/(\|\s*\*\*Gate\s+B(?:\s+Status(?:\s*\(Eng\))?)?\*\*\s*\|\s*)[^|]+(\|)/i, `$1\`${newStatus}\` $2`);
      }
    }
  }

  let updatedText;
  if (sec11Idx !== -1) {
    const beforeSec11 = lines.slice(0, sec11Idx).join('\n');
    let sec11Content = lines.slice(sec11Idx).join('\n');

    if (/\|\s*\*\*Gate\s+B\s+Status\*\*\s*\|/i.test(sec11Content)) {
      sec11Content = sec11Content.replace(
        /(\|\s*\*\*Gate\s+B\s+Status\*\*\s*\|\s*)[^|\n]+(\|)/i,
        `$1\`${newStatus}\` $2`
      );
    } else if (/\*\*Gate\s+B\s+Status\s*:?\*\*/i.test(sec11Content)) {
      sec11Content = sec11Content.replace(
        /(\*\*Gate\s+B\s+Status\s*:?\*\*\s*)`?[A-Z_]+`?/i,
        `$1\`${newStatus}\``
      );
    } else if (/Gate\s+B\s+Status\s*:/i.test(sec11Content)) {
      sec11Content = sec11Content.replace(
        /(Gate\s+B\s+Status\s*:\s*)`?[A-Z_]+`?/i,
        `$1\`${newStatus}\``
      );
    } else {
      const sec11Lines = sec11Content.split('\n');
      sec11Lines.splice(1, 0, '', `> **Gate B Status:** \`${newStatus}\` | **Verified \`feature_srd\`:** \`${computedSrd}\` | **Sealed At:** \`${new Date().toISOString()}\``);
      sec11Content = sec11Lines.join('\n');
    }

    if (!/feature_srd/i.test(sec11Content)) {
      sec11Content = sec11Content.trimEnd() + `\n\n> **Verified \`feature_srd\` (Sections 1–9 SHA-256):** \`${computedSrd}\`\n`;
    } else {
      sec11Content = sec11Content.replace(
        /(Verified\s+`?feature_srd`?[^:\n|]*[:|]\s*)`?[a-f0-9A-Za-z_-]+`?/i,
        `$1\`${computedSrd}\``
      );
    }

    updatedText = `${beforeSec11}\n${sec11Content}`;
  } else {
    updatedText = `${lines.join('\n').trimEnd()}\n\n---\n\n## 11. Gate B — Engineering Readiness Appendix\n\n> **Gate B Status:** \`${newStatus}\` | **Verified \`feature_srd\`:** \`${computedSrd}\`\n`;
  }

  // Hard invariant check: Sections 1-9 SHA-256 MUST remain byte-for-byte identical after normalization
  const postSrd = computeFeatureSrd(updatedText);
  if (postSrd !== preSrd) {
    throw new Error(`Normative integrity guard halted write: Sections 1-9 hash changed (${preSrd} -> ${postSrd})`);
  }

  fs.writeFileSync(filePath, updatedText, 'utf8');
}

function syncFeaturesIndexGateB(featureId, newGateB) {
  const idxPath = path.join(docsDir, 'FEATURES_INDEX.md');
  if (!fs.existsSync(idxPath)) return;
  const lines = fs.readFileSync(idxPath, 'utf8').split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`\`${featureId}\``) && lines[i].startsWith('|')) {
      const parts = lines[i].split('|');
      // Columns: '', Feature ID, Title, Sprint, Wave, Archetype, Gate A Status, Gate B Status, ...
      if (parts.length >= 9) {
        parts[7] = ` \`${newGateB}\` `;
        lines[i] = parts.join('|');
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(idxPath, lines.join('\n'), 'utf8');
  }
}

// Handle explicit --emit-gap mode
if (emitGapSummary) {
  if (candidateFiles.length === 0) {
    console.error('❌ [ENG-GATE] Specify --feature=<ID> when invoking --emit-gap.');
    process.exit(1);
  }
  const emitted = [];
  for (const fp of candidateFiles) {
    const doc = parseFeatureDocument(fp, { isHubV2: hubWorkspace.isHubV2 });
    updateSection11StatusInFile(fp, 'BLOCKED_BY_BA_GAP', doc.computedSrd);
    const feedbackFile = appendGapFeedback(doc, emitGapSummary);
    syncFeaturesIndexGateB(doc.id, 'BLOCKED_BY_BA_GAP');
    emitted.push({ id: doc.id, status: 'BLOCKED_BY_BA_GAP', feedbackFile });
  }
  if (isJson) {
    console.log(JSON.stringify({ mode: 'emit-gap', emitted }, null, 2));
  } else {
    for (const e of emitted) {
      console.log(`⚠️ [ENG-GATE] Logged BA Clarification Gap for ${e.id} -> ${path.relative(projectRoot, e.feedbackFile)}`);
    }
  }
  process.exit(0);
}

function resolveIntakeBundle() {
  const candidates = [
    explicitBundlePath,
    path.join(docsDir, 'intake', 'REVERSE_INTAKE_BUNDLE.json'),
    path.join(hubWorkspace.hubRoot, '_intake', 'REVERSE_INTAKE_BUNDLE.json'),
    path.join(docsDir, '_intake', 'REVERSE_INTAKE_BUNDLE.json'),
    path.join(projectRoot, 'REVERSE_INTAKE_BUNDLE.json')
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return { bundlePath: p, bundle: JSON.parse(fs.readFileSync(p, 'utf8')) };
      } catch (err) {
        throw new Error(`Failed to parse intake bundle at ${p}: ${err.message}`);
      }
    }
  }
  return null;
}

function selectModuleHintsForFeature(featureContent, doc, bundle) {
  const hintsMap = bundle?.gate_b_hints || {};
  const moduleKeys = Object.keys(hintsMap);
  if (moduleKeys.length === 0) return null;

  const corpus = `${doc.id} ${doc.title} ${featureContent}`.toLowerCase();
  let bestKey = moduleKeys[0];
  let bestScore = -1;

  for (const key of moduleKeys) {
    let score = 0;
    const lowerKey = key.toLowerCase();
    const singularKey = lowerKey.replace(/s$/, '');
    if (lowerKey && corpus.includes(lowerKey)) score += 5;
    if (singularKey && singularKey.length >= 3 && corpus.includes(singularKey)) score += 3;

    const cluster = Array.isArray(bundle.modules) ? bundle.modules.find(m => m.name === key) : null;
    if (cluster) {
      for (const m of cluster.models || []) {
        if (corpus.includes(String(m.name).toLowerCase()) || corpus.includes(String(m.table).toLowerCase())) score += 4;
      }
      for (const r of cluster.routes || []) {
        if (r.path && corpus.includes(String(r.path).toLowerCase())) score += 4;
      }
      for (const s of cluster.screens || []) {
        if (s.name && corpus.includes(String(s.name).toLowerCase())) score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return { moduleName: bestKey, hints: hintsMap[bestKey] };
}

function toKebabSlug(raw) {
  return String(raw || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function extractSectionSlice(content, secNum) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const startRe = new RegExp(`^##\\s+(?:Section\\s+)?0?${secNum}(?:\\b|\\.|[:\\s—-])`, 'i');
  const nextRe = /^##\s+(?:Section\s+)?\d+(?:\b|\.|[:\s—-])/i;
  const startIdx = lines.findIndex(l => startRe.test(l.trim()));
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (nextRe.test(lines[i].trim())) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

function extractSection2ElIds(featureContent) {
  const sec2 = extractSectionSlice(featureContent, 2);
  if (!sec2) return [];
  const ids = [];
  const seen = new Set();
  for (const m of sec2.matchAll(/\b(EL-[A-Z0-9][A-Z0-9_-]*)\b/g)) {
    const id = m[1].toUpperCase();
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function extractSection3States(featureContent) {
  const sec3 = extractSectionSlice(featureContent, 3);
  const canonical = ['Loading', 'Empty', 'Single-Item', 'Populated', 'Disabled', 'Error'];
  if (!sec3) return canonical;
  const found = [];
  for (const st of canonical) {
    const pattern = st === 'Single-Item' ? /\bsingle[-\s]?item\b/i : new RegExp(`\\b${st}\\b`, 'i');
    if (pattern.test(sec3)) {
      found.push(st);
    }
  }
  return found.length > 0 ? found : canonical;
}

function deriveFeatureComponentSlug(doc, existingBinding, fallbackModuleName) {
  const existingStr = String(existingBinding || '');
  const prefixMatch = existingStr.match(/data-testid\s*=\s*"([a-z][a-z0-9-]{2,})-(?:\{(?:component|element|module)\}|\*)/i);
  if (prefixMatch && prefixMatch[1] && prefixMatch[1].toLowerCase() !== 'module') {
    return toKebabSlug(prefixMatch[1]);
  }
  if (fallbackModuleName && !/^(?:core|default|unknown|api)$/i.test(fallbackModuleName)) {
    return toKebabSlug(fallbackModuleName);
  }
  const cleanTitle = String(doc?.title || '').replace(/^FEATURE-[A-Z0-9_-]+\s*[—:-]*\s*/i, '').replace(/\([^)]*\)/g, '').trim();
  return toKebabSlug(cleanTitle || doc?.id || 'feature') || 'feature';
}

function buildLiteralEng04TestIdPlan(featureContent, doc, existingBinding, hintBase, fallbackModuleName) {
  const elIds = extractSection2ElIds(featureContent);
  const states = extractSection3States(featureContent);
  const slug = deriveFeatureComponentSlug(doc, existingBinding || hintBase, fallbackModuleName);

  // Preserve concrete discovered Vue/React testids when Section 2 has no EL-* rows and no {component}/{element} placeholders
  const candidateConcrete = String(existingBinding || hintBase || '');
  const hasPlaceholderToken = /\{(?:component|element|module)\}|\*-\*/i.test(candidateConcrete);
  const concreteTestIds = [];
  for (const tm of candidateConcrete.matchAll(/\b([a-z][a-z0-9-]+-[a-z0-9-]+)\b/gi)) {
    if (!tm[1].includes('{') && !tm[1].includes('*') && /submit|btn|input|table|form|modal|card|row|page|list|detail|checkout/i.test(tm[1])) {
      if (!concreteTestIds.includes(tm[1])) concreteTestIds.push(tm[1]);
    }
  }

  if (elIds.length > 0) {
    const elTestIds = elIds.map(id => `${slug}-${id.toLowerCase()}`);
    const stateTestIds = states.map(st => `${slug}-state-${st.toLowerCase()}`);
    return `UI Spec §2 (${elTestIds.length} elements): ${elTestIds.map(t => `data-testid="${t}"`).join(', ')} / §3 States (${stateTestIds.length}): ${stateTestIds.map(t => `data-testid="${t}"`).join(', ')}`;
  }

  if (concreteTestIds.length > 0 && !hasPlaceholderToken && /data-testid/i.test(candidateConcrete)) {
    return candidateConcrete;
  }

  const fallbackStateIds = states.map(st => `${slug}-state-${st.toLowerCase()}`);
  const screenClean = String(hintBase || existingBinding || '')
    .replace(/\([^)]*\{(?:component|element|module)\}[^)]*\)/gi, '')
    .replace(/data-testid[^\s,;)]*\{(?:component|element|module)\}[^\s,;)]*/gi, '')
    .replace(/[a-z0-9-]+-\*-\*/gi, '')
    .trim()
    .replace(/[|]/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/:\s*$/, '');

  const prefix = concreteTestIds.length > 0
    ? `${concreteTestIds.slice(0, 5).map(t => `data-testid="${t}"`).join(', ')}`
    : `data-testid="${slug}-container", data-testid="${slug}-submit-btn"`;

  return `${screenClean ? `${screenClean} (` : ''}${prefix} / §3 States: ${fallbackStateIds.map(t => `data-testid="${t}"`).join(', ')}${screenClean ? ')' : ''}`;
}

function populateSection11HintsInFile(filePath, doc, bundle) {
  const originalContent = fs.readFileSync(filePath, 'utf8');
  const preSrd = computeFeatureSrd(originalContent);
  const elIdsInSection2 = extractSection2ElIds(originalContent);
  const existingEng04Binding = doc.section11?.checks?.get('ENG-04')?.binding || '';
  const hasUnexpandedEng04 = elIdsInSection2.length > 0 || /\{(?:component|element|module)\}|\*-\*/i.test(existingEng04Binding);

  const selectedRaw = selectModuleHintsForFeature(originalContent, doc, bundle);
  if ((!selectedRaw || !selectedRaw.hints) && !hasUnexpandedEng04) return false;
  const selected = selectedRaw && selectedRaw.hints ? selectedRaw : { moduleName: doc.id, hints: {} };

  const lf = originalContent.replace(/\r\n/g, '\n');
  const lines = lf.split('\n');
  const sec1Idx = lines.findIndex(l => /^##\s+(?:Section\s+)?(?:0?1)(?:\b|\.|[:\s—-])/i.test(l.trim()));
  const sec11Idx = lines.findIndex((l, idx) => idx > Math.max(0, sec1Idx) && /^##\s+(?:Section\s+)?11(?:\b|\.|[:\s—-])/i.test(l.trim()));

  function sanitizeCell(text) {
    return String(text || '')
      .replace(/\|/g, '/')
      .replace(/\r?\n/g, ' ')
      .trim();
  }

  function buildHintBinding(specId, currentBinding = '') {
    const rawHint = selected.hints[specId];
    let base = typeof rawHint === 'string' ? rawHint : (rawHint?.binding || '');
    if (specId === 'ENG-03' && (doc.seedRefs.length > 0 || doc.enumRefs.length > 0)) {
      const specTokens = [...doc.seedRefs, ...doc.enumRefs];
      const missingTokens = specTokens.filter(t => !base.includes(t));
      if (missingTokens.length > 0) {
        base = base ? `${missingTokens.join(', ')} -> ${base}` : `${missingTokens.join(', ')} mapped to catalog & seeder`;
      }
    }
    if (specId === 'ENG-04') {
      base = buildLiteralEng04TestIdPlan(originalContent, doc, currentBinding, base, selected.moduleName);
    }
    if (specId === 'ENG-06' && !/SEC-034|SEC-036|SEC-037/.test(base)) {
      base = `${base ? `${base} + ` : ''}RBAC Role-Matrix & Tenant 404 IDOR Guard (SEC-034, SEC-036, SEC-037)`;
    }
    if (specId === 'ENG-07' && !/SEC-048|SEC-148/.test(base)) {
      base = `${base ? `${base} + ` : ''}Tier-1/2 PII Masking & Zero-PII Log Scrubber (SEC-048, SEC-148)`;
    }
    if (specId === 'ENG-09' && !/SEC-164|SEC-170/.test(base)) {
      base = `${base ? `${base} + ` : ''}Horizontal/Vertical Negative Security & Role-Matrix Tests (SEC-164, SEC-170)`;
    }
    return sanitizeCell(base || `Bound via REVERSE_INTAKE_BUNDLE (${selected.moduleName})`);
  }

  let updatedText;
  let mutated = false;
  if (sec11Idx !== -1) {
    const beforeSec11 = lines.slice(0, sec11Idx).join('\n');
    const sec11Lines = lines.slice(sec11Idx);
    const seenSpecs = new Set();

    for (let i = 0; i < sec11Lines.length; i++) {
      const trimmed = sec11Lines[i].trim();
      if (!trimmed.startsWith('|')) continue;
      const idMatch = trimmed.match(/^\|\s*`?(ENG-(?:0[1-9]|10))`?\s*\|/i);
      if (!idMatch) continue;
      const specId = idMatch[1].toUpperCase();
      seenSpecs.add(specId);

      const existingRow = doc.section11.checks.get(specId);
      let needsLiteralRefresh = false;
      if (specId === 'ENG-04' && existingRow) {
        const bLower = String(existingRow.binding || '').toLowerCase();
        const hasPlaceholder = /\{(?:component|element|module)\}|\*-\*/i.test(existingRow.binding || '');
        const missingEl = elIdsInSection2.some(el => !bLower.includes(el.toLowerCase()));
        const statesInSec3 = extractSection3States(originalContent);
        const missingState = elIdsInSection2.length > 0 && statesInSec3.some(st => !bLower.includes(`state-${st.toLowerCase()}`));
        needsLiteralRefresh = hasPlaceholder || missingEl || missingState;
      }

      const isAlreadyValid = !needsLiteralRefresh && existingRow &&
        existingRow.binding &&
        existingRow.binding.length >= 3 &&
        !PLACEHOLDER_CELL_REGEX.test(existingRow.binding.trim()) &&
        (existingRow.status === 'PASS' || existingRow.status === 'VERIFIED' || existingRow.status === 'VALID' || existingRow.status.startsWith('N/A'));

      if (!isAlreadyValid) {
        const specObj = ENG_CHECKS_SPEC.find(s => s.id === specId);
        const bindingVal = buildHintBinding(specId, existingRow?.binding || '');
        sec11Lines[i] = `| \`${specId}\` | ${specObj ? specObj.title : specId} | \`${bindingVal}\` | \`PASS\` |`;
        mutated = true;
      }
    }

    const missingSpecs = ENG_CHECKS_SPEC.filter(s => !seenSpecs.has(s.id));
    if (missingSpecs.length > 0) {
      const hasAnyEngRow = seenSpecs.size > 0;
      if (!hasAnyEngRow) {
        sec11Lines.push(
          '',
          '| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |',
          '|---|---|---|---|'
        );
      }
      for (const sp of missingSpecs) {
        sec11Lines.push(`| \`${sp.id}\` | ${sp.title} | \`${buildHintBinding(sp.id)}\` | \`PASS\` |`);
      }
      mutated = true;
    }

    updatedText = `${beforeSec11}\n${sec11Lines.join('\n')}`;
  } else {
    const rows = ENG_CHECKS_SPEC.map(sp => `| \`${sp.id}\` | ${sp.title} | \`${buildHintBinding(sp.id)}\` | \`PASS\` |`).join('\n');
    updatedText = `${lines.join('\n').trimEnd()}\n\n---\n\n## 11. Gate B — Engineering Readiness Appendix (\`ENG-01..ENG-10\` — Reserved for Engineering \`.ai\`)\n\n| Field | Value |\n| :--- | :--- |\n| **Gate B Status** | \`PENDING\` |\n| **Verified \`feature_srd\`** | \`${preSrd}\` |\n\n| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |\n|---|---|---|---|\n${rows}\n`;
    mutated = true;
  }

  if (!mutated) return false;

  const postSrd = computeFeatureSrd(updatedText);
  if (postSrd !== preSrd) {
    throw new Error(`Normative integrity guard halted hint population: Sections 1-9 hash changed (${preSrd} -> ${postSrd})`);
  }

  fs.writeFileSync(filePath, updatedText, 'utf8');
  return true;
}

const resolvedBundleInfo = (populateHints || explicitBundlePath) ? resolveIntakeBundle() : null;
if (populateHints && !resolvedBundleInfo) {
  console.error('❌ [ENG-GATE] --populate-hints requested, but REVERSE_INTAKE_BUNDLE.json was not found. Run `node bin/reverse-architect.js --export-ba-intake` or pass `--auto-bind-bundle=<path>`.');
  process.exit(1);
}

// Normal Evaluation / Promotion Loop
const reports = [];
let errors = 0;

if (candidateFiles.length === 0) {
  if (isJson) {
    console.log(JSON.stringify({ mode: verifyOnly ? 'verify-only' : 'promote', scanned: 0, errors: 0, features: [] }, null, 2));
  } else {
    console.log('ℹ️ [ENG-GATE] 0 feature specs found in scope (clean baseline).');
  }
  process.exit(0);
}

for (const fp of candidateFiles) {
  let doc = parseFeatureDocument(fp, { isHubV2: hubWorkspace.isHubV2 });
  let hintsPopulated = false;
  if (populateHints && resolvedBundleInfo) {
    hintsPopulated = populateSection11HintsInFile(fp, doc, resolvedBundleInfo.bundle);
    if (hintsPopulated) {
      doc = parseFeatureDocument(fp, { isHubV2: hubWorkspace.isHubV2 });
    }
  }
  const manifestEntry = manifestMap.get(doc.id);
  const featureErrors = [];

  // 1. Normative Integrity Guard (Sections 1-9 SHA-256 vs SPRINT_<ID>_MANIFEST.md & sealed hash)
  let srdValid = true;
  if (enforceSrd && manifestEntry && manifestEntry.featureSrd) {
    const check = verifySrdMatch(doc.computedSrd, manifestEntry.featureSrd, doc.computedSrdV1);
    if (check.comparable && !check.matches) {
      srdValid = false;
      featureErrors.push(
        `NORMATIVE_SRD_DRIFT: Sections 1-9 SHA-256 (${doc.computedSrd.slice(0, 16)}...) drifted from SPRINT_${doc.sprint}_MANIFEST.md (${check.expected.slice(0, 16)}...)`
      );
    }
  }
  if (enforceSrd && doc.declaredSrd) {
    const selfCheck = verifySrdMatch(doc.computedSrd, doc.declaredSrd, doc.computedSrdV1);
    if (selfCheck.comparable && !selfCheck.matches) {
      srdValid = false;
      featureErrors.push(
        `SEALED_SRD_MISMATCH: Sections 1-9 SHA-256 (${doc.computedSrd.slice(0, 16)}...) mismatches sealed feature_srd (${selfCheck.expected.slice(0, 16)}...)`
      );
    }
  }

  // 2. Detect BLOCKED_BY_BA_GAP
  if (doc.gateB === 'BLOCKED_BY_BA_GAP') {
    const gapMatch = doc.section11.raw.match(/(?:Gap|Blocker|Reason)\s*:\s*([^\n]+)/i);
    const summary = gapMatch ? gapMatch[1].trim() : `Section 11 marked BLOCKED_BY_BA_GAP on ${doc.id}`;
    appendGapFeedback(doc, summary);
    if (!verifyOnly || featureFilter) {
      featureErrors.push(`BLOCKED_BY_BA_GAP: Logged to docs/business-context/ENGINEERING_GAP_FEEDBACK.md`);
    }
  }

  // 3. Evaluate Section 11 ENG-01..ENG-10
  const evalB = evaluateGateBChecks(doc.section11);
  const featureRawText = fs.readFileSync(fp, 'utf8');
  const elIdsInDoc = extractSection2ElIds(featureRawText);
  const eng04Binding = doc.section11?.checks?.get('ENG-04')?.binding || '';
  const hasUnexpandedEng04Placeholder = elIdsInDoc.length > 0 && /\{(?:component|element|module)\}/i.test(eng04Binding);

  if (verifyOnly) {
    // In --verify-only:
    // - Any feature claiming READY_TO_CODE (or targeted via --feature / --populate-hints) MUST have Gate A == READY_FOR_DEV, 0 open blockers, and 10/10 valid ENG-* rows
    if (doc.gateB === 'READY_TO_CODE' || Boolean(featureFilter) || populateHints) {
      if (doc.gateA !== 'READY_FOR_DEV' && doc.gateA !== 'IMPLEMENTED') {
        featureErrors.push(`GATE_A_UNSEALED: Gate A Status is '${doc.gateA}' (must be READY_FOR_DEV)`);
      }
      if (doc.openBlockers > 0) {
        featureErrors.push(`OPEN_BA_DECISIONS: Section 9.2 has ${doc.openBlockers} Open decision(s)`);
      }
      if (!doc.section11.exists) {
        featureErrors.push('MISSING_SECTION_11: Section 11 (Gate B — Engineering Readiness Appendix) is missing');
      } else if (!evalB.allValid) {
        const bad = evalB.results.filter(r => !r.valid).map(r => r.reason).join('; ');
        featureErrors.push(`INCOMPLETE_ENG_CHECKS (${evalB.passedCount}/10 PASS, ${evalB.failedCount} FAIL, ${evalB.pendingCount} PENDING): ${bad}`);
      } else if (hasUnexpandedEng04Placeholder) {
        featureErrors.push('UNEXPANDED_TESTID_PLACEHOLDER: ENG-04 contains unexpanded {component}/{element} placeholder despite Section 2 EL-* inventory');
      }
    }
  } else {
    // Promoter mode: validate Gate A + 10/10 ENG-* rows, then promote PENDING -> READY_TO_CODE
    if (doc.gateA !== 'READY_FOR_DEV' && doc.gateA !== 'IMPLEMENTED') {
      featureErrors.push(`GATE_A_UNSEALED: Cannot promote Gate B while Gate A Status is '${doc.gateA}'`);
    }
    if (doc.openBlockers > 0) {
      featureErrors.push(`OPEN_BA_DECISIONS: Cannot promote Gate B with ${doc.openBlockers} Open decision(s) in Section 9.2`);
    }
    if (!doc.section11.exists) {
      featureErrors.push('MISSING_SECTION_11: Add Section 11 with ENG-01..ENG-10 bindings before promoting');
    } else if (!evalB.allValid) {
      const bad = evalB.results.filter(r => !r.valid).map(r => r.reason).join('; ');
      featureErrors.push(`INCOMPLETE_ENG_CHECKS (${evalB.passedCount}/10 PASS, ${evalB.failedCount} FAIL, ${evalB.pendingCount} PENDING): ${bad}`);
    } else if (hasUnexpandedEng04Placeholder) {
      featureErrors.push('UNEXPANDED_TESTID_PLACEHOLDER: ENG-04 contains unexpanded {component}/{element} placeholder despite Section 2 EL-* inventory');
    }

    if (featureErrors.length === 0 && srdValid) {
      if (doc.gateB !== 'READY_TO_CODE') {
        updateSection11StatusInFile(fp, 'READY_TO_CODE', doc.computedSrd);
        syncFeaturesIndexGateB(doc.id, 'READY_TO_CODE');
        doc.gateB = 'READY_TO_CODE';
      }
    }
  }

  if (featureErrors.length > 0) errors += featureErrors.length;

  reports.push({
    id: doc.id,
    sprint: doc.sprint,
    archetype: doc.archetype,
    gateA: doc.gateA,
    gateB: doc.gateB,
    srdValid,
    featureSrd: doc.computedSrd,
    engPassed: evalB.passedCount,
    engFailed: evalB.failedCount,
    engPending: evalB.pendingCount,
    errors: featureErrors
  });
}

if (isJson) {
  console.log(JSON.stringify({
    mode: verifyOnly ? 'verify-only' : 'promote',
    scanned: reports.length,
    errors,
    status: errors === 0 ? 'PASS' : 'BLOCKED',
    features: reports
  }, null, 2));
} else {
  console.log('\n================================================================================');
  console.log(`  🛡️ TWO-GATE ENGINEERING READINESS ENGINE (v4.0.0) [${verifyOnly ? 'VERIFY-ONLY' : 'PROMOTER'}]`);
  console.log('================================================================================');
  for (const r of reports) {
    const icon = r.errors.length === 0 ? '✅' : '❌';
    console.log(`${icon} ${r.id} [${r.sprint}] | Gate A: ${r.gateA} | Gate B: ${r.gateB} | ENG: ${r.engPassed}/10 | SRD: ${r.featureSrd.slice(0, 12)}...`);
    for (const err of r.errors) {
      console.error(`   ↳ ${err}`);
    }
  }
  console.log('--------------------------------------------------------------------------------');
  console.log(`>>> VERDICT: ${errors === 0 ? 'CLEARANCE_GRANTED' : `BLOCKED (${errors} issue(s))`}`);
  console.log('================================================================================\n');
}

process.exit(errors === 0 ? 0 : 1);

