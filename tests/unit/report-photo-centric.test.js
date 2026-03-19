/**
 * Unit tests for HEA-161: Photo-centric report layout
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');

describe('HEA-161 — Photo-centric detection', () => {
  it('detects photo-centric mode via photoFindings length', () => {
    expect(reportHtml).toContain('v2Data.photoFindings.length > 0');
  });

  it('calls renderPhotoCentricReport for photo-centric inspections', () => {
    expect(reportHtml).toContain('renderPhotoCentricReport(data.report)');
  });

  it('falls back to renderV2Report for old V2 inspections', () => {
    expect(reportHtml).toContain('renderV2Report(data.report)');
  });

  it('falls back to renderReport for V1 inspections', () => {
    expect(reportHtml).toContain('renderReport(data.report)');
  });
});

describe('HEA-161 — sectionComments loaded', () => {
  it('assigns v2Data.sectionComments from response', () => {
    expect(reportHtml).toContain('v2Data.sectionComments = data.v2_section_comments');
  });
});

describe('HEA-161 — renderPhotoCentricReport function', () => {
  it('defines renderPhotoCentricReport', () => {
    expect(reportHtml).toContain('function renderPhotoCentricReport(r)');
  });

  it('calls buildSeverityRankedBlock', () => {
    expect(reportHtml).toContain('buildSeverityRankedBlock()');
  });

  it('calls buildPhotoCentricSectionCard', () => {
    expect(reportHtml).toContain('buildPhotoCentricSectionCard(sec, siteDocs, comment)');
  });

  it('skips empty sections (no site docs, no comment)', () => {
    var fnIdx = reportHtml.indexOf('function renderPhotoCentricReport');
    var fnEnd = reportHtml.indexOf('function buildSeverityRankedBlock');
    var fnBlock = reportHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('if (!siteDocs.length && !comment) return');
  });

  it('calls populateFooterMeta', () => {
    var fnIdx = reportHtml.indexOf('function renderPhotoCentricReport');
    var fnEnd = reportHtml.indexOf('function buildSeverityRankedBlock');
    var fnBlock = reportHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('populateFooterMeta');
  });
});

describe('HEA-161 — Severity-ranked findings block', () => {
  it('defines SEVERITY_ORDER', () => {
    expect(reportHtml).toContain("var SEVERITY_ORDER = {");
    expect(reportHtml).toContain("'Safety Concern': 1");
    expect(reportHtml).toContain("'Repair': 2");
    expect(reportHtml).toContain("'Replace': 3");
    expect(reportHtml).toContain("'Monitor': 4");
    expect(reportHtml).toContain("'Note': 5");
  });

  it('sorts photoFindings by severity order', () => {
    expect(reportHtml).toContain('SEVERITY_ORDER[a.severity]');
  });

  it('renders Action Required title', () => {
    expect(reportHtml).toContain('Action Required');
  });

  it('renders photo in horizontal layout', () => {
    var fnIdx = reportHtml.indexOf('function buildSeverityRankedBlock');
    var fnEnd = reportHtml.indexOf('function buildPhotoCentricSectionCard');
    var fnBlock = reportHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('pc-finding-card');
    expect(fnBlock).toContain('pc-finding-photo');
    expect(fnBlock).toContain('pc-finding-content');
  });

  it('renders severity badge, narrative, section label — no caption (HEA-174)', () => {
    var fnIdx = reportHtml.indexOf('function buildSeverityRankedBlock');
    var fnEnd = reportHtml.indexOf('function buildPhotoCentricSectionCard');
    var fnBlock = reportHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('pf.severity');
    expect(fnBlock).not.toContain('pf.caption');
    expect(fnBlock).toContain('pf.narrative');
    expect(fnBlock).toContain('secName');
  });
});

describe('HEA-161 — Section cards (comment + site docs)', () => {
  it('defines buildPhotoCentricSectionCard', () => {
    expect(reportHtml).toContain('function buildPhotoCentricSectionCard(sec, siteDocs, comment)');
  });

  it('renders section comment as intro paragraph', () => {
    var fnIdx = reportHtml.indexOf('function buildPhotoCentricSectionCard');
    var fnBlock = reportHtml.substring(fnIdx, fnIdx + 800);
    expect(fnBlock).toContain('comment');
  });

  it('renders site doc photo grid', () => {
    var fnIdx = reportHtml.indexOf('function buildPhotoCentricSectionCard');
    var fnEnd = reportHtml.indexOf('function buildV2Section');
    var fnBlock = reportHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('grid-template-columns');
    expect(fnBlock).toContain('openLightbox');
  });

  it('site docs filtered by severity IS NULL', () => {
    var fnIdx = reportHtml.indexOf('function renderPhotoCentricReport');
    var fnEnd = reportHtml.indexOf('function buildSeverityRankedBlock');
    var fnBlock = reportHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('!p.severity');
  });
});

describe('HEA-161 — Backwards compat', () => {
  it('renderV2Report function still exists', () => {
    expect(reportHtml).toContain('function renderV2Report(r)');
  });

  it('renderReport function still exists', () => {
    expect(reportHtml).toContain('function renderReport(r)');
  });

  it('buildV2Section still exists', () => {
    expect(reportHtml).toContain('function buildV2Section(sec, findings, photosByFinding)');
  });
});
