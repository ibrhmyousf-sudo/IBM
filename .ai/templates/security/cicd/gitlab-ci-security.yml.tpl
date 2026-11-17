# InnovaDigits AI Engineering OS v4.2.2 — GitLab CI Security & GRC Release Gates
stages:
  - security-sast-sca
  - staging-dast
  - grc-release-gate
  - production-approval

sast_and_secret_gate:
  stage: security-sast-sca
  image: node:22-alpine
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
  script:
    - node {{AI_PREFIX}}hooks/pre-commit.js
    - node {{AI_PREFIX}}bin/security-fuzzer.js --strict
{{STATIC_STACK_AUDITS_GITLAB}}    - node {{AI_PREFIX}}bin/pentest-suite.js --json > /tmp/pentest-pr-verdict.json
    - node -e 'const fs=require("fs"); const v=JSON.parse(fs.readFileSync("/tmp/pentest-pr-verdict.json","utf8")); if((v.critical_code_findings||0)>0 || (v.high_code_findings||0)>0) process.exit(1);'

sca_dependency_audit:
  stage: security-sast-sca
  image: node:22-alpine
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
  script:
{{SCA_SCRIPTS_GITLAB}}{{OPENAPI_COMPAT_JOB_GITLAB}}
staging_newman_dast:
  stage: staging-dast
  image: node:22-alpine
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
  script:
    - mkdir -p docs/security
    - node {{AI_PREFIX}}bin/build-pentest-postman.js --force
    - npx --yes newman@6.2.1 run docs/postman/pentest_abuse.postman_collection.json --env-var "base_url=${STAGING_BASE_URL}" --env-var "admin_token=${PENTEST_ADMIN_TOKEN}" --env-var "low_priv_token=${PENTEST_LOW_PRIV_TOKEN}" --env-var "foreign_tenant_token=${PENTEST_FOREIGN_TENANT_TOKEN}" --env-var "foreign_resource_id=${PENTEST_FOREIGN_RESOURCE_ID}" --reporters cli,json --reporter-json-export docs/security/newman-dast-staging-report.json --bail
  artifacts:
    when: always
    expire_in: 90 days
    paths:
      - docs/security/newman-dast-staging-report.json

grc_evidence_strict_gate:
  stage: grc-release-gate
  image: node:22-alpine
  needs:
    - staging_newman_dast
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
  script:
    - node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync("docs/security/evidence-manifest.json","utf8")); const t=String(m.tested_git_tag_or_commit||"").trim(); if(!t || (t!==process.env.CI_COMMIT_TAG && t!==process.env.CI_COMMIT_SHA)) process.exit(1);'
    - node {{AI_PREFIX}}bin/pentest-suite.js --evidence-manifest=docs/security/evidence-manifest.json --strict
    - cd docs/security && sha256sum SECURITY_DELIVERY_CHECKLIST.md SECURITY_DELIVERY_CHECKLIST.csv PENTEST_FINDINGS_REGISTER.md COMPANY_LEVEL_ECC_TRACKER.md evidence-manifest.json > SHA256SUMS.txt
  artifacts:
    when: always
    expire_in: 365 days
    paths:
      - docs/security/SECURITY_DELIVERY_CHECKLIST.md
      - docs/security/SECURITY_DELIVERY_CHECKLIST.csv
      - docs/security/PENTEST_FINDINGS_REGISTER.md
      - docs/security/COMPANY_LEVEL_ECC_TRACKER.md
      - docs/security/evidence-manifest.json
      - docs/security/SHA256SUMS.txt
{{PRODUCTION_APPROVAL_JOB_GITLAB}}

