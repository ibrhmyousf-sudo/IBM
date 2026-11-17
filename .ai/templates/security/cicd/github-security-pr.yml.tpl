name: Security PR Gate (Shift-Left SAST, SCA & API Compat)

on:
  pull_request:
    branches:
      - main
      - master
      - develop
      - 'release/**'
  workflow_dispatch:

permissions:
  contents: read
  security-events: write

concurrency:
  group: security-pr-gate-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static-security-and-secret-gate:
    name: Static Security, Secret & Boundary Gate (SEC-158, SEC-160)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Pre-commit Secret & Config Guard (SEC-160)
        run: node {{AI_PREFIX}}hooks/pre-commit.js

      - name: Static Security & IDOR Fuzzer (SEC-158)
        run: node {{AI_PREFIX}}bin/security-fuzzer.js --strict
{{STATIC_STACK_AUDITS}}
      - name: 183-Control Code-Defect Gate
        run: |
          node {{AI_PREFIX}}bin/pentest-suite.js --json > /tmp/pentest-pr-verdict.json
          node -e '
            const fs = require("fs");
            const v = JSON.parse(fs.readFileSync("/tmp/pentest-pr-verdict.json", "utf8"));
            const crit = v.critical_code_findings ?? (v.counts && v.counts.critical) ?? 0;
            const high = v.high_code_findings ?? (v.counts && v.counts.high) ?? 0;
            console.log("PR Security Code Gate -> Critical:", crit, "High:", high);
            if (crit > 0 || high > 0) process.exit(1);
          '

  sca-dependency-gate:
    name: SCA Dependency Vulnerability Gate (SEC-096, SEC-137, SEC-159)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
{{SCA_STEPS_GITHUB}}
{{OPENAPI_COMPAT_JOB_GITHUB}}

