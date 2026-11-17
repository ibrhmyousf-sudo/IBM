/**
 * GRC Operational Evidence, Freshness (SEC-171), RACI Independence,
 * Time-Bound Risk Acceptance (SEC-173) & Company-Level NCA ECC 2:2024 Validator (v4.2.1)
 *
 * Pure CommonJS, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const {
  COMPANY_ECC_SUBDOMAINS,
  evaluateControlApplicability
} = require('./controls-catalog');

const RC_BOUND_CONTROLS = new Set(['SEC-161', 'SEC-163', 'SEC-169', 'SEC-171', 'SEC-175']);
const PLACEHOLDER_EVIDENCE_REGEX = /^(?:tbd|todo|pending|none|n\/a|na|null|undefined|#|\?+|\.+|-+)$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(str) {
  if (!str || typeof str !== 'string' || !ISO_DATE_REGEX.test(str.trim())) return false;
  const d = new Date(`${str.trim()}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

function isPlaceholderEvidence(val) {
  const s = String(val == null ? '' : val).trim();
  if (!s || s.length < 3) return true;
  return PLACEHOLDER_EVIDENCE_REGEX.test(s);
}

function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .replace(/\b(?:owner|lead|officer|manager)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function inferDefaultOwnerRole(ctrl) {
  const dom = `${ctrl.phase || ''} ${ctrl.domain || ''} ${ctrl.title || ''}`.toLowerCase();
  if (/architecture|scope|classification|privacy|pdpl|retention|third-party/.test(dom)) return 'Product Owner';
  if (/hosting|cloud|network|tls|waf|ddos|backup|dr|container|k8s|siem|logging|incident|key|secret/.test(dom)) return 'DevOps';
  if (/governance|sign-off|exception|risk|closure|compliance/.test(dom)) return 'Compliance Lead';
  return 'Engineering Lead';
}

function inferDefaultEvidenceType(ctrl) {
  const dom = `${ctrl.phase || ''} ${ctrl.domain || ''} ${ctrl.title || ''}`.toLowerCase();
  if (/dast|pentest|test|retest|scan|drill|restore/.test(dom)) return 'Test output';
  if (/waf|tls|firewall|network|siem|backup|key|vault|config|secret/.test(dom)) return 'Configuration';
  if (/sign-off|approval|risk|exception|change/.test(dom)) return 'Approval';
  if (/inventory|register|log|schedule|audit/.test(dom)) return 'Record';
  return 'Document';
}

/**
 * Scaffolds <outputDir>/evidence-manifest.json and <outputDir>/company-ecc-baseline.json
 * tailored to the target repository's stack.json security_profile.
 */
