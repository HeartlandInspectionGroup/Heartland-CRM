/**
 * Unit tests for HEA-131: Wisconsin SPS 131 report metadata in footer
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');

describe('HEA-131 — Report footer metadata elements', () => {
  it('has footerPreparedBy element', () => {
    expect(reportHtml).toContain('id="footerPreparedBy"');
  });

  it('has footerPrepDate element', () => {
    expect(reportHtml).toContain('id="footerPrepDate"');
  });

  it('has footerRevDate element hidden by default', () => {
    expect(reportHtml).toContain('id="footerRevDate"');
    expect(reportHtml).toMatch(/id="footerRevDate"[^>]*style="display:none;"/);
  });
});

describe('HEA-131 — populateFooterMeta function', () => {
  it('defines populateFooterMeta function', () => {
    expect(reportHtml).toContain('function populateFooterMeta(record, narratives)');
  });

  it('renders inspector_name in footerPreparedBy', () => {
    expect(reportHtml).toContain("'Report Prepared By: ' + record.inspector_name");
  });

  it('derives preparation date from max approved_at in narratives', () => {
    expect(reportHtml).toContain('n.approved_at');
    expect(reportHtml).toContain("'Report Preparation Date: '");
  });

  it('falls back to updated_at then created_at when no narratives', () => {
    expect(reportHtml).toContain('record.updated_at || record.created_at');
  });

  it('only shows revision date when report_revised_at is set', () => {
    expect(reportHtml).toContain('record.report_revised_at');
    expect(reportHtml).toContain("'Report Revision Date: '");
    // When not set, hides the element
    expect(reportHtml).toContain("revDate.style.display = 'none'");
  });
});

describe('HEA-131 — populateFooterMeta called from both render paths', () => {
  it('V2 renderV2Report calls populateFooterMeta with narratives', () => {
    var v2Idx = reportHtml.indexOf('function renderV2Report(r)');
    var v2End = reportHtml.indexOf('\nfunction ', v2Idx + 1);
    var v2Block = reportHtml.substring(v2Idx, v2End);
    expect(v2Block).toContain('populateFooterMeta(r, v2Data.narratives)');
  });

  it('V1 renderReport calls populateFooterMeta with null narratives', () => {
    var v1Idx = reportHtml.indexOf('function renderReport(r)');
    var v1End = reportHtml.indexOf('\n// ── V2', v1Idx);
    var v1Block = reportHtml.substring(v1Idx, v1End);
    expect(v1Block).toContain('populateFooterMeta(r, null)');
  });
});
