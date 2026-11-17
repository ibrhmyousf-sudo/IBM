#!/usr/bin/env node

/**
 * InnovaDigits Autonomous Skills Registry Validator (v3.9.3)
 * Scans .ai/skills/ to verify autonomous skill definitions for syntax,
 * frontmatter metadata, and verification checklist compliance.
 *
 * Usage:
 *   node bin/verify-skills.js
 *   node bin/verify-skills.js --json
 */

const fs = require('fs');
const path = require('path');

let pkgVersion = '3.9.4';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (pkg.version) pkgVersion = pkg.version;
} catch (e) {}

// 1. Resolve Project Root & Skills Directory
const cwd = process.cwd();
const candidateDirs = [
  path.join(cwd, '.ai', 'skills'),
  path.join(cwd, 'skills'),
  path.join(__dirname, '..', '.ai', 'skills'),
  path.join(__dirname, '..', 'skills')
];

let skillsDir = candidateDirs.find(d => fs.existsSync(d));

if (!skillsDir) {
  // If .ai/skills doesn't exist, try resolving from project root
  const root = path.basename(cwd) === '.ai' ? path.dirname(cwd) : cwd;
  skillsDir = path.join(root, '.ai', 'skills');
}

const REQUIRED_SKILLS = [
  { id: 'db-architect', file: 'db-architect.md', name: 'Database Architect' },
  { id: 'security-sentinel', file: 'security-sentinel.md', name: 'Security Sentinel' },
  { id: 'mobile-bridge', file: 'mobile-bridge.md', name: 'Mobile Bridge' },
  { id: 'zero-cross-audit', file: 'zero-cross-audit.md', name: 'Zero-Cross Audit' },
  { id: 'ipdpl-guardian', file: 'ipdpl-guardian.md', name: 'IPDPL Guardian' },
  { id: 'security-fuzzing', file: 'security-fuzzing.md', name: 'Security Fuzzing' },
  { id: 'perf-predictor', file: 'perf-predictor.md', name: 'Performance Predictor' },
  { id: 'legacy-modernizer', file: 'legacy-modernizer.md', name: 'Legacy Modernizer' }
];


const jsonOutput = process.argv.includes('--json');

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return null;
  
  const rawYaml = content.slice(3, endIndex).trim();
  const meta = {};
  const lines = rawYaml.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ') && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(trimmed.slice(2).trim());
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      currentKey = key;
      if (val === '') {
        meta[key] = [];
      } else {
        meta[key] = val;
      }
    }
  }

  return meta;
}

function validateSkillFile(skillMeta, fullPath) {
  const result = {
    id: skillMeta.id,
    name: skillMeta.name,
    file: skillMeta.file,
    path: fullPath,
    exists: false,
    validSyntax: false,
    version: null,
    triggersCount: 0,
    sectionsCount: 0,
    hasChecklist: false,
    errors: []
  };

  if (!fs.existsSync(fullPath)) {
    result.errors.push(`File missing: ${fullPath}`);
    return result;
  }

  result.exists = true;
  const content = fs.readFileSync(fullPath, 'utf8');

  // Validate Frontmatter
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    result.errors.push('Missing or malformed YAML frontmatter block (---)');
  } else {
    result.version = frontmatter.version || 'unknown';
    if (!frontmatter.name) {
      result.errors.push('Frontmatter missing "name" attribute');
    }
    if (!frontmatter.version) {
      result.errors.push('Frontmatter missing "version" attribute');
    }
    if (!frontmatter.description) {
      result.errors.push('Frontmatter missing "description" attribute');
    }
    if (Array.isArray(frontmatter.triggers)) {
      result.triggersCount = frontmatter.triggers.length;
      if (result.triggersCount === 0) {
        result.errors.push('Frontmatter "triggers" list is empty');
      }
    } else {
      result.errors.push('Frontmatter missing "triggers" array');
    }
  }

  // Validate Markdown Headings
  const headings = content.match(/^##\s+.+$/gm) || [];
  result.sectionsCount = headings.length;
  if (result.sectionsCount < 3) {
    result.errors.push(`Insufficient content sections (found ${result.sectionsCount}, expected at least 3)`);
  }

  // Validate Verification Checklist
  if (content.includes('Verification Checklist') || content.includes('| Check ID |')) {
    result.hasChecklist = true;
  } else {
    result.errors.push('Missing standardized Verification Checklist table');
  }

  result.validSyntax = result.errors.length === 0;
  return result;
}

// Execute Scan
const report = {
  timestamp: new Date().toISOString(),
  skills_dir: skillsDir,
  total_required: REQUIRED_SKILLS.length,
  total_passed: 0,
  all_passed: false,
  results: []
};

for (const skill of REQUIRED_SKILLS) {
  const targetPath = path.join(skillsDir, skill.file);
  const res = validateSkillFile(skill, targetPath);
  if (res.validSyntax) {
    report.total_passed++;
  }
  report.results.push(res);
}

report.all_passed = report.total_passed === report.total_required;

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.all_passed ? 0 : 1);
}

// Console Table Output
console.log('');
console.log('================================================================================');
console.log(`       INNOVADIGITS AUTONOMOUS SKILLS REGISTRY VALIDATOR (v${pkgVersion})              `);
console.log('================================================================================');
console.log(`Skills Directory : ${skillsDir}`);
console.log(`Timestamp        : ${report.timestamp}`);
console.log('--------------------------------------------------------------------------------');
console.log('| Status | Skill ID          | Version | Sections | Triggers | Checklist |');
console.log('|:-------|:------------------|:--------|:---------|:---------|:----------|');

for (const r of report.results) {
  const statusBadge = r.validSyntax ? '  PASS ' : '  FAIL ';
  const idPad = r.id.padEnd(17, ' ');
  const verPad = (r.version || 'N/A').padEnd(7, ' ');
  const secPad = String(r.sectionsCount).padStart(8, ' ');
  const trigPad = String(r.triggersCount).padStart(8, ' ');
  const checkPad = (r.hasChecklist ? ' YES ' : ' NO  ').padStart(9, ' ');
  console.log(`| ${statusBadge}| ${idPad} | ${verPad} | ${secPad} | ${trigPad} | ${checkPad} |`);

  if (r.errors.length > 0) {
    for (const err of r.errors) {
      console.log(`|   -> ERROR: ${err}`);
    }
  }
}

console.log('--------------------------------------------------------------------------------');

if (report.all_passed) {
  console.log(`>>> REGISTRY HEALTH: HEALTHY (${report.total_passed}/${report.total_required} Skills Validated)`);
  console.log('================================================================================\n');
  process.exit(0);
} else {
  console.error(`>>> REGISTRY HEALTH: UNHEALTHY (${report.total_passed}/${report.total_required} Passed)`);
  console.log('================================================================================\n');
  process.exit(1);
}