function scaffoldEvidenceManifest({ targetRoot, outputDir, catalog, securityProfile, force = false }) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const manifestOutPath = path.join(outputDir, 'evidence-manifest.json');
  const companyOutPath = path.join(outputDir, 'company-ecc-baseline.json');
  const today = new Date().toISOString().slice(0, 10);

  const controls = catalog?.controls || [];
  const applicableManualOrHybrid = [];

  for (const ctrl of controls) {
    const app = evaluateControlApplicability(ctrl, securityProfile);
    if (!app.applicable) continue;
    if (ctrl.verificationMode === 'MANUAL_EVIDENCE' || ctrl.verificationMode === 'HYBRID') {
      applicableManualOrHybrid.push(ctrl);
    }
  }

  const productControls = {};
  for (const ctrl of applicableManualOrHybrid) {
    productControls[ctrl.id] = {
      status: 'Not Started',
      evidence_type: inferDefaultEvidenceType(ctrl),
      evidence_url: '',
      verified_at: '',
      applies_to_version: 'v1.0.0',
      owner_role: inferDefaultOwnerRole(ctrl),
      verified_by: 'Security Reviewer',
      notes: `${ctrl.title} — ${ctrl.passCriteria}`
    };
  }

  const projectBaseName = path.basename(targetRoot || process.cwd());
  const manifestObj = {
    $schema: '../../templates/security/evidence-manifest.schema.json',
    schema_version: '4.2.1',
    project_metadata: {
      product_name: projectBaseName,
      product_code: projectBaseName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24) || 'PRODUCT-01',
      environment: 'production',
      release_version: 'v1.0.0',
      tested_git_tag_or_commit: 'v1.0.0-rc1',
      last_major_change_date: today,
      hosting_region: securityProfile?.hosting?.cloud_hosted ? 'KSA Cloud Region (Riyadh)' : 'On-Premises KSA',
      data_classification: 'Confidential'
    },
    governance_roles: {
      executive_sponsor: { name: 'Executive Sponsor', email: 'sponsor@example.sa' },
      compliance_lead: { name: 'Compliance Lead', email: 'compliance@example.sa' },
      security_reviewer: { name: 'Independent Security Reviewer', email: 'security-review@example.sa' },
      product_owner: { name: 'Product Owner', email: 'product@example.sa' },
      engineering_lead: { name: 'Engineering Lead', email: 'eng-lead@example.sa' },
      devops_owner: { name: 'DevOps Owner', email: 'devops@example.sa' }
    },
    company_baseline_ref: './company-ecc-baseline.json',
    product_controls: productControls,
    risk_acceptances: []
  };

  let manifestWritten = false;
  if (!fs.existsSync(manifestOutPath) || force) {
    fs.writeFileSync(manifestOutPath, JSON.stringify(manifestObj, null, 2) + '\n', 'utf8');
    manifestWritten = true;
  }

  let companyWritten = false;
  const tplCompanyPath = path.resolve(__dirname, '..', '..', '..', 'templates', 'security', 'company-ecc-baseline.template.json');
  if (!fs.existsSync(companyOutPath) || force) {
    if (fs.existsSync(tplCompanyPath)) {
      fs.copyFileSync(tplCompanyPath, companyOutPath);
    } else {
      const fallbackSubdomains = {};
      for (const item of COMPANY_ECC_SUBDOMAINS) {
        const key = `ECC-${item.subdomain}`;
        fallbackSubdomains[key] = {
          title: item.title,
          status: 'Evidenced',
          accountable: item.subdomain.startsWith('1-') && ['1-1', '1-2', '1-3', '1-4'].includes(item.subdomain)
            ? 'Executive Sponsor'
            : 'Compliance Lead',
          responsible: item.ownerRole || 'Compliance Lead',
          evidence_url: `docs/grc/${key}-Attestation.pdf`,
          review_due: `${Number(today.slice(0, 4)) + 1}-${today.slice(5)}`
        };
      }
      fs.writeFileSync(companyOutPath, JSON.stringify({
        schema_version: '4.2.1',
        organization_metadata: {
          organization_name: 'InnovaDigits',
          ciso_or_compliance_owner: 'Compliance Lead',
          last_annual_review: today
        },
        subdomains: fallbackSubdomains
      }, null, 2) + '\n', 'utf8');
    }
    companyWritten = true;
  }

  return {
    manifestPath: manifestOutPath,
    companyBaselinePath: companyOutPath,
    baselinePath: companyOutPath,
    manifestWritten,
    companyWritten,
    baselineWritten: companyWritten,
    scaffoldedControlsCount: Object.keys(productControls).length,
    scaffoldedControlIds: Object.keys(productControls)
  };
}

/**
 * Evaluates an evidence-manifest.json file and its linked company-ecc-baseline.json
 * against all 5 v4.2.1 GRC Governance & Freshness rules.
 */
