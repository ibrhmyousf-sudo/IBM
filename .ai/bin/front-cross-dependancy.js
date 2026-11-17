#!/usr/bin/env node

/**
 * front-cross-dependancy.js
 * 
 * Frontend Cross-Dependency & Architectural Boundary Analyzer.
 * Supports Vue, Nuxt 3/4, React, Next.js, and Angular modular architectures.
 * Evaluates module extraction readiness, blast radius, and coupling index.
 * Outputs Schema 2.0 JSON for Governed AI Engineering OS.
 */

const fs = require('fs');
const path = require('path');

// 1. Resolve Workspace & Target App Paths
let currentDir = process.cwd();
let portalDir = currentDir;

if (fs.existsSync(path.join(currentDir, 'portal', 'packages'))) {
    portalDir = path.join(currentDir, 'portal');
} else if (fs.existsSync(path.join(currentDir, 'packages'))) {
    portalDir = currentDir;
} else if (fs.existsSync(path.join(currentDir, 'apps', 'club', 'portal', 'packages'))) {
    portalDir = path.join(currentDir, 'apps', 'club', 'portal');
} else if (fs.existsSync(path.join(currentDir, 'portal', 'app', 'modules'))) {
    portalDir = path.join(currentDir, 'portal');
} else if (fs.existsSync(path.join(currentDir, 'app', 'modules'))) {
    portalDir = currentDir;
} else if (fs.existsSync(path.join(currentDir, 'apps', 'club', 'portal'))) {
    portalDir = path.join(currentDir, 'apps', 'club', 'portal');
}

let MODULES_DIR = path.join(portalDir, 'packages');
if (!fs.existsSync(MODULES_DIR) || fs.readdirSync(MODULES_DIR).filter(d => {
    const full = path.join(MODULES_DIR, d);
    return fs.statSync(full).isDirectory() && !d.startsWith('.');
}).length === 0) {
    MODULES_DIR = path.join(portalDir, 'app', 'modules');
}

// CLI Arguments
const args = process.argv.slice(2);
let targetModule = null;
let isJson = false;
let isStrict = false;
let isDebug = false;
let isAll = false;

args.forEach(arg => {
    if (arg === '--json') isJson = true;
    else if (arg === '--strict') isStrict = true;
    else if (arg === '--debug') isDebug = true;
    else if (arg === '--all') isAll = true;
    else if (!arg.startsWith('-')) targetModule = arg.toLowerCase();
});

if (!targetModule && !isAll) {
    console.error("Usage: node front-cross-dependancy.js <ModuleName|--all> [--json] [--strict] [--debug]");
    process.exit(1);
}

if (!fs.existsSync(MODULES_DIR)) {
    console.error(`Error: Modules directory not found at ${MODULES_DIR}`);
    process.exit(1);
}

const rawModules = fs.readdirSync(MODULES_DIR).filter(d => {
    const full = path.join(MODULES_DIR, d);
    return fs.statSync(full).isDirectory() && !d.startsWith('.');
});

// Map lowercase to actual directory name
const moduleNameMap = new Map();
rawModules.forEach(m => moduleNameMap.set(m.toLowerCase(), m));

if (targetModule && !moduleNameMap.has(targetModule)) {
    console.error(`Error: Target module '${targetModule}' not found under ${MODULES_DIR}. Available modules: ${rawModules.join(', ')}`);
    process.exit(1);
}

const normalizedTargetModule = targetModule ? moduleNameMap.get(targetModule) : null;

// Domain Capabilities Mapping
const DOMAIN_CAPABILITIES = {
    events: "Event Lifecycle, Matches, Ticketing & Seat Reservations",
    academies: "Sports Academies, Training Programs & Coaches",
    facilities: "Facility Bookings, Court Rentals & Venues",
    memberships: "Member Profiles, Subscriptions & Membership Cards",
    auth: "Authentication, User Session & Security",
    teams: "Sports Teams, Squads, Players & Standings",
    store: "Merchandise, Cart Engine & Product Store",
    notifications: "Push Notifications, In-App Alerts & Activity Feeds",
    profile: "User Profile, Account Settings & Personal Data",
    about: "Club History, Board, Mission & About Pages",
    media: "Press Releases, Gallery, Videos & News",
    home: "Landing Page, Highlights & Feature Banners",
    "coming-soon": "Feature Teasers & Maintenance Placeholders",
    config: "Application Config & Lookups",
    core: "Shared Kernel, Base UI Atoms & Network Utilities"
};

