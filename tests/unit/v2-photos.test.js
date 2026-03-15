/**
 * Unit tests for V2 wizard photo strip and link-to-finding logic
 */

import { describe, it, expect } from 'vitest';

// ── Pure logic functions (same as inline in inspector-wizard-v2.html) ──────

function getSectionPhotos(photos, sectionId) {
  return photos.filter(function (p) { return p.section_id === sectionId; });
}

function getFindingPhotos(photos, findingId) {
  if (!findingId) return [];
  return photos.filter(function (p) { return p.finding_id === findingId; });
}

function findingNameForPhoto(photo, findings, fields) {
  if (!photo.finding_id) return null;
  var finding = findings.find(function (f) { return f.id === photo.finding_id; });
  if (!finding) return null;
  if (finding.is_custom) return finding.custom_label || 'Custom Finding';
  var sectionFields = fields[finding.section_id] || [];
  var field = sectionFields.find(function (fl) { return fl.id === finding.field_id; });
  return field ? field.name : 'Finding';
}

function isPhotoLinked(photo) {
  return !!photo.finding_id;
}

function linkableFindings(findings, sectionId) {
  return findings.filter(function (f) {
    return f.section_id === sectionId && !f.is_section_pass && f.id;
  });
}

function updatePhotoInMemory(photos, photoId, newFindingId) {
  return photos.map(function (p) {
    if (p.id === photoId) {
      return Object.assign({}, p, { finding_id: newFindingId });
    }
    return p;
  });
}

// ── Test data ──────────────────────────────────────────────────────────────

var PHOTOS = [
  { id: 'p1', section_id: 'sec-1', record_id: 'rec-1', finding_id: null, cloudinary_url: 'http://img/1.jpg' },
  { id: 'p2', section_id: 'sec-1', record_id: 'rec-1', finding_id: 'f1', cloudinary_url: 'http://img/2.jpg' },
  { id: 'p3', section_id: 'sec-2', record_id: 'rec-1', finding_id: null, cloudinary_url: 'http://img/3.jpg' },
  { id: 'p4', section_id: 'sec-1', record_id: 'rec-1', finding_id: 'f2', cloudinary_url: 'http://img/4.jpg' },
];

var FINDINGS = [
  { id: 'f1', section_id: 'sec-1', field_id: 'fld-1', is_custom: false, is_section_pass: false },
  { id: 'f2', section_id: 'sec-1', field_id: 'fld-2', is_custom: false, is_section_pass: false },
  { id: 'f3', section_id: 'sec-1', field_id: null, is_custom: true, custom_label: 'Water Stain', is_section_pass: false },
  { id: 'f4', section_id: 'sec-2', field_id: 'fld-3', is_custom: false, is_section_pass: false },
  { id: 'f5', section_id: 'sec-1', field_id: null, is_custom: false, is_section_pass: true },
];

var FIELDS = {
  'sec-1': [
    { id: 'fld-1', name: 'Roof Covering', field_type: 'condition_rating' },
    { id: 'fld-2', name: 'Flashing', field_type: 'condition_rating' },
  ],
  'sec-2': [
    { id: 'fld-3', name: 'Plumbing', field_type: 'condition_rating' },
  ],
};

// ─── Photo strip filtering ────────────────────────────────────────────────

describe('v2 photos — section photo filtering', () => {
  it('returns only photos matching current section_id', () => {
    var result = getSectionPhotos(PHOTOS, 'sec-1');
    expect(result).toHaveLength(3);
    result.forEach(function (p) {
      expect(p.section_id).toBe('sec-1');
    });
  });

  it('returns empty for section with no photos', () => {
    expect(getSectionPhotos(PHOTOS, 'sec-99')).toEqual([]);
  });

  it('returns photos for sec-2', () => {
    var result = getSectionPhotos(PHOTOS, 'sec-2');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p3');
  });
});

// ─── Linked vs unlinked detection ─────────────────────────────────────────

describe('v2 photos — linked/unlinked state', () => {
  it('unlinked photo has no finding_id', () => {
    expect(isPhotoLinked(PHOTOS[0])).toBe(false);
  });

  it('linked photo has finding_id set', () => {
    expect(isPhotoLinked(PHOTOS[1])).toBe(true);
  });
});

// ─── Finding name resolution ──────────────────────────────────────────────

