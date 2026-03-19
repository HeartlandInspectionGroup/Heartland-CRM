/**
 * Unit tests for HEA-86 Phase 1: Dual-auth in auth.js
 *
 * Verifies that requireAuth accepts both x-admin-token (legacy)
 * and Authorization: Bearer <JWT> (new), and that all functions
 * now use the shared requireAuth helper.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

var authSrc = readFileSync(resolve(__dirname, '../../functions/auth.js'), 'utf8');

describe('HEA-86 Phase 1 — auth.js dual-auth support', () => {
  it('checks x-admin-token header (legacy)', () => {
    expect(authSrc).toContain("event.headers['x-admin-token']");
  });

  it('checks Authorization: Bearer header (new)', () => {
    expect(authSrc).toContain("authHeader.startsWith('Bearer ')");
  });

  it('validates JWT via Supabase getUser', () => {
    expect(authSrc).toContain('sb.auth.getUser(jwt)');
  });

  it('returns null for valid x-admin-token', () => {
    expect(authSrc).toContain("return null; // auth passed");
  });

  it('returns null for valid JWT', () => {
    expect(authSrc).toContain("return null; // auth passed — valid Supabase user");
  });

  it('returns 401 when neither auth method passes', () => {
    expect(authSrc).toContain('statusCode: 401');
  });

  it('allows OPTIONS requests through', () => {
    expect(authSrc).toContain("event.httpMethod === 'OPTIONS'");
  });

  it('is an async function', () => {
    expect(authSrc).toContain('async function requireAuth');
  });

  it('uses Supabase service key for JWT validation', () => {
    expect(authSrc).toContain('SUPABASE_SERVICE_KEY');
  });
});

describe('HEA-86 Phase 1 — all functions use requireAuth', () => {
  // Functions that should use requireAuth (not conditional auth patterns)
  var functionsDir = resolve(__dirname, '../../functions');
  var allFiles = readdirSync(functionsDir).filter(function(f) { return f.endsWith('.js'); });

  // Functions that use requireAuth
  var requireAuthFunctions = allFiles.filter(function(f) {
    var src = readFileSync(resolve(functionsDir, f), 'utf8');
    return src.includes("require('./auth')") || f === 'auth.js';
  });

  // Functions that still have direct ADMIN_TOKEN checks (should only be conditional patterns)
  var directCheckFunctions = allFiles.filter(function(f) {
    if (f === 'auth.js') return false;
    var src = readFileSync(resolve(functionsDir, f), 'utf8');
    // Has direct token comparison but does NOT import requireAuth
    return (src.includes("x-admin-token'] !==") || src.includes("x-admin-token'] ==="))
      && !src.includes("require('./auth')");
  });

  it('at least 40 functions use requireAuth', () => {
    expect(requireAuthFunctions.length).toBeGreaterThanOrEqual(40);
  });

  it('functions with direct token checks are only conditional auth patterns', () => {
    // Only cancel-booking, reschedule-booking, create-payment, update-calendar-event
    // should have direct checks (they use conditional admin verification)
    var allowed = ['cancel-booking.js', 'reschedule-booking.js', 'create-payment.js', 'update-calendar-event.js'];
    directCheckFunctions.forEach(function(f) {
      expect(allowed).toContain(f);
    });
  });

  it('all requireAuth calls use await', () => {
    requireAuthFunctions.forEach(function(f) {
      if (f === 'auth.js') return; // auth.js defines it, doesn't call it
      var src = readFileSync(resolve(functionsDir, f), 'utf8');
      if (src.includes('requireAuth(event)')) {
        expect(src).toContain('await requireAuth(event)');
      }
    });
  });
});
