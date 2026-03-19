/**
 * Unit tests for HEA-212 — Add-on wizard section templates
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var wizSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

// ── Tier routing and section loading ─────────────────────────────────────

describe('HEA-212 — v2InitShell passes tier for addon category', () => {
  it('includes addon in the tier condition', () => {
    expect(wizSrc).toContain("category === 'addon') && tier");
  });

  it('v2RenderPanel has isAddon branch', () => {
    var renderIdx = wizSrc.indexOf('function v2RenderPanel()');
    var renderBlock = wizSrc.substring(renderIdx, renderIdx + 1200);
    expect(renderBlock).toContain("v2CurrentJob.category === 'addon'");
    expect(renderBlock).toContain('v2BuildAddonPanel(sec)');
  });
});

describe('HEA-212 — Each addon tier loads correct sections', () => {
  it('v2BuildAddonPanel routes radon tier', () => {
    expect(wizSrc).toContain("case 'radon':");
    expect(wizSrc).toContain('v2BuildRadonSetup(sec)');
    expect(wizSrc).toContain('v2BuildRadonResults(sec)');
  });

  it('radon has 2 sections (Test Setup + Lab Results)', () => {
    expect(wizSrc).toContain('function v2BuildRadonSetup(sec)');
    expect(wizSrc).toContain('function v2BuildRadonResults(sec)');
  });

  it('v2BuildAddonPanel routes wdo tier', () => {
    expect(wizSrc).toContain("case 'wdo':");
    expect(wizSrc).toContain('v2BuildWDOAreas(sec)');
    expect(wizSrc).toContain('v2BuildWDOFindings(sec)');
  });

  it('wdo has 2 sections (Areas Inspected + Findings)', () => {
    expect(wizSrc).toContain('function v2BuildWDOAreas(sec)');
    expect(wizSrc).toContain('function v2BuildWDOFindings(sec)');
  });

  it('v2BuildAddonPanel routes sewer_scope tier', () => {
    expect(wizSrc).toContain("case 'sewer_scope':");
    expect(wizSrc).toContain('v2BuildSewerSetup(sec)');
    expect(wizSrc).toContain('v2BuildSewerFindings(sec)');
  });

  it('sewer_scope has 2 sections (Scope Setup + Findings)', () => {
    expect(wizSrc).toContain('function v2BuildSewerSetup(sec)');
    expect(wizSrc).toContain('function v2BuildSewerFindings(sec)');
  });

  it('v2BuildAddonPanel routes mold tier', () => {
    expect(wizSrc).toContain("case 'mold':");
    expect(wizSrc).toContain('v2BuildMoldConditions(sec)');
    expect(wizSrc).toContain('v2BuildMoldCollection(sec)');
    expect(wizSrc).toContain('v2BuildMoldResults(sec)');
  });

  it('mold has 3 sections (Site Conditions + Sample Collection + Lab Results)', () => {
    expect(wizSrc).toContain('function v2BuildMoldConditions(sec)');
    expect(wizSrc).toContain('function v2BuildMoldCollection(sec)');
    expect(wizSrc).toContain('function v2BuildMoldResults(sec)');
  });

  it('v2BuildAddonPanel routes thermal tier', () => {
    expect(wizSrc).toContain("case 'thermal':");
    expect(wizSrc).toContain('v2BuildThermalConditions(sec)');
    expect(wizSrc).toContain('v2BuildThermalAreas(sec)');
    expect(wizSrc).toContain('v2BuildThermalAnomalies(sec)');
  });

  it('thermal has 3 sections (Conditions + Areas Scanned + Anomalies Found)', () => {
    expect(wizSrc).toContain('function v2BuildThermalConditions(sec)');
    expect(wizSrc).toContain('function v2BuildThermalAreas(sec)');
    expect(wizSrc).toContain('function v2BuildThermalAnomalies(sec)');
  });

  it('v2BuildAddonPanel routes water tier', () => {
    expect(wizSrc).toContain("case 'water':");
    expect(wizSrc).toContain('v2BuildWaterCollection(sec)');
    expect(wizSrc).toContain('v2BuildWaterResults(sec)');
  });

  it('water has 2 sections (Sample Collection + Lab Results Panel)', () => {
    expect(wizSrc).toContain('function v2BuildWaterCollection(sec)');
    expect(wizSrc).toContain('function v2BuildWaterResults(sec)');
  });
});

describe('HEA-212 — Tier normalization handles alternate tier IDs', () => {
  it('v2NormalizeTier maps radon_testing to radon', () => {
    expect(wizSrc).toContain("if (t === 'radon_testing') return 'radon'");
  });

  it('v2NormalizeTier maps mold_air_sampling to mold', () => {
    expect(wizSrc).toContain("if (t === 'mold_air_sampling') return 'mold'");
  });

  it('v2NormalizeTier maps thermal_imaging to thermal', () => {
    expect(wizSrc).toContain("if (t === 'thermal_imaging') return 'thermal'");
  });

  it('v2NormalizeTier maps water_quality to water', () => {
    expect(wizSrc).toContain("if (t === 'water_quality') return 'water'");
  });
});

// ── Radon auto-calculation ───────────────────────────────────────────────

describe('HEA-212 — Radon result auto-determines Pass/Concern vs 4.0 pCi/L', () => {
  it('references EPA 4.0 pCi/L threshold', () => {
    expect(wizSrc).toContain('4.0 pCi/L');
  });

  it('shows Pass badge when result < 4.0', () => {
    var radonIdx = wizSrc.indexOf('function v2BuildRadonResults');
    var radonBlock = wizSrc.substring(radonIdx, radonIdx + 2000);
    expect(radonBlock).toContain('resultVal < 4.0');
    expect(radonBlock).toContain('v2-addon-badge-pass');
    expect(radonBlock).toContain('>Pass<');
  });

  it('shows Concern badge when result >= 4.0', () => {
    var radonIdx = wizSrc.indexOf('function v2BuildRadonResults');
    var radonBlock = wizSrc.substring(radonIdx, radonIdx + 2000);
    expect(radonBlock).toContain('v2-addon-badge-concern');
    expect(radonBlock).toContain('>Concern<');
  });
});

// ── Water panel auto-calculation ─────────────────────────────────────────

describe('HEA-212 — Water panel auto-calculates Pass/Concern per EPA limits', () => {
  it('defines V2_WATER_PARAMS with all 6 parameters', () => {
    expect(wizSrc).toContain('var V2_WATER_PARAMS');
    expect(wizSrc).toContain("key: 'hardness'");
    expect(wizSrc).toContain("key: 'iron'");
    expect(wizSrc).toContain("key: 'coliform'");
    expect(wizSrc).toContain("key: 'nitrates'");
    expect(wizSrc).toContain("key: 'ph'");
    expect(wizSrc).toContain("key: 'lead'");
  });

  it('iron limit is 0.3 mg/L', () => {
    var paramsIdx = wizSrc.indexOf('var V2_WATER_PARAMS');
    var paramsBlock = wizSrc.substring(paramsIdx, paramsIdx + 1200);
    expect(paramsBlock).toContain("label: 'Iron'");
    expect(paramsBlock).toContain('limit: 0.3');
  });

  it('nitrates limit is 10 mg/L', () => {
    var paramsIdx = wizSrc.indexOf('var V2_WATER_PARAMS');
    var paramsBlock = wizSrc.substring(paramsIdx, paramsIdx + 1200);
    expect(paramsBlock).toContain("label: 'Nitrates'");
    expect(paramsBlock).toContain('limit: 10');
  });

  it('pH range is 6.5–8.5', () => {
    var paramsIdx = wizSrc.indexOf('var V2_WATER_PARAMS');
    var paramsBlock = wizSrc.substring(paramsIdx, paramsIdx + 1200);
    expect(paramsBlock).toContain('limit: [6.5, 8.5]');
  });

  it('lead limit is 0.015 mg/L', () => {
    var paramsIdx = wizSrc.indexOf('var V2_WATER_PARAMS');
    var paramsBlock = wizSrc.substring(paramsIdx, paramsIdx + 1200);
    expect(paramsBlock).toContain('limit: 0.015');
  });

  it('coliform detected = concern', () => {
    var statusIdx = wizSrc.indexOf('function v2WaterParamStatus');
    var statusBlock = wizSrc.substring(statusIdx, statusIdx + 600);
    expect(statusBlock).toContain("'detected'");
    expect(statusBlock).toContain("'Detected'");
    expect(statusBlock).toContain("'concern'");
  });

  it('v2WaterParamStatus returns concern when value exceeds limit', () => {
    var statusIdx = wizSrc.indexOf('function v2WaterParamStatus');
    var statusBlock = wizSrc.substring(statusIdx, statusIdx + 600);
    expect(statusBlock).toContain('numVal >= param.limit');
    expect(statusBlock).toContain("'concern'");
    expect(statusBlock).toContain("'pass'");
  });

  it('pH range check returns concern when outside 6.5-8.5', () => {
    var statusIdx = wizSrc.indexOf('function v2WaterParamStatus');
    var statusBlock = wizSrc.substring(statusIdx, statusIdx + 600);
    expect(statusBlock).toContain('Array.isArray(param.limit)');
    expect(statusBlock).toContain('numVal < param.limit[0] || numVal > param.limit[1]');
  });

  it('shows overall result auto-determined', () => {
    var waterIdx = wizSrc.indexOf('function v2BuildWaterResults');
    var waterBlock = wizSrc.substring(waterIdx, waterIdx + 4000);
    expect(waterBlock).toContain('One or More Parameters of Concern');
    expect(waterBlock).toContain('All Pass');
  });

  it('hardness is reference only (no limit)', () => {
    var paramsIdx = wizSrc.indexOf('var V2_WATER_PARAMS');
    var paramsBlock = wizSrc.substring(paramsIdx, paramsIdx + 300);
    expect(paramsBlock).toContain("key: 'hardness'");
    expect(paramsBlock).toContain('limit: null');
  });
});

// ── Thermal differential warning ─────────────────────────────────────────

describe('HEA-212 — Thermal differential warning fires below 18 F', () => {
  it('calculates temperature differential', () => {
    var thermalIdx = wizSrc.indexOf('function v2BuildThermalConditions');
    var thermalBlock = wizSrc.substring(thermalIdx, thermalIdx + 2000);
    expect(thermalBlock).toContain('Math.abs(indoorVal - outdoorVal)');
  });

  it('shows warning when differential < 18', () => {
    var thermalIdx = wizSrc.indexOf('function v2BuildThermalConditions');
    var thermalBlock = wizSrc.substring(thermalIdx, thermalIdx + 2000);
    expect(thermalBlock).toContain('diff < 18');
    expect(thermalBlock).toContain('v2-addon-badge-warn');
    expect(thermalBlock).toContain('results may be unreliable');
  });

  it('shows adequate badge when differential >= 18', () => {
    var thermalIdx = wizSrc.indexOf('function v2BuildThermalConditions');
    var thermalBlock = wizSrc.substring(thermalIdx, thermalIdx + 2000);
    expect(thermalBlock).toContain('v2-addon-badge-pass');
    expect(thermalBlock).toContain('Adequate differential');
  });
});

// ── Sewer findings repeatable add/remove ─────────────────────────────────

describe('HEA-212 — Sewer findings repeatable add/remove', () => {
  it('sewer findings uses v2AddonState for repeatable storage', () => {
    var sewerIdx = wizSrc.indexOf('function v2BuildSewerFindings');
    var sewerBlock = wizSrc.substring(sewerIdx, sewerIdx + 4000);
    expect(sewerBlock).toContain("v2AddonState[stateKey]");
  });

  it('has Add Finding button', () => {
    var sewerIdx = wizSrc.indexOf('function v2BuildSewerFindings');
    var sewerBlock = wizSrc.substring(sewerIdx, sewerBlock + 4000);
    expect(wizSrc).toContain('+ Add Finding');
    expect(wizSrc).toContain('v2AddonAddRepeatable');
  });

  it('has Remove button per finding', () => {
    var sewerIdx = wizSrc.indexOf('function v2BuildSewerFindings');
    var sewerBlock = wizSrc.substring(sewerIdx, sewerIdx + 4000);
    expect(sewerBlock).toContain('v2AddonRemoveRepeatable');
    expect(sewerBlock).toContain('v2-addon-remove-btn');
  });

  it('saves findings as JSON string', () => {
    var saveRepIdx = wizSrc.indexOf('async function v2AddonSaveRepeatable');
    var saveRepBlock = wizSrc.substring(saveRepIdx, saveRepIdx + 600);
    expect(saveRepBlock).toContain('JSON.stringify(v2AddonState[stateKey]');
  });

  it('sewer findings include distance, issue type, severity, photo, notes per finding', () => {
    var sewerIdx = wizSrc.indexOf('function v2BuildSewerFindings');
    var sewerBlock = wizSrc.substring(sewerIdx, sewerIdx + 5000);
    expect(sewerBlock).toContain('Distance');
    expect(sewerBlock).toContain('Issue Type');
    expect(sewerBlock).toContain('Severity');
    expect(sewerBlock).toContain('Notes');
    expect(sewerBlock).toContain('v2CamOpen');
  });
});

// ── Mold samples repeatable add/remove ───────────────────────────────────

describe('HEA-212 — Mold samples repeatable add/remove', () => {
  it('mold collection uses v2AddonState for repeatable storage', () => {
    var moldIdx = wizSrc.indexOf('function v2BuildMoldCollection');
    var moldBlock = wizSrc.substring(moldIdx, moldIdx + 4000);
    expect(moldBlock).toContain("v2AddonState[stateKey]");
  });

  it('starts with 2 default samples', () => {
    var moldIdx = wizSrc.indexOf('function v2BuildMoldCollection');
    var moldBlock = wizSrc.substring(moldIdx, moldIdx + 1000);
    expect(moldBlock).toContain('[{},{}]');
  });

  it('has Add Sample button', () => {
    var moldIdx = wizSrc.indexOf('function v2BuildMoldCollection');
    var moldBlock = wizSrc.substring(moldIdx, moldIdx + 5000);
    expect(moldBlock).toContain('+ Add Sample');
  });

  it('has Remove button per sample', () => {
    var moldIdx = wizSrc.indexOf('function v2BuildMoldCollection');
    var moldBlock = wizSrc.substring(moldIdx, moldIdx + 5000);
    expect(moldBlock).toContain('v2AddonRemoveRepeatable');
  });

  it('has 2 outdoor control samples', () => {
    var moldIdx = wizSrc.indexOf('function v2BuildMoldCollection');
    var moldBlock = wizSrc.substring(moldIdx, moldIdx + 7000);
    expect(moldBlock).toContain('Outdoor Control Samples (2 Required)');
    expect(moldBlock).toContain('Outdoor Control #');
    // Verify loop runs for 2 controls (oi < 2)
    expect(moldBlock).toContain('oi < 2');
  });
});

// ── PDF upload pattern ───────────────────────────────────────────────────

describe('HEA-212 — PDF upload constructs correct Cloudinary URL', () => {
  it('uses raw/upload endpoint (not image/upload)', () => {
    var pdfIdx = wizSrc.indexOf('window.v2AddonUploadPdf');
    var pdfBlock = wizSrc.substring(pdfIdx, pdfIdx + 2000);
    expect(pdfBlock).toContain('dmztfzqfm/raw/upload');
    expect(pdfBlock).not.toContain('dmztfzqfm/image/upload');
  });

  it('saves URL to lab_report_url on inspection record via save-draft', () => {
    var pdfIdx = wizSrc.indexOf('window.v2AddonUploadPdf');
    var pdfBlock = wizSrc.substring(pdfIdx, pdfIdx + 2000);
    expect(pdfBlock).toContain('lab_report_url');
    expect(pdfBlock).toContain('save-draft');
  });

  it('accepts only PDF file type', () => {
    expect(wizSrc).toContain('accept="application/pdf"');
  });

  it('uses slvlwkcf upload preset', () => {
    var pdfIdx = wizSrc.indexOf('window.v2AddonUploadPdf');
    var pdfBlock = wizSrc.substring(pdfIdx, pdfIdx + 2000);
    expect(pdfBlock).toContain('slvlwkcf');
  });
});

// ── Field save pattern ───────────────────────────────────────────────────

describe('HEA-212 — Add-on field saves follow save-field-answer pattern', () => {
  it('v2AddonSaveField uses save-field-answer endpoint', () => {
    var saveIdx = wizSrc.indexOf('window.v2AddonSaveField');
    var saveBlock = wizSrc.substring(saveIdx, saveIdx + 600);
    expect(saveBlock).toContain('save-field-answer');
  });

  it('v2AddonSaveField checks v2IsOffline and queues to IndexedDB', () => {
    var saveIdx = wizSrc.indexOf('window.v2AddonSaveField');
    var saveBlock = wizSrc.substring(saveIdx, saveIdx + 600);
    expect(saveBlock).toContain('v2IsOffline');
    expect(saveBlock).toContain('idbPut');
  });

  it('v2AddonSaveField updates v2FieldAnswers in memory', () => {
    var saveIdx = wizSrc.indexOf('window.v2AddonSaveField');
    var saveBlock = wizSrc.substring(saveIdx, saveIdx + 600);
    expect(saveBlock).toContain('v2FieldAnswers[fieldId]');
  });
});

// ── Global scope handlers ────────────────────────────────────────────────

describe('HEA-212 — All onclick handlers at global scope', () => {
  it('v2AddonSaveField is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonSaveField');
  });

  it('v2AddonToggleCheckbox is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonToggleCheckbox');
  });

  it('v2AddonAddRepeatable is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonAddRepeatable');
  });

  it('v2AddonRemoveRepeatable is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonRemoveRepeatable');
  });

  it('v2AddonUpdateRepeatable is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonUpdateRepeatable');
  });

  it('v2AddonUploadPdf is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonUploadPdf');
  });

  it('v2AddonRadonCalc is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonRadonCalc');
  });

  it('v2AddonThermalDiffCalc is window-level', () => {
    expect(wizSrc).toContain('window.v2AddonThermalDiffCalc');
  });
});

// ── CSS classes defined ──────────────────────────────────────────────────

describe('HEA-212 — Addon CSS classes are defined', () => {
  it('defines v2-addon-field class', () => {
    expect(wizSrc).toContain('.v2-addon-field');
  });

  it('defines v2-addon-toggle-btn class', () => {
    expect(wizSrc).toContain('.v2-addon-toggle-btn');
  });

  it('defines v2-addon-badge-pass class', () => {
    expect(wizSrc).toContain('.v2-addon-badge-pass');
  });

  it('defines v2-addon-badge-concern class', () => {
    expect(wizSrc).toContain('.v2-addon-badge-concern');
  });

  it('defines v2-addon-badge-warn class', () => {
    expect(wizSrc).toContain('.v2-addon-badge-warn');
  });

  it('defines v2-addon-repeatable class', () => {
    expect(wizSrc).toContain('.v2-addon-repeatable');
  });

  it('defines v2-addon-add-btn class', () => {
    expect(wizSrc).toContain('.v2-addon-add-btn');
  });

  it('defines v2-addon-water-table class', () => {
    expect(wizSrc).toContain('.v2-addon-water-table');
  });

  it('defines v2-addon-pdf-btn class', () => {
    expect(wizSrc).toContain('.v2-addon-pdf-btn');
  });
});
