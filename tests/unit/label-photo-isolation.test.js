/**
 * Unit tests for HEA-228: Label photo isolation + photo-centric render gating
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var wizardSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');
var reportSrc = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');

// ── Issue 1: Label photo stored in v2LabelPhotos, not v2Photos ──────────────

describe('HEA-228 — Label photo isolation in inspector-wizard-v2', () => {

  it('declares v2LabelPhotos global state variable', () => {
    expect(wizardSrc).toContain('var v2LabelPhotos');
  });

  it('v2LabelCamOpen stores photo in v2LabelPhotos not v2Photos', () => {
    expect(wizardSrc).toContain('v2LabelPhotos[key] = cData.secure_url');
    // Should NOT push to v2Photos inside v2LabelCamOpen
    var labelCamMatch = wizardSrc.match(/window\.v2LabelCamOpen[\s\S]*?(?=window\.v2CamOpen)/);
    expect(labelCamMatch).toBeTruthy();
    var labelCamBody = labelCamMatch[0];
    expect(labelCamBody).not.toContain('v2Photos.push');
    expect(labelCamBody).not.toContain('save-field-photo');
  });

  it('v2ScanLabel reads from v2LabelPhotos not v2Photos', () => {
    expect(wizardSrc).toContain("var labelUrl = v2LabelPhotos[mfgFieldId]");
    // Old pattern should be removed
    expect(wizardSrc).not.toContain("v2Photos.filter(function(p) { return p.section_id === sectionId && p.field_id === mfgFieldId; })");
  });

  it('photo grid filter excludes _mfg photos', () => {
    expect(wizardSrc).toContain("p.field_id.indexOf('_mfg') !== -1");
  });

  it('HHC label camera uses v2LabelCamOpen not v2CamOpen', () => {
    // No v2CamOpen calls should remain with _mfg suffix
    expect(wizardSrc).not.toMatch(/v2CamOpen\([^)]*_mfg/);
  });

  it('HI equipment label camera uses v2LabelCamOpen', () => {
    expect(wizardSrc).toContain("v2LabelCamOpen(\\'" );
  });

  it('renders inline thumbnail when label photo exists', () => {
    expect(wizardSrc).toContain('var labelUrl = v2LabelPhotos[labelKey]');
    expect(wizardSrc).toContain('var hiLabelUrl = v2LabelPhotos[hiLabelKey]');
  });

  it('scan label button is disabled when no label photo present', () => {
    expect(wizardSrc).toContain("var scanDisabled = labelUrl ? '' : ' disabled style=\"opacity:0.4;cursor:not-allowed;\"'");
    expect(wizardSrc).toContain("var hiScanDisabled = hiLabelUrl ? '' : ' disabled style=\"opacity:0.4;cursor:not-allowed;\"'");
  });

  it('v2BackToJobs resets v2LabelPhotos', () => {
    var backToJobsMatch = wizardSrc.match(/function v2BackToJobs\(\)[\s\S]*?v2ShowScreen\('screenPicker'\)/);
    expect(backToJobsMatch).toBeTruthy();
    expect(backToJobsMatch[0]).toContain('v2LabelPhotos = {}');
  });

  it('v2LabelCamOpen calls v2RenderPanel after storing photo', () => {
    var labelCamMatch = wizardSrc.match(/window\.v2LabelCamOpen[\s\S]*?(?=window\.v2CamOpen)/);
    expect(labelCamMatch).toBeTruthy();
    expect(labelCamMatch[0]).toContain('v2RenderPanel()');
  });

  it('v2LabelCamOpen shows toast on success', () => {
    var labelCamMatch = wizardSrc.match(/window\.v2LabelCamOpen[\s\S]*?(?=window\.v2CamOpen)/);
    expect(labelCamMatch).toBeTruthy();
    expect(labelCamMatch[0]).toContain("v2Toast('Label photo captured')");
  });
});

// ── Issue 2: Photo-centric render gated to home_inspection only ─────────────

describe('HEA-228 — Photo-centric render gated to HI only', () => {

  it('photo-centric render requires home_inspection category', () => {
    expect(reportSrc).toContain("v2Data.photoFindings.length > 0 && data.report.category === 'home_inspection'");
  });

  it('HHC reports use V2 renderer even when photoFindings exist', () => {
    // The condition now requires home_inspection, so HHC falls through to V2/V1 path
    var renderMatch = reportSrc.match(/if \(v2Data\.photoFindings\.length > 0 && data\.report\.category === 'home_inspection'\)[\s\S]*?else \{/);
    expect(renderMatch).toBeTruthy();
    var elseBlock = reportSrc.substring(reportSrc.indexOf(renderMatch[0]) + renderMatch[0].length, reportSrc.indexOf(renderMatch[0]) + renderMatch[0].length + 200);
    expect(elseBlock).toContain('renderV2Report');
  });

  it('addon reports are routed before the photo-centric check', () => {
    var addonIdx = reportSrc.indexOf("data.report.category === 'addon'");
    var photoCentricIdx = reportSrc.indexOf("v2Data.photoFindings.length > 0 && data.report.category === 'home_inspection'");
    expect(addonIdx).toBeLessThan(photoCentricIdx);
  });

  it('NC reports fall through to V2/V1 renderer', () => {
    // new_construction is not 'home_inspection', so it won't hit renderPhotoCentricReport
    expect(reportSrc).not.toContain("category === 'new_construction'") ;
    // The photo-centric guard only matches home_inspection
    expect(reportSrc).toContain("data.report.category === 'home_inspection'");
  });
});
