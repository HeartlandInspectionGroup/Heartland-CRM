/**
 * Unit tests for HEA-89: waiver_versions immutability, RLS, and signature log UI
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var legalSrc = readFileSync(resolve(__dirname, '../../scripts/admin-legal.js'), 'utf8');

describe('HEA-89 — Agreement Templates UI (immutability)', () => {
  it('does NOT have Delete buttons on agreement rows', () => {
    expect(adminHtml).not.toContain('data-la-delete');
  });

  it('does NOT have Edit buttons on agreement rows', () => {
    expect(adminHtml).not.toContain('data-la-edit');
  });

  it('has Archive toggle button on agreement rows', () => {
    expect(legalSrc).toContain('data-la-archive');
  });

  it('has Archive toggle function', () => {
    expect(legalSrc).toContain('function laToggleArchive');
  });

  it('archive toggle only updates is_active', () => {
    // The PATCH body should only contain is_active
    expect(legalSrc).toContain("JSON.stringify({ is_active: newActive })");
  });

  it('has immutability tooltip', () => {
    expect(adminHtml).toContain('Existing versions are locked to preserve client signature records');
  });

  it('still has View button', () => {
    expect(legalSrc).toContain('data-la-view');
  });

  it('still has New Agreement button', () => {
    expect(adminHtml).toContain('laAddWaiverBtn');
    expect(adminHtml).toContain('New Agreement');
  });
});

describe('HEA-89 — Signature Audit Log UI', () => {
  it('has View Details button in signature rows', () => {
    expect(legalSrc).toContain('data-la-sig-detail');
    expect(adminHtml).toContain('Details');
  });

  it('has View Details modal function', () => {
    expect(legalSrc).toContain('function laViewSignatureDetails');
  });

  it('details modal shows checkbox responses', () => {
    expect(legalSrc).toContain('Checkbox Responses');
    expect(legalSrc).toContain('checkbox_responses');
  });

  it('details modal shows user agent', () => {
    expect(legalSrc).toContain('User Agent');
    expect(legalSrc).toContain('user_agent');
  });

  it('details modal shows inspection record ID', () => {
    expect(legalSrc).toContain('Record ID');
    expect(legalSrc).toContain('inspection_record_id');
  });

  it('details modal shows agreement text', () => {
    expect(legalSrc).toContain('Agreement Text Signed');
    expect(legalSrc).toContain('w.body');
  });

  it('has agreement type dropdown filter', () => {
    expect(adminHtml).toContain('id="laSigAgreementFilter"');
    expect(adminHtml).toContain('All Agreements');
  });

  it('agreement filter wired to re-render', () => {
    expect(legalSrc).toContain("agrFilterEl.addEventListener('change', renderLaSigTable)");
  });

  it('renderLaSigTable reads agreement filter value', () => {
    expect(legalSrc).toContain("laSigAgreementFilter");
    expect(legalSrc).toContain("agrFilter");
  });

  it('signature table has all required columns', () => {
    // Check the thead headers
    expect(legalSrc).toContain("'Agreement'");
    expect(legalSrc).toContain("'Client'");
    expect(legalSrc).toContain("'Signed By'");
    expect(legalSrc).toContain("'Method'");
    expect(legalSrc).toContain("'Date'");
    expect(legalSrc).toContain("'IP'");
  });
});

describe('HEA-89 — laDelete function removed', () => {
  it('laDelete function still exists but is no longer called from UI', () => {
    // The function exists for backward compat but no UI button calls it
    expect(adminHtml).not.toMatch(/data-la-delete/);
  });
});
