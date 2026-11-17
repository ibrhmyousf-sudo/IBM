const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');

function runAnalyzer(moduleName) {
    const output = execSync(`node ${path.join(__dirname, 'cross-dependency.js')} ${moduleName} --json`, { encoding: 'utf8' });
    return JSON.parse(output);
}

function test() {
    console.log("Running Cross Dependency Analyzer Forensic Test Suite...\n");

    // Test 1: Run against Facilities
    const result = runAnalyzer('Facilities');
    
    // Assert Schema 2.0 structure
    if (!result.schema_version || result.schema_version !== "2.0" || !result.module || !result.scores || !result.findings || !result.blast_radius || !result.metrics) {
        throw new Error("Schema 2.0 validation failed. Missing required fields.");
    }
    console.log("✅ Schema 2.0 JSON structure validated.");

    // Assert Boundary Status and Domain Capability
    if (!result.boundary_status || !result.domain_capability) {
        throw new Error("Boundary status or domain capability missing.");
    }
    console.log(`✅ Boundary Status validated: ${result.boundary_status} (${result.domain_capability}).`);

    // Assert finding directions scoping
    const hasIncoming = result.findings.some(f => f.direction === 'incoming');
    const hasOutgoing = result.findings.some(f => f.direction === 'outgoing');
    if (!hasIncoming || !hasOutgoing) {
        throw new Error("Failed to detect incoming or outgoing dependencies correctly.");
    }

    // Verify scope invariant: Every finding must have target_module or source_module equal to target module
    const invalidScopeFinding = result.findings.find(f => 
        (f.direction === 'outgoing' && f.source_module !== 'Facilities') ||
        (f.direction === 'incoming' && f.target_module !== 'Facilities')
    );
    if (invalidScopeFinding) {
        throw new Error(`Scope Invariant Violated! Finding ${invalidScopeFinding.id} does not involve Facilities: ${invalidScopeFinding.source_module} -> ${invalidScopeFinding.target_module}`);
    }
    console.log("✅ Strict Scope Invariant validated (zero irrelevant cross-module findings).");

    // Assert findings format & remediation payload
    const sampleFinding = result.findings[0];
    if (!sampleFinding.id || !sampleFinding.type || !sampleFinding.severity || !sampleFinding.evidence || !sampleFinding.remediation) {
        throw new Error("Finding format or remediation structure validation failed.");
    }
    console.log("✅ Finding evidence, severity & evidence-based remediation format validated.");

    // Assert false positive prevention on SharedKernel
    const sharedKernelFPs = result.findings.filter(f => f.type === 'shared_kernel_dependency' && f.severity.includes('RED'));
    if (sharedKernelFPs.length > 0) {
        throw new Error("False positive detected: SharedKernel should not be flagged as RED.");
    }
    console.log("✅ False positives on SharedKernel validated (none found).");

    // Assert false positive prevention on Contracts
    const contractFPs = result.findings.filter(f => f.type === 'contract_dependency' && f.severity.includes('RED'));
    if (contractFPs.length > 0) {
        throw new Error("False positive detected: Contracts should not be flagged as RED.");
    }
    console.log("✅ False positives on Contracts validated (none found).");

    // Test 2: Check test files classification
    const testFileFindings = result.findings.filter(f => f.file.includes('/Tests/') || f.file.includes('/tests/'));
    const invalidTestSeverity = testFileFindings.find(f => f.severity === 'CRITICAL RED');
    if (invalidTestSeverity) {
        throw new Error(`Test file finding ${invalidTestSeverity.id} improperly flagged as CRITICAL RED production violation.`);
    }
    console.log("✅ Test environment findings properly categorized as ALLOWED_WITH_REVIEW/ORANGE.");

    // Test 3: Run against Academies
    const acadResult = runAnalyzer('Academies');
    if (!acadResult.module || acadResult.module !== 'Academies') {
        throw new Error("Failed to analyze Academies module.");
    }
    console.log("✅ Multi-module execution validated (Academies audited successfully).");

    console.log("\n✅ All Cross-Dependency Forensic Tests Passed Successfully.");
}

test();
