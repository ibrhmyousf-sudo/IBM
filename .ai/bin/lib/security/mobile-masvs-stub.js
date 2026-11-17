/**
 * Tier-2 Mobile OWASP MASVS Plug-In Stub (v4.2.0)
 * Evaluates SEC-033 and SEC-098..SEC-115 cleanly:
 *   - When security_profile.surfaces.mobile_app !== true -> Not Applicable ("N/A") with written justification (0 "To Confirm").
 *   - When security_profile.surfaces.mobile_app === true -> Manual / Tier-2 Pending Verification (with basic manifest probes).
 */

const fs = require('fs');
const path = require('path');

const MOBILE_CONTROL_IDS = [
  'SEC-033',
  ...Array.from({ length: 18 }, (_, idx) => `SEC-${String(98 + idx).padStart(3, '0')}`)
];

const TIER1_NA_JUSTIFICATION =
  'Tier-1 Web/API/AI delivery profile (security_profile.surfaces.mobile_app = false); OWASP MASVS mobile binary controls deferred/not in scope.';

function evaluateMobileControls(root, securityProfile = {}) {
  const isMobileActive = securityProfile?.surfaces?.mobile_app === true;
  const results = new Map();

  if (!isMobileActive) {
    for (const id of MOBILE_CONTROL_IDS) {
      results.set(id, {
        id,
        applicable: false,
        applicability: 'Not Applicable',
        status: 'N/A',
        evidence: 'stack.json#security_profile.surfaces.mobile_app=false',
        notes: TIER1_NA_JUSTIFICATION
      });
    }
    return {
      mobileActive: false,
      totalMobileControls: MOBILE_CONTROL_IDS.length,
      controls: results
    };
  }

  // Basic AndroidManifest / Info.plist discovery when mobile_app === true
  const androidManifest = [
    path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    path.join(root, 'app', 'src', 'main', 'AndroidManifest.xml')
  ].find(p => fs.existsSync(p));

  let debuggableFailed = false;
  if (androidManifest) {
    try {
      const xml = fs.readFileSync(androidManifest, 'utf8');
      if (/android:debuggable\s*=\s*"true"/i.test(xml)) {
        debuggableFailed = true;
      }
    } catch { /* ignore */ }
  }

  for (const id of MOBILE_CONTROL_IDS) {
    if (id === 'SEC-115' && debuggableFailed) {
      results.set(id, {
        id,
        applicable: true,
        applicability: 'Applicable',
        status: 'Failed',
        evidence: path.relative(root, androidManifest).replace(/\\/g, '/'),
        notes: 'AndroidManifest.xml sets android:debuggable="true" on main manifest.'
      });
    } else {
      results.set(id, {
        id,
        applicable: true,
        applicability: 'Applicable',
        status: 'Manual / Tier-2 Pending Verification',
        evidence: 'Pending OWASP MASVS binary & dynamic mobile instrumentation evidence',
        notes: 'Mobile surface enabled (security_profile.surfaces.mobile_app = true); attach MobSF / Frida / MASVS test attestation.'
      });
    }
  }

  return {
    mobileActive: true,
    totalMobileControls: MOBILE_CONTROL_IDS.length,
    controls: results
  };
}

module.exports = {
  MOBILE_CONTROL_IDS,
  TIER1_NA_JUSTIFICATION,
  evaluateMobileControls
};

