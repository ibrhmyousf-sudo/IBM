#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const PACKAGES_DIR = path.join(WORKSPACE_ROOT, 'packages');
const MODULES_DIR = fs.existsSync(PACKAGES_DIR) ? PACKAGES_DIR : path.join(WORKSPACE_ROOT, 'Modules');

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
    else if (!arg.startsWith('-')) targetModule = arg;
});

if (!targetModule && !isAll) {
    console.error("Usage: node cross-dependency.js <ModuleName|--all> [--json] [--strict] [--debug]");
    process.exit(1);
}

if (!fs.existsSync(MODULES_DIR)) {
    console.error(`Error: Modules directory not found at ${MODULES_DIR}`);
    process.exit(1);
}

const modules = fs.readdirSync(MODULES_DIR).filter(d => fs.statSync(path.join(MODULES_DIR, d)).isDirectory());

if (targetModule && !modules.includes(targetModule)) {
    console.error(`Error: Target module '${targetModule}' not found under Modules/. Available modules: ${modules.join(', ')}`);
    process.exit(1);
}

// 1. Module Discovery & Structure Mapping
const moduleData = {};
modules.forEach(mod => {
    moduleData[mod] = {
        name: mod,
        namespace: `Modules\\${mod}`,
        tables: new Map(), // tableName -> { owner: mod, evidence: string, file: string, line: number, confidence: number }
        files: [],
        prodFiles: [],
        testFiles: []
    };
});

// Helper: Recursive file scanner
function getPhpFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getPhpFiles(fullPath, fileList);
        } else if (file.endsWith('.php')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

// 2. Discover files and table ownership
modules.forEach(mod => {
    const modDir = path.join(MODULES_DIR, mod);
    const allFiles = getPhpFiles(modDir);
    moduleData[mod].files = allFiles;

    allFiles.forEach(file => {
        const relPath = path.relative(WORKSPACE_ROOT, file);
        const isTest = relPath.includes('/Tests/') || relPath.includes('/tests/');
        if (isTest) {
            moduleData[mod].testFiles.push(file);
        } else {
            moduleData[mod].prodFiles.push(file);
        }

        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        // A. Schema Migration Table Discovery (Only Schema::create defines true table creation/ownership)
        const schemaRegex = /Schema::create\s*\(\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = schemaRegex.exec(content)) !== null) {
            const tableName = match[1];
            if (!moduleData[mod].tables.has(tableName)) {
                // Find line number
                const lineNo = content.substring(0, match.index).split('\n').length;
                moduleData[mod].tables.set(tableName, {
                    owner: mod,
                    evidence: match[0],
                    file: relPath,
                    line: lineNo,
                    confidence: 1.0,
                    source: 'migration'
                });
            }
        }

        // B. Model $table Property Discovery
        const modelTableRegex = /protected\s+\$table\s*=\s*['"]([^'"]+)['"]/;
        const modelMatch = content.match(modelTableRegex);
        if (modelMatch) {
            const tableName = modelMatch[1];
            if (!moduleData[mod].tables.has(tableName)) {
                const lineNo = content.substring(0, modelMatch.index).split('\n').length;
                moduleData[mod].tables.set(tableName, {
                    owner: mod,
                    evidence: modelMatch[0],
                    file: relPath,
                    line: lineNo,
                    confidence: 0.95,
                    source: 'model'
                });
            }
        }
    });
});

// Domain Capability Mapping Table
const DOMAIN_CAPABILITIES = {
    CoreIdentity: "Identity, Authentication & RBAC Permissions",
    Memberships: "Member Lifecycle, Profiles & Digital Cards",
    Facilities: "Branches, Venues, Courts & Time-Slot Bookings",
    Finance: "Invoicing, ZATCA Compliance, Receipts & Payments",
    Academies: "Sports Programs, Seasons, Group Enrollments & Coaches",
    Ecommerce: "Product Catalog, Cart Engine, Orders & Serials",
    Content: "Articles, CMS Pages, Media & Taxonomies",
    Portfolio: "Showcases, Organization Structure & About Pages",
    Settings: "System-wide Configurations & Reference Lookups",
    SharedKernel: "Shared Infrastructure & Primitive Abstractions"
};

// Helper: Strip PHP comments to prevent false positives in commented code
function stripComments(content) {
    // Replace block comments with equal number of newlines to preserve line numbers
    content = content.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        return '\n'.repeat((match.match(/\n/g) || []).length);
    });
    // Replace single line comments // or #
    const lines = content.split('\n');
    const cleaned = lines.map(line => {
        // Strip // and # comments unless inside string quotes
        let inSingleQuote = false;
        let inDoubleQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === "'" && !inDoubleQuote && (i === 0 || line[i-1] !== '\\')) inSingleQuote = !inSingleQuote;
            if (char === '"' && !inSingleQuote && (i === 0 || line[i-1] !== '\\')) inDoubleQuote = !inDoubleQuote;
            if (!inSingleQuote && !inDoubleQuote) {
                if (char === '#' || (char === '/' && line[i+1] === '/')) {
                    return line.substring(0, i);
                }
            }
        }
        return line;
    });
    return cleaned.join('\n');
}

