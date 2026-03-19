/**
 * Unit tests for V2 Wizard subsection rendering (HEA-154 → HEA-163 photo-centric)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var wizSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

describe('HEA-163 — Photo-centric subsection cards', () => {
  it('defines v2BuildSubcard function', () => {
    expect(wizSrc).toContain('function v2BuildSubcard(sectionId, field)');
  });

  it('v2RenderPanel calls v2BuildSubcard per field', () => {
    var renderIdx = wizSrc.indexOf('function v2RenderPanel()');
    var renderEnd = wizSrc.indexOf('function v2BuildSubcard');
    var block = wizSrc.substring(renderIdx, renderEnd);
    expect(block).toContain('v2BuildSubcard(sec.id, field)');
  });

  it('subcard filters photos by field_id', () => {
    var subIdx = wizSrc.indexOf('function v2BuildSubcard');
    var subBlock = wizSrc.substring(subIdx, subIdx + 500);
    expect(subBlock).toContain('p.field_id === field.id');
  });

  it('separates findings from site docs by severity', () => {
    var subIdx = wizSrc.indexOf('function v2BuildSubcard');
    var subBlock = wizSrc.substring(subIdx, subIdx + 500);
    expect(subBlock).toContain('p.severity');
    expect(subBlock).toContain('!p.severity');
  });
});

describe('HEA-163 — Photo row rendering', () => {
  it('defines v2BuildPhotoRow function', () => {
    expect(wizSrc).toContain('function v2BuildPhotoRow(photo, isFinding)');
  });

  it('renders thumbnail, severity badge, note, delete button', () => {
    expect(wizSrc).toContain('v2-photo-row-thumb');
    expect(wizSrc).toContain('v2-photo-row-sev');
    expect(wizSrc).toContain('v2-photo-row-note');
    expect(wizSrc).toContain('v2-photo-row-del');
  });
});

describe('HEA-163 — Card collapse state', () => {
  it('uses v2SubcardState for expand/collapse', () => {
    expect(wizSrc).toContain('var v2SubcardState');
    expect(wizSrc).toContain('v2ToggleSubcard');
  });

  it('defaults collapsed', () => {
    expect(wizSrc).toContain('v2SubcardState[field.id] || false');
  });
});

describe('HEA-163 — Section status with photo findings', () => {
  it('checks v2PhotoFindings for section status', () => {
    var statusIdx = wizSrc.indexOf('function v2SectionStatus');
    var statusBlock = wizSrc.substring(statusIdx, statusIdx + 400);
    expect(statusBlock).toContain('v2PhotoFindings');
  });
});
