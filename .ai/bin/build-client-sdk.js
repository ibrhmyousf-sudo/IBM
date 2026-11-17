#!/usr/bin/env node

/**
 * 📦 InnovaDigits Multi-Stack Client SDK Generator CLI (v3.9.3)
 * Scans OpenAPI specs in docs/modules/*.json and generates production-ready,
 * strongly-typed TypeScript and Dart / Flutter SDK client packages.
 *
 * Usage:
 *   node bin/build-client-sdk.js
 *   node bin/build-client-sdk.js --module=work_orders
 *   node bin/build-client-sdk.js --output-ts=frontend/src/sdk --output-dart=mobile/lib/sdk
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let pkgVersion = '3.9.4';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (pkg.version) pkgVersion = pkg.version;
} catch (e) {}

const startTime = Date.now();

// 1. CLI Arguments Parsing
const args = process.argv.slice(2);
const forceRun = args.includes('--force');
let targetModule = null;
let customTsDir = null;
let customDartDir = null;

for (const arg of args) {
  if (arg.startsWith('--module=')) {
    targetModule = arg.split('=')[1].trim().toLowerCase();
  } else if (arg.startsWith('--output-ts=')) {
    customTsDir = path.resolve(arg.split('=')[1].trim());
  } else if (arg.startsWith('--output-dart=')) {
    customDartDir = path.resolve(arg.split('=')[1].trim());
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
InnovaDigits Multi-Stack Client SDK Generator CLI (v3.9.3)

Options:
  --module=<name>       Target module name (without .json extension)
  --output-ts=<dir>     Destination directory for TypeScript SDK (Default: docs/sdk/ts)
  --output-dart=<dir>   Destination directory for Dart SDK (Default: docs/sdk/dart)
  --force               Override stack.json and force generation
  --help, -h            Show help instructions
`);
    process.exit(0);
  }
}

// 2. Resolve Project Root, stack.json & Target Directories
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

const clientSdkConfig = stackConfig?.stacks?.client_sdk || {};
const workflowEnabled = stackConfig?.stacks?.workflows?.client_sdk !== false;
const tsEnabled = forceRun || (workflowEnabled && (clientSdkConfig.typescript === true || clientSdkConfig.ts === true));
const dartEnabled = forceRun || (workflowEnabled && (clientSdkConfig.dart === true || clientSdkConfig.flutter === true));

if (!forceRun && (!workflowEnabled || (!tsEnabled && !dartEnabled))) {
  console.log('⏭️ Client SDK generation skipped (stacks.client_sdk.typescript and stacks.client_sdk.dart are false in stack.json). Pass --force or enable in stack.json.');
  process.exit(0);
}

const candidateModuleDirs = [
  path.join(projectRoot, 'docs', 'modules'),
  path.join(projectRoot, '..', 'docs', 'modules'),
  path.join(projectRoot, '.ai', 'docs', 'modules')
];

let modulesDocsDir = candidateModuleDirs.find(d => fs.existsSync(d));

if (!modulesDocsDir) {
  modulesDocsDir = path.join(projectRoot, 'docs', 'modules');
}

const docsDir = path.dirname(modulesDocsDir);
const defaultTsDir = path.join(docsDir, 'sdk', 'ts');
const defaultDartDir = path.join(docsDir, 'sdk', 'dart');

const tsOutputDir = customTsDir || defaultTsDir;
const dartOutputDir = customDartDir || defaultDartDir;

// Ensure output directories exist
if (!fs.existsSync(tsOutputDir)) fs.mkdirSync(tsOutputDir, { recursive: true });
if (!fs.existsSync(dartOutputDir)) fs.mkdirSync(dartOutputDir, { recursive: true });

// 3. Locate OpenAPI Specs
let specFiles = [];
if (fs.existsSync(modulesDocsDir)) {
  const files = fs.readdirSync(modulesDocsDir).filter(f => f.endsWith('.json') && f !== 'modules_config.json');
  specFiles = files.map(f => ({
    name: path.basename(f, '.json'),
    path: path.join(modulesDocsDir, f)
  }));
}

const rootOpenApi = path.join(docsDir, 'openapi.json');
if (fs.existsSync(rootOpenApi)) {
  specFiles.push({
    name: 'openapi_master',
    path: rootOpenApi
  });
}

if (targetModule) {
  specFiles = specFiles.filter(s => s.name.toLowerCase() === targetModule || s.name.toLowerCase().includes(targetModule));
}

if (specFiles.length === 0) {
  console.log('⚠️ No OpenAPI JSON specifications found in docs/modules/ or docs/openapi.json');
  console.log(`📁 Checked: ${modulesDocsDir}`);
  process.exit(0);
}

// 4. Naming & Case Helpers
function toPascalCase(str) {
  return str
    .replace(/[-_\\/]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, c => c.toUpperCase());
}

function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSnakeCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

// Map OpenAPI types to TypeScript
function toTsType(schema) {
  if (!schema) return 'any';
  if (schema.$ref) {
    const parts = schema.$ref.split('/');
    return toPascalCase(parts[parts.length - 1]);
  }
  if (schema.type === 'string') {
    if (schema.enum && schema.enum.length > 0) {
      return schema.enum.map(e => `'${e}'`).join(' | ');
    }
    return 'string';
  }
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array') {
    return `${toTsType(schema.items)}[]`;
  }
  if (schema.type === 'object') {
    if (schema.properties) {
      const props = Object.entries(schema.properties).map(([k, v]) => {
        const optional = schema.required && schema.required.includes(k) ? '' : '?';
        return `  ${k}${optional}: ${toTsType(v)};`;
      });
      return `{\n${props.join('\n')}\n}`;
    }
    return 'Record<string, any>';
  }
  return 'any';
}

// Map OpenAPI types to Dart
function toDartType(schema) {
  if (!schema) return 'dynamic';
  if (schema.$ref) {
    const parts = schema.$ref.split('/');
    return toPascalCase(parts[parts.length - 1]);
  }
  if (schema.type === 'string') return 'String';
  if (schema.type === 'integer') return 'int';
  if (schema.type === 'number') return 'double';
  if (schema.type === 'boolean') return 'bool';
  if (schema.type === 'array') {
    return `List<${toDartType(schema.items)}>`;
  }
  if (schema.type === 'object') return 'Map<String, dynamic>';
  return 'dynamic';
}

// 5. TypeScript SDK Generator
function generateTypeScriptSdk(moduleName, doc) {
  const pascalName = toPascalCase(moduleName);
  const paths = doc.paths || {};
  let endpoints = [];
  let interfaces = [];
  let enums = [];

  for (const [routePath, methods] of Object.entries(paths)) {
    for (const [httpMethod, op] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(httpMethod.toLowerCase())) {
        const method = httpMethod.toLowerCase();
        const operationId = op.operationId || `${method}${toPascalCase(routePath)}`;
        const funcName = toCamelCase(operationId);
        const isMutation = ['post', 'put', 'patch'].includes(method);
        const summary = op.summary || `${method.toUpperCase()} ${routePath}`;

        // Request Body Schema
        let reqBodyType = 'void';
        if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
          const bodySchema = op.requestBody.content['application/json'].schema;
          reqBodyType = `${toPascalCase(operationId)}Request`;
          interfaces.push(`export interface ${reqBodyType} ${toTsType(bodySchema)}`);
        }

        // Response Schema
        let respDataType = 'any';
        const res200 = op.responses && (op.responses['200'] || op.responses['201']);
        if (res200 && res200.content && res200.content['application/json']) {
          const resSchema = res200.content['application/json'].schema;
          if (resSchema.properties && resSchema.properties.data) {
            respDataType = toTsType(resSchema.properties.data);
          } else {
            respDataType = toTsType(resSchema);
          }
        }

        endpoints.push({
          method: method.toUpperCase(),
          routePath,
          funcName,
          summary,
          isMutation,
          reqBodyType,
          respDataType
        });
      }
    }
  }

  const fileContent = `/**
 * ⚡ Auto-generated TypeScript Client SDK: ${pascalName}
 * Generated: ${new Date().toISOString()}
 * OpenAPI Spec: ${moduleName}.json
 * Zero-downtime, strictly-typed with automatic Idempotency-Key support.
 */

