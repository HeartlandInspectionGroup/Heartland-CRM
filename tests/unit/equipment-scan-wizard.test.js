/**
 * Unit tests for equipment scan UI in inspector-wizard-v2.html (HEA-220)
 *
 * Tests that Scan Label button is present on the correct 16 section points
 * and absent on non-applicable sections (Smoke Detectors, CO Detectors).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

var wizardHtml;

beforeAll(() => {
  wizardHtml = readFileSync(join(__dirname, '../../inspector-wizard-v2.html'), 'utf-8');
});

describe('Wizard — Scan Label button presence', () => {
  it('defines HHC_EQUIPMENT_SECTIONS without Smoke Detectors or CO Detectors', () => {
    // Extract the HHC_EQUIPMENT_SECTIONS array definition
    var match = wizardHtml.match(/var HHC_EQUIPMENT_SECTIONS\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    var sectionsList = match[1];
    expect(sectionsList).not.toContain('Smoke Detectors');
    expect(sectionsList).not.toContain('CO Detectors');
    expect(sectionsList).toContain('Heating');
    expect(sectionsList).toContain('Cooling');
    expect(sectionsList).toContain('Electrical');
    expect(sectionsList).toContain('Plumbing');
  });

  it('defines SCAN_ELIGIBLE_SECTIONS with 4 equipment sections', () => {
    var match = wizardHtml.match(/var SCAN_ELIGIBLE_SECTIONS\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    var list = match[1];
    expect(list).toContain('Heating');
    expect(list).toContain('Cooling');
    expect(list).toContain('Electrical');
    expect(list).toContain('Plumbing');
  });

  it('defines HI_EQUIPMENT_SECTIONS for home inspection', () => {
    var match = wizardHtml.match(/var HI_EQUIPMENT_SECTIONS\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    var list = match[1];
    expect(list).toContain('Heating');
    expect(list).toContain('Cooling');
    expect(list).toContain('Electrical');
    expect(list).toContain('Plumbing');
  });

  it('has Scan Label button in v2BuildHHCCard equipment section', () => {
    // The v2BuildHHCCard function should contain the Scan Label button
    expect(wizardHtml).toContain('v2-scan-label-btn');
    expect(wizardHtml).toContain('v2ScanLabel(');
  });

  it('has Scan Label button for HI equipment sections', () => {
    // The HI rendering path should have label photo + scan label
    expect(wizardHtml).toContain('isHIEquipment || isThermal');
    // The HI path constructs onclick with escaped quotes
    expect(wizardHtml).toContain("v2ScanLabel(\\");
  });

  it('has Scan Label button for Thermal add-on', () => {
    expect(wizardHtml).toContain("secNameForHI.toLowerCase().indexOf('thermal')");
  });

  it('Scan Label button triggers v2ScanLabel global function', () => {
    expect(wizardHtml).toContain('window.v2ScanLabel = async function');
  });

  it('has v2SaveScanResult global function', () => {
    expect(wizardHtml).toContain('window.v2SaveScanResult = async function');
  });

  it('has v2DismissScan global function', () => {
    expect(wizardHtml).toContain('window.v2DismissScan = function');
  });

  it('has scan results panel CSS classes defined', () => {
    expect(wizardHtml).toContain('.v2-scan-results-panel');
    expect(wizardHtml).toContain('.v2-scan-label-btn');
    expect(wizardHtml).toContain('.v2-scan-save-btn');
    expect(wizardHtml).toContain('.v2-scan-dismiss-btn');
    expect(wizardHtml).toContain('.v2-scan-recall-ok');
    expect(wizardHtml).toContain('.v2-scan-recall-warn');
  });

  it('renders scan results container div in HHC equipment cards', () => {
    // The v2BuildHHCCard function should create a v2ScanResults_ div
    expect(wizardHtml).toContain("id=\"v2ScanResults_'");
    // Verify the pattern: id="v2ScanResults_' + (subfieldId || sectionId) + '"
    var scanResultsMatches = wizardHtml.match(/v2ScanResults_/g);
    expect(scanResultsMatches).not.toBeNull();
    // Should appear in both HHC and HI paths
    expect(scanResultsMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('calls save-equipment-scan function on Save to Record', () => {
    expect(wizardHtml).toContain('save-equipment-scan');
  });

  it('calls scan-equipment-label function on Scan Label', () => {
    expect(wizardHtml).toContain('scan-equipment-label');
  });
});

describe('Wizard — appliance sub-cards get scan button', () => {
  it('v2BuildAppliancePanel calls v2BuildHHCCard with hasEquipment=true', () => {
    // v2BuildHHCCard is called with hasEquipment=true for each appliance
    var match = wizardHtml.match(/v2BuildHHCCard\(sec\.id,\s*app,\s*true,\s*subfieldId\)/);
    expect(match).not.toBeNull();
  });

  it('HHC_APPLIANCES has 7 appliance entries', () => {
    var match = wizardHtml.match(/var HHC_APPLIANCES\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    var apps = match[1].split(',').map(function(s) { return s.trim(); });
    expect(apps.length).toBe(7);
    expect(match[1]).toContain('Refrigerator');
    expect(match[1]).toContain('Washer');
    expect(match[1]).toContain('Dryer');
  });
});
