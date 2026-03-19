/**
 * Unit tests for narrative-review.html Session 2 features (HEA-141 + per-finding update)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var reviewHtml = readFileSync(resolve(__dirname, '../../narrative-review.html'), 'utf8');
var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');
var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var crTabSrc = readFileSync(resolve(__dirname, '../../scripts/admin-client-records-tab.js'), 'utf8');

describe('HEA-141 — Approve flow (per-finding)', () => {
  it('has per-finding approve button', () => {
    expect(reviewHtml).toContain('nrApproveFinding');
    expect(reviewHtml).toContain('nr-btn-approve');
  });

  it('calls save-narrative.js via fetch', () => {
    expect(reviewHtml).toContain('save-narrative');
  });

  it('refreshes panels after approval', () => {
    expect(reviewHtml).toContain('renderPanels');
  });
});

describe('HEA-141 — Preview Report button', () => {
  it('has Preview Report button', () => {
    expect(reviewHtml).toContain('id="nrPreviewBtn"');
    expect(reviewHtml).toContain('Preview Report');
  });

  it('preview button disabled by default', () => {
    expect(reviewHtml).toMatch(/id="nrPreviewBtn"[^>]*disabled/);
  });

  it('opens report.html with preview=1 param', () => {
    expect(reviewHtml).toContain("report.html?id=' + selectedRecordId + '&preview=1");
  });
});

describe('HEA-141 — Send Report on report.html preview', () => {
  it('loads Supabase CDN', () => {
    expect(reportHtml).toContain('supabase-js');
  });

  it('checks for preview=1 URL param', () => {
    expect(reportHtml).toContain("params.get('preview')");
  });

  it('injects Send Report button', () => {
    expect(reportHtml).toContain('previewSendBtn');
    expect(reportHtml).toContain('Send Report to Client');
  });

  it('calls send-report-email.js on click', () => {
    expect(reportHtml).toContain('send-report-email');
  });
});

describe('HEA-141 — Admin summary card', () => {
  it('crNarrativeModal removed from DOM', () => {
    expect(adminHtml).not.toContain('id="crNarrativeModal"');
  });

  it('crRenderNarratives function removed', () => {
    expect(adminHtml).not.toContain('function crRenderNarratives');
  });

  it('notification bar shows count and links to narrative-review (HEA-219)', () => {
    expect(adminHtml).toContain('id="narrativeNotifBar"');
    expect(adminHtml).toContain("narrative-review.html");
  });

  it('resendCrReport gate is preserved', () => {
    expect(crTabSrc).toContain('function resendCrReport');
  });
});
