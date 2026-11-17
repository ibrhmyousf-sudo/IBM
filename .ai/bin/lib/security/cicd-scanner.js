/**
 * 🛡️ DevSecOps CI/CD Pipeline Hardening & Release Gate Scanner (v4.2.2)
 * Audits .github/workflows/*.{yml,yaml} and .gitlab-ci.yml / .gitlab/ci/*.{yml,yaml}
 * against CICD-S01..CICD-S05 (mapped to SEC-139, SEC-158..161, SEC-171, SEC-175).
 *
 * Zero external dependencies — built-in Node.js modules only.
 */

const fs = require('fs');
const path = require('path');

function collectCicdFiles(targetRoot) {
  const githubFiles = [];
  const gitlabFiles = [];

  const ghDir = path.join(targetRoot, '.github', 'workflows');
  if (fs.existsSync(ghDir)) {
    for (const entry of fs.readdirSync(ghDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(yml|yaml)$/i.test(entry.name)) {
        githubFiles.push(path.join(ghDir, entry.name));
      }
    }
  }

  const rootGitlab = path.join(targetRoot, '.gitlab-ci.yml');
  if (fs.existsSync(rootGitlab) && fs.statSync(rootGitlab).isFile()) {
    gitlabFiles.push(rootGitlab);
  }
  const rootGitlabYaml = path.join(targetRoot, '.gitlab-ci.yaml');
  if (fs.existsSync(rootGitlabYaml) && fs.statSync(rootGitlabYaml).isFile()) {
    gitlabFiles.push(rootGitlabYaml);
  }

  const glDir = path.join(targetRoot, '.gitlab', 'ci');
  if (fs.existsSync(glDir)) {
    for (const entry of fs.readdirSync(glDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(yml|yaml)$/i.test(entry.name)) {
        gitlabFiles.push(path.join(glDir, entry.name));
      }
    }
  }

  return {
    githubFiles: githubFiles.sort(),
    gitlabFiles: gitlabFiles.sort(),
    allFiles: [...githubFiles.sort(), ...gitlabFiles.sort()]
  };
}

function makeFinding({ rule, severity, controlIds, file, line, title, message, remediation }) {
  return {
    rule,
    ruleId: rule,
    scanner: 'cicd-scanner',
    severity,
    controlIds,
    control_ids: controlIds,
    file,
    line: line || 1,
    title,
    description: message,
    message,
    remediation
  };
}

