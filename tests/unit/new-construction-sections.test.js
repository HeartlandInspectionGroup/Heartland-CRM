/**
 * Unit tests for HEA-217: New Construction tier-aware wizard sections
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var wizSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');
var builderSrc = readFileSync(resolve(__dirname, '../../wizard-builder.html'), 'utf8');

// ── V2 Wizard: Tier param logic ───────────────────────────────────────────

describe('HEA-217 — V2 Wizard tier param for new_construction', () => {
  it('passes tier param for new_construction category', () => {
    expect(wizSrc).toContain("category === 'new_construction'");
    // The tier param line should include both HHC and NC
    var tierLine = wizSrc.split('\n').find(function(l) { return l.indexOf('sectionsUrl +=') > -1 && l.indexOf('tier') > -1; });
    expect(tierLine).toBeTruthy();
    expect(tierLine).toContain('new_construction');
    expect(tierLine).toContain('home_health_check');
  });
});

// ── V2 Wizard: NC panel rendering ─────────────────────────────────────────

describe('HEA-217 — NC panel builder', () => {
  it('defines v2BuildNCPanel function', () => {
    expect(wizSrc).toContain('function v2BuildNCPanel(sec)');
  });

  it('v2RenderPanel routes new_construction to v2BuildNCPanel', () => {
    var renderIdx = wizSrc.indexOf('function v2RenderPanel()');
    var renderBlock = wizSrc.substring(renderIdx, renderIdx + 1200);
    expect(renderBlock).toContain("'new_construction'");
    expect(renderBlock).toContain('v2BuildNCPanel(sec)');
  });

  it('NC ratings include Acceptable / Concern / N/A', () => {
    var ncRatingsIdx = wizSrc.indexOf('var NC_RATINGS = [');
    var ncBlock = wizSrc.substring(ncRatingsIdx, ncRatingsIdx + 400);
    expect(ncBlock).toContain("'acceptable'");
    expect(ncBlock).toContain("'concern'");
    expect(ncBlock).toContain("'na'");
    expect(ncBlock).toContain('Acceptable');
    expect(ncBlock).toContain('Concern');
    expect(ncBlock).toContain('N/A');
  });

  it('NC panel renders checkboxes from wizard_fields', () => {
    var ncIdx = wizSrc.indexOf('function v2BuildNCPanel(sec)');
    var ncBlock = wizSrc.substring(ncIdx, ncIdx + 4000);
    expect(ncBlock).toContain('type="checkbox"');
    expect(ncBlock).toContain('v2NCToggleCheck');
    expect(ncBlock).toContain('v2Fields[sectionId]');
  });

  it('NC panel renders photo buttons', () => {
    var ncIdx = wizSrc.indexOf('function v2BuildNCPanel(sec)');
    var ncBlock = wizSrc.substring(ncIdx, ncIdx + 4000);
    expect(ncBlock).toContain('v2CamOpen');
    expect(ncBlock).toContain('Finding');
    expect(ncBlock).toContain('Site Doc');
  });

  it('NC panel renders notes textarea', () => {
    var ncIdx = wizSrc.indexOf('function v2BuildNCPanel(sec)');
    var ncBlock = wizSrc.substring(ncIdx, ncIdx + 4000);
    expect(ncBlock).toContain('v2NCSaveNote');
    expect(ncBlock).toContain('textarea');
  });
});

// ── V2 Wizard: NC event handlers ──────────────────────────────────────────

describe('HEA-217 — NC event handlers', () => {
  it('defines v2NCRate as global function', () => {
    expect(wizSrc).toContain('window.v2NCRate = async function');
  });

  it('defines v2NCToggleCheck as global function', () => {
    expect(wizSrc).toContain('window.v2NCToggleCheck = async function');
  });

  it('defines v2NCSaveNote as global function', () => {
    expect(wizSrc).toContain('window.v2NCSaveNote = async function');
  });

  it('v2NCRate checks v2IsOffline and queues to IndexedDB', () => {
    var rateIdx = wizSrc.indexOf('window.v2NCRate = async function');
    var rateBlock = wizSrc.substring(rateIdx, rateIdx + 800);
    expect(rateBlock).toContain('v2IsOffline');
    expect(rateBlock).toContain('idbPut');
    expect(rateBlock).toContain('save-finding');
  });

  it('v2NCToggleCheck checks v2IsOffline and queues to IndexedDB', () => {
    var checkIdx = wizSrc.indexOf('window.v2NCToggleCheck = async function');
    var checkBlock = wizSrc.substring(checkIdx, checkIdx + 900);
    expect(checkBlock).toContain('v2IsOffline');
    expect(checkBlock).toContain('idbPut');
    expect(checkBlock).toContain('save-field-answer');
  });

  it('v2NCSaveNote checks v2IsOffline and queues to IndexedDB', () => {
    var noteIdx = wizSrc.indexOf('window.v2NCSaveNote = async function');
    var noteBlock = wizSrc.substring(noteIdx, noteIdx + 600);
    expect(noteBlock).toContain('v2IsOffline');
    expect(noteBlock).toContain('idbPut');
    expect(noteBlock).toContain('save-finding');
  });
});

// ── V2 Wizard: NC ratings do NOT feed into Home Health Score ──────────────

describe('HEA-217 — NC has no score involvement', () => {
  it('v2CalcScore only runs for home_health_check', () => {
    var scoreIdx = wizSrc.indexOf('function v2CalcScore()');
    var scoreBlock = wizSrc.substring(scoreIdx, scoreIdx + 200);
    expect(scoreBlock).toContain("v2CurrentJob.category !== 'home_health_check'");
    expect(scoreBlock).not.toContain('new_construction');
  });

  it('v2UpdateScore only shows for home_health_check', () => {
    var updateIdx = wizSrc.indexOf('function v2UpdateScore()');
    var updateBlock = wizSrc.substring(updateIdx, updateIdx + 300);
    expect(updateBlock).toContain("v2CurrentJob.category !== 'home_health_check'");
    expect(updateBlock).not.toContain('new_construction');
  });
});

// ── V2 Wizard: NC-specific CSS ────────────────────────────────────────────

describe('HEA-217 — NC CSS classes', () => {
  it('defines active-na style for v2-fm-sev-btn', () => {
    expect(wizSrc).toContain('.v2-fm-sev-btn.active-na');
  });

  it('defines active-sat style for v2-fm-sev-btn', () => {
    expect(wizSrc).toContain('.v2-fm-sev-btn.active-sat');
  });

  it('defines active-rep style for v2-fm-sev-btn', () => {
    expect(wizSrc).toContain('.v2-fm-sev-btn.active-rep');
  });
});

// ── NC ratings constant ───────────────────────────────────────────────────

describe('HEA-217 — NC_RATINGS constant', () => {
  it('defines NC_RATINGS array with 3 entries', () => {
    expect(wizSrc).toContain('var NC_RATINGS = [');
    var ncRatingsIdx = wizSrc.indexOf('var NC_RATINGS = [');
    var ncRatingsBlock = wizSrc.substring(ncRatingsIdx, ncRatingsIdx + 300);
    expect(ncRatingsBlock).toContain("value: 'acceptable'");
    expect(ncRatingsBlock).toContain("value: 'concern'");
    expect(ncRatingsBlock).toContain("value: 'na'");
  });
});

// ── Wizard Builder: Dynamic tier filter ───────────────────────────────────

describe('HEA-217 — Wizard Builder tier filter', () => {
  it('defines WB_TIER_BUTTONS with new_construction tiers', () => {
    expect(builderSrc).toContain('WB_TIER_BUTTONS');
    var btnIdx = builderSrc.indexOf('WB_TIER_BUTTONS');
    var btnBlock = builderSrc.substring(btnIdx, btnIdx + 600);
    expect(btnBlock).toContain('new_construction');
    expect(btnBlock).toContain('pre_pour');
    expect(btnBlock).toContain('pre_drywall');
    expect(btnBlock).toContain('final_walkthrough');
  });

  it('defines wbBuildTierBar function', () => {
    expect(builderSrc).toContain('function wbBuildTierBar(filter)');
  });

  it('wbSetFilter calls wbBuildTierBar', () => {
    var filterIdx = builderSrc.indexOf('function wbSetFilter(filter, btn)');
    var filterBlock = builderSrc.substring(filterIdx, filterIdx + 400);
    expect(filterBlock).toContain('wbBuildTierBar(filter)');
  });

  it('HHC tier buttons include Standard, Premium, Signature', () => {
    var btnIdx = builderSrc.indexOf('WB_TIER_BUTTONS');
    var btnBlock = builderSrc.substring(btnIdx, btnIdx + 600);
    expect(btnBlock).toContain('Standard');
    expect(btnBlock).toContain('Premium');
    expect(btnBlock).toContain('Signature');
  });

  it('NC tier buttons include Pre-Pour, Pre-Drywall, Final Walkthrough', () => {
    var btnIdx = builderSrc.indexOf('WB_TIER_BUTTONS');
    var btnBlock = builderSrc.substring(btnIdx, btnIdx + 600);
    expect(btnBlock).toContain('Pre-Pour');
    expect(btnBlock).toContain('Pre-Drywall');
    expect(btnBlock).toContain('Final Walkthrough');
  });

  it('seed template no longer assigns NC to shared sections', () => {
    // The old pattern had cats: [HI,HHC,NC] on Electrical etc.
    // Verify Electrical line no longer has NC in its cats
    var lines = builderSrc.split('\n');
    var electricalLine = lines.find(function(l) { return l.indexOf("name: 'Electrical'") > -1; });
    expect(electricalLine).toBeTruthy();
    expect(electricalLine).not.toContain(',NC');
  });

  it('seed template no longer has Pre-Pour/Pre-Drywall/Final Walkthrough as sections', () => {
    var seedIdx = builderSrc.indexOf('wbSeedTemplate');
    var seedBlock = builderSrc.substring(seedIdx, seedIdx + 3000);
    expect(seedBlock).not.toContain("name: 'Pre-Pour'");
    expect(seedBlock).not.toContain("name: 'Pre-Drywall'");
    expect(seedBlock).not.toContain("name: 'Final Walkthrough'");
  });
});

// ── Wizard Builder: existing filter logic unchanged ───────────────────────

describe('HEA-217 — Existing tier filter logic preserved', () => {
  it('wbSetTierFilter function still exists', () => {
    expect(builderSrc).toContain('function wbSetTierFilter(tier, btn)');
  });

  it('tier_ids.includes filter logic still works', () => {
    expect(builderSrc).toContain('s.tier_ids && s.tier_ids.includes(wbTierFilter)');
  });
});
