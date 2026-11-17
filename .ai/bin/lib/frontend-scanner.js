/**
 * Frontend deterministic audit (v4.2.0).
 * Static checks for React / Vue / Nuxt / Angular SPAs (FE-S01..S13, FE-Q01..Q02).
 * Used by bin/frontend-audit.js, bin/security-fuzzer.js, and bin/pentest-suite.js.
 * Nothing is built or executed.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.output', '.nuxt', '.next', '.vinxi', '.tanstack',
  '.nitro', 'coverage', 'bin', 'obj', '.angular', '.cache', 'diagram-files', 'public',
  '.ai', '.agents', '.cursor', '.github', 'sdk', 'docs', 'hooks', 'skills', 'rules',
  'templates', 'extensions', 'presets', 'telemetry', 'specs', 'context', 'vendor', 'storage'
]);
const UI_DEPS = /^(react|vue|nuxt|@angular\/core|@tanstack\/react-start|svelte|next)$/;

const FE_RULE_META = {
  'FE-S01': { controlIds: ['SEC-030', 'SEC-032'], owaspCategory: 'OWASP ASVS V3.4 / A07:2021', ncaClause: 'NCA ECC 2-2' },
  'FE-S02': { controlIds: ['SEC-019'], owaspCategory: 'OWASP API2:2023 / API9:2023', ncaClause: 'NCA ECC 2-2' },
  'FE-S03': { controlIds: ['SEC-018', 'SEC-097', 'SEC-131', 'SEC-160'], owaspCategory: 'OWASP ASVS V2.10', ncaClause: 'NCA ECC 2-8' },
  'FE-S04': { controlIds: ['SEC-089', 'SEC-090'], owaspCategory: 'OWASP ASVS V14.4', ncaClause: 'NCA ECC 2-5' },
  'FE-S05': { controlIds: ['SEC-089'], owaspCategory: 'OWASP A08:2021 / ASVS V14.4', ncaClause: 'NCA ECC 2-5 / PDPL' },
  'FE-S06': { controlIds: ['SEC-056', 'SEC-068'], owaspCategory: 'OWASP A03:2021 / ASVS V5.3', ncaClause: 'NCA ECC 1-6' },
  'FE-S07': { controlIds: ['SEC-091'], owaspCategory: 'OWASP ASVS V9.1', ncaClause: 'NCA ECC 2-8 / NCS' },
  'FE-S08': { controlIds: ['SEC-017'], owaspCategory: 'OWASP ASVS V4.1 / A01:2021', ncaClause: 'NCA ECC 2-2' },
  'FE-S09': { controlIds: ['SEC-018', 'SEC-097', 'SEC-160'], owaspCategory: 'OWASP ASVS V2.10 / API2:2023', ncaClause: 'NCA ECC 2-2 / 2-8' },
  'FE-S10': { controlIds: ['SEC-056', 'SEC-068', 'SEC-089', 'SEC-120'], owaspCategory: 'OWASP A03:2021 / ASVS V5.3', ncaClause: 'NCA ECC 1-6' },
  'FE-S11': { controlIds: ['SEC-088', 'SEC-091'], owaspCategory: 'OWASP ASVS V9.1 / V14.4', ncaClause: 'NCA ECC 2-8 / 2-15 / NCS' },
  'FE-S12': { controlIds: ['SEC-088', 'SEC-092', 'SEC-094'], owaspCategory: 'OWASP ASVS V14.4 / V8.2', ncaClause: 'NCA ECC 2-5 / 2-7' },
  'FE-S13': { controlIds: ['SEC-095'], owaspCategory: 'OWASP ASVS V14.2', ncaClause: 'NCA ECC 1-6' },
  'FE-Q01': { controlIds: [], owaspCategory: 'QA Testability (Rule 006)', ncaClause: 'NCA ECC 1-6' },
  'FE-Q02': { controlIds: ['SEC-007', 'SEC-139'], owaspCategory: 'OWASP ASVS V1.14', ncaClause: 'NCA ECC 1-6' }
};

function read(p) { try { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; } }
function rel(root, p) { return path.relative(root, p).replace(/\\/g, '/'); }
function lineOf(content, index) { return content.slice(0, Math.max(0, index)).split('\n').length; }

function walk(dir, cb, depth = 0, maxDepth = 12) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, cb, depth + 1, maxDepth);
    else if (e.isFile()) cb(full);
  }
}

/** Folders (depth <= 2) whose package.json depends on a UI framework or contain .vue/.tsx SPA sources. */
function findFrontendRoots(root) {
  const roots = [];
  const probe = (dir, depth) => {
    const r = rel(root, dir);
    if (r === '.ai' || r.startsWith('.ai/') || r === 'docs/sdk' || r.startsWith('docs/sdk/')) {
      return;
    }
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(read(pkgPath));
        const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
        if (deps.some((d) => UI_DEPS.test(d))) { roots.push(dir); return; }
      } catch { /* ignore */ }
    }
    if (depth >= 2) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) probe(path.join(dir, e.name), depth + 1);
    }
  };
  probe(root, 0);

  if (roots.length === 0) {
    // Fallback for lightweight SPA repos/fixtures containing .vue / .tsx / vite.config / nuxt.config
    let hasSpaFiles = false;
    walk(root, (f) => {
      if (hasSpaFiles) return;
      if (/\.(vue|tsx|jsx)$/.test(f) || /^(vite|nuxt)\.config\.[jt]s$/.test(path.basename(f))) {
        hasSpaFiles = true;
      }
    }, 0, 4);
    if (hasSpaFiles) roots.push(root);
  }

  return roots;
}

