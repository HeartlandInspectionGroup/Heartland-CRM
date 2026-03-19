/**
 * Unit tests for HEA-134: Critical RLS gaps fixed
 *
 * Verifies: no anon direct queries remain in client-facing pages,
 * proxy function exists, portal buttons removed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var agreementReceipt = readFileSync(resolve(__dirname, '../../agreement-receipt.html'), 'utf8');
var reportInvoice = readFileSync(resolve(__dirname, '../../report-invoice.html'), 'utf8');
var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');
var invoiceReceipt = readFileSync(resolve(__dirname, '../../invoice-receipt.html'), 'utf8');
var getRecordPublic = readFileSync(resolve(__dirname, '../../functions/get-record-public.js'), 'utf8');

describe('HEA-134 — get-record-public.js proxy function', () => {
  it('exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/get-record-public.js'))).toBe(true);
  });

  it('returns only non-PII fields', () => {
    expect(getRecordPublic).toContain('cust_name');
    expect(getRecordPublic).toContain('address');
    expect(getRecordPublic).toContain('inspection_date');
    expect(getRecordPublic).toContain('inspector_name');
    expect(getRecordPublic).toContain('category');
  });

  it('does NOT return sensitive PII fields', () => {
    // The select query should not include these
    var selectLine = getRecordPublic.match(/\.select\('([^']+)'\)/);
    expect(selectLine).not.toBeNull();
    var fields = selectLine[1];
    expect(fields).not.toContain('cust_email');
    expect(fields).not.toContain('cust_phone');
    expect(fields).not.toContain('payment_status');
    expect(fields).not.toContain('final_total');
  });

  it('uses service role Supabase client', () => {
    expect(getRecordPublic).toContain('SUPABASE_SERVICE_KEY');
  });

  it('does not require auth', () => {
    expect(getRecordPublic).not.toContain('requireAuth');
  });

  it('has CORS headers', () => {
    expect(getRecordPublic).toContain('corsHeaders');
  });
});

describe('HEA-134 — agreement-receipt.html uses proxy', () => {
  it('calls get-record-public instead of direct Supabase', () => {
    expect(agreementReceipt).toContain('get-record-public');
  });

  it('does not query inspection_records directly', () => {
    expect(agreementReceipt).not.toContain("rest/v1/inspection_records");
  });
});

describe('HEA-134 — report-invoice.html uses proxy', () => {
  it('calls get-record-public instead of direct Supabase', () => {
    expect(reportInvoice).toContain('get-record-public');
  });

  it('does not query inspection_records directly', () => {
    expect(reportInvoice).not.toContain("rest/v1/inspection_records");
  });
});

describe('HEA-134 — report.html portal button removed', () => {
  it('injectPortalButton is a no-op', () => {
    expect(reportHtml).toContain('function injectPortalButton()');
    expect(reportHtml).toContain('no-op');
  });

  it('does not query client_portal_tokens', () => {
    expect(reportHtml).not.toContain("rest/v1/client_portal_tokens");
  });
});

describe('HEA-134 — invoice-receipt.html portal button removed', () => {
  it('lookupPortalUrl returns null', () => {
    expect(invoiceReceipt).toContain('function lookupPortalUrl()');
    expect(invoiceReceipt).toContain('return Promise.resolve(null)');
  });

  it('does not query client_portal_tokens', () => {
    expect(invoiceReceipt).not.toContain("rest/v1/client_portal_tokens");
  });
});

describe('HEA-134 — no anon direct queries remain in client pages', () => {
  it('agreement-receipt has no anon Supabase headers for inspection_records', () => {
    // Should not have apikey + anon key pattern for inspection_records
    var lines = agreementReceipt.split('\n');
    var anonRecordQueries = lines.filter(function(l) {
      return l.includes("rest/v1/inspection_records") && l.includes("SUPABASE_ANON");
    });
    expect(anonRecordQueries.length).toBe(0);
  });

  it('report-invoice has no anon Supabase headers for inspection_records', () => {
    var lines = reportInvoice.split('\n');
    var anonRecordQueries = lines.filter(function(l) {
      return l.includes("rest/v1/inspection_records") && l.includes("SUPABASE_ANON");
    });
    expect(anonRecordQueries.length).toBe(0);
  });
});
