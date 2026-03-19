/**
 * Unit tests for narrative report delivery gate.
 * Updated for HEA-141 (admin modal removed) + HEA-155 (per-finding narratives).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var crTabSrc = readFileSync(resolve(__dirname, '../../scripts/admin-client-records-tab.js'), 'utf8');
var sendReportSrc = readFileSync(resolve(__dirname, '../../functions/send-report-email.js'), 'utf8');

describe('narrative report gate — admin.html', () => {
  it('wires narratives action to open narrative-review.html', () => {
    expect(crTabSrc).toContain("action === 'narratives'");
    expect(crTabSrc).toContain('openCrNarrativeModal');
    expect(crTabSrc).toContain("window.open('narrative-review.html'");
  });

  it('resendCrReport checks narrative approval before sending', () => {
    expect(crTabSrc).toContain('get-narratives?record_id=');
    expect(crTabSrc).toContain('still in Draft');
  });

  it('narrative section replaced by notification bar (HEA-219)', () => {
    expect(adminHtml).not.toContain('id="crNarrativeModal"');
    expect(adminHtml).toContain('id="narrativeNotifBar"');
    expect(adminHtml).toContain('narrative-review.html');
  });
});

describe('narrative report gate — send-report-email.js', () => {
  it('has section-level narrative pre-flight check', () => {
    expect(sendReportSrc).toContain("from('inspection_narratives')");
    expect(sendReportSrc).toContain("n.status === 'draft'");
    expect(sendReportSrc).toContain('Narratives not approved');
  });

  it('has per-finding narrative pre-flight check', () => {
    expect(sendReportSrc).toContain("from('inspection_findings')");
    expect(sendReportSrc).toContain("not('narrative', 'is', null)");
    expect(sendReportSrc).toContain('finding narrative(s) not yet approved');
  });

  it('returns 402 when narratives not approved', () => {
    expect(sendReportSrc).toContain('statusCode: 402');
  });

  it('non-fatal on check failure', () => {
    expect(sendReportSrc).toContain('Non-fatal');
  });
});
