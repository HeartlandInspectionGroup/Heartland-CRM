/**
 * Unit tests for Equipment Details block on report.html (HEA-220)
 *
 * Tests that the report correctly renders/hides Equipment Details
 * based on the presence/absence of equipment scan data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

var reportHtml;

beforeAll(() => {
  reportHtml = readFileSync(join(__dirname, '../../report.html'), 'utf-8');
});

describe('Report — Equipment Details block', () => {
  it('defines buildEquipmentDetailsBlock function', () => {
    expect(reportHtml).toContain('function buildEquipmentDetailsBlock(sectionId, fieldId)');
  });

  it('defines buildEquipmentDetailsForSection function', () => {
    expect(reportHtml).toContain('function buildEquipmentDetailsForSection(sectionId)');
  });

  it('calls buildEquipmentDetailsForSection in buildV2Section', () => {
    // Verify the Equipment Details block is inserted in the V2 section renderer
    var v2SectionCode = reportHtml.substring(
      reportHtml.indexOf('function buildV2Section('),
      reportHtml.indexOf('function buildV2FindingCard(')
    );
    expect(v2SectionCode).toContain('buildEquipmentDetailsForSection(sec.id)');
  });

  it('calls buildEquipmentDetailsForSection in buildPhotoCentricSectionCard', () => {
    var pcSectionCode = reportHtml.substring(
      reportHtml.indexOf('function buildPhotoCentricSectionCard('),
      reportHtml.indexOf('function buildV2Section(')
    );
    expect(pcSectionCode).toContain('buildEquipmentDetailsForSection(sec.id)');
  });

  it('renders brand row only when brand has value', () => {
    expect(reportHtml).toContain("if (scan.brand) html += makeRow('Brand', scan.brand)");
  });

  it('renders model row only when model has value', () => {
    expect(reportHtml).toContain("if (scan.model) html += makeRow('Model', scan.model)");
  });

  it('renders serial row only when serial has value', () => {
    expect(reportHtml).toContain("if (scan.serial) html += makeRow('Serial', scan.serial)");
  });

  it('always renders recall status row', () => {
    // The recall status should always be rendered — check all 3 branches
    expect(reportHtml).toContain("scan.recall_status === 'found'");
    expect(reportHtml).toContain("scan.recall_status === 'unavailable'");
    expect(reportHtml).toContain('No active recalls');
  });

  it('renders recall link when recall_url present', () => {
    expect(reportHtml).toContain('scan.recall_url');
    expect(reportHtml).toContain('View Recall Details');
    expect(reportHtml).toContain('equip-recall-link');
  });

  it('has equip-details-block CSS class defined', () => {
    expect(reportHtml).toContain('.equip-details-block');
    expect(reportHtml).toContain('.equip-details-title');
    expect(reportHtml).toContain('.equip-recall-ok');
    expect(reportHtml).toContain('.equip-recall-warn');
    expect(reportHtml).toContain('.equip-recall-link');
  });

  it('v2Data includes equipmentScans property', () => {
    expect(reportHtml).toContain('equipmentScans: {}');
    expect(reportHtml).toContain('v2Data.equipmentScans = data.v2_equipment_scans');
  });

  it('returns empty string when no scan data exists', () => {
    // buildEquipmentDetailsBlock returns '' when scan not found
    var fnCode = reportHtml.substring(
      reportHtml.indexOf('function buildEquipmentDetailsBlock('),
      reportHtml.indexOf('function buildEquipmentDetailsForSection(')
    );
    expect(fnCode).toContain("if (!scan) return ''");
  });

  it('buildEquipmentDetailsForSection iterates equipment_scans by section prefix', () => {
    var fnCode = reportHtml.substring(
      reportHtml.indexOf('function buildEquipmentDetailsForSection('),
      reportHtml.indexOf('function buildV2Section(')
    );
    // Should check both exact section match and section:field_id prefix
    expect(fnCode).toContain("key === sectionId || key.indexOf(sectionId + ':') === 0");
  });
});

describe('Report — get-report.js integration', () => {
  var getReportCode;

  beforeAll(() => {
    getReportCode = readFileSync(join(__dirname, '../../functions/get-report.js'), 'utf-8');
  });

  it('fetches equipment_scans in the parallel query', () => {
    expect(getReportCode).toContain("supabase.from('equipment_scans')");
  });

  it('returns v2_equipment_scans in the response', () => {
    expect(getReportCode).toContain('v2_equipment_scans: v2.equipment_scans');
  });

  it('keys equipment scans by section_id:field_id', () => {
    expect(getReportCode).toContain("es.section_id + ':' + es.field_id");
  });
});