// Supported file extensions
const SUPPORTED_EXTS = ['.vue', '.ts', '.js', '.tsx', '.jsx', '.mjs', '.html'];
const IGNORED_DIRS = ['node_modules', '.nuxt', '.output', 'dist', '.git', '.ai'];

// Helper: Recursive file scanner
function getFrontendFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        if (IGNORED_DIRS.includes(item)) continue;
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            getFrontendFiles(full, fileList);
        } else {
            const ext = path.extname(item).toLowerCase();
            if (SUPPORTED_EXTS.includes(ext)) {
                fileList.push(full);
            }
        }
    }
    return fileList;
}

// 2. Pre-scan Module Components, Stores, and Services Registry
const moduleRegistry = {};
const componentOwners = new Map(); // componentBaseName -> { mod, file }
const storeOwners = new Map();     // storeName -> { mod, file }

rawModules.forEach(mod => {
    const modDir = path.join(MODULES_DIR, mod);
    const files = getFrontendFiles(modDir);
    moduleRegistry[mod] = {
        name: mod,
        dir: modDir,
        files: files,
        components: new Set(),
        stores: new Set(),
        services: new Set()
    };

    files.forEach(file => {
        const basename = path.basename(file, path.extname(file));
        const rel = path.relative(portalDir, file);

        if (rel.includes('/components/')) {
            moduleRegistry[mod].components.add(basename);
            componentOwners.set(basename, { mod, file: rel });
        } else if (rel.includes('/stores/')) {
            moduleRegistry[mod].stores.add(basename);
            storeOwners.set(basename, { mod, file: rel });
        } else if (rel.includes('/services/')) {
            moduleRegistry[mod].services.add(basename);
        }
    });
});

// Helper: Strip comments to avoid false positives
function stripComments(content) {
    // 1. Block comments /* ... */
    content = content.replace(/\/\*[\s\S]*?\*\//g, match => '\n'.repeat((match.match(/\n/g) || []).length));
    // 2. HTML comments <!-- ... -->
    content = content.replace(/<!--[\s\S]*?-->/g, match => '\n'.repeat((match.match(/\n/g) || []).length));
    // 3. Single-line comments //
    const lines = content.split('\n');
    const cleaned = lines.map(line => {
        let inSingle = false;
        let inDouble = false;
        let inBacktick = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === "'" && !inDouble && !inBacktick && (i === 0 || line[i-1] !== '\\')) inSingle = !inSingle;
            else if (c === '"' && !inSingle && !inBacktick && (i === 0 || line[i-1] !== '\\')) inDouble = !inDouble;
            else if (c === '`' && !inSingle && !inDouble && (i === 0 || line[i-1] !== '\\')) inBacktick = !inBacktick;
            else if (!inSingle && !inDouble && !inBacktick && c === '/' && line[i+1] === '/') {
                return line.substring(0, i);
            }
        }
        return line;
    });
    return cleaned.join('\n');
}

