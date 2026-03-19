/**
 * Unit tests for HEA-101: V2 Report Rendering
 *
 * Verifies report.html has V2 render path, summary page, disclosures from config,
 * add-on templates, V1 backward compatibility, and get-report.js returns V2 data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');
var getReportSrc = readFileSync(resolve(__dirname, '../../functions/get-report.js'), 'utf8');
var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');

// ── get-report.js — V2 data fetching ──────────────────────────────────────

describe('HEA-101 — get-report.js returns V2 data', () => {
  it('fetches inspection_findings with recommendations', () => {
    expect(getReportSrc).toContain("from('inspection_findings')");
    expect(getReportSrc).toContain('inspection_finding_recommendations');
  });

  it('fetches inspection_narratives', () => {
    expect(getReportSrc).toContain("from('inspection_narratives')");
  });

  it('fetches inspection_finding_photos', () => {
    expect(getReportSrc).toContain("from('inspection_finding_photos')");
  });

  it('fetches wizard_sections', () => {
    expect(getReportSrc).toContain("from('wizard_sections')");
  });

  it('fetches config_json for disclosures', () => {
    expect(getReportSrc).toContain("from('config_json')");
  });

  it('returns v2_findings in response', () => {
    expect(getReportSrc).toContain('v2_findings');
  });

  it('returns v2_narratives in response', () => {
    expect(getReportSrc).toContain('v2_narratives');
  });

  it('returns v2_finding_photos in response', () => {
    expect(getReportSrc).toContain('v2_finding_photos');
  });

  it('returns v2_sections in response', () => {
    expect(getReportSrc).toContain('v2_sections');
  });

  it('returns config in response', () => {
    expect(getReportSrc).toContain("config: v2.config");
  });

  it('still returns field_photos for V1 compatibility', () => {
    expect(getReportSrc).toContain('field_photos');
    expect(getReportSrc).toContain("from('field_photos')");
  });
});

// ── report.html — V2 detection and render path ────────────────────────────

describe('HEA-101 — V2 detection', () => {
  it('detects V2 by checking for inspection_findings', () => {
    expect(reportHtml).toContain('v2Data.findings.filter');
    expect(reportHtml).toContain('renderV2Report');
  });

  it('falls back to V1 renderReport when no V2 findings', () => {
    expect(reportHtml).toContain('renderReport(data.report)');
  });

  it('defines renderV2Report function', () => {
    expect(reportHtml).toContain('function renderV2Report(');
  });

  it('V1 renderReport function still exists', () => {
    expect(reportHtml).toContain('function renderReport(r)');
    expect(reportHtml).toContain('buildSection(key, fd');
  });
});

// ── Narrative render priority ─────────────────────────────────────────────

describe('HEA-101 — narrative render priority', () => {
  it('prefers custom_narrative over approved_narrative', () => {
    expect(reportHtml).toContain('narrative.custom_narrative || narrative.approved_narrative');
  });

  it('buildV2Section uses narrative from v2Data.narratives', () => {
    expect(reportHtml).toContain('v2Data.narratives[sec.id]');
  });

  it('renders narrative in a dedicated div', () => {
    expect(reportHtml).toContain('v2-narrative');
  });
});

// ── V2 Summary page ──────────────────────────────────────────────────────

describe('HEA-101 — V2 summary page', () => {
  it('has summary box element', () => {
    expect(reportHtml).toContain('id="v2SummaryBox"');
  });

  it('filters for safety, repair, replace only', () => {
    expect(reportHtml).toContain("['safety', 'repair', 'replace']");
  });

  it('excludes satisfactory and monitor from summary', () => {
    // These should NOT be in the filter array
    var filterLine = reportHtml.match(/\['safety', 'repair', 'replace'\]/);
    expect(filterLine).not.toBeNull();
    // The filter should NOT include satisfactory or monitor
    expect(filterLine[0]).not.toContain('satisfactory');
    expect(filterLine[0]).not.toContain('monitor');
  });

  it('shows section name and observation in summary', () => {
    expect(reportHtml).toContain('v2-summary-section');
    expect(reportHtml).toContain('v2-summary-obs');
  });

  it('shows recommendations in summary', () => {
    expect(reportHtml).toContain('v2-summary-recs');
  });

  it('has Action Required title', () => {
    expect(reportHtml).toContain('Action Required');
  });
});

// ── V2 Section rendering ─────────────────────────────────────────────────

describe('HEA-101 — V2 section rendering', () => {
  it('defines buildV2Section function', () => {
    expect(reportHtml).toContain('function buildV2Section(');
  });

  it('defines buildV2FindingCard function', () => {
    expect(reportHtml).toContain('function buildV2FindingCard(');
  });

  it('renders condition badges', () => {
    expect(reportHtml).toContain('v2-cond-badge');
    expect(reportHtml).toContain('v2-cond-satisfactory');
    expect(reportHtml).toContain('v2-cond-repair');
    expect(reportHtml).toContain('v2-cond-safety');
  });

  it('renders safety concern prominently', () => {
    expect(reportHtml).toContain('v2-finding-safety');
    expect(reportHtml).toContain('Safety Concern');
  });

  it('renders photos with annotated_url preference', () => {
    expect(reportHtml).toContain('p.annotated_url || p.cloudinary_url');
  });

  it('renders finding observations', () => {
    expect(reportHtml).toContain('v2-finding-obs');
    expect(reportHtml).toContain('f.observation');
  });

  it('renders finding recommendations list', () => {
    expect(reportHtml).toContain('v2-finding-recs');
    expect(reportHtml).toContain('recommendation_note');
  });
});

// ── Disclosures from config ──────────────────────────────────────────────

describe('HEA-101 — disclosures from config', () => {
  it('has reportDisclosures element ID', () => {
    expect(reportHtml).toContain('id="reportDisclosures"');
  });

  it('updates disclosure text from config', () => {
    expect(reportHtml).toContain('v2Data.config.disclosures');
    expect(reportHtml).toContain("getElementById('reportDisclosures')");
  });

  it('has hardcoded fallback text in HTML', () => {
    expect(reportHtml).toContain('Heartland Inspection Group, LLC');
    expect(reportHtml).toContain('visual, non-invasive assessment');
  });
});

// ── Radon add-on template ────────────────────────────────────────────────

describe('HEA-101 — Radon add-on template', () => {
  it('defines buildRadonSection function', () => {
    expect(reportHtml).toContain('function buildRadonSection(');
  });

  it('detects radon sections by name', () => {
    expect(reportHtml).toContain("secNameLower === 'radon'");
  });

  it('extracts numeric pCi/L value', () => {
    expect(reportHtml).toContain('pCi');
  });

  it('evaluates against 4.0 threshold', () => {
    expect(reportHtml).toContain('resultValue < 4.0');
  });

  it('shows pass/fail badge', () => {
    expect(reportHtml).toContain('v2-radon-badge-pass');
    expect(reportHtml).toContain('v2-radon-badge-fail');
    expect(reportHtml).toContain('Below Threshold');
    expect(reportHtml).toContain('Above Threshold');
  });

  it('shows EPA action level text', () => {
    expect(reportHtml).toContain('EPA Action Level: 4.0 pCi/L');
  });
});

// ── Sewer Scope add-on template ──────────────────────────────────────────

describe('HEA-101 — Sewer Scope add-on template', () => {
  it('defines buildSewerSection function', () => {
    expect(reportHtml).toContain('function buildSewerSection(');
  });

  it('detects sewer scope sections by name', () => {
    expect(reportHtml).toContain("secNameLower === 'sewer scope'");
  });

  it('embeds video from observation URL', () => {
    expect(reportHtml).toContain('v2-sewer-video');
    expect(reportHtml).toContain('<video');
  });

  it('renders finding cards for pipe segments', () => {
    expect(reportHtml).toContain('buildV2FindingCard(f, photosByFinding)');
  });
});

// ── V2 Cutover ───────────────────────────────────────────────────────────

describe('HEA-101 — V2 cutover', () => {
  it('admin nav points to inspector-wizard-v2.html', () => {
    expect(adminHtml).toContain("window.open('/inspector-wizard-v2.html'");
  });

  it('admin nav no longer points to inspector-wizard.html for wizard button', () => {
    // The main wizard button should be V2 now
    var wizardButtons = adminHtml.match(/window\.open\('\/inspector-wizard\.html'/g);
    // Should be null (no more references) or only in comments
    expect(wizardButtons).toBeNull();
  });
});

// ── V1 backward compatibility ────────────────────────────────────────────

describe('HEA-101 — V1 backward compatibility', () => {
  it('V1 SECTION_META still defined', () => {
    expect(reportHtml).toContain('const SECTION_META');
    expect(reportHtml).toContain("furnace:");
    expect(reportHtml).toContain("ac:");
  });

  it('V1 CONDITION_TEMPLATES still defined', () => {
    expect(reportHtml).toContain('const CONDITION_TEMPLATES');
  });

  it('V1 buildSection function still defined', () => {
    expect(reportHtml).toContain('function buildSection(key, fd');
  });

  it('V1 buildRoadmap function still defined', () => {
    expect(reportHtml).toContain('function buildRoadmap(');
  });

  it('V1 getPhotoArray function still defined', () => {
    expect(reportHtml).toContain('function getPhotoArray(');
  });
});