describe('v2 photos — finding name for photo', () => {
  it('returns field name for linked template finding', () => {
    var name = findingNameForPhoto(PHOTOS[1], FINDINGS, FIELDS); // finding_id: f1
    expect(name).toBe('Roof Covering');
  });

  it('returns custom_label for linked custom finding', () => {
    var photo = { finding_id: 'f3' };
    var name = findingNameForPhoto(photo, FINDINGS, FIELDS);
    expect(name).toBe('Water Stain');
  });

  it('returns null for unlinked photo', () => {
    var name = findingNameForPhoto(PHOTOS[0], FINDINGS, FIELDS);
    expect(name).toBeNull();
  });

  it('returns null when finding_id references nonexistent finding', () => {
    var photo = { finding_id: 'nonexistent' };
    var name = findingNameForPhoto(photo, FINDINGS, FIELDS);
    expect(name).toBeNull();
  });
});

// ─── Finding photos (card inline) ─────────────────────────────────────────

describe('v2 photos — finding card photos', () => {
  it('returns photos matching finding_id', () => {
    var result = getFindingPhotos(PHOTOS, 'f1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p2');
  });

  it('returns multiple photos for same finding', () => {
    // Add another photo linked to f1
    var photos = PHOTOS.concat([
      { id: 'p5', section_id: 'sec-1', record_id: 'rec-1', finding_id: 'f1', cloudinary_url: 'http://img/5.jpg' },
    ]);
    var result = getFindingPhotos(photos, 'f1');
    expect(result).toHaveLength(2);
  });

  it('returns empty for finding with no photos', () => {
    expect(getFindingPhotos(PHOTOS, 'f3')).toEqual([]);
  });

  it('returns empty for null finding_id', () => {
    expect(getFindingPhotos(PHOTOS, null)).toEqual([]);
  });
});

// ─── Linkable findings (dropdown options) ─────────────────────────────────

describe('v2 photos — linkable findings', () => {
  it('returns only non-section-pass findings with an id for the section', () => {
    var result = linkableFindings(FINDINGS, 'sec-1');
    // f1, f2, f3 (not f5 which is is_section_pass)
    expect(result).toHaveLength(3);
    var ids = result.map(function (f) { return f.id; });
    expect(ids).toContain('f1');
    expect(ids).toContain('f2');
    expect(ids).toContain('f3');
    expect(ids).not.toContain('f5');
  });

  it('returns only findings for the specified section', () => {
    var result = linkableFindings(FINDINGS, 'sec-2');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('f4');
  });

  it('returns empty for section with no findings', () => {
    expect(linkableFindings(FINDINGS, 'sec-99')).toEqual([]);
  });
});

// ─── In-memory state update ───────────────────────────────────────────────

describe('v2 photos — in-memory state sync', () => {
  it('link: sets finding_id on the correct photo', () => {
    var updated = updatePhotoInMemory(PHOTOS, 'p1', 'f1');
    expect(updated.find(function (p) { return p.id === 'p1'; }).finding_id).toBe('f1');
    // Other photos unchanged
    expect(updated.find(function (p) { return p.id === 'p2'; }).finding_id).toBe('f1');
    expect(updated.find(function (p) { return p.id === 'p3'; }).finding_id).toBeNull();
  });

  it('unlink: sets finding_id to null', () => {
    var updated = updatePhotoInMemory(PHOTOS, 'p2', null);
    expect(updated.find(function (p) { return p.id === 'p2'; }).finding_id).toBeNull();
  });

  it('does not mutate original array', () => {
    var original = PHOTOS.slice();
    updatePhotoInMemory(PHOTOS, 'p1', 'f99');
    expect(PHOTOS[0].finding_id).toBeNull(); // original unchanged
  });

  it('after link, photo appears in getFindingPhotos', () => {
    var updated = updatePhotoInMemory(PHOTOS, 'p1', 'f2');
    var result = getFindingPhotos(updated, 'f2');
    expect(result).toHaveLength(2); // p4 was already linked to f2, now p1 too
    var ids = result.map(function (p) { return p.id; });
    expect(ids).toContain('p1');
    expect(ids).toContain('p4');
  });

  it('after unlink, photo no longer in getFindingPhotos', () => {
    var updated = updatePhotoInMemory(PHOTOS, 'p2', null);
    var result = getFindingPhotos(updated, 'f1');
    expect(result).toHaveLength(0);
  });

  it('after unlink, photo still in getSectionPhotos', () => {
    var updated = updatePhotoInMemory(PHOTOS, 'p2', null);
    var result = getSectionPhotos(updated, 'sec-1');
    expect(result).toHaveLength(3); // still in same section
    expect(result.find(function (p) { return p.id === 'p2'; }).finding_id).toBeNull();
  });
});
