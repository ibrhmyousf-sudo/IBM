/**
 * Laravel / CakePHP / PHP Deterministic Security Scanner (v4.2.0)
 * Implements LAR-S01..LAR-S08 mapped to Project Security Delivery Checklist V1.1 (SEC-001..SEC-183).
 * Pure CommonJS, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'storage', 'bootstrap', 'dist', 'build',
  '.nuxt', '.output', '.next', 'coverage', '.ai', '.agents', '.cursor', '.github',
  'bin', 'hooks', 'skills', 'rules', 'templates', 'extensions', 'presets',
  'telemetry', 'specs', 'docs', 'context', 'tests', 'Tests'
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

function isGitTracked(root, relFile) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relFile], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isLaravelOrPhpProject(root) {
  const markers = [
    'artisan',
    'composer.json',
    path.join('routes', 'api.php'),
    path.join('routes', 'web.php'),
    path.join('config', 'app.php'),
    'app',
    'Modules'
  ];
  for (const m of markers) {
    if (fs.existsSync(path.join(root, m))) return true;
  }
  return false;
}

/**
 * Computes brace-depth auth and throttle context per line in a Laravel route file.
 */
function analyzeLaravelRouteFile(content) {
  const lines = content.split('\n');
  const groupStack = [];
  let braceDepth = 0;
  let pendingAuth = false;
  let pendingThrottle = false;
  const routeEntries = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      continue;
    }

    if (/(?:middleware|group)\s*\([^)]*(?:auth:sanctum|auth:api|'auth'|"auth")/i.test(rawLine)) {
      pendingAuth = true;
    }
    if (/throttle:/i.test(rawLine) || /->throttle\s*\(/i.test(rawLine)) {
      pendingThrottle = true;
    }

    const openBraces = (rawLine.match(/\{/g) || []).length;
    const closeBraces = (rawLine.match(/\}/g) || []).length;

    if (openBraces > 0) {
      for (let b = 0; b < openBraces; b++) {
        braceDepth++;
        groupStack.push({
          depth: braceDepth,
          auth: pendingAuth || groupStack.some(g => g.auth),
          throttle: pendingThrottle || groupStack.some(g => g.throttle)
        });
      }
      pendingAuth = false;
      pendingThrottle = false;
    }

    const inAuthGroup = groupStack.some(g => g.auth);
    const inThrottleGroup = groupStack.some(g => g.throttle);

    // Inspect Route:: statements starting on this line (read up to ';' within 5 lines)
    if (/\bRoute::/.test(rawLine)) {
      const stmtWindow = lines.slice(i, Math.min(lines.length, i + 5)).join(' ');
      const anyMatch = stmtWindow.match(/\bRoute::any\s*\(\s*['"]([^'"]+)['"]/i);
      if (anyMatch) {
        routeEntries.push({
          line: i + 1,
          verb: 'ANY',
          uri: anyMatch[1],
          isVerbTampering: true,
          hasAuth: inAuthGroup || /auth:sanctum|auth:api/i.test(stmtWindow),
          hasThrottle: inThrottleGroup || /throttle:/i.test(stmtWindow) || /->throttle\s*\(/i.test(stmtWindow)
        });
      }

      const matchStmt = stmtWindow.match(/\bRoute::match\s*\(\s*\[([^\]]+)\]\s*,\s*['"]([^'"]+)['"]/i);
      if (matchStmt) {
        const methodsList = matchStmt[1].toLowerCase();
        const hasGet = methodsList.includes('get');
        const hasMutation = /post|put|patch|delete/.test(methodsList);
        routeEntries.push({
          line: i + 1,
          verb: `MATCH(${methodsList.replace(/\s+/g, '')})`,
          uri: matchStmt[2],
          isVerbTampering: hasGet && hasMutation,
          hasAuth: inAuthGroup || /auth:sanctum|auth:api/i.test(stmtWindow),
          hasThrottle: inThrottleGroup || /throttle:/i.test(stmtWindow) || /->throttle\s*\(/i.test(stmtWindow)
        });
      }

      const stdMatch = stmtWindow.match(/\bRoute::(get|post|put|patch|delete|apiResource|resource)\s*\(\s*['"]([^'"]+)['"]/i);
      if (stdMatch) {
        routeEntries.push({
          line: i + 1,
          verb: stdMatch[1].toUpperCase(),
          uri: stdMatch[2],
          isVerbTampering: false,
          hasAuth: inAuthGroup || /auth:sanctum|auth:api|'auth'|"auth"/i.test(stmtWindow),
          hasThrottle: inThrottleGroup || /throttle:/i.test(stmtWindow) || /->throttle\s*\(/i.test(stmtWindow)
        });
      }
    }

    if (closeBraces > 0) {
      for (let b = 0; b < closeBraces; b++) {
        groupStack.pop();
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }
  }

  return routeEntries;
}

function auditLaravel(root) {
  if (!isLaravelOrPhpProject(root)) return [];

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

  const phpFiles = [];
  const routeFiles = [];
  const configFiles = [];
  const envFiles = [];

  // Explicitly probe root .env* files
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && /^\.env(\..+)?$/i.test(entry.name) && !/\.(example|sample|testing)$/i.test(entry.name)) {
        envFiles.push(path.join(root, entry.name));
      }
    }
  } catch { /* ignore */ }

  walk(root, (f) => {
    const r = rel(root, f);
    const base = path.basename(f);
    if (!f.endsWith('.php')) return;
    phpFiles.push(f);
    if (/(?:^|\/)(?:routes|Routes)\/[^/]*api[^/]*\.php$/i.test(r)) {
      routeFiles.push(f);
    }
    if (/(?:^|\/)config\/[^/]+\.php$/i.test(r)) {
      configFiles.push(f);
    }
    if (/^\.env(\..+)?$/i.test(base) && !/\.(example|sample|testing)$/i.test(base)) {
      envFiles.push(f);
    }
  });

  // -------------------------------------------------------------------------
  // LAR-S01 (SEC-086, SEC-087, SEC-071 — CRITICAL): Debug, Telescope/Horizon, Swagger
  // -------------------------------------------------------------------------
  for (const ef of envFiles) {
    const c = read(ef);
    const r = rel(root, ef);
    const base = path.basename(ef);
    const isProdOrStaging = /\.(production|staging|prod)$/i.test(base) || /^\s*APP_ENV\s*=\s*(production|staging|prod)\b/im.test(c);
    const tracked = isGitTracked(root, r);
    const dbgMatch = c.match(/^\s*APP_DEBUG\s*=\s*true\b/im);
    if (dbgMatch && (isProdOrStaging || tracked)) {
      add(
        'LAR-S01',
        ['SEC-086'],
        'CRITICAL',
        'Production Debug Mode Enabled',
        'OWASP API8:2023 / ASVS V14.2',
        'NCA ECC 1-6',
        base,
        `${r}:${lineOf(c, dbgMatch.index)}`,
        `APP_DEBUG=true enabled in ${isProdOrStaging ? 'production/staging' : 'git-tracked'} environment configuration (${r}), exposing Ignition/Whoops stack traces and secrets.`,
        'Set `APP_DEBUG=false` in all Staging and Production environments and untrack `.env*` files containing runtime configuration.'
      );
    }
  }

  for (const cf of configFiles) {
    const c = read(cf);
    const r = rel(root, cf);
    const base = path.basename(cf);
    if (base === 'app.php') {
      const defDebug = c.match(/['"]debug['"]\s*=>\s*(?:env\s*\(\s*['"]APP_DEBUG['"]\s*,\s*true\s*\)|true\b)/i);
      if (defDebug) {
        add(
          'LAR-S01',
          ['SEC-086'],
          'CRITICAL',
          'Unsafe APP_DEBUG Default in config/app.php',
          'OWASP API8:2023 / ASVS V14.2',
          'NCA ECC 1-6',
          'config/app.php',
          `${r}:${lineOf(c, defDebug.index)}`,
          '`config/app.php` defaults `debug` to `true` when `APP_DEBUG` is unset.',
          "Default debug safely to false: `'debug' => (bool) env('APP_DEBUG', false)`."
        );
      }
    }
    if (/swagger/i.test(base)) {
      const genAlways = c.match(/['"]generate_always['"]\s*=>\s*true\b/i);
      if (genAlways) {
        add(
          'LAR-S01',
          ['SEC-071', 'SEC-086'],
          'CRITICAL',
          'Swagger UI / Always-Generate Enabled in Production',
          'OWASP API8:2023 / API9:2023',
          'NCA ECC 2-5',
          base,
          `${r}:${lineOf(c, genAlways.index)}`,
          `Swagger configuration '${r}' hardcodes 'generate_always' => true, exposing live OpenAPI docs in Production.`,
          "Bind `'generate_always' => env('L5_SWAGGER_GENERATE_ALWAYS', false)` and restrict Swagger UI routes to local/dev environments."
        );
      }
    }
  }

  for (const pf of phpFiles) {
    const r = rel(root, pf);
    const base = path.basename(pf);
    const c = read(pf);

    if (/^(TelescopeServiceProvider|HorizonServiceProvider)\.php$/i.test(base)) {
      const hasGateOrEnv = /Gate::define\s*\(\s*['"]viewTelescope['"]|Horizon::auth\s*\(|environment\s*\(\s*['"]local['"]\)|isLocal\s*\(/i.test(c);
      const allowsAll = /return\s+true\s*;/i.test(c) && !/in_array\s*\(\s*\$user->email/i.test(c) && !/hasRole|isSuperAdmin|can\(/i.test(c);
      if (!hasGateOrEnv || allowsAll) {
        add(
          'LAR-S01',
          ['SEC-087', 'SEC-142'],
          'CRITICAL',
          'Unguarded Diagnostic / Queue Console',
          'OWASP API8:2023 / ASVS V14.2',
          'NCA ECC 2-2',
          base,
          r,
          `${base} lacks a strict non-local environment check or admin authorization gate, exposing internal requests, jobs, and payloads.`,
          'Register Telescope only in `local` environment and enforce strict admin role/IP verification inside `Horizon::auth()` / `viewTelescope` Gate.'
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // LAR-S02 & LAR-S03: Route Authentication, Verb Tampering & Sensitive Throttling
  // -------------------------------------------------------------------------
  const PUBLIC_ALLOWLIST_REGEX = /^(?:\/?(?:api\/v\d+\/)?)?(?:health|up|ping|status|public\/branding|branding|(?:auth\/)?login|(?:auth\/)?otp(?:\/(?:send|resend|verify))?|(?:auth\/)?forgot-password|(?:auth\/)?reset-password|(?:auth\/)?accept-invite|(?:auth\/)?set-password)\b/i;
  const THROTTLE_REQUIRED_URI_REGEX = /(?:login|otp|forgot|reset|set-password|accept-invite|invite|export|upload)/i;

  for (const rf of routeFiles) {
    const r = rel(root, rf);
    const c = read(rf);
    const entries = analyzeLaravelRouteFile(c);

    for (const entry of entries) {
      if (entry.isVerbTampering) {
        add(
          'LAR-S02',
          ['SEC-016', 'SEC-050', 'SEC-079'],
          'CRITICAL',
          'HTTP Verb Tampering Route (Route::any / Permissive Match)',
          'OWASP API9:2023 / ASVS V4.1',
          'NCA ECC 2-2',
          `${entry.verb} ${entry.uri}`,
          `${r}:${entry.line}`,
          `Route '${entry.uri}' uses ${entry.verb}, allowing attackers to bypass method-specific middleware and authorization checks via HTTP verb tampering.`,
          'Replace `Route::any` / mixed `Route::match` with explicit single-verb route declarations (`Route::post`, `Route::put`, `Route::delete`) inside `auth:sanctum`.'
        );
      } else if (!entry.hasAuth && !PUBLIC_ALLOWLIST_REGEX.test(entry.uri)) {
        add(
          'LAR-S02',
          ['SEC-016', 'SEC-035'],
          'CRITICAL',
          'Unauthenticated API Route',
          'OWASP API2:2023 / ASVS V2.1',
          'NCA ECC 2-2',
          `${entry.verb} ${entry.uri}`,
          `${r}:${entry.line}`,
          `API route '${entry.verb} ${entry.uri}' is registered outside 'auth:sanctum' / 'auth:api' middleware.`,
          "Wrap all non-public routes inside `Route::middleware(['auth:sanctum'])->group(...)`."
        );
      }

      if (THROTTLE_REQUIRED_URI_REGEX.test(entry.uri) && !entry.hasThrottle) {
        add(
          'LAR-S03',
          ['SEC-021', 'SEC-023', 'SEC-059', 'SEC-073'],
          'HIGH',
          'Missing Endpoint Rate Limiting (Throttle)',
          'OWASP API4:2023 / ASVS V2.2',
          'NCA ECC 2-5',
          `${entry.verb} ${entry.uri}`,
          `${r}:${entry.line}`,
          `Sensitive endpoint '${entry.verb} ${entry.uri}' lacks 'throttle:' rate-limiting middleware, enabling brute-force, OTP enumeration, or export DoS.`,
          "Attach granular rate-limiting middleware (e.g. `->middleware('throttle:auth')` or `throttle:5,1`)."
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // PHP Source File Scans: LAR-S04, LAR-S05, LAR-S06, LAR-S07, LAR-S08
  // -------------------------------------------------------------------------
  for (const pf of phpFiles) {
    const r = rel(root, pf);
    const base = path.basename(pf);
    const c = read(pf);

    // LAR-S04: Static OTP, Weak PRNG for OTP, Unhashed Reset/Invite Tokens, User Enumeration
    const staticOtp = c.match(/(?:\$otp|\$code|['"]otp['"]|['"]verification_code['"])\s*(?:=>|=)\s*(?:['"](?:123456|1234|0000|000000|111111|999999)['"]|\b(?:rand|mt_rand)\s*\()/i);
    if (staticOtp) {
      add(
        'LAR-S04',
        ['SEC-022', 'SEC-024'],
        'HIGH',
        'Static or Weak-PRNG OTP Generation',
        'OWASP API2:2023 / ASVS V2.8',
        'NCA ECC 2-2',
        base,
        `${r}:${lineOf(c, staticOtp.index)}`,
        `Predictable or hardcoded OTP generation detected in '${base}', enabling trivial account takeover.`,
        'Generate OTP codes exclusively with CSPRNG `random_int(100000, 999999)`, store hashed via `Hash::make()`, and enforce <=5m single-use TTL.'
      );
    }

    if (/(?:reset_token|invitation_token|invite_token|password_reset_tokens)/i.test(c) && /Str::random\s*\(/i.test(c)) {
      if (!/Hash::make\s*\(|hash\s*\(\s*['"]sha256['"]|hash_hmac\s*\(/i.test(c)) {
        add(
          'LAR-S04',
          ['SEC-025', 'SEC-026'],
          'HIGH',
          'Plaintext Password-Reset / Invitation Token Storage',
          'OWASP API2:2023 / ASVS V2.3',
          'NCA ECC 2-2',
          base,
          r,
          `Reset or invitation token in '${base}' is persisted without SHA-256 or bcrypt hashing.`,
          "Hash single-use reset/invitation tokens at rest (`hash('sha256', $rawToken)` or `Hash::make($rawToken)`)."
        );
      }
    }

    const enumMsg = c.match(/['"](?:no account was found[^'"]*|email (?:address )?(?:not found|does not exist)|user (?:not found|does not exist)|this email is not registered|account is inactive)['"]/i);
    if (enumMsg) {
      add(
        'LAR-S04',
        ['SEC-027'],
        'HIGH',
        'User Enumeration Oracle Response',
        'OWASP API2:2023 / ASVS V2.5',
        'NCA ECC 2-2',
        base,
        `${r}:${lineOf(c, enumMsg.index)}`,
        `Explicit account-existence oracle message (${enumMsg[0]}) returned in '${base}'.`,
        'Return uniform timing-safe generic messages (e.g., "Invalid credentials" or "If an account matches, instructions have been sent").'
      );
    }

    // LAR-S05: Models ($guarded = [] or privileged fields in $fillable) & Controller RBAC/IDOR
    const isModel = /(?:^|\/)Models\//i.test(r) || /\bextends\s+(?:Model|Authenticatable|Pivot)\b/.test(c);
    if (isModel) {
      const guardedEmpty = c.match(/\$guarded\s*=\s*\[\s*\]/);
      if (guardedEmpty) {
        add(
          'LAR-S05',
          ['SEC-047'],
          'CRITICAL',
          'Unguarded Eloquent Model ($guarded = [])',
          'OWASP API3:2023 / ASVS V5.1',
          'NCA ECC 1-6',
          base,
          `${r}:${lineOf(c, guardedEmpty.index)}`,
          `Eloquent model '${base}' declares \`$guarded = []\`, permitting mass-assignment tampering of privilege, tenant, and state columns.`,
          'Remove `$guarded = []` and declare a strict `protected $fillable = [...]` whitelist excluding privilege and tenant keys.'
        );
      }

      const fillableMatch = c.match(/\$fillable\s*=\s*\[([^\]]+)\]/s);
      if (fillableMatch) {
        const privField = fillableMatch[1].match(/['"](role|role_id|roles|is_admin|is_super_admin|permissions|tenant_id|balance|wallet_balance)['"]/i);
        if (privField) {
          add(
            'LAR-S05',
            ['SEC-038', 'SEC-039', 'SEC-047'],
            'CRITICAL',
            'Privileged / Tenant Attribute in Model $fillable',
            'OWASP API3:2023 / ASVS V4.1',
            'NCA ECC 2-2',
            base,
            `${r}:${lineOf(c, fillableMatch.index)}`,
            `Model '${base}' exposes sensitive column '${privField[1]}' in \`$fillable\`, enabling privilege escalation or cross-tenant injection.`,
            `Remove '${privField[1]}' from \`$fillable\` and assign it explicitly via server-trusted domain methods.`
          );
        }
      }
    }

    const isControllerOrService = /Controller\.php$/i.test(base) || /(?:^|\/)(?:Controllers|Services)\//i.test(r);
    if (isControllerOrService) {
      const hasSensitiveAction = /function\s+(destroy|delete|forceDelete|export|bulk\w*|assignRole|syncRoles|notifications?)\s*\(/i.test(c);
      if (hasSensitiveAction) {
        const hasGuard = /authorize\s*\(|Gate::|Policy\b|->can\s*\(|where\s*\(\s*['"](?:tenant_id|user_id|recipient_id|organization_id|facility_id)['"]|forTenant\s*\(|auth\(\)->id\(\)|\$request->user\(\)->(?:id|tenant_id)/i.test(c);
        if (!hasGuard) {
          add(
            'LAR-S05',
            ['SEC-034', 'SEC-036', 'SEC-037', 'SEC-038', 'SEC-041', 'SEC-042', 'SEC-046'],
            'CRITICAL',
            'Missing Authorization / Tenant Ownership Guard on Sensitive Action',
            'OWASP API1:2023 / API5:2023',
            'NCA ECC 2-2',
            base,
            r,
            `'${base}' implements destructive, role-mutating, export, bulk, or notification actions without Policy/Gate authorization or tenant/user ownership scoping.`,
            'Enforce `$this->authorize(...)` / `Gate::authorize(...)` and scope queries with `where("tenant_id", $user->tenant_id)` (failing closed with 404).'
          );
        }
      }

      const rawAllPersist = c.match(/(?:::create|->update|->fill)\s*\(\s*\$request->all\s*\(\s*\)/);
      if (rawAllPersist) {
        add(
          'LAR-S05',
          ['SEC-047', 'SEC-067'],
          'CRITICAL',
          'Mass Assignment via $request->all()',
          'OWASP API3:2023 / ASVS V5.1',
          'NCA ECC 1-6',
          base,
          `${r}:${lineOf(c, rawAllPersist.index)}`,
          `'${base}' passes raw \`$request->all()\` directly into Eloquent persistence.`,
          'Validate payloads through a dedicated `FormRequest` and pass `$request->validated()` only.'
        );
      }
    }

    // LAR-S06: Public Disk Uploads/Exports & Permissive CORS
    const pubDisk = c.match(/Storage::disk\s*\(\s*['"]public['"]\s*\)|->(?:store|storeAs)\s*\([^;\n]*['"]public['"]\s*\)|->move\s*\(\s*public_path\s*\(/i);
    if (pubDisk) {
      add(
        'LAR-S06',
        ['SEC-044', 'SEC-045', 'SEC-061'],
        'HIGH',
        'Public Webroot Storage for Uploads / Exports',
        'OWASP API1:2023 / ASVS V12.1',
        'NCA ECC 2-7 / DCC',
        base,
        `${r}:${lineOf(c, pubDisk.index)}`,
        `'${base}' writes uploaded or exported files to the public disk / webroot, allowing unauthenticated direct URL retrieval.`,
        "Store uploads and exports on a private disk (`Storage::disk('s3_private')` or `local` outside `public/`) with UUID keys and authenticated download authorization."
      );
    }

    if (base === 'cors.php' && /(?:^|\/)config\/cors\.php$/i.test(r)) {
      const wildcardOrigin = /['"]allowed_origins['"]\s*=>\s*\[\s*['"]\*['"]\s*\]/.test(c);
      const credsOrAllMethods = /['"]supports_credentials['"]\s*=>\s*true/i.test(c) || /['"]allowed_methods['"]\s*=>\s*\[\s*['"]\*['"]\s*\]/.test(c);
      if (wildcardOrigin && credsOrAllMethods) {
        add(
          'LAR-S06',
          ['SEC-085'],
          'HIGH',
          'Permissive Wildcard CORS Policy',
          'OWASP API8:2023 / ASVS V14.5',
          'NCA ECC 2-5',
          'config/cors.php',
          r,
          '`config/cors.php` allows wildcard `*` origins alongside credentials or unrestricted mutation verbs.',
          "Restrict `'allowed_origins'` to explicit HTTPS frontend origins from environment config (never `*`)."
        );
      }
    }

    // LAR-S07: Unparameterized SQL & Path Traversal / LFD
    const rawSql = c.match(/\bDB::unprepared\s*\(|\b(?:DB::raw|whereRaw|orWhereRaw|selectRaw|orderByRaw|havingRaw)\s*\(\s*(?:"[^"]*\$[^"]*"|['"][^'"]*['"]\s*\.\s*\$)/i);
    if (rawSql) {
      add(
        'LAR-S07',
        ['SEC-052'],
        'CRITICAL',
        'Unparameterized Raw SQL Injection Vector',
        'OWASP A03:2021 / ASVS V5.3',
        'NCA ECC 1-6',
        base,
        `${r}:${lineOf(c, rawSql.index)}`,
        `Unparameterized SQL execution or variable interpolation detected in '${base}'.`,
        'Prohibit `DB::unprepared` on dynamic SQL and always bind parameters via `?` placeholders (`->whereRaw("col = ?", [$val])`).'
      );
    }

    const lfdMatch = c.match(/(?:response\s*\(\s*\)\s*->\s*(?:download|file)|file_get_contents|readfile|Storage::(?:download|get))\s*\([^;\n]*\$request->(?:input|query|get|route|\w+)/i);
    if (lfdMatch && !/basename\s*\(|realpath\s*\(/i.test(lfdMatch[0])) {
      add(
        'LAR-S07',
        ['SEC-045', 'SEC-055'],
        'CRITICAL',
        'Path Traversal / Local File Disclosure (LFD)',
        'OWASP API1:2023 / ASVS V12.3',
        'NCA ECC 1-6',
        base,
        `${r}:${lineOf(c, lfdMatch.index)}`,
        `File download/read in '${base}' consumes raw request input without canonical path boundary validation or storage-key lookup.`,
        'Resolve opaque attachment UUIDs from tenant-scoped DB records instead of accepting raw filenames, and enforce `basename()` + root prefix checks.'
      );
    }

    // LAR-S08: Unbounded Queries & Exception Message Leakage
    if (/Controller\.php$/i.test(base)) {
      const unbounded = c.match(/return\s+[^;]*(?:::all\s*\(\s*\)|->get\s*\(\s*\))/);
      if (unbounded && !/->(?:paginate|simplePaginate|cursorPaginate|limit|take)\s*\(/.test(c)) {
        add(
          'LAR-S08',
          ['SEC-074', 'SEC-162'],
          'HIGH',
          'Unbounded Collection Query in Controller',
          'OWASP API4:2023',
          'NCA ECC 1-6',
          base,
          `${r}:${lineOf(c, unbounded.index)}`,
          `Controller '${base}' returns an unbounded \`::all()\` or \`->get()\` dataset without server-side pagination or hard limit clamp.`,
          'Enforce `->paginate(min((int) $request->input("per_page", 20), 100))` on all collection endpoints.'
        );
      }
    }

    const errLeak = c.match(/response\s*\(\s*\)\s*->\s*json\s*\([\s\S]{0,220}?\$(?:e|ex|err|exception)->(?:getMessage|getTraceAsString|getTrace)\s*\(\s*\)/i);
    if (errLeak) {
      add(
        'LAR-S08',
        ['SEC-077', 'SEC-093'],
        'HIGH',
        'Internal Exception / Stack Trace Leaked in JSON Response',
        'OWASP API8:2023 / ASVS V7.4',
        'NCA ECC 1-6',
        base,
        `${r}:${lineOf(c, errLeak.index)}`,
        `'${base}' serializes raw exception details (\`getMessage()\` / \`getTrace()\`) into client HTTP JSON responses.`,
        'Log the exception internally with a `trace_id` and return a generic localized error envelope to the client.'
      );
    }
  }

  return findings;
}

module.exports = {
  isLaravelOrPhpProject,
  analyzeLaravelRouteFile,
  auditLaravel
};

