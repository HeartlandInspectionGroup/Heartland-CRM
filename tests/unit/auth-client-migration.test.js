/**
 * Unit tests for HEA-86 Phase 2: Client-side JWT migration
 *
 * Verifies all client pages use getAuthHeader() instead of ADMIN_TOKEN
 * for function calls, and shared modules accept auth parameters.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var v2Wizard = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');
var annotationEngine = readFileSync(resolve(__dirname, '../../shared/annotation-engine.js'), 'utf8');
var iwbScript = readFileSync(resolve(__dirname, '../../scripts/inspector-wizard-iwb.js'), 'utf8');

describe('HEA-86 Phase 2 — admin.html JWT migration', () => {
  it('defines getAuthHeader helper', () => {
    expect(adminHtml).toContain('async function getAuthHeader()');
  });

  it('getAuthHeader returns Bearer token from Supabase session', () => {
    expect(adminHtml).toContain("'Authorization': 'Bearer ' + data.session.access_token");
  });

  it('getAuthHeader falls back to legacy ADMIN_TOKEN', () => {
    // The getAuthHeader function has a fallback path referencing ADMIN_TOKEN
    expect(adminHtml).toContain("return { 'x-admin-token': ADMIN_TOKEN }");
  });

  it('no x-admin-token headers in fetch calls (only in getAuthHeader fallback)', () => {
    var lines = adminHtml.split('\n');
    var fetchLines = lines.filter(function(l) {
      return l.includes("'x-admin-token'")
        && !l.includes('getAuthHeader')
        && !l.includes('// legacy fallback')
        && !l.includes('Fallback to legacy')
        && !l.includes('return {');
    });
    expect(fetchLines.length).toBe(0);
  });

  it('uses await getAuthHeader() with spread in fetch headers', () => {
    expect(adminHtml).toContain('...(await getAuthHeader())');
  });
});

describe('HEA-86 Phase 2 — inspector-wizard-v2.html JWT migration', () => {
  it('defines getAuthHeader helper', () => {
    expect(v2Wizard).toContain('async function getAuthHeader()');
  });

  it('no x-admin-token in fetch calls', () => {
    var lines = v2Wizard.split('\n');
    var fetchLines = lines.filter(function(l) {
      return l.includes("'x-admin-token'") && !l.includes('getAuthHeader') && !l.includes('ADMIN_TOKEN');
    });
    expect(fetchLines.length).toBe(0);
  });

  it('passes auth headers to AnnotationEngine.save', () => {
    expect(v2Wizard).toContain('AnnotationEngine.save(v2AnnPhotoId, await getAuthHeader())');
  });

  it('has Supabase signInWithPassword for login', () => {
    expect(v2Wizard).toContain('sb.auth.signInWithPassword');
  });
});

describe('HEA-86 Phase 2 — annotation-engine.js accepts auth parameter', () => {
  it('save function accepts authHeaders parameter', () => {
    expect(annotationEngine).toContain('function save(photoId, authHeaders)');
  });

  it('uses provided authHeaders when available', () => {
    expect(annotationEngine).toContain('authHeaders ||');
  });

  it('does not fall back to ADMIN_TOKEN (HEA-247 removed legacy fallback)', () => {
    expect(annotationEngine).not.toContain("window.ADMIN_TOKEN");
  });
});

describe('HEA-86 Phase 2 — inspector-wizard-iwb.js JWT support', () => {
  it('checks for getAuthHeader availability', () => {
    expect(iwbScript).toContain("typeof getAuthHeader === 'function'");
  });

  it('does not fall back to ADMIN_TOKEN (HEA-247 removed legacy fallback)', () => {
    expect(iwbScript).not.toContain("window.ADMIN_TOKEN");
  });

  it('uses auth headers in IWB submit fetch', () => {
    expect(iwbScript).toContain('iwbAuthHeaders');
  });
});