// 3. Analysis Engine
function analyzeModule(modName) {
    const results = {
        schema_version: "2.0",
        module: modName,
        framework: "Nuxt 4 / Vue 3 (HMVC)",
        timestamp: new Date().toISOString(),
        domain_capability: DOMAIN_CAPABILITIES[modName] || `${modName} Domain Context`,
        boundary_status: "HEALTHY",
        scores: {},
        metrics: {
            total_findings: 0,
            critical_violations: 0,
            high_violations: 0,
            medium_risk: 0,
            allowed_dependencies: 0,
            unknown_patterns: 0,
            coupling_index: 0
        },
        outgoing_dependencies: [],
        incoming_dependencies: [],
        findings: [],
        blast_radius: {},
        extraction_readiness: {},
        remediation_plan: [],
        verification_plan: []
    };

    let findingCounter = 1;
    const findingMap = new Map();

    function recordFinding(f) {
        const key = `${f.direction}:${f.source_module}:${f.target_module}:${f.file}:${f.line}:${f.type}`;
        if (!findingMap.has(key)) {
            f.id = `FF-${String(findingCounter++).padStart(3, '0')}`;
            findingMap.set(key, f);
            results.findings.push(f);
        }
    }

    function analyzeFile(filePath, currentMod, direction) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const cleaned = stripComments(raw);
        const lines = cleaned.split('\n');
        const relPath = path.relative(portalDir, filePath);
        const isTest = relPath.includes('/tests/') || relPath.includes('/__tests__/') || relPath.includes('.spec.') || relPath.includes('.test.');

        lines.forEach((lineContent, idx) => {
            const lineNo = idx + 1;
            const trimmed = lineContent.trim();
            if (!trimmed) return;

            // Check against all other modules
            rawModules.forEach(otherMod => {
                if (otherMod === currentMod) return;

                // Directional filtering
                if (direction === 'outgoing' && otherMod === modName) return;
                if (direction === 'incoming' && otherMod !== modName) return;

                // A. Detect Explicit Imports (Static, Dynamic, Require)
                // Patterns: '~/modules/{otherMod}/...', '@/modules/{otherMod}/...', '../../{otherMod}/...'
                const importRegex = new RegExp(`(?:from\\s+['"]|import\\s*\\(['"]|require\\s*\\(['"])(?:[~@]#?\\/modules\\/${otherMod}|(?:\\.\\.\\/)+${otherMod})(\\/[^'"]+)?['"]`, 'g');
                let match;
                while ((match = importRegex.exec(lineContent)) !== null) {
                    const subPath = match[1] || '';
                    let type = 'direct_runtime_import';
                    let severity = 'RED';
                    let status = 'VIOLATION';
                    let reason = `Direct reference to ${otherMod} module (${subPath || 'root'})`;

                    if (otherMod === 'core') {
                        severity = 'GREEN';
                        status = 'ALLOWED';
                        type = 'shared_kernel_dependency';
                        reason = `Valid architectural use of SharedKernel / Core (${subPath})`;
                    } else if (subPath.includes('/components/')) {
                        severity = 'CRITICAL RED';
                        status = 'CRITICAL_VIOLATION';
                        type = 'cross_module_component_import';
                        reason = `Forbidden direct cross-module UI component import from ${otherMod}`;
                    } else if (subPath.includes('/stores/') || subPath.includes('Store')) {
                        severity = 'CRITICAL RED';
                        status = 'CRITICAL_VIOLATION';
                        type = 'cross_module_store_coupling';
                        reason = `Forbidden direct cross-module Pinia store coupling with ${otherMod}`;
                    } else if (subPath.includes('/pages/')) {
                        severity = 'CRITICAL RED';
                        status = 'CRITICAL_VIOLATION';
                        type = 'cross_module_page_coupling';
                        reason = `Forbidden direct page component import/re-export from ${otherMod}`;
                    } else if (subPath.includes('/services/')) {
                        severity = 'RED';
                        status = 'VIOLATION';
                        type = 'cross_module_service_coupling';
                        reason = `Forbidden direct cross-module API service coupling with ${otherMod}`;
                    } else if (subPath.includes('/composables/')) {
                        severity = 'ORANGE';
                        status = 'ALLOWED_WITH_REVIEW';
                        type = 'cross_module_composable_coupling';
                        reason = `Cross-module composable dependency on ${otherMod}`;
                    } else if (subPath.includes('/types/')) {
                        severity = 'ORANGE';
                        status = 'ALLOWED_WITH_REVIEW';
                        type = 'cross_module_type_coupling';
                        reason = `Cross-module type reference on ${otherMod}`;
                    }

                    recordFinding({
                        direction: currentMod === modName ? 'outgoing' : 'incoming',
                        source_module: currentMod,
                        target_module: otherMod,
                        type,
                        severity: isTest && severity.includes('RED') ? 'ORANGE' : severity,
                        architectural_status: isTest && status.includes('VIOLATION') ? 'ALLOWED_WITH_REVIEW' : status,
                        confidence: 1.0,
                        domain_capability: DOMAIN_CAPABILITIES[otherMod] || otherMod,
                        file: relPath,
                        line: lineNo,
                        evidence: trimmed,
                        reason,
                        remediation: getRemediation(type, currentMod, otherMod, subPath)
                    });
                }

                // B. Detect Auto-imported Store Usage (e.g. useAuthStore)
                if (otherMod !== 'core') {
                    moduleRegistry[otherMod].stores.forEach(storeName => {
                        const storeCallRegex = new RegExp(`\\b${storeName}\\s*\\(`, 'g');
                        if (storeCallRegex.test(lineContent)) {
                            // Verify if it was already caught by an explicit import on the same line
                            const isImportLine = lineContent.includes('import ') && lineContent.includes(otherMod);
                            if (!isImportLine) {
                                recordFinding({
                                    direction: currentMod === modName ? 'outgoing' : 'incoming',
                                    source_module: currentMod,
                                    target_module: otherMod,
                                    type: 'cross_module_store_coupling',
                                    severity: isTest ? 'ORANGE' : 'CRITICAL RED',
                                    architectural_status: isTest ? 'ALLOWED_WITH_REVIEW' : 'CRITICAL_VIOLATION',
                                    confidence: 0.95,
                                    domain_capability: DOMAIN_CAPABILITIES[otherMod] || otherMod,
                                    file: relPath,
                                    line: lineNo,
                                    evidence: trimmed,
                                    reason: `Auto-imported or global call to ${otherMod} store '${storeName}'`,
                                    remediation: getRemediation('cross_module_store_coupling', currentMod, otherMod, storeName)
                                });
                            }
                        }
                    });
                }
            });
        });
    }

    // Run Outgoing scan
    if (moduleRegistry[modName]) {
        moduleRegistry[modName].files.forEach(f => analyzeFile(f, modName, 'outgoing'));
    }

    // Run Incoming scan
    rawModules.forEach(otherMod => {
        if (otherMod === modName) return;
        moduleRegistry[otherMod].files.forEach(f => analyzeFile(f, otherMod, 'incoming'));
    });

    // Compute Metrics
    const incomingMods = new Set();
    const outgoingMods = new Set();

    results.findings.forEach(f => {
        results.metrics.total_findings++;
        if (f.direction === 'incoming' && f.target_module === modName) incomingMods.add(f.source_module);
        if (f.direction === 'outgoing' && f.source_module === modName) outgoingMods.add(f.target_module);

        if (f.severity === 'CRITICAL RED') results.metrics.critical_violations++;
        else if (f.severity === 'RED') results.metrics.high_violations++;
        else if (f.severity === 'ORANGE') results.metrics.medium_risk++;
        else if (f.severity === 'GREEN') results.metrics.allowed_dependencies++;
        else if (f.severity === 'YELLOW') results.metrics.unknown_patterns++;
    });

    const forbiddenCount = results.metrics.critical_violations + results.metrics.high_violations;
    const totalBoundary = results.metrics.allowed_dependencies + forbiddenCount;
    results.metrics.coupling_index = totalBoundary > 0 ? Number((forbiddenCount / totalBoundary).toFixed(2)) : 0;

    if (results.metrics.critical_violations > 0) results.boundary_status = "CRITICAL VIOLATED";
    else if (results.metrics.high_violations > 0) results.boundary_status = "VIOLATED";
    else if (results.metrics.medium_risk > 0) results.boundary_status = "DEGRADED";
    else results.boundary_status = "HEALTHY";

    results.scores = {
        boundary_status: results.boundary_status,
        critical_violations: results.metrics.critical_violations,
        high_violations: results.metrics.high_violations,
        medium_risk: results.metrics.medium_risk,
        allowed_dependencies: results.metrics.allowed_dependencies,
        coupling_index: results.metrics.coupling_index
    };

    results.outgoing_dependencies = Array.from(outgoingMods).map(m => ({
        module: m,
        domain_capability: DOMAIN_CAPABILITIES[m] || m,
        references: results.findings.filter(f => f.direction === 'outgoing' && f.target_module === m).length
    }));

    results.incoming_dependencies = Array.from(incomingMods).map(m => ({
        module: m,
        domain_capability: DOMAIN_CAPABILITIES[m] || m,
        references: results.findings.filter(f => f.direction === 'incoming' && f.source_module === m).length
    }));

    const incomingFindings = results.findings.filter(f => f.direction === 'incoming');
    results.blast_radius = {
        affected_modules: incomingMods.size,
        affected_files: new Set(incomingFindings.map(f => f.file)).size,
        total_references: incomingFindings.length,
        risk_level: incomingMods.size > 3 ? "HIGH BLAST RADIUS" : incomingMods.size > 0 ? "MODERATE BLAST RADIUS" : "ISOLATED"
    };

    const blockers = results.findings
        .filter(f => f.severity.includes('RED'))
        .map(f => `[${f.source_module} -> ${f.target_module}] ${f.reason} (${f.file}:${f.line})`);

    const risks = results.findings
        .filter(f => f.severity === 'ORANGE')
        .map(f => `[${f.source_module} -> ${f.target_module}] ${f.reason} (${f.file}:${f.line})`);

    results.extraction_readiness = {
        status: forbiddenCount > 0 ? 'NOT READY' : results.metrics.medium_risk > 0 ? 'READY WITH RISKS' : 'EXTRACTION READY',
        maturity_level: forbiddenCount > 0 ? 'Level 1: Monolith Co-Located' : results.metrics.medium_risk > 0 ? 'Level 2: Boundary Isolated' : 'Level 3: Micro-Frontend Ready',
        blockers: Array.from(new Set(blockers)),
        risks: Array.from(new Set(risks)),
        non_blocking_dependencies: results.outgoing_dependencies.map(d => `${d.module} (${d.domain_capability})`)
    };

    results.remediation_plan = results.findings
        .filter(f => f.severity.includes('RED'))
        .map(f => ({
            finding_id: f.id,
            source: f.source_module,
            target: f.target_module,
            type: f.type,
            file: `${f.file}:${f.line}`,
            problem: f.reason,
            remediation: f.remediation
        }));

    results.verification_plan = [
        `Run: node portal/.ai/bin/front-cross-dependancy.js ${modName} --json to verify 0 RED findings.`,
        "Run type checking: pnpm typecheck",
        `Verify zero direct imports targeting ${modName} internal components or stores.`
    ];

    return results;
}

