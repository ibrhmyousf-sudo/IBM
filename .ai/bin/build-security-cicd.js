#!/usr/bin/env node

/**
 * 🛡️ Stack-Aware Security CI/CD Pipeline Generator & Release Gate Auditor (v4.2.2)
 * Scaffolds hardened GitHub Actions & GitLab CI pipelines (PR Static/SCA/Compat Gate,
 * Staging Newman Offensive DAST, and GRC Evidence & Protected Manual Prod Approval Gate)
 * and audits existing CI/CD workflows via bin/lib/security/cicd-scanner.js.
 *
 * Zero external dependencies — built-in Node.js modules only.
 */

const fs = require('fs');
const path = require('path');
const { auditCicd } = require('./lib/security/cicd-scanner');

const OS_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(OS_ROOT, 'templates', 'security', 'cicd');

function parseArgs(argv) {
  const args = {
    provider: null,
    target: process.cwd(),
    audit: false,
    strict: false,
    dryRun: false,
    force: false,
    json: false
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--provider=')) args.provider = arg.slice('--provider='.length).trim().toLowerCase();
    else if (arg.startsWith('--target=')) args.target = path.resolve(arg.slice('--target='.length).trim());
    else if (arg === '--audit') args.audit = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--json') args.json = true;
  }
  return args;
}

function loadTargetStackConfig(targetRoot) {
  const candidates = [
    path.join(targetRoot, '.ai', 'stack.json'),
    path.join(targetRoot, 'stack.json'),
    path.join(OS_ROOT, 'stack.json')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'));
      } catch {}
    }
  }
  return {};
}

function detectAiPrefix(targetRoot) {
  if (
    fs.existsSync(path.join(targetRoot, '.ai', 'bin')) ||
    fs.existsSync(path.join(targetRoot, '.ai', 'stack.json'))
  ) {
    return '.ai/';
  }
  return '';
}

