/**
 * Unit tests for HEA-163: Wizard V2 photo-centric redesign
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var wizSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');
var getReportSrc = readFileSync(resolve(__dirname, '../../functions/get-report.js'), 'utf8');

// 1. Subsection cards default collapsed
describe('HEA-163 — Subsection cards', () => {
  it('builds subcards per wizard_field', () => {
    expect(wizSrc).toContain('function v2BuildSubcard(sectionId, field)');
  });

  it('cards default collapsed via v2SubcardState', () => {
    expect(wizSrc).toContain('var v2SubcardState');
    expect(wizSrc).toContain('v2SubcardState[field.id] || false');
  });

  it('camera buttons visible on card header', () => {
    expect(wizSrc).toContain('v2-subcard-cam--finding');
    expect(wizSrc).toContain('v2-subcard-cam');
    expect(wizSrc).toContain('📷 Finding');
    expect(wizSrc).toContain('📷 Site Doc');
  });

  it('toggle function expands/collapses cards', () => {
    expect(wizSrc).toContain('v2ToggleSubcard');
  });
});

// 2. Finding camera flow
describe('HEA-163 — Finding camera flow', () => {
  it('has hidden file input for camera', () => {
    expect(wizSrc).toContain('id="v2FileInput"');
    expect(wizSrc).toContain('capture="environment"');
  });

  it('loads browser-image-compression CDN', () => {
    expect(wizSrc).toContain('browser-image-compression');
  });

  it('compresses before upload', () => {
    expect(wizSrc).toContain('imageCompression(file');
    expect(wizSrc).toContain('maxWidthOrHeight: 1200');
  });

  it('calls save-field-photo with field_id', () => {
    expect(wizSrc).toContain('field_id: v2CamFieldId');
  });

  it('Finding Modal has severity buttons', () => {
    expect(wizSrc).toContain('id="v2FindingModal"');
    expect(wizSrc).toContain('v2FmSelectSev');
    expect(wizSrc).toContain('v2FmSave');
  });

  it('saves severity and note via update_id', () => {
    expect(wizSrc).toContain('update_id: v2LastPhotoId');
    expect(wizSrc).toContain('severity: v2FmSev');
  });
});

// 3. Site Doc flow
describe('HEA-163 — Site Doc camera flow', () => {
  it('has Site Doc Modal', () => {
    expect(wizSrc).toContain('id="v2SiteDocModal"');
    expect(wizSrc).toContain('v2SdSave');
  });

  it('saves with no severity', () => {
    var sdIdx = wizSrc.indexOf('v2OpenSiteDocModal');
    expect(sdIdx).toBeGreaterThan(-1);
  });
});

// 4. Note editing
describe('HEA-163 — Note editing', () => {
  it('has v2EditPhotoNote function', () => {
    expect(wizSrc).toContain('v2EditPhotoNote');
  });

  it('calls update-photo-caption function', () => {
    expect(wizSrc).toContain('update-photo-caption');
  });
});

// 5. Photo deletion
describe('HEA-163 — Photo deletion', () => {
  it('has v2DeletePhoto function', () => {
    expect(wizSrc).toContain('v2DeletePhoto');
  });

  it('calls delete-photo-finding function', () => {
    expect(wizSrc).toContain('delete-photo-finding');
  });

  it('shows confirmation before delete', () => {
    expect(wizSrc).toContain("confirm('Delete this photo");
  });
});

// 6. Section comment
describe('HEA-163 — Section comment', () => {
  it('has section comment textarea', () => {
    expect(wizSrc).toContain('v2-section-comment');
    expect(wizSrc).toContain('v2SecComment_');
  });

  it('saves via save-section-comment function', () => {
    expect(wizSrc).toContain('save-section-comment');
    expect(wizSrc).toContain('v2SaveSectionComment');
  });
});

// 7. New Netlify functions exist
describe('HEA-163 — New Netlify functions', () => {
  it('update-photo-caption.js exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/update-photo-caption.js'))).toBe(true);
  });

  it('delete-photo-finding.js exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/delete-photo-finding.js'))).toBe(true);
  });

  it('save-section-comment.js exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/save-section-comment.js'))).toBe(true);
  });
});

// 8. get-report.js includes section comments
describe('HEA-163 — get-report.js section comments', () => {
  it('fetches inspection_section_comments', () => {
    expect(getReportSrc).toContain("from('inspection_section_comments')");
  });

  it('returns v2_section_comments in response', () => {
    expect(getReportSrc).toContain('v2_section_comments');
  });
});

// 9. Section status checks photo findings
describe('HEA-163 — Section status with photo findings', () => {
  it('v2SectionStatus checks v2PhotoFindings', () => {
    expect(wizSrc).toContain('v2PhotoFindings.filter');
  });
});

// 10. No old checklist UI in new render path
describe('HEA-163 — Old checklist removed from render', () => {
  it('v2RenderPanel calls v2BuildSubcard not v2BuildCard', () => {
    var renderIdx = wizSrc.indexOf('function v2RenderPanel()');
    var renderEnd = wizSrc.indexOf('function v2BuildSubcard');
    var renderBlock = wizSrc.substring(renderIdx, renderEnd);
    expect(renderBlock).toContain('v2BuildSubcard');
    expect(renderBlock).not.toContain('v2BuildObsSubsection');
    expect(renderBlock).not.toContain('v2BuildSiteDocSubsection');
  });
});