// 3. Execution Analyzer Engine
function runAnalysisForModule(modName) {
    const results = {
        schema_version: "2.0",
        module: modName,
        timestamp: new Date().toISOString(),
        domain_capability: DOMAIN_CAPABILITIES[modName] || "Domain Context",
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

    let findingIdCounter = 1;
    const findingMap = new Map(); // Dedup key -> finding

    function recordFinding(finding) {
        const key = `${finding.direction}:${finding.source_module}:${finding.target_module}:${finding.file}:${finding.line}:${finding.type}`;
        if (!findingMap.has(key)) {
            finding.id = `F-${String(findingIdCounter++).padStart(3, '0')}`;
            findingMap.set(key, finding);
            results.findings.push(finding);
        }
    }

    function analyzeSingleFile(file, currentMod, scopeDirection) {
        const rawContent = fs.readFileSync(file, 'utf8');
        const cleanedContent = stripComments(rawContent);
        const contentLines = cleanedContent.split('\n');
        const relPath = path.relative(WORKSPACE_ROOT, file);
        const isTestFile = relPath.includes('/Tests/') || relPath.includes('/tests/');

        // Collect class imports in file for relation resolution
        const importedClasses = new Map(); // shortName -> fullNamespace
        const useRegex = /use\s+([A-Za-z0-9_\\\\]+)(?:\s+as\s+([A-Za-z0-9_]+))?\s*;/g;
        let useMatch;
        while ((useMatch = useRegex.exec(cleanedContent)) !== null) {
            const fullClass = useMatch[1];
            const alias = useMatch[2] || fullClass.split('\\').pop();
            importedClasses.set(alias, fullClass);
        }

        // Loop over each line
        contentLines.forEach((lineContent, i) => {
            const lineNo = i + 1;
            const trimmedLine = lineContent.trim();
            if (!trimmedLine) return;

            modules.forEach(otherMod => {
                if (otherMod === currentMod) return;

                // Scope Filtering Invariant:
                // Outgoing: currentMod === modName, otherMod !== modName
                // Incoming: currentMod !== modName, otherMod === modName
                if (scopeDirection === 'outgoing' && otherMod === modName) return;
                if (scopeDirection === 'incoming' && otherMod !== modName) return;

                // A. PHP Namespace & Class Import Detection
                const namespaceRegex = new RegExp(`Modules\\\\${otherMod}\\\\([A-Za-z0-9_\\\\]+)`, 'g');
                let nsMatch;
                while ((nsMatch = namespaceRegex.exec(lineContent)) !== null) {
                    const importedSubPath = nsMatch[1];
                    let type = 'direct_runtime_dependency';
                    let severity = isTestFile ? 'GREEN' : 'ORANGE';
                    let status = isTestFile ? 'ALLOWED' : 'ALLOWED_WITH_REVIEW';
                    let reason = `Direct runtime reference to ${otherMod} class (${importedSubPath})`;
                    let confidence = 1.0;

                    if (otherMod === 'SharedKernel') {
                        severity = 'GREEN';
                        status = 'ALLOWED';
                        type = 'shared_kernel_dependency';
                        reason = `Valid use of SharedKernel infrastructure (${importedSubPath})`;
                    } else if (importedSubPath.includes('Contracts\\') || importedSubPath.includes('Interfaces\\') || importedSubPath.includes('Dto\\') || importedSubPath.includes('DTOs\\') || importedSubPath.includes('DTO\\')) {
                        severity = 'GREEN';
                        status = 'ALLOWED';
                        type = 'contract_dependency';
                        reason = `Valid architectural use of ${otherMod} Contract/DTO`;
                    } else if (importedSubPath.includes('Events\\') || importedSubPath.includes('Listeners\\')) {
                        severity = 'GREEN';
                        status = 'ALLOWED_WITH_REVIEW';
                        type = 'event_dependency';
                        reason = `Cross-module event subscription to ${otherMod}`;
                    } else if (importedSubPath.includes('Models\\')) {
                        severity = isTestFile ? 'GREEN' : 'RED';
                        status = isTestFile ? 'ALLOWED' : 'VIOLATION';
                        type = 'cross_module_model_access';
                        reason = isTestFile ? `Test fixture reference to ${otherMod} Model` : `Forbidden direct access to ${otherMod} internal Model`;
                    }

                    const targetCap = DOMAIN_CAPABILITIES[otherMod] || otherMod;
                    recordFinding({
                        direction: currentMod === modName ? 'outgoing' : 'incoming',
                        source_module: currentMod,
                        target_module: otherMod,
                        type,
                        severity,
                        architectural_status: status,
                        confidence,
                        domain_capability: targetCap,
                        file: relPath,
                        line: lineNo,
                        evidence: trimmedLine,
                        reason,
                        remediation: getRemediationForType(type, currentMod, otherMod, importedSubPath)
                    });
                }

                // B. Database Table Access Detection (Multi-line & Raw SQL Support)
                moduleData[otherMod].tables.forEach((tableInfo, tableName) => {
                    // Invariant: If the current module owns this table, accessing it is NEVER a cross-module violation!
                    if (moduleData[currentMod].tables.has(tableName)) return;

                    // Check exact table reference in single line or window
                    const tableRefRegex = new RegExp(`(?:table|join|leftJoin|rightJoin|crossJoin|from|into|update|foreign|constrained)\\s*\\(\\s*['"]${tableName}['"]|(?:FROM|JOIN|UPDATE|INTO)\\s+[\`"]?${tableName}[\`"]?`, 'i');
                    if (tableRefRegex.test(lineContent)) {
                        const isCritical = !isTestFile;
                        recordFinding({
                            direction: currentMod === modName ? 'outgoing' : 'incoming',
                            source_module: currentMod,
                            target_module: otherMod,
                            type: 'cross_module_database_access',
                            severity: isCritical ? 'CRITICAL RED' : 'GREEN',
                            architectural_status: isCritical ? 'CRITICAL_VIOLATION' : 'ALLOWED',
                            confidence: tableInfo.confidence,
                            domain_capability: DOMAIN_CAPABILITIES[otherMod] || otherMod,
                            file: relPath,
                            line: lineNo,
                            evidence: trimmedLine,
                            reason: `Direct query/access to ${otherMod}'s owned database table '${tableName}'`,
                            remediation: {
                                class: "Database Ownership Violation",
                                target_abstraction: `${otherMod} QueryContract or Integration Adapter`,
                                steps: [
                                    `Remove direct table '${tableName}' query from ${currentMod}`,
                                    `Define a read-only Query Contract in SharedKernel or ${otherMod}`,
                                    `Implement contract inside ${otherMod} repository/service`,
                                    `Inject contract in ${currentMod} to fetch required fields`
                                ]
                            }
                        });
                    }
                });

                // C. Eloquent Relation Detection
                if (currentMod !== 'SharedKernel' && otherMod !== 'SharedKernel') {
                    const relationRegex = /(?:belongsTo|hasOne|hasMany|belongsToMany|morphTo|morphMany|morphToMany)\s*\(\s*\\?([A-Za-z0-9_\\\\]+)::class/g;
                    let relMatch;
                    while ((relMatch = relationRegex.exec(lineContent)) !== null) {
                        const classRef = relMatch[1];
                        const fullClass = importedClasses.get(classRef) || classRef;
                        if (fullClass.startsWith(`Modules\\${otherMod}\\`) || fullClass.startsWith(`\\Modules\\${otherMod}\\`)) {
                            recordFinding({
                                direction: currentMod === modName ? 'outgoing' : 'incoming',
                                source_module: currentMod,
                                target_module: otherMod,
                                type: 'cross_module_orm_coupling',
                                severity: isTestFile ? 'GREEN' : 'CRITICAL RED',
                                architectural_status: isTestFile ? 'ALLOWED' : 'CRITICAL_VIOLATION',
                                confidence: 1.0,
                                domain_capability: DOMAIN_CAPABILITIES[otherMod] || otherMod,
                                file: relPath,
                                line: lineNo,
                                evidence: trimmedLine,
                                reason: `Cross-module Eloquent relationship bound directly to ${otherMod} model`,
                                remediation: {
                                    class: "ORM Coupling Violation",
                                    target_abstraction: "ID reference + Explicit Resolver Contract",
                                    steps: [
                                        `Replace Eloquent relation with explicit foreign ID column (e.g. ${otherMod.toLowerCase()}_id)`,
                                        `Hydrate relation data out-of-band using ${otherMod}Service Contract lookups`,
                                        `Ensure database schema contains no cross-module Foreign Key constraints`
                                    ]
                                }
                            });
                        }
                    }
                }
            });
        });
    }

    // Run Outgoing Scan on target module files
    if (moduleData[modName]) {
        moduleData[modName].files.forEach(file => analyzeSingleFile(file, modName, 'outgoing'));
    }

    // Run Incoming Scan on other module files targeting modName
    modules.forEach(otherMod => {
        if (otherMod === modName) return;
        moduleData[otherMod].files.forEach(file => analyzeSingleFile(file, otherMod, 'incoming'));
    });

    // Compute Metrics & Status
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
    const totalBoundaryCount = results.metrics.allowed_dependencies + forbiddenCount;
    results.metrics.coupling_index = totalBoundaryCount > 0 ? Number((forbiddenCount / totalBoundaryCount).toFixed(2)) : 0;

    if (results.metrics.critical_violations > 0) {
        results.boundary_status = "CRITICAL VIOLATED";
    } else if (results.metrics.high_violations > 0) {
        results.boundary_status = "VIOLATED";
    } else if (results.metrics.medium_risk > 0) {
        results.boundary_status = "DEGRADED";
    } else {
        results.boundary_status = "HEALTHY";
    }

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
        `Run node .ai/bin/cross-dependency.js ${modName} --json to assert 0 CRITICAL RED / RED findings.`,
        "Execute Pest architecture test suite: php artisan test --filter=ArchitectureBoundaryTest",
        `Verify zero raw model imports or database table queries targeting ${modName} tables.`
    ];

    return results;
}

function getRemediationForType(type, sourceMod, targetMod, subPath) {
    if (type === 'cross_module_model_access') {
        return {
            class: "Direct Model Access",
            target_abstraction: `${targetMod}Contract / DTO`,
            steps: [
                `Define DTO/Contract in SharedKernel or ${targetMod}/Contracts`,
                `Implement contract inside ${targetMod} Service layer`,
                `Inject Contract in ${sourceMod} instead of importing Model class '${subPath}'`
            ]
        };
    } else if (type === 'direct_runtime_dependency') {
        return {
            class: "Runtime Concrete Dependency",
            target_abstraction: `${targetMod} Public Contract Interface`,
            steps: [
                `Abstract concrete class '${subPath}' into an explicit Contract interface`,
                `Inject interface via Service Container in ${sourceMod}`,
                `Bind implementation in ${targetMod}ServiceProvider`
            ]
        };
    }
    return {
        class: "Architectural Coupling",
        target_abstraction: `${targetMod} Contract/Event`,
        steps: [`Decouple ${sourceMod} reference to ${targetMod}`]
    };
}

// 4. Output Generation
if (isAll) {
    const allResults = {};
    modules.forEach(m => {
        allResults[m] = runAnalysisForModule(m);
    });
    if (isJson) console.log(JSON.stringify(allResults, null, 2));
    else {
        console.log(`╔══════════════════════════════════════════════╗`);
        console.log(`║ ALL MODULES BOUNDARY GOVERNANCE SUMMARY      ║`);
        console.log(`╚══════════════════════════════════════════════╝\n`);
        modules.forEach(m => {
            const res = allResults[m];
            console.log(`Module: ${m.padEnd(20)} Status: ${res.boundary_status.padEnd(18)} Readiness: ${res.extraction_readiness.status}`);
        });
    }
} else {
    const results = runAnalysisForModule(targetModule);
    if (isJson) {
        console.log(JSON.stringify(results, null, 2));
    } else {
        console.log(`╔══════════════════════════════════════════════╗`);
        console.log(`║ MODULE BOUNDARY GOVERNANCE                   ║`);
        console.log(`║ Module: ${targetModule.padEnd(36)} ║`);
        console.log(`╚══════════════════════════════════════════════╝\n`);

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
        console.log(`${results.extraction_readiness.status}\n`);

        console.log(`Outgoing Dependencies:`);
        if (results.outgoing_dependencies.length === 0) console.log(` - None`);
        else results.outgoing_dependencies.forEach(d => console.log(` - ${d.module} (${d.references} refs) -> ${d.domain_capability}`));
        console.log();

        console.log(`Incoming Dependencies:`);
        if (results.incoming_dependencies.length === 0) console.log(` - None`);
        else results.incoming_dependencies.forEach(d => console.log(` - ${d.module} (${d.references} refs) -> ${d.domain_capability}`));
        console.log();

        console.log(`Blast Radius:`);
        console.log(`Affected Modules: ${results.blast_radius.affected_modules}`);
        console.log(`Total References: ${results.blast_radius.total_references}`);
        console.log(`Affected Files:   ${results.blast_radius.affected_files}`);
        console.log(`Risk Level:       ${results.blast_radius.risk_level}\n`);

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
            console.log(`No violations found for ${targetModule}.\n`);
        }

        if (results.remediation_plan.length > 0) {
            console.log(`Remediation Plan:`);
            results.remediation_plan.slice(0, 3).forEach((plan, i) => {
                console.log(`${i+1}. Fix ${plan.finding_id}: ${plan.problem}`);
                console.log(`   Abstraction: ${plan.remediation.target_abstraction}`);
            });
            if (results.remediation_plan.length > 3) console.log(`   ... and ${results.remediation_plan.length - 3} more.`);
        }
    }
}
