/**
 * Unit tests for HEA-213: Add-on Report Rendering
 *
 * Verifies report.html has addon render path, each addon type renders correct
 * structure, health score hidden, lab report button logic, and existing render
 * paths unchanged.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');

// ── Render routing ──────────────────────────────────────────────────────

describe('HEA-213 — Addon render routing', () => {
    it('checks for category=addon before photo-centric and V2 paths', () => {
        var addonIdx = reportHtml.indexOf("data.report.category === 'addon'");
        var pcIdx = reportHtml.indexOf('v2Data.photoFindings.length > 0');
        expect(addonIdx).toBeGreaterThan(-1);
        expect(pcIdx).toBeGreaterThan(-1);
        expect(addonIdx).toBeLessThan(pcIdx);
    });

    it('calls renderAddonReport for addon category', () => {
        expect(reportHtml).toContain('renderAddonReport(data.report)');
    });

    it('defines renderAddonReport function', () => {
        expect(reportHtml).toContain('function renderAddonReport(');
    });
});

// ── Each addon type has its builder ─────────────────────────────────────

describe('HEA-213 — Per-addon-type builders', () => {
    it('defines buildAddonRadon', () => {
        expect(reportHtml).toContain('function buildAddonRadon(');
    });

    it('defines buildAddonWDO', () => {
        expect(reportHtml).toContain('function buildAddonWDO(');
    });

    it('defines buildAddonSewer', () => {
        expect(reportHtml).toContain('function buildAddonSewer(');
    });

    it('defines buildAddonMold', () => {
        expect(reportHtml).toContain('function buildAddonMold(');
    });

    it('defines buildAddonThermal', () => {
        expect(reportHtml).toContain('function buildAddonThermal(');
    });

    it('defines buildAddonWater', () => {
        expect(reportHtml).toContain('function buildAddonWater(');
    });
});

// ── Tier routing logic ──────────────────────────────────────────────────

describe('HEA-213 — Tier-based routing inside renderAddonReport', () => {
    it('routes radon tier to buildAddonRadon', () => {
        expect(reportHtml).toContain("normTier === 'radon'");
        expect(reportHtml).toContain("normTier === 'radon_testing'");
    });

    it('routes wdo tier to buildAddonWDO', () => {
        expect(reportHtml).toContain("normTier === 'wdo'");
    });

    it('routes sewer_scope tier to buildAddonSewer', () => {
        expect(reportHtml).toContain("normTier === 'sewer_scope'");
    });

    it('routes mold tiers to buildAddonMold', () => {
        expect(reportHtml).toContain("normTier === 'mold'");
        expect(reportHtml).toContain("normTier === 'mold_air_sampling'");
    });

    it('routes thermal tiers to buildAddonThermal', () => {
        expect(reportHtml).toContain("normTier === 'thermal'");
        expect(reportHtml).toContain("normTier === 'thermal_imaging'");
    });

    it('routes water tiers to buildAddonWater', () => {
        expect(reportHtml).toContain("normTier === 'water'");
        expect(reportHtml).toContain("normTier === 'water_quality'");
    });
});

// ── Health score NOT shown for addon reports ─────────────────────────────

describe('HEA-213 — Health score hidden for addon reports', () => {
    it('renderAddonReport does not display scoreHero', () => {
        // Extract the renderAddonReport function body
        var fnStart = reportHtml.indexOf('function renderAddonReport(');
        var fnEnd = reportHtml.indexOf('\nfunction ', fnStart + 30);
        var fnBody = reportHtml.substring(fnStart, fnEnd);
        // Should NOT contain scoreHero.style.display = '' (which shows it)
        expect(fnBody).not.toContain("scoreHero').style.display = ''");
        expect(fnBody).not.toContain("scoreHero').style.display = \"\"");
    });

    it('V1 renderReport shows scoreHero for home_health_check', () => {
        expect(reportHtml).toContain("r.category === 'home_health_check'");
        expect(reportHtml).toContain("scoreHero').style.display = ''");
    });
});

// ── Lab report button ───────────────────────────────────────────────────

describe('HEA-213 — Lab report button', () => {
    it('shows lab report button when lab_report_url present', () => {
        expect(reportHtml).toContain('r.lab_report_url');
        expect(reportHtml).toContain('addon-report-lab-btn');
        expect(reportHtml).toContain('View Lab Report');
    });

    it('lab report link opens in new tab', () => {
        // The anchor tag with lab-btn class uses target="_blank"
        expect(reportHtml).toContain('target="_blank" rel="noopener" class="addon-report-lab-btn"');
    });

    it('lab report button only rendered conditionally', () => {
        // The lab button is gated by if (r.lab_report_url)
        expect(reportHtml).toContain('if (r.lab_report_url)');
    });
});

// ── Radon Pass/Concern badge ────────────────────────────────────────────

describe('HEA-213 — Radon threshold logic', () => {
    it('uses 4.0 pCi/L as the EPA threshold', () => {
        expect(reportHtml).toContain('numResult < 4.0');
        expect(reportHtml).toContain('EPA Action Level: 4.0 pCi/L');
    });

    it('renders pass badge for below threshold', () => {
        expect(reportHtml).toContain('Pass — Below EPA Action Level');
    });

    it('renders concern badge for at or above threshold', () => {
        expect(reportHtml).toContain('Concern — At or Above EPA Action Level');
    });
});

// ── Water parameter table ───────────────────────────────────────────────

describe('HEA-213 — Water quality parameter table', () => {
    it('renders all 6 water parameters', () => {
        expect(reportHtml).toContain("label: 'Hardness'");
        expect(reportHtml).toContain("label: 'Iron'");
        expect(reportHtml).toContain("label: 'Total Coliform'");
        expect(reportHtml).toContain("label: 'Nitrates'");
        expect(reportHtml).toContain("label: 'pH'");
        expect(reportHtml).toContain("label: 'Lead'");
    });

    it('has EPA limits for each parameter', () => {
        expect(reportHtml).toContain("limit: '250'");   // Hardness
        expect(reportHtml).toContain("limit: '0.3'");   // Iron
        expect(reportHtml).toContain("limit: 'Absent'"); // Coliform
        expect(reportHtml).toContain("limit: '10'");    // Nitrates
        expect(reportHtml).toContain("limit: '6.5–8.5'"); // pH
        expect(reportHtml).toContain("limit: '0.015'"); // Lead
    });

    it('renders table with header columns', () => {
        expect(reportHtml).toContain('addon-report-table');
        expect(reportHtml).toContain('<th>Parameter</th>');
        expect(reportHtml).toContain('<th>Result</th>');
        expect(reportHtml).toContain('<th>EPA Limit</th>');
        expect(reportHtml).toContain('<th>Status</th>');
    });

    it('shows All Pass or Parameters of Concern overall badge', () => {
        expect(reportHtml).toContain('All Parameters Pass');
        expect(reportHtml).toContain('Parameters of Concern');
    });
});

// ── Existing render paths unchanged ─────────────────────────────────────

describe('HEA-213 — No regression on existing render paths', () => {
    it('still has renderReport (V1) function', () => {
        expect(reportHtml).toContain('function renderReport(');
    });

    it('still has renderV2Report function', () => {
        expect(reportHtml).toContain('function renderV2Report(');
    });

    it('still has renderPhotoCentricReport function', () => {
        expect(reportHtml).toContain('function renderPhotoCentricReport(');
    });

    it('V1 path still called for non-V2 non-addon records', () => {
        expect(reportHtml).toContain('renderReport(data.report)');
    });

    it('V2 path still called for V2 findings', () => {
        expect(reportHtml).toContain('renderV2Report(data.report)');
    });

    it('photo-centric path still called for photo findings', () => {
        expect(reportHtml).toContain('renderPhotoCentricReport(data.report)');
    });
});

// ── CSS classes defined ─────────────────────────────────────────────────

describe('HEA-213 — CSS classes defined', () => {
    var requiredClasses = [
        'addon-report-section',
        'addon-report-section-title',
        'addon-report-row',
        'addon-report-badge-pass',
        'addon-report-badge-concern',
        'addon-report-badge-info',
        'addon-report-table',
        'addon-report-finding-card',
        'addon-report-photo-grid',
        'addon-report-lab-btn',
        'addon-report-checklist',
        'addon-report-warning',
    ];

    requiredClasses.forEach(function(cls) {
        it('defines .' + cls + ' CSS rule', () => {
            expect(reportHtml).toContain('.' + cls);
        });
    });
});

// ── Addon-specific section structure ────────────────────────────────────

describe('HEA-213 — Radon report structure', () => {
    it('has Test Setup section', () => {
        expect(reportHtml).toContain('Test Setup');
    });

    it('has Lab Results section', () => {
        expect(reportHtml).toContain('Lab Results');
    });

    it('reads device_type field', () => {
        expect(reportHtml).toContain("'device_type'");
    });
});

describe('HEA-213 — WDO report structure', () => {
    it('has Areas Inspected section', () => {
        expect(reportHtml).toContain('Areas Inspected');
    });

    it('has Findings section title', () => {
        expect(reportHtml).toContain('>Findings<');
    });

    it('shows No Evidence / Evidence Observed badges', () => {
        expect(reportHtml).toContain('no evidence');
    });
});

describe('HEA-213 — Sewer report structure', () => {
    it('has Setup section with access_point', () => {
        expect(reportHtml).toContain("'access_point'");
    });

    it('has video link', () => {
        expect(reportHtml).toContain("'video_link'");
        expect(reportHtml).toContain('View Sewer Video');
    });
});

describe('HEA-213 — Mold report structure', () => {
    it('has Site Conditions section', () => {
        expect(reportHtml).toContain('Site Conditions');
    });

    it('has Sample Collection table', () => {
        expect(reportHtml).toContain('Sample Collection');
    });
});

describe('HEA-213 — Thermal report structure', () => {
    it('has Conditions section with temp differential', () => {
        expect(reportHtml).toContain("'indoor_temp'");
        expect(reportHtml).toContain("'outdoor_temp'");
        expect(reportHtml).toContain("diff < 18");
    });

    it('shows warning when differential below 18F', () => {
        expect(reportHtml).toContain('below 18');
        expect(reportHtml).toContain('addon-report-warning');
    });

    it('has Areas Scanned checklist', () => {
        expect(reportHtml).toContain('Areas Scanned');
        expect(reportHtml).toContain("'areas_scanned'");
    });

    it('has Anomalies section', () => {
        expect(reportHtml).toContain('Anomalies');
    });
});

describe('HEA-213 — Water report structure', () => {
    it('has Sample Collection section', () => {
        expect(reportHtml).toContain("'collection_point'");
    });

    it('evaluates coliform as present/absent', () => {
        expect(reportHtml).toContain("p.key === 'coliform'");
        expect(reportHtml).toContain("'absent'");
    });

    it('evaluates pH range 6.5-8.5', () => {
        expect(reportHtml).toContain("p.key === 'ph'");
        expect(reportHtml).toContain('numVal >= 6.5');
        expect(reportHtml).toContain('numVal <= 8.5');
    });
});

// ── Bundle/Standalone badge ─────────────────────────────────────────────

describe('HEA-213 — Bundle/Standalone badge', () => {
    it('shows Bundle badge when is_bundle is present', () => {
        expect(reportHtml).toContain('Bundled Add-On');
    });

    it('shows Standalone badge when not bundled', () => {
        expect(reportHtml).toContain('Standalone');
    });

    it('checks r.is_bundle property', () => {
        expect(reportHtml).toContain('r.is_bundle');
    });
});

// ── Tier label mapping ──────────────────────────────────────────────────

describe('HEA-213 — Tier display name mapping', () => {
    it('maps radon to Radon Testing', () => {
        expect(reportHtml).toContain("'radon': 'Radon Testing'");
    });

    it('maps wdo to WDO / Termite Inspection', () => {
        expect(reportHtml).toContain("'wdo': 'WDO / Termite Inspection'");
    });

    it('maps sewer_scope to Sewer Scope Inspection', () => {
        expect(reportHtml).toContain("'sewer_scope': 'Sewer Scope Inspection'");
    });

    it('maps mold to Mold / Air Sampling', () => {
        expect(reportHtml).toContain("'mold': 'Mold / Air Sampling'");
    });

    it('maps thermal to Thermal Imaging', () => {
        expect(reportHtml).toContain("'thermal': 'Thermal Imaging'");
    });

    it('maps water to Water Quality Testing', () => {
        expect(reportHtml).toContain("'water': 'Water Quality Testing'");
    });
});

// ── Helper functions ────────────────────────────────────────────────────

describe('HEA-213 — Helper functions', () => {
    it('defines getAddonField helper', () => {
        expect(reportHtml).toContain('function getAddonField(');
    });

    it('defines getAddonRepeatable helper', () => {
        expect(reportHtml).toContain('function getAddonRepeatable(');
    });

    it('defines getAddonChecklist helper', () => {
        expect(reportHtml).toContain('function getAddonChecklist(');
    });

    it('defines getAddonPhotos helper', () => {
        expect(reportHtml).toContain('function getAddonPhotos(');
    });

    it('defines normalizeAddonTier helper', () => {
        expect(reportHtml).toContain('function normalizeAddonTier(');
    });
});
