/**
 * Unit tests for HEA-219: Narrative workflow — notification bar, header button, manual narrative
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var adminSrc = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var crTabSrc = readFileSync(resolve(__dirname, '../../scripts/admin-client-records-tab.js'), 'utf8');
var mnScriptSrc = readFileSync(resolve(__dirname, '../../scripts/admin-manual-narrative.js'), 'utf8');
var nrSrc = readFileSync(resolve(__dirname, '../../narrative-review.html'), 'utf8');

// ── 1. Narratives Needing Approval section REMOVED ─────────────────────

describe('HEA-219 — Remove Narratives Needing Approval section', () => {
  it('does not contain "Narratives Needing Approval" section HTML', () => {
    expect(adminSrc).not.toContain('Narratives Needing Approval');
  });

  it('does not contain crNarrativeList element', () => {
    expect(adminSrc).not.toContain('id="crNarrativeList"');
  });

  it('does not contain crNarrativeBody element', () => {
    expect(adminSrc).not.toContain('id="crNarrativeBody"');
  });

  it('does not contain crNarrativeChevron element', () => {
    expect(adminSrc).not.toContain('id="crNarrativeChevron"');
  });

  it('does not contain renderNarrativeSection function', () => {
    expect(adminSrc).not.toContain('function renderNarrativeSection()');
  });

  it('collapse system does not reference narrative body/chevron', () => {
    var collapseIdx = adminSrc.indexOf('function toggleCrSection');
    var collapseBlock = adminSrc.substring(collapseIdx, collapseIdx + 500);
    expect(collapseBlock).not.toContain('crNarrativeBody');
    expect(collapseBlock).not.toContain('crNarrativeChevron');
  });
});

// ── 2. Notification bar ────────────────────────────────────────────────

describe('HEA-219 — Amber notification bar', () => {
  it('has narrativeNotifBar element in HTML', () => {
    expect(adminSrc).toContain('id="narrativeNotifBar"');
  });

  it('notification bar has amber/yellow styling', () => {
    var barIdx = adminSrc.indexOf('id="narrativeNotifBar"');
    var barLine = adminSrc.substring(barIdx - 200, barIdx + 200);
    expect(barLine).toContain('rgba(243,156,18');
  });

  it('notification bar is clickable and navigates to narrative-review.html', () => {
    var barIdx = adminSrc.indexOf('id="narrativeNotifBar"');
    var barLine = adminSrc.substring(Math.max(0, barIdx - 300), barIdx + 300);
    expect(barLine).toContain('narrative-review.html');
  });

  it('notification bar is hidden by default (display:none)', () => {
    var barIdx = adminSrc.indexOf('id="narrativeNotifBar"');
    var barLine = adminSrc.substring(barIdx - 200, barIdx + 200);
    expect(barLine).toContain('display:none');
  });

  it('defines updateNarrativeBar function', () => {
    expect(crTabSrc).toContain('function updateNarrativeBar()');
  });

  it('updateNarrativeBar filters by status === narrative', () => {
    var fnIdx = crTabSrc.indexOf('function updateNarrativeBar()');
    var fnBlock = crTabSrc.substring(fnIdx, fnIdx + 400);
    expect(fnBlock).toContain("r.status === 'narrative'");
  });

  it('updateNarrativeBar hides bar when count is 0', () => {
    var fnIdx = crTabSrc.indexOf('function updateNarrativeBar()');
    var fnBlock = crTabSrc.substring(fnIdx, fnIdx + 400);
    expect(fnBlock).toContain("bar.style.display = 'none'");
  });

  it('renderCRRecords calls updateNarrativeBar', () => {
    var fnIdx = crTabSrc.indexOf('function renderCRRecords()');
    var fnBlock = crTabSrc.substring(fnIdx, fnIdx + 200);
    expect(fnBlock).toContain('updateNarrativeBar()');
  });
});

// ── 3. Narratives header button ────────────────────────────────────────

describe('HEA-219 — Narratives header button in admin', () => {
  it('has Narratives button in admin-header-actions with fp-header-btn class linking to narrative-review', () => {
    // Find the Narratives button line — it contains all three: fp-header-btn, narrative-review.html, Narratives label
    var narrBtnLine = adminSrc.split('\n').find(function(l) {
      return l.indexOf('fp-btn-label') > -1 && l.indexOf('Narratives') > -1;
    });
    expect(narrBtnLine).toBeTruthy();
    expect(narrBtnLine).toContain('fp-header-btn');
    expect(narrBtnLine).toContain('narrative-review.html');
  });
});

// ── 4. Manual Narrative REMOVED from narrative-review (HEA-222) ──────

describe('HEA-222 — Manual Narrative removed from narrative-review', () => {
  it('no Manual Narrative button in nr-header', () => {
    var headerIdx = nrSrc.indexOf('class="nr-header"');
    var headerBlock = nrSrc.substring(headerIdx, headerIdx + 500);
    expect(headerBlock).not.toContain('Manual Narrative');
  });

  it('no mnOpenModal reference in narrative-review', () => {
    expect(nrSrc).not.toContain('mnOpenModal');
  });

  it('no mnOverlay element in narrative-review', () => {
    expect(nrSrc).not.toContain('id="mnOverlay"');
  });

  it('no mn-overlay CSS in narrative-review', () => {
    expect(nrSrc).not.toContain('.mn-overlay');
  });

  it('no mnSaveUnit function in narrative-review', () => {
    expect(nrSrc).not.toContain('mnSaveUnit');
  });

  it('no insert_manual reference in narrative-review', () => {
    expect(nrSrc).not.toContain('insert_manual');
  });
});

// ── 5. Manual Narrative standalone modal in admin.html (HEA-222) ─────

describe('HEA-222 — Manual Narrative standalone in admin', () => {
  it('has Manual Narrative button in admin-header-actions', () => {
    var headerIdx = adminSrc.indexOf('class="admin-header-actions"');
    var headerBlock = adminSrc.substring(headerIdx, headerIdx + 1000);
    expect(headerBlock).toContain('Manual Narrative');
    expect(headerBlock).toContain('mnOpenModal()');
    expect(headerBlock).toContain('fp-header-btn');
  });

  it('has mnOverlay element in admin.html', () => {
    expect(adminSrc).toContain('id="mnOverlay"');
  });

  it('has modal title "Manual Narrative Generator"', () => {
    expect(adminSrc).toContain('Manual Narrative Generator');
  });

  it('has mnUnits container', () => {
    expect(adminSrc).toContain('id="mnUnits"');
  });

  it('has Add Another button', () => {
    expect(adminSrc).toContain('mnAddUnit()');
  });

  it('has Generate All button', () => {
    expect(adminSrc).toContain('id="mnGenerateBtn"');
    expect(adminSrc).toContain('mnGenerateAll()');
  });

  it('defines mnOpenModal without selectedRecordId dependency', () => {
    var fnIdx = mnScriptSrc.indexOf('function mnOpenModal()');
    expect(fnIdx).toBeGreaterThan(-1);
    var fnBlock = mnScriptSrc.substring(fnIdx, fnIdx + 300);
    expect(fnBlock).not.toContain('selectedRecordId');
  });

  it('defines mnPickPhoto with standalone Cloudinary folder', () => {
    var fnIdx = mnScriptSrc.indexOf('function mnPickPhoto(');
    expect(fnIdx).toBeGreaterThan(-1);
    var fnBlock = mnScriptSrc.substring(fnIdx, fnIdx + 800);
    expect(fnBlock).toContain('heartland/manual/standalone');
    expect(fnBlock).toContain('api.cloudinary.com');
    expect(fnBlock).toContain('slvlwkcf');
  });

  it('defines mnGenerateAll that sends findings without record_id', () => {
    var fnIdx = mnScriptSrc.indexOf('async function mnGenerateAll()');
    expect(fnIdx).toBeGreaterThan(-1);
    var fnBlock = mnScriptSrc.substring(fnIdx, fnIdx + 1500);
    expect(fnBlock).toContain('generate-narrative');
    expect(fnBlock).toContain('findings:');
    expect(fnBlock).not.toContain('record_id');
  });

  it('has Copy button instead of Save to Record', () => {
    expect(mnScriptSrc).toContain('function mnCopyUnit(');
    expect(mnScriptSrc).toContain('navigator.clipboard.writeText');
    expect(mnScriptSrc).not.toContain('mnSaveUnit');
  });

  it('has mnDiscardUnit function', () => {
    expect(mnScriptSrc).toContain('function mnDiscardUnit(');
  });

  it('does not reference save-narrative or insert_manual', () => {
    var mnIdx = adminSrc.indexOf('// ── Manual Narrative Generator');
    var mnBlock = adminSrc.substring(mnIdx, mnIdx + 5000);
    expect(mnBlock).not.toContain('save-narrative');
    expect(mnBlock).not.toContain('insert_manual');
  });
});

// ── 6. save-narrative.js — insert_manual REMOVED (HEA-222) ──────────

describe('HEA-222 — save-narrative insert_manual removed', () => {
  it('insert_manual is not a valid action', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
    expect(src).not.toContain("'insert_manual'");
  });

  it('no insert_manual handler block', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
    expect(src).not.toContain("action === 'insert_manual'");
  });

  it('insert_manual returns 400 as invalid action', async () => {
    process.env.ADMIN_TOKEN = 'test-token';
    var saveNarrative = require('../../functions/save-narrative');
    var res = await saveNarrative.handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'test-token' },
      queryStringParameters: {},
      body: JSON.stringify({ record_id: 'r1', section_id: 's1', action: 'insert_manual' }),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── 8. Existing narrative flows unchanged ──────────────────────────────

describe('HEA-219 — Existing flows preserved', () => {
  it('save-narrative still supports approve action', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
    expect(src).toContain("action === 'approve'");
  });

  it('save-narrative still supports edit action', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
    expect(src).toContain("action === 'edit'");
  });

  it('save-narrative still supports revert action', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
    expect(src).toContain("action === 'revert'");
  });

  it('save-narrative still supports approve_finding action', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
    expect(src).toContain("action === 'approve_finding'");
  });

  it('save-narrative still supports approve_photo action', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
    expect(src).toContain("action === 'approve_photo'");
  });

  it('narrative-review still has nrSelectJob function', () => {
    expect(nrSrc).toContain('window.nrSelectJob');
  });

  it('narrative-review still has nrPreview function', () => {
    expect(nrSrc).toContain('nrPreview()');
  });

  it('narrative-review still has nrSendReport function', () => {
    expect(nrSrc).toContain('nrSendReport()');
  });
});
