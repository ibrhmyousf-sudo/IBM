#!/usr/bin/env node

/**
 * 📦 Universal Unified OpenAPI 3.0 Generator (v3.9.3)
 * Consolidates modular OpenAPI JSON specifications (docs/modules/*.json) into a single canonical
 * master OpenAPI 3.0 specification for Mobile SDK generation, Postman, and QA Automation.
 *
 * Usage:
 *   node bin/build-unified-openapi.js [--module=name] [--output=docs/modules/unified.json]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(prefix, fallback = '') {
  const match = args.find(a => a.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1).trim() : fallback;
}

// 1. Resolve Project Root & stack.json
let projectRoot = process.cwd();
if (path.basename(projectRoot) === '.ai') {
  projectRoot = path.resolve(projectRoot, '..');
}

const stackCandidates = [
  path.join(projectRoot, '.ai', 'stack.json'),
  path.join(projectRoot, 'stack.json'),
  path.join(__dirname, '..', 'stack.json')
];
const stackJsonPath = stackCandidates.find(p => fs.existsSync(p));
let stackConfig = {};
if (stackJsonPath) {
  try {
    stackConfig = JSON.parse(fs.readFileSync(stackJsonPath, 'utf8'));
  } catch (err) {
    console.warn(`⚠️ Warning: Could not parse ${stackJsonPath}: ${err.message}`);
  }
}

const moduleFlag = getArg('--module', '');
const explicitModule = moduleFlag || stackConfig?.name || 'master';
const safeModuleName = explicitModule.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
const customOutput = getArg('--output', '');
const isDotNet = stackConfig?.stacks?.backend?.dotnet === true;

const modulesDir = path.join(projectRoot, 'docs', 'modules');
if (!fs.existsSync(modulesDir)) {
  console.log(`⏭️ Unified OpenAPI skipped (no docs/modules directory found at ${modulesDir}).`);
  process.exit(0);
}

let outputFile;
if (customOutput) {
  outputFile = path.resolve(projectRoot, customOutput);
} else if (moduleFlag) {
  outputFile = path.join(modulesDir, `${safeModuleName}.json`);
} else {
  outputFile = path.join(projectRoot, 'docs', 'openapi.json');
}
const targetFileName = path.basename(outputFile);

const unifiedSpec = {
  openapi: "3.0.0",
  info: {
    title: `${stackConfig?.name || 'Application'} - Unified Master API`,
    version: stackConfig?.version || "1.0.0",
    description: `Authoritative unified OpenAPI 3.0 specification consolidating all modular APIs across ${stackConfig?.name || 'the application'}.`,
    contact: {
      name: "Engineering Architecture & Tech Lead",
      email: "engineering@local"
    }
  },
  servers: [
    {
      url: isDotNet ? "http://localhost:5000" : "http://localhost:8000",
      description: isDotNet ? "Local .NET 10 Minimal API Environment" : "Local Development & Testing Environment"
    }
  ],
  paths: {},
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Standard JWT Bearer token authentication."
      }
    },
    schemas: {}
  },
  tags: []
};

const seenTags = new Set();
let endpointCount = 0;
let fileCount = 0;

const files = fs.readdirSync(modulesDir).filter(f => 
  f.endsWith('.json') && 
  f !== targetFileName && 
  f !== `${safeModuleName}.json` &&
  f !== 'openapi.json' &&
  f !== 'unified.json' &&
  f !== 'modules_config.json' &&
  !f.endsWith('_master.json')
);

files.sort().forEach(file => {
  const filePath = path.join(modulesDir, file);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const spec = JSON.parse(raw);
    fileCount++;

    if (spec.tags && Array.isArray(spec.tags)) {
      spec.tags.forEach(t => {
        if (!seenTags.has(t.name)) {
          seenTags.add(t.name);
          unifiedSpec.tags.push(t);
        }
      });
    }

    if (spec.paths) {
      Object.entries(spec.paths).forEach(([route, methods]) => {
        if (!unifiedSpec.paths[route]) {
          unifiedSpec.paths[route] = {};
        }
        Object.entries(methods).forEach(([method, def]) => {
          unifiedSpec.paths[route][method.toLowerCase()] = def;
          endpointCount++;
        });
      });
    }

    if (spec.components && spec.components.schemas) {
      Object.assign(unifiedSpec.components.schemas, spec.components.schemas);
    }
  } catch (err) {
    console.error(`⚠️ Failed to parse ${file}:`, err.message);
  }
});

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(unifiedSpec, null, 2) + '\n', 'utf8');

console.log(`\n================================================================================`);
console.log(`       UNIVERSAL UNIFIED OPENAPI 3.0 MASTER COMPILER (v3.9.3)                   `);
console.log(`================================================================================`);
console.log(`Files Merged     : ${fileCount} modular specifications`);
console.log(`Endpoints Mapped : ${endpointCount} paths compiled`);
console.log(`Destination Spec : ${outputFile} (${(fs.statSync(outputFile).size / 1024).toFixed(1)} KB)`);
console.log(`--------------------------------------------------------------------------------`);
console.log(`>>> UNIFIED OPENAPI SPEC GENERATION COMPLETE`);
console.log(`================================================================================\n`);

