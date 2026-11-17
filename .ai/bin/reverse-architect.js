#!/usr/bin/env node

/**
 * 🏛️ InnovaDigits Reverse Architecture Visualizer Engine (v3.9.3)
 * Inspects CODEBASE_MAP.md, OpenAPI specs, Postman collections, and Client SDKs
 * to dynamically reconstruct live system topology, domain ER diagrams,
 * and per-module coverage metrics.
 *
 * Usage:
 *   node bin/reverse-architect.js
 *   node bin/reverse-architect.js --output=custom/path.md
 *   node bin/reverse-architect.js --json
 */

const fs = require('fs');
const path = require('path');
const { expandCliPath, resolveProjectAndAiRoot } = require('./lib/hub-utils');
const { scanDotNetEntities, scanDotNetMinimalApis, isDotNetProject } = require('./lib/dotnet-scanner');

let pkgVersion = '4.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (pkg.version) pkgVersion = pkg.version;
} catch (e) {}

const startTime = Date.now();

// 1. CLI Arguments Parsing
const args = process.argv.slice(2);
let customOutputPath = null;
let isJson = false;
let exportBaIntake = false;
let customIntakeDir = null;
let intakeMode = 'prototype-code';
let featureFilters = [];

for (const arg of args) {
  if (arg.startsWith('--output=')) {
    customOutputPath = path.resolve(expandCliPath(arg.slice('--output='.length)));
  } else if (arg === '--export-ba-intake') {
    exportBaIntake = true;
  } else if (arg.startsWith('--export-ba-intake=')) {
    exportBaIntake = true;
    const val = expandCliPath(arg.slice('--export-ba-intake='.length));
    if (val) customIntakeDir = path.resolve(val);
  } else if (arg.startsWith('--mode=')) {
    const rawMode = arg.slice('--mode='.length).trim().toLowerCase();
    if (rawMode === 'prototype-code' || rawMode === 'brownfield-cr') {
      intakeMode = rawMode;
    }
  } else if (arg.startsWith('--features=')) {
    featureFilters = arg
      .slice('--features='.length)
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  } else if (arg === '--json') {
    isJson = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Reverse Architecture Visualizer & BA Intake Bridge CLI (v${pkgVersion})

Options:
  --output=<path>              Custom destination report path (Default: docs/architecture/LIVE_SYSTEM_ARCHITECTURE.md)
  --export-ba-intake[=<dir>]   Export REVERSE_INTAKE_BUNDLE.json + REVERSE_INTAKE_REPORT.md for BA_AI_SDLC v2.1.0
                               (Default dir: docs/business-context/intake/)
  --mode=<mode>                Intake mode: prototype-code | brownfield-cr (Default: prototype-code)
  --features=<comma-filter>    Optional module/feature filter for brownfield-cr surgical anchoring
  --json                       Output raw JSON metadata
  --help, -h                   Show help instructions
`);
    process.exit(0);
  }
}

// 2. Resolve Project Root and Paths
const { projectRoot: resolvedRoot } = resolveProjectAndAiRoot(process.cwd(), __dirname);
const cwd = resolvedRoot;
const candidateMaps = [
  path.join(cwd, 'context', 'CODEBASE_MAP.md'),
  path.join(cwd, '.ai', 'context', 'CODEBASE_MAP.md'),
  path.join(cwd, '..', 'context', 'CODEBASE_MAP.md'),
  path.join(cwd, '..', '.ai', 'context', 'CODEBASE_MAP.md')
];

let codebaseMapPath = candidateMaps.find(p => fs.existsSync(p));

const docsDir = path.join(cwd, 'docs');
const archDir = path.join(docsDir, 'architecture');
const defaultOutputFile = path.join(archDir, 'LIVE_SYSTEM_ARCHITECTURE.md');
const outputFile = customOutputPath || defaultOutputFile;

const modulesDocsDir = path.join(docsDir, 'modules');
const postmanDir = path.join(docsDir, 'postman');
const sdkTsDir = path.join(docsDir, 'sdk', 'ts');
const sdkDartDir = path.join(docsDir, 'sdk', 'dart');

// 3. Module Inventory Collection
const modulesMap = new Map();

function getModule(name) {
  if (!modulesMap.has(name)) {
    modulesMap.set(name, {
      name,
      models: [],
      controllers: [],
      tables: [],
      contracts: [],
      views: [],
      openApiEndpoints: 0,
      hasPostman: false,
      hasTsSdk: false,
      hasDartSdk: false
    });
  }
  return modulesMap.get(name);
}

// Helper to extract module name from path
function extractModuleName(relPath) {
  if (!relPath) return 'Core';
  const parts = relPath.split(/[\/\\]/);
  const pkgIdx = parts.indexOf('packages');
  if (pkgIdx !== -1 && parts.length > pkgIdx + 1) {
    return parts[pkgIdx + 1];
  }
  const modIdx = parts.indexOf('Modules');
  if (modIdx !== -1 && parts.length > modIdx + 1) {
    return parts[modIdx + 1];
  }
  const appIdx = parts.indexOf('Application');
  if (appIdx !== -1 && parts.length > appIdx + 1) {
    return parts[appIdx + 1];
  }
  const epIdx = parts.indexOf('Endpoints');
  if (epIdx !== -1 && parts.length > epIdx + 1) {
    return parts[epIdx + 1].replace(/\.cs$/i, '');
  }
  const domIdx = parts.indexOf('Domain');
  if (domIdx !== -1 && parts.length > domIdx + 2 && parts[domIdx + 1] === 'Entities') {
    return parts[domIdx + 2].replace(/\.cs$/i, '');
  }
  if (parts.includes('app') && parts.includes('Models')) {
    return 'CoreApp';
  }
  return 'Core';
}

// Helper: Scan files recursively
function scanFilesRecursively(dir, filterFn) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'bin' && entry.name !== 'obj' && entry.name !== 'node_modules') {
        results = results.concat(scanFilesRecursively(fullPath, filterFn));
      }
    } else if (entry.isFile() && (!filterFn || filterFn(entry.name, fullPath))) {
      results.push(fullPath);
    }
  }
  return results;
}

let stackConfig = {};
let isDotNet = false;
try {
  const stackJsonPath = [
    path.join(cwd, '.ai', 'stack.json'),
    path.join(cwd, 'stack.json'),
    path.join(cwd, '..', 'stack.json')
  ].find(p => fs.existsSync(p));
  if (stackJsonPath) {
    stackConfig = JSON.parse(fs.readFileSync(stackJsonPath, 'utf8'));
    if (stackConfig.stacks && stackConfig.stacks.backend && stackConfig.stacks.backend.dotnet) {
      isDotNet = true;
    }
  }
} catch (e) {}

if (!isDotNet) {
  isDotNet = fs.existsSync(path.join(cwd, 'src', 'Domain')) ||
    fs.existsSync(path.join(cwd, 'src', 'Application')) ||
    isDotNetProject(cwd);
}

const activeFrontends = Object.entries(stackConfig?.stacks?.frontend || {})
  .filter(([, v]) => v === true)
  .map(([k]) => k);
const openApiEnabled = stackConfig?.stacks?.api_docs?.json_openapi !== false;
const tsSdkEnabled = stackConfig?.stacks?.client_sdk?.typescript === true || stackConfig?.stacks?.client_sdk?.ts === true;
const dartSdkEnabled = stackConfig?.stacks?.client_sdk?.dart === true || stackConfig?.stacks?.client_sdk?.flutter === true;
const mobileEnabled = stackConfig?.mobile_app === true || dartSdkEnabled;

const dotNetEntitiesInfo = isDotNet ? scanDotNetEntities(cwd) : { entities: [], relationships: [] };
const dotNetMinimalApis = isDotNet ? scanDotNetMinimalApis(cwd) : { endpoints: [], groups: [], schemas: {} };

/**
 * Compiles valid OpenAPI 3.0.0 JSON specs per .NET Minimal API endpoint group under docs/modules/<group-slug>.json.
 */
function buildCleanOpenApiPropertySchema(prop) {
  const src = prop?.openApi || { type: 'string' };
  const out = { type: src.type || 'string' };
  if (src.format) out.format = src.format;
  if (src.nullable) out.nullable = true;
  if (src.type === 'array') {
    out.items = buildCleanOpenApiPropertySchema({ openApi: src.items || { type: 'string' } });
  }
  return out;
}

function buildOpenApiComponentSchema(schemaObj, fallbackName) {
  const props = {};
  for (const p of schemaObj?.properties || []) {
    props[p.camelName || p.name] = buildCleanOpenApiPropertySchema(p);
  }
  return {
    type: 'object',
    description: `${schemaObj?.name || fallbackName} contract`,
    properties: props
  };
}

function emitDotNetOpenApiModules() {
  if (!isDotNet || !openApiEnabled || !dotNetMinimalApis.groups || dotNetMinimalApis.groups.length === 0) {
    return 0;
  }
  if (!fs.existsSync(modulesDocsDir)) {
    fs.mkdirSync(modulesDocsDir, { recursive: true });
  }
  const projName = stackConfig?.name || path.basename(cwd);
  let emittedFiles = 0;

  for (const grp of dotNetMinimalApis.groups) {
    if (!grp.endpoints || grp.endpoints.length === 0) continue;

    const schemas = {
      ProblemDetails: {
        type: 'object',
        properties: {
          type: { type: 'string', nullable: true },
          title: { type: 'string', nullable: true },
          status: { type: 'integer', format: 'int32', nullable: true },
          detail: { type: 'string', nullable: true },
          errors: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } }, nullable: true },
          traceId: { type: 'string', nullable: true }
        }
      }
    };

    const paths = {};
    for (let idx = 0; idx < grp.endpoints.length; idx++) {
      const ep = grp.endpoints[idx];
      const lowerVerb = ep.method.toLowerCase();
      if (!paths[ep.route]) paths[ep.route] = {};

      const parameters = [];
      for (const pp of ep.pathParams || []) {
        parameters.push({
          name: pp.name,
          in: 'path',
          required: true,
          schema: pp.format ? { type: pp.type, format: pp.format } : { type: pp.type }
        });
      }
      for (const qp of ep.queryParams || []) {
        parameters.push({
          name: qp.name,
          in: 'query',
          required: !(qp.openApi?.nullable),
          schema: buildCleanOpenApiPropertySchema(qp)
        });
      }

      const isMutating = ['post', 'put', 'patch'].includes(lowerVerb);
      if (isMutating) {
        parameters.push({
          name: 'X-Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Unique UUIDv4 per retry attempt for idempotent write execution.',
          schema: { type: 'string', format: 'uuid' }
        });
      }

      if (ep.requestDto && ep.requestSchema) {
        schemas[ep.requestDto] = buildOpenApiComponentSchema(ep.requestSchema, ep.requestDto);
      }
      if (ep.responseDto && ep.responseSchema) {
        schemas[ep.responseDto] = buildOpenApiComponentSchema(ep.responseSchema, ep.responseDto);
      }

      let requestBody;
      if (isMutating && (ep.isMultipart || ep.requestDto)) {
        if (ep.isMultipart) {
          requestBody = {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          };
        } else if (ep.requestSchema) {
          requestBody = {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${ep.requestDto}` }
              }
            }
          };
        } else {
          requestBody = {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: {} }
              }
            }
          };
        }
      }

      const successCode = lowerVerb === 'post' && !ep.route.includes('search') && !ep.route.includes('preview') ? '201' : '200';
      const successSchema = ep.responseDto && schemas[ep.responseDto]
        ? { $ref: `#/components/schemas/${ep.responseDto}` }
        : { type: 'object', properties: { id: { type: 'integer' }, code: { type: 'string' }, status: { type: 'string' } } };

      const responses = {
        [successCode]: {
          description: ep.summary || 'Success',
          content: {
            'application/json': {
              schema: successSchema
            }
          }
        },
        '400': {
          description: 'Validation or domain rule failure (RFC 9110 ProblemDetails)',
          content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } } }
        }
      };
      if (!ep.isAnonymous) {
        responses['401'] = { description: 'Unauthorized' };
        responses['403'] = { description: 'Forbidden (missing required permission)' };
      }
      if ((ep.pathParams || []).length > 0) {
        responses['404'] = { description: 'Resource not found' };
      }
      if (isMutating || (ep.requestSchema?.properties || []).some(p => /rowversion/i.test(p.name))) {
        responses['409'] = {
          description: 'Optimistic concurrency (RowVersion) or duplicate state conflict',
          content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } } }
        };
      }

      const op = {
        tags: [grp.groupName],
        operationId: ep.handler && ep.handler !== 'InlineLambda' ? ep.handler : `${lowerVerb}_${grp.groupSlug}_${idx}`,
        summary: ep.summary,
        description: ep.description,
        security: ep.isAnonymous ? [] : [{ bearerAuth: [] }],
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(requestBody ? { requestBody } : {}),
        responses
      };

      paths[ep.route][lowerVerb] = op;
    }

    const specDoc = {
      openapi: '3.0.0',
      info: {
        title: `${projName} - ${grp.groupName} API`,
        version: stackConfig?.version || '1.0.0',
        description: grp.description || `Modular OpenAPI 3.0 contract generated from ${grp.sourceFile}`
      },
      servers: [
        { url: 'http://localhost:5000', description: 'Local .NET 10 Minimal API Server' }
      ],
      tags: [
        { name: grp.groupName, description: grp.description || grp.groupName }
      ],
      security: [{ bearerAuth: [] }],
      paths,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        },
        schemas
      }
    };

    const outSpecPath = path.join(modulesDocsDir, `${grp.groupSlug}.json`);
    fs.writeFileSync(outSpecPath, JSON.stringify(specDoc, null, 2) + '\n', 'utf8');
    emittedFiles++;
  }

  return emittedFiles;
}

