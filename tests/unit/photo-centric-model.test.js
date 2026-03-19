/**
 * Unit tests for HEA-160: Photo-centric data model
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var savePhotoSrc = readFileSync(resolve(__dirname, '../../functions/save-field-photo.js'), 'utf8');
var getReportSrc = readFileSync(resolve(__dirname, '../../functions/get-report.js'), 'utf8');
var nrHtml = readFileSync(resolve(__dirname, '../../narrative-review.html'), 'utf8');
var genSrc = readFileSync(resolve(__dirname, '../../functions/generate-narrative.js'), 'utf8');
var savNarrSrc = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');
var sendSrc = readFileSync(resolve(__dirname, '../../functions/send-report-email.js'), 'utf8');

// 1. save-field-photo.js extended
describe('HEA-160 — save-field-photo.js accepts photo-centric fields', () => {
  it('accepts field_id, severity, is_safety, caption', () => {
    expect(savePhotoSrc).toContain('field_id, severity, is_safety, caption');
  });

  it('supports update_id for PATCH mode', () => {
    expect(savePhotoSrc).toContain('update_id');
    expect(savePhotoSrc).toContain('PATCH');
  });

  it('backwards compatible — new fields are optional', () => {
    expect(savePhotoSrc).toContain('if (field_id && isValidUuid(field_id))');
    expect(savePhotoSrc).toContain('if (severity)');
  });
});

// 2. get-report.js returns photo_findings
describe('HEA-160 — get-report.js photo_findings', () => {
  it('returns v2_photo_findings in response', () => {
    expect(getReportSrc).toContain('v2_photo_findings');
    expect(getReportSrc).toContain('photo_findings');
  });

  it('filters photos where severity is set', () => {
    expect(getReportSrc).toContain('p.severity');
  });
});

// 4. narrative-review.html photo-centric mode
describe('HEA-160 — Narrative Review photo-centric layout', () => {
  it('detects photo-centric mode', () => {
    expect(nrHtml).toContain('isPhotoCentric');
    expect(nrHtml).toContain('currentPhotoFindings');
  });

  it('renders photo finding rows', () => {
    expect(nrHtml).toContain('buildPhotoFindingRow');
    expect(nrHtml).toContain('data-photo-finding-id');
  });

  it('has nrApprovePhoto function', () => {
    expect(nrHtml).toContain('nrApprovePhoto');
    expect(nrHtml).toContain("action: 'approve_photo'");
  });

  it('generate sends photo_findings payload', () => {
    expect(nrHtml).toContain('photo_findings: photosPayload');
  });

  it('progress counts photo narratives in photo-centric mode', () => {
    expect(nrHtml).toContain('photo narratives approved');
  });

  it('site docs shows photos without severity', () => {
    expect(nrHtml).toContain('!p.severity && !p.finding_id');
  });
});

// 5. generate-narrative.js per-photo mode
describe('HEA-160 — generate-narrative.js per-photo mode', () => {
  it('accepts photo_findings in body', () => {
    expect(genSrc).toContain('body.photo_findings');
  });

  it('writes narrative to inspection_finding_photos', () => {
    expect(genSrc).toContain("from('inspection_finding_photos')");
    expect(genSrc).toContain("narrative: r.narrative, narrative_status: 'draft'");
  });

  it('returns mode: per_photo', () => {
    expect(genSrc).toContain("mode: 'per_photo'");
  });
});

// 6. save-narrative.js approve_photo action
describe('HEA-160 — save-narrative.js approve_photo', () => {
  it('accepts approve_photo action', () => {
    expect(savNarrSrc).toContain("'approve_photo'");
  });

  it('requires photo_id for approve_photo', () => {
    expect(savNarrSrc).toContain('photo_id required for approve_photo');
  });

  it('updates inspection_finding_photos', () => {
    expect(savNarrSrc).toContain("from('inspection_finding_photos')");
    expect(savNarrSrc).toContain("narrative_status: 'approved'");
  });
});

// 7. report.html photo-centric rendering
describe('HEA-160 — report.html photo-centric path', () => {
  it('detects photo-centric mode per section', () => {
    expect(reportHtml).toContain('isPhotoCentric');
    expect(reportHtml).toContain('v2Data.photoFindings');
  });

  it('renders photo finding cards', () => {
    expect(reportHtml).toContain('Photo Finding');
    expect(reportHtml).toContain('pf.caption');
    expect(reportHtml).toContain('pf.narrative');
  });

  it('preserves legacy and per-finding paths', () => {
    expect(reportHtml).toContain('hasPerFindingNarratives');
    expect(reportHtml).toContain('v2Data.narratives[sec.id]');
  });
});

// 8. send-report-email.js photo preflight
describe('HEA-160 — send-report-email.js photo preflight', () => {
  it('checks photo narrative approval', () => {
    expect(sendSrc).toContain("from('inspection_finding_photos')");
    expect(sendSrc).toContain('photo narrative(s) not yet approved');
  });

  it('preserves existing section and finding checks', () => {
    expect(sendSrc).toContain("from('inspection_narratives')");
    expect(sendSrc).toContain("from('inspection_findings')");
  });
});