function renderTemplatesForStack(stackConfig, aiPrefix) {
  const stacks = stackConfig.stacks || {};
  const backend = stacks.backend || {};
  const frontend = stacks.frontend || {};
  const apiDocs = stacks.api_docs || {};
  const secProfile = stackConfig.security_profile || {};
  const cicdCfg = secProfile.cicd || {};

  const hasPhp = Boolean(backend.laravel || backend.cakephp || backend.php_native);
  const hasDotnet = Boolean(backend.dotnet);
  const hasFrontendSpa = Boolean(
    frontend.vue || frontend.nuxt || frontend.react || frontend.tanstack || frontend.angular
  );
  const hasNodeOrFrontend = Boolean(backend.node || hasFrontendSpa);
  const enforceCompat = apiDocs.json_openapi !== false && cicdCfg.enforce_api_backward_compat !== false;
  const requireManualProd = cicdCfg.require_manual_prod_approval !== false;

  // 1. Static stack audits (GitHub & GitLab)
  const ghStaticSteps = [];
  const glStaticLines = [];
  if (hasDotnet) {
    ghStaticSteps.push(
      `      - name: .NET 10 Security & EF Core Audit (SEC-158)\n        run: node ${aiPrefix}bin/dotnet-audit.js --strict`
    );
    glStaticLines.push(`    - node ${aiPrefix}bin/dotnet-audit.js --strict\n`);
  }
  if (hasFrontendSpa) {
    ghStaticSteps.push(
      `      - name: Frontend SPA Security, CSP & TestID Audit (SEC-158)\n        run: node ${aiPrefix}bin/frontend-audit.js --strict`
    );
    glStaticLines.push(`    - node ${aiPrefix}bin/frontend-audit.js --strict\n`);
  }

  // 2. SCA Dependency Gate steps (GitHub & GitLab)
  const ghScaSteps = [];
  const glScaLines = [];
  if (hasNodeOrFrontend) {
    ghScaSteps.push(
      `      - name: Setup Node.js 22\n        uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n\n      - name: Node / Frontend NPM Dependency Audit\n        run: npm ci --ignore-scripts && npm audit --omit=dev --audit-level=high`
    );
    glScaLines.push(`    - npm ci --ignore-scripts && npm audit --omit=dev --audit-level=high`);
  }
  if (hasPhp) {
    ghScaSteps.push(
      `      - name: Setup PHP 8.3\n        uses: shivammathur/setup-php@v2\n        with:\n          php-version: '8.3'\n\n      - name: Laravel / PHP Composer Dependency Audit\n        run: composer validate --strict && composer audit --locked --format=json`
    );
    glScaLines.push(`    - composer validate --strict && composer audit --locked --format=json`);
  }
  if (hasDotnet) {
    ghScaSteps.push(
      `      - name: Setup .NET 10 SDK\n        uses: actions/setup-dotnet@v4\n        with:\n          dotnet-version: '10.0.x'\n\n      - name: .NET NuGet Vulnerable Package Audit\n        run: |\n          dotnet restore --locked-mode\n          OUT=$(dotnet list package --vulnerable --include-transitive)\n          echo "$OUT"\n          if echo "$OUT" | grep -E "(Critical|High)" > /dev/null; then exit 1; fi`
    );
    glScaLines.push(
      `    - dotnet restore --locked-mode && dotnet list package --vulnerable --include-transitive`
    );
  }
  if (ghScaSteps.length === 0) {
    ghScaSteps.push(
      `      - name: Baseline NPM Dependency Audit\n        run: npm audit --omit=dev --audit-level=high`
    );
    glScaLines.push(`    - npm audit --omit=dev --audit-level=high`);
  }

  // 3. OpenAPI Backward-Compatibility Job
  let ghCompatJob = '';
  let glCompatJob = '';
  if (enforceCompat) {
    ghCompatJob = `
  api-contract-backward-compatibility:
    name: OpenAPI Backward-Compatibility & Auth-Stripping Guard (SEC-084)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository (full history)
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Compare Base vs PR OpenAPI Contracts
        env:
          BASE_REF: \${{ github.base_ref || 'main' }}
        run: |
          mkdir -p /tmp/base-openapi
          git archive "origin/\${BASE_REF}" docs/modules 2>/dev/null | tar -x -C /tmp/base-openapi || true
          if [ -d "/tmp/base-openapi/docs/modules" ]; then
            node ${aiPrefix}bin/verify-openapi-compat.js --base=/tmp/base-openapi/docs/modules --head=docs/modules --strict
          else
            node ${aiPrefix}bin/verify-openapi-compat.js --base=docs/modules --head=docs/modules --strict
          fi`;

    glCompatJob = `
openapi_backward_compat:
  stage: security-sast-sca
  image: node:22-alpine
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - node ${aiPrefix}bin/verify-openapi-compat.js --base=docs/modules --head=docs/modules --strict
`;
  }

  // 4. Protected Manual Production Approval Job
  let ghProdJob = '';
  let glProdJob = '';
  if (requireManualProd) {
    ghProdJob = `
  production-manual-approval-gate:
    name: Protected Production Manual Security & PO Sign-Off (SEC-175)
    needs: [grc-evidence-and-traceability-gate]
    runs-on: ubuntu-latest
    environment: production-security-gate
    steps:
      - name: Record Production Release Gate Sign-Off
        run: echo "Production Security Release Gate approved for \${{ github.ref_name }} (\${{ github.sha }})"`;

    glProdJob = `
production_security_signoff:
  stage: production-approval
  image: node:22-alpine
  needs:
    - grc_evidence_strict_gate
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\\d+\\.\\d+\\.\\d+$/
      when: manual
      allow_failure: false
  environment:
    name: production
    action: prepare
  script:
    - echo "Production Security Release Gate approved for $CI_COMMIT_TAG ($CI_COMMIT_SHA)"`;
  }

  const prTpl = fs.readFileSync(path.join(TEMPLATES_DIR, 'github-security-pr.yml.tpl'), 'utf8');
  const relTpl = fs.readFileSync(path.join(TEMPLATES_DIR, 'github-security-release.yml.tpl'), 'utf8');
  const glTpl = fs.readFileSync(path.join(TEMPLATES_DIR, 'gitlab-ci-security.yml.tpl'), 'utf8');

  const githubPrYml = prTpl
    .replace(/\{\{AI_PREFIX\}\}/g, aiPrefix)
    .replace('{{STATIC_STACK_AUDITS}}', ghStaticSteps.length ? '\n' + ghStaticSteps.join('\n\n') : '')
    .replace('{{SCA_STEPS_GITHUB}}', '\n' + ghScaSteps.join('\n\n'))
    .replace('{{OPENAPI_COMPAT_JOB_GITHUB}}', ghCompatJob)
    .trimEnd() + '\n';

  const githubReleaseYml = relTpl
    .replace(/\{\{AI_PREFIX\}\}/g, aiPrefix)
    .replace('{{PRODUCTION_APPROVAL_JOB_GITHUB}}', ghProdJob)
    .trimEnd() + '\n';

  const gitlabSecurityYml = glTpl
    .replace(/\{\{AI_PREFIX\}\}/g, aiPrefix)
    .replace('{{STATIC_STACK_AUDITS_GITLAB}}', glStaticLines.join(''))
    .replace('{{SCA_SCRIPTS_GITLAB}}', glScaLines.join('\n') + '\n')
    .replace('{{OPENAPI_COMPAT_JOB_GITLAB}}', glCompatJob)
    .replace('{{PRODUCTION_APPROVAL_JOB_GITLAB}}', glProdJob)
    .trimEnd() + '\n';

  const gitlabRootYml = `# InnovaDigits AI Engineering OS v4.2.2 — Root GitLab CI Configuration
stages:
  - security-sast-sca
  - staging-dast
  - grc-release-gate
  - production-approval

include:
  - local: '.gitlab/ci/security-gates.gitlab-ci.yml'
`;

  return {
    githubPrYml,
    githubReleaseYml,
    gitlabSecurityYml,
    gitlabRootYml,
    activeStacks: {
      php: hasPhp,
      dotnet: hasDotnet,
      nodeOrFrontend: hasNodeOrFrontend,
      frontendSpa: hasFrontendSpa,
      openapiCompat: enforceCompat,
      manualProdApproval: requireManualProd
    }
  };
}