emitDotNetOpenApiModules();

// 4. Ingest Entities, Controllers, Tables & CODEBASE_MAP.md
let totalModels = 0;
let totalControllers = 0;
let totalTables = 0;
let totalContracts = 0;
let totalViews = 0;

function pushUniqueModel(mod, modelObj) {
  if (!mod.models.some(m => m.modelName === modelObj.modelName)) {
    mod.models.push(modelObj);
    totalModels++;
  }
}

function pushUniqueController(mod, ctrlObj) {
  if (!mod.controllers.some(c => c.ctrlName === ctrlObj.ctrlName)) {
    mod.controllers.push(ctrlObj);
    totalControllers++;
  }
}

function pushUniqueTable(mod, tblObj) {
  if (!mod.tables.some(t => t.tableName === tblObj.tableName)) {
    mod.tables.push(tblObj);
    totalTables++;
  }
}

function resolveDotNetBoundedModule(itemName, tableName, relPath) {
  const candidates = (dotNetMinimalApis.groups || []).map(g => ({
    name: g.groupName,
    norm: g.groupName.replace(/[^a-z0-9]/gi, '').toLowerCase()
  }));
  const normItem = String(itemName || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normTable = String(tableName || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normBase = relPath ? path.basename(relPath, '.cs').replace(/[^a-z0-9]/gi, '').toLowerCase() : '';

  for (const probe of [normTable, normItem, `${normItem}s`, normItem.replace(/y$/, 'ies'), `${normItem}es`, normBase]) {
    if (!probe) continue;
    const exact = candidates.find(c => c.norm === probe);
    if (exact) return exact.name;
  }
  if (normBase) {
    const partial = candidates.find(c => c.norm === `${normBase}s` || c.norm === normBase.replace(/y$/, 'ies'));
    if (partial) return partial.name;
  }
  return itemName || extractModuleName(relPath);
}

// Scan .NET projects if present
if (isDotNet) {
  for (const ent of dotNetEntitiesInfo.entities) {
    const modName = resolveDotNetBoundedModule(ent.name, ent.table, ent.file);
    const mod = getModule(modName);
    pushUniqueModel(mod, { modelName: ent.name, tableName: ent.table, filePath: ent.file });
  }

  const configDir = path.join(cwd, 'src', 'Infrastructure', 'Data', 'Configurations');
  if (fs.existsSync(configDir)) {
    const configFiles = scanFilesRecursively(configDir, name => name.endsWith('.cs'));
    for (const cf of configFiles) {
      try {
        const code = fs.readFileSync(cf, 'utf8');
        const relPath = path.relative(cwd, cf).replace(/\\/g, '/');
        for (const cfgM of code.matchAll(/IEntityTypeConfiguration<([A-Za-z0-9_]+)>[\s\S]*?(?=IEntityTypeConfiguration<|$)/g)) {
          const entName = cfgM[1];
          const tMatch = cfgM[0].match(/ToTable\(\s*["']([^"']+)["']\s*\)/);
          const tableName = tMatch ? tMatch[1].trim() : entName;
          const modName = resolveDotNetBoundedModule(entName, tableName, relPath);
          const mod = getModule(modName);
          pushUniqueTable(mod, { tableName, migrationFile: relPath });
        }
      } catch {}
    }
  }

  for (const grp of dotNetMinimalApis.groups) {
    const mod = getModule(grp.groupName);
    pushUniqueController(mod, { ctrlName: grp.groupName, filePath: grp.sourceFile });
  }
}

if (codebaseMapPath && fs.existsSync(codebaseMapPath)) {
  const mapContent = fs.readFileSync(codebaseMapPath, 'utf8');

  // Section 1: Backend Models
  const modelRegex = /\|\s*`([A-Za-z0-9_]+)`\s*\|\s*(?:Eloquent|CakePHP Table|EF Core Entity)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gi;
  let mMatch;
  while ((mMatch = modelRegex.exec(mapContent)) !== null) {
    const modelName = mMatch[1].trim();
    const tableName = mMatch[2].trim();
    const filePath = mMatch[3].trim();
    const modName = isDotNet ? resolveDotNetBoundedModule(modelName, tableName, filePath) : extractModuleName(filePath);
    const mod = getModule(modName);
    pushUniqueModel(mod, { modelName, tableName, filePath });
  }

  // Section 2: Controllers
  const ctrlRegex = /\|\s*`([A-Za-z0-9_]+)`\s*\|\s*([^|]+)\|\s*`([^`]+)`\s*\|/gi;
  let cMatch;
  while ((cMatch = ctrlRegex.exec(mapContent)) !== null) {
    const ctrlName = cMatch[1].trim();
    const stackCell = cMatch[2].trim();
    const filePath = cMatch[3].trim();
    if (filePath.includes('Controller') || /ASP\.NET|Laravel|CakePHP/i.test(stackCell)) {
      const modName = isDotNet ? resolveDotNetBoundedModule(ctrlName, ctrlName, filePath) : extractModuleName(filePath);
      const mod = getModule(modName);
      pushUniqueController(mod, { ctrlName, filePath });
    }
  }

  // Section 3: Tables
  const tblRegex = /\|\s*`([A-Za-z0-9_]+)`\s*\|\s*`([^`]+)`\s*\|/gi;
  let tMatch;
  while ((tMatch = tblRegex.exec(mapContent)) !== null) {
    const tableName = tMatch[1].trim();
    const migrationFile = tMatch[2].trim();
    if (!migrationFile.includes('migration') && !migrationFile.includes('Configuration')) continue;
    const modName = isDotNet ? resolveDotNetBoundedModule(tableName, tableName, migrationFile) : extractModuleName(migrationFile);
    const mod = getModule(modName);
    pushUniqueTable(mod, { tableName, migrationFile });
  }

  // Section 4: Contracts
  const cntrRegex = /\|\s*`([A-Za-z0-9_]+)`\s*\|\s*`([^`]+)`\s*\|/gi;
  const sec4Block = mapContent.match(/## 4\. Contracts & Interfaces[\s\S]*?(?=## 5\.|$)/);
  if (sec4Block) {
    let cntrMatch;
    while ((cntrMatch = cntrRegex.exec(sec4Block[0])) !== null) {
      const contractName = cntrMatch[1].trim();
      const filePath = cntrMatch[2].trim();
      const mod = getModule(extractModuleName(filePath));
      if (!mod.contracts.some(c => c.contractName === contractName)) {
        mod.contracts.push({ contractName, filePath });
        totalContracts++;
      }
    }
  }

  // Section 5: Views
  const viewRegex = /\|\s*`([A-Za-z0-9_.-]+)`\s*\|\s*[^|]+\|\s*`([^`]+)`\s*\|/gi;
  let vMatch;
  while ((vMatch = viewRegex.exec(mapContent)) !== null) {
    const viewName = vMatch[1].trim();
    const filePath = vMatch[2].trim();
    if (filePath.endsWith('.vue') || filePath.endsWith('.blade.php') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      const mod = getModule(extractModuleName(filePath));
      mod.views.push({ viewName, filePath });
      totalViews++;
    }
  }
}

// 5. Ingest OpenAPI Specs & Match to Modules
let totalEndpoints = 0;
let modularCount = 0;

// 5a. Read docs/modules/*.json first
if (fs.existsSync(modulesDocsDir)) {
  const projSlug = String(stackConfig?.name || path.basename(cwd)).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const specFiles = fs.readdirSync(modulesDocsDir).filter(f =>
    f.endsWith('.json') &&
    f !== 'modules_config.json' &&
    f !== `${projSlug}.json` &&
    !f.endsWith('_master.json') &&
    f !== 'unified.json'
  );
  for (const sf of specFiles) {
    modularCount++;
    const baseName = path.basename(sf, '.json');
    const normalizedBase = baseName.replace(/[^a-z0-9]/gi, '').toLowerCase();
    try {
      const spec = JSON.parse(fs.readFileSync(path.join(modulesDocsDir, sf), 'utf8'));
      let count = 0;
      if (spec.paths) {
        for (const methods of Object.values(spec.paths)) {
          count += Object.keys(methods).length;
        }
      }
      totalEndpoints += count;

      let matched = false;
      for (const [modKey, modObj] of modulesMap.entries()) {
        const normMod = modKey.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (normMod === normalizedBase) {
          modObj.openApiEndpoints += count;
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (const [modKey, modObj] of modulesMap.entries()) {
          const normMod = modKey.replace(/[^a-z0-9]/gi, '').toLowerCase();
          if (normalizedBase.includes(normMod) || normMod.includes(normalizedBase)) {
            modObj.openApiEndpoints += count;
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        const fallbackMod = getModule(baseName);
        fallbackMod.openApiEndpoints += count;
      }
    } catch {}
  }
}

// 5b. Fallback to root docs/openapi.json only when no modular specs exist
const rootOpenApi = path.join(docsDir, 'openapi.json');
if (modularCount === 0 && fs.existsSync(rootOpenApi)) {
  try {
    const spec = JSON.parse(fs.readFileSync(rootOpenApi, 'utf8'));
    if (spec.paths) {
      for (const [routePath, methods] of Object.entries(spec.paths)) {
        const methodCount = Object.keys(methods).length;
        totalEndpoints += methodCount;

        const seg = routePath.split('/').filter(Boolean)[1] || routePath.split('/').filter(Boolean)[0] || 'Core';
        const normSeg = seg.replace(/[^a-z0-9]/gi, '').toLowerCase();
        let matched = false;
        for (const [modKey, modObj] of modulesMap.entries()) {
          const normMod = modKey.replace(/[^a-z0-9]/gi, '').toLowerCase();
          if (normSeg.includes(normMod) || normMod.includes(normSeg)) {
            modObj.openApiEndpoints += methodCount;
            matched = true;
            break;
          }
        }
        if (!matched) {
          const fallbackMod = getModule(seg.charAt(0).toUpperCase() + seg.slice(1));
          fallbackMod.openApiEndpoints += methodCount;
        }
      }
    }
  } catch {}
}

// 6. Check Postman & SDK Availability
for (const [modKey, modObj] of modulesMap.entries()) {
  const cleanKey = modKey.replace(/[^a-z0-9]/gi, '').toLowerCase();

  if (fs.existsSync(postmanDir)) {
    const postmanFiles = fs.readdirSync(postmanDir);
    modObj.hasPostman = postmanFiles.some(f => f.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(cleanKey));
  }
  if (fs.existsSync(sdkTsDir)) {
    const tsFiles = fs.readdirSync(sdkTsDir);
    modObj.hasTsSdk = tsFiles.some(f => f.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(cleanKey));
  }
  if (fs.existsSync(sdkDartDir)) {
    const dartFiles = fs.readdirSync(sdkDartDir);
    modObj.hasDartSdk = dartFiles.some(f => f.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(cleanKey));
  }
}

// If no modules found in CODEBASE_MAP (empty initial workspace), provide clean core fallback
if (modulesMap.size === 0) {
  const m = getModule('CoreDomain');
  m.models.push({ modelName: 'CoreEntity', tableName: 'core_entities' });
  m.controllers.push({ ctrlName: 'CoreApiController' });
}

const sortedModules = Array.from(modulesMap.values()).sort((a, b) => b.models.length - a.models.length);

// 7. Generate Live Architecture Markdown Document
function sanitizeMermaidId(raw) {
  let clean = String(raw || 'Entity').replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+/, '');
  if (!clean) clean = 'Entity';
  if (/^[0-9]/.test(clean)) clean = `E_${clean}`;
  return clean;
}

function sanitizeMermaidType(raw) {
  const s = String(raw || 'string').trim();
  if (/^(?:I?List|I?Collection|I?Enumerable|I?ReadOnlyList)</i.test(s) || /\[\]$/.test(s)) return 'array';
  if (/^Guid\??$/i.test(s)) return 'uuid';
  if (/^DateTime(?:Offset)?\??$/i.test(s)) return 'datetime';
  if (/^bool\??$/i.test(s)) return 'boolean';
  if (/^decimal\??$/i.test(s)) return 'decimal';
  const clean = s.replace(/\?/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return clean || 'string';
}

function buildDynamicMermaidTopology() {
  const frontendLabels = {
    vue: 'Vue 3',
    nuxt: 'Nuxt',
    react: 'React',
    next: 'Next.js',
    angular: 'Angular',
    svelte: 'Svelte'
  };
  const enabledFrontendNames = activeFrontends.map(k => frontendLabels[k] || k);

  const clientNodes = [];
  const clientNodeIds = [];
  if (enabledFrontendNames.length > 0) {
    clientNodes.push(`        WebAdmin["💻 Web Portal (${enabledFrontendNames.join(' / ')})"]`);
    clientNodeIds.push('WebAdmin');
  } else {
    clientNodes.push(`        WebAdmin["🌐 API Consumers & Enterprise Portal Clients"]`);
    clientNodeIds.push('WebAdmin');
  }
  if (mobileEnabled) {
    clientNodes.push(`        MobileApp["📲 Mobile App (Flutter / Dart)"]`);
    clientNodeIds.push('MobileApp');
  }
  if (tsSdkEnabled || dartSdkEnabled) {
    const sdkList = [tsSdkEnabled ? '@sdk/ts' : '', dartSdkEnabled ? '@sdk/dart' : ''].filter(Boolean);
    clientNodes.push(`        ClientSdk["📦 Auto-Generated SDKs (${sdkList.join(' & ')})"]`);
  }

  const hasSdkNode = tsSdkEnabled || dartSdkEnabled;
  const entryTarget = hasSdkNode ? 'ClientSdk' : (isDotNet ? 'BearerAuth' : 'TenantGuard');
  const clientEdges = clientNodeIds.map(id => `    ${id} --> ${entryTarget}`);
  if (hasSdkNode) {
    clientEdges.push(`    ClientSdk --> ${isDotNet ? 'BearerAuth' : 'TenantGuard'}`);
  }
  const allClientClassIds = [...clientNodeIds, ...(hasSdkNode ? ['ClientSdk'] : [])];

  if (isDotNet) {
    const groupCount = dotNetMinimalApis.groups ? dotNetMinimalApis.groups.length : totalControllers;
    return `\`\`\`mermaid
flowchart TB
    subgraph Client_Tier["📱 Client & API Consumer Layer"]
${clientNodes.join('\n')}
    end

    subgraph Security_Gate["🛡️ Autonomous Security & Governance Boundary"]
        BearerAuth["🔐 Policy & Bearer Authorization"]
        ValidationGate["✅ FluentValidation & Request Pipeline"]
        PIIScrubber["👁️ IPDPL Guardian: PII Masking & Audit Logging"]
    end

    subgraph Web_Tier["🌐 Presentation Layer (src/Web)"]
        Endpoints["Minimal API Endpoints (${groupCount} Groups / ${totalEndpoints} Routes)"]
        ProblemDetails["RFC 9110 ProblemDetails & TypedResults"]
    end

    subgraph App_Tier["⚡ Application Layer (src/Application)"]
        MediatR["MediatR Commands & Queries (CQRS)"]
        Behaviours["Authorization, Validation & Performance Behaviours"]
    end

    subgraph Domain_Tier["🏛️ Domain Core Layer (src/Domain)"]
        Entities["Domain Entities & Value Objects (${totalModels} Entities)"]
        Events["Domain Events & Business Rules"]
    end

    subgraph Infra_Tier["💾 Persistence & Infrastructure (src/Infrastructure)"]
        DbContext["EF Core DbContext & Entity Configurations (${totalTables} Tables)"]
        Indexes["Relational & ESR Composite Indexes"]
        OpenApiContracts["OpenAPI 3.0 (${modularCount} Module Specs) & Postman v2.1"]
    end

${clientEdges.join('\n')}
    BearerAuth --> ValidationGate
    ValidationGate --> PIIScrubber
    PIIScrubber --> Endpoints
    Endpoints --> ProblemDetails
    Endpoints --> MediatR
    MediatR --> Behaviours
    Behaviours --> Entities
    Entities --> Events
    Behaviours --> DbContext
    DbContext --> Indexes
    Endpoints -.-> OpenApiContracts

    classDef client fill:#f0f9ff,stroke:#0284c7,stroke-width:2px;
    classDef gate fill:#fef2f2,stroke:#ef4444,stroke-width:2px;
    classDef web fill:#fefce8,stroke:#eab308,stroke-width:2px;
    classDef app fill:#f5f3ff,stroke:#8b5cf6,stroke-width:2px;
    classDef domain fill:#fdf2f8,stroke:#ec4899,stroke-width:2px;
    classDef infra fill:#ecfdf5,stroke:#10b981,stroke-width:2px;

    class ${allClientClassIds.join(',')} client;
    class BearerAuth,ValidationGate,PIIScrubber gate;
    class Endpoints,ProblemDetails web;
    class MediatR,Behaviours app;
    class Entities,Events domain;
    class DbContext,Indexes,OpenApiContracts infra;
\`\`\``;
  }

  const displayMods = sortedModules.slice(0, 6);
  return `\`\`\`mermaid
flowchart TB
    subgraph Client_Tier["📱 Client Experience Layer"]
${clientNodes.join('\n')}
    end

    subgraph Security_Gate["🛡️ Autonomous Security & Governance Boundary"]
        TenantGuard["🔐 Security Sentinel: Multi-Tenant Query Scope"]
        IdempotencyLock["⚡ Mobile Bridge: X-Idempotency-Key Lock (120s TTL)"]
        PIIScrubber["👁️ IPDPL Guardian: PII Masking & Log Sanitization"]
    end

    subgraph Api_Tier["🌐 HTTP & Routing Tier (Thin Controllers)"]
${displayMods.map(m => `        API_${sanitizeMermaidId(m.name)}["${m.name} APIs (${m.controllers.length} Controllers)"]`).join('\n')}
    end

    subgraph Service_Tier["⚙️ Application & Service Layer (Contracts)"]
${displayMods.map(m => `        SVC_${sanitizeMermaidId(m.name)}["${m.name} Services & Adapters (${m.contracts.length} Contracts)"]`).join('\n')}
    end

    subgraph Data_Tier["💾 Persistence Tier (ESR Indexed Database)"]
${displayMods.map(m => `        DB_${sanitizeMermaidId(m.name)}[("${m.name} Tables (${m.models.length} Models)")]`).join('\n')}
    end

${clientEdges.join('\n')}
    TenantGuard --> IdempotencyLock
    IdempotencyLock --> PIIScrubber
${displayMods.map(m => {
  const mid = sanitizeMermaidId(m.name);
  return `    PIIScrubber --> API_${mid}\n    API_${mid} --> SVC_${mid}\n    SVC_${mid} --> DB_${mid}`;
}).join('\n')}

    classDef client fill:#f0f9ff,stroke:#0284c7,stroke-width:2px;
    classDef gate fill:#fef2f2,stroke:#ef4444,stroke-width:2px;
    classDef api fill:#fefce8,stroke:#eab308,stroke-width:2px;
    classDef svc fill:#f5f3ff,stroke:#8b5cf6,stroke-width:2px;
    classDef db fill:#ecfdf5,stroke:#10b981,stroke-width:2px;

    class ${allClientClassIds.join(',')} client;
    class TenantGuard,IdempotencyLock,PIIScrubber gate;
${displayMods.map(m => {
  const mid = sanitizeMermaidId(m.name);
  return `    class API_${mid} api;\n    class SVC_${mid} svc;\n    class DB_${mid} db;`;
}).join('\n')}
\`\`\``;
}

function buildDynamicMermaidErd() {
  if (isDotNet && dotNetEntitiesInfo.entities && dotNetEntitiesInfo.entities.length > 0) {
    const degreeMap = new Map();
    for (const rel of dotNetEntitiesInfo.relationships || []) {
      degreeMap.set(rel.from, (degreeMap.get(rel.from) || 0) + 1);
      degreeMap.set(rel.to, (degreeMap.get(rel.to) || 0) + 1);
    }

    const connectedNames = new Set();
    for (const rel of dotNetEntitiesInfo.relationships || []) {
      connectedNames.add(rel.from);
      connectedNames.add(rel.to);
    }

    const prioritized = [...dotNetEntitiesInfo.entities].sort((a, b) => {
      const degDiff = (degreeMap.get(b.name) || 0) - (degreeMap.get(a.name) || 0);
      if (degDiff !== 0) return degDiff;
      return (b.fields?.length || 0) - (a.fields?.length || 0) || a.name.localeCompare(b.name);
    });

    const selected = [];
    const selectedSet = new Set();
    for (const ent of prioritized) {
      if (connectedNames.has(ent.name) || selected.length < 36) {
        if (selected.length >= 48) break;
        selected.push(ent);
        selectedSet.add(ent.name);
      }
    }

    const lines = ['```mermaid', 'erDiagram'];
    const emittedEdges = new Set();
    for (const rel of dotNetEntitiesInfo.relationships || []) {
      if (!selectedSet.has(rel.from) || !selectedSet.has(rel.to)) continue;
      const fromId = sanitizeMermaidId(rel.from);
      const toId = sanitizeMermaidId(rel.to);
      const cleanLabel = String(rel.label || rel.fk || 'has').replace(/["\\\r\n]/g, '').trim() || 'has';
      const edgeKey = `${fromId}->${toId}:${cleanLabel}`;
      if (emittedEdges.has(edgeKey)) continue;
      emittedEdges.add(edgeKey);
      lines.push(`    ${fromId} ||--o{ ${toId} : "${cleanLabel}"`);
    }

    for (const ent of selected) {
      const entId = sanitizeMermaidId(ent.name);
      lines.push(`    ${entId} {`);
      const seenFields = new Set();
      const fieldList = (ent.fields && ent.fields.length > 0)
        ? ent.fields.slice(0, 8)
        : [{ name: 'Id', type: 'int', isPk: true, isFk: false }];
      for (const f of fieldList) {
        const fName = sanitizeMermaidId(f.name);
        if (seenFields.has(fName)) continue;
        seenFields.add(fName);
        const fType = sanitizeMermaidType(f.type);
        const keyFlag = f.isPk ? ' PK' : (f.isFk ? ' FK' : '');
        lines.push(`        ${fType} ${fName}${keyFlag}`);
      }
      lines.push('    }');
    }
    lines.push('```');
    return lines.join('\n');
  }

  // Non-.NET / Generic Dynamic ERD synthesized strictly from discovered codebase models/tables
  const discoveredEnts = [];
  const seenEntNames = new Set();
  for (const mod of sortedModules) {
    for (const m of mod.models || []) {
      const eName = m.modelName || m.tableName;
      if (!eName || seenEntNames.has(eName)) continue;
      seenEntNames.add(eName);
      discoveredEnts.push({
        name: eName,
        table: m.tableName || eName.toLowerCase(),
        module: mod.name
      });
    }
    for (const t of mod.tables || []) {
      if (!t.tableName || seenEntNames.has(t.tableName)) continue;
      seenEntNames.add(t.tableName);
      discoveredEnts.push({
        name: t.tableName,
        table: t.tableName,
        module: mod.name
      });
    }
  }

  if (discoveredEnts.length === 0) {
    return `\`\`\`mermaid
erDiagram
    CORE_DOMAIN ||--o{ CORE_ENTITY : contains
    CORE_DOMAIN {
        bigint id PK
        string name
        string status
    }
    CORE_ENTITY {
        bigint id PK
        bigint core_domain_id FK
        string code
        string status
    }
\`\`\``;
  }

  const lines = ['```mermaid', 'erDiagram'];
  const limited = discoveredEnts.slice(0, 24);
  const byModule = new Map();
  for (const item of limited) {
    if (!byModule.has(item.module)) byModule.set(item.module, []);
    byModule.get(item.module).push(item);
  }
  for (const [, modItems] of byModule.entries()) {
    if (modItems.length > 1) {
      const rootId = sanitizeMermaidId(modItems[0].name);
      for (let i = 1; i < modItems.length; i++) {
        lines.push(`    ${rootId} ||--o{ ${sanitizeMermaidId(modItems[i].name)} : relates_to`);
      }
    }
  }
  for (const item of limited) {
    const id = sanitizeMermaidId(item.name);
    lines.push(`    ${id} {`);
    lines.push(`        bigint id PK`);
    lines.push(`        string table_name`);
    lines.push(`    }`);
  }
  lines.push('```');
  return lines.join('\n');
}

function buildArchitectureDoc() {
  const archPattern = isDotNet
    ? 'Clean Architecture (.NET 10 Domain / Application / Infrastructure / Web)'
    : 'Microservice-Minded Modular Monolith (HMVC & Standalone Package Decoupling)';

  const invariantsSection = isDotNet
    ? `1. **Thin Minimal API Endpoint Groups (\`IEndpointGroup\`):** Route handlers in \`src/Web/Endpoints/\` delegate immediately to MediatR commands/queries without business logic leakage.
2. **CQRS & Validation Pipeline:** Every state-changing request routes through \`FluentValidation\` \`AbstractValidator<T>\` and MediatR authorization/logging pipeline behaviours.
3. **Explicit Entity Configurations (\`IEntityTypeConfiguration<T>\`):** Schema tables, foreign keys, delete behaviors, and ESR composite indexes are declared explicitly under \`src/Infrastructure/Data/Configurations/\`.
4. **Canonical ProblemDetails & Envelope Contracts:** Errors serialize via RFC 9110 \`ProblemDetails\` and OpenAPI 3.0 contracts compiled in \`docs/modules/*.json\` and \`docs/openapi.json\`.
5. **Dual-Layer Classification & PII Governance:** Sensitive entity fields and connection strings are masked before diagnostic logging and protected by RBAC policy checks.`
    : `1. **Config-Bound BelongsTo Relations:** Cross-domain Eloquent relationships MUST resolve model classes dynamically via \`config('module.models.key')\` to ensure microservice extractability.
2. **Contract-Based Entity Resolution (\`Contracts/External/\`):** Cross-boundary data lookups use strictly-typed contracts (\`findManyByIds\`) avoiding SQL cross-joins.
3. **Dual-Guard Auth Identity Extraction:** Controllers extract user credentials safely via \`AuthUserDto::fromRequest($request)\` rather than concrete User model binding.
4. **Batch Transformer Hydration:** External entities are batch-resolved in service layers to guarantee zero N+1 database queries.
5. **Zero Cross-Boundary Foreign Keys:** Physical SQL foreign keys across package boundaries are strictly prohibited.`;

  let doc = `# Live System Topology & Reverse Architecture Specification

> **Engine:** \`InnovaDigits Reverse Architecture Visualizer (v${pkgVersion})\`  
> **Timestamp:** \`${new Date().toISOString()}\`  
> **Codebase Metrics:** \`${totalModels}\` Models • \`${totalControllers}\` Controllers/Groups • \`${totalTables}\` Tables • \`${totalContracts}\` Contracts • \`${totalEndpoints}\` API Endpoints  
> **Architecture Pattern:** ${archPattern}

---

## 1. Live System Topology Diagram

Reconstructed dynamically from discovered \`stack.json\` profile flags, client entry points, API groups, service contracts, and database models:

${buildDynamicMermaidTopology()}

---

## 2. Domain Entity Relationship Graph (Reconstructed ERD)

Reconstructed dynamically from discovered domain entities, EF Core \`IEntityTypeConfiguration\` definitions, and foreign key relationships:

${buildDynamicMermaidErd()}

---

## 3. Module Architecture & API Coverage Matrix

| Module / Bounded Context | Models | Controllers / Groups | UI Views | OpenAPI Endpoints | Postman Collection | Client SDK Status | Governance Health |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${sortedModules.map(m => {
  const sdkStatus = (tsSdkEnabled || dartSdkEnabled)
    ? (m.hasTsSdk && m.hasDartSdk ? '🟢 SYNCED' : (m.hasTsSdk || m.hasDartSdk ? '🟡 PARTIAL' : '⚪ PENDING'))
    : '➖ N/A (Disabled)';
  const postmanStatus = m.hasPostman ? '🟢 COMPILED' : '⚪ PENDING';
  const healthBadge = m.models.length > 0 && (m.controllers.length > 0 || m.openApiEndpoints > 0) ? '🟢 GOVERNED' : '🟡 IN_PROGRESS';
  return `| **${m.name}** | \`${m.models.length}\` | \`${m.controllers.length}\` | \`${m.views.length}\` | \`${m.openApiEndpoints}\` | ${postmanStatus} | ${sdkStatus} | ${healthBadge} |`;
}).join('\n')}

---

## 4. Architectural Invariants & Decoupling Checklist

${invariantsSection}

---
*Generated by InnovaDigits Reverse Architecture Visualizer Engine (v${pkgVersion}).*
`;

  return doc;
}

const markdownReport = buildArchitectureDoc();

function toSnakeCase(str) {
  return String(str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function pluralizeWord(word) {
  if (!word) return 'Core';
  if (/s$/i.test(word)) return word;
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(?:ch|sh|x|z)$/i.test(word)) return word + 'es';
  return word + 's';
}

function toUpperToken(str) {
  return String(str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase() || 'CORE';
}

function inferDomainModule(relPath, hintName = '') {
  const norm = String(relPath || '').replace(/\\/g, '/');
  const parts = norm.split('/');

  const modIdx = parts.indexOf('Modules');
  if (modIdx !== -1 && parts[modIdx + 1]) return parts[modIdx + 1];

  const pkgIdx = parts.indexOf('packages');
  if (pkgIdx !== -1 && parts[pkgIdx + 1]) return parts[pkgIdx + 1];

  const appLayerIdx = parts.indexOf('Application');
  if (appLayerIdx !== -1 && parts[appLayerIdx + 1] && !parts[appLayerIdx + 1].endsWith('.cs')) {
    return parts[appLayerIdx + 1];
  }

  let stem = String(hintName || path.basename(norm, path.extname(norm)))
    .replace(/^(?:Store|Update|Create|Delete|List|Get|Show|Sync|Export|Verify)/, '')
    .replace(/(?:ApiController|Controller|FormRequest|Request|Validator|Resource|Repository|Service|Checkout|Index|List|Detail|Form|Page|View|Modal|Card|Table|Component)$/i, '')
    .replace(/^create_|_table$/gi, '')
    .replace(/^\d+_\d+_\d+_\d+_/, '');

  if (!stem || stem.toLowerCase() === 'api' || stem.toLowerCase() === 'web') {
    return 'Core';
  }

  const pascal = stem
    .split(/[_-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  return pluralizeWord(pascal || 'Core');
}

function runBaIntakeExport() {
  const excludedDirs = new Set([
    'node_modules', 'vendor', '.git', 'bin', 'obj', 'dist', 'build',
    '.nuxt', '.output', '.next', '.ai', 'docs', 'specs', 'telemetry',
    'templates', 'rules', 'skills', 'hooks', '.agents', '.cursor', '.github', 'reports'
  ]);

  function walkSourceFiles(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirs.has(entry.name)) {
          walkSourceFiles(full, results);
        }
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
    return results;
  }

  const allFiles = walkSourceFiles(cwd);
  const discoveredModels = [];
  const discoveredTables = [];
  const discoveredValidators = [];
  const discoveredControllers = [];
  const discoveredRoutes = [];
  const discoveredScreens = [];
  const candidateEnums = [];
  const candidateSeeds = [];

  const controllerMethodValidators = new Map(); // "OrderController@store" -> "StoreOrderRequest"
  const seenEnumIds = new Set();
  const seenSeedIds = new Set();

  function addEnumCandidate(moduleName, rawName, values, sourceFile) {
    const cleanVals = Array.from(new Set((values || []).map(v => String(v).trim()).filter(Boolean)));
    if (cleanVals.length === 0) return;
    const modTok = toUpperToken(moduleName.replace(/s$/i, ''));
    const fieldTok = toUpperToken(rawName);
    const enumId = fieldTok.startsWith(modTok) ? `ENUM-${fieldTok}` : `ENUM-${modTok}-${fieldTok}`;
    const dedupeKey = `${enumId}:${cleanVals.join(',')}`;
    if (seenEnumIds.has(dedupeKey)) return;
    seenEnumIds.add(dedupeKey);
    candidateEnums.push({
      enum_id: enumId,
      name: rawName,
      module: moduleName,
      values: cleanVals,
      source_file: sourceFile
    });
  }

  function addSeedCandidate(moduleName, category, rawName, value, unit, sourceFile) {
    const modTok = toUpperToken(moduleName.replace(/s$/i, ''));
    const keyTok = toUpperToken(rawName);
    const seedId = keyTok.startsWith(modTok) ? `SEED-${keyTok}` : `SEED-${modTok}-${keyTok}`;
    const dedupeKey = `${seedId}:${sourceFile}:${value}`;
    if (seenSeedIds.has(dedupeKey)) return;
    seenSeedIds.add(dedupeKey);
    candidateSeeds.push({
      seed_id: seedId,
      category,
      name: rawName,
      module: moduleName,
      value: Number.isNaN(Number(value)) ? value : Number(value),
      unit,
      source_file: sourceFile
    });
  }

  function scanNumericAndEnumPatterns(code, relFile, moduleName) {
    // Pagination sizes
    for (const m of code.matchAll(/->(?:paginate|simplePaginate|cursorPaginate)\(\s*(\d+)\s*\)/g)) {
      addSeedCandidate(moduleName, 'pagination', 'PAGINATION-LIMIT', m[1], 'items_per_page', relFile);
    }
    for (const m of code.matchAll(/\b(?:PER_PAGE|PAGE_SIZE|DEFAULT_PAGE_SIZE|perPage|pageSize)\s*[:=]\s*(\d+)\b/g)) {
      addSeedCandidate(moduleName, 'pagination', 'PAGE-SIZE', m[1], 'items_per_page', relFile);
    }

    // OTP / Token / Session / Cache TTLs
    for (const m of code.matchAll(/\b(OTP_TTL(?:_SECONDS|_MINUTES)?|TOKEN_TTL|SESSION_TTL|CACHE_TTL|LOCK_TTL|OTP_EXPIRY|EXPIRES_IN)\s*[:=]\s*(\d+)\b/gi)) {
      const unit = /min/i.test(m[1]) ? 'minutes' : 'seconds';
      addSeedCandidate(moduleName, 'ttl_timer', m[1], m[2], unit, relFile);
    }
    for (const m of code.matchAll(/->addMinutes\(\s*(\d+)\s*\)/g)) {
      addSeedCandidate(moduleName, 'ttl_timer', 'EXPIRY-MINUTES', m[1], 'minutes', relFile);
    }
    for (const m of code.matchAll(/\blockFor\(\s*(\d+)\s*\)/g)) {
      addSeedCandidate(moduleName, 'idempotency_lock', 'LOCK-TTL', m[1], 'seconds', relFile);
    }

    // File size / upload limits & rate limits
    for (const m of code.matchAll(/\b(MAX_FILE_SIZE|MAX_UPLOAD_SIZE|MAX_ATTACHMENT_KB)\s*[:=]\s*(\d+)\b/gi)) {
      addSeedCandidate(moduleName, 'upload_limit', m[1], m[2], 'kb_or_bytes', relFile);
    }
    for (const m of code.matchAll(/throttle:(\d+)\s*,\s*(\d+)/g)) {
      addSeedCandidate(moduleName, 'rate_limit', 'RATE-LIMIT-PER-WINDOW', m[1], `requests_per_${m[2]}m`, relFile);
    }
    for (const m of code.matchAll(/\b(TAX_RATE|VAT_RATE|DEFAULT_TAX|MAX_ATTEMPTS|RETRY_LIMIT)\s*[:=]\s*(\d+(?:\.\d+)?)\b/gi)) {
      addSeedCandidate(moduleName, 'threshold', m[1], m[2], 'numeric', relFile);
    }

    // PHP / TS / C# Enums
    for (const m of code.matchAll(/\benum\s+([A-Za-z0-9_]+)(?:\s*:\s*[a-z]+)?\s*\{([\s\S]*?)\}/g)) {
      const enumName = m[1];
      const body = m[2];
      const vals = [];
      for (const cm of body.matchAll(/case\s+[A-Za-z0-9_]+\s*=\s*['"]([^'"]+)['"]/g)) vals.push(cm[1]);
      if (vals.length === 0) {
        for (const cm of body.matchAll(/\b([A-Z][A-Za-z0-9_]+)\s*(?:=|,|\n|$)/g)) {
          if (cm[1] !== 'case') vals.push(cm[1]);
        }
      }
      addEnumCandidate(moduleName, enumName, vals, relFile);
    }

    // Class STATUS_* constants
    const statusConsts = [];
    for (const m of code.matchAll(/\bconst\s+STATUS_[A-Z0-9_]+\s*=\s*['"]([^'"]+)['"]/g)) {
      statusConsts.push(m[1]);
    }
    if (statusConsts.length > 0) {
      addEnumCandidate(moduleName, 'STATUS', statusConsts, relFile);
    }
  }

  // Pass 0 (.NET 10): Pre-ingest AST-aware Entities & Minimal API EndpointGroups
  if (isDotNet) {
    for (const ent of dotNetEntitiesInfo.entities || []) {
      const modName = inferDomainModule(ent.file, ent.name);
      discoveredModels.push({
        name: ent.name,
        module: modName,
        table: ent.table || pluralizeWord(toSnakeCase(ent.name)),
        fillable: (ent.fields || []).map(f => f.name),
        casts: [],
        file_path: ent.file
      });
      discoveredTables.push({
        name: ent.table || pluralizeWord(toSnakeCase(ent.name)),
        module: modName,
        columns: (ent.fields || []).map(f => ({ name: f.name, type: f.type })),
        indexes: [],
        migration_file: ent.file
      });
    }

    for (const grp of dotNetMinimalApis.groups || []) {
      const modName = inferDomainModule(grp.sourceFile, grp.groupName);
      discoveredControllers.push({
        name: grp.groupName,
        module: modName,
        actions: (grp.endpoints || []).map(ep => ({
          action: ep.handler || ep.method.toLowerCase(),
          validator: ep.requestDto || null
        })),
        file_path: grp.sourceFile
      });
      for (const ep of grp.endpoints || []) {
        discoveredRoutes.push({
          method: ep.method,
          path: ep.route,
          controller: grp.groupName,
          action: ep.handler || ep.method.toLowerCase(),
          validator: ep.requestDto || null,
          middleware: ep.auth ? [ep.auth] : [],
          module: inferDomainModule(ep.sourceFile, grp.groupName),
          source_file: ep.sourceFile
        });
      }
    }
  }

  // Pass 1: Models, Migrations, Validators, Controllers, Views
  for (const absFile of allFiles) {
    const relFile = path.relative(cwd, absFile).replace(/\\/g, '/');
    const ext = path.extname(absFile).toLowerCase();
    if (!['.php', '.cs', '.ts', '.tsx', '.js', '.jsx', '.vue', '.prisma', '.html'].includes(ext)) continue;

    let code = '';
    try {
      code = fs.readFileSync(absFile, 'utf8');
    } catch {
      continue;
    }

    // 1A. Laravel Migrations
    if (ext === '.php' && (/migrations\//i.test(relFile) || /Schema::create\s*\(/.test(code))) {
      for (const sm of code.matchAll(/Schema::create\(\s*['"]([^'"]+)['"]\s*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\)/g)) {
        const tableName = sm[1].trim();
        const body = sm[2];
        const modName = inferDomainModule(relFile, tableName);
        const columns = [];
        const indexes = [];

        if (/\$table->id\s*\(/.test(body)) columns.push({ name: 'id', type: 'bigint_pk' });
        if (/\$table->uuid\s*\(\s*\)/.test(body)) columns.push({ name: 'uuid', type: 'uuid' });

        for (const colMatch of body.matchAll(/\$table->([a-zA-Z]+)\(\s*['"]([^'"]+)['"]([^;\n]*)/g)) {
          const colType = colMatch[1];
          const colName = colMatch[2];
          const rest = colMatch[3] || '';
          if (['index', 'unique', 'primary', 'foreign'].includes(colType)) {
            indexes.push(`${colType}(${colName})`);
            continue;
          }
          columns.push({ name: colName, type: colType });
          if (colType === 'enum') {
            const arrMatch = rest.match(/\[([^\]]+)\]/);
            if (arrMatch) {
              const vals = (arrMatch[1].match(/['"]([^'"]+)['"]/g) || []).map(s => s.slice(1, -1));
              addEnumCandidate(modName, colName, vals, relFile);
            }
          }
        }
        if (/\$table->timestamps\s*\(/.test(body)) {
          columns.push({ name: 'created_at', type: 'timestamp' }, { name: 'updated_at', type: 'timestamp' });
        }
        for (const idxMatch of body.matchAll(/\$table->(index|unique)\(\s*\[([^\]]+)\]/g)) {
          const cols = (idxMatch[2].match(/['"]([^'"]+)['"]/g) || []).map(s => s.slice(1, -1));
          if (cols.length > 0) indexes.push(`${idxMatch[1]}(${cols.join(', ')})`);
        }

        discoveredTables.push({
          name: tableName,
          module: modName,
          columns,
          indexes,
          migration_file: relFile
        });
      }
      continue;
    }

    // 1B. PHP FormRequests / Validators
    if (ext === '.php' && (/Requests\//i.test(relFile) || /extends\s+FormRequest\b/.test(code))) {
      const classMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
      const reqName = classMatch ? classMatch[1] : path.basename(absFile, '.php');
      const modName = inferDomainModule(relFile, reqName);
      const rules = {};

      for (const rm of code.matchAll(/['"]([a-zA-Z0-9_.*]+)['"]\s*=>\s*(\[[^\]]+\]|['"][^'"]+['"])/g)) {
        const field = rm[1];
        const rawRule = rm[2].trim();
        rules[field] = rawRule;

        const inPipe = rawRule.match(/\bin:([a-zA-Z0-9_,-]+)/);
        if (inPipe) {
          addEnumCandidate(modName, field, inPipe[1].split(','), relFile);
        }
        const maxFileMatch = rawRule.match(/\bmax:(\d{3,})\b/);
        if (maxFileMatch && /file|image|attachment|document|avatar|pdf/i.test(field)) {
          addSeedCandidate(modName, 'upload_limit', `MAX-${field}-KB`, maxFileMatch[1], 'kilobytes', relFile);
        }
      }
      for (const ruleIn of code.matchAll(/['"]([a-zA-Z0-9_]+)['"][^\n]*Rule::in\(\s*\[([^\]]+)\]/g)) {
        const vals = (ruleIn[2].match(/['"]([^'"]+)['"]/g) || []).map(s => s.slice(1, -1));
        addEnumCandidate(modName, ruleIn[1], vals, relFile);
      }

      discoveredValidators.push({
        name: reqName,
        module: modName,
        rules,
        file_path: relFile
      });
      scanNumericAndEnumPatterns(code, relFile, modName);
      continue;
    }

    // 1C. PHP Controllers
    if (ext === '.php' && (/Controllers\//i.test(relFile) || /class\s+[A-Za-z0-9_]+Controller\b/.test(code))) {
      const classMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
      const ctrlName = classMatch ? classMatch[1] : path.basename(absFile, '.php');
      const modName = inferDomainModule(relFile, ctrlName);
      const actions = [];

      for (const fnMatch of code.matchAll(/public\s+function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g)) {
        const methodName = fnMatch[1];
        if (methodName === '__construct') continue;
        const params = fnMatch[2] || '';
        let validator = null;
        const reqParam = params.match(/\b([A-Za-z0-9_]*Request)\s+\$/);
        if (reqParam && reqParam[1] !== 'Request') {
          validator = reqParam[1];
          controllerMethodValidators.set(`${ctrlName}@${methodName}`, validator);
        }
        actions.push({ action: methodName, validator });
      }

      discoveredControllers.push({
        name: ctrlName,
        module: modName,
        actions,
        file_path: relFile
      });
      scanNumericAndEnumPatterns(code, relFile, modName);
      continue;
    }

    // 1D. PHP Models
    if (ext === '.php' && (/Models\//i.test(relFile) || /extends\s+(?:Model|Authenticatable| Pivot)\b/.test(code))) {
      const classMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
      const modelName = classMatch ? classMatch[1] : path.basename(absFile, '.php');
      const modName = inferDomainModule(relFile, modelName);
      const tableMatch = code.match(/protected\s+\$table\s*=\s*['"]([^'"]+)['"]/);
      const tableName = tableMatch ? tableMatch[1].trim() : pluralizeWord(toSnakeCase(modelName));

      const fillableMatch = code.match(/protected\s+\$fillable\s*=\s*\[([\s\S]*?)\]/);
      const fillable = fillableMatch
        ? (fillableMatch[1].match(/['"]([^'"]+)['"]/g) || []).map(s => s.slice(1, -1))
        : [];

      const castsMatch = code.match(/protected\s+\$casts\s*=\s*\[([\s\S]*?)\]/);
      const casts = castsMatch
        ? (castsMatch[1].match(/['"]([^'"]+)['"]\s*=>/g) || []).map(s => s.replace(/['"\s=>]/g, ''))
        : [];

      discoveredModels.push({
        name: modelName,
        module: modName,
        table: tableName,
        fillable,
        casts,
        file_path: relFile
      });
      scanNumericAndEnumPatterns(code, relFile, modName);
      continue;
    }

    // 1E. .NET Entities, Validators & Endpoints
    if (ext === '.cs') {
      if (/Validator\.cs$/i.test(relFile) || /:\s*AbstractValidator</.test(code)) {
        for (const vm of code.matchAll(/class\s+([A-Za-z0-9_]+)\s*:\s*AbstractValidator<([A-Za-z0-9_]+)>/g)) {
          const valName = vm[1];
          const targetType = vm[2];
          const modName = inferDomainModule(relFile, targetType);
          const rules = {};
          for (const rm of code.matchAll(/RuleFor\(\s*[a-zA-Z0-9_]+\s*=>\s*[a-zA-Z0-9_]+\.([A-Za-z0-9_]+)\s*\)([^;]+)/g)) {
            rules[rm[1]] = rm[2].trim();
          }
          discoveredValidators.push({ name: valName, target: targetType, module: modName, rules, file_path: relFile });
          for (const r of discoveredRoutes) {
            if (!r.validator && (r.action === targetType || r.validator === targetType)) {
              r.validator = valName;
            }
          }
        }
      } else if (!isDotNet) {
        if (/Domain\/Entities\//i.test(relFile)) {
          const cm = code.match(/public\s+(?:sealed\s+)?class\s+([A-Za-z0-9_]+)/);
          if (cm) {
            const modelName = cm[1];
            const modName = inferDomainModule(relFile, modelName);
            const props = Array.from(code.matchAll(/public\s+[A-Za-z0-9_<>?]+\s+([A-Za-z0-9_]+)\s*\{\s*get;/g)).map(p => p[1]);
            discoveredModels.push({
              name: modelName,
              module: modName,
              table: pluralizeWord(toSnakeCase(modelName)),
              fillable: props,
              casts: [],
              file_path: relFile
            });
          }
        } else if (/Endpoints\//i.test(relFile)) {
          const ctrlName = path.basename(absFile, '.cs');
          const modName = inferDomainModule(relFile, ctrlName);
          discoveredControllers.push({ name: ctrlName, module: modName, actions: [], file_path: relFile });
          for (const rm of code.matchAll(/\.Map(Get|Post|Put|Patch|Delete)\(\s*["']([^"']+)["']/g)) {
            discoveredRoutes.push({
              method: rm[1].toUpperCase(),
              path: rm[2],
              controller: ctrlName,
              action: rm[1].toLowerCase(),
              validator: null,
              middleware: code.includes('RequireAuthorization') ? ['RequireAuthorization'] : [],
              module: modName,
              source_file: relFile
            });
          }
        }
      }
      scanNumericAndEnumPatterns(code, relFile, inferDomainModule(relFile));
      continue;
    }

    // 1F. Prisma Schema
    if (ext === '.prisma') {
      for (const mm of code.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g)) {
        const modelName = mm[1];
        const modName = inferDomainModule(relFile, modelName);
        const cols = mm[2]
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('//') && !l.startsWith('@@'))
          .map(l => {
            const p = l.split(/\s+/);
            return { name: p[0], type: p[1] || 'string' };
          });
        const tblName = pluralizeWord(toSnakeCase(modelName));
        discoveredModels.push({ name: modelName, module: modName, table: tblName, fillable: cols.map(c => c.name), casts: [], file_path: relFile });
        discoveredTables.push({ name: tblName, module: modName, columns: cols, indexes: [], migration_file: relFile });
      }
      continue;
    }

    // 1G. Frontend Screens / Components (.vue, .tsx, .jsx, .blade.php, .component.html)
    const isBlade = relFile.endsWith('.blade.php');
    if (['.vue', '.tsx', '.jsx'].includes(ext) || isBlade || relFile.endsWith('.component.html')) {
      const screenName = path.basename(absFile).replace(/\.(?:blade\.php|component\.html|vue|tsx|jsx)$/i, '');
      const modName = inferDomainModule(relFile, screenName);
      const isPage = /(?:pages|views|screens)\//i.test(relFile) || /(?:Page|View|Screen|Index|Checkout|Detail)$/i.test(screenName);
      const testids = Array.from(new Set(Array.from(code.matchAll(/data-testid\s*=\s*["'`]([^"'`]+)["'`]/g)).map(m => m[1].trim())));
      discoveredScreens.push({
        name: screenName,
        kind: isPage ? 'PAGE' : 'COMPONENT',
        module: modName,
        testids,
        file_path: relFile
      });
      scanNumericAndEnumPatterns(code, relFile, modName);
      continue;
    }

    // 1H. PHP Route Files & General TS/JS Backend Files
    if (ext === '.php' && /(?:^|\/)(?:routes|Routes)\//i.test(relFile)) {
      const isApiRouteFile = /api\.php$/i.test(relFile);
      const basePrefix = isApiRouteFile ? '/api' : '';
      const middlewareList = [];
      for (const mw of code.matchAll(/middleware\(\s*(?:\[([^\]]+)\]|['"]([^'"]+)['"])\s*\)/g)) {
        const raw = mw[1] || mw[2] || '';
        raw.split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean).forEach(x => {
          if (!middlewareList.includes(x)) middlewareList.push(x);
        });
      }

      // Route::get('/v1/orders', [OrderController::class, 'index'])
      for (const rm of code.matchAll(/Route::(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]\s*,\s*\[\s*([A-Za-z0-9_\\]+)::class\s*,\s*['"]([A-Za-z0-9_]+)['"]\s*\]/gi)) {
        const method = rm[1].toUpperCase();
        const rawUri = rm[2].startsWith('/') ? rm[2] : `/${rm[2]}`;
        const fullUri = basePrefix && !rawUri.startsWith('/api/') ? `${basePrefix}${rawUri}` : rawUri;
        const ctrlShort = rm[3].split('\\').pop();
        const action = rm[4];
        const modName = inferDomainModule(relFile, ctrlShort);
        discoveredRoutes.push({
          method,
          path: fullUri,
          controller: ctrlShort,
          action,
          validator: controllerMethodValidators.get(`${ctrlShort}@${action}`) || null,
          middleware: middlewareList,
          module: modName,
          source_file: relFile
        });
      }

      // Route::post('/orders', 'OrderController@store')
      for (const rm of code.matchAll(/Route::(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]\s*,\s*['"]([A-Za-z0-9_\\]+)@([A-Za-z0-9_]+)['"]/gi)) {
        const method = rm[1].toUpperCase();
        const rawUri = rm[2].startsWith('/') ? rm[2] : `/${rm[2]}`;
        const fullUri = basePrefix && !rawUri.startsWith('/api/') ? `${basePrefix}${rawUri}` : rawUri;
        const ctrlShort = rm[3].split('\\').pop();
        const action = rm[4];
        const modName = inferDomainModule(relFile, ctrlShort);
        discoveredRoutes.push({
          method,
          path: fullUri,
          controller: ctrlShort,
          action,
          validator: controllerMethodValidators.get(`${ctrlShort}@${action}`) || null,
          middleware: middlewareList,
          module: modName,
          source_file: relFile
        });
      }

      // Route::apiResource('orders', OrderController::class)
      for (const rm of code.matchAll(/Route::apiResource\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_\\]+)::class/gi)) {
        const resUri = rm[1].replace(/^\/+/, '');
        const baseUri = `${basePrefix || '/api'}/${resUri}`;
        const ctrlShort = rm[2].split('\\').pop();
        const modName = inferDomainModule(relFile, ctrlShort);
        for (const [m, suffix, act] of [
          ['GET', '', 'index'],
          ['POST', '', 'store'],
          ['GET', '/{id}', 'show'],
          ['PUT', '/{id}', 'update'],
          ['DELETE', '/{id}', 'destroy']
        ]) {
          discoveredRoutes.push({
            method: m,
            path: `${baseUri}${suffix}`,
            controller: ctrlShort,
            action: act,
            validator: controllerMethodValidators.get(`${ctrlShort}@${act}`) || null,
            middleware: middlewareList,
            module: modName,
            source_file: relFile
          });
        }
      }
      continue;
    }

    // General PHP / TS / JS files (configs, services, enums, etc.)
    scanNumericAndEnumPatterns(code, relFile, inferDomainModule(relFile));
  }

  // Merge OpenAPI routes if present and not already discovered (modular specs take precedence over root unified file)
  const projSlug = String(stackConfig?.name || path.basename(cwd)).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const openApiCandidates = [];
  if (fs.existsSync(modulesDocsDir)) {
    for (const f of fs.readdirSync(modulesDocsDir).filter(x =>
      x.endsWith('.json') &&
      x !== 'modules_config.json' &&
      x !== `${projSlug}.json` &&
      !x.endsWith('_master.json') &&
      x !== 'unified.json'
    )) {
      openApiCandidates.push(path.join(modulesDocsDir, f));
    }
  }
  if (openApiCandidates.length === 0 && fs.existsSync(rootOpenApi)) {
    openApiCandidates.push(rootOpenApi);
  }
  for (const oaFile of openApiCandidates) {
    if (!fs.existsSync(oaFile)) continue;
    try {
      const spec = JSON.parse(fs.readFileSync(oaFile, 'utf8'));
      if (spec && spec.paths) {
        const relOa = path.relative(cwd, oaFile).replace(/\\/g, '/');
        for (const [rPath, methodsObj] of Object.entries(spec.paths)) {
          for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
            if (!methodsObj[method]) continue;
            const upperM = method.toUpperCase();
            if (!discoveredRoutes.some(r => r.method === upperM && r.path === rPath)) {
              const seg = rPath.split('/').filter(s => s && s !== 'api' && !/^v\d+$/i.test(s) && !s.startsWith('{'))[0] || 'Core';
              discoveredRoutes.push({
                method: upperM,
                path: rPath,
                controller: null,
                action: methodsObj[method].operationId || method,
                validator: null,
                middleware: ['Bearer'],
                module: inferDomainModule(relOa, seg),
                source_file: relOa
              });
            }
          }
        }
      }
    } catch {}
  }

  // Backfill validator links onto routes in case route file was scanned before controller
  for (const r of discoveredRoutes) {
    if (!r.validator && r.controller && r.action) {
      r.validator = controllerMethodValidators.get(`${r.controller}@${r.action}`) || null;
    }
  }

  // Group into Module Clusters & Pre-Stage Gate B (ENG-01..ENG-10) Hints
  const clusterNames = new Set();
  discoveredModels.forEach(x => clusterNames.add(x.module));
  discoveredTables.forEach(x => clusterNames.add(x.module));
  discoveredControllers.forEach(x => clusterNames.add(x.module));
  discoveredRoutes.forEach(x => clusterNames.add(x.module));
  discoveredScreens.forEach(x => clusterNames.add(x.module));

  const unfilteredTotals = {
    modules_count: clusterNames.size,
    models_count: discoveredModels.length,
    tables_count: discoveredTables.length,
    routes_count: discoveredRoutes.length,
    controllers_count: discoveredControllers.length,
    validators_count: discoveredValidators.length,
    screens_count: discoveredScreens.length
  };

  function matchesFeatureFilter(modName, itemsText = '') {
    if (featureFilters.length === 0) return true;
    const hay = `${modName} ${itemsText}`.toLowerCase();
    return featureFilters.some(tok => hay.includes(tok));
  }

  const moduleClusters = [];
  const gateBHintsByModule = {};

  for (const modName of Array.from(clusterNames).sort()) {
    const mModels = discoveredModels.filter(x => x.module === modName);
    const mTables = discoveredTables.filter(x => x.module === modName);
    const mCtrls = discoveredControllers.filter(x => x.module === modName);
    const mVals = discoveredValidators.filter(x => x.module === modName);
    const mRoutes = discoveredRoutes.filter(x => x.module === modName);
    const mScreens = discoveredScreens.filter(x => x.module === modName);
    const mEnums = candidateEnums.filter(x => x.module === modName);
    const mSeeds = candidateSeeds.filter(x => x.module === modName);
    const mTestIds = Array.from(new Set(mScreens.flatMap(s => s.testids)));

    const matchCorpus = [
      modName,
      ...mModels.map(x => `${x.name} ${x.table}`),
      ...mRoutes.map(x => x.path),
      ...mScreens.map(x => x.name)
    ].join(' ');

    if (!matchesFeatureFilter(modName, matchCorpus)) continue;

    const hasMutation = mRoutes.some(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method)) ||
      mCtrls.some(c => c.actions.some(a => /^(?:store|create|update|destroy|delete|submit|approve|cancel)/i.test(a.action)));
    const archetype = hasMutation ? 'MUTATION_WORKFLOW' : 'READ_VIEW';

    const allCols = mTables.flatMap(t => t.columns.map(c => c.name));
    const piiCols = Array.from(new Set(allCols.filter(c => /email|phone|mobile|national_id|iqama|passport|iban|card|ssn|birth|address/i.test(c))));
    const fkOrFilterCols = Array.from(new Set(allCols.filter(c => c === 'tenant_id' || c.endsWith('_id') || c === 'status'))).slice(0, 3);
    const esrCols = fkOrFilterCols.length > 0 ? [...fkOrFilterCols, 'created_at'] : ['tenant_id', 'status', 'created_at'];

    const modelSummary = mModels.length > 0
      ? mModels.map(m => `${m.name} (${m.file_path} -> ${m.table})`).join('; ')
      : (mTables.length > 0 ? mTables.map(t => `Table ${t.name} (${t.migration_file})`).join('; ') : `Bind ${modName} domain entity`);

    const routeSummary = mRoutes.length > 0
      ? mRoutes.slice(0, 4).map(r => `${r.method} ${r.path}${r.controller ? ` -> ${r.controller}@${r.action}` : ''}${r.validator ? ` [${r.validator}]` : ''}`).join('; ')
      : (mCtrls.length > 0 ? mCtrls.map(c => `${c.name} (${c.file_path})`).join('; ') : `REST JSON envelope endpoints for ${modName}`);

    const seedEnumSummary = (mEnums.length > 0 || mSeeds.length > 0)
      ? [...mEnums.map(e => e.enum_id), ...mSeeds.map(s => `${s.seed_id}=${s.value}`)].join(', ')
      : `Catalog-aligned SEED-* / ENUM-* constants for ${modName}`;

    const slugMod = modName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'module';
    const screenTestIdSummary = mScreens.length > 0
      ? `${mScreens.map(s => s.file_path).join(', ')} | data-testid: ${mTestIds.length > 0 ? mTestIds.slice(0, 5).join(', ') : `data-testid="${slugMod}-container", data-testid="${slugMod}-state-loading"`}`
      : `Headless API / Portal UI (data-testid="${slugMod}-container", data-testid="${slugMod}-state-loading", data-testid="${slugMod}-state-empty", data-testid="${slugMod}-state-populated", data-testid="${slugMod}-state-error")`;

    const modUpper = modName.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'CORE';
    const hints = {
      'ENG-01': {
        title: 'Model/Table Binding',
        binding: modelSummary,
        suggested_status: 'PASS'
      },
      'ENG-02': {
        title: 'API Endpoint & Envelope Contract',
        binding: `${routeSummary} (Standard { success, data: { id, code, status } } envelope)`,
        suggested_status: 'PASS'
      },
      'ENG-03': {
        title: 'SEED-* & ENUM-* Codebase Mapping',
        binding: seedEnumSummary,
        suggested_status: 'PASS'
      },
      'ENG-04': {
        title: 'Visual Screen §2 & Lifecycle §3 data-testid Plan',
        binding: screenTestIdSummary,
        suggested_status: 'PASS'
      },
      'ENG-05': {
        title: 'ESR Index & N+1 Prevention',
        binding: `Composite ESR index (${esrCols.join(', ')}) + eager-loaded batch relations`,
        suggested_status: 'PASS'
      },
      'ENG-06': {
        title: 'Tenant/IDOR & RBAC Guard',
        binding: `Authenticated tenant-scoped queries + explicit validator (${mVals.map(v => v.name).join(', ') || (isDotNet ? 'FluentValidation / AuthorizationBehaviour' : '$fillable whitelist')})`,
        suggested_status: 'PASS'
      },
      'ENG-07': {
        title: 'IPDPL/PII Masking',
        binding: piiCols.length > 0
          ? `Tier 1/2 PII masking & log scrubbing on [${piiCols.join(', ')}]`
          : 'Zero Tier-1 PII columns detected; standard sanitized structured logging active',
        suggested_status: 'PASS'
      },
      'ENG-08': {
        title: 'Archetype Concurrency/Idempotency Strategy',
        binding: archetype === 'MUTATION_WORKFLOW'
          ? 'Archetype 5B MUTATION_WORKFLOW: X-Idempotency-Key UUIDv4 atomic lock + DB transaction'
          : 'Archetype 5A READ_VIEW: bounded cursor/offset pagination + read-only projection',
        suggested_status: 'PASS'
      },
      'ENG-09': {
        title: 'Automated Test File Binding',
        binding: isDotNet ? `tests/Application.FunctionalTests/${modName}/${modName}Tests.cs` : `tests/Feature/${modName}Test.php`,
        suggested_status: 'PASS'
      },
      'ENG-10': {
        title: 'Mobile/QA Handoff Impact',
        binding: mobileEnabled
          ? `02-FLUTTER ENGINE (MB-01..15) + docs/handoff/${modUpper}_INTEGRATION_GUIDE.md + Postman v2.1`
          : `QA & API Contract Handoff Pack (docs/handoff/CYCLE_SPRINT_HANDOFF.md + OpenAPI 3.0 + Postman v2.1)`,
        suggested_status: 'PASS'
      }
    };

    gateBHintsByModule[modName] = hints;
    moduleClusters.push({
      name: modName,
      archetype,
      models: mModels,
      tables: mTables,
      controllers: mCtrls,
      validators: mVals,
      routes: mRoutes,
      screens: mScreens,
      testids: mTestIds,
      candidate_enums: mEnums,
      candidate_seeds: mSeeds,
      gate_b_hints: hints
    });
  }

  const activeModuleSet = new Set(moduleClusters.map(c => c.name));
  const filteredModels = featureFilters.length > 0 ? discoveredModels.filter(x => activeModuleSet.has(x.module)) : discoveredModels;
  const filteredTables = featureFilters.length > 0 ? discoveredTables.filter(x => activeModuleSet.has(x.module)) : discoveredTables;
  const filteredControllers = featureFilters.length > 0 ? discoveredControllers.filter(x => activeModuleSet.has(x.module)) : discoveredControllers;
  const filteredValidators = featureFilters.length > 0 ? discoveredValidators.filter(x => activeModuleSet.has(x.module)) : discoveredValidators;
  const filteredRoutes = featureFilters.length > 0 ? discoveredRoutes.filter(x => activeModuleSet.has(x.module)) : discoveredRoutes;
  const filteredScreens = featureFilters.length > 0 ? discoveredScreens.filter(x => activeModuleSet.has(x.module)) : discoveredScreens;
  const filteredEnums = featureFilters.length > 0 ? candidateEnums.filter(x => activeModuleSet.has(x.module)) : candidateEnums;
  const filteredSeeds = featureFilters.length > 0 ? candidateSeeds.filter(x => activeModuleSet.has(x.module)) : candidateSeeds;
  const allFilteredTestIds = Array.from(new Set(filteredScreens.flatMap(s => s.testids)));

  let targetIntakeDir = customIntakeDir || path.join(cwd, 'docs', 'business-context', 'intake');
  let bundleFileName = 'REVERSE_INTAKE_BUNDLE.json';
  if (targetIntakeDir.endsWith('.json')) {
    bundleFileName = path.basename(targetIntakeDir);
    targetIntakeDir = path.dirname(targetIntakeDir);
  }
  if (!fs.existsSync(targetIntakeDir)) fs.mkdirSync(targetIntakeDir, { recursive: true });

  const bundlePath = path.join(targetIntakeDir, bundleFileName);
  const reportPath = path.join(targetIntakeDir, 'REVERSE_INTAKE_REPORT.md');
  const relBundlePath = path.relative(cwd, bundlePath).replace(/\\/g, '/');

  const scopeMode = intakeMode === 'brownfield-cr' ? 'PARTIAL_JIT_ANCHOR' : 'FULL_PROJECT';
  const generatedAt = new Date().toISOString();

  const bundlePayload = {
    schema_version: 'ba-ai-sdlc-reverse-intake/v2.1.0',
    engine_version: pkgVersion,
    generated_at: generatedAt,
    intake_mode: intakeMode,
    scope_mode: scopeMode,
    feature_filter: featureFilters,
    project_name: path.basename(cwd),
    ba_cli_handoff_command: `node bin/ba-hub.js intake --mode=${intakeMode} --bundle=${relBundlePath}`,
    summary: {
      modules_count: moduleClusters.length,
      models_count: filteredModels.length,
      tables_count: filteredTables.length,
      routes_count: filteredRoutes.length,
      controllers_count: filteredControllers.length,
      validators_count: filteredValidators.length,
      screens_count: filteredScreens.length,
      testids_count: allFilteredTestIds.length,
      candidate_enums_count: filteredEnums.length,
      candidate_seeds_count: filteredSeeds.length,
      gate_b_clusters_count: Object.keys(gateBHintsByModule).length
    },
    unfiltered_codebase_totals: unfilteredTotals,
    modules: moduleClusters,
    models: filteredModels,
    tables: filteredTables,
    routes: filteredRoutes,
    controllers: filteredControllers,
    validators: filteredValidators,
    screens: filteredScreens,
    candidate_enums: filteredEnums,
    candidate_seeds: filteredSeeds,
    gate_b_hints: gateBHintsByModule
  };

  fs.writeFileSync(bundlePath, JSON.stringify(bundlePayload, null, 2), 'utf8');

  const reportMd = `# Prototype & Brownfield Reverse-Intake Discovery Report

> **Schema:** \`ba-ai-sdlc-reverse-intake/v2.1.0\` | **Engine:** \`reverse-architect.js v${pkgVersion}\`  
> **Generated At:** \`${generatedAt}\`  
> **Intake Mode:** \`${intakeMode}\` | **Recommended Scope Mode:** \`${scopeMode}\`  
> **Feature Filter:** \`${featureFilters.length > 0 ? featureFilters.join(', ') : 'ALL (Unfiltered)'}\`  
> **BA Hub Handoff Command:** \`${bundlePayload.ba_cli_handoff_command}\`

---

## 1. Executive Codebase Discovery Summary

| Dimension | Anchored / Exported Count | Total Repo Count |
| :--- | :-: | :-: |
| **Domain Modules / Clusters** | \`${bundlePayload.summary.modules_count}\` | \`${unfilteredTotals.modules_count}\` |
| **Backend Models / Entities** | \`${bundlePayload.summary.models_count}\` | \`${unfilteredTotals.models_count}\` |
| **Database Tables & Migrations** | \`${bundlePayload.summary.tables_count}\` | \`${unfilteredTotals.tables_count}\` |
| **API Routes & Endpoints** | \`${bundlePayload.summary.routes_count}\` | \`${unfilteredTotals.routes_count}\` |
| **Controllers & Endpoint Groups** | \`${bundlePayload.summary.controllers_count}\` | \`${unfilteredTotals.controllers_count}\` |
| **FormRequests / Validators** | \`${bundlePayload.summary.validators_count}\` | \`${unfilteredTotals.validators_count}\` |
| **Frontend Screens / Components** | \`${bundlePayload.summary.screens_count}\` | \`${unfilteredTotals.screens_count}\` |
| **Existing \`data-testid\` Locators** | \`${bundlePayload.summary.testids_count}\` | - |
| **Candidate \`ENUM-*\` Constants** | \`${bundlePayload.summary.candidate_enums_count}\` | - |
| **Candidate \`SEED-*\` Defaults** | \`${bundlePayload.summary.candidate_seeds_count}\` | - |

---

## 2. Discovered Models & Database Tables

| Module | Model / Entity | Table Name | Columns / Fillable | Source File |
| :--- | :--- | :--- | :--- | :--- |
${filteredModels.length > 0
  ? filteredModels.map(m => `| \`${m.module}\` | \`${m.name}\` | \`${m.table}\` | ${m.fillable.slice(0, 8).join(', ') || '-'} | \`${m.file_path}\` |`).join('\n')
  : '| _(None detected)_ | - | - | - | - |'}

---

## 3. Discovered API Routes & Validators

| Module | Method | Route Path | Controller Action | Validator / Request | Source |
| :--- | :-: | :--- | :--- | :--- | :--- |
${filteredRoutes.length > 0
  ? filteredRoutes.map(r => `| \`${r.module}\` | \`${r.method}\` | \`${r.path}\` | \`${r.controller ? `${r.controller}@${r.action}` : r.action}\` | \`${r.validator || '-'}\` | \`${r.source_file}\` |`).join('\n')
  : '| _(None detected)_ | - | - | - | - | - |'}

---

## 4. Discovered Frontend Screens & \`data-testid\` Attributes

| Module | Screen / Component | Kind | Discovered \`data-testid\` Selectors | File Path |
| :--- | :--- | :-: | :--- | :--- |
${filteredScreens.length > 0
  ? filteredScreens.map(s => `| \`${s.module}\` | \`${s.name}\` | \`${s.kind}\` | ${s.testids.map(t => `\`${t}\``).join(', ') || '_(None yet)_'} | \`${s.file_path}\` |`).join('\n')
  : '| _(None detected)_ | - | - | - | - |'}