function auditCicd(targetRoot, options = {}) {
  const { githubFiles, gitlabFiles, allFiles } = collectCicdFiles(targetRoot);
  const findings = [];

  const fileContents = allFiles.map((f) => ({
    file: f,
    relFile: path.relative(targetRoot, f).replace(/\\/g, '/'),
    content: fs.readFileSync(f, 'utf8')
  }));

  const combinedText = fileContents.map((fc) => fc.content).join('\n');

  // Check if any workflow executes PR/MR SAST security checks
  const hasPrTrigger = /pull_request\b|merge_request_event\b/i.test(combinedText);
  const hasStaticSecGate = /security-fuzzer\.js|pentest-suite\.js|sast_and_secret_gate|static-security-and-secret-gate/i.test(combinedText);

  if (allFiles.length === 0 || !hasPrTrigger || !hasStaticSecGate) {
    findings.push(makeFinding({
      rule: 'CICD-S01',
      severity: 'HIGH',
      controlIds: ['SEC-139', 'SEC-158'],
      file: fileContents[0] ? fileContents[0].relFile : '.github/workflows/security-pr-gate.yml',
      line: 1,
      title: 'Missing PR/MR Static Security & Secret Gate Workflow',
      message: 'No CI/CD workflow file detected in .github/workflows/ or .gitlab-ci.yml executing deterministic SAST/security-fuzzer/pentest-suite checks on Pull/Merge Requests.',
      remediation: 'Run `node bin/build-security-cicd.js` to scaffold hardened PR/MR security gates.'
    }));
  }

  // Per-file checks for CICD-S02 and CICD-S03
  for (const fc of fileContents) {
    const isGitHub = fc.relFile.startsWith('.github/workflows/');
    const lines = fc.content.split(/\r?\n/);

    // CICD-S02: pull_request_target + untrusted checkout, permissions: write-all, or secret echoing
    const hasPrTarget = /^\s*pull_request_target\s*:/m.test(fc.content) || /\bon\s*:[^\n]*pull_request_target\b/m.test(fc.content);
    const hasUntrustedCheckout = /github\.event\.pull_request\.head\.(sha|ref)|actions\/checkout/i.test(fc.content);
    const hasWriteAll = /permissions\s*:\s*write-all\b/i.test(fc.content) || /contents\s*:\s*write\b[\s\S]{0,80}pull_request_target/i.test(fc.content);
    const hasSecretEcho = /\becho\b[^\n]*\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}/i.test(fc.content);

    if ((hasPrTarget && hasUntrustedCheckout) || hasWriteAll || hasSecretEcho) {
      const reasons = [];
      if (hasPrTarget && hasUntrustedCheckout) reasons.push('dangerous `pull_request_target` with checkout of untrusted PR head');
      if (hasWriteAll) reasons.push('overly permissive `permissions: write-all`');
      if (hasSecretEcho) reasons.push('direct secret echoing in `run:` block');
      const lineIdx = lines.findIndex((l) => /pull_request_target|write-all|secrets\./.test(l));
      findings.push(makeFinding({
        rule: 'CICD-S02',
        severity: 'CRITICAL',
        controlIds: ['SEC-139', 'SEC-160'],
        file: fc.relFile,
        line: lineIdx >= 0 ? lineIdx + 1 : 1,
        title: 'Critical CI/CD Pipeline Injection / Privilege Escalation Risk',
        message: `Workflow '${fc.relFile}' contains critical CI/CD vulnerability: ${reasons.join('; ')}.`,
        remediation: 'Replace `pull_request_target` with `pull_request`, set explicit least-privilege `permissions: { contents: read }`, and never echo secrets.'
      }));
    }

    if (isGitHub) {
      const hasExplicitPermissions = /^permissions\s*:/m.test(fc.content);
      const mutableActionMatch = fc.content.match(/uses\s*:\s*([^\s#]+@(?:main|master))\b/i);
      if (!hasExplicitPermissions || mutableActionMatch) {
        const reasons = [];
        if (!hasExplicitPermissions) reasons.push('omits explicit top-level `permissions:` block');
        if (mutableActionMatch) reasons.push(`uses mutable branch reference '${mutableActionMatch[1]}' on third-party action`);
        const lineIdx = mutableActionMatch ? lines.findIndex((l) => l.includes(mutableActionMatch[1])) : 0;
        findings.push(makeFinding({
          rule: 'CICD-S03',
          severity: 'MEDIUM',
          controlIds: ['SEC-139'],
          file: fc.relFile,
          line: lineIdx >= 0 ? lineIdx + 1 : 1,
          title: 'Missing Least-Privilege Token Permissions or Unpinned Action Ref',
          message: `GitHub Actions workflow '${fc.relFile}' ${reasons.join(' and ')}.`,
          remediation: 'Declare top-level `permissions: { contents: read }` and pin third-party actions to immutable release tags (e.g. `@v4`) or commit SHAs.'
        }));
      }
    }
  }

  // CICD-S04: Dynamic Newman DAST & SCA dependency checks
  const hasDast = /\bnewman\b|pentest_abuse\.postman_collection\.json/i.test(combinedText);
  const hasSca = /\bnpm\s+audit\b|\bcomposer\s+audit\b|\bdotnet\s+list\s+package\s+--vulnerable\b/i.test(combinedText);

  if (!hasDast || !hasSca) {
    const missing = [];
    if (!hasDast) missing.push('Dynamic Newman DAST runner (`pentest_abuse.postman_collection.json`)');
    if (!hasSca) missing.push('SCA dependency vulnerability audit (`npm audit` / `composer audit` / `dotnet list package --vulnerable`)');
    findings.push(makeFinding({
      rule: 'CICD-S04',
      severity: 'HIGH',
      controlIds: ['SEC-159', 'SEC-161'],
      file: fileContents[0] ? fileContents[0].relFile : '.github/workflows/security-release-gate.yml',
      line: 1,
      title: 'Missing Staging Newman DAST or SCA Dependency Vulnerability Gate',
      message: `CI/CD pipeline is missing required security gates: ${missing.join(' and ')}.`,
      remediation: 'Include SCA dependency vulnerability checks on PRs and Newman offensive DAST execution against Staging prior to release.'
    }));
  }

  // CICD-S05: Strict GRC evidence verification + Protected Manual Production Approval Gate
  const hasGrcEvidenceGate = /--evidence-manifest[=\s]+[^\s]*evidence-manifest\.json[^\n]*--strict|--strict[^\n]*--evidence-manifest/i.test(combinedText);
  const hasManualProdGate = /environment\s*:\s*(?:production-security-gate|production\b)|when\s*:\s*manual[\s\S]{0,160}allow_failure\s*:\s*false|allow_failure\s*:\s*false[\s\S]{0,160}when\s*:\s*manual/i.test(combinedText);

  if (!hasGrcEvidenceGate || !hasManualProdGate) {
    const missing = [];
    if (!hasGrcEvidenceGate) missing.push('strict GRC evidence verification (`--evidence-manifest=docs/security/evidence-manifest.json --strict`)');
    if (!hasManualProdGate) missing.push('protected manual production approval gate (`environment: production-security-gate` or `when: manual` + `allow_failure: false`)');
    findings.push(makeFinding({
      rule: 'CICD-S05',
      severity: 'HIGH',
      controlIds: ['SEC-171', 'SEC-175'],
      file: fileContents[0] ? fileContents[0].relFile : '.github/workflows/security-release-gate.yml',
      line: 1,
      title: 'Missing Strict GRC Evidence Gate or Protected Manual Production Approval',
      message: `Release pipeline lacks ${missing.join(' and ')}.`,
      remediation: 'Enforce `pentest-suite.js --evidence-manifest=docs/security/evidence-manifest.json --strict` and a mandatory manual production approval environment.'
    }));
  }

  const counts = {
    critical: findings.filter((f) => f.severity === 'CRITICAL').length,
    high: findings.filter((f) => f.severity === 'HIGH').length,
    medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    low: findings.filter((f) => f.severity === 'LOW').length,
    total: findings.length
  };

  return {
    status: counts.critical > 0 || counts.high > 0 ? 'FAIL' : (counts.medium > 0 ? 'WARN' : 'PASS'),
    scanned_files: fileContents.map((fc) => fc.relFile),
    github_workflows: githubFiles.length,
    gitlab_workflows: gitlabFiles.length,
    counts,
    findings
  };
}

module.exports = {
  auditCicd,
  collectCicdFiles
};