export interface ApiResponse<T = any> {
  success: boolean;
  status: 'success' | 'error';
  message: string;
  data: T;
  meta?: {
    current_page?: number;
    per_page?: number;
    total?: number;
    has_more?: boolean;
    [key: string]: any;
  };
  errors?: Record<string, string[]>;
  trace_id?: string;
}

export interface ClientConfig {
  baseUrl: string;
  authToken?: string;
  locale?: 'ar' | 'en';
  headers?: Record<string, string>;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
}

${interfaces.join('\n\n')}

export class ${pascalName}Client {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  public static generateIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'idemp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10);
  }

  private async request<T>(
    endpoint: string,
    method: string,
    body?: any,
    idempotencyKey?: string,
    extraHeaders?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = \`\${this.config.baseUrl}\${endpoint}\`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': this.config.locale || 'ar',
      ...(this.config.authToken ? { 'Authorization': \`Bearer \${this.config.authToken}\` } : {}),
      ...(this.config.headers || {}),
      ...(extraHeaders || {}),
    };

    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    const init: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    const fetcher = this.config.fetcher || fetch;
    const response = await fetcher(url, init);
    let data: any;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      // Parse RFC 9110 ProblemDetails or standard error envelopes
      const errorMessage = data?.detail || data?.message || data?.title || \`HTTP \${response.status}: \${response.statusText}\`;
      const error: any = new Error(errorMessage);
      error.status = response.status;
      error.response = { status: response.status, data };
      error.errors = data?.errors;
      error.traceId = data?.traceId || data?.trace_id;
      throw error;
    }

    // Seamlessly unwrap both wrapped Profile A ({ data: ... }) and flat Profile B (raw object/array)
    const unwrappedData = (data && typeof data === 'object' && 'data' in data && data.data !== undefined)
      ? data.data
      : data;

    return {
      success: true,
      status: 'success',
      message: data?.message || 'Success',
      data: unwrappedData as T,
      meta: data?.meta,
      raw: data
    } as ApiResponse<T>;
  }

${endpoints.map(ep => {
  const hasBody = ep.reqBodyType !== 'void';
  const paramList = [];
  if (hasBody) paramList.push(`payload: ${ep.reqBodyType}`);
  if (ep.isMutation) paramList.push(`idempotencyKey?: string`);
  paramList.push(`headers?: Record<string, string>`);

  const callArgs = [
    `'${ep.routePath}'`,
    `'${ep.method}'`,
    hasBody ? 'payload' : 'undefined',
    ep.isMutation ? 'idempotencyKey' : 'undefined',
    'headers'
  ];

  return `  /**
   * ${ep.summary}
   * ${ep.method} ${ep.routePath}
   */
  public async ${ep.funcName}(${paramList.join(', ')}): Promise<ApiResponse<${ep.respDataType}>> {
    return this.request<${ep.respDataType}>(${callArgs.join(', ')});
  }`;
}).join('\n\n')}
}

export default ${pascalName}Client;
`;

  return { fileContent, endpointCount: endpoints.length };
}