---

## 5. Candidate \`ENUM-*\` & \`SEED-*\` Catalog Extractions

### 5.1 Candidate \`ENUM-*\` Definitions
| Candidate Enum ID | Module | Field / Enum | Discovered Values | Source File |
| :--- | :--- | :--- | :--- | :--- |
${filteredEnums.length > 0
  ? filteredEnums.map(e => `| \`${e.enum_id}\` | \`${e.module}\` | \`${e.name}\` | ${e.values.map(v => `\`${v}\``).join(', ')} | \`${e.source_file}\` |`).join('\n')
  : '| _(None detected)_ | - | - | - | - |'}

### 5.2 Candidate \`SEED-*\` Numeric Thresholds & Timers
| Candidate Seed ID | Category | Module | Key | Value | Unit | Source File |
| :--- | :--- | :--- | :--- | :-: | :--- | :--- |
${filteredSeeds.length > 0
  ? filteredSeeds.map(s => `| \`${s.seed_id}\` | \`${s.category}\` | \`${s.module}\` | \`${s.name}\` | \`${s.value}\` | \`${s.unit}\` | \`${s.source_file}\` |`).join('\n')
  : '| _(None detected)_ | - | - | - | - | - | - |'}

---

## 6. Pre-Staged Gate B (\`ENG-01..ENG-10\`) Binding Hints