function buildSecurityCicd(options = {}) {
  const targetRoot = path.resolve(options.target || process.cwd());
  const stackConfig = loadTargetStackConfig(targetRoot);
  const defaultProvider =
    (stackConfig.security_profile &&
      stackConfig.security_profile.cicd &&
      stackConfig.security_profile.cicd.provider) ||
    'github';
  const provider = (options.provider || defaultProvider).toLowerCase();

  if (!['github', 'gitlab', 'both'].includes(provider)) {
    throw new Error(`Invalid --provider=${provider}. Expected github, gitlab, or both.`);
  }

  const aiPrefix = detectAiPrefix(targetRoot);
  const rendered = renderTemplatesForStack(stackConfig, aiPrefix);
  const plannedFiles = [];

  if (provider === 'github' || provider === 'both') {
    plannedFiles.push({
      relPath: '.github/workflows/security-pr-gate.yml',
      absPath: path.join(targetRoot, '.github', 'workflows', 'security-pr-gate.yml'),
      content: rendered.githubPrYml
    });
    plannedFiles.push({
      relPath: '.github/workflows/security-release-gate.yml',
      absPath: path.join(targetRoot, '.github', 'workflows', 'security-release-gate.yml'),
      content: rendered.githubReleaseYml
    });
  }

  if (provider === 'gitlab' || provider === 'both') {
    plannedFiles.push({
      relPath: '.gitlab/ci/security-gates.gitlab-ci.yml',
      absPath: path.join(targetRoot, '.gitlab', 'ci', 'security-gates.gitlab-ci.yml'),
      content: rendered.gitlabSecurityYml
    });
    plannedFiles.push({
      relPath: '.gitlab-ci.yml',
      absPath: path.join(targetRoot, '.gitlab-ci.yml'),
      content: rendered.gitlabRootYml
    });
  }

  const writtenFiles = [];
  const skippedFiles = [];

  if (!options.dryRun) {
    for (const pf of plannedFiles) {
      if (fs.existsSync(pf.absPath) && !options.force) {
        skippedFiles.push(pf.relPath);
        continue;
      }
      fs.mkdirSync(path.dirname(pf.absPath), { recursive: true });
      fs.writeFileSync(pf.absPath, pf.content, 'utf8');
      writtenFiles.push(pf.relPath);
    }
  }

  return {
    provider,
    target: targetRoot,
    ai_prefix: aiPrefix,
    dry_run: Boolean(options.dryRun),
    active_stacks: rendered.activeStacks,
    planned_files: plannedFiles.map((f) => f.relPath),
    written_files: writtenFiles,
    skipped_files: skippedFiles
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv);

  if (args.audit) {
    const stackConfig = loadTargetStackConfig(args.target);
    const report = auditCicd(args.target, { stackConfig });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`🛡️  CI/CD Security Pipeline Audit (v4.2.2): ${report.status}`);
      console.log(`   Scanned Workflows (${report.scanned_files.length}): ${report.scanned_files.join(', ') || 'none'}`);
      console.log(`   Findings: Critical=${report.counts.critical}, High=${report.counts.high}, Medium=${report.counts.medium}`);
      for (const f of report.findings) {
        console.log(`   - [${f.rule}] (${f.severity}) ${f.file}: ${f.message}`);
      }
    }
    if (args.strict && (report.counts.critical > 0 || report.counts.high > 0)) {
      process.exit(1);
    }
    process.exit(0);
  }

  const res = buildSecurityCicd(args);
  if (args.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`🛡️  Security CI/CD Pipeline Generator (v4.2.2) — Provider: ${res.provider}`);
    console.log(`   Active Stack Gates: PHP=${res.active_stacks.php}, .NET=${res.active_stacks.dotnet}, Node/SPA=${res.active_stacks.nodeOrFrontend}, OpenAPI-Compat=${res.active_stacks.openapiCompat}`);
    if (res.dry_run) {
      console.log(`   [DRY-RUN] Planned files (${res.planned_files.length}): ${res.planned_files.join(', ')}`);
    } else {
      console.log(`   Written files (${res.written_files.length}): ${res.written_files.join(', ') || 'none'}`);
      if (res.skipped_files.length > 0) {
        console.log(`   Skipped existing files (${res.skipped_files.length}): ${res.skipped_files.join(', ')} (pass --force to overwrite)`);
      }
    }
  }
}

module.exports = {
  buildSecurityCicd,
  renderTemplatesForStack
};