// 6. Dart / Flutter Mobile SDK Generator
function generateDartSdk(moduleName, doc) {
  const pascalName = toPascalCase(moduleName);
  const paths = doc.paths || {};
  let endpoints = [];
  let models = [];

  for (const [routePath, methods] of Object.entries(paths)) {
    for (const [httpMethod, op] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(httpMethod.toLowerCase())) {
        const method = httpMethod.toLowerCase();
        const operationId = op.operationId || `${method}${toPascalCase(routePath)}`;
        const funcName = toCamelCase(operationId);
        const isMutation = ['post', 'put', 'patch'].includes(method);
        const summary = op.summary || `${method.toUpperCase()} ${routePath}`;

        let reqBodyType = 'void';
        if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
          const bodySchema = op.requestBody.content['application/json'].schema;
          reqBodyType = `${toPascalCase(operationId)}Request`;
          
          if (bodySchema.type === 'object' && bodySchema.properties) {
            const fields = Object.entries(bodySchema.properties).map(([k, v]) => {
              return `  final ${toDartType(v)}? ${toCamelCase(k)};`;
            });
            const constructorParams = Object.keys(bodySchema.properties).map(k => `    this.${toCamelCase(k)},`);
            const toJsonFields = Object.keys(bodySchema.properties).map(k => `      '${k}': ${toCamelCase(k)},`);
            const fromJsonFields = Object.entries(bodySchema.properties).map(([k, v]) => `      ${toCamelCase(k)}: json['${k}'],`);

            models.push(`class ${reqBodyType} {
${fields.join('\n')}

  ${reqBodyType}({
${constructorParams.join('\n')}
  });

  factory ${reqBodyType}.fromJson(Map<String, dynamic> json) => ${reqBodyType}(
${fromJsonFields.join('\n')}
  );

  Map<String, dynamic> toJson() => {
${toJsonFields.join('\n')}
  };
}`);
          }
        }

        endpoints.push({
          method: method.toUpperCase(),
          routePath,
          funcName,
          summary,
          isMutation,
          reqBodyType
        });
      }
    }
  }

  const fileContent = `/// Auto-generated Dart / Flutter Client SDK: ${pascalName}
/// Generated: ${new Date().toISOString()}
/// OpenAPI Spec: ${moduleName}.json
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiResponse<T> {
  final bool success;
  final String status;
  final String message;
  final T? data;
  final Map<String, dynamic>? meta;
  final Map<String, dynamic>? errors;

  ApiResponse({
    required this.success,
    required this.status,
    required this.message,
    this.data,
    this.meta,
    this.errors,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic)? fromJsonT,
  ) {
    // Handle both Profile A wrapped { data: ... } and Profile B flat raw payload / RFC 9110 ProblemDetails
    final rawData = json.containsKey('data') ? json['data'] : json;
    final message = json['detail'] ?? json['message'] ?? json['title'] ?? '';
    final isSuccess = json['success'] ?? (json['status'] != 'error' && !json.containsKey('errors'));

    return ApiResponse<T>(
      success: isSuccess is bool ? isSuccess : true,
      status: json['status']?.toString() ?? (isSuccess == true ? 'success' : 'error'),
      message: message.toString(),
      data: rawData != null && fromJsonT != null
          ? fromJsonT(rawData)
          : rawData as T?,
      meta: json['meta'] as Map<String, dynamic>?,
      errors: json['errors'] as Map<String, dynamic>?,
    );
  }
}

${models.join('\n\n')}

class ${pascalName}Repository {
  final String baseUrl;
  final String? authToken;
  final String locale;
  final http.Client _client;

  ${pascalName}Repository({
    required this.baseUrl,
    this.authToken,
    this.locale = 'ar',
    http.Client? client,
  }) : _client = client ?? http.Client();

  Map<String, String> _buildHeaders([String? idempotencyKey]) {
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': locale,
    };
    if (authToken != null && authToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer \$authToken';
    }
    if (idempotencyKey != null && idempotencyKey.isNotEmpty) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return headers;
  }

${endpoints.map(ep => {
  const hasBody = ep.reqBodyType !== 'void';
  const paramList = [];
  if (hasBody) paramList.push(`${ep.reqBodyType} payload`);
  if (ep.isMutation) paramList.push(`String? idempotencyKey`);

  let requestCall = '';
  if (ep.method === 'GET') {
    requestCall = `final response = await _client.get(uri, headers: _buildHeaders());`;
  } else if (ep.method === 'POST') {
    requestCall = `final response = await _client.post(uri, headers: _buildHeaders(idempotencyKey), body: ${hasBody ? 'jsonEncode(payload.toJson())' : 'null'});`;
  } else if (ep.method === 'PUT') {
    requestCall = `final response = await _client.put(uri, headers: _buildHeaders(idempotencyKey), body: ${hasBody ? 'jsonEncode(payload.toJson())' : 'null'});`;
  } else if (ep.method === 'PATCH') {
    requestCall = `final response = await _client.patch(uri, headers: _buildHeaders(idempotencyKey), body: ${hasBody ? 'jsonEncode(payload.toJson())' : 'null'});`;
  } else if (ep.method === 'DELETE') {
    requestCall = `final response = await _client.delete(uri, headers: _buildHeaders());`;
  }

  return `  /// ${ep.summary}
  /// ${ep.method} ${ep.routePath}
  Future<ApiResponse<dynamic>> ${ep.funcName}(${paramList.join(', ')}) async {
    final uri = Uri.parse('\$baseUrl${ep.routePath}');
    ${requestCall}
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return ApiResponse<dynamic>.fromJson(json, (d) => d);
  }`;
}).join('\n\n')}
}
`;

  return { fileContent, endpointCount: endpoints.length };
}