function getRemediation(type, sourceMod, targetMod, subPath) {
    if (type === 'cross_module_component_import') {
        return {
            class: "Frontend UI Coupling",
            target_abstraction: "Shared UI Atom or Dynamic Slot Injection",
            steps: [
                `Move shared component from ${targetMod} to core/components (SharedKernel)`,
                `Or pass content via Vue slots / component props from the parent shell`,
                `Avoid direct cross-module sibling imports across packages`
            ]
        };
    } else if (type === 'cross_module_store_coupling') {
        return {
            class: "Frontend State Coupling",
            target_abstraction: "EventBus / CustomEvents or Shared Session DTO",
            steps: [
                `Do not access ${targetMod} store directly inside ${sourceMod}`,
                `Emit an event via EventBus or window.dispatchEvent for asynchronous notifications`,
                `Or consume user session data through core/composables/useAuth`
            ]
        };
    } else if (type === 'cross_module_page_coupling') {
        return {
            class: "Frontend Route Coupling",
            target_abstraction: "Declarative Navigation (navigateTo / router.push)",
            steps: [
                `Do not import other module pages directly`,
                `Navigate declaratively using navigateTo('/${targetMod}/...') or dynamic deep links`
            ]
        };
    } else if (type === 'cross_module_service_coupling') {
        return {
            class: "Frontend API Coupling",
            target_abstraction: "Public Contract / API Gateway",
            steps: [
                `Decouple direct service imports by consuming shared endpoints via useHttp`,
                `Define a shared response DTO in core/types`
            ]
        };
    }
    return {
        class: "Architectural Coupling",
        target_abstraction: "Core Abstraction",
        steps: [`Decouple ${sourceMod} reference to ${targetMod}`]
    };
}

