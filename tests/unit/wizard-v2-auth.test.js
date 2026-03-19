/**
 * Unit tests for HEA-148: V2 Wizard auth hardening
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var wizardSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

describe('HEA-148 — getAuthHeader fallback fixed', () => {
  it('does NOT fall back to x-admin-token', () => {
    // The getAuthHeader function should return {} on failure, not x-admin-token
    expect(wizardSrc).not.toContain("return { 'x-admin-token': window.ADMIN_TOKEN }");
  });

  it('returns empty object when no session', () => {
    // After the try/catch, should return {}
    var fnIdx = wizardSrc.indexOf('async function getAuthHeader()');
    var fnBlock = wizardSrc.substring(fnIdx, fnIdx + 300);
    expect(fnBlock).toContain('return {}');
  });
});

describe('HEA-148 — Session keepalive', () => {
  it('defines v2CheckSession function', () => {
    expect(wizardSrc).toContain('function v2CheckSession()');
  });

  it('calls v2CheckSession on page load', () => {
    // v2CheckSession() called at top level (not just inside setInterval)
    expect(wizardSrc).toMatch(/v2CheckSession\(\);\s*\n\s*setInterval/);
  });

  it('sets 45-minute refresh interval', () => {
    expect(wizardSrc).toContain('45 * 60 * 1000');
  });

  it('shows session expired banner when no session', () => {
    expect(wizardSrc).toContain('v2SessionBanner');
    expect(wizardSrc).toContain('session has expired');
  });
});

describe('HEA-148 — Error handling in catch blocks', () => {
  it('v2SaveCard catch logs error to console', () => {
    expect(wizardSrc).toContain("console.error('v2SaveCard failed:', err)");
  });

  it('v2SaveCard catch shows actionable toast', () => {
    expect(wizardSrc).toContain('Failed to save finding — session may have expired');
  });

  it('v2QuickPass catch logs error to console', () => {
    expect(wizardSrc).toContain("console.error('v2QuickPass failed:', err)");
  });

  it('v2QuickPass catch shows actionable toast', () => {
    expect(wizardSrc).toContain('Failed to save quick pass — session may have expired');
  });
});
