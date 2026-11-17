#!/usr/bin/env node

/**
 * 📊 Engineering Leadership Dashboard Script
 * Generates MD, HTML, and PDF-ready reports focusing on Team Adoption, 
 * Prompt Quality, and Feature Lifecycle Status.
 */

const fs = require('fs');
const path = require('path');

const SPECS_DIRS = [
    path.join(process.cwd(), '.ai', 'specs'),
    path.join(process.cwd(), 'specs')
];

const TELEMETRY_FILES = [
    path.join(process.cwd(), '.ai', 'telemetry', 'runs.jsonl'),
    path.join(process.cwd(), 'telemetry', 'runs.jsonl')
];

function normalizeStatus(st) {
    if (!st) return 'UNKNOWN';
    const s = String(st).toUpperCase().trim();
    if (s === 'HEALTHY' || s === 'APPROVED' || s === 'COMPLETED' || s === 'SUCCESS' ||
        s === 'IMPLEMENTED' || s === 'IMPLEMENTED_AND_VERIFIED' || s === 'DIRECT_EXECUTED' ||
        s === 'APPROVED_AND_EXECUTED' || s === 'RESOLVED') {
        return 'PASS';
    }
    if (s.startsWith('WAITING_') || s.startsWith('PENDING_') || s.startsWith('AWAITING_') || s.startsWith('PROPOSED')) {
        return 'AWAITING_APPROVAL';
    }
    return s;
}

function parseJsonlFile(filePath, stats, seenRuns) {
    if (!fs.existsSync(filePath)) return 0;
    let count = 0;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        for (const line of lines) {
            try {
                const entry = JSON.parse(line.trim());
                const key = entry.run_id || (entry.ts && entry.feature ? `${entry.ts}_${entry.feature}` : null);
                if (key && seenRuns && seenRuns.has(key)) continue;
                if (key && seenRuns) seenRuns.add(key);

                stats.totalTurns++;
                count++;
                if (entry.feature) stats.featuresTouched.add(entry.feature);
                if (entry.user) stats.developerUsage[entry.user] = (stats.developerUsage[entry.user] || 0) + 1;
                if (entry.mode) {
                    const modeFormatted = entry.mode.startsWith('@') ? entry.mode : `@${entry.mode}`;
                    stats.promptModes[modeFormatted] = (stats.promptModes[modeFormatted] || 0) + 1;
                }
                if (entry.status) {
                    const st = normalizeStatus(entry.status);
                    stats.outputStatus[st] = (stats.outputStatus[st] || 0) + 1;
                }
                if (entry.model) {
                    stats.modelsUsed[entry.model] = (stats.modelsUsed[entry.model] || 0) + 1;
                }
                if (entry.tokens) {
                    const input = Number(entry.tokens.input) || 0;
                    const analysis = Number(entry.tokens.analysis) || 0;
                    const output = Number(entry.tokens.output) || 0;
                    const total = Number(entry.tokens.total) || (input + analysis + output);
                    stats.totalTokens.input += input;
                    stats.totalTokens.analysis += analysis;
                    stats.totalTokens.output += output;
                    stats.totalTokens.total += total;
                }
            } catch (err) {}
        }
    } catch (e) {}
    return count;
}

// Parse CLI Arguments
const args = process.argv.slice(2);
let format = 'md'; // default
args.forEach(arg => {
    if (arg.startsWith('--format=')) format = arg.split('=')[1].toLowerCase();
});

const isHtml = format === 'html' || format === 'pdf';
const fileExt = isHtml ? 'html' : 'md';
const baseDir = path.basename(process.cwd()) === '.ai' ? process.cwd() : path.join(process.cwd(), '.ai');
const REPORT_OUTPUT = path.join(baseDir, 'reports', `LEADERSHIP_REPORT_${new Date().toISOString().split('T')[0]}.${fileExt}`);