// 4. CLI Output Handling
if (isAll) {
    const allResults = {};
    rawModules.forEach(m => {
        allResults[m] = analyzeModule(m);
    });

    if (isJson) {
        console.log(JSON.stringify(allResults, null, 2));
    } else {
        console.log(`╔════════════════════════════════════════════════════════════════════════════╗`);
        console.log(`║      FRONTEND MODULES BOUNDARY & EXTRACTION GOVERNANCE SUMMARY             ║`);
        console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);

        console.log(`| ${'Module'.padEnd(16)} | ${'Status'.padEnd(18)} | ${'Coupling'.padEnd(8)} | ${'Readiness'.padEnd(18)} |`);
        console.log(`|${'-'.repeat(18)}|${'-'.repeat(20)}|${'-'.repeat(10)}|${'-'.repeat(20)}|`);

        rawModules.forEach(m => {
            const r = allResults[m];
            const modStr = m.padEnd(16);
            const statStr = r.boundary_status.padEnd(18);
            const coupStr = String(r.metrics.coupling_index).padEnd(8);
            const readStr = r.extraction_readiness.status.padEnd(18);
            console.log(`| ${modStr} | ${statStr} | ${coupStr} | ${readStr} |`);
        });
        console.log();
    }
} else {
    const results = analyzeModule(normalizedTargetModule);
    if (isJson) {
        console.log(JSON.stringify(results, null, 2));
    } else {
        console.log(`╔════════════════════════════════════════════════════════════════════════════╗`);
        console.log(`║ FRONTEND MODULE BOUNDARY GOVERNANCE                                        ║`);
        console.log(`║ Target Module: ${normalizedTargetModule.padEnd(59)} ║`);
        console.log(`╚════════════════════════════════════════════════════════════════════════════╝\n`);

        console.log(`Domain Capability:`);
        console.log(`${results.domain_capability}\n`);

        console.log(`Boundary Status:`);
        console.log(`${results.boundary_status}\n`);

        console.log(`Metrics:`);
        console.log(` - Total Findings:     ${results.metrics.total_findings}`);
        console.log(` - Critical Violations: ${results.metrics.critical_violations}`);
        console.log(` - High Violations:     ${results.metrics.high_violations}`);
        console.log(` - Medium Risk:         ${results.metrics.medium_risk}`);
        console.log(` - Allowed Boundary:    ${results.metrics.allowed_dependencies}`);
        console.log(` - Coupling Index:      ${results.metrics.coupling_index}\n`);

        console.log(`Extraction Readiness:`);
        console.log(` - Status:         ${results.extraction_readiness.status}`);
        console.log(` - Maturity Level: ${results.extraction_readiness.maturity_level}\n`);

        console.log(`Outgoing Dependencies:`);
        if (results.outgoing_dependencies.length === 0) console.log(` - None`);
        else results.outgoing_dependencies.forEach(d => console.log(` - ${d.module.padEnd(14)} (${d.references} refs) -> ${d.domain_capability}`));
        console.log();

        console.log(`Incoming Dependencies:`);
        if (results.incoming_dependencies.length === 0) console.log(` - None`);
        else results.incoming_dependencies.forEach(d => console.log(` - ${d.module.padEnd(14)} (${d.references} refs) -> ${d.domain_capability}`));
        console.log();

        console.log(`Blast Radius:`);
        console.log(` - Affected Modules: ${results.blast_radius.affected_modules}`);
        console.log(` - Total References: ${results.blast_radius.total_references}`);
        console.log(` - Affected Files:   ${results.blast_radius.affected_files}`);
        console.log(` - Risk Level:       ${results.blast_radius.risk_level}\n`);

        if (results.findings.length > 0) {
            console.log(`Key Findings:`);
            results.findings.forEach(f => {
                console.log(`[${f.id}] [${f.severity}] ${f.source_module} -> ${f.target_module}`);
                console.log(`Type: ${f.type} | Status: ${f.architectural_status}`);
                console.log(`File: ${f.file}:${f.line}`);
                console.log(`Evidence: ${f.evidence}`);
                console.log(`Reason: ${f.reason}\n`);
            });
        } else {
            console.log(`Clean! Zero boundary violations found for ${normalizedTargetModule}.\n`);
        }

        if (results.remediation_plan.length > 0) {
            console.log(`Top Remediation Steps:`);
            results.remediation_plan.slice(0, 3).forEach((plan, i) => {
                console.log(`${i+1}. Fix ${plan.finding_id}: ${plan.problem}`);
                console.log(`   Abstraction: ${plan.remediation.target_abstraction}`);
            });
            if (results.remediation_plan.length > 3) console.log(`   ... and ${results.remediation_plan.length - 3} more.`);
        }
    }

    if (isStrict && (results.metrics.critical_violations > 0 || results.metrics.high_violations > 0)) {
        process.exit(1);
    }
}