${moduleClusters.length > 0
  ? moduleClusters.map(c => `### Module Cluster: \`${c.name}\` (\`${c.archetype}\`)
| Check ID | Engineering Dimension | Candidate Codebase Binding |
| :--- | :--- | :--- |
${Object.entries(c.gate_b_hints).map(([k, v]) => `| \`${k}\` | ${v.title} | \`${v.binding}\` |`).join('\n')}
`).join('\n')
  : '_(No module clusters discovered in current scope.)_'}
`;

  fs.writeFileSync(reportPath, reportMd, 'utf8');

  if (isJson) {
    console.log(JSON.stringify(bundlePayload, null, 2));
  } else {
    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputFile, markdownReport, 'utf8');

    const elapsed = Date.now() - startTime;
    console.log('');
    console.log('================================================================================');
    console.log(`  🔄 REVERSE-ARCHITECT BA_AI_SDLC v2.1.0 INTAKE BRIDGE (v${pkgVersion})`);
    console.log('================================================================================');
    console.log(`Intake / Scope Mode: ${intakeMode} -> ${scopeMode}`);
    console.log(`Discovered Assets  : ${bundlePayload.summary.modules_count} modules | ${bundlePayload.summary.models_count} models | ${bundlePayload.summary.tables_count} tables | ${bundlePayload.summary.routes_count} routes | ${bundlePayload.summary.screens_count} screens`);
    console.log(`Catalog Candidates : ${bundlePayload.summary.candidate_enums_count} ENUM-* | ${bundlePayload.summary.candidate_seeds_count} SEED-* | ${bundlePayload.summary.gate_b_clusters_count} Gate B hint clusters`);
    console.log(`Architecture Spec  : ${outputFile}`);
    console.log(`Bundle JSON Output : ${bundlePath}`);
    console.log(`Discovery Report   : ${reportPath}`);
    console.log(`Execution Time     : ${elapsed}ms`);
    console.log('--------------------------------------------------------------------------------');
    console.log(`Next Step (BA Hub) : ${bundlePayload.ba_cli_handoff_command}`);
    console.log('================================================================================\n');
  }
}

