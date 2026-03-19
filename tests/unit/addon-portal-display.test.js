/**
 * Unit tests for HEA-214: Add-on portal visibility
 * Tests addon display in admin, client-portal, and agent-portal
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var getClientsSrc = readFileSync(resolve(__dirname, '../../functions/get-clients.js'), 'utf8');
var adminHtml     = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var crTabSrc      = readFileSync(resolve(__dirname, '../../scripts/admin-client-records-tab.js'), 'utf8');
var adminUtilsSrc = readFileSync(resolve(__dirname, '../../shared/admin-utils.js'), 'utf8');
var clientPortal  = readFileSync(resolve(__dirname, '../../client-portal.html'), 'utf8');
var agentPortal   = readFileSync(resolve(__dirname, '../../agent-portal.html'), 'utf8');

describe('HEA-214 — get-clients.js includes is_bundle', () => {
  it('SELECT_FIELDS contains is_bundle', () => {
    expect(getClientsSrc).toContain("'is_bundle'");
  });

  it('is_bundle appears in the SELECT_FIELDS array', () => {
    // Verify it's within the array definition, not just a random string
    var match = getClientsSrc.match(/const SELECT_FIELDS = \[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    expect(match[1]).toContain('is_bundle');
  });
});

describe('HEA-214 — admin.html addon card display', () => {
  it('defines addonTierLabel helper', () => {
    expect(adminUtilsSrc).toContain('function addonTierLabel(tier)');
  });

  it('addonTierLabel maps radon to Radon Testing', () => {
    expect(adminUtilsSrc).toContain("radon: 'Radon Testing'");
  });

  it('addonTierLabel maps wdo to WDO / Termite', () => {
    expect(adminUtilsSrc).toContain("wdo: 'WDO / Termite'");
  });

  it('addonTierLabel maps sewer_scope to Sewer Scope', () => {
    expect(adminUtilsSrc).toContain("sewer_scope: 'Sewer Scope'");
  });

  it('renders ADDON badge for category=addon records', () => {
    expect(crTabSrc).toContain("background:#8e44ad;color:#fff;\">ADD-ON</span>");
  });

  it('addon badge is conditional on isAddon', () => {
    // Two-pane refactor (HEA-248) uses tp-list-badge instead of cr-pill
    expect(crTabSrc).toContain("isAddon");
    expect(crTabSrc).toContain("background:#8e44ad;color:#fff;");
    expect(crTabSrc).toContain("ADD-ON");
  });

  it('hides Reschedule button for addon records', () => {
    expect(crTabSrc).toContain('if (!isAddon)');
    // Verify the reschedule button is inside the isAddon guard
    var rescheduleIdx = crTabSrc.indexOf('data-action="reschedule">Reschedule</button>');
    var isAddonGuardIdx = crTabSrc.lastIndexOf('if (!isAddon)', rescheduleIdx);
    expect(isAddonGuardIdx).toBeGreaterThan(-1);
    expect(rescheduleIdx - isAddonGuardIdx).toBeLessThan(200);
  });

  it('shows Bundle badge when is_bundle is true', () => {
    // HEA-237 extraction + HEA-248 two-pane refactor: bundle distinction now via
    // formatJobType in admin-utils.js (bundle_addon category), not a separate badge
    expect(adminUtilsSrc).toContain("bundle_addon");
    expect(adminUtilsSrc).toContain("Bundle Add-On");
  });

  it('shows Bundle badge distinction for addon records', () => {
    // Two-pane refactor (HEA-248) removed the Standalone badge from admin detail;
    // bundle status is now expressed via formatJobType's bundle_addon branch
    expect(adminUtilsSrc).toContain("bundle_addon");
  });

  it('uses addonTierLabel for tier display when category is addon', () => {
    expect(crTabSrc).toContain("r.category === 'addon' ? addonTierLabel(r.tier");
  });

  it('renders ADDON badge in history modal for addon records', () => {
    expect(crTabSrc).toContain("histIsAddon");
  });

  it('formatJobType returns friendly label for addon', () => {
    expect(adminUtilsSrc).toContain("if (cat === 'addon')             return 'Add-On' + (tier ? ' \\u2014 ' + addonTierLabel(tier) : '')");
  });
});

describe('HEA-214 — client-portal.html addon display', () => {
  it('defines addonTierLabel helper', () => {
    expect(clientPortal).toContain('function addonTierLabel(tier)');
  });

  it('uses addonTierLabel for addon tier display', () => {
    expect(clientPortal).toContain("r.category === 'addon' ? addonTierLabel(r.tier)");
  });

  it('shows Bundle/Standalone badge for addon records', () => {
    expect(clientPortal).toContain("r.category === 'addon' && r.is_bundle !== undefined");
  });

  it('categoryLabel maps addon to Add-On Service', () => {
    expect(clientPortal).toContain("addon:             'Add-On Service'");
  });
});

describe('HEA-214 — agent-portal.html addon display', () => {
  it('defines addonTierLabel helper', () => {
    expect(agentPortal).toContain('function addonTierLabel(tier)');
  });

  it('apcFormatJobType handles addon category', () => {
    expect(agentPortal).toContain("if (cat === 'addon')");
    expect(agentPortal).toContain("addonTierLabel(tier) + ' (Add-On)'");
  });

  it('shows ADDON badge for addon records in scheduled cards', () => {
    expect(agentPortal).toContain("isAddon ? '<span class=\"apcs-badge\" style=\"background:#8e44ad;color:#fff;\">ADD-ON</span>'");
  });

  it('uses addonTierLabel for tier badge on addon cards', () => {
    expect(agentPortal).toContain("isAddon ? addonTierLabel(r.tier");
  });

  it('shows Bundle/Standalone badge for addon records', () => {
    expect(agentPortal).toContain("isAddon && r.is_bundle !== undefined");
  });
});
