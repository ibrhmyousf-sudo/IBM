#!/usr/bin/env node

/**
 * 🔍 OpenAPI Contract Backward-Compatibility & Auth-Stripping Guard (v4.2.2)
 * Enforces SEC-084 & SEC-016 across base vs head OpenAPI JSON contracts:
 *   - COMPAT-01 (HIGH): Removed existing HTTP operation (path + method) without version bump.
 *   - COMPAT-02 (CRITICAL): Stripped `security` requirement from a previously authenticated endpoint.
 *   - COMPAT-03 (MEDIUM): Added new `required` requestBody field or removed a documented 200/201 response property.
 *
 * Zero external dependencies — built-in Node.js modules only.
 */

const fs = require('fs');
const path = require('path');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

function collectOpenApiFiles(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return targetPath.endsWith('.json') ? [targetPath] : [];
  }
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        results.push(full);
      }
    }
  }
  walk(targetPath);
  return results.sort();
}

function resolveSchemaRef(doc, schemaObj, seen = new Set()) {
  if (!schemaObj || typeof schemaObj !== 'object') return {};
  if (schemaObj.$ref && typeof schemaObj.$ref === 'string') {
    if (seen.has(schemaObj.$ref)) return {};
    seen.add(schemaObj.$ref);
    const refPath = schemaObj.$ref.replace(/^#\//, '').split('/');
    let cur = doc;
    for (const seg of refPath) {
      cur = cur && typeof cur === 'object' ? cur[seg] : undefined;
    }
    return cur ? resolveSchemaRef(doc, cur, seen) : {};
  }
  return schemaObj;
}

function extractRequestRequiredFields(doc, op) {
  const reqBody = resolveSchemaRef(doc, op.requestBody);
  const content = reqBody && reqBody.content;
  if (!content || typeof content !== 'object') return new Set();
  const jsonMedia = content['application/json'] || Object.values(content)[0];
  if (!jsonMedia || !jsonMedia.schema) return new Set();
  const schema = resolveSchemaRef(doc, jsonMedia.schema);
  const reqList = Array.isArray(schema.required) ? schema.required : [];
  return new Set(reqList.map(String));
}

function extractResponseProperties(doc, op) {
  const responses = op.responses || {};
  const props = new Set();
  for (const status of ['200', '201']) {
    if (!responses[status]) continue;
    const resObj = resolveSchemaRef(doc, responses[status]);
    const content = resObj && resObj.content;
    if (!content || typeof content !== 'object') continue;
    const jsonMedia = content['application/json'] || Object.values(content)[0];
    if (!jsonMedia || !jsonMedia.schema) continue;
    const schema = resolveSchemaRef(doc, jsonMedia.schema);
    if (schema.properties && typeof schema.properties === 'object') {
      for (const key of Object.keys(schema.properties)) {
        props.add(`${status}:${key}`);
      }
    }
  }
  return props;
}

function hasEffectiveAuth(doc, op) {
  if (Array.isArray(op.security)) {
    return op.security.some((item) => item && typeof item === 'object' && Object.keys(item).length > 0);
  }
  if (Array.isArray(doc.security)) {
    return doc.security.some((item) => item && typeof item === 'object' && Object.keys(item).length > 0);
  }
  return false;
}

function loadOperationsMap(targetPath) {
  const files = collectOpenApiFiles(targetPath);
  const operations = new Map();
  for (const file of files) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!doc || typeof doc !== 'object' || !doc.paths || typeof doc.paths !== 'object') continue;
    for (const [routePath, pathItem] of Object.entries(doc.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      for (const method of HTTP_METHODS) {
        if (!pathItem[method] || typeof pathItem[method] !== 'object') continue;
        const op = pathItem[method];
        const key = `${method.toUpperCase()} ${routePath}`;
        operations.set(key, {
          key,
          method: method.toUpperCase(),
          routePath,
          file,
          authenticated: hasEffectiveAuth(doc, op),
          rawSecurity: op.security,
          requiredRequestFields: extractRequestRequiredFields(doc, op),
          responseProperties: extractResponseProperties(doc, op)
        });
      }
    }
  }
  return operations;
}

