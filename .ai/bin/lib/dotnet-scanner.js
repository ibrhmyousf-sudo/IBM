/**
 * .NET / C# deterministic scanner (v4.2.0).
 * Used by:
 *   - bin/build-codebase-map.js   -> scanCSharpFile()  (entities, endpoints, contracts, tables)
 *   - bin/security-fuzzer.js      -> auditDotNet()     (NET-S01..S22, NET-A01 invariants)
 *   - bin/pentest-suite.js        -> auditDotNet()     (mapped to SEC-001..SEC-183)
 *   - bin/dotnet-audit.js         -> standalone CLI / CI gate
 *   - bin/perf-predictor.js       -> scanDotNetPerformance()
 * Static analysis only: no code is built or executed.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'bin', 'obj', 'Migrations', 'diagram-files', 'wwwroot',
  'dist', 'build', '.vs', '.idea', '.vscode', 'coverage', 'TestResults',
  '.ai', '.agents', '.cursor', '.github', 'hooks', 'skills', 'rules', 'templates',
  'extensions', 'presets', 'telemetry', 'specs', 'docs', 'context'
]);

const RULE_META = {
  'NET-S01': { controlIds: ['SEC-018', 'SEC-072', 'SEC-091', 'SEC-097', 'SEC-130', 'SEC-160'], owaspCategory: 'OWASP API2:2023 / ASVS V2.10', ncaClause: 'NCA ECC 2-2 / 2-8' },
  'NET-S02': { controlIds: ['SEC-085'], owaspCategory: 'OWASP API8:2023 / ASVS V14.5', ncaClause: 'NCA ECC 2-5' },
  'NET-S03': { controlIds: ['SEC-071'], owaspCategory: 'OWASP API8:2023 / API9:2023', ncaClause: 'NCA ECC 2-5' },
  'NET-S04': { controlIds: ['SEC-016', 'SEC-034', 'SEC-035'], owaspCategory: 'OWASP API5:2023 / ASVS V4.1', ncaClause: 'NCA ECC 2-2' },
  'NET-S05': { controlIds: ['SEC-021', 'SEC-073'], owaspCategory: 'OWASP API4:2023 / ASVS V13.1', ncaClause: 'NCA ECC 2-5' },
  'NET-S06': { controlIds: ['SEC-035'], owaspCategory: 'OWASP API8:2023 / ASVS V4.1', ncaClause: 'NCA ECC 1-6' },
  'NET-S07': { controlIds: ['SEC-088', 'SEC-089', 'SEC-090'], owaspCategory: 'OWASP ASVS V14.4', ncaClause: 'NCA ECC 2-5' },
  'NET-S08': { controlIds: ['SEC-052'], owaspCategory: 'OWASP A03:2021 / ASVS V5.3', ncaClause: 'NCA ECC 1-6' },
  'NET-S09': { controlIds: ['SEC-036', 'SEC-039'], owaspCategory: 'OWASP API1:2023 / ASVS V4.2', ncaClause: 'NCA ECC 2-2' },
  'NET-S10': { controlIds: ['SEC-019', 'SEC-040'], owaspCategory: 'OWASP API2:2023 / API9:2023', ncaClause: 'NCA ECC 2-2' },
  'NET-S11': { controlIds: ['SEC-028'], owaspCategory: 'OWASP API2:2023 / ASVS V3.2', ncaClause: 'NCA ECC 2-2' },
  'NET-S12': { controlIds: ['SEC-016', 'SEC-021', 'SEC-035'], owaspCategory: 'OWASP API2:2023 / API5:2023', ncaClause: 'NCA ECC 2-2' },
  'NET-S13': { controlIds: ['SEC-016', 'SEC-035', 'SEC-178'], owaspCategory: 'OWASP API2:2023 / ASVS V4.1', ncaClause: 'NCA ECC 2-2' },
  'NET-S14': { controlIds: ['SEC-028', 'SEC-029', 'SEC-030', 'SEC-072'], owaspCategory: 'OWASP API2:2023 / ASVS V3.5', ncaClause: 'NCA ECC 2-2' },
  'NET-S15': { controlIds: ['SEC-044', 'SEC-045', 'SEC-061', 'SEC-148', 'SEC-149'], owaspCategory: 'OWASP API8:2023 / ASVS V7.3', ncaClause: 'NCA ECC 2-12 / DCC' },
  'NET-S16': { controlIds: ['SEC-045', 'SEC-055'], owaspCategory: 'OWASP API1:2023 / ASVS V12.3', ncaClause: 'NCA ECC 1-6' },
  'NET-S17': { controlIds: ['SEC-071', 'SEC-087', 'SEC-142'], owaspCategory: 'OWASP API8:2023 / API9:2023', ncaClause: 'NCA ECC 2-2 / 2-5' },
  'NET-S18': { controlIds: ['SEC-054', 'SEC-083', 'SEC-091'], owaspCategory: 'OWASP API7:2023 / ASVS V9.1', ncaClause: 'NCA ECC 2-8 / NCS' },
  'NET-S19': { controlIds: ['SEC-059', 'SEC-074', 'SEC-075', 'SEC-162'], owaspCategory: 'OWASP API4:2023 / ASVS V12.1', ncaClause: 'NCA ECC 1-6' },
  'NET-S20': { controlIds: ['SEC-077', 'SEC-086', 'SEC-092', 'SEC-093'], owaspCategory: 'OWASP API8:2023 / ASVS V7.4', ncaClause: 'NCA ECC 1-6 / 2-5' },
  'NET-S21': { controlIds: ['SEC-022', 'SEC-023', 'SEC-024', 'SEC-025', 'SEC-026', 'SEC-027'], owaspCategory: 'OWASP API2:2023 / ASVS V2.5', ncaClause: 'NCA ECC 2-2' },
  'NET-S22': { controlIds: ['SEC-034', 'SEC-037', 'SEC-038', 'SEC-040', 'SEC-041'], owaspCategory: 'OWASP API5:2023 / ASVS V4.1', ncaClause: 'NCA ECC 2-2' },
  'NET-A01': { controlIds: ['SEC-006'], owaspCategory: 'OWASP ASVS V1.4', ncaClause: 'NCA ECC 1-6' }
};

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

function rel(root, p) { return path.relative(root, p).replace(/\\/g, '/'); }

function read(p) { try { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; } }

/** True when the folder (depth <= 3) holds a .csproj / .sln / .slnx. */
function isDotNetProject(root) {
  let found = false;
  const probe = (dir, depth) => {
    if (found || depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.isFile() && /\.(csproj|sln|slnx)$/i.test(e.name)) { found = true; return; }
      if (e.isDirectory()) probe(path.join(dir, e.name), depth + 1);
    }
  };
  probe(root, 0);
  return found;
}

/**
 * Classifies one C# file for the codebase map.
 */
function scanCSharpFile(content, normalized) {
  const out = { entities: [], endpoints: [], controllers: [], contracts: [], dbSets: [], toTables: [] };
  if (/(^|\/)(bin|obj)\//.test(normalized) || /\.Designer\.cs$/.test(normalized) || /Migrations\//.test(normalized)) return out;

  if (/\/Domain\//.test('/' + normalized)) {
    for (const m of content.matchAll(/\bclass\s+(\w+)\s*(?:<[^>]*>)?\s*:\s*([^{\n]+)/g)) {
      if (/\b(BaseAuditableEntity|BaseEntity|ValueObject)\b/.test(m[2]) && !/^(Base\w*|ValueObject)$/.test(m[1])) out.entities.push(m[1]);
    }
  }

  for (const m of content.matchAll(/\bclass\s+(\w+)\s*:\s*([^{\n]+)/g)) {
    if (/\b(?:IEndpointGroup|EndpointGroupBase)\b/.test(m[2])) out.endpoints.push(m[1]);
    else if (/\b(ControllerBase|Controller)\b/.test(m[2])) out.controllers.push(m[1]);
  }

  if (/\/(Application\/Common\/Interfaces|Contracts|Interfaces)\//.test('/' + normalized)) {
    for (const m of content.matchAll(/\binterface\s+(I\w+)/g)) out.contracts.push(m[1]);
  }

  for (const m of content.matchAll(/DbSet<(\w+)>\s+(\w+)/g)) out.dbSets.push({ entity: m[1], set: m[2] });

  for (const cfg of content.matchAll(/class\s+\w+\s*:\s*IEntityTypeConfiguration<(\w+)>[\s\S]*?(?=\bclass\s+\w+\s*:\s*IEntityTypeConfiguration<|$)/g)) {
    const t = cfg[0].match(/ToTable\(\s*"([^"]+)"/);
    if (t) out.toTables.push({ entity: cfg[1], table: t[1] });
  }
  return out;
}

const PLACEHOLDER = /^(<.*>|\{.*\}|\$\{.*\}|\*+|changeme|change-me|your[-_ ]?password|placeholder|secret|todo|xxx+)?$/i;

function isGitTracked(root, file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], { cwd: root, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function lineOf(content, index) { return content.slice(0, Math.max(0, index)).split('\n').length; }

function probeWwwrootExposures(root) {
  const exposed = [];
  const candidateRoots = [path.join(root, 'wwwroot')];
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name)) {
        const subWww = path.join(root, e.name, 'wwwroot');
        if (fs.existsSync(subWww)) candidateRoots.push(subWww);
        if (e.name === 'src') {
          for (const se of fs.readdirSync(path.join(root, 'src'), { withFileTypes: true })) {
            if (se.isDirectory()) {
              const deepWww = path.join(root, 'src', se.name, 'wwwroot');
              if (fs.existsSync(deepWww)) candidateRoots.push(deepWww);
            }
          }
        }
      }
    }
  } catch { /* ignore */ }

  for (const www of candidateRoots) {
    if (!fs.existsSync(www)) continue;
    try {
      for (const entry of fs.readdirSync(www, { withFileTypes: true })) {
        if (entry.isDirectory() && /^(exports?|fileserver|logs?|innovalogs.*|backups?|uploads?)$/i.test(entry.name)) {
          exposed.push(rel(root, path.join(www, entry.name)));
        }
      }
    } catch { /* ignore */ }
  }
  return exposed;
}

/**
 * @returns {Array<{id:string,ruleId:string,controlIds:string[],severity:string,category:string,owaspCategory:string,ncaClause:string,target:string,location:string,threat:string,remediation:string}>}
 */
