/**
 * Unit tests for HEA-231: NC pricing key consistency
 *
 * Verifies that:
 * - admin.html save payload uses is_bundle (snake_case) and includes[]
 * - agent-portal.html reads is_bundle (not isBundle)
 * - inspector-wizard-iwb.js reads is_bundle (not isBundle)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var adminSrc = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var settingsSrc = readFileSync(resolve(__dirname, '../../scripts/admin-settings.js'), 'utf8');
var agentSrc = readFileSync(resolve(__dirname, '../../agent-portal.html'), 'utf8');
var iwbSrc   = readFileSync(resolve(__dirname, '../../scripts/inspector-wizard-iwb.js'), 'utf8');

// ── Admin save payload ───────────────────────────────────────────────────

describe('HEA-231 — admin.html NC save payload', () => {
  it('newConstructionItems mapping includes is_bundle (snake_case)', () => {
    // saveConfig moved to admin-settings.js (HEA-238)
    var ncLine = settingsSrc.split('\n').find(function(l) {
      return l.indexOf('newConstructionItems') > -1 && l.indexOf('.map(') > -1;
    });
    expect(ncLine).toBeTruthy();
    expect(ncLine).toContain('is_bundle');
    expect(ncLine).not.toContain('isBundle');
  });

  it('newConstructionItems mapping includes includes array', () => {
    var ncLine = settingsSrc.split('\n').find(function(l) {
      return l.indexOf('newConstructionItems') > -1 && l.indexOf('.map(') > -1;
    });
    expect(ncLine).toBeTruthy();
    expect(ncLine).toContain('includes:');
  });

  it('no camelCase isBundle anywhere in admin NC save', () => {
    // Search the entire save function area for isBundle
    var saveIdx = adminSrc.indexOf('newConstructionItems:');
    var saveLine = adminSrc.substring(saveIdx, adminSrc.indexOf('\n', saveIdx));
    expect(saveLine).not.toContain('isBundle');
  });
});

// ── Agent portal NC panel ────────────────────────────────────────────────

describe('HEA-231 — agent-portal.html NC panel reads is_bundle', () => {
  it('apwBuildNCPanel uses is_bundle for phase filter', () => {
    var fnIdx = agentSrc.indexOf('function apwBuildNCPanel()');
    expect(fnIdx).toBeGreaterThan(-1);
    var fnBlock = agentSrc.substring(fnIdx, fnIdx + 1200);
    expect(fnBlock).toContain('it.is_bundle');
    expect(fnBlock).not.toContain('it.isBundle');
  });

  it('bundle synthetic object uses is_bundle key', () => {
    var fnIdx = agentSrc.indexOf('function apwBuildNCPanel()');
    var fnBlock = agentSrc.substring(fnIdx, fnIdx + 1200);
    expect(fnBlock).toContain('is_bundle:true');
    expect(fnBlock).not.toContain('isBundle:true');
  });

  it('no camelCase isBundle anywhere in agent-portal.html', () => {
    expect(agentSrc).not.toContain('isBundle');
  });
});

// ── IWB NC panel ─────────────────────────────────────────────────────────

describe('HEA-231 — inspector-wizard-iwb.js NC panel reads is_bundle', () => {
  it('iwbBuildNCPanel uses is_bundle for phase filter', () => {
    var fnIdx = iwbSrc.indexOf('function iwbBuildNCPanel()');
    expect(fnIdx).toBeGreaterThan(-1);
    var fnBlock = iwbSrc.substring(fnIdx, fnIdx + 1200);
    expect(fnBlock).toContain('it.is_bundle');
    expect(fnBlock).not.toContain('it.isBundle');
  });

  it('bundle synthetic object uses is_bundle key', () => {
    var fnIdx = iwbSrc.indexOf('function iwbBuildNCPanel()');
    var fnBlock = iwbSrc.substring(fnIdx, fnIdx + 1200);
    expect(fnBlock).toContain('is_bundle: true');
    expect(fnBlock).not.toContain('isBundle: true');
  });

  it('no camelCase isBundle anywhere in iwb script', () => {
    expect(iwbSrc).not.toContain('isBundle');
  });
});
