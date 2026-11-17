"use strict";

/**
 * Shared Semantic Rule Digest (`feature_srd`) implementation — algorithm `srd-v1`.
 *
 * THIS FILE IS VENDORED BYTE-IDENTICALLY IN BOTH REPOSITORIES:
 *   - BA_AI_SDLC            -> bin/lib/srd.js
 *   - stack-aware-ai-engineering -> bin/lib/srd.js
 * The cross-repo contract test compares the SHA-256 of both copies. Never edit one copy alone.
 *
 * Zero dependencies (`crypto` only).
 */

const crypto = require("crypto");

const SRD_ALGORITHM = "srd-v1";
const SRD_STABLE_META_KEYS = ["Feature ID", "Archetype", "Channels", "Screen Refs", "Project Code"];
const SRD_MANIFEST_HEX_LENGTH = 12;

/**
 * Splits a single Markdown table row on unescaped `|`.
 * @param {string} rowLine
 * @returns {string[]}
 */
function splitTableRow(rowLine) {
  return rowLine
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim());
}

/**
 * Extracts header metadata table (`| **Field** | Value |`) prior to `## 1.`.
 * @param {string} markdown
 * @returns {Record<string, string>}
 */
function parseMetadataTable(markdown) {
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s+1\./.test(line)) break;
    if (!line.trim().startsWith("|")) continue;
    const cells = splitTableRow(line);
    if (cells.length >= 2) {
      const key = cells[0].replace(/\*+/g, "").replace(/`/g, "").trim();
      const val = cells[1].replace(/^`+|`+$/g, "").trim();
      if (key && key !== "Metadata Field" && !/^:?-+:?$/.test(key)) {
        meta[key] = val;
      }
    }
  }
  return meta;
}

/**
 * Splits Markdown document by top-level `## ` headings.
 * @param {string} markdown
 * @returns {{ preamble: string, sections: Array<{ heading: string, number: number | null, body: string }> }}
 */
function splitSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const preambleLines = [];
  /** @type {Array<{ heading: string, number: number | null, body: string }>} */
  const sections = [];
  /** @type {{ heading: string, number: number | null, lines: string[] } | null} */
  let current = null;

  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      if (current) {
        sections.push({ heading: current.heading, number: current.number, body: current.lines.join("\n") });
      }
      const heading = m[1].trim();
      const numMatch = heading.match(/^(\d+)\./);
      current = { heading, number: numMatch ? Number(numMatch[1]) : null, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  if (current) {
    sections.push({ heading: current.heading, number: current.number, body: current.lines.join("\n") });
  }
  return { preamble: preambleLines.join("\n"), sections };
}

/**
 * Normalizes canonical Markdown text so whitespace/padding churn does not alter `feature_srd`.
 * @param {string} text
 * @returns {string}
 */
function normalizeSemanticPayload(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("|") && line.endsWith("|")) {
        const cells = splitTableRow(line).map((c) => c.replace(/\s+/g, " "));
        if (cells.every((c) => /^:?-+:?$/.test(c))) return "";
        return "|" + cells.join("|") + "|";
      }
      return line.replace(/\s+/g, " ");
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {{ heading: string, number: number | null }} sec
 * @returns {boolean}
 */
function isNormativeSection(sec) {
  if (sec.number !== null && sec.number >= 10) return false;
  const h = sec.heading.toLowerCase();
  if (h.includes("evolution") && h.includes("history")) return false;
  if (h.includes("version history")) return false;
  if (h.includes("gate b") || h.includes("engineering readiness appendix")) return false;
  return true;
}

/**
 * Builds the canonical payload hashed by `srd-v1`: stable metadata signature + normative sections (1-9).
 * @param {string} markdown
 * @returns {string}
 */
function buildSemanticPayload(markdown) {
  const { preamble, sections } = splitSections(markdown);
  const meta = parseMetadataTable(preamble);
  const metaSig = SRD_STABLE_META_KEYS.filter((k) => meta[k])
    .map((k) => `${k}:${meta[k]}`)
    .join("|");
  return (
    metaSig +
    "\n" +
    sections
      .filter(isNormativeSection)
      .map((s) => `## ${s.heading}\n${normalizeSemanticPayload(s.body)}`)
      .join("\n")
  );
}

/**
 * Full SHA-256 (64 lowercase hex) of the `srd-v1` payload.
 * @param {string} markdown
 * @returns {string}
 */
function computeSemanticSha256(markdown) {
  return crypto.createHash("sha256").update(buildSemanticPayload(markdown), "utf8").digest("hex");
}

/**
 * Manifest-format digest: `SRD-<prefix>-<12 uppercase hex>`.
 * @param {string} markdown
 * @param {string} prefix
 * @returns {string}
 */
function computeSemanticDigest(markdown, prefix) {
  const hex = computeSemanticSha256(markdown).slice(0, SRD_MANIFEST_HEX_LENGTH).toUpperCase();
  return `SRD-${prefix}-${hex}`;
}

/**
 * Extracts the trailing hex token of a declared digest (`SRD-FEA-S4-F01-30A93D7E6A47` or raw hex).
 * @param {string} declared
 * @returns {string} lowercase hex or ''
 */
function extractDeclaredHex(declared) {
  if (!declared) return "";
  const cleaned = String(declared).replace(/[`"'[\]()]/g, "").replace(/^sha256:/i, "").trim();
  const m = cleaned.match(/([A-Fa-f0-9]{8,64})$/);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Compares a computed 64-hex digest with a declared digest (prefix match for short manifests).
 * @param {string} computedHex
 * @param {string} declared
 * @returns {{ comparable: boolean, matches: boolean, expected: string }}
 */
function srdMatches(computedHex, declared) {
  const expected = extractDeclaredHex(declared);
  if (!expected) return { comparable: false, matches: true, expected: "" };
  const comp = String(computedHex || "").toLowerCase();
  const matches = expected.length === 64 ? comp === expected : comp.startsWith(expected);
  return { comparable: true, matches, expected };
}

module.exports = {
  SRD_ALGORITHM,
  SRD_STABLE_META_KEYS,
  SRD_MANIFEST_HEX_LENGTH,
  splitTableRow,
  parseMetadataTable,
  splitSections,
  normalizeSemanticPayload,
  isNormativeSection,
  buildSemanticPayload,
  computeSemanticSha256,
  computeSemanticDigest,
  extractDeclaredHex,
  srdMatches,
};

