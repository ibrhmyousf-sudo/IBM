#!/usr/bin/env node

/**
 * Frontend security & standards audit (v3.9.3).
 * Usage:
 *   node bin/frontend-audit.js [path] [--json] [--strict]
 * --strict exits 1 on any CRITICAL or HIGH finding (CI gate).
 */

const path = require('path');
const { findFrontendRoots, auditFrontend } = require('./lib/frontend-scanner.js');

const args = process.argv.slice(2);
const target = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
const asJson = args.includes('--json');
const strict = args.includes('--strict');

const roots = findFrontendRoots(target);
if (roots.length === 0) {
  console.log(`ℹ️ Not a frontend project (no package.json with react/vue/nuxt/angular/svelte/next within 2 levels of ${target}). Nothing to audit.`);
  process.exit(0);
}

const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const findings = [];
for (const r of roots) {
  for (const f of auditFrontend(r)) findings.push({ ...f, project: path.relative(target, r) || '.' });
}
findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

if (asJson) {
  console.log(JSON.stringify({ target, projects: roots, findings }, null, 2));
} else {
  console.log(`\nFRONTEND AUDIT — ${roots.join(', ')}`);
  console.log('-'.repeat(80));
  if (findings.length === 0) console.log('No findings.');
  for (const f of findings) {
    console.log(`[${f.severity}] ${f.id} ${f.category}`);
    console.log(`   at   ${f.location}`);
    console.log(`   risk ${f.threat}`);
    console.log(`   fix  ${f.remediation}`);
  }
  const count = (s) => findings.filter((f) => f.severity === s).length;
  console.log('-'.repeat(80));
  console.log(`CRITICAL ${count('CRITICAL')} | HIGH ${count('HIGH')} | MEDIUM ${count('MEDIUM')} | LOW ${count('LOW')}`);
}

const blocking = findings.some((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
process.exit(strict && blocking ? 1 : 0);