function isTracked(root, file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], { cwd: root, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

/**
 * @returns {Array<{id,ruleId,controlIds,severity,category,owaspCategory,ncaClause,target,location,threat,remediation}>}
 */
function auditFrontend(root) {
  const findings = [];
  const add = (id, severity, category, target, location, threat, remediation, customControls = null) => {
    const meta = FE_RULE_META[id] || { controlIds: ['SEC-088'], owaspCategory: 'OWASP ASVS 5.0', ncaClause: 'NCA ECC 1-6' };
    findings.push({
      id,
      ruleId: id,
      controlIds: customControls || meta.controlIds,
      severity,
      category,
      owaspCategory: meta.owaspCategory,
      ncaClause: meta.ncaClause,
      target,
      location,
      threat,
      remediation
    });
  };

  const srcFiles = [];
  const envFiles = [];
  const headerConfigs = [];
  const buildConfigs = [];
  const ciFiles = [];
  walk(root, (f) => {
    const base = path.basename(f);
    const r = rel(root, f);
    if (/\.(tsx?|jsx?|vue|html)$/.test(base) && !/\.(test|spec)\.[jt]sx?$/.test(base) && !/\.d\.ts$/.test(base)) srcFiles.push(f);
    if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample)$/.test(base)) envFiles.push(f);
    if (/^(web\.config|\.htaccess|_headers|vercel\.json|netlify\.toml|staticwebapp\.config\.json|nginx.*\.conf|Caddyfile)$/i.test(base)) headerConfigs.push(f);
    if (/^(vite\.config\.[jt]s|nuxt\.config\.[jt]s|tsconfig\.json|webpack\.config\.js)$/i.test(base)) buildConfigs.push(f);
    if (/^(azure-pipelines\.ya?ml|\.gitlab-ci\.ya?ml|Jenkinsfile|bitbucket-pipelines\.yml)$/.test(base) || /^\.github\/workflows\//.test(r)) ciFiles.push(f);
  });
  for (const name of ['web.config', '_headers', 'staticwebapp.config.json']) {
    const p = path.join(root, 'public', name);
    if (fs.existsSync(p)) headerConfigs.push(p);
  }
  const wf = path.join(root, '.github', 'workflows');
  if (fs.existsSync(wf)) {
    try {
      for (const f of fs.readdirSync(wf)) ciFiles.push(path.join(wf, f));
    } catch {}
  }

  // FE-S01 token in web storage
  const tokenHits = [];
  for (const f of srcFiles) {
    const c = read(f);
    if (!/(localStorage|sessionStorage)/.test(c)) continue;
    const tokenConsts = new Set();
    for (const m of c.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*["'`]([^"'`]*)["'`]/g)) {
      if (/token|jwt|bearer|auth|session/i.test(m[2])) tokenConsts.add(m[1]);
    }
    for (const m of c.matchAll(/(?:localStorage|sessionStorage)\.(setItem|getItem)\(\s*(["'`][^"'`]*["'`]|\w+)/g)) {
      const key = m[2];
      const lit = /^["'`]/.test(key) ? key.slice(1, -1) : null;
      if ((lit && /token|jwt|bearer|auth|session/i.test(lit)) || (!lit && tokenConsts.has(key))) {
        tokenHits.push(`${rel(root, f)}:${lineOf(c, m.index)}`);
      }
    }
  }
  if (tokenHits.length) {
    add('FE-S01', 'HIGH', 'Token In Web Storage', 'localStorage/sessionStorage', tokenHits[0],
      `Authentication token is read/written in web storage (${tokenHits.length} site(s)). Any XSS can steal it.`,
      'Prefer an HttpOnly, Secure, SameSite cookie set by the API (or the BFF pattern). If a bearer token is unavoidable, keep it in memory, use short lifetimes, and enforce a strict CSP.');
  }

  // FE-S02 template Identity endpoints
  const tplHits = [];
  for (const f of srcFiles) {
    const c = read(f);
    for (const m of c.matchAll(/\/api\/Users\/(login|register|refresh|forgotPassword|resetPassword)|\/identity\/(login|register)|useCookies=true/g)) {
      tplHits.push(`${rel(root, f)}:${lineOf(c, m.index)}`);
    }
  }
  if (tplHits.length) {
    add('FE-S02', 'HIGH', 'Template Identity Endpoint', 'API client', tplHits[0],
      'The client signs in through the framework template Identity endpoints instead of the application login (no per-IP limit, lockout or audit).',
      'Call the application login endpoint only (for .NET: `/api/Auth/login`), and retire the template routes on the server (NET-S10).');
  }

  // FE-S03 secrets in public env
  const publicSecret = /\b((?:VITE|REACT_APP|NEXT_PUBLIC|NUXT_PUBLIC)_\w*(?:PASSWORD|SECRET|PRIVATE|API_?KEY|TOKEN|USER(?:NAME)?))\b/g;
  const secretSrc = [];
  for (const f of srcFiles) {
    const c = read(f);
    for (const m of c.matchAll(publicSecret)) secretSrc.push(`${rel(root, f)}:${lineOf(c, m.index)} (${m[1]})`);
  }
  const trackedEnvSecrets = [];
  for (const f of envFiles) {
    const r = rel(root, f);
    const c = read(f);
    const tracked = isTracked(root, r);
    for (const m of c.matchAll(/^\s*((?:VITE|REACT_APP|NEXT_PUBLIC|NUXT_PUBLIC)_\w*(?:PASSWORD|SECRET|PRIVATE|API_?KEY|TOKEN)\w*)\s*=\s*(.+)$/gm)) {
      if (tracked && m[2].trim() && !/^["']?<.*>["']?$/.test(m[2].trim())) trackedEnvSecrets.push(`${r} (${m[1]})`);
    }
    for (const m of c.matchAll(/^\s*\w*URL\w*\s*=\s*["']?(http:\/\/(?!localhost|127\.0\.0\.1)[^\s"']+|https?:\/\/\d{1,3}(?:\.\d{1,3}){3}[^\s"']*)/gm)) {
      add('FE-S07', m[1].startsWith('http://') ? 'MEDIUM' : 'LOW', 'Environment-Specific Endpoint', r, `${r}:${lineOf(c, m.index)}`,
        m[1].startsWith('http://') ? 'API base URL uses cleartext HTTP.' : 'API base URL is a raw IP address (certificate name mismatch, environment coupling).',
        'Use a DNS name over HTTPS and inject the value per environment at build/deploy time.');
    }
  }
  if (trackedEnvSecrets.length) {
    add('FE-S03', 'CRITICAL', 'Secret In Public Bundle Config', 'env files', trackedEnvSecrets[0],
      'A secret-like `VITE_*`/`NEXT_PUBLIC_*` variable has a value in a git-tracked env file. These values are inlined into the public JavaScript bundle.',
      'Remove it. Public env vars must never hold credentials; authenticate users at runtime.');
  } else if (secretSrc.length) {
    add('FE-S03', 'MEDIUM', 'Secret-Like Public Variable', 'source', secretSrc[0],
      `Code reads secret-like public build variables (${secretSrc.length}). If they are set in a shipped build, they are visible to every visitor.`,
      'Use them only for local development from an untracked `.env.local`, and fail the build when they are set for production.');
  }

  // FE-S04 security headers (CSP & Clickjacking)
  const headerText = headerConfigs.map(read).join('\n')
    + srcFiles.filter((f) => /(index\.html|__root\.tsx|server\.ts|start\.ts)$/.test(f)).map(read).join('\n')
    + ['vite.config.ts', 'vite.config.js', 'nuxt.config.ts', 'angular.json'].map((n) => read(path.join(root, n))).join('\n');
  const hasCsp = /Content-Security-Policy/i.test(headerText);
  if (!hasCsp) {
    add('FE-S04', 'MEDIUM', 'No Content-Security-Policy', 'hosting config', headerConfigs.length ? rel(root, headerConfigs[0]) : 'repository',
      'No CSP found in hosting configuration, server entry or HTML. CSP is the main defence that limits XSS impact.',
      'Add CSP plus `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors` and `Permissions-Policy` in the web server config (IIS `web.config` customHeaders, nginx `add_header`).');
  } else if (!/X-Frame-Options|frame-ancestors/i.test(headerText)) {
    add('FE-S04', 'LOW', 'Clickjacking Header Missing', 'hosting config', 'repository',
      'CSP present but no `frame-ancestors` / `X-Frame-Options`.', 'Add `frame-ancestors \'none\'` (or the allowed hosts).');
  }

  // FE-S05 third-party CDNs
  const cdn = /(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net|use\.fontawesome\.com|ajax\.googleapis\.com|maxcdn\.bootstrapcdn\.com)/;
  const cdnHits = [];
  for (const f of srcFiles) {
    const c = read(f);
    const m = c.match(cdn);
    if (m) cdnHits.push(`${rel(root, f)}:${lineOf(c, m.index)} (${m[1]})`);
  }
  if (cdnHits.length) {
    add('FE-S05', 'MEDIUM', 'Third-Party Asset CDN', 'HTML/head', cdnHits[0],
      'Fonts or scripts are loaded from a public CDN: visitor IPs reach a third party (PDPL/NCA concern) and the page depends on an external host.',
      'Self-host fonts and libraries (`/public/fonts`, bundled packages) and tighten CSP `font-src`/`script-src` to `self`.');
  }

  // FE-S06 & FE-S10 dangerous HTML sinks + ATO escalation
  const sinkHits = [];
  const unsanitizedSinkHits = [];
  const sinkLow = [];
  for (const f of srcFiles) {
    const c = read(f);
    const hasDomPurify = /DOMPurify\.sanitize\s*\(|sanitizeHtml\s*\(/i.test(c);
    for (const m of c.matchAll(/dangerouslySetInnerHTML|\.innerHTML\s*=|\bv-html\b|\[innerHTML\]|bypassSecurityTrust\w+|\beval\s*\(|new Function\s*\(/g)) {
      const loc = `${rel(root, f)}:${lineOf(c, m.index)}`;
      if (/components\/ui\/chart\.tsx$/.test(rel(root, f))) {
        sinkLow.push(loc);
      } else {
        sinkHits.push(loc);
        if (!hasDomPurify) unsanitizedSinkHits.push(loc);
      }
    }
  }
  if (sinkHits.length) {
    add('FE-S06', 'MEDIUM', 'HTML/Code Injection Sink', 'source', sinkHits[0],
      `${sinkHits.length} use(s) of raw HTML or dynamic code sinks.`,
      'Render text, not HTML. If HTML is required, sanitise with DOMPurify and keep the input server-controlled.');
  }
  if (sinkLow.length) {
    add('FE-S06', 'LOW', 'HTML Sink In UI Kit', 'components/ui/chart.tsx', sinkLow[0],
      'Chart component injects CSS via `dangerouslySetInnerHTML` (standard shadcn pattern).',
      'Safe only while the chart config is developer-controlled; never pass user text into it.');
  }

  // FE-S10 (CRITICAL): Unsanitized HTML sink combined with web-storage token (FE-S01) OR missing DOMPurify + missing CSP
  if ((sinkHits.length > 0 && tokenHits.length > 0 && unsanitizedSinkHits.length > 0) || (unsanitizedSinkHits.length > 0 && !hasCsp)) {
    add('FE-S10', 'CRITICAL', 'DOM XSS Account-Takeover Chain (Unsanitized Sink + Token/Missing CSP)', 'source', unsanitizedSinkHits[0] || sinkHits[0],
      `Raw HTML sink (${unsanitizedSinkHits[0] || sinkHits[0]}) lacks DOMPurify sanitization ${tokenHits.length ? 'while JWT/session tokens reside in localStorage/sessionStorage' : 'and no Content-Security-Policy is enforced'}, enabling full session hijacking.`,
      'Eliminate `v-html`/`dangerouslySetInnerHTML` or sanitize through `DOMPurify.sanitize()` (>= 3.1.3), move tokens to `HttpOnly` cookies, and enforce a strict `Content-Security-Policy`.');
  }

  // FE-S08 (HIGH): SPA Router missing beforeEach navigation guard / Nuxt missing auth middleware
  let routerDeclaredAt = null;
  let hasBeforeEachGuard = false;
  let hasNuxtAuthMiddleware = false;
  for (const f of srcFiles) {
    const c = read(f);
    const r = rel(root, f);
    if (/\bcreateRouter\s*\(/.test(c) && !routerDeclaredAt) {
      routerDeclaredAt = r;
    }
    if (/\.beforeEach\s*\(/.test(c)) {
      hasBeforeEachGuard = true;
    }
    if (/(?:^|\/)middleware\/[^/]*auth[^/]*\.[jt]s$/i.test(r) || /defineNuxtRouteMiddleware\s*\(/.test(c)) {
      hasNuxtAuthMiddleware = true;
    }
  }
  if (routerDeclaredAt && !hasBeforeEachGuard && !hasNuxtAuthMiddleware) {
    add('FE-S08', 'HIGH', 'SPA Router Missing Authentication Navigation Guard (beforeEach)', 'Vue/SPA Router', routerDeclaredAt,
      `Router '${routerDeclaredAt}' initializes routes via 'createRouter' without a 'router.beforeEach' authentication/role guard.`,
      'Register a `router.beforeEach` navigation guard (or Nuxt global auth middleware) paired with server-side RBAC enforcement (`SEC-017`).');
  }

  // FE-S09 (CRITICAL): Hardcoded user/tenant/admin UUID/GUID or static Bearer JWT in frontend code
  const uuidRegex = /["'`]([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})["'`]/i;
  const staticJwtRegex = /["'`](?:Bearer\s+)?(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})["'`]/;
  for (const f of srcFiles) {
    if (!/\.(vue|tsx|ts|jsx|js)$/.test(f)) continue;
    const c = read(f);
    const r = rel(root, f);
    const jwtHit = c.match(staticJwtRegex);
    if (jwtHit) {
      add('FE-S09', 'CRITICAL', 'Hardcoded Bearer JWT in Frontend Bundle', path.basename(f), `${r}:${lineOf(c, jwtHit.index)}`,
        `Static JWT token literal embedded inside '${r}', exposing live credentials in client-side JS bundles.`,
        'Remove hardcoded tokens immediately, rotate the signing key/session, and acquire short-lived credentials dynamically upon authentication.');
      continue;
    }
    const guidHit = c.match(uuidRegex);
    if (guidHit && guidHit[1] !== '00000000-0000-0000-0000-000000000000') {
      add('FE-S09', 'CRITICAL', 'Hardcoded User / Tenant UUID in Frontend Source', path.basename(f), `${r}:${lineOf(c, guidHit.index)}`,
        `Hardcoded entity/user/tenant GUID '${guidHit[1]}' embedded in '${r}', indicating test/backdoor identity coupling.`,
        'Resolve active user and tenant identifiers dynamically from authenticated session state (`/api/v1/auth/me`).');
    }
  }

  // FE-S11 (HIGH) & FE-S12 (MEDIUM): Nginx TLS/HSTS & Security Header Hygiene
  const nginxFiles = headerConfigs.filter(f => /^nginx.*\.conf$/i.test(path.basename(f)));
  for (const nf of nginxFiles) {
    const c = read(nf);
    const r = rel(root, nf);
    const listens80 = /\blisten\s+(?:\[::\]:)?80\b/.test(c);
    const listens443OrSsl = /\blisten\s+(?:\[::\]:)?443\b|\bssl_certificate\b/.test(c);
    const redirectsHttps = /return\s+301\s+https:\/\//i.test(c);
    const hasHsts = /Strict-Transport-Security/i.test(c);

    if ((listens80 && !listens443OrSsl && !redirectsHttps) || !hasHsts) {
      add('FE-S11', 'HIGH', 'Nginx Cleartext Port 80 Only / Missing TLS & HSTS', path.basename(nf), r,
        `Nginx configuration '${r}' ${!listens443OrSsl && !redirectsHttps ? 'serves HTTP on port 80 without TLS 443 or 301 HTTPS redirect' : 'omits Strict-Transport-Security (HSTS)'}.`,
        'Enforce `return 301 https://$host$request_uri;` on port 80, terminate TLS 1.2/1.3 on port 443, and add `Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`.');
    }

    const missingHygiene = [];
    if (!/X-Content-Type-Options/i.test(c) || !/nosniff/i.test(c)) missingHygiene.push('X-Content-Type-Options: nosniff');
    if (!/Referrer-Policy/i.test(c)) missingHygiene.push('Referrer-Policy');
    if (!/Cache-Control/i.test(c) || !/no-store/i.test(c)) missingHygiene.push('Cache-Control: no-store');
    if (!/\bserver_tokens\s+off\s*;/i.test(c)) missingHygiene.push('server_tokens off');

    if (missingHygiene.length > 0) {
      add('FE-S12', 'MEDIUM', 'Missing Web Server Security & Cache Hygiene Directives', path.basename(nf), r,
        `Hosting config '${r}' omits hardening directives: ${missingHygiene.join(', ')}.`,
        'Configure `server_tokens off;`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Cache-Control: no-store` on sensitive/API responses.');
    }
  }

  // FE-S13 (MEDIUM): Production source maps enabled in build config
  for (const bf of buildConfigs) {
    const c = read(bf);
    const r = rel(root, bf);
    const smMatch = c.match(/\b(?:sourcemap|sourceMap)\s*:\s*true\b/);
    if (smMatch && path.basename(bf) !== 'tsconfig.json') {
      add('FE-S13', 'MEDIUM', 'Production JavaScript Source Maps Enabled', path.basename(bf), `${r}:${lineOf(c, smMatch.index)}`,
        `Build configuration '${r}' sets 'sourcemap: true', publishing full unminified source code in production bundles.`,
        'Set `build: { sourcemap: false }` for production builds (or upload `hidden` source maps privately to Sentry only).');
    }
  }

  // FE-Q01 data-testid coverage
  let interactive = 0;
  let testIds = 0;
  for (const f of srcFiles) {
    if (!/\.(tsx|jsx|vue|html)$/.test(f)) continue;
    const c = read(f);
    interactive += (c.match(/<(button|input|select|textarea|a|Button|Input|Select|Textarea|Checkbox|Switch|Link|RouterLink|NuxtLink)\b/g) || []).length;
    testIds += (c.match(/data-testid/g) || []).length;
  }
  if (interactive > 0) {
    const ratio = testIds / interactive;
    if (ratio < 0.5) {
      add('FE-Q01', 'MEDIUM', 'data-testid Coverage', 'UI templates', 'src',
        `${testIds} data-testid for about ${interactive} interactive elements (${Math.round(ratio * 100)}%). Rule 006 requires a deterministic \`data-testid\` on every interactive element.`,
        'Add `data-testid="{module}-{component}-{element}"` to forms, inputs, buttons, tables, rows (with id), badges and alerts; enforce with an ESLint rule.');
    }
  }

  // FE-Q02 pipeline and hygiene
  const pkgPath = path.join(root, 'package.json');
  const pkg = (() => { try { return JSON.parse(read(pkgPath)); } catch { return {}; } })();
  const scripts = pkg.scripts || {};
  if (ciFiles.length === 0) {
    add('FE-Q02', 'MEDIUM', 'No CI Pipeline', 'repository', 'repository',
      'No CI definition found (GitHub Actions, Azure Pipelines, GitLab CI, Jenkins).',
      'Add a pipeline: install (frozen lockfile), lint, typecheck, test, build, dependency audit, secret scan, `node bin/frontend-audit.js --strict`.');
  }
  const missing = ['test', 'typecheck'].filter((s) => !scripts[s] && !(s === 'typecheck' && (scripts.tsc || scripts['type-check'])));
  if (missing.length) {
    add('FE-Q02', 'LOW', 'Missing npm Scripts', 'package.json', 'package.json',
      `package.json has no ${missing.map((m) => `\`${m}\``).join(' / ')} script.`, 'Add them so CI and developers run the same commands.');
  }
  const locks = ['bun.lock', 'bun.lockb', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].filter((n) => fs.existsSync(path.join(root, n)));
  if (locks.length > 1) {
    add('FE-Q02', 'LOW', 'Multiple Lockfiles', 'repository', locks.join(', '),
      `Several lockfiles are committed (${locks.join(', ')}); different package managers can resolve different versions.`,
      'Choose one package manager and delete the other lockfiles.');
  }

  return findings;
}

module.exports = { findFrontendRoots, auditFrontend };
