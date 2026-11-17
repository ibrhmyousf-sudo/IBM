#!/usr/bin/env node

/**
 * .NET security & standards audit (v3.9.3).
 * Usage:
 *   node bin/dotnet-audit.js [projectPath] [--json] [--strict]
 * --strict exits 1 when any CRITICAL or HIGH finding exists (CI gate).
 */

const path = require('path');
const { isDotNetProject, auditDotNet } = require('./lib/dotnet-scanner.js');

const args = process.argv.slice(2);
const target = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
const asJson = args.includes('--json');
const strict = args.includes('--strict');

if (!isDotNetProject(target)) {
  console.log(`ℹ️ Not a .NET project (no .csproj/.sln/.slnx within 3 levels of ${target}). Nothing to audit.`);
  process.exit(0);
}

const findings = auditDotNet(target);
const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

if (asJson) {
  console.log(JSON.stringify({ target, findings }, null, 2));
} else {
  console.log(`\n.NET AUDIT — ${target}`);
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