function compareOpenApiContracts(basePath, headPath) {
  const baseOps = loadOperationsMap(basePath);
  const headOps = loadOperationsMap(headPath);
  const findings = [];

  for (const [opKey, baseOp] of baseOps.entries()) {
    const headOp = headOps.get(opKey);
    if (!headOp) {
      findings.push({
        rule: 'COMPAT-01',
        severity: 'HIGH',
        control_ids: ['SEC-084'],
        operation: opKey,
        file: baseOp.file,
        message: `Breaking API Change: Existing operation '${opKey}' was removed without introducing a new versioned endpoint prefix.`
      });
      continue;
    }

    if (baseOp.authenticated && !headOp.authenticated) {
      findings.push({
        rule: 'COMPAT-02',
        severity: 'CRITICAL',
        control_ids: ['SEC-016', 'SEC-084'],
        operation: opKey,
        file: headOp.file,
        message: `Authentication Regression: Security requirement stripped from previously authenticated operation '${opKey}'.`
      });
    }

    const addedRequired = [];
    for (const reqField of headOp.requiredRequestFields) {
      if (!baseOp.requiredRequestFields.has(reqField)) {
        addedRequired.push(reqField);
      }
    }
    if (addedRequired.length > 0) {
      findings.push({
        rule: 'COMPAT-03',
        severity: 'MEDIUM',
        control_ids: ['SEC-084'],
        operation: opKey,
        file: headOp.file,
        message: `Breaking Request Contract: Operation '${opKey}' added new required requestBody property(s): ${addedRequired.join(', ')}.`
      });
    }

    const removedResponseProps = [];
    for (const prop of baseOp.responseProperties) {
      if (!headOp.responseProperties.has(prop)) {
        removedResponseProps.push(prop);
      }
    }
    if (removedResponseProps.length > 0) {
      findings.push({
        rule: 'COMPAT-03',
        severity: 'MEDIUM',
        control_ids: ['SEC-084'],
        operation: opKey,
        file: headOp.file,
        message: `Breaking Response Contract: Operation '${opKey}' removed documented 200/201 response property(s): ${removedResponseProps.join(', ')}.`
      });
    }
  }

  const counts = {
    critical: findings.filter((f) => f.severity === 'CRITICAL').length,
    high: findings.filter((f) => f.severity === 'HIGH').length,
    medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    total: findings.length
  };

  return {
    status: counts.critical > 0 || counts.high > 0 ? 'FAIL' : (counts.medium > 0 ? 'WARN' : 'PASS'),
    base_operations: baseOps.size,
    head_operations: headOps.size,
    counts,
    findings
  };
}

function parseArgs(argv) {
  const args = {
    base: 'docs/modules',
    head: 'docs/modules',
    json: false,
    strict: false
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--base=')) args.base = arg.slice('--base='.length);
    else if (arg.startsWith('--head=')) args.head = arg.slice('--head='.length);
    else if (arg === '--json') args.json = true;
    else if (arg === '--strict') args.strict = true;
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  const report = compareOpenApiContracts(path.resolve(args.base), path.resolve(args.head));
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`🔍 OpenAPI Backward-Compatibility Guard (SEC-084): ${report.status}`);
    console.log(`   Base Operations: ${report.base_operations} | Head Operations: ${report.head_operations}`);
    console.log(`   Findings: Critical=${report.counts.critical}, High=${report.counts.high}, Medium=${report.counts.medium}`);
    for (const f of report.findings) {
      console.log(`   - [${f.rule}] (${f.severity}) ${f.operation}: ${f.message}`);
    }
  }
  if (args.strict && (report.counts.critical > 0 || report.counts.high > 0 || report.counts.medium > 0)) {
    process.exit(1);
  }
}

module.exports = {
  compareOpenApiContracts,
  loadOperationsMap
};