// Utility to recursively find all executive_summary.md files
function findTraceFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findTraceFiles(filePath, fileList);
        } else if (file === 'executive_summary.md') {
            fileList.push(filePath);
        }
    }
    return fileList;
}

// Robust "Fuzzy" JSON Extractor (handles legacy broken JSON in old traces)
function extractJsonBlocks(content) {
    const blocks = [];
    
    // Pattern 1: Standard markdown json blocks ```json ... ```
    const stdRegex = new RegExp(`\`\`\`json(?:\\s+.*?\\s*)?\\n([\\s\\S]*?)\`\`\``, 'g');
    let match;
    while ((match = stdRegex.exec(content)) !== null) blocks.push(match[1]);

    // Pattern 2: Legacy broken blocks `json ... `
    const legacyRegex = new RegExp(`\`json\\s*\\n([\\s\\S]*?)\\n\``, 'g');
    while ((match = legacyRegex.exec(content)) !== null) blocks.push(match[1]);

    const results = {};
    for (let block of blocks) {
        let parsed = null;
        try {
            parsed = JSON.parse(block);
        } catch (e) {
            // Fuzzy fix: Replace \ with " and attempt parse again
            try {
                const fixedBlock = block.replace(/\\/g, '"').replace(/" /g, '"').replace(/: "/g, ':"');
                parsed = JSON.parse(fixedBlock);
            } catch (e2) { continue; }
        }

        if (!parsed) continue;

        if (parsed.tokens || parsed.execution_time_ms) results.usage = parsed;
        if (parsed.personas || parsed.steps) results.trace = parsed;
        if (parsed.intent || parsed.mode || parsed.feature) results.request = parsed;
        if (parsed.status && !parsed.execution_time_ms && !parsed.run_id) results.proposal = parsed;
        if (parsed.run_id || parsed.gates_passed || parsed.ac_covered) results.compact = parsed;
    }
    return results;
}

function generateReport() {
    console.log(`🔍 Scanning for AI trace and telemetry files...`);
    let traceFiles = [];
    SPECS_DIRS.forEach(dir => {
        if (fs.existsSync(dir)) traceFiles = traceFiles.concat(findTraceFiles(dir));
    });

    let stats = {
        totalTurns: 0,
        featuresTouched: new Set(),
        developerUsage: {}, // { "fotta": 40, "ali": 15 }
        personaUsage: {},
        promptModes: {},
        outputStatus: {},
        modelsUsed: {},
        totalTokens: {
            input: 0,
            analysis: 0,
            output: 0,
            total: 0
        }
    };

    const seenRuns = new Set();

    // 1. Ingest JSONL Minimal Telemetry
    let jsonlRecords = 0;
    const seenTelemetryFiles = new Set();
    TELEMETRY_FILES.forEach(filePath => {
        if (fs.existsSync(filePath) && !seenTelemetryFiles.has(filePath)) {
            seenTelemetryFiles.add(filePath);
            jsonlRecords += parseJsonlFile(filePath, stats, seenRuns);
        }
    });

    // 2. Ingest Markdown Traces (Lean or Legacy)
    traceFiles.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf8');
        const parts = filePath.split(path.sep);
        
        let developer = 'unknown';
        let feature = 'unknown';
        
        // Extract Meta from Path: specs/[YYYY-MM-DD]/[username]/[FeatureName]/...
        const specsIndex = parts.indexOf('specs') !== -1 ? parts.indexOf('specs') : parts.indexOf('.ai');
        if (specsIndex !== -1 && parts.length > specsIndex + 3) {
            developer = parts[specsIndex + 2];
            feature = parts[specsIndex + 3];
            stats.featuresTouched.add(feature);
        }

        const data = extractJsonBlocks(content);

        // Deduplication against runs.jsonl
        const runFolder = path.basename(path.dirname(filePath));
        const key = data.compact?.run_id || (data.compact?.timestamp && data.compact?.feature ? `${data.compact.timestamp}_${data.compact.feature}` : runFolder);
        if (key && seenRuns.has(key)) return;
        if (key) seenRuns.add(key);

        stats.totalTurns++;

        // Section 5 Compact Schema (v3.5.0 Lean)
        if (data.compact) {
            if (data.compact.user) {
                developer = data.compact.user;
            }
            if (data.compact.feature) {
                stats.featuresTouched.add(data.compact.feature);
            }
            if (data.compact.mode) {
                const modeFormatted = data.compact.mode.startsWith('@') ? data.compact.mode : `@${data.compact.mode}`;
                stats.promptModes[modeFormatted] = (stats.promptModes[modeFormatted] || 0) + 1;
            }
            if (data.compact.status) {
                const st = normalizeStatus(data.compact.status);
                stats.outputStatus[st] = (stats.outputStatus[st] || 0) + 1;
            }
            if (data.compact.model) {
                stats.modelsUsed[data.compact.model] = (stats.modelsUsed[data.compact.model] || 0) + 1;
            }
            if (data.compact.tokens) {
                const input = Number(data.compact.tokens.input) || 0;
                const analysis = Number(data.compact.tokens.analysis) || 0;
                const output = Number(data.compact.tokens.output) || 0;
                const total = Number(data.compact.tokens.total) || (input + analysis + output);
                stats.totalTokens.input += input;
                stats.totalTokens.analysis += analysis;
                stats.totalTokens.output += output;
                stats.totalTokens.total += total;
            }
        } else {
            // Legacy Trace Formats
            if (data.trace && data.trace.personas) {
                data.trace.personas.forEach(p => {
                    stats.personaUsage[p] = (stats.personaUsage[p] || 0) + 1;
                });
            }

            if (data.request && data.request.mode) {
                const modeMatch = data.request.mode.match(/@([a-zA-Z0-9_-]+)/);
                const mode = modeMatch ? modeMatch[0] : 'Unknown/Direct';
                stats.promptModes[mode] = (stats.promptModes[mode] || 0) + 1;
            }

            let status = 'UNKNOWN';
            if (data.proposal && data.proposal.status) status = data.proposal.status;
            else if (data.usage && data.usage.status) status = data.usage.status;
            
            if (status) {
                const st = normalizeStatus(status);
                stats.outputStatus[st] = (stats.outputStatus[st] || 0) + 1;
            }
        }

        stats.developerUsage[developer] = (stats.developerUsage[developer] || 0) + 1;
    });

    if (stats.totalTurns === 0) {
        console.log('⚠️ No trace or telemetry records found.');
        return;
    }

    const passCount = stats.outputStatus['PASS'] || 0;
    const passRate = stats.totalTurns > 0 ? ((passCount / stats.totalTurns) * 100).toFixed(1) : '100.0';

    let outputContent = '';

    if (!isHtml) {
        outputContent = `
# 📈 AI Engineering OS — Leadership Adoption Report
**Date Generated:** ${new Date().toISOString().split('T')[0]}

## 🚀 High-Level Impact
- **Total Features Accelerated:** ${stats.featuresTouched.size}
- **Total AI Interactions (Turns):** ${stats.totalTurns}
- **Gate Clearance Rate:** ${passRate}% (${passCount} of ${stats.totalTurns} turns cleared without blockers)

## 👥 Developer Leaderboard (Adoption)
${Object.entries(stats.developerUsage).sort((a, b) => b[1] - a[1]).map(([dev, count]) => `- **${dev}**: ${count} interactions`).join('\n')}

## 🗣️ Prompt Mode Habits
${Object.entries(stats.promptModes).sort((a, b) => b[1] - a[1]).map(([mode, count]) => `- **${mode}**: ${count} times`).join('\n')}

## 🔄 Output Lifecycle Status
${Object.entries(stats.outputStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => `- **${status}**: ${count}`).join('\n')}

## 🤖 AI Models & Token Analytics
${Object.keys(stats.modelsUsed).length > 0 ? Object.entries(stats.modelsUsed).sort((a, b) => b[1] - a[1]).map(([m, c]) => `- **Model (${m})**: ${c} turns`).join('\n') : '- _(No model tagged in legacy entries)_'}
- **Total Tokens Consumed:** ${stats.totalTokens.total.toLocaleString()} tokens
  - **Input Tokens (Prompts):** ${stats.totalTokens.input.toLocaleString()} tokens
  - **Analysis Tokens (Thinking / Reasoning):** ${stats.totalTokens.analysis.toLocaleString()} tokens
  - **Output Tokens (Code & Responses):** ${stats.totalTokens.output.toLocaleString()} tokens

## 🧠 Virtual Specialist Utilization
${Object.keys(stats.personaUsage).length > 0 ? Object.entries(stats.personaUsage).sort((a, b) => b[1] - a[1]).map(([p, c]) => `- **${p}**: ${c} invocations`).join('\n') : '- _(No persona breakdown in minimal JSONL mode)_'}
`;
    } else {
        const devLabels = Object.keys(stats.developerUsage);
        const devData = Object.values(stats.developerUsage);
        const modeLabels = Object.keys(stats.promptModes);
        const modeData = Object.values(stats.promptModes);
        const statusLabels = Object.keys(stats.outputStatus);
        const statusData = Object.values(stats.outputStatus);
        const personaLabels = Object.keys(stats.personaUsage);
        const personaData = Object.values(stats.personaUsage);
        
        outputContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Engineering OS - Leadership Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --accent: #38bdf8;
            --accent-glow: rgba(56, 189, 248, 0.5);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --purple: #c084fc;
            --pink: #f472b6;
        }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #020617 0%, #0f172a 100%);
            color: var(--text-main);
            margin: 0;
            padding: 40px 20px;
            min-height: 100vh;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 50px; }
        .header h1 {
            font-size: 2.5rem; font-weight: 800; margin: 0;
            background: -webkit-linear-gradient(45deg, var(--accent), var(--purple));
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .header p { color: var(--text-muted); font-size: 1.1rem; }
        
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        
        .card {
            background: var(--card-bg); backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px;
            padding: 24px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .card h3 { margin: 0 0 15px 0; font-size: 1.1rem; color: var(--text-muted); text-align: center; }
        
        .stat-highlight {
            font-size: 3rem; font-weight: 800; text-align: center; margin: 20px 0;
            background: -webkit-linear-gradient(45deg, var(--text-main), var(--accent));
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
        th { color: var(--accent); font-weight: 600; }
        tr:last-child td { border-bottom: none; }
        
        @media print {
            body { background: white; color: black; padding: 0; }
            .card { background: white; border: 1px solid #ccc; box-shadow: none; page-break-inside: avoid; }
            .header h1 { -webkit-text-fill-color: black; }
            .card h3, th, td { color: black !important; }
            .stat-highlight { -webkit-text-fill-color: black; }
        }
    </style>
</head>
<body ${format === 'pdf' ? 'onload="window.print()"' : ''}>
    <div class="container">
        <div class="header">
            <h1>Engineering Leadership Dashboard</h1>
            <p>AI Adoption, Prompt Habits, & Output Lifecycle • ${new Date().toISOString().split('T')[0]}</p>
        </div>
        
        <div class="grid-2">
            <div class="card">
                <h3>Total Features Accelerated</h3>
                <div class="stat-highlight">${stats.featuresTouched.size}</div>
            </div>
            <div class="card">
                <h3>Developer Leaderboard (AI Interactions)</h3>
                <table>
                    <tr><th>Developer</th><th>Total Turns</th></tr>
                    ${Object.entries(stats.developerUsage).sort((a, b) => b[1] - a[1]).map(([dev, count]) => `<tr><td>${dev}</td><td>${count}</td></tr>`).join('')}
                </table>
            </div>
        </div>

        <div class="grid-2">
            <div class="card">
                <h3>Total Tokens Consumed</h3>
                <div class="stat-highlight">${stats.totalTokens.total.toLocaleString()}</div>
                <table>
                    <tr><td>Input Tokens (Prompts)</td><td><strong>${stats.totalTokens.input.toLocaleString()}</strong></td></tr>
                    <tr><td>Analysis Tokens (Thinking/Reasoning)</td><td><strong>${stats.totalTokens.analysis.toLocaleString()}</strong></td></tr>
                    <tr><td>Output Tokens (Generation)</td><td><strong>${stats.totalTokens.output.toLocaleString()}</strong></td></tr>
                </table>
            </div>
            <div class="card">
                <h3>AI Models Deployed</h3>
                <table>
                    <tr><th>Model Name</th><th>Invocations</th></tr>
                    ${Object.entries(stats.modelsUsed).sort((a, b) => b[1] - a[1]).map(([m, c]) => `<tr><td>${m}</td><td>${c}</td></tr>`).join('')}
                    ${Object.keys(stats.modelsUsed).length === 0 ? '<tr><td colspan="2">No models recorded in legacy logs</td></tr>' : ''}
                </table>
            </div>
        </div>

        <div class="grid-2">
            <div class="card">
                <h3>Prompt Mode Habits</h3>
                <canvas id="modeChart"></canvas>
            </div>
            <div class="card">
                <h3>Output Lifecycle Status</h3>
                <canvas id="statusChart"></canvas>
            </div>
        </div>

        <div class="card" style="margin-top: 20px;">
            <h3>Virtual Specialist Utilization</h3>
            <canvas id="personaChart" style="max-height: 300px;"></canvas>
        </div>
    </div>

    <script>
        Chart.defaults.color = '${isHtml ? '#94a3b8' : '#000'}';
        const palette = ['#38bdf8', '#c084fc', '#f472b6', '#fb7185', '#10b981', '#fbbf24', '#818cf8'];

        // Prompt Modes Chart
        new Chart(document.getElementById('modeChart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(modeLabels)},
                datasets: [{
                    label: 'Prompt Usage',
                    data: ${JSON.stringify(modeData)},
                    backgroundColor: palette[0],
                    borderRadius: 6
                }]
            },
            options: { plugins: { legend: { display: false } } }
        });

        // Output Status Chart
        new Chart(document.getElementById('statusChart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(statusLabels)},
                datasets: [{
                    label: 'Status Count',
                    data: ${JSON.stringify(statusData)},
                    backgroundColor: palette[4],
                    borderRadius: 6
                }]
            },
            options: { plugins: { legend: { display: false } } }
        });

        // Persona Chart
        new Chart(document.getElementById('personaChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(personaLabels)},
                datasets: [{
                    data: ${JSON.stringify(personaData)},
                    backgroundColor: palette,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    </script>
</body>
</html>`;
    }

    const reportsDir = path.dirname(REPORT_OUTPUT);
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(REPORT_OUTPUT, outputContent);

    // Also persist markdown report to docs/executive/CEO_STATUS_REPORT.md
    const ceoReportPath = path.join(process.cwd(), 'docs', 'executive', 'CEO_STATUS_REPORT.md');
    const ceoDir = path.dirname(ceoReportPath);
    if (!fs.existsSync(ceoDir)) fs.mkdirSync(ceoDir, { recursive: true });
    const mdContent = !isHtml ? outputContent : `# 📈 AI Engineering OS — Leadership Adoption Report\n\nTotal Features Accelerated: ${stats.featuresTouched.size}\nTotal Turns: ${stats.totalTurns}\nPass Rate: ${passRate}%\n`;
    fs.writeFileSync(ceoReportPath, mdContent);
    
    console.log(`✅ Success! Leadership Report generated at: ${REPORT_OUTPUT}`);
    console.log(`📄 Executive Status Report: ${ceoReportPath}`);
    console.log(`📊 Mode: ${format.toUpperCase()}`);
}

generateReport();
