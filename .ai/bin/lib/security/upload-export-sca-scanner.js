/**
 * Uploads, PDF/Excel Exports & Software Composition Analysis (SCA) Scanner (v4.2.0)
 * Implements UPL-S01..S03, EXP-S01..S02, and SCA-S01..S03 mapped to Checklist V1.1.
 * Pure CommonJS, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build', 'bin', 'obj',
  '.nuxt', '.output', '.next', 'coverage', '.ai', '.agents', '.cursor', '.github',
  'hooks', 'skills', 'rules', 'templates', 'extensions', 'presets',
  'telemetry', 'specs', 'docs', 'context', 'Migrations', 'tests', 'Tests'
]);

function read(p) {
  try { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; }
}

function rel(root, p) {
  return path.relative(root, p).replace(/\\/g, '/');
}

function lineOf(content, index) {
  return content.slice(0, Math.max(0, index)).split('\n').length;
}

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

function parseSemver(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isVersionLessThan(verStr, minTuple) {
  const v = parseSemver(verStr);
  if (!v) return false;
  for (let i = 0; i < 3; i++) {
    if (v[i] < minTuple[i]) return true;
    if (v[i] > minTuple[i]) return false;
  }
  return false;
}

function auditUploadsExportsSca(root, options = {}) {
  const runScaCli = Boolean(options.runScaCli);
  const findings = [];
  const add = (ruleId, controlIds, severity, category, owaspCategory, ncaClause, target, location, threat, remediation) => {
    findings.push({
      id: ruleId,
      ruleId,
      controlIds,
      severity,
      category,
      owaspCategory,
      ncaClause,
      target,
      location,
      threat,
      remediation
    });
  };

  const codeFiles = [];
  const manifestFiles = [];
  const dumpArtifacts = [];

  walk(root, (f) => {
    const r = rel(root, f);
    const base = path.basename(f);

    if (/\.(bacpac|bak)$/i.test(base) || (/(?:^|\/)(?:backups?|dumps?)\/.*\.(?:sql|zip|gz)$/i.test(r)) || /^(?:dump|backup|prod_db|production)\.(?:sql|zip)$/i.test(base) || /(?:credentials|publish[-_]?profile).*\.zip$/i.test(base)) {
      dumpArtifacts.push(f);
      return;
    }

    if (base === 'package.json' || base === 'composer.json' || base.endsWith('.csproj')) {
      manifestFiles.push(f);
    }

    if (/\.(php|cs|ts|tsx|js|jsx)$/.test(base) && !/\.(test|spec)\.[jt]sx?$/.test(base) && !/\.Designer\.cs$/.test(base) && !/\.d\.ts$/.test(base)) {
      codeFiles.push(f);
    }
  });

  // -------------------------------------------------------------------------
  // SCA-S01 (SEC-097, SEC-127, SEC-160 — CRITICAL): DB Dumps & Credential Archives
  // -------------------------------------------------------------------------
  for (const df of dumpArtifacts) {
    const r = rel(root, df);
    add(
      'SCA-S01',
      ['SEC-097', 'SEC-127', 'SEC-160'],
      'CRITICAL',
      'Database Dump or Sensitive Archive in Repository',
      'OWASP API8:2023 / ASVS V14.2',
      'NCA ECC 2-7 / DCC',
      path.basename(df),
      r,
      `Sensitive database dump or archive '${r}' is present inside the repository tree, risking full PII/credential disclosure.`,
      'Purge `.bacpac`, `.bak`, `.sql` dumps and credential `.zip` archives from git history (`git filter-repo`), add patterns to `.gitignore`, and store encrypted backups in isolated vault storage.'
    );
  }

  // -------------------------------------------------------------------------
  // UPL-S01..S03, EXP-S01..S02, SCA-S03 across PHP / C# / JS / TS files
  // -------------------------------------------------------------------------
  for (const f of codeFiles) {
    const c = read(f);
    const r = rel(root, f);
    const base = path.basename(f);

    // UPL-S01 (SEC-057 — CRITICAL): Active/scriptable upload extensions allowed
    const dangerousMimes = c.match(/(?:mimes|mimetypes|extensions|allowedExtensions|AllowedExtensions)\s*(?:=>|=|:)\s*[^\n;]{0,220}?\b(svg|html|htm|xhtml|js|mjs|php|phtml|phar|aspx|ashx|exe|sh|bat)\b/i);
    const dotExtList = !dangerousMimes ? c.match(/\[\s*(?:['"]\.[a-z0-9]+['"]\s*,\s*)*['"]\.(svg|html|htm|xhtml|js|mjs|php|phtml|phar|aspx|ashx|exe|sh|bat)['"]/i) : null;
    const hitUpl01 = dangerousMimes || dotExtList;
    if (hitUpl01) {
      add(
        'UPL-S01',
        ['SEC-057'],
        'CRITICAL',
        'Active / Executable Format Permitted in File Upload Allowlist',
        'OWASP ASVS V12.1 / A03:2021',
        'NCA ECC 1-6',
        base,
        `${r}:${lineOf(c, hitUpl01.index)}`,
        `Upload validation in '${base}' permits active/scriptable format '.${hitUpl01[1]}', creating Stored XSS or Remote Code Execution vectors.`,
        'Restrict upload allowlists strictly to passive document/image types (`pdf`, `png`, `jpg`, `webp`, `docx`, `xlsx`) and serve downloads with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.'
      );
    }

    // UPL-S02 (SEC-058 — HIGH): Upload handler missing binary magic-byte inspection
    const isUploadHandler = /\bIFormFile\b|\$request->file\s*\(|\$request->hasFile\s*\(|\bmulter\s*\(|\bformidable\s*\(/i.test(c);
    if (isUploadHandler) {
      const hasMagicByte = /\bfinfo_file\b|\bfinfo_open\b|\bmime_content_type\b|\bFileSignature|\bMagicBytes|\bfile-type\b|ReadHeaderBytes|CheckFileSignature/i.test(c);
      if (!hasMagicByte) {
        add(
          'UPL-S02',
          ['SEC-058'],
          'HIGH',
          'Upload Handler Missing Magic-Byte File Signature Verification',
          'OWASP ASVS V12.2',
          'NCA ECC 1-6',
          base,
          r,
          `Upload handler '${base}' relies on client extension or Content-Type without server-side binary magic-byte inspection.`,
          'Verify actual file header magic bytes (`finfo_file(FILEINFO_MIME_TYPE)` in PHP or binary header signature inspection in .NET/Node) against an explicit MIME allowlist.'
        );
      }

      // UPL-S03 (SEC-061 — HIGH): Saving upload with raw client filename
      const rawClientName = c.match(/\bgetClientOriginalName\s*\(\s*\)|\.\s*FileName\b/);
      if (rawClientName && /(?:storeAs|putFileAs|move|Path\.Combine|File\.Create|FileStream)/i.test(c)) {
        add(
          'UPL-S03',
          ['SEC-061'],
          'HIGH',
          'Upload Persisted Using Untrusted Client Filename',
          'OWASP ASVS V12.1',
          'NCA ECC 2-7 / DCC',
          base,
          `${r}:${lineOf(c, rawClientName.index)}`,
          `'${base}' saves uploaded content using client-supplied filename (${rawClientName[0].trim()}), risking path collisions, traversal, or double-extension execution.`,
          'Generate an opaque server-side UUIDv4/ULID storage key (`Str::uuid()` / `Guid.NewGuid()`) and store original display name as escaped DB metadata only.'
        );
      }
    }

    // EXP-S01 (SEC-054, SEC-062 — HIGH): PDF generator SSRF / local file read
    const pdfEngine = c.match(/\b(?:DinkToPdf|HtmlToPdfDocument|wkhtmltopdf|Browsershot|Dompdf|Pdf::loadHTML|Puppeteer)\b/i);
    if (pdfEngine) {
      const hasSanitizeAndNoLocal = /(?:DOMPurify|HtmlSanitizer|cleanHtml|strip_tags|isRemoteEnabled\s*['"]?\s*=>\s*false|EnableLocalFileAccess\s*=\s*false|--disable-local-file-access)/i.test(c);
      if (!hasSanitizeAndNoLocal) {
        add(
          'EXP-S01',
          ['SEC-054', 'SEC-062'],
          'HIGH',
          'Unsanitized HTML / SSRF Vector in Server-Side PDF Renderer',
          'OWASP API7:2023 / ASVS V12.3',
          'NCA ECC 1-6',
          base,
          `${r}:${lineOf(c, pdfEngine.index)}`,
          `'${base}' renders HTML/URLs through '${pdfEngine[0]}' without HTML sanitization and local-file/internal-IP blocking (SSRF / LFD vector).`,
          'Sanitize dynamic HTML inputs, disable `enable-local-file-access` / `isRemoteEnabled`, and block RFC1918/metadata (`169.254.169.254`) network fetches.'
        );
      }
    }

    // EXP-S02 (SEC-069 — MEDIUM): Spreadsheet / CSV formula injection
    const csvOrExcel = c.match(/\b(?:ClosedXML|XLWorkbook|EPPlus|ExcelPackage|PhpSpreadsheet|FromCollection|fputcsv)\b/);
    if (csvOrExcel) {
      const neutralizesFormula = /startsWith\s*\(\s*['"]=[+-@]?|preg_match\s*\(\s*['"]\/\^\[=+\-@\]|EscapeFormula|SanitizeCsvCell|\['=',\s*'\+',\s*'-',\s*'@'\]/i.test(c);
      if (!neutralizesFormula) {
        add(
          'EXP-S02',
          ['SEC-069'],
          'MEDIUM',
          'Missing CSV / Excel Formula Injection Neutralization',
          'OWASP ASVS V5.3',
          'NCA ECC 1-6',
          base,
          `${r}:${lineOf(c, csvOrExcel.index)}`,
          `Spreadsheet/CSV exporter '${base}' writes dynamic strings without neutralizing leading formula characters (\`=\`, \`+\`, \`-\`, \`@\`).`,
          "Prefix cells starting with `=`, `+`, `-`, `@`, `\\t`, or `\\r` with a single quote (`'`) or explicit text cell type before export."
        );
      }
    }

    // SCA-S03 (SEC-174 — HIGH): Unconditional startup AutoMigrate / Database.Migrate()
    const autoMigrate = c.match(/\b(?:Database\.Migrate(?:Async)?\s*\(\s*\)|AutoMigrate\s*\()/);
    if (autoMigrate && /(?:Program\.cs|Startup\.cs|MigrationExtensions\.cs)$/i.test(base)) {
      const guardedMigrate = /IsDevelopment\s*\(|RunMigrationsOnStartup|ENABLE_AUTO_MIGRATE/i.test(c);
      if (!guardedMigrate) {
        add(
          'SCA-S03',
          ['SEC-174'],
          'HIGH',
          'Unconditional Database Auto-Migration at Production Startup',
          'OWASP ASVS V14.1',
          'NCA ECC 1-6 / 3-1',
          base,
          `${r}:${lineOf(c, autoMigrate.index)}`,
          `'${base}' executes '${autoMigrate[0].trim()}' unconditionally on startup without an environment/config gate or rollback verification.`,
          'Gate startup migrations behind `IsDevelopment()` or an explicit CI/CD migration job paired with an expand/contract rollback plan.'
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // SCA-S02 (SEC-096, SEC-137, SEC-159 — HIGH): Vulnerable Packages & EOL Runtimes
  // -------------------------------------------------------------------------
  for (const mf of manifestFiles) {
    const r = rel(root, mf);
    const base = path.basename(mf);
    const c = read(mf);

    if (base === 'package.json') {
      try {
        const pkg = JSON.parse(c);
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const vulnRules = [
          { name: 'dompurify', min: [3, 1, 3], cve: 'XSS bypass in DOMPurify < 3.1.3' },
          { name: 'lodash', min: [4, 17, 21], cve: 'Prototype Pollution / Command Injection in lodash < 4.17.21' },
          { name: 'tinymce', min: [6, 8, 4], cve: 'Stored/Mutation XSS in tinymce < 6.8.4' },
          { name: 'axios', min: [1, 6, 0], cve: 'CSRF / SSRF credential leak in axios < 1.6.0' }
        ];
        for (const vr of vulnRules) {
          if (deps[vr.name] && isVersionLessThan(deps[vr.name], vr.min)) {
            add(
              'SCA-S02',
              ['SEC-096', 'SEC-137', 'SEC-159'],
              'HIGH',
              `Vulnerable Frontend/Node Dependency (${vr.name})`,
              'OWASP A06:2021 / ASVS V14.2',
              'NCA ECC 2-10',
              `${vr.name}@${deps[vr.name]}`,
              r,
              `${vr.cve} detected in ${r} (${vr.name}: ${deps[vr.name]}).`,
              `Upgrade '${vr.name}' to >= ${vr.min.join('.')} and regenerate lockfile.`
            );
          }
        }
      } catch { /* ignore invalid JSON */ }
    } else if (base === 'composer.json') {
      try {
        const comp = JSON.parse(c);
        const req = comp.require || {};
        if (req['laravel/framework'] && /^\^?(?:[5-9]|10)\./.test(String(req['laravel/framework']).trim())) {
          add(
            'SCA-S02',
            ['SEC-137', 'SEC-159'],
            'HIGH',
            'EOL / Unpatched Laravel Framework Baseline',
            'OWASP A06:2021 / ASVS V14.2',
            'NCA ECC 2-10',
            `laravel/framework:${req['laravel/framework']}`,
            r,
            `EOL Laravel version constraint (${req['laravel/framework']}) in ${r}.`,
            'Upgrade to actively patched LTS/supported Laravel release and run `composer audit`.'
          );
        }
      } catch { /* ignore */ }
    } else if (base.endsWith('.csproj')) {
      const eolTfm = c.match(/<TargetFramework>\s*(net[567]\.0|netcoreapp\d+\.\d+)\s*<\/TargetFramework>/i);
      if (eolTfm) {
        add(
          'SCA-S02',
          ['SEC-137', 'SEC-159'],
          'HIGH',
          'End-of-Life .NET TargetFramework',
          'OWASP A06:2021 / ASVS V14.2',
          'NCA ECC 2-10',
          eolTfm[1],
          r,
          `Project '${r}' targets End-of-Life runtime '${eolTfm[1]}' which no longer receives Microsoft security patches.`,
          'Upgrade `<TargetFramework>` to supported `.NET 8.0` LTS or `.NET 10.0`.'
        );
      }
    }
  }

  // Optional 5s timeout-bounded live CLI SCA audit (--run-sca-cli)
  if (runScaCli) {
    if (fs.existsSync(path.join(root, 'package-lock.json'))) {
      try {
        const out = execFileSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
        const parsed = JSON.parse(out);
        const crit = parsed?.metadata?.vulnerabilities?.critical || 0;
        const high = parsed?.metadata?.vulnerabilities?.high || 0;
        if (crit > 0 || high > 0) {
          add(
            'SCA-S02',
            ['SEC-096', 'SEC-159'],
            crit > 0 ? 'CRITICAL' : 'HIGH',
            'npm audit Vulnerable Dependencies',
            'OWASP A06:2021',
            'NCA ECC 2-10',
            'package-lock.json',
            'package-lock.json',
            `npm audit reported ${crit} Critical and ${high} High dependency vulnerabilities.`,
            'Run `npm audit fix` or upgrade vulnerable transitive packages.'
          );
        }
      } catch (err) {
        if (err && err.stdout) {
          try {
            const parsed = JSON.parse(String(err.stdout));
            const crit = parsed?.metadata?.vulnerabilities?.critical || 0;
            const high = parsed?.metadata?.vulnerabilities?.high || 0;
            if (crit > 0 || high > 0) {
              add(
                'SCA-S02',
                ['SEC-096', 'SEC-159'],
                crit > 0 ? 'CRITICAL' : 'HIGH',
                'npm audit Vulnerable Dependencies',
                'OWASP A06:2021',
                'NCA ECC 2-10',
                'package-lock.json',
                'package-lock.json',
                `npm audit reported ${crit} Critical and ${high} High dependency vulnerabilities.`,
                'Run `npm audit fix` or upgrade vulnerable transitive packages.'
              );
            }
          } catch { /* graceful offline fallback */ }
        }
      }
    }
  }

  return findings;
}

module.exports = {
  auditUploadsExportsSca
};