function auditDotNet(root) {
  const findings = [];
  const add = (id, severity, category, target, location, threat, remediation, customControls = null) => {
    const meta = RULE_META[id] || { controlIds: ['SEC-158'], owaspCategory: 'OWASP ASVS 5.0', ncaClause: 'NCA ECC 1-6' };
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

  const csFiles = [];
  const configFiles = [];
  const csprojFiles = [];
  const httpFiles = [];
  const launchSettingFiles = [];

  walk(root, (f) => {
    const base = path.basename(f);
    if (f.endsWith('.cs') && !/\.Designer\.cs$/.test(f)) csFiles.push(f);
    else if (f.endsWith('.csproj')) csprojFiles.push(f);
    else if (f.endsWith('.http')) httpFiles.push(f);
    else if (/^appsettings(\..+)?\.json$/i.test(base)) configFiles.push(f);
    else if (base === 'launchSettings.json') launchSettingFiles.push(f);
  });

  // 1. NET-S01 (+ Hangfire hardcoded auth check for NET-S17): Secrets and weak transport in config files
  const secretInspectTargets = [
    ...configFiles.map(f => ({ path: f, type: 'config' })),
    ...launchSettingFiles.map(f => ({ path: f, type: 'launchSettings' })),
    ...httpFiles.map(f => ({ path: f, type: 'http' })),
    ...csFiles.filter(f => /(?:AppHost\/Program\.cs$)/i.test(rel(root, f))).map(f => ({ path: f, type: 'apphost' }))
  ];

  let hardcodedHangfireConfig = null;

  for (const item of secretInspectTargets) {
    const f = item.path;
    const c = read(f);
    const r = rel(root, f);
    const tracked = isGitTracked(root, r);
    const sev = tracked ? 'CRITICAL' : 'MEDIUM';
    const where = tracked ? 'git-tracked' : 'not tracked by git';
    const isProdOrStaging = /appsettings\.(Production|Staging)\.json$/i.test(path.basename(f));

    for (const m of c.matchAll(/\b(?:Password|Pwd)\s*[:=]\s*["']?([^;"'\r\n]+)/gi)) {
      const v = m[1].trim();
      if (!PLACEHOLDER.test(v)) {
        add('NET-S01', sev, 'Hard-coded Credential', r, `${r}:${lineOf(c, m.index)}`,
          `Database password or secret literal in a ${where} ${item.type} file.`,
          'Remove it, rotate the credential, and load it from user-secrets, environment variables, or Azure Key Vault / Secret Manager (rules 009).');
        break;
      }
    }
    if (/\b(?:User ID|UID|User)\s*[:=]\s*["']?sa\b/i.test(c)) {
      add('NET-S01', isProdOrStaging ? 'CRITICAL' : sev, 'Privileged DB Account', r, r,
        'Connection string uses the privileged `sa` super-user account.',
        'Use a least-privilege application login (db_datareader/db_datawriter or explicit grants).');
    }
    if (/Encrypt\s*[:=]\s*["']?False/i.test(c) || /TrustServerCertificate\s*[:=]\s*["']?True/i.test(c)) {
      const transportSev = isProdOrStaging ? 'HIGH' : 'MEDIUM';
      add('NET-S01', transportSev, 'Insecure DB Transport', r, r,
        `Connection string disables encryption (Encrypt=False) or trusts any server certificate (TrustServerCertificate=True)${isProdOrStaging ? ' in Production/Staging configuration' : ''}.`,
        'Use `Encrypt=True` and a trusted CA certificate; allow `TrustServerCertificate=True` in Development only.');
    }
    const jwt = c.match(/"Jwt"\s*:\s*\{[^}]*"Key"\s*:\s*"([^"]+)"/s);
    if (jwt && !PLACEHOLDER.test(jwt[1])) {
      add('NET-S01', sev, 'Hard-coded Signing Key', r, r,
        `JWT signing key literal in a ${where} config file.`,
        'Provide `Jwt:Key` through user-secrets / environment / Key Vault; rotate the key immediately.');
    }
    if (/"Hangfire"[\s\S]{0,200}?"Password"\s*:\s*"([^"]+)"/i.test(c)) {
      const hfMatch = c.match(/"Hangfire"[\s\S]{0,200}?"Password"\s*:\s*"([^"]+)"/i);
      if (hfMatch && !PLACEHOLDER.test(hfMatch[1])) {
        hardcodedHangfireConfig = r;
      }
    }
  }

  // 2. NET-A01: Clean Architecture Project Reference & Layer Isolation
  for (const csproj of csprojFiles) {
    const c = read(csproj);
    const r = rel(root, csproj);
    const isDomain = /(?:^|\/)Domain\/[^/]+\.csproj$/i.test(r) || /Domain\.csproj$/i.test(r);
    const isApplication = /(?:^|\/)Application\/[^/]+\.csproj$/i.test(r) || /Application\.csproj$/i.test(r);

    if (isDomain) {
      const projRefs = [...c.matchAll(/<ProjectReference\s+Include=["']([^"']+)["']/gi)];
      if (projRefs.length > 0) {
        add('NET-A01', 'HIGH', 'Domain Layer Boundary Violation', r, r,
          `Domain project references external projects: ${projRefs.map(m => path.basename(m[1])).join(', ')}. Domain must have zero <ProjectReference> dependencies.`,
          'Remove project references from Domain. Domain is pure enterprise business logic and cannot depend on any other layer.');
      }
      if (/Include=["']Microsoft\.EntityFrameworkCore/i.test(c) || /Include=["']Microsoft\.AspNetCore/i.test(c)) {
        add('NET-A01', 'HIGH', 'Domain Framework Coupling', r, r,
          'Domain project references Microsoft.EntityFrameworkCore or Microsoft.AspNetCore.',
          'Remove EF Core and ASP.NET Core package references from Domain. Persistence and HTTP concerns belong to Infrastructure and Web.');
      }
    }

    if (isApplication) {
      const projRefs = [...c.matchAll(/<ProjectReference\s+Include=["']([^"']+)["']/gi)];
      for (const pr of projRefs) {
        const refTarget = pr[1].replace(/\\/g, '/');
        if (/Infrastructure/i.test(refTarget) || /Web/i.test(refTarget)) {
          add('NET-A01', 'HIGH', 'Application Layer Inversion Violation', r, r,
            `Application project references inverted layer: ${path.basename(refTarget)}. Application may only reference Domain and Shared.`,
            'Remove reference to Infrastructure/Web. Invert dependencies using interfaces defined in Application/Common/Interfaces.');
        }
      }
    }
  }

  // Probe wwwroot/ for exposed dynamic folders (NET-S15)
  for (const exposedRel of probeWwwrootExposures(root)) {
    add('NET-S15', 'CRITICAL', 'Public wwwroot Dynamic Export/Log/Upload Exposure', path.basename(exposedRel), exposedRel,
      `Directory '${exposedRel}' resides inside publicly served 'wwwroot/', exposing exports, uploads, or logs to unauthenticated download.`,
      'Relocate dynamic files outside `wwwroot/` to private storage and serve exclusively through an authenticated ownership-checked endpoint.');
  }

  // Source scans
  let securityHeaders = false;
  let rateLimiterSeen = false;
  let globalLimiter = false;
  let ignoreFilters = 0;
  const unauthorised = [];
  let totalRequests = 0;
  let identityApi = null;
  let registerBlocked = false;
  let bearerToken = false;
  let jwtBearer = false;

  for (const f of csFiles) {
    const c = read(f);
    const r = rel(root, f);
    const base = path.basename(f);
    const lines = c.split('\n');

    // NET-A01: Web layer direct DbContext or Infrastructure repo instantiation
    if (/\/Web\//i.test('/' + r) && !/(?:DependencyInjection\.cs|Program\.cs)$/i.test(r)) {
      const directInst = c.match(/\bnew\s+([A-Za-z0-9_]*DbContext|[A-Za-z0-9_]*Repository)\s*\(/);
      if (directInst) {
        add('NET-A01', 'HIGH', 'Direct Persistence Instantiation in Web', r, `${r}:${lineOf(c, directInst.index)}`,
          `Web layer directly instantiates '${directInst[1]}'. Web controllers/endpoints must only consume MediatR ISender or application interfaces via DI.`,
          'Inject ISender or interface abstraction; never instantiate DbContext or Repositories directly.');
      }
    }

    // S-10 / S-11 template ASP.NET Identity API and dual bearer schemes
    const idm = c.match(/MapIdentityApi\s*<[^>]+>\s*\(\s*\)([^;]*)/);
    if (idm && !identityApi) {
      identityApi = { file: r, line: lineOf(c, idm.index), guarded: /\.\s*(RequireAuthorization|AddEndpointFilter|RequireHost)\s*\(/.test(idm[1]) };
    }
    if (/["']\/?register["']/i.test(c) && /(Forbid|NotFound|Results\.(Forbid|NotFound|StatusCode)|TypedResults\.(Forbid|NotFound|StatusCode)|AddEndpointFilter)/.test(c)) registerBlocked = true;
    if (/\.AddBearerToken\s*\(/.test(c)) bearerToken = true;
    if (/\.AddJwtBearer\s*\(/.test(c)) jwtBearer = true;

    if (/X-Frame-Options|Content-Security-Policy|frame-ancestors/i.test(c)) securityHeaders = true;
    if (/AddRateLimiter\s*\(/.test(c)) rateLimiterSeen = true;
    if (/GlobalLimiter/.test(c)) globalLimiter = true;
    ignoreFilters += (c.match(/IgnoreQueryFilters\s*\(/g) || []).length;

    // S-02 CORS open fallback
    const cors = c.match(/AllowAnyOrigin\s*\(/);
    if (cors) {
      add('NET-S02', 'HIGH', 'Permissive CORS', r, `${r}:${lineOf(c, cors.index)}`,
        '`AllowAnyOrigin()` allows every website to call the API from a browser.',
        'Fail closed: when `Cors:AllowedOrigins` is empty, register no CORS policy.');
    }

    // S-03 OpenAPI / Scalar exposure
    lines.forEach((line, i) => {
      if (/\.(MapOpenApi|MapScalarApiReference)\s*\(/.test(line)) {
        const context = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
        const guarded = /IsDevelopment\s*\(|IsEnvironment\s*\(|RequireAuthorization\s*\(/.test(context)
          || /\)\s*\.\s*RequireAuthorization\s*\(/.test(line);
        if (!guarded) {
          add('NET-S03', 'HIGH', 'API Explorer Exposed', r, `${r}:${i + 1}`,
            'OpenAPI / Scalar endpoint is mapped without an environment or authorization guard, so it is public in Production.',
            'Wrap in `if (app.Environment.IsDevelopment())` or chain `.RequireAuthorization()`.');
        }
      }
    });

    // NET-S04: MediatR requests without an authorization decision (HIGH)
    if (/\/Application\//i.test('/' + r)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const declStart = line.match(/\b(?:public\s+|internal\s+)?(?:sealed\s+)?(?:record|class)\s+([A-Za-z0-9_]+)\b/);
        if (!declStart) continue;
        const typeName = declStart[1];

        const forwardWindow = lines.slice(i, Math.min(lines.length, i + 12)).join(' ');
        const isRequest = /:\s*[^;{]*\b(IRequest|ICommand|IQuery)(?:<[^;{]*>)?\b/.test(forwardWindow);
        if (!isRequest) continue;

        totalRequests++;

        const upwardLines = [];
        for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
          const prevTrim = lines[j].trim();
          if (!prevTrim.startsWith('///')) {
            upwardLines.push(prevTrim);
          }
        }
        const upwardBlock = upwardLines.join('\n');
        const hasAuthAttr = /\[\s*(Authorize|AllowAnonymousRequest|AllowAnonymous)\b/.test(upwardBlock);

        if (!hasAuthAttr) {
          unauthorised.push(`${typeName} (${r}:${i + 1})`);
        }
      }
    }

    // NET-S12: Minimal API IEndpointGroup Authorization (HIGH)
    if (/\bclass\s+([A-Za-z0-9_]+)\s*:\s*[^{\n]*\bIEndpointGroup\b/.test(c)) {
      const groupMatch = c.match(/\bclass\s+([A-Za-z0-9_]+)\s*:\s*[^{\n]*\bIEndpointGroup\b/);
      const groupClassName = groupMatch ? groupMatch[1] : 'EndpointGroup';

      const mapSigMatch = c.match(/\bMap\s*\(\s*(?:(?:WebApplication|RouteGroupBuilder|IEndpointRouteBuilder)\s+([A-Za-z0-9_]+))/);
      const groupVars = new Set();
      if (mapSigMatch) groupVars.add(mapSigMatch[1]);

      for (const gm of c.matchAll(/(?:var|RouteGroupBuilder|IEndpointRouteBuilder)\s+([A-Za-z0-9_]+)\s*=\s*[^;\n]*\.(?:MapGroup)\(/g)) {
        groupVars.add(gm[1]);
      }

      let hasGroupAuth = false;
      if (/\.MapGroup\([^)]*\)\s*\.(?:RequireAuthorization|RequireScope)\s*\(/.test(c)) {
        hasGroupAuth = true;
      }
      for (const g of groupVars) {
        const stmtRegex = new RegExp(`\\b${g}\\s*\\.(?:RequireAuthorization|RequireScope)\\s*\\(`);
        if (stmtRegex.test(c)) {
          hasGroupAuth = true;
          break;
        }
      }

      const routeRegex = /\.(Map(Get|Post|Put|Patch|Delete))\s*\(([^;]+);/gs;
      let routeMatch;
      const unauthenticatedRoutes = [];
      const insecureMutatingAnon = [];

      while ((routeMatch = routeRegex.exec(c)) !== null) {
        const verb = routeMatch[1];
        const rest = routeMatch[3];

        const argMatch = rest.match(/^\s*(?:["']([^"']+)["']|([A-Za-z0-9_]+))/);
        const routeIdentifier = argMatch ? (argMatch[1] || argMatch[2]) : 'endpoint';

        const hasRouteAuth = /\.RequireAuthorization\s*\(/.test(rest);
        const hasAllowAnon = /\.AllowAnonymous\s*\(/.test(rest);
        const isLogin = /login/i.test(routeIdentifier) || /login/i.test(rest.split(')')[0]);
        const hasRateLimit = /\.RequireRateLimiting\s*\(/.test(rest);

        if (!hasGroupAuth && !hasRouteAuth && !hasAllowAnon) {
          unauthenticatedRoutes.push(`${verb}(${routeIdentifier})`);
        }

        const isMutating = ['MapPost', 'MapPut', 'MapPatch', 'MapDelete'].includes(verb);
        if (hasAllowAnon && isMutating) {
          if (!isLogin || !hasRateLimit) {
            insecureMutatingAnon.push(`${verb}(${routeIdentifier})`);
          }
        }
      }

      if (unauthenticatedRoutes.length > 0) {
        add('NET-S12', 'HIGH', 'Minimal API Authorization Missing', groupClassName, r,
          `IEndpointGroup '${groupClassName}' defines routes without authorization: ${unauthenticatedRoutes.slice(0, 4).join(', ')}.`,
          'Call `.RequireAuthorization()` on the RouteGroupBuilder in Map(), or explicitly chain `.RequireAuthorization()` / `.AllowAnonymous()`.');
      }

      if (insecureMutatingAnon.length > 0) {
        add('NET-S12', 'HIGH', 'Insecure Mutating AllowAnonymous', groupClassName, r,
          `Mutating endpoint in '${groupClassName}' chains .AllowAnonymous() without login rate-limit guards: ${insecureMutatingAnon.join(', ')}.`,
          'Protect mutating endpoints with `.RequireAuthorization()`. If a public mutating route is necessary (e.g. login), strictly chain `.RequireRateLimiting(...)`.');
      }
    }

    // S-08 raw SQL built from strings
    const raw = c.match(/\b(FromSqlRaw|ExecuteSqlRaw)\s*\(\s*(\$"|"[^"]*"\s*\+)/);
    if (raw) {
      add('NET-S08', 'HIGH', 'SQL Injection Risk', r, `${r}:${lineOf(c, raw.index)}`,
        '`FromSqlRaw`/`ExecuteSqlRaw` built from an interpolated or concatenated string.',
        'Use `FromSqlInterpolated` / `ExecuteSqlInterpolated` or parameters.');
    }

    // S-06 pipeline order
    if (/\bUseAuthentication\s*\(/.test(c) && /\bUseCors\s*\(/.test(c)) {
      const idx = (name) => { const m = c.match(new RegExp(`\\b${name}\\s*\\(`)); return m ? m.index : -1; };
      const routing = idx('UseRouting');
      const limiter = idx('UseRateLimiter');
      const corsI = idx('UseCors');
      const authn = idx('UseAuthentication');
      const problems = [];
      if (corsI > authn) problems.push('UseCors must run before UseAuthentication');
      if (limiter !== -1 && limiter > authn) problems.push('UseRateLimiter should run before UseAuthentication');
      if (routing !== -1 && limiter !== -1 && limiter < routing) problems.push('UseRateLimiter needs UseRouting first when endpoint policies are used');
      if (problems.length) {
        add('NET-S06', 'MEDIUM', 'Middleware Order', r, r,
          `Pipeline order: ${problems.join('; ')}.`,
          'Order: ExceptionHandler, HSTS, HTTPS redirection, Routing, RateLimiter, CORS, Authentication, Authorization, endpoints.');
      }
    }

    // -----------------------------------------------------------------------
    // NEW v4.2.0 CHECKS: NET-S13 through NET-S22
    // -----------------------------------------------------------------------

    // NET-S13: MVC/API Controller missing [Authorize], class-level [AllowAnonymous], commented FallbackPolicy, or blind AD/SSO login
    if (!/\babstract\s+class\b/.test(c)) {
      const ctrlMatch = c.match(/\bpublic\s+(?:sealed\s+)?class\s+([A-Za-z0-9_]+)\s*:\s*([^{\n]+)/);
      if (ctrlMatch && /\b(?:ControllerBase|Controller)\b/.test(ctrlMatch[2])) {
        const ctrlName = ctrlMatch[1];
        const isPublicHealthOrBranding = /^(?:Health|HealthCheck|PublicBranding|Branding)Controller$/i.test(ctrlName);
        const preClass = c.slice(0, ctrlMatch.index);
        const preWindow = preClass.split('\n').slice(-15).filter(l => !l.trim().startsWith('//')).join('\n');
        const hasClassAuthorize = /\[\s*Authorize\b/.test(preWindow);
        const hasClassAllowAnon = /\[\s*AllowAnonymous\b/.test(preWindow);

        if (hasClassAllowAnon && !isPublicHealthOrBranding && !/^AuthController$/i.test(ctrlName)) {
          add('NET-S13', 'CRITICAL', 'Class-Level [AllowAnonymous] on Controller', ctrlName, `${r}:${lineOf(c, ctrlMatch.index)}`,
            `Controller '${ctrlName}' applies [AllowAnonymous] at the class level, exposing all actions without authentication.`,
            'Apply `[Authorize]` at the class level (plus `FallbackPolicy`) and restrict `[AllowAnonymous]` to explicit login/health actions with rate limiting.');
        } else if (!hasClassAuthorize && !isPublicHealthOrBranding && !/^AuthController$/i.test(ctrlName)) {
          add('NET-S13', 'CRITICAL', 'MVC/API Controller Missing [Authorize]', ctrlName, `${r}:${lineOf(c, ctrlMatch.index)}`,
            `Controller '${ctrlName}' inherits '${ctrlMatch[2].trim()}' without a class-level [Authorize] attribute.`,
            'Decorate every non-public controller with `[Authorize]` and enforce a deny-by-default `FallbackPolicy` in `Program.cs`.');
        }

        // NET-S22: Role assignment, open Register, or Delete with bare [Authorize] only
        const hasStrongClassPolicy = /\[\s*Authorize\s*\(\s*(?:Roles|Policy)\s*=/.test(preWindow);
        if (!hasStrongClassPolicy) {
          const privAction = c.match(/\[\s*Http(?:Post|Put|Delete)\b[^\]]*\][\s\S]{0,220}?\bpublic\s+(?:async\s+)?[A-Za-z0-9_<>,\s]+\s+(AssignRole\w*|UpdateRole\w*|Delete\w*|RemoveUser\w*)\s*\(/i);
          if (privAction) {
            const actionWindow = privAction[0];
            const methodBodySlice = c.slice(privAction.index, Math.min(c.length, privAction.index + 650));
            const hasMethodPolicy = /\[\s*Authorize\s*\(\s*(?:Roles|Policy)\s*=|HasPermission|AuthorizeAsync\s*\(|IsInRole\s*\(/.test(actionWindow + methodBodySlice);
            if (!hasMethodPolicy) {
              add('NET-S22', 'CRITICAL', 'Missing Function-Level Role/Policy Check on Privileged/Delete Action', `${ctrlName}.${privAction[1]}`, `${r}:${lineOf(c, privAction.index)}`,
                `Action '${ctrlName}.${privAction[1]}' executes role assignment or destructive deletion with bare authentication and zero role/policy/ownership check.`,
                'Enforce `[Authorize(Policy = "...")]` or `[Authorize(Roles = "...")]` and verify tenant/entity ownership before mutation.');
            }
          }

          const anonRegister = c.match(/\[\s*AllowAnonymous\s*\][\s\S]{0,180}?\bpublic\s+(?:async\s+)?[A-Za-z0-9_<>,\s]+\s+(Register\w*|CreateAdmin\w*|Invite\w*)\s*\(/i);
          if (anonRegister) {
            add('NET-S22', 'CRITICAL', 'Unrestricted Anonymous Registration / Invitation Endpoint', `${ctrlName}.${anonRegister[1]}`, `${r}:${lineOf(c, anonRegister.index)}`,
              `Action '${ctrlName}.${anonRegister[1]}' allows unauthenticated account creation or team invitation.`,
              'Disable open registration or gate user provisioning behind authenticated tenant/admin invitation policies.');
          }
        }
      }
    }

    const commentedFallback = c.match(/\/\/[^\n]*FallbackPolicy|\/\*[\s\S]*?FallbackPolicy[\s\S]*?\*\//);
    if (commentedFallback) {
      add('NET-S13', 'CRITICAL', 'Commented-Out Fallback Authorization Policy', base, `${r}:${lineOf(c, commentedFallback.index)}`,
        `Deny-by-default 'FallbackPolicy' is commented out in '${r}', leaving unannotated controllers/endpoints publicly accessible.`,
        'Enable `options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();` in `AddAuthorization`.');
    }

    const blindAdSso = c.match(/\/\/[^\n]*(?:ValidateCredentials|LdapConnection|CheckPasswordAsync)|function_never_match|\b(?:LoginWindows|WindowsLogin|AdLogin)\s*\([^)]*string\s+user(?:name|Name)[^)]*\)\s*\{[\s\S]{0,400}?(?:GenerateJwt|CreateToken)/i);
    if (blindAdSso && !/ValidateCredentials|AuthenticateAsync|VerifySignature/.test(blindAdSso[0])) {
      add('NET-S13', 'CRITICAL', 'Bypassed AD / SSO Identity Verification', base, `${r}:${lineOf(c, blindAdSso.index)}`,
        `'${base}' comments out Active Directory / password verification or issues tokens from an unverified username assertion.`,
        'Enforce cryptographic token/certificate validation or server-side LDAP/AD credential verification prior to issuing session tokens (`SEC-178`).',
        ['SEC-016', 'SEC-178']);
    }

    // NET-S14: Weak JWT validation, multi-week token lifetime without rotation, or no-op Logout
    const weakJwt = c.match(/\b(ValidateLifetime|RequireHttpsMetadata|ValidateIssuerSigningKey|ValidateIssuer|ValidateAudience)\s*=\s*false\b/);
    if (weakJwt) {
      add('NET-S14', 'CRITICAL', `Insecure JWT Validation (${weakJwt[1]} = false)`, base, `${r}:${lineOf(c, weakJwt.index)}`,
        `JWT bearer configuration sets '${weakJwt[1]} = false', allowing expired, forged, or cleartext-intercepted tokens.`,
        'Set `ValidateLifetime = true`, `RequireHttpsMetadata = true`, `ValidateIssuer = true`, `ValidateAudience = true`, and `ClockSkew = TimeSpan.FromMinutes(1)`.');
    }

    const longJwt = c.match(/\bAddDays\s*\(\s*([789]|\d{2,})\s*\)|ExpiresAfterDays\s*=\s*([789]|\d{2,})/);
    if (longJwt && /JwtSecurityToken|SecurityTokenDescriptor|Jwt/i.test(c) && !/RefreshToken/i.test(c)) {
      add('NET-S14', 'CRITICAL', 'Excessive Unrotated JWT Access Token Lifetime', base, `${r}:${lineOf(c, longJwt.index)}`,
        `JWT access token in '${base}' is issued with a multi-week lifetime without refresh-token rotation.`,
        'Issue short-lived access tokens (<= 15–60 minutes) paired with rotating, revocable server-side refresh tokens.');
    }

    const noopLogout = c.match(/\bpublic\s+(?:async\s+)?(?:Task<)?IActionResult(?:>)?\s+Logout\s*\([^)]*\)\s*\{([^}]{0,220})\}/);
    if (noopLogout && !/Revoke|Delete|Blacklist|SignOutAsync|Invalidate|Remove/i.test(noopLogout[1])) {
      add('NET-S14', 'CRITICAL', 'Missing Server-Side Token Revocation on Logout', `${base}.Logout`, `${r}:${lineOf(c, noopLogout.index)}`,
        `Logout endpoint in '${base}' returns success without revoking the server-side session, refresh token, or JWT 'jti'.`,
        'Persist `jti` / refresh token state and revoke it server-side upon `Logout`, password reset, and role changes (`SEC-030`).');
    }

    // NET-S15: UseStaticFiles / UseFileServer exposing logs, exports, FileServer, or backups
    const staticLogs = c.match(/\bUse(?:StaticFiles|FileServer)\s*\([\s\S]{0,320}?(?:InnovaLogs|Logs|exports|FileServer|backups)/i);
    if (staticLogs) {
      add('NET-S15', 'CRITICAL', 'Static File Middleware Exposing Logs / Exports / FileServer', base, `${r}:${lineOf(c, staticLogs.index)}`,
        `'${base}' mounts 'UseStaticFiles'/'UseFileServer' over sensitive internal directory (Logs / InnovaLogs / exports / FileServer / backups).`,
        'Remove `UseStaticFiles` mappings for logs, exports, and uploads immediately; ship logs to internal SIEM and stream files via `[Authorize]` endpoints.');
    }

    // NET-S16: Path Traversal / LFD in download endpoints
    const pathCombine = c.match(/\b(?:Path\.Combine|Directory\.GetCurrentDirectory\s*\(\s*\)\s*\+)\s*\([^;\n]*\b(fileName|filePath|documentPath|attachmentPath|relativePath)\b/i);
    if (pathCombine) {
      const hasCanonicalCheck = /Path\.GetFullPath\s*\([\s\S]{0,250}?\.StartsWith\s*\(/i.test(c);
      if (!hasCanonicalCheck) {
        add('NET-S16', 'CRITICAL', 'Path Traversal / Local File Disclosure (LFD)', base, `${r}:${lineOf(c, pathCombine.index)}`,
          `'${base}' combines user-controlled parameter '${pathCombine[1]}' into a filesystem path without canonical 'Path.GetFullPath' root-prefix verification.`,
          'Look up opaque file UUIDs from tenant-scoped DB records and assert `Path.GetFullPath(candidate).StartsWith(allowedRoot, StringComparison.Ordinal)`.');
      }
    }

    // NET-S17: Public UseSwagger / UseSwaggerUI or unguarded / hardcoded UseHangfireDashboard
    lines.forEach((line, i) => {
      if (/\.\s*UseSwagger(?:UI)?\s*\(/.test(line) && !line.trim().startsWith('//')) {
        const context = lines.slice(Math.max(0, i - 8), i + 2).join('\n');
        const guarded = /IsDevelopment\s*\(|IsEnvironment\s*\(\s*["']Development["']\s*\)/.test(context);
        if (!guarded) {
          add('NET-S17', 'HIGH', 'Swagger / SwaggerUI Exposed Outside Development', base, `${r}:${i + 1}`,
            '`UseSwagger()` / `UseSwaggerUI()` is enabled without an `IsDevelopment()` guard, exposing full API schemas in Production.',
            'Wrap `app.UseSwagger(); app.UseSwaggerUI();` strictly inside `if (app.Environment.IsDevelopment())`.');
        }
      }
      if (/\.\s*UseHangfireDashboard\s*\(/.test(line) && !line.trim().startsWith('//')) {
        const windowText = lines.slice(i, Math.min(lines.length, i + 8)).join('\n');
        const hasAuthFilter = /Authorization\s*=/.test(windowText);
        if (!hasAuthFilter || hardcodedHangfireConfig) {
          add('NET-S17', 'HIGH', 'Unguarded or Hardcoded-Auth Hangfire Dashboard', base, `${r}:${i + 1}`,
            `Hangfire dashboard mapped in '${r}' ${hardcodedHangfireConfig ? `using hardcoded credentials from ${hardcodedHangfireConfig}` : 'without a strict admin IDashboardAuthorizationFilter'}.`,
            'Protect Hangfire with a custom `IDashboardAuthorizationFilter` bound to authenticated Admin RBAC claims and internal network ingress.');
        }
      }
    });

    // NET-S18: Disabled outbound TLS certificate verification
    const tlsBypass = c.match(/DangerousAcceptAnyServerCertificateValidator|ServerCertificateCustomValidationCallback\s*=\s*\([^)]*\)\s*=>\s*true/);
    if (tlsBypass) {
      add('NET-S18', 'HIGH', 'TLS Certificate Verification Disabled on HttpClient', base, `${r}:${lineOf(c, tlsBypass.index)}`,
        `'${base}' disables TLS server certificate validation ('${tlsBypass[0].slice(0, 48)}'), enabling Man-in-the-Middle interception.`,
        'Remove custom certificate validation overrides and trust valid CA-issued TLS 1.2+ certificates.');
    }

    // NET-S19: [DisableRequestSizeLimit] or unclamped pageSize
    const disableLimit = c.match(/\[\s*DisableRequestSizeLimit\s*\]|MaxRequestBodySize\s*=\s*null/);
    if (disableLimit) {
      add('NET-S19', 'HIGH', 'Unbounded Request Body Size ([DisableRequestSizeLimit])', base, `${r}:${lineOf(c, disableLimit.index)}`,
        `'${base}' disables HTTP request body size limits, exposing the server to disk/memory exhaustion DoS.`,
        'Replace `[DisableRequestSizeLimit]` with an explicit `[RequestSizeLimit(10_485_760)]` ceiling and streaming validation.');
    }

    const unclampedPage = c.match(/\.\s*Take\s*\(\s*(?:request\.)?pageSize\s*\)/i);
    if (unclampedPage && !/Math\.(?:Clamp|Min)\s*\(|pageSize\s*>\s*\d+\s*\?/.test(c)) {
      add('NET-S19', 'HIGH', 'Unclamped Pagination pageSize Parameter', base, `${r}:${lineOf(c, unclampedPage.index)}`,
        `'${base}' passes raw client 'pageSize' into '.Take(pageSize)' without a hard upper ceiling (e.g. pageSize=1000000 DoS).`,
        'Clamp pagination size server-side: `var safeSize = Math.Clamp(pageSize, 1, 100);`.');
    }

    // NET-S20: Commented-out UseExceptionHandler() or ex.Message / ex.ToString() leaked in HTTP response
    const commentedExHandler = c.match(/\/\/[^\n]*UseExceptionHandler\s*\(/);
    if (commentedExHandler) {
      add('NET-S20', 'HIGH', 'Global Exception Handler Disabled / Commented Out', base, `${r}:${lineOf(c, commentedExHandler.index)}`,
        `'UseExceptionHandler()' is commented out in '${r}', risking raw unhandled exception disclosure.`,
        'Enable `app.UseExceptionHandler()` mapped to a standardized RFC 9110 `ProblemDetails` handler with `traceId` only.');
    }

    const exLeak = c.match(/\b(?:BadRequest|StatusCode|Problem|Ok|JsonResult)\s*\([\s\S]{0,180}?\b(?:ex|exception|err)\.(?:Message|ToString\s*\(\s*\)|StackTrace|InnerException)/);
    if (exLeak) {
      add('NET-S20', 'HIGH', 'Exception Message / Stack Trace Leaked in API Response', base, `${r}:${lineOf(c, exLeak.index)}`,
        `'${base}' returns internal '${exLeak[0].match(/(?:ex|exception|err)\.\w+/)?.[0] || 'ex.Message'}' details directly to API callers.`,
        'Log full exception details server-side via `ILogger` and return a generic localized error message with correlation `traceId`.');
    }

    // NET-S21: Static/Plaintext OTP or Reset Token & User Enumeration
    const netStaticOtp = c.match(/(?:Otp|OtpCode|VerificationCode)\s*=\s*(?:["'](?:123456|1234|0000|000000)["']|new\s+Random\s*\()/i);
    if (netStaticOtp) {
      add('NET-S21', 'HIGH', 'Static or Weak-PRNG OTP in .NET Auth Flow', base, `${r}:${lineOf(c, netStaticOtp.index)}`,
        `Predictable or static OTP assignment detected in '${base}'.`,
        'Generate OTPs with `RandomNumberGenerator.GetInt32(100000, 1000000)`, hash before DB persistence, and enforce strict rate limiting.');
    }

    const netEnumMsg = c.match(/["'](?:User (?:not found|does not exist)|Email (?:not found|is not registered)|No account was found[^"']*|Account is inactive)["']/i);
    if (netEnumMsg && /(?:Auth|Login|Account|Password|Otp)/i.test(base)) {
      add('NET-S21', 'HIGH', 'User Enumeration Error Message in Auth Flow', base, `${r}:${lineOf(c, netEnumMsg.index)}`,
        `Auth component '${base}' exposes distinct account-existence message (${netEnumMsg[0]}).`,
        'Return uniform generic responses across login, forgot-password, and OTP endpoints.');
    }
  }

  if (identityApi) {
    const open = !identityApi.guarded && !registerBlocked;
    add('NET-S10', open ? 'HIGH' : 'MEDIUM', 'Template Identity API Exposed', identityApi.file, `${identityApi.file}:${identityApi.line}`,
      open
        ? '`MapIdentityApi` exposes anonymous register, login, refresh, forgotPassword, resetPassword and manage/* routes. Anyone can create an account, and these routes bypass the application login (rate limit, lockout, audit).'
        : '`MapIdentityApi` is mapped; the template routes (login, refresh, reset, manage) remain a second sign-in surface next to the application login.',
      'Remove `MapIdentityApi`, or map only the routes you need and block `register`; keep one login path with rate limiting, lockout and audit.');
  }

  if (bearerToken && jwtBearer) {
    add('NET-S11', 'HIGH', 'Multiple Bearer Schemes', 'Authentication', 'src/Infrastructure',
      'Both `AddBearerToken` (Identity opaque token) and `AddJwtBearer` are registered, so two token types are accepted and the weaker path stays live.',
      'Accept one scheme. Retire the Identity bearer token once template users are migrated, and remove the policy scheme that selects between them.');
  }

  if (unauthorised.length) {
    add('NET-S04', 'HIGH', 'Authorization Not Declared', 'MediatR requests', 'src/Application',
      `${unauthorised.length} of ${totalRequests} requests carry neither [Authorize] nor [AllowAnonymousRequest]; the pipeline lets them through. First: ${unauthorised.slice(0, 8).join(', ')}.`,
      'Declare `[Authorize(...)]` on every request or mark it explicitly anonymous, and add an architecture test that enforces it.');
  }

  if (rateLimiterSeen && !globalLimiter) {
    add('NET-S05', 'MEDIUM', 'Rate Limiting Coverage', 'RateLimiter', 'src/Web',
      'Rate limiting is configured only through named policies; endpoints without a policy are unlimited.',
      'Add `options.GlobalLimiter` and stricter named policies for login, upload and import endpoints.');
  } else if (!rateLimiterSeen && csFiles.some((f) => /UseAuthentication\s*\(/.test(read(f)))) {
    add('NET-S05', 'MEDIUM', 'Rate Limiting Missing', 'RateLimiter', 'src/Web',
      'No `AddRateLimiter` registration found.', 'Register a global limiter and a strict login policy.');
  }

  if (csFiles.some((f) => /UseAuthentication\s*\(/.test(read(f))) && !securityHeaders) {
    add('NET-S07', 'MEDIUM', 'Security Headers Missing', 'HTTP pipeline', 'src/Web',
      'No Content-Security-Policy / X-Frame-Options / frame-ancestors found anywhere in the code.',
      'Add a security-headers middleware: CSP, X-Frame-Options (or frame-ancestors), X-Content-Type-Options, Referrer-Policy.');
  }

  if (ignoreFilters > 0) {
    add('NET-S09', 'LOW', 'Query Filter Bypass', 'IgnoreQueryFilters', 'src/Application',
      `${ignoreFilters} use(s) of IgnoreQueryFilters().`,
      'Allowed only for read-only AsNoTracking queries with a comment that explains why (e.g. historical links).');
  }

  return findings;
}

/**
 * Scans .NET projects for performance bottlenecks (used by bin/perf-predictor.js).
 */
function scanDotNetPerformance(root) {
  const findings = [];
  let counter = 1;
  const add = (severity, category, target, location, issue, fix) => {
    findings.push({
      id: `PERF-NET-${String(counter++).padStart(3, '0')}`,
      severity,
      category,
      target,
      location,
      issue,
      fix
    });
  };

  const csFiles = [];
  walk(root, (f) => {
    if (f.endsWith('.cs') && !/\.Designer\.cs$/.test(f)) csFiles.push(f);
  });

  for (const f of csFiles) {
    const c = read(f);
    const r = rel(root, f);
    const isAppOrWeb = /(?:Application|Web)\//i.test(r);
    const isQueries = /Queries\//i.test(r);

    if (isQueries && /\bIRequestHandler<[A-Za-z0-9_]+Query/.test(c)) {
      const hasDbQuery = /\b_context\.\w+\b/.test(c) || /\bDbContext\.\w+\b/.test(c);
      const hasNoTracking = /\.AsNoTracking\s*\(/.test(c);
      if (hasDbQuery && !hasNoTracking) {
        add('MEDIUM', 'Missing AsNoTracking in Query', path.basename(f), r,
          `Query handler in '${path.basename(f)}' executes EF Core query without .AsNoTracking(), adding unnecessary change tracking overhead.`,
          'Chain `.AsNoTracking()` or project via `.Select(...)` DTO projection for read-only queries.');
      }
    }

    const loopRegex = /\b(?:foreach|for|while)\s*\([^{]+\)\s*\{([^}]+)\}/gs;
    let loopMatch;
    while ((loopMatch = loopRegex.exec(c)) !== null) {
      const loopBody = loopMatch[1];
      if (/await\s+[^;]*\.(?:FirstOrDefaultAsync|SingleOrDefaultAsync|ToListAsync|CountAsync|AnyAsync)\s*\(/.test(loopBody)) {
        add('CRITICAL', 'Database Query in Loop (N+1)', path.basename(f), `${r}:${lineOf(c, loopMatch.index)}`,
          `Asynchronous EF Core query executed inside a loop in '${path.basename(f)}'. This causes synchronous N+1 roundtrips.`,
          'Batch query upfront using `.Where(x => ids.Contains(x.Id)).ToListAsync()` and group in memory.');
      }
    }

    if (isAppOrWeb) {
      const syncMatch = c.match(/\.(?:Result|Wait\(\))\b/);
      if (syncMatch && !/Task\.CompletedTask/.test(c)) {
        add('HIGH', 'Sync-Over-Async Blocking', path.basename(f), `${r}:${lineOf(c, syncMatch.index)}`,
          `Blocking call ('.Result' or '.Wait()') detected on an asynchronous Task in '${path.basename(f)}', risking thread pool starvation.`,
          'Refactor calling method to `async Task` and `await` the operation.');
      }
    }

    if (isQueries) {
      const unboundedList = c.match(/\b_context\.\w+[^;]*\.ToListAsync\s*\(/);
      if (unboundedList) {
        if (!/\.Take\s*\(/.test(c) && !/\.PaginatedListAsync\s*\(/.test(c) && !/PageSize|PageNumber/i.test(c)) {
          add('HIGH', 'Unbounded Dataset Query', path.basename(f), `${r}:${lineOf(c, unboundedList.index)}`,
            `Unbounded '.ToListAsync()' query in '${path.basename(f)}' without .Take() or PaginatedListAsync helper, risking memory exhaustion.`,
            'Enforce pagination using `.Take(Math.Min(pageSize, 100))` or `PaginatedListAsync.CreateAsync(...)`.');
        }
      }
    }
  }

  return findings;
}

/**
 * Extracts a balanced `{ ... }` or `( ... )` body starting at `openIndex`.
 * Handles strings (`"..."`, `@"..."`, `'...'`) and single/multi-line comments safely.
 */
function extractBalancedSpan(text, openIndex, openChar = '{', closeChar = '}') {
  if (openIndex < 0 || openIndex >= text.length || text[openIndex] !== openChar) {
    return null;
  }
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let inVerbatimString = false;
  let inChar = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] || '';

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inVerbatimString) {
      if (ch === '"') {
        if (next === '"') i++;
        else inVerbatimString = false;
      }
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (inChar) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '\'') inChar = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if ((ch === '@' || (ch === '$' && next === '@')) && text.slice(i, i + 3).includes('"')) {
      const qIdx = text.indexOf('"', i);
      if (qIdx !== -1 && qIdx - i <= 2) {
        inVerbatimString = true;
        i = qIdx;
        continue;
      }
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '\'') {
      inChar = true;
      continue;
    }

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return {
          start: openIndex,
          end: i,
          inner: text.slice(openIndex + 1, i),
          full: text.slice(openIndex, i + 1)
        };
      }
    }
  }
  return null;
}

/** Splits comma-separated arguments only at top-level delimiter depth. */
function splitTopLevelArgs(argString) {
  const args = [];
  if (!argString || !argString.trim()) return args;
  let current = '';
  let parenDepth = 0;
  let angleDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inString = false;
  let inChar = false;

  for (let i = 0; i < argString.length; i++) {
    const ch = argString[i];
    if (inString) {
      current += ch;
      if (ch === '\\' && i + 1 < argString.length) {
        current += argString[++i];
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (inChar) {
      current += ch;
      if (ch === '\\' && i + 1 < argString.length) {
        current += argString[++i];
      } else if (ch === '\'') {
        inChar = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '\'') {
      inChar = true;
      current += ch;
      continue;
    }

    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '<') angleDepth++;
    else if (ch === '>') angleDepth = Math.max(0, angleDepth - 1);
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === ',' && parenDepth === 0 && angleDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (current.trim()) args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function mapCSharpTypeToOpenApi(rawType) {
  const cleaned = String(rawType || 'string').trim();
  const nullable = cleaned.endsWith('?');
  const base = cleaned.replace(/\?$/, '').trim();

  if (/^(?:IReadOnlyCollection|IReadOnlyList|IList|ICollection|List|IEnumerable)<(.+)>$/i.test(base)) {
    const inner = base.match(/^[^<]+<(.+)>$/)[1];
    return { type: 'array', items: mapCSharpTypeToOpenApi(inner), nullable };
  }
  if (base.endsWith('[]')) {
    const inner = base.slice(0, -2);
    if (inner === 'byte') {
      return { type: 'string', format: 'byte', nullable };
    }
    return { type: 'array', items: mapCSharpTypeToOpenApi(inner), nullable };
  }
  const lower = base.toLowerCase();
  if (lower === 'int' || lower === 'int32') return { type: 'integer', format: 'int32', nullable };
  if (lower === 'long' || lower === 'int64') return { type: 'integer', format: 'int64', nullable };
  if (lower === 'decimal' || lower === 'double' || lower === 'float') return { type: 'number', nullable };
  if (lower === 'bool' || lower === 'boolean') return { type: 'boolean', nullable };
  if (lower === 'guid') return { type: 'string', format: 'uuid', nullable };
  if (lower === 'datetime' || lower === 'datetimeoffset') return { type: 'string', format: 'date-time', nullable };
  if (lower === 'dateonly') return { type: 'string', format: 'date', nullable };
  if (lower === 'string') return { type: 'string', nullable };
  if (lower === 'iformfile') return { type: 'string', format: 'binary', nullable };
  return { type: 'string', xCSharpType: base, nullable };
}

function toCamelCaseProp(name) {
  const s = String(name || '').trim();
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function extractLeadingDocText(prefixChunk) {
  const slice = String(prefixChunk || '').slice(-900);
  const summaryAttr = slice.match(/\[EndpointSummary\(\s*"([^"]+)"\s*\)\]/);
  const descAttr = slice.match(/\[EndpointDescription\(\s*"([^"]+)"\s*\)\]/);
  const xmlSum = slice.match(/\/\/\/\s*<summary>\s*([\s\S]*?)\s*\/\/\/\s*<\/summary>/);
  const cleanXml = xmlSum ? xmlSum[1].replace(/\/\/\/\s*/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
  return {
    summary: summaryAttr ? summaryAttr[1].trim() : cleanXml,
    description: descAttr ? descAttr[1].trim() : cleanXml
  };
}

function collectCsFiles(root, predicate) {
  const files = [];
  walk(root, f => {
    if (!f.endsWith('.cs') || /\.Designer\.cs$/i.test(f)) return;
    const r = rel(root, f);
    if (/(^|\/)(bin|obj|Migrations)\//i.test(r)) return;
    if (!predicate || predicate(r, f)) files.push({ full: f, rel: r });
  });
  return files;
}

/**
 * Extracts rich C# DTO / Command / Query schemas & [Authorize] attributes from Application & Web layers.
 */
function indexCSharpSchemas(projectRoot) {
  const schemas = new Map();
  const csFiles = collectCsFiles(projectRoot, r => /(^|\/)src\/(Application|Web|Domain)\//i.test(r) || /^(Application|Web)\//i.test(r));

  for (const { full, rel: r } of csFiles) {
    const content = read(full);
    if (!content) continue;

    // 1. Positional record declarations: public record Foo(string? Bar, int Baz = 0)
    const posRecRegex = /(?:((?:\[Authorize[^\]]*\]|\[AllowAnonymous[^\]]*\]|\s)*))\bpublic\s+(?:sealed\s+|partial\s+)?(?:record|class)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*:\s*([^{\n;]+))?/g;
    for (const m of content.matchAll(posRecRegex)) {
      const preChunk = content.slice(Math.max(0, m.index - 400), m.index);
      const authMatches = Array.from(preChunk.matchAll(/\[Authorize(?:\(([^)]*)\))?\]/g)).map(a => (a[1] || 'Authorized').trim());
      const allowAnon = /\[AllowAnonymous/i.test(preChunk);
      const name = m[2];
      if (!name || /^(Entity|BaseEntity|BaseAuditableEntity)$/i.test(name)) continue;

      const args = splitTopLevelArgs(m[3]);
      const properties = [];
      for (const arg of args) {
        const cleanArg = arg.replace(/\[[^\]]+\]\s*/g, '').replace(/\s*=\s*[^=]+$/, '').trim();
        const pm = cleanArg.match(/^(.+?)\s+([A-Za-z0-9_]+)$/);
        if (!pm) continue;
        const propType = pm[1].trim();
        const propName = pm[2].trim();
        properties.push({
          name: propName,
          camelName: toCamelCaseProp(propName),
          rawType: propType,
          openApi: mapCSharpTypeToOpenApi(propType)
        });
      }

      const existing = schemas.get(name) || { name, properties: [], authorize: [], allowAnonymous: false, sourceFile: r };
      for (const p of properties) {
        if (!existing.properties.some(x => x.name === p.name)) existing.properties.push(p);
      }
      for (const a of authMatches) {
        if (!existing.authorize.includes(a)) existing.authorize.push(a);
      }
      if (allowAnon) existing.allowAnonymous = true;
      schemas.set(name, existing);
    }

    // 2. Class/record body property declarations: public record Foo : IRequest<...> { public string? Name { get; init; } }
    const blockDeclRegex = /\bpublic\s+(?:sealed\s+|partial\s+)?(?:record|class)\s+([A-Za-z0-9_]+)(?:<[^>]+>)?(?:\s*\([^)]*\))?(?:\s*:\s*([^{\n]+))?\s*\{/g;
    for (const m of content.matchAll(blockDeclRegex)) {
      const name = m[1];
      if (!name || /Handler$|Validator$|Endpoints$|Configuration$/.test(name)) continue;
      const braceIdx = m.index + m[0].length - 1;
      const span = extractBalancedSpan(content, braceIdx, '{', '}');
      if (!span) continue;

      const preChunk = content.slice(Math.max(0, m.index - 400), m.index);
      const authMatches = Array.from(preChunk.matchAll(/\[Authorize(?:\(([^)]*)\))?\]/g)).map(a => (a[1] || 'Authorized').trim());
      const allowAnon = /\[AllowAnonymous/i.test(preChunk);

      const existing = schemas.get(name) || { name, properties: [], authorize: [], allowAnonymous: false, sourceFile: r };
      for (const a of authMatches) {
        if (!existing.authorize.includes(a)) existing.authorize.push(a);
      }
      if (allowAnon) existing.allowAnonymous = true;

      for (const pm of span.inner.matchAll(/\bpublic\s+(?:required\s+|virtual\s+|override\s+)?([A-Za-z0-9_<>\[\]?,.\s]+?)\s+([A-Za-z0-9_]+)\s*\{\s*get;/g)) {
        const rawType = pm[1].trim().replace(/\s+/g, ' ');
        const propName = pm[2].trim();
        if (/\b(?:static|const|readonly)\b/.test(rawType)) continue;
        if (!existing.properties.some(x => x.name === propName)) {
          existing.properties.push({
            name: propName,
            camelName: toCamelCaseProp(propName),
            rawType,
            openApi: mapCSharpTypeToOpenApi(rawType)
          });
        }
      }
      schemas.set(name, existing);
    }
  }

  return schemas;
}

/**
 * Scans .NET Domain Entities, EF Core Configurations, and Foreign Key / Navigation relationships
 * so Reverse Architecture Synthesizer generates real ERDs without hardcoded templates.
 */
function scanDotNetEntities(projectRoot) {
  const entityMap = new Map();
  const dbSets = new Map();
  const explicitTables = new Map();
  const relationships = [];
  const seenRels = new Set();

  function addRelationship(from, to, fk, label) {
    const cleanFrom = String(from || '').trim();
    const cleanTo = String(to || '').trim();
    if (!cleanFrom || !cleanTo || cleanFrom === cleanTo) return;
    const key = `${cleanFrom}->${cleanTo}:${fk || label || ''}`;
    if (seenRels.has(key)) return;
    seenRels.add(key);
    relationships.push({
      from: cleanFrom,
      to: cleanTo,
      fk: fk || `${cleanFrom}Id`,
      label: label || fk || 'has'
    });
  }

  const csFiles = collectCsFiles(projectRoot);
  for (const { full, rel: r } of csFiles) {
    const content = read(full);
    if (!content) continue;

    for (const m of content.matchAll(/DbSet<([A-Za-z0-9_]+)>\s+([A-Za-z0-9_]+)/g)) {
      dbSets.set(m[1], m[2]);
    }

    for (const cfg of content.matchAll(/class\s+\w+\s*:\s*IEntityTypeConfiguration<([A-Za-z0-9_]+)>\s*\{/g)) {
      const entityName = cfg[1];
      const span = extractBalancedSpan(content, cfg.index + cfg[0].length - 1, '{', '}');
      if (!span) continue;
      const body = span.inner;
      const t = body.match(/ToTable\(\s*"([^"]+)"/);
      if (t) explicitTables.set(entityName, t[1]);

      // builder.HasOne<Target>().WithMany().HasForeignKey(x => x.TargetId)
      for (const relM of body.matchAll(/HasOne<([A-Za-z0-9_]+)>\([^)]*\)\s*\.With(?:Many|One)\([^)]*\)\s*(?:\.HasForeignKey\((?:[A-Za-z0-9_]+\s*=>\s*[A-Za-z0-9_]+\.([A-Za-z0-9_]+)|"([^"]+)")\))?/g)) {
        addRelationship(relM[1], entityName, relM[2] || relM[3] || `${relM[1]}Id`, relM[2] || relM[3]);
      }
      // builder.HasMany(e => e.Children).WithOne(...).HasForeignKey(c => c.ParentId)
      for (const relM of body.matchAll(/HasMany\([A-Za-z0-9_]+\s*=>\s*[A-Za-z0-9_]+\.([A-Za-z0-9_]+)\)[^;]*?WithOne\([^)]*\)\s*(?:\.HasForeignKey\([A-Za-z0-9_]+\s*=>\s*[A-Za-z0-9_]+\.([A-Za-z0-9_]+)\))?/g)) {
        relationships.push({
          from: entityName,
          toNavProp: relM[1],
          to: null,
          fk: relM[2] || `${entityName}Id`,
          label: relM[2] || relM[1]
        });
      }
    }

    if (!/(^|\/)(?:src\/)?Domain\/Entities\//i.test(r)) continue;

    for (const m of content.matchAll(/\bpublic\s+(?:sealed\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)(?:\s*:\s*([^{\n]+))?\s*\{/g)) {
      const className = m[1];
      const bases = (m[2] || '').trim();
      const span = extractBalancedSpan(content, m.index + m[0].length - 1, '{', '}');
      if (!span) continue;

      if (/\b(?:abstract)\b/.test(m[0])) continue;
      if (/^(?:BaseEntity|BaseAuditableEntity|ValueObject)$/.test(className)) continue;

      const fields = [{ name: 'Id', type: 'int', isPk: true, isFk: false }];
      const navProps = {};
      const collections = [];

      for (const pm of span.inner.matchAll(/\bpublic\s+(?:required\s+|virtual\s+)?([A-Za-z0-9_<>\[\]?.\s]+?)\s+([A-Za-z0-9_]+)\s*\{\s*(?:public\s+)?get;/g)) {
        const rawType = pm[1].trim().replace(/\s+/g, ' ');
        const propName = pm[2].trim();
        if (/\b(?:static|const|readonly)\b/.test(rawType) || propName === 'Id') continue;

        const collMatch = rawType.match(/^(?:IList|List|ICollection|IReadOnlyCollection|IReadOnlyList|IEnumerable|HashSet)<([A-Za-z0-9_]+)>$/);
        if (collMatch) {
          navProps[propName] = collMatch[1];
          collections.push({ prop: propName, targetEntity: collMatch[1] });
          continue;
        }

        const cleanType = rawType.replace(/\?$/, '').trim();
        const isScalar = /^(?:int|long|short|byte|bool|string|decimal|double|float|Guid|DateTime|DateTimeOffset|DateOnly|byte\[\]|string\[\])$/i.test(cleanType);
        const isFk = propName.endsWith('Id') && !propName.endsWith('Guid');
        fields.push({
          name: propName,
          type: cleanType.replace(/\[\]/g, '_array'),
          isPk: false,
          isFk
        });
        if (!isScalar && /^[A-Z]/.test(cleanType)) {
          addRelationship(cleanType, className, `${propName}Id`, propName);
        }
      }

      entityMap.set(className, {
        name: className,
        table: explicitTables.get(className) || dbSets.get(className) || className,
        bases,
        file: r,
        fields,
        navProps,
        collections
      });
    }
  }

  // Finalize table names & resolve HasMany navigation target entity names
  const resolvedRelationships = [];
  seenRels.clear();

  for (const ent of entityMap.values()) {
    ent.table = explicitTables.get(ent.name) || dbSets.get(ent.name) || ent.name;
    for (const c of ent.collections) {
      if (entityMap.has(c.targetEntity) && c.targetEntity !== ent.name) {
        const fkGuess = `${ent.name.replace(/s$/, '')}Id`;
        const key = `${ent.name}->${c.targetEntity}:${c.prop}`;
        if (!seenRels.has(key)) {
          seenRels.add(key);
          resolvedRelationships.push({ from: ent.name, to: c.targetEntity, fk: fkGuess, label: c.prop });
        }
      }
    }
  }

  for (const relItem of relationships) {
    let target = relItem.to;
    if (!target && relItem.toNavProp && entityMap.has(relItem.from)) {
      target = entityMap.get(relItem.from).navProps[relItem.toNavProp] || null;
    }
    if (target && entityMap.has(relItem.from) && entityMap.has(target) && relItem.from !== target) {
      const key = `${relItem.from}->${target}:${relItem.fk || relItem.label}`;
      if (!seenRels.has(key)) {
        seenRels.add(key);
        resolvedRelationships.push({
          from: relItem.from,
          to: target,
          fk: relItem.fk || `${relItem.from}Id`,
          label: relItem.label || relItem.fk || 'has'
        });
      }
    }
  }

  // Infer FK edges by EntityName + "Id" when no explicit config existed
  const entityNames = Array.from(entityMap.keys());
  for (const ent of entityMap.values()) {
    for (const f of ent.fields) {
      if (!f.isFk || f.name.endsWith('UserId')) continue;
      const stem = f.name.slice(0, -2);
      const matchEnt = entityNames.find(en => en !== ent.name && (en === stem || en.endsWith(stem)));
      if (matchEnt) {
        const key = `${matchEnt}->${ent.name}:${f.name}`;
        if (!seenRels.has(key)) {
          seenRels.add(key);
          resolvedRelationships.push({ from: matchEnt, to: ent.name, fk: f.name, label: f.name });
        }
      }
    }
  }

  return {
    entities: Array.from(entityMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    relationships: resolvedRelationships
  };
}

function joinRoutePaths(prefix, sub) {
  const cleanPrefix = '/' + String(prefix || '').replace(/^\/+|\/+$/g, '');
  const cleanSub = String(sub || '').trim().replace(/^\/+|\/+$/g, '');
  let joined = cleanSub ? (cleanPrefix === '/' ? `/${cleanSub}` : `${cleanPrefix}/${cleanSub}`) : cleanPrefix;
  if (!joined.startsWith('/')) joined = '/' + joined;
  if (joined.length > 1) joined = joined.replace(/\/+$/, '');
  return joined;
}

function normalizeOpenApiRoute(rawRoute) {
  const pathParams = [];
  const openApiPath = String(rawRoute || '/')
    .replace(/\{([A-Za-z0-9_]+)(?::([A-Za-z0-9_]+))?\}/g, (_, paramName, constraint) => {
      let type = 'string';
      let format;
      const c = String(constraint || '').toLowerCase();
      if (c === 'int' || c === 'long') {
        type = 'integer';
        format = c === 'long' ? 'int64' : 'int32';
      } else if (c === 'guid') {
        type = 'string';
        format = 'uuid';
      } else if (c === 'bool') {
        type = 'boolean';
      }
      pathParams.push({ name: paramName, type, format });
      return `{${paramName}}`;
    });
  return { openApiPath, pathParams };
}

function toGroupSlug(name) {
  return String(name || 'core')
    .replace(/Endpoints?$/i, '')
    .replace(/Group$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'core';
}

/**
 * Scans .NET 10 Minimal APIs (`src/Web/Endpoints/*.cs`, `*Endpoints.cs`, `Program.cs`),
 * extracting MapGroup/RoutePrefix, MapGet/Post/Put/Patch/Delete routes (both standard ASP.NET
 * and EndpointRouteBuilderExtensions overloads), auth policies, and DTO/Command request schemas.
 */
function scanDotNetMinimalApis(projectRoot) {
  const schemaIndex = indexCSharpSchemas(projectRoot);
  const endpoints = [];
  const groupsMap = new Map();
  const seenKeys = new Set();

  const endpointFiles = collectCsFiles(projectRoot, r => {
    const norm = '/' + r;
    return /\/Web\/Endpoints\/.+\.cs$/i.test(norm) ||
      /Endpoints\.cs$/i.test(r) ||
      /(?:^|\/)Program\.cs$/i.test(r);
  });

  const primitiveTypes = new Set([
    'string', 'int', 'long', 'short', 'byte', 'bool', 'boolean', 'decimal', 'double', 'float',
    'guid', 'datetime', 'datetimeoffset', 'dateonly', 'cancellationtoken', 'isender', 'httpcontext',
    'httprequest', 'httpresponse', 'claimsprincipal'
  ]);

  function parseHandlerMethodInfo(classBody, handlerName) {
    const fnRegex = new RegExp(
      `\\bpublic\\s+(?:static\\s+)?(?:async\\s+)?(?:Task<([^>]+)>|IResult|Task|ActionResult<([^>]+)>)\\s+${handlerName}\\s*\\(([\\s\\S]*?)\\)\\s*(?:=>|\\{)`,
      'g'
    );
    const fnMatch = fnRegex.exec(classBody);
    if (!fnMatch) return null;

    const docs = extractLeadingDocText(classBody.slice(Math.max(0, fnMatch.index - 800), fnMatch.index));
    const returnRaw = fnMatch[1] || fnMatch[2] || '';
    let returnDtoName = null;
    const retDtoM = returnRaw.match(/(?:Ok|Created|Accepted)<([A-Za-z0-9_]+)(?:<([A-Za-z0-9_]+)>)?/);
    if (retDtoM) {
      returnDtoName = retDtoM[2] || retDtoM[1];
    } else if (returnRaw && !/^(?:IResult|NoContent|Task)$/i.test(returnRaw.trim())) {
      returnDtoName = returnRaw.trim();
    }

    const params = splitTopLevelArgs(fnMatch[3] || '');
    const queryParams = [];
    let bodyTypeName = null;
    let isMultipart = false;
    const handlerScalarParams = [];

    // Locate method body slice (until next public method or end of class)
    const afterSig = classBody.slice(fnMatch.index + fnMatch[0].length, Math.min(classBody.length, fnMatch.index + fnMatch[0].length + 2500));
    const nextMethodIdx = afterSig.search(/\n\s*(?:\[Endpoint|\/\/\/\s*<summary>|\bpublic\s+static)/);
    const methodBody = nextMethodIdx !== -1 ? afterSig.slice(0, nextMethodIdx) : afterSig;

    for (const p of params) {
      const cleanP = p.replace(/\[[^\]]+\]\s*/g, '').replace(/\s*=\s*[^=]+$/, '').trim();
      const pm = cleanP.match(/^([A-Za-z0-9_<>\[\]?.,\s]+?)\s+([A-Za-z0-9_]+)$/);
      if (!pm) continue;
      const pType = pm[1].trim().replace(/\s+/g, ' ');
      const pName = pm[2].trim();
      const baseLower = pType.replace(/[?\[\]]/g, '').trim().toLowerCase();

      if (['isender', 'cancellationtoken', 'httpcontext', 'httpresponse', 'claimsprincipal'].includes(baseLower)) {
        continue;
      }
      if (baseLower === 'httprequest') {
        const readBodyM = methodBody.match(/ReadBody<([A-Za-z0-9_]+)>/);
        if (readBodyM) bodyTypeName = readBodyM[1];
        else if (/Form\.Files|IFormFile|ReadFormAsync/i.test(methodBody)) isMultipart = true;
        continue;
      }
      if (baseLower === 'iformfile' || baseLower === 'iformfilecollection') {
        isMultipart = true;
        bodyTypeName = pType;
        continue;
      }
      const baseClean = pType.replace(/\?$/, '').replace(/\[\]$/, '').trim();
      if (primitiveTypes.has(baseClean.toLowerCase()) || /\[\]$/.test(pType.replace(/\?$/, ''))) {
        handlerScalarParams.push({ name: pName, rawType: pType, openApi: mapCSharpTypeToOpenApi(pType) });
      } else if (!bodyTypeName) {
        bodyTypeName = baseClean;
      }
    }

    // Also resolve MediatR Command/Query auth or schema properties
    let commandName = null;
    const mediatrSend = methodBody.match(/new\s+([A-Za-z0-9_]+(?:Command|Query))\b/);
    if (mediatrSend) commandName = mediatrSend[1];
    if (!commandName && bodyTypeName && /(?:Command|Query)$/.test(bodyTypeName)) {
      commandName = bodyTypeName;
    }

    const commandSchema = commandName ? schemaIndex.get(commandName) : null;
    const bodySchema = bodyTypeName ? (schemaIndex.get(bodyTypeName) || commandSchema) : null;

    return {
      summary: docs.summary,
      description: docs.description,
      returnDtoName,
      bodyTypeName: bodyTypeName || commandName || null,
      bodySchema: bodySchema || null,
      isMultipart,
      handlerScalarParams,
      queryParams,
      commandAuthorize: commandSchema?.authorize || [],
      commandAllowAnonymous: Boolean(commandSchema?.allowAnonymous)
    };
  }

  for (const { full, rel: r } of endpointFiles) {
    const content = read(full);
    if (!content) continue;

    const classBlocks = [];
    for (const cm of content.matchAll(/\bpublic\s+(?:sealed\s+)?class\s+([A-Za-z0-9_]+)\s*:\s*([^{\n]+)\s*\{/g)) {
      const className = cm[1];
      const baseTypes = cm[2];
      if (!/\b(?:IEndpointGroup|EndpointGroupBase)\b/.test(baseTypes) && !/Endpoints?$/i.test(className)) continue;
      const span = extractBalancedSpan(content, cm.index + cm[0].length - 1, '{', '}');
      if (!span) continue;
      classBlocks.push({
        groupName: className,
        classXmlSummary: extractLeadingDocText(content.slice(Math.max(0, cm.index - 500), cm.index)).summary,
        body: span.inner,
        isEndpointGroup: /\b(?:IEndpointGroup|EndpointGroupBase)\b/.test(baseTypes)
      });
    }

    // Support minimal Program.cs or static map files with explicit MapGroup / MapGet outside a group class
    if (classBlocks.length === 0 && /\.Map(?:Get|Post|Put|Patch|Delete)\s*\(/.test(content)) {
      classBlocks.push({
        groupName: path.basename(r, '.cs').replace(/^Program$/, 'Core'),
        classXmlSummary: '',
        body: content,
        isEndpointGroup: false
      });
    }

    for (const blk of classBlocks) {
      const { groupName, body, isEndpointGroup, classXmlSummary } = blk;
      const routePrefixMatch = body.match(/RoutePrefix\s*(?:=>|=)\s*"([^"]+)"/);
      let defaultPrefix = routePrefixMatch
        ? routePrefixMatch[1].trim()
        : (isEndpointGroup ? `/api/${groupName}` : '/api');

      // Map builder variable prefixes (e.g., `var group = app.MapGroup("/items").RequireAuthorization();`)
      const builderPrefixes = new Map();
      const builderAuth = new Map();

      if (body.includes('groupBuilder')) {
        builderPrefixes.set('groupBuilder', defaultPrefix);
        if (/\bgroupBuilder\.RequireAuthorization\s*\(/.test(body)) {
          const authArg = body.match(/groupBuilder\.RequireAuthorization\(\s*(?:new\[\]\s*)?([^)]*)\)/);
          builderAuth.set('groupBuilder', authArg && authArg[1].trim() ? `RequireAuthorization(${authArg[1].replace(/["']/g, '').trim()})` : 'RequireAuthorization');
        }
      }

      for (const mg of body.matchAll(/(?:(?:var|RouteGroupBuilder)\s+([A-Za-z0-9_]+)\s*=\s*)?([A-Za-z0-9_]+)\.MapGroup\(\s*(?:"([^"]+)"|this)\s*\)([^;]*);/g)) {
        const varName = mg[1] || mg[2];
        const litPrefix = mg[3] ? mg[3].trim() : defaultPrefix;
        const chained = mg[4] || '';
        const resolvedPrefix = mg[3] && !litPrefix.startsWith('/api') && isEndpointGroup && defaultPrefix !== '/api'
          ? joinRoutePaths(defaultPrefix, litPrefix)
          : litPrefix;
        if (!routePrefixMatch && !isEndpointGroup && mg[3]) {
          defaultPrefix = litPrefix;
        }
        builderPrefixes.set(varName, resolvedPrefix);
        const reqAuth = chained.match(/\.RequireAuthorization\(\s*([^)]*)\)/);
        if (reqAuth) {
          builderAuth.set(varName, reqAuth[1].trim() ? `RequireAuthorization(${reqAuth[1].replace(/["']/g, '').trim()})` : 'RequireAuthorization');
        } else if (/\.AllowAnonymous\s*\(/.test(chained)) {
          builderAuth.set(varName, 'AllowAnonymous');
        }
      }

      // Parse every .MapGet/Post/Put/Patch/Delete(...) chain (whether single-line or multi-line fluent chain)
      const mapCallRegex = /([A-Za-z0-9_]+(?:\s*\.\s*MapGroup\(\s*"([^"]+)"\s*\))?(?:[^;{}]*?))?\.Map(Get|Post|Put|Patch|Delete)\s*\(/g;
      for (const mc of body.matchAll(mapCallRegex)) {
        const prefixExpr = mc[1] || '';
        const inlineGroupPrefix = mc[2] || '';
        const verb = mc[3].toUpperCase();
        const parenIdx = mc.index + mc[0].length - 1;
        const parenSpan = extractBalancedSpan(body, parenIdx, '(', ')');
        if (!parenSpan) continue;

        // Read trailing fluent chain up to semicolon
        const afterParen = body.slice(parenSpan.end + 1);
        const semiIdx = afterParen.indexOf(';');
        const chainSuffix = semiIdx !== -1 ? afterParen.slice(0, semiIdx) : afterParen.slice(0, 200);

        const callArgs = splitTopLevelArgs(parenSpan.inner);
        if (callArgs.length === 0) continue;

        let subRoute = '';
        let handlerExpr = '';
        const firstArg = callArgs[0].trim();
        const firstStrM = firstArg.match(/^\$?"([^"]*)"$/);

        if (firstStrM) {
          // Standard ASP.NET Core: .MapGet("/route", handler)
          subRoute = firstStrM[1];
          handlerExpr = callArgs[1] ? callArgs[1].trim() : `${verb.toLowerCase()}Handler`;
        } else {
          // EndpointRouteBuilderExtensions overload: .MapGet(Handler) or .MapGet(Handler, "subroute")
          handlerExpr = firstArg;
          if (callArgs[1]) {
            const secondStrM = callArgs[1].trim().match(/^\$?"([^"]*)"$/);
            if (secondStrM) subRoute = secondStrM[1];
          }
        }

        if (firstArg.startsWith('$"') || subRoute.includes('{')) {
          subRoute = subRoute
            .replace(/\{\{([A-Za-z0-9_:]+)\}\}/g, '{$1}')
            .replace(/\{[^{}]*\.[^{}]*\}/g, '');
        }

        const targetVarMatch = prefixExpr.trim().match(/([A-Za-z0-9_]+)$/);
        const targetVar = targetVarMatch ? targetVarMatch[1] : '';
        const basePrefix = inlineGroupPrefix || builderPrefixes.get(targetVar) || defaultPrefix;
        const combinedRaw = joinRoutePaths(basePrefix, subRoute);
        const { openApiPath, pathParams } = normalizeOpenApiRoute(combinedRaw);

        const cleanHandlerName = /^[A-Za-z0-9_]+$/.test(handlerExpr)
          ? handlerExpr
          : (handlerExpr.includes('=>') ? 'InlineLambda' : handlerExpr.slice(0, 40));

        const handlerInfo = /^[A-Za-z0-9_]+$/.test(cleanHandlerName)
          ? parseHandlerMethodInfo(body, cleanHandlerName)
          : null;

        // Filter query parameters = handler scalar params that are NOT route path parameters
        const pathParamNames = new Set(pathParams.map(p => p.name.toLowerCase()));
        const queryParams = (handlerInfo?.handlerScalarParams || []).filter(p => {
          if (pathParamNames.has(p.name.toLowerCase())) return false;
          // DELETE may take simple query params like rowVersion
          return ['GET', 'DELETE'].includes(verb);
        });

        // Resolve authorization policy
        let authPolicy = builderAuth.get(targetVar) || 'None';
        if (/\.AllowAnonymous\s*\(/.test(chainSuffix) || /\.AllowAnonymous\s*\(/.test(prefixExpr)) {
          authPolicy = 'AllowAnonymous';
        } else {
          const epReqAuth = chainSuffix.match(/\.RequireAuthorization\(\s*([^)]*)\)/);
          if (epReqAuth) {
            authPolicy = epReqAuth[1].trim()
              ? `RequireAuthorization(${epReqAuth[1].replace(/["']/g, '').trim()})`
              : 'RequireAuthorization';
          } else if (handlerInfo?.commandAuthorize?.length > 0) {
            authPolicy = handlerInfo.commandAuthorize.join('; ');
          } else if (authPolicy === 'None' && handlerInfo?.commandAllowAnonymous) {
            authPolicy = 'AllowAnonymous';
          }
        }

        const dedupeKey = `${verb}:${openApiPath}:${cleanHandlerName}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const groupSlug = toGroupSlug(groupName);
        const epRecord = {
          method: verb,
          route: openApiPath,
          rawRoute: combinedRaw,
          groupName,
          groupSlug,
          groupPrefix: basePrefix,
          authPolicy,
          isAnonymous: authPolicy === 'AllowAnonymous',
          handler: cleanHandlerName,
          requestDto: handlerInfo?.bodyTypeName || null,
          requestSchema: handlerInfo?.bodySchema || null,
          isMultipart: Boolean(handlerInfo?.isMultipart),
          responseDto: handlerInfo?.returnDtoName || null,
          responseSchema: handlerInfo?.returnDtoName ? (schemaIndex.get(handlerInfo.returnDtoName) || null) : null,
          pathParams,
          queryParams,
          summary: handlerInfo?.summary || `${verb} ${openApiPath}`,
          description: handlerInfo?.description || classXmlSummary || `${cleanHandlerName} endpoint in ${groupName}`,
          sourceFile: r
        };

        endpoints.push(epRecord);

        if (!groupsMap.has(groupSlug)) {
          groupsMap.set(groupSlug, {
            groupName,
            groupSlug,
            routePrefix: basePrefix,
            description: classXmlSummary || `Endpoints for ${groupName}`,
            sourceFile: r,
            endpoints: []
          });
        }
        groupsMap.get(groupSlug).endpoints.push(epRecord);
      }
    }
  }

  return {
    endpoints,
    groups: Array.from(groupsMap.values()),
    schemas: Object.fromEntries(schemaIndex.entries())
  };
}

module.exports = {
  isDotNetProject,
  scanCSharpFile,
  auditDotNet,
  scanDotNetPerformance,
  scanDotNetEntities,
  scanDotNetMinimalApis,
  walk
};