// 7. Execute SDK Generation Loop
let totalTsFiles = 0;
let totalDartFiles = 0;
let totalEndpoints = 0;

const tsIndexExports = [];
const dartIndexExports = [];

for (const spec of specFiles) {
  let doc;
  try {
    const raw = fs.readFileSync(spec.path, 'utf8');
    doc = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to parse ${spec.path}: ${err.message}`);
    continue;
  }

  // Generate TS SDK
  if (tsEnabled) {
    const tsResult = generateTypeScriptSdk(spec.name, doc);
    const tsFile = path.join(tsOutputDir, `${spec.name}.sdk.ts`);
    fs.writeFileSync(tsFile, tsResult.fileContent);
    tsIndexExports.push(`export * from './${spec.name}.sdk';`);
    totalTsFiles++;
    totalEndpoints += tsResult.endpointCount;
  }

  // Generate Dart SDK
  if (dartEnabled) {
    const dartResult = generateDartSdk(spec.name, doc);
    const dartFileName = `${toSnakeCase(spec.name)}_sdk.dart`;
    const dartFile = path.join(dartOutputDir, dartFileName);
    fs.writeFileSync(dartFile, dartResult.fileContent);
    dartIndexExports.push(`export '${dartFileName}';`);
    totalDartFiles++;
  }
}

// Write Barrel Export files
if (tsEnabled && tsIndexExports.length > 0) {
  fs.writeFileSync(path.join(tsOutputDir, 'index.ts'), `${tsIndexExports.join('\n')}\n`);
}
if (dartEnabled && dartIndexExports.length > 0) {
  fs.writeFileSync(path.join(dartOutputDir, 'index.dart'), `${dartIndexExports.join('\n')}\n`);
}

const elapsed = Date.now() - startTime;
console.log('');
console.log('================================================================================');
console.log('       INNOVADIGITS MULTI-STACK CLIENT SDK GENERATOR (v3.9.3)                   ');
console.log('================================================================================');
console.log(`Modules Scanned : ${specFiles.length} specifications`);
console.log(`Endpoints Mapped: ${totalEndpoints} routes`);
console.log(`TypeScript SDK  : ${tsEnabled ? `${tsOutputDir} (${totalTsFiles} files)` : 'BYPASSED (stacks.client_sdk.typescript = false)'}`);
console.log(`Dart/Flutter SDK: ${dartEnabled ? `${dartOutputDir} (${totalDartFiles} files)` : 'BYPASSED (stacks.client_sdk.dart = false)'}`);
console.log(`Execution Time  : ${elapsed}ms`);
console.log('--------------------------------------------------------------------------------');
console.log(`>>> SDK GENERATION STATUS: COMPLETE (TypeScript & Dart Synchronized)`);
console.log('================================================================================\n');
