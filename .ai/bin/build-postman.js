#!/usr/bin/env node

/**
 * 🚀 Universal OpenAPI to Postman Collection v2.1 Generator (v4.3.0)
 * Scans docs/modules/*.json (or docs/openapi.json fallback) and generates importable,
 * executable Postman collections with automated QA Gate B request chaining ({{last_created_id}}).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Deterministic collection ids: regenerating must not churn git diffs.
function stableId(seed) {
  const h = crypto.createHash('sha1').update(String(seed)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const startTime = Date.now();

// 1. Resolve Project Root & stack.json Gate
let projectRoot = process.cwd();
if (path.basename(projectRoot) === '.ai') {
  projectRoot = path.resolve(projectRoot, '..');
} else if (!fs.existsSync(path.join(projectRoot, 'docs')) && !fs.existsSync(path.join(projectRoot, '.ai')) && fs.existsSync(path.join(projectRoot, 'stack.json'))) {
  const parentDir = path.resolve(projectRoot, '..');
  if (fs.existsSync(path.join(parentDir, 'docs')) || fs.existsSync(path.join(parentDir, 'app'))) {
    projectRoot = parentDir;
  }
}

const forceRun = process.argv.includes('--force');
const stackCandidates = [
  path.join(projectRoot, '.ai', 'stack.json'),
  path.join(projectRoot, 'stack.json'),
  path.join(process.cwd(), '.ai', 'stack.json'),
  path.join(process.cwd(), 'stack.json'),
  path.join(__dirname, '..', 'stack.json')
];
const stackJsonPath = stackCandidates.find(p => fs.existsSync(p));
let stackConfig = null;
if (stackJsonPath) {
  try {
    stackConfig = JSON.parse(fs.readFileSync(stackJsonPath, 'utf8'));
  } catch (err) {
    console.warn(`⚠️ Warning: Failed to parse ${stackJsonPath}: ${err.message}`);
  }
}

if (!forceRun && stackConfig?.stacks?.api_docs?.postman === false) {
  console.log('⏭️ Postman generation skipped (stacks.api_docs.postman === false in stack.json). Use --force to override.');
  process.exit(0);
}

const isDotNet = stackConfig?.stacks?.backend?.dotnet === true;
const fallbackBaseUrl = isDotNet ? 'http://localhost:5000' : 'http://localhost:8000';
const projSlug = String(stackConfig?.name || 'master').toLowerCase().replace(/[^a-z0-9_-]/g, '_');

const modulesDocsDir = path.join(projectRoot, 'docs', 'modules');
const outputDir = path.join(projectRoot, 'docs', 'postman');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 2. Locate OpenAPI JSON Specs (modular specs take precedence over root docs/openapi.json)
let specFiles = [];
if (fs.existsSync(modulesDocsDir)) {
  const files = fs.readdirSync(modulesDocsDir).sort().filter(f =>
    f.endsWith('.json') &&
    f !== 'modules_config.json' &&
    f !== 'openapi.json' &&
    f !== 'unified.json' &&
    f !== `${projSlug}.json` &&
    !f.endsWith('_master.json')
  );
  specFiles = files.map(f => ({
    name: path.basename(f, '.json'),
    path: path.join(modulesDocsDir, f)
  }));
}

const rootOpenApi = path.join(projectRoot, 'docs', 'openapi.json');
if (specFiles.length === 0 && fs.existsSync(rootOpenApi)) {
  specFiles.push({
    name: 'openapi_master',
    path: rootOpenApi
  });
}

if (specFiles.length === 0) {
  console.log('⚠️ No modular OpenAPI JSON specifications found in docs/modules/ or docs/openapi.json (skipping collection compilation)');
}

// 3. Helper to resolve $ref & generate sample request body from schema
function resolveSchemaRef(schema, doc, depth = 0) {
  if (!schema || depth > 5) return schema;
  if (schema.$ref && typeof schema.$ref === 'string') {
    const refName = schema.$ref.replace(/^#\/components\/schemas\//, '');
    const target = doc?.components?.schemas?.[refName];
    if (target) return resolveSchemaRef(target, doc, depth + 1);
  }
  return schema;
}

function generateSampleBody(rawSchema, doc, depth = 0) {
  if (!rawSchema || depth > 4) return null;
  const schema = resolveSchemaRef(rawSchema, doc, depth);
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;

  if (schema.type === 'object' || schema.properties) {
    const sample = {};
    for (const [key, propRaw] of Object.entries(schema.properties || {})) {
      const prop = resolveSchemaRef(propRaw, doc, depth + 1) || propRaw;
      if (prop.example !== undefined) {
        sample[key] = prop.example;
      } else if (prop.default !== undefined) {
        sample[key] = prop.default;
      } else if (prop.$ref) {
        sample[key] = generateSampleBody(prop, doc, depth + 1) || {};
      } else if (prop.type === 'string') {
        if (prop.enum && prop.enum.length > 0) {
          sample[key] = prop.enum[0];
        } else if (prop.format === 'uuid') {
          sample[key] = '00000000-0000-4000-8000-000000000001';
        } else if (prop.format === 'email' || /email/i.test(key)) {
          sample[key] = 'user@example.local';
        } else if (key.endsWith('_ar') || /Arabic|Ar$/i.test(key)) {
          sample[key] = 'نص تجريبي';
        } else if (key.endsWith('_en') || /English|En$/i.test(key)) {
          sample[key] = 'Sample text';
        } else if (prop.format === 'date') {
          sample[key] = '2026-10-21';
        } else if (prop.format === 'date-time') {
          sample[key] = '2026-10-21T12:00:00Z';
        } else {
          sample[key] = 'sample';
        }
      } else if (prop.type === 'integer' || prop.type === 'number') {
        sample[key] = /(?:_id|Id)$/.test(key) ? 1 : 10;
      } else if (prop.type === 'boolean') {
        sample[key] = true;
      } else if (prop.type === 'array') {
        if (prop.items) {
          const itemSample = generateSampleBody(prop.items, doc, depth + 1);
          sample[key] = itemSample !== null && itemSample !== undefined ? [itemSample] : [];
        } else {
          sample[key] = [];
        }
      } else if (prop.type === 'object') {
        sample[key] = generateSampleBody(prop, doc, depth + 1) || {};
      } else {
        sample[key] = 'sample';
      }
    }
    return sample;
  }

  if (schema.type === 'string') {
    if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
    return schema.enum?.[0] || 'sample';
  }
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'array') return [];
  return null;
}

// 4. Test Script Template for Request Chaining (QA Gate B)
const chainingTestScript = [
  'pm.test("Status code is 200 or 201", function () {',
  '    pm.expect([200, 201]).to.include(pm.response.code);',
  '});',
  '',
  'try {',
  '    var jsonData = pm.response.json();',
  '    var capturedId = (jsonData && jsonData.data && jsonData.data.id) || (jsonData && jsonData.id);',
  '    if (capturedId) {',
  '        pm.collectionVariables.set("last_created_id", capturedId);',
  '        console.log("Captured last_created_id:", capturedId);',
  '    }',
  '} catch (e) {',
  '    console.error("Failed to parse JSON response:", e);',
  '}'
];

const generalTestScript = [
  'pm.test("Successful response (2xx)", function () {',
  '    pm.response.to.be.success;',
  '});'
];

let generatedCount = 0;
let totalRequestsCount = 0;
const collectionsMap = {};
let resolvedCollectionBaseUrl = fallbackBaseUrl;

for (const spec of specFiles) {
  let doc;
  try {
    const raw = fs.readFileSync(spec.path, 'utf8');
    doc = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Skipping invalid JSON ${spec.path}: ${err.message}`);
    continue;
  }

  if (!doc.paths || typeof doc.paths !== 'object') continue;

  const specServerUrl = (Array.isArray(doc.servers) && doc.servers[0] && doc.servers[0].url) ? doc.servers[0].url : fallbackBaseUrl;
  resolvedCollectionBaseUrl = specServerUrl;

  const collectionName = (doc.info && doc.info.title) ? doc.info.title : `${spec.name.toUpperCase()} API`;
  const collectionDesc = (doc.info && doc.info.description) ? doc.info.description : `Postman collection for ${spec.name} generated via build-postman.js`;

  const extraPathVars = new Set();
  const collectionItems = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete'];

  for (const [routePath, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;

      totalRequestsCount++;
      const opSummary = op.summary || `${method.toUpperCase()} ${routePath}`;
      const isMutating = ['post', 'put', 'patch'].includes(method);

      // Replace {id} with {{last_created_id}} and other {param} tokens with {{param}}
      let postmanPath = routePath.replace(/\{([A-Za-z0-9_]+)\}/g, (_, paramName) => {
        if (paramName === 'id') return '{{last_created_id}}';
        extraPathVars.add(paramName);
        return `{{${paramName}}}`;
      });

      // Query params
      const queryParams = [];
      if (Array.isArray(op.parameters)) {
        for (const p of op.parameters) {
          if (p.in === 'query') {
            queryParams.push({
              key: p.name,
              value: p.schema && p.schema.default !== undefined ? String(p.schema.default) : '',
              description: p.description || '',
              disabled: !p.required
            });
          }
        }
      }

      // Headers
      const headers = [
        { key: 'Accept', value: 'application/json', type: 'text' },
        { key: 'Accept-Language', value: '{{locale}}', type: 'text' },
        { key: 'Authorization', value: 'Bearer {{auth_token}}', type: 'text' }
      ];
      if (isMutating) {
        headers.push({ key: 'X-Idempotency-Key', value: '{{$guid}}', type: 'text' });
      }

      // Request Body (JSON or Multipart FormData)
      let bodyObj = undefined;
      if (isMutating && op.requestBody && op.requestBody.content) {
        if (op.requestBody.content['multipart/form-data']) {
          const mpSchema = op.requestBody.content['multipart/form-data'].schema;
          const mpProps = mpSchema?.properties ? Object.entries(mpSchema.properties) : [['file', { format: 'binary' }]];
          bodyObj = {
            mode: 'formdata',
            formdata: mpProps.map(([k, v]) => (
              v?.format === 'binary'
                ? { key: k, type: 'file', src: [] }
                : { key: k, value: 'sample', type: 'text' }
            ))
          };
        } else {
          headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
          const jsonContent = op.requestBody.content['application/json'];
          if (jsonContent && jsonContent.schema) {
            const sample = generateSampleBody(jsonContent.schema, doc);
            bodyObj = {
              mode: 'raw',
              raw: JSON.stringify(sample || {}, null, 2),
              options: {
                raw: { language: 'json' }
              }
            };
          }
        }
      }

      // Clean path segments
      const urlSegments = postmanPath.replace(/^\//, '').split('/').filter(Boolean);

      collectionItems.push({
        name: opSummary,
        event: [
          {
            listen: 'test',
            script: {
              type: 'text/javascript',
              exec: isMutating ? chainingTestScript : generalTestScript
            }
          }
        ],
        request: {
          method: method.toUpperCase(),
          header: headers,
          body: bodyObj,
          url: {
            raw: `{{base_url}}${postmanPath}${queryParams.length ? '?' + queryParams.map(q => `${q.key}=${q.value}`).join('&') : ''}`,
            host: ['{{base_url}}'],
            path: urlSegments,
            query: queryParams.length ? queryParams : undefined
          },
          description: op.description || opSummary
        },
        response: []
      });
    }
  }

  const variables = [
    { key: 'base_url', value: specServerUrl, type: 'string' },
    { key: 'auth_token', value: '', type: 'string' },
    { key: 'locale', value: 'en', type: 'string' },
    { key: 'last_created_id', value: '1', type: 'string' }
  ];
  for (const pv of Array.from(extraPathVars).sort()) {
    variables.push({ key: pv, value: '1', type: 'string' });
  }

  const collection = {
    info: {
      name: collectionName,
      _postman_id: stableId(collectionName),
      description: collectionDesc,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: variables,
    item: collectionItems
  };

  collectionsMap[spec.name] = collection;
  const outFilePath = path.join(outputDir, `${spec.name}.postman_collection.json`);
  fs.writeFileSync(outFilePath, JSON.stringify(collection, null, 2) + '\n');
  generatedCount++;
}

// 5. Generate Consolidated Master & Prefix Group Collections
const groups = [
  {
    filename: `${projSlug}_master.postman_collection.json`,
    title: `${stackConfig?.name || 'Application'} Master API Collection`,
    description: 'Consolidated Postman collection covering all modular endpoints across the application.',
    matchAll: true
  },
  {
    filename: 'portal_group.postman_collection.json',
    title: `${stackConfig?.name || 'Application'} Portal API Group`,
    description: 'Consolidated Postman collection for portal endpoints.',
    prefix: 'portal_'
  },
  {
    filename: 'admin_group.postman_collection.json',
    title: `${stackConfig?.name || 'Application'} Admin API Group`,
    description: 'Consolidated Postman collection for admin & back-office endpoints.',
    prefix: 'admin_'
  }
];

let groupCollectionsCount = 0;
for (const grp of groups) {
  const matchingKeys = grp.matchAll
    ? Object.keys(collectionsMap)
    : Object.keys(collectionsMap).filter(k => k.startsWith(grp.prefix));
  if (matchingKeys.length === 0) continue;

  const extraVars = new Map();
  const groupCollection = {
    info: {
      name: grp.title,
      _postman_id: stableId(grp.title),
      description: grp.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [],
    item: []
  };

  for (const k of matchingKeys) {
    const col = collectionsMap[k];
    if (col && Array.isArray(col.variable)) {
      for (const v of col.variable) {
        if (!extraVars.has(v.key)) extraVars.set(v.key, v);
      }
    }
    if (col && Array.isArray(col.item) && col.item.length > 0) {
      groupCollection.item.push({
        name: col.info?.name || k,
        description: col.info?.description || '',
        item: col.item
      });
    }
  }

  groupCollection.variable = extraVars.size > 0
    ? Array.from(extraVars.values())
    : [
        { key: 'base_url', value: resolvedCollectionBaseUrl, type: 'string' },
        { key: 'auth_token', value: '', type: 'string' },
        { key: 'locale', value: 'en', type: 'string' },
        { key: 'last_created_id', value: '1', type: 'string' }
      ];

  const groupFilePath = path.join(outputDir, grp.filename);
  fs.writeFileSync(groupFilePath, JSON.stringify(groupCollection, null, 2) + '\n');
  groupCollectionsCount++;
}

const elapsed = Date.now() - startTime;
console.log(`✅ Postman Collection Generator completed in ${elapsed}ms`);
console.log(`📦 Collections generated: ${generatedCount} modular collections + ${groupCollectionsCount} consolidated groups (${totalRequestsCount} endpoints mapped)`);
console.log(`📁 Destination: ${outputDir}`);