if (exportBaIntake) {
  runBaIntakeExport();
} else if (isJson) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    total_models: totalModels,
    total_controllers: totalControllers,
    total_tables: totalTables,
    total_contracts: totalContracts,
    total_endpoints: totalEndpoints,
    modules: sortedModules
  }, null, 2));
} else {
  const outDir = path.dirname(outputFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputFile, markdownReport);

  const elapsed = Date.now() - startTime;
  console.log('');
  console.log('================================================================================');
  console.log(`       INNOVADIGITS REVERSE ARCHITECTURE VISUALIZER (v${pkgVersion})                    `);
  console.log('================================================================================');
  console.log(`Modules Discovered : ${sortedModules.length} domains`);
  console.log(`Models / Tables    : ${totalModels} models / ${totalTables} tables`);
  console.log(`Controllers / APIs : ${totalControllers} controllers / ${totalEndpoints} endpoints`);
  console.log(`Architecture Spec  : ${outputFile}`);
  console.log(`Execution Time     : ${elapsed}ms`);
  console.log('--------------------------------------------------------------------------------');
  console.log('| Domain Module        | Models | Controllers | Endpoints | Governance Health |');
  console.log('|:---------------------|:-------|:------------|:----------|:------------------|');

  for (const m of sortedModules.slice(0, 10)) {
    const modPad = m.name.padEnd(20, ' ');
    const mPad = String(m.models.length).padStart(6, ' ');
    const cPad = String(m.controllers.length).padStart(11, ' ');
    const ePad = String(m.openApiEndpoints).padStart(9, ' ');
    const hBadge = m.models.length > 0 && m.controllers.length > 0 ? '🟢 GOVERNED    ' : '🟡 IN_PROGRESS ';
    console.log(`| ${modPad} | ${mPad} | ${cPad} | ${ePad} | ${hBadge} |`);
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(`>>> TOPOLOGY & ER DIAGRAMS GENERATED SUCCESSFULLY`);
  console.log('================================================================================\n');
}
