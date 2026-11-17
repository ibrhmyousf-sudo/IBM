#!/usr/bin/env node

/**
 * 🧪 E2E Multi-Intake & PARTIAL_JIT_ANCHOR Bridge Verification Suite (`bin/verify-intake-bridge.js` v4.1.0)
 * Isolated fixture test in `os.tmpdir()` (cleaned up in `finally`) verifying:
 *   1. `expandCliPath('~/test-path')` resolution via `os.homedir()`
 *   2. `reverse-architect.js --export-ba-intake` scanning a mock prototype/brownfield repo (models, migrations,
 *      controllers, routes, FormRequests, Vue screen `data-testid`, `ENUM-*` & `SEED-*` pagination/OTP limits,
 *      and pre-staged `ENG-01..ENG-10` hints) -> `REVERSE_INTAKE_BUNDLE.json` + `REVERSE_INTAKE_REPORT.md`
 *   3. `bcas-sync.js`, `eng-gate.js` (`--populate-hints` + `--verify-only` preserving `feature_srd`),
 *      `delta-sync.js`, and `drift-radar.js` on a `PARTIAL_JIT_ANCHOR` (`brownfield-cr`) Hub containing
 *      `UX_DESIGN_BRIEF.md`, `INTAKE_MANIFEST.md`, `PROTOTYPE_DISCOVERY_REPORT.md`, anchored `FEATURE-010.md`,
 *      and `v1.1.0` Delta pack without flagging untouched legacy models/controllers.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  expandCliPath,
  computeFeatureSrd,
  computeSemanticDigest,
  parseHubV21Metadata
} = require('./lib/hub-utils');

const BIN_DIR = __dirname;
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function pass(msg) {
  totalChecks++;
  passedChecks++;
  console.log(`  \x1b[32m✔ PASS:\x1b[0m ${msg}`);
}

function fail(msg, detail = '') {
  totalChecks++;
  failedChecks++;
  console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${msg}`);
  if (detail) console.error(`    ↳ ${detail}`);
}

function runCli(scriptName, cliArgs, cwd) {
  const scriptPath = path.join(BIN_DIR, scriptName);
  return execFileSync(process.execPath, [scriptPath, ...cliArgs], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

console.log('\n\x1b[36m\x1b[1m=== InnovaDigits OS v4.1.0 — BA_AI_SDLC v2.1.0 Multi-Intake & PARTIAL_JIT_ANCHOR E2E Suite ===\x1b[0m');

const tmpHubSource = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v410-hub-src-'));
const tmpBrownfieldRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-v410-brownfield-'));

try {
  // ---------------------------------------------------------------------------
  // CHECK 1: ~/ CLI Path Expansion & Hub v2.1 Metadata Detection
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 1/4] Testing expandCliPath("~/...") & Hub v2.1 Metadata Parsing...\x1b[0m');
  const expectedHomeSub = path.join(os.homedir(), 'test-path');
  const expandedSub = expandCliPath('~/test-path');
  const expandedExact = expandCliPath('~');
  const expandedRelative = expandCliPath('./docs/intake');

  if (
    expandedSub === expectedHomeSub &&
    expandedExact === os.homedir() &&
    expandedRelative === './docs/intake'
  ) {
    pass(`expandCliPath('~/test-path') resolved cleanly to '${expectedHomeSub}' via os.homedir().`);
  } else {
    fail('expandCliPath failed to resolve ~/ paths accurately.', JSON.stringify({ expandedSub, expandedExact, expandedRelative }));
  }

  // ---------------------------------------------------------------------------
  // CHECK 2: reverse-architect.js --export-ba-intake on Prototype / Brownfield Repo
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 2/4] Testing reverse-architect.js --export-ba-intake Discovery Bundle...\x1b[0m');

  // Scaffold mock brownfield repo with:
  //   - Active feature domain: Order model, migration, controller (paginate(25) + OTP_TTL = 300), StoreOrderRequest, api route, OrderCheckout.vue
  //   - Untouched legacy domain: LegacyInvoice model, migration, controller, legacy test (NO spec in Hub!)
  fs.mkdirSync(path.join(tmpBrownfieldRepo, 'app', 'Models'), { recursive: true });
  fs.mkdirSync(path.join(tmpBrownfieldRepo, 'app', 'Http', 'Controllers'), { recursive: true });
  fs.mkdirSync(path.join(tmpBrownfieldRepo, 'app', 'Http', 'Requests'), { recursive: true });
  fs.mkdirSync(path.join(tmpBrownfieldRepo, 'database', 'migrations'), { recursive: true });
  fs.mkdirSync(path.join(tmpBrownfieldRepo, 'routes'), { recursive: true });
  fs.mkdirSync(path.join(tmpBrownfieldRepo, 'resources', 'js', 'Pages'), { recursive: true });
  fs.mkdirSync(path.join(tmpBrownfieldRepo, 'tests', 'Feature'), { recursive: true });

  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'stack.json'),
    JSON.stringify({
      version: '4.1.0',
      architecture: { hmvc: false, monolith: true },
      stacks: {
        backend: { laravel: true },
        frontend: { vue: true },
        api_docs: { json_openapi: true, postman: true },
        workflows: {
          bcas_init: true,
          eng_gate: true,
          apply_delta: true,
          reverse_intake: true,
          cycle_handoff: true
        },
        context_hub: {
          layout: 'auto',
          hub_root: 'docs/project-context-hub',
          enforce_two_gate: true,
          verify_feature_srd: true
        }
      }
    }, null, 2),
    'utf8'
  );

  // Sample Order Model + Untouched LegacyInvoice Model
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'app', 'Models', 'Order.php'),
    `<?php\nnamespace App\\Models;\nuse Illuminate\\Database\\Eloquent\\Model;\nclass Order extends Model {\n    protected $table = 'orders';\n    protected $fillable = ['tenant_id', 'customer_email', 'total_amount', 'status'];\n}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'app', 'Models', 'LegacyInvoice.php'),
    `<?php\nnamespace App\\Models;\nuse Illuminate\\Database\\Eloquent\\Model;\nclass LegacyInvoice extends Model {\n    protected $table = 'legacy_invoices';\n    protected $fillable = ['invoice_no', 'amount'];\n}\n`,
    'utf8'
  );

  // Sample Migrations
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'database', 'migrations', '2026_01_01_000001_create_orders_table.php'),
    `<?php\nuse Illuminate\\Database\\Schema\\Blueprint;\nuse Illuminate\\Support\\Facades\\Schema;\nreturn new class {\n    public function up(): void {\n        Schema::create('orders', function (Blueprint $table) {\n            $table->id();\n            $table->unsignedBigInteger('tenant_id');\n            $table->string('customer_email');\n            $table->decimal('total_amount', 12, 2);\n            $table->enum('status', ['pending', 'confirmed', 'cancelled']);\n            $table->timestamps();\n            $table->index(['tenant_id', 'status']);\n        });\n    }\n};\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'database', 'migrations', '2024_05_01_000001_create_legacy_invoices_table.php'),
    `<?php\nuse Illuminate\\Database\\Schema\\Blueprint;\nuse Illuminate\\Support\\Facades\\Schema;\nreturn new class {\n    public function up(): void {\n        Schema::create('legacy_invoices', function (Blueprint $table) {\n            $table->id();\n            $table->string('invoice_no');\n            $table->decimal('amount', 10, 2);\n            $table->timestamps();\n        });\n    }\n};\n`,
    'utf8'
  );

  // Sample FormRequest with validation & file size limit
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'app', 'Http', 'Requests', 'StoreOrderRequest.php'),
    `<?php\nnamespace App\\Http\\Requests;\nuse Illuminate\\Foundation\\Http\\FormRequest;\nclass StoreOrderRequest extends FormRequest {\n    public function rules(): array {\n        return [\n            'customer_email' => 'required|email',\n            'total_amount' => 'required|numeric|min:1',\n            'status' => 'required|in:pending,confirmed,cancelled',\n            'receipt_pdf' => 'nullable|file|max:4096'\n        ];\n    }\n}\n`,
    'utf8'
  );

  // Sample Controller with hardcoded pagination (25) and OTP_TTL (300)
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'app', 'Http', 'Controllers', 'OrderController.php'),
    `<?php\nnamespace App\\Http\\Controllers;\nuse App\\Models\\Order;\nuse App\\Http\\Requests\\StoreOrderRequest;\nclass OrderController {\n    public const OTP_TTL = 300;\n    public function index() {\n        return Order::query()->paginate(25);\n    }\n    public function store(StoreOrderRequest $request) {\n        return Order::create($request->validated());\n    }\n}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'app', 'Http', 'Controllers', 'LegacyInvoiceController.php'),
    `<?php\nnamespace App\\Http\\Controllers;\nuse App\\Models\\LegacyInvoice;\nclass LegacyInvoiceController {\n    public function index() { return LegacyInvoice::all(); }\n}\n`,
    'utf8'
  );

  // Sample API Routes
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'routes', 'api.php'),
    `<?php\nuse Illuminate\\Support\\Facades\\Route;\nuse App\\Http\\Controllers\\OrderController;\nuse App\\Http\\Controllers\\LegacyInvoiceController;\nRoute::middleware('auth:sanctum')->group(function () {\n    Route::get('/v1/orders', [OrderController::class, 'index']);\n    Route::post('/v1/orders', [OrderController::class, 'store']);\n    Route::get('/v1/legacy-invoices', [LegacyInvoiceController::class, 'index']);\n});\n`,
    'utf8'
  );

  // Sample Vue Screen with deterministic data-testid
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'resources', 'js', 'Pages', 'OrderCheckout.vue'),
    `<template>\n  <form data-testid="orders-checkout-form">\n    <input data-testid="orders-checkout-email-input" type="email" />\n    <button data-testid="orders-checkout-submit-btn" type="submit">Confirm</button>\n  </form>\n</template>\n`,
    'utf8'
  );

  // Existing legacy test in tests/Feature/ to verify PARTIAL_JIT_ANCHOR does not trip on brownfield tests/
  fs.writeFileSync(
    path.join(tmpBrownfieldRepo, 'tests', 'Feature', 'LegacyInvoiceTest.php'),
    `<?php\n// Legacy test suite\n`,
    'utf8'
  );

  // 2A. Full prototype-code intake export
  runCli('reverse-architect.js', ['--export-ba-intake', '--mode=prototype-code'], tmpBrownfieldRepo);
  const bundlePath = path.join(tmpBrownfieldRepo, 'docs', 'business-context', 'intake', 'REVERSE_INTAKE_BUNDLE.json');
  const reportPath = path.join(tmpBrownfieldRepo, 'docs', 'business-context', 'intake', 'REVERSE_INTAKE_REPORT.md');

  const fullBundle = fs.existsSync(bundlePath) ? JSON.parse(fs.readFileSync(bundlePath, 'utf8')) : null;
  const hasOrderModel = fullBundle?.models?.some(m => m.name === 'Order' && m.table === 'orders');
  const hasOrderRoutes = fullBundle?.routes?.some(r => r.method === 'POST' && r.path === '/api/v1/orders' && r.validator === 'StoreOrderRequest');
  const hasVueTestId = fullBundle?.screens?.some(s => s.name === 'OrderCheckout' && s.testids.includes('orders-checkout-submit-btn'));
  const hasStatusEnum = fullBundle?.candidate_enums?.some(e => e.values.includes('confirmed'));
  const hasPaginationSeed = fullBundle?.candidate_seeds?.some(s => s.value === 25 && s.category === 'pagination');
  const hasOtpSeed = fullBundle?.candidate_seeds?.some(s => s.value === 300 && s.category === 'ttl_timer');
  const hasGateBHints = Boolean(fullBundle?.gate_b_hints?.Orders?.['ENG-01']?.binding && fullBundle?.gate_b_hints?.Orders?.['ENG-10']?.binding);

  if (
    fullBundle &&
    fs.existsSync(reportPath) &&
    fullBundle.schema_version === 'ba-ai-sdlc-reverse-intake/v2.1.0' &&
    hasOrderModel &&
    hasOrderRoutes &&
    hasVueTestId &&
    hasStatusEnum &&
    hasPaginationSeed &&
    hasOtpSeed &&
    hasGateBHints
  ) {
    pass('reverse-architect.js --export-ba-intake extracted models, migrations, routes, validators, Vue testids, ENUM-*/SEED-* limits (25 & 300s), and ENG-01..10 hints.');
  } else {
    fail('reverse-architect.js --export-ba-intake missing expected artifacts or metadata.', JSON.stringify({
      hasOrderModel, hasOrderRoutes, hasVueTestId, hasStatusEnum, hasPaginationSeed, hasOtpSeed, hasGateBHints
    }));
  }

  // 2B. Filtered brownfield-cr intake export (--mode=brownfield-cr --features=orders)
  runCli('reverse-architect.js', ['--export-ba-intake', '--mode=brownfield-cr', '--features=orders'], tmpBrownfieldRepo);
  const filteredBundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  if (
    filteredBundle.intake_mode === 'brownfield-cr' &&
    filteredBundle.scope_mode === 'PARTIAL_JIT_ANCHOR' &&
    filteredBundle.modules.length === 1 &&
    filteredBundle.modules[0].name === 'Orders' &&
    filteredBundle.unfiltered_codebase_totals.models_count === 2
  ) {
    pass('reverse-architect.js --mode=brownfield-cr --features=orders scoped bundle to Orders while recording unfiltered repo totals.');
  } else {
    fail('reverse-architect.js --mode=brownfield-cr filtering failed.', JSON.stringify(filteredBundle.summary));
  }

  // ---------------------------------------------------------------------------
  // CHECK 3: bcas-sync.js + eng-gate.js (--populate-hints + --verify-only) on PARTIAL_JIT_ANCHOR Hub v2.1
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 3/4] Testing bcas-sync.js & eng-gate.js (--populate-hints) on PARTIAL_JIT_ANCHOR Hub v2.1...\x1b[0m');

  fs.mkdirSync(path.join(tmpHubSource, '_intake'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSource, '00-project-core'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSource, '01-roadmap-and-pm'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSource, '02-sprints', 'S1'), { recursive: true });
  fs.mkdirSync(path.join(tmpHubSource, '03-version-deltas'), { recursive: true });

  fs.writeFileSync(
    path.join(tmpHubSource, '_intake', 'INTAKE_MANIFEST.md'),
    `# Intake Manifest (BA_AI_SDLC v2.1.0)\n\n| Field | Value |\n| :--- | :--- |\n| **Intake Mode** | \`brownfield-cr\` |\n| **Scope Mode** | \`PARTIAL_JIT_ANCHOR\` |\n| **Bundle Source** | \`REVERSE_INTAKE_BUNDLE.json\` |\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '_intake', 'PROTOTYPE_DISCOVERY_REPORT.md'),
    `# Prototype & Brownfield Discovery Summary\nAnchored module: \`Orders\` (\`Order.php\`, \`orders\`). Untouched legacy module: \`LegacyInvoices\`.\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '00-project-core', 'PROJECT_CONTEXT.md'),
    `# Project Context (v2.1.0)\n\n| Field | Value |\n| :--- | :--- |\n| **Scope Mode** | \`PARTIAL_JIT_ANCHOR\` |\n| **Intake Mode** | \`brownfield-cr\` |\n\n## 2. Domain Overview\nSurgical brownfield evolution on Order Checkout.\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '00-project-core', 'UX_DESIGN_BRIEF.md'),
    `# UX Design Brief\nOrder Checkout screen (\`SCR-ORD-10\`) with RTL/LTR parity.\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '00-project-core', 'GLOSSARY_AND_ENUMS.md'),
    `# Glossary & Enums\n- \`ENUM-ORDER-STATUS\`: \`pending\`, \`confirmed\`, \`cancelled\`\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '00-project-core', 'SEED_DEFAULTS_CATALOG.md'),
    `# Seed Defaults Catalog\n- \`SEED-ORDER-OTP-TTL\`: \`300\` seconds\n- \`SEED-ORDER-PAGINATION-LIMIT\`: \`25\` items\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '01-roadmap-and-pm', 'SPRINT_MASTER_PLAN.md'),
    `# Sprint Master Plan\n| Feature ID | Sprint | Wave | Archetype |\n| :--- | :--- | :--- | :--- |\n| \`FEATURE-010\` | \`S1\` | \`Wave 1\` | \`MUTATION_WORKFLOW\` |\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '01-roadmap-and-pm', 'CHANGE_IMPACT_REGISTER.md'),
    `# Change Impact Register\n| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`,
    'utf8'
  );

  const feat010Raw = `# FEATURE-010: Brownfield Order OTP Checkout Confirmation

## 1. Feature Identity & Classification
| Field | Value |
| :--- | :--- |
| **Feature ID** | \`FEATURE-010\` |
| **Feature Name** | Brownfield Order OTP Checkout Confirmation |
| **Sprint** | \`S1\` |
| **Version** | \`v1.1.0\` |
| **Archetype** | \`MUTATION_WORKFLOW\` |
| **Gate A Status** | \`READY_FOR_DEV\` |

## 2. Visual Screen Decomposition
| Screen ID | Component | Role |
| :--- | :--- | :--- |
| \`SCR-ORD-10\` | \`OrderCheckout\` | Submit confirmed order |

## 3. UI Lifecycle States
Supports \`LOADING\`, \`ERROR\`, \`SUBMITTING\`, and \`POPULATED\` states.

## 4. Business Rules
| Rule ID | Title | Statement |
| :--- | :--- | :--- |
| \`BR-ORD-10\` | OTP Expiry & Status | Enforce \`SEED-ORDER-OTP-TTL\` (300s), paginate via \`SEED-ORDER-PAGINATION-LIMIT\`, and transition \`ENUM-ORDER-STATUS\` on \`orders\` (Master). |

## 5B. Mutation Workflow Contract
\`POST /api/v1/orders\` via \`OrderController@store\`.

## 6. Security & Edge Cases
Tenant-scoped \`tenant_id\` with PII masking on \`customer_email\`.

## 7. Bilingual Copy Keys (AR / EN)
| Copy Key | AR | EN |
| :--- | :--- | :--- |
| \`orders.otp.confirm\` | تأكيد رمز التحقق | Confirm OTP |

## 8. Acceptance Criteria
- \`AC-01\`: Validates OTP within \`SEED-ORDER-OTP-TTL\` and persists \`orders\` row.

## 9. Governance & Sign-Off
### 9.2 Open Business Decisions
| ID | Decision | Status |
| :--- | :--- | :--- |
| \`D-10\` | OTP TTL 300s | \`Resolved\` |

---

## 10. Evolution Ledger
| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| \`v1.1.0\` | \`2026-11-11\` | \`CR-10\` | \`SEED-ORDER-OTP-TTL\` | \`No OTP\` | \`300s OTP check\` | Bind OTP TTL seed & OrderController |

---

## 11. Gate B — Engineering Readiness Appendix
| Field | Value |
| :--- | :--- |
| **Gate B Status** | \`PENDING\` |

| Check ID | Engineering Readiness Check | Concrete Codebase Binding | Status |
| :--- | :--- | :--- | :--- |
| \`ENG-01\` | Model/Table Binding | TBD | \`PENDING\` |
| \`ENG-02\` | API Endpoint & Envelope Contract | TBD | \`PENDING\` |
| \`ENG-03\` | SEED-* & ENUM-* Codebase Mapping | TBD | \`PENDING\` |
| \`ENG-04\` | Visual Screen §2 & Lifecycle §3 data-testid Plan | TBD | \`PENDING\` |
| \`ENG-05\` | ESR Index & N+1 Prevention | TBD | \`PENDING\` |
| \`ENG-06\` | Tenant/IDOR & RBAC Guard | TBD | \`PENDING\` |
| \`ENG-07\` | IPDPL/PII Masking | TBD | \`PENDING\` |
| \`ENG-08\` | Archetype Concurrency/Idempotency Strategy | TBD | \`PENDING\` |
| \`ENG-09\` | Automated Test File Binding | TBD | \`PENDING\` |
| \`ENG-10\` | Mobile/QA Handoff Impact | TBD | \`PENDING\` |
`;

  const srd010 = computeFeatureSrd(feat010Raw);
  fs.writeFileSync(path.join(tmpHubSource, '02-sprints', 'S1', 'FEATURE-010.md'), feat010Raw, 'utf8');
  fs.writeFileSync(
    path.join(tmpHubSource, '02-sprints', 'S1', 'SPRINT_S1_MANIFEST.md'),
    `# Sprint S1 Manifest\n\n| Feature ID | Wave | Archetype | Gate A Status | Version | feature_srd |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n| \`FEATURE-010\` | \`Wave 1\` | \`MUTATION_WORKFLOW\` | \`READY_FOR_DEV\` | \`v1.1.0\` | \`${srd010}\` |\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpHubSource, '03-version-deltas', 'DELTA_v1.0.0_to_v1.1.0.md'),
    `# Delta v1.0.0 -> v1.1.0\n\n| Ver | Date | Ref | Target ID | WAS | CURRENT | UPDATE NEEDED BY TEAM |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| \`v1.1.0\` | \`2026-11-11\` | \`CR-10\` | \`FEATURE-010\` | Direct order submit | 300s OTP confirmation (\`SEED-ORDER-OTP-TTL\`) | Update OrderController, Flutter DTO & Postman |\n`,
    'utf8'
  );

  // Sync Hub v2.1 into tmpBrownfieldRepo
  runCli('bcas-sync.js', [`--hub=${tmpHubSource}`], tmpBrownfieldRepo);

  const syncedHubRoot = path.join(tmpBrownfieldRepo, 'docs', 'project-context-hub');
  const syncedIndex = fs.readFileSync(path.join(tmpBrownfieldRepo, 'docs', 'business-context', 'FEATURES_INDEX.md'), 'utf8');
  const v21Meta = parseHubV21Metadata(syncedHubRoot, path.join(tmpBrownfieldRepo, 'docs', 'business-context'));

  if (
    v21Meta.scopeMode === 'PARTIAL_JIT_ANCHOR' &&
    v21Meta.intakeMode === 'brownfield-cr' &&
    v21Meta.v21Artifacts.hasUxDesignBrief &&
    v21Meta.v21Artifacts.hasIntakeManifest &&
    v21Meta.v21Artifacts.hasPrototypeDiscovery &&
    syncedIndex.includes('PARTIAL_JIT_ANCHOR') &&
    syncedIndex.includes('brownfield-cr')
  ) {
    pass('bcas-sync.js synced UX_DESIGN_BRIEF.md + _intake/{INTAKE_MANIFEST.md,PROTOTYPE_DISCOVERY_REPORT.md} and recorded PARTIAL_JIT_ANCHOR in FEATURES_INDEX.md.');
  } else {
    fail('bcas-sync.js failed to sync v2.1 artifacts or Scope Mode.', JSON.stringify(v21Meta));
  }

  // Auto-populate Section 11 hints via eng-gate.js --populate-hints + --verify-only, then promote & verify
  const populateVerifyJson = JSON.parse(runCli('eng-gate.js', ['--feature=FEATURE-010', '--populate-hints', '--verify-only', '--json'], tmpBrownfieldRepo));
  const promoteJson = JSON.parse(runCli('eng-gate.js', ['--feature=FEATURE-010', '--json'], tmpBrownfieldRepo));
  const postVerifyJson = JSON.parse(runCli('eng-gate.js', ['--sprint=S1', '--verify-only', '--json'], tmpBrownfieldRepo));
  const syncedFeat010 = fs.readFileSync(path.join(syncedHubRoot, '02-sprints', 'S1', 'FEATURE-010.md'), 'utf8');
  const postSrd010 = computeFeatureSrd(syncedFeat010);

  if (
    populateVerifyJson.status === 'PASS' &&
    promoteJson.status === 'PASS' &&
    promoteJson.features[0].gateB === 'READY_TO_CODE' &&
    postVerifyJson.status === 'PASS' &&
    postSrd010 === srd010 &&
    syncedFeat010.includes('Order.php') &&
    syncedFeat010.includes('orders-checkout-submit-btn')
  ) {
    pass('eng-gate.js --populate-hints pre-filled 10/10 ENG-* bindings from REVERSE_INTAKE_BUNDLE.json, passed --verify-only, and promoted READY_TO_CODE with 100% intact feature_srd.');
  } else {
    fail('eng-gate.js --populate-hints failed or mutated feature_srd.', JSON.stringify({ populateVerifyJson, promoteJson, postSrd010, srd010 }));
  }

  // Canonical Section 11 header, S4 / Wave 1 metadata, and srd-v1 digest preservation check (FEATURE-011)
  const sprint4Dir = path.join(syncedHubRoot, '02-sprints', 'S4');
  fs.mkdirSync(sprint4Dir, { recursive: true });
  const feat011Draft = [
    '# Feature Specification: FEATURE-011 — Ledger Settlement Export',
    '',
    '| Metadata Field | Value |',
    '| :--- | :--- |',
    '| **Feature ID** | `FEATURE-011` |',
    '| **Title** | `Ledger Settlement Export` |',
    '| **Sprint / Wave** | `S4 / Wave 1` |',
    '| **Archetype** | `MUTATION_WORKFLOW` |',
    '| **Status** | `READY_FOR_DEV` |',
    '| **Gate A Status (BA)** | `READY_FOR_DEV` |',
    '| **Gate B Status (Eng)** | `PENDING` |',
    '| **Semantic Digest (feature_srd)** | `SRD-F011-000000000000` |',
    '',
    '## 1. Business Objective & Scope',
    '- Export deterministic ledger settlement batches with strict tenant scoping and audit logs.',
    '',
    '## 11. Engineering Readiness & Gate B Verification Matrix',
    '| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |',
    '| :--- | :--- | :--- | :--- |',
    '| `ENG-01` | Database Schema & Migrations | TBD | PENDING |',
    '| `ENG-02` | API Endpoints & Contracts | TBD | PENDING |',
    '| `ENG-03` | Domain Service & State Logic | TBD | PENDING |',
    '| `ENG-04` | Frontend UI Components & Routes | TBD | PENDING |',
    '| `ENG-05` | Multi-Tenant & Security Guardrails | TBD | PENDING |',
    '| `ENG-06` | Localization (EN/AR & RTL) | TBD | PENDING |',
    '| `ENG-07` | Observability & Error Handling | TBD | PENDING |',
    '| `ENG-08` | Performance & Indexing Hints | TBD | PENDING |',
    '| `ENG-09` | Automated Test Coverage Hooks | TBD | PENDING |',
    '| `ENG-10` | QA Testability (`data-testid` & Fixtures) | TBD | PENDING |',
    ''
  ].join('\n');
  const srd011Tag = computeSemanticDigest(feat011Draft, 'F011');
  const feat011Path = path.join(sprint4Dir, 'FEATURE-011.md');
  fs.writeFileSync(feat011Path, feat011Draft.replace('SRD-F011-000000000000', srd011Tag), 'utf8');

  const pop011Json = JSON.parse(runCli('eng-gate.js', ['--feature=FEATURE-011', '--populate-hints', '--verify-only', '--json'], tmpBrownfieldRepo));
  const prom011Json = JSON.parse(runCli('eng-gate.js', ['--feature=FEATURE-011', '--json'], tmpBrownfieldRepo));
  const after011Raw = fs.readFileSync(feat011Path, 'utf8');
  const after011Tag = computeSemanticDigest(after011Raw, 'F011');

  const coreProjCtxPath = path.join(syncedHubRoot, '00-project-core', 'PROJECT_CONTEXT.md');
  const legacyMirrorProjCtxPath = path.join(tmpBrownfieldRepo, 'docs', 'business-context', 'PROJECT_CONTEXT.md');
  const coreProjCtx = fs.existsSync(coreProjCtxPath) ? fs.readFileSync(coreProjCtxPath, 'utf8') : '';
  const mirrorProjCtx = fs.existsSync(legacyMirrorProjCtxPath) ? fs.readFileSync(legacyMirrorProjCtxPath, 'utf8') : '';
  const hasZeroUcmsBleed = !coreProjCtx.includes('facility_id') && !mirrorProjCtx.includes('facility_id') &&
    !coreProjCtx.includes('Sports Club') && !mirrorProjCtx.includes('Sports Club');

  const parsed011 = require('./lib/hub-utils').parseFeatureDocument(feat011Path, { isHubV2: true });

  if (
    pop011Json.status === 'PASS' &&
    prom011Json.status === 'PASS' &&
    prom011Json.features[0]?.gateB === 'READY_TO_CODE' &&
    prom011Json.features[0]?.sprint === 'S4' &&
    parsed011.wave === 1 &&
    /^SRD-F011-[0-9A-F]{12}$/.test(srd011Tag) &&
    after011Raw.includes('| Eng Check ID | Engineering Readiness Dimension | Technical Binding / Artifact Reference | Verdict |') &&
    after011Raw.includes('| **Gate B Status (Eng)** | `READY_TO_CODE` |') &&
    after011Raw.includes(`| **Semantic Digest (feature_srd)** | \`${srd011Tag}\` |`) &&
    after011Tag === srd011Tag &&
    coreProjCtx.length > 0 &&
    coreProjCtx === mirrorProjCtx &&
    hasZeroUcmsBleed
  ) {
    pass('Canonical Section 11 (ENG-01..10), S4 / Wave 1 parsing, srd-v1 digest preservation, and zero-UCMS PROJECT_CONTEXT parity verified for FEATURE-011.');
  } else {
    fail('Canonical FEATURE-011 / PROJECT_CONTEXT parity check failed.', JSON.stringify({
      pop011Status: pop011Json.status,
      prom011Feature: prom011Json.features?.[0],
      parsed011Wave: parsed011.wave,
      srd011Tag,
      after011Tag,
      coreLen: coreProjCtx.length,
      sameCtx: coreProjCtx === mirrorProjCtx,
      hasZeroUcmsBleed
    }));
  }
  fs.rmSync(sprint4Dir, { recursive: true, force: true });

  // ---------------------------------------------------------------------------
  // CHECK 4: delta-sync.js + drift-radar.js PARTIAL_JIT_ANCHOR Untouched Legacy Exemption
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[36m[CHECK 4/4] Testing delta-sync.js & drift-radar.js PARTIAL_JIT_ANCHOR Legacy Bypass...\x1b[0m');

  // Compile & seal v1.1.0 delta
  runCli('delta-sync.js', ['--to=v1.1.0'], tmpBrownfieldRepo);
  runCli('delta-sync.js', ['--mark-applied=v1.1.0'], tmpBrownfieldRepo);

  const radarJson = JSON.parse(runCli('drift-radar.js', ['--json'], tmpBrownfieldRepo));

  if (
    radarJson.scope_mode === 'PARTIAL_JIT_ANCHOR' &&
    radarJson.intake_mode === 'brownfield-cr' &&
    radarJson.health_score === 100 &&
    radarJson.entity_drift.length === 0 &&
    radarJson.srd_drift.length === 0 &&
    radarJson.catalog_parity_gaps.length === 0 &&
    radarJson.screen_lifecycle_gaps.length === 0 &&
    radarJson.unapplied_deltas.length === 0 &&
    radarJson.test_binding_gaps.length === 0 &&
    Array.isArray(radarJson.untouched_legacy_models_bypassed) &&
    radarJson.untouched_legacy_models_bypassed.includes('LegacyInvoice')
  ) {
    pass('drift-radar.js honored PARTIAL_JIT_ANCHOR (100% Health Score, 0 drift on anchored FEATURE-010, and cleanly bypassed untouched LegacyInvoice).');
  } else {
    fail('drift-radar.js failed PARTIAL_JIT_ANCHOR validation.', JSON.stringify(radarJson));
  }
} catch (err) {
  fail('Unhandled exception in Multi-Intake Bridge E2E Suite', err.stack || err.message);
} finally {
  try { fs.rmSync(tmpHubSource, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(tmpBrownfieldRepo, { recursive: true, force: true }); } catch {}
}

console.log('\n------------------------------------------------------------');
console.log(`MULTI-INTAKE BRIDGE E2E CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
console.log('------------------------------------------------------------');

if (failedChecks === 0) {
  console.log('\x1b[32m\x1b[1m✨ ALL V4.1.0 MULTI-INTAKE & PARTIAL_JIT_ANCHOR CHECKS PASSED (CLEARANCE GRANTED)\x1b[0m\n');
  process.exit(0);
} else {
  console.error('\x1b[31m\x1b[1m🚨 MULTI-INTAKE BRIDGE VERIFICATION FAILED\x1b[0m\n');
  process.exit(1);
}

