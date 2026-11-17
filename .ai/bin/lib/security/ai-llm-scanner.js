/**
 * AI & LLM Deterministic Security Scanner (v4.2.0)
 * Implements LLM-S01..LLM-S06 mapped to OWASP LLMSVS 2.0 / Top 10 for LLM Apps & Checklist V1.1 (SEC-116..SEC-125).
 * Pure CommonJS, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'storage', 'dist', 'build', 'bin', 'obj',
  '.nuxt', '.output', '.next', 'coverage', '.ai', '.agents', '.cursor', '.github',
  'hooks', 'skills', 'rules', 'templates', 'extensions', 'presets',
  'telemetry', 'specs', 'docs', 'context', 'Migrations', 'tests', 'Tests'
]);

const AI_DETECTION_REGEX = /\b(?:OpenAI|Anthropic|Gemini|GenerativeModel|ChatCompletion|AiSuggestion|AiSql|InnovaDigitsML|GenerateQuery|langchain|LlamaIndex|Ollama|Bedrock|AzureOpenAI|GetEligibleForPrompt|PromptBuilder|VectorStore|Embedding)\b/i;

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

function auditAiLlm(root, securityProfile = {}) {
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

  const candidateFiles = [];
  walk(root, (f) => {
    const base = path.basename(f);
    if (!/\.(php|cs|ts|tsx|js|jsx)$/.test(base)) return;
    if (/\.(test|spec)\.[jt]sx?$/.test(base) || /\.Designer\.cs$/.test(base) || /\.d\.ts$/.test(base)) return;
    candidateFiles.push(f);
  });

  const aiSurfaceDeclared = Boolean(securityProfile?.surfaces?.ai_llm);
  const aiFiles = candidateFiles.filter((f) => {
    const c = read(f);
    return AI_DETECTION_REGEX.test(c) || /(?:Ai|Llm|Prompt|Rag|Ml)[A-Z_a-z0-9]*\.(?:php|cs|ts|js)$/i.test(path.basename(f));
  });

  if (!aiSurfaceDeclared && aiFiles.length === 0) {
    return [];
  }

  for (const f of aiFiles) {
    const c = read(f);
    const r = rel(root, f);
    const base = path.basename(f);

    // LLM-S01 (SEC-052, SEC-120 — CRITICAL): Executing AI/ML output as SQL, shell, or eval
    const sqlExecMatch = c.match(/\b(?:ExecuteSqlRaw|ExecuteSqlAsync|FromSqlRaw|DB::statement|DB::unprepared|DB::select|SqlCommand|shell_exec|exec|Process\.Start|eval)\s*\(/);
    if (sqlExecMatch) {
      add(
        'LLM-S01',
        ['SEC-052', 'SEC-053', 'SEC-119', 'SEC-120'],
        'CRITICAL',
        'Executing Untrusted AI/LLM Output as SQL or Command',
        'OWASP LLM02 / ASVS V5.3',
        'NCA ECC 1-6',
        base,
        `${r}:${lineOf(c, sqlExecMatch.index)}`,
        `AI/ML integration file '${base}' invokes '${sqlExecMatch[0].trim()}' on model-generated or prompt-derived output, enabling prompt-to-SQLi / RCE.`,
        'Never execute LLM output as raw SQL, shell commands, or code. Map AI output to structured allowlisted filter DTOs executed through parameterized ORM queries.'
      );
    }

    // LLM-S02 (SEC-118, SEC-091 — CRITICAL): Schema dump (information_schema) or cleartext HTTP to AI service
    const schemaLeak = c.match(/\binformation_schema\b|SHOW\s+FULL\s+TABLES|sqlite_master|pg_catalog/i);
    if (schemaLeak) {
      add(
        'LLM-S02',
        ['SEC-118'],
        'CRITICAL',
        'Database Schema Disclosure to External AI Model',
        'OWASP LLM06 / LLMSVS',
        'NCA ECC 2-7 / DCC',
        base,
        `${r}:${lineOf(c, schemaLeak.index)}`,
        `'${base}' queries '${schemaLeak[0]}' to inject live database schema metadata into an AI/ML prompt.`,
        'Never expose `information_schema` or internal table structures to external models; restrict AI context to allowlisted business domain metadata.'
      );
    }

    const clearHttpAi = c.match(/['"`](http:\/\/(?!localhost|127\.0\.0\.1)[^'"`\s]+)['"`]/i);
    if (clearHttpAi) {
      add(
        'LLM-S02',
        ['SEC-091', 'SEC-118'],
        'CRITICAL',
        'Cleartext HTTP Transport to External AI / ML Endpoint',
        'OWASP LLM06 / ASVS V9.1',
        'NCA ECC 2-8 / NCS',
        base,
        `${r}:${lineOf(c, clearHttpAi.index)}`,
        `'${base}' transmits AI/ML prompts or tenant data over unencrypted cleartext HTTP (${clearHttpAi[1]}).`,
        'Enforce HTTPS (TLS 1.2+) with strict certificate verification on all AI/ML service endpoints.'
      );
    }

    // LLM-S03 (SEC-116 — HIGH): Unfenced prompt concatenation without delimiter isolation
    const buildsPrompt = /(?:systemPrompt|system_prompt|prompt\b)[\s\S]{0,200}?(?:\.\s*\$|\+\s*\w+|\$\{[^}]+\}|\$"[^"]*\{)/i.test(c);
    const hasFencing = /<(?:untrusted_input|user_input|attachment_content|context_data)>|<<<UNTRUSTED|treat\s+enclosed\s+content\s+strictly\s+as\s+data|ignore\s+any\s+instructions\s+inside/i.test(c);
    if (buildsPrompt && !hasFencing) {
      add(
        'LLM-S03',
        ['SEC-116'],
        'HIGH',
        'Unfenced User / Attachment Input in AI Prompt (Prompt Injection)',
        'OWASP LLM01 / LLMSVS',
        'NCA ECC 1-6',
        base,
        r,
        `'${base}' interpolates user or attachment text directly into an AI prompt without delimiter fencing or anti-override system instructions.`,
        'Isolate untrusted inputs inside explicit XML delimiters (`<untrusted_input>...</untrusted_input>`) with system instructions forbidding instruction override.'
      );
    }

    // LLM-S04 (SEC-117, SEC-123 — CRITICAL): Pre-prompt / RAG retrieval missing caller userId & tenantId ACL
    const fetchesContext = /\b(?:GetEligibleForPrompt|getAttachmentsForPrompt|retrieveChunks|similaritySearch|vectorSearch|Attachment::where|Attachments\s*\.Where|Documents\s*\.Where)\b/i.test(c);
    if (fetchesContext) {
      const checksTenantAndCaller = /tenant_id|TenantId/i.test(c) && /user_id|UserId|authorize\s*\(|Gate::|CanAccess|HasPermission/i.test(c);
      if (!checksTenantAndCaller) {
        add(
          'LLM-S04',
          ['SEC-039', 'SEC-117', 'SEC-123'],
          'CRITICAL',
          'AI Context / RAG Attachment Retrieval Missing Caller & Tenant ACL',
          'OWASP LLM06 / API1:2023',
          'NCA ECC 2-2 / DCC',
          base,
          r,
          `'${base}' loads attachments, entities, or RAG vector chunks into an AI prompt without verifying both caller userId permission and tenantId isolation.`,
          'Enforce strict `tenant_id` and caller object-level authorization prior to reading any document, attachment, or vector chunk into prompt context.'
        );
      }
    }

    // LLM-S05 (SEC-121 — HIGH): AI controller/endpoint missing quota / rate-limit or max_tokens/input ceiling
    const isAiEndpoint = /(?:Controller\.php|Controller\.cs|Endpoints\.cs|route\.[jt]s)$/i.test(base);
    if (isAiEndpoint) {
      const hasRateOrQuota = /throttle:|RequireRateLimiting|EnableRateLimiting|RateLimit|max_tokens|MaxTokens|max:\d+|MaximumLength/i.test(c);
      if (!hasRateOrQuota) {
        add(
          'LLM-S05',
          ['SEC-073', 'SEC-121'],
          'HIGH',
          'AI Endpoint Missing Quota, Token Ceiling, or Rate Limit',
          'OWASP LLM04 / API4:2023',
          'NCA ECC 2-5',
          base,
          r,
          `AI endpoint '${base}' lacks rate-limiting policy, input length bounds, or max_tokens budget controls (Model Denial of Service / wallet exhaustion).`,
          'Enforce per-user/tenant rate limiting, strict input character validation, request timeouts, and explicit `max_tokens` ceilings.'
        );
      }
    }

    // LLM-S06 (SEC-124 — HIGH): Logging raw AI prompt or response without redaction
    const rawAiLog = c.match(/\b(?:Log::(?:info|debug|warning|error)|_logger\.Log(?:Information|Warning|Debug|Error)|console\.log)\s*\([^;\n]*\b(?:prompt|rawPrompt|aiResponse|completionText)\b/i);
    if (rawAiLog && !/redact|mask|scrub/i.test(rawAiLog[0])) {
      add(
        'LLM-S06',
        ['SEC-124', 'SEC-148'],
        'HIGH',
        'Unredacted AI Prompt / Response Logged',
        'OWASP LLM06 / ASVS V7.3',
        'NCA ECC 2-12 / DCC',
        base,
        `${r}:${lineOf(c, rawAiLog.index)}`,
        `'${base}' logs raw AI prompt or completion payloads without PII/secret redaction.`,
        'Scrub Tier-1/2 PII and secrets via a redaction filter before logging AI telemetry, or log token counts and correlation IDs only.'
      );
    }
  }

  return findings;
}

module.exports = {
  auditAiLlm,
  AI_DETECTION_REGEX
};