function evaluateEvidenceAndGovernance({ manifestPath, targetRoot, catalog, asOfDate = null }) {
  const refDate = isValidIsoDate(asOfDate) ? asOfDate.trim() : new Date().toISOString().slice(0, 10);
  const violations = [];
  const controlDecisions = new Map();
  const riskAcceptancesByControl = new Map();
  const validRiskAcceptanceFindingIds = new Set();

  const catalogById = new Map();
  for (const c of (catalog?.controls || [])) {
    catalogById.set(c.id, c);
  }

  let manifest = null;
  if (manifestPath && fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      violations.push({
        code: 'INVALID_MANIFEST_JSON',
        rule: 'INVALID_MANIFEST_JSON',
        controlId: 'GLOBAL',
        message: `Failed parsing evidence manifest JSON (${path.basename(manifestPath)}): ${e.message}`
      });
    }
  }

  const isV421Manifest = Boolean(manifest && (manifest.schema_version === '4.2.1' || manifest.product_controls || manifest.project_metadata));
  const projectMeta = manifest?.project_metadata || {};
  const govRoles = manifest?.governance_roles || manifest?.signoff_matrix || {};
  const lastMajorChangeDate = isValidIsoDate(projectMeta.last_major_change_date)
    ? projectMeta.last_major_change_date.trim()
    : null;
  const releaseVersion = String(projectMeta.release_version || '').trim();
  const testedTagOrCommit = String(projectMeta.tested_git_tag_or_commit || '').trim();

  // Check global RACI email collision between Security Reviewer and Engineering Lead / DevOps Owner
  const secReviewerEmail = String(govRoles?.security_reviewer?.email || '').trim().toLowerCase();
  const engLeadEmail = String(govRoles?.engineering_lead?.email || '').trim().toLowerCase();
  const devopsEmail = String(govRoles?.devops_owner?.email || '').trim().toLowerCase();

  let globalReviewerEmailCollision = false;
  if (
    secReviewerEmail &&
    ((engLeadEmail && secReviewerEmail === engLeadEmail) || (devopsEmail && secReviewerEmail === devopsEmail))
  ) {
    globalReviewerEmailCollision = true;
    violations.push({
      code: 'RACI_SOD_VIOLATION',
      rule: 'RACI_SOD_VIOLATION',
      controlId: 'GLOBAL',
      message: `RACI_SOD_VIOLATION: Independent Security Reviewer required (security_reviewer.email '${secReviewerEmail}' matches engineering_lead or devops_owner).`
    });
  }

  // -------------------------------------------------------------------------
  // Rule 4: Evaluate Time-Bound Risk Acceptances (SEC-173)
  // -------------------------------------------------------------------------
  const rawRiskAcceptances = Array.isArray(manifest?.risk_acceptances) ? manifest.risk_acceptances : [];
  for (const ra of rawRiskAcceptances) {
    const ctrlId = String(ra.control_id || '').trim().toUpperCase();
    const findingId = String(ra.finding_id || '').trim();
    const catCtrl = catalogById.get(ctrlId);
    const declaredSev = String(ra.severity || '').trim();
    const isCriticalSeverity = /^critical$/i.test(declaredSev) || (catCtrl && catCtrl.priority === 'Critical');
    const expiresAt = String(ra.expires_at || '').trim();
    const approvedAt = String(ra.approved_at || refDate).trim();
    const approvedBy = String(ra.approved_by || '').trim();
    const execSponsorName = String(govRoles?.executive_sponsor?.name || '').trim();
    const justification = String(ra.justification || '').trim();
    const compControls = Array.isArray(ra.compensating_controls)
      ? ra.compensating_controls.filter(s => String(s || '').trim().length > 0)
      : [];

    const reasons = [];
    if (isCriticalSeverity) {
      reasons.push('CRITICAL_RISK_ACCEPTANCE_FORBIDDEN: Critical findings/controls can never be risk-accepted (SEC-173)');
    }
    if (!isValidIsoDate(expiresAt) || expiresAt <= refDate) {
      reasons.push(`EXPIRED_RISK_ACCEPTANCE: expires_at '${expiresAt || 'missing'}' must be a valid future date after ${refDate} (SEC-173)`);
    }
    if (!justification || justification.length < 5 || compControls.length === 0) {
      reasons.push('INCOMPLETE_RISK_ACCEPTANCE: non-empty justification and compensating_controls array are required (SEC-173)');
    }
    const approvedBySponsor = /executive\s+sponsor/i.test(approvedBy)
      || (execSponsorName && approvedBy.toLowerCase().includes(execSponsorName.toLowerCase()));
    if (!approvedBySponsor) {
      reasons.push(`UNAUTHORIZED_RISK_ACCEPTANCE: approved_by ('${approvedBy || 'missing'}') must reference Executive Sponsor (SEC-173)`);
    }

    if (reasons.length > 0) {
      for (const msg of reasons) {
        const ruleCode = msg.split(':')[0];
        violations.push({
          code: ruleCode,
          rule: ruleCode,
          controlId: ctrlId || findingId || 'SEC-173',
          message: msg
        });
      }
      if (ctrlId) {
        riskAcceptancesByControl.set(ctrlId, {
          valid: false,
          status: 'Failed',
          evidence: `Rejected Risk Acceptance (${reasons[0].split(':')[0]})`,
          owner: ra.risk_owner || 'Engineering Lead',
          targetDate: expiresAt || refDate,
          notes: reasons.join('; ')
        });
      }
    } else {
      if (ctrlId) {
        riskAcceptancesByControl.set(ctrlId, {
          valid: true,
          status: 'Risk Accepted',
          evidence: `Risk Accepted until ${expiresAt} by ${approvedBy} (Ref: ${findingId || ctrlId}; Compensating: ${compControls.join(', ')})`,
          owner: ra.risk_owner || 'Product Owner',
          targetDate: expiresAt,
          approvedAt,
          notes: `RISK_ACCEPTED (SEC-173): ${justification}`
        });
      }
      if (findingId) {
        validRiskAcceptanceFindingIds.add(findingId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rules 1, 2, 3: Evaluate Product Controls
  // -------------------------------------------------------------------------
  if (manifest) {
    const productControls = manifest.product_controls || manifest.controls || {};
    for (const [ctrlId, entry] of Object.entries(productControls)) {
      if (!/^SEC-\d{3}$/.test(ctrlId) || !entry || typeof entry !== 'object') continue;

      const rawStatus = String(entry.status || 'Not Started').trim();
      const evUrl = String(entry.evidence_url !== undefined ? entry.evidence_url : (entry.evidence || '')).trim();
      const verifiedAt = String(entry.verified_at || entry.date || '').trim();
      const appliesToVersion = String(entry.applies_to_version || '').trim();
      const ownerRole = String(entry.owner_role || entry.owner || 'Engineering Lead').trim();
      const verifiedBy = String(entry.verified_by || 'Security Reviewer').trim();
      const notes = String(entry.notes || '').trim();

      if (/^passed$/i.test(rawStatus)) {
        const ctrlViolations = [];

        // Rule 1: Placeholder & Completeness Guard
        if (isPlaceholderEvidence(evUrl)) {
          ctrlViolations.push(`PLACEHOLDER_EVIDENCE: Control ${ctrlId} marked Passed with empty/placeholder evidence_url '${evUrl}'`);
        }
        if (isV421Manifest && !isValidIsoDate(verifiedAt)) {
          ctrlViolations.push(`MISSING_VERIFIED_DATE: Control ${ctrlId} marked Passed without valid YYYY-MM-DD verified_at date`);
        }

        // Rule 2: Stale Evidence (SEC-171) & RC Version Mismatch
        if (lastMajorChangeDate && isValidIsoDate(verifiedAt) && verifiedAt < lastMajorChangeDate) {
          ctrlViolations.push(`STALE_EVIDENCE: verified_at (${verifiedAt}) precedes last_major_change_date (${lastMajorChangeDate}) (SEC-171)`);
        }
        if (isV421Manifest && RC_BOUND_CONTROLS.has(ctrlId) && (releaseVersion || testedTagOrCommit)) {
          const matchesRelease = (releaseVersion && appliesToVersion === releaseVersion)
            || (testedTagOrCommit && appliesToVersion === testedTagOrCommit);
          if (!appliesToVersion || !matchesRelease) {
            ctrlViolations.push(
              `VERSION_MISMATCH: ${ctrlId} applies_to_version ('${appliesToVersion || 'empty'}') does not match release_version ('${releaseVersion}') or tested_git_tag_or_commit ('${testedTagOrCommit}') (SEC-171)`
            );
          }
        }

        // Rule 3: RACI Separation of Duties (Independence Rule)
        if (isV421Manifest) {
          if (normalizeRole(owner_roleOrFallback(entry)) === normalizeRole(verifiedBy)) {
            ctrlViolations.push(
              `RACI_SOD_VIOLATION: Independent Security Reviewer required on ${ctrlId} (owner_role '${ownerRole}' cannot self-verify as '${verifiedBy}')`
            );
          } else if (globalReviewerEmailCollision && /security\s*reviewer/i.test(verifiedBy)) {
            ctrlViolations.push(
              `RACI_SOD_VIOLATION: Independent Security Reviewer required on ${ctrlId} (reviewer email collides with engineering/devops lead)`
            );
          }
        }

        if (ctrlViolations.length > 0) {
          for (const msg of ctrlViolations) {
            const ruleCode = msg.split(':')[0];
            violations.push({
              code: ruleCode,
              rule: ruleCode,
              controlId: ctrlId,
              message: msg
            });
          }
          controlDecisions.set(ctrlId, {
            status: 'Failed',
            evidence: evUrl || 'Invalid/Rejected Evidence',
            owner: ownerRole,
            targetDate: verifiedAt || refDate,
            notes: ctrlViolations.join(' | '),
            governanceFailed: true
          });
        } else {
          controlDecisions.set(ctrlId, {
            status: 'Passed',
            evidence: evUrl,
            owner: ownerRole,
            targetDate: verifiedAt || refDate,
            notes: notes || 'Verified via GRC evidence manifest.',
            governanceFailed: false
          });
        }
      } else if (/^in[_ ]progress$/i.test(rawStatus)) {
        controlDecisions.set(ctrlId, {
          status: 'In Progress',
          evidence: isPlaceholderEvidence(evUrl) ? 'Evidence collection in progress' : evUrl,
          owner: ownerRole,
          targetDate: verifiedAt || refDate,
          notes: notes || 'Operational control in progress.',
          governanceFailed: false
        });
      } else if (/^failed$/i.test(rawStatus)) {
        controlDecisions.set(ctrlId, {
          status: 'Failed',
          evidence: evUrl || 'Explicitly marked Failed in evidence manifest',
          owner: ownerRole,
          targetDate: verifiedAt || refDate,
          notes: notes || 'Control marked Failed in evidence manifest.',
          governanceFailed: true
        });
      } else {
        controlDecisions.set(ctrlId, {
          status: 'Not Started',
          evidence: 'Attach operational/GRC evidence in evidence-manifest.json',
          owner: ownerRole,
          targetDate: refDate,
          notes: notes || 'Not Started — awaiting operational evidence.',
          governanceFailed: false
        });
      }
    }
  }

  // Apply Risk Acceptance overrides (valid -> "Risk Accepted"; invalid -> "Failed")
  for (const [ctrlId, raDecision] of riskAcceptancesByControl.entries()) {
    if (raDecision.valid) {
      const existing = controlDecisions.get(ctrlId);
      // Only apply Risk Accepted when control is not already cleanly Passed
      if (!existing || existing.status !== 'Passed') {
        controlDecisions.set(ctrlId, {
          status: 'Risk Accepted',
          evidence: raDecision.evidence,
          owner: raDecision.owner,
          targetDate: raDecision.targetDate,
          notes: raDecision.notes,
          governanceFailed: false,
          riskAccepted: true
        });
      }
    } else {
      controlDecisions.set(ctrlId, {
        status: 'Failed',
        evidence: raDecision.evidence,
        owner: raDecision.owner,
        targetDate: raDecision.targetDate,
        notes: raDecision.notes,
        governanceFailed: true
      });
    }
  }

  // Legacy defaultManualEvidence fallback (used by v4.2.0 quick test harness when product_controls does not list a control)
  const legacyDefault = manifest?.defaultManualEvidence || manifest?.controls?.['*'] || null;

  // -------------------------------------------------------------------------
  // Rule 5: Company-Level NCA ECC 2:2024 Tracker Resolution (11 Subdomains)
  // -------------------------------------------------------------------------
  let companyBaselinePath = null;
  if (manifestPath && manifest?.company_baseline_ref) {
    companyBaselinePath = path.resolve(path.dirname(manifestPath), manifest.company_baseline_ref);
  } else if (manifestPath) {
    const sibling = path.join(path.dirname(manifestPath), 'company-ecc-baseline.json');
    if (fs.existsSync(sibling)) companyBaselinePath = sibling;
  } else if (targetRoot) {
    const defaultCompany = path.join(targetRoot, 'docs', 'security', 'company-ecc-baseline.json');
    if (fs.existsSync(defaultCompany)) companyBaselinePath = defaultCompany;
  }

  let companyBaseline = null;
  if (companyBaselinePath && fs.existsSync(companyBaselinePath)) {
    try {
      companyBaseline = JSON.parse(fs.readFileSync(companyBaselinePath, 'utf8'));
    } catch { /* ignore malformed baseline */ }
  }

  let evidencedCount = 0;
  let pendingCount = 0;
  let expiredCount = 0;
  const companyRows = [];

  for (const item of COMPANY_ECC_SUBDOMAINS) {
    const eccKey = `ECC-${item.subdomain}`;
    const subEntry = companyBaseline?.subdomains?.[eccKey]
      || companyBaseline?.subdomains?.[item.subdomain]
      || manifest?.companyEcc?.[item.subdomain]
      || null;

    const defaultAccountable = ['1-1', '1-2', '1-3', '1-4'].includes(item.subdomain)
      ? 'Executive Sponsor'
      : 'Compliance Lead';

    if (!subEntry) {
      pendingCount++;
      companyRows.push({
        key: eccKey,
        subdomain: item.subdomain,
        title: item.title,
        accountable: defaultAccountable,
        responsible: item.ownerRole,
        evidenceUrl: item.scopeNote,
        reviewDue: '-',
        status: companyBaseline ? 'Pending' : 'Enterprise GRC Managed'
      });
      continue;
    }

    const evUrl = String(subEntry.evidence_url || subEntry.evidence || '').trim();
    const reviewDue = String(subEntry.review_due || '').trim();
    const rawSt = String(subEntry.status || 'Pending').trim();
    const hasValidEvidence = !isPlaceholderEvidence(evUrl);
    const isExpired = /^expired$/i.test(rawSt) || (isValidIsoDate(reviewDue) && reviewDue < refDate);

    let resolvedStatus = 'Pending';
    if (isExpired) {
      resolvedStatus = 'Expired';
      expiredCount++;
      violations.push({
        code: 'COMPANY_ECC_EXPIRED',
        controlId: eccKey,
        message: `COMPANY_ECC_EXPIRED: ${eccKey} (${item.title}) review_due '${reviewDue}' has expired as of ${refDate}.`
      });
    } else if (hasValidEvidence && (!isValidIsoDate(reviewDue) || reviewDue >= refDate) && /^evidenced|passed$/i.test(rawSt)) {
      resolvedStatus = 'Evidenced';
      evidencedCount++;
    } else {
      resolvedStatus = 'Pending';
      pendingCount++;
    }

    companyRows.push({
      key: eccKey,
      subdomain: item.subdomain,
      title: subEntry.title || item.title,
      accountable: subEntry.accountable || defaultAccountable,
      responsible: subEntry.responsible || item.ownerRole,
      evidenceUrl: evUrl || item.scopeNote,
      reviewDue: reviewDue || '-',
      status: resolvedStatus
    });
  }

  return {
    manifestLoaded: Boolean(manifest),
    isV421Manifest,
    referenceDate: refDate,
    projectMetadata: projectMeta,
    controlDecisions,
    legacyDefaultManualEvidence: legacyDefault,
    riskAcceptancesByControl,
    validRiskAcceptanceFindingIds,
    violations,
    companyEccSummary: {
      baselineLoaded: Boolean(companyBaseline),
      baselinePath: companyBaselinePath,
      totalSubdomains: COMPANY_ECC_SUBDOMAINS.length,
      evidencedCount,
      pendingCount,
      expiredCount,
      rows: companyRows
    }
  };
}

function owner_roleOrFallback(entry) {
  return entry.owner_role || entry.owner || '';
}

module.exports = {
  RC_BOUND_CONTROLS,
  isValidIsoDate,
  isPlaceholderEvidence,
  scaffoldEvidenceManifest,
  evaluateEvidenceAndGovernance
};
