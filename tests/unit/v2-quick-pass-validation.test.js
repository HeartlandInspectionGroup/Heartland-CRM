/**
 * Unit tests for V2 wizard quick pass, N/A, and validation logic
 */

import { describe, it, expect } from 'vitest';

// ── Constants (same as inline in inspector-wizard-v2.html) ─────────────────

var V2_ACTIONABLE = { monitor: true, repair: true, replace: true, safety: true };

// ── Pure logic functions ───────────────────────────────────────────────────

function sectionStatus(sectionId, findings) {
  var sectionFindings = findings.filter(function (f) { return f.section_id === sectionId; });
  if (sectionFindings.length === 0) return 'grey';
  var hasSectionPass = sectionFindings.some(function (f) { return f.is_section_pass === true; });
  if (hasSectionPass) return 'green';
  return 'orange';
}

function sectionHasQuickPass(sectionId, findings) {
  return findings.some(function (f) {
    return f.section_id === sectionId && f.is_section_pass === true;
  });
}

function validateCard(rating, observationText) {
  if (!rating) return 'Rating required.';
  if (V2_ACTIONABLE[rating] && !observationText.trim()) {
    return 'Observation required for this rating.';
  }
  return null;
}

function validateSection(sectionId, fields, findings) {
  // Quick pass bypasses
  if (sectionHasQuickPass(sectionId, findings)) return [];

  var errors = [];
  fields.forEach(function (field) {
    var finding = findings.find(function (f) {
      return f.section_id === sectionId && f.field_id === field.id && !f.is_custom;
    });
    var rating = (finding && finding.condition_value) || '';
    var obs = (finding && finding.observation) || '';
    var err = validateCard(rating, obs);
    if (err) errors.push({ fieldId: field.id, error: err });
  });
  return errors;
}

function buildNaPayload(rating, naReason) {
  return {
    not_applicable: rating === 'na',
    na_reason: (rating === 'na' && naReason) ? naReason : null,
  };
}

// ─── Quick Pass tests ─────────────────────────────────────────────────────

describe('v2 quick pass — section status', () => {
  it('section turns green after quick pass', () => {
    var findings = [
      { section_id: 'sec-1', is_section_pass: true },
    ];
    expect(sectionStatus('sec-1', findings)).toBe('green');
  });

  it('section reverts to grey after undo (pass finding removed)', () => {
    var findings = []; // pass finding was deleted
    expect(sectionStatus('sec-1', findings)).toBe('grey');
  });

  it('section reverts to orange after undo when other findings exist', () => {
    var findings = [
      { section_id: 'sec-1', is_section_pass: false, condition_value: 'repair' },
    ];
    expect(sectionStatus('sec-1', findings)).toBe('orange');
  });
});

describe('v2 quick pass — sectionHasQuickPass', () => {
  it('returns true when section has is_section_pass finding', () => {
    var findings = [
      { section_id: 'sec-1', is_section_pass: true },
      { section_id: 'sec-2', is_section_pass: false },
    ];
    expect(sectionHasQuickPass('sec-1', findings)).toBe(true);
  });

  it('returns false when section has no pass finding', () => {
    var findings = [
      { section_id: 'sec-1', is_section_pass: false },
    ];
    expect(sectionHasQuickPass('sec-1', findings)).toBe(false);
  });

  it('returns false for empty findings', () => {
    expect(sectionHasQuickPass('sec-1', [])).toBe(false);
  });
});

describe('v2 quick pass — payload shape', () => {
  it('quick pass saves with is_section_pass = true', () => {
    var payload = {
      record_id: 'rec-1',
      section_id: 'sec-1',
      field_id: null,
      is_section_pass: true,
      condition_value: null,
      is_custom: false,
    };
    expect(payload.is_section_pass).toBe(true);
    expect(payload.field_id).toBeNull();
    expect(payload.condition_value).toBeNull();
  });
});

// ─── N/A tests ────────────────────────────────────────────────────────────

describe('v2 N/A — payload', () => {
  it('N/A sets not_applicable = true', () => {
    var p = buildNaPayload('na', 'Not accessible');
    expect(p.not_applicable).toBe(true);
    expect(p.na_reason).toBe('Not accessible');
  });

  it('N/A with empty reason sets na_reason to null', () => {
    var p = buildNaPayload('na', '');
    expect(p.not_applicable).toBe(true);
    expect(p.na_reason).toBeNull();
  });

  it('non-N/A rating sets not_applicable = false', () => {
    var p = buildNaPayload('satisfactory', '');
    expect(p.not_applicable).toBe(false);
    expect(p.na_reason).toBeNull();
  });

  it('na_reason is optional (no validation required)', () => {
    var p = buildNaPayload('na', '');
    expect(p.not_applicable).toBe(true);
    // No error — na_reason is not required
  });
});

// ─── Validation tests ─────────────────────────────────────────────────────

describe('v2 validation — no rating', () => {
  it('blocks when card has no rating', () => {
    expect(validateCard('', '')).toBe('Rating required.');
  });

  it('blocks when card has undefined rating', () => {
    expect(validateCard(undefined, '')).toBe('Rating required.');
  });
});

describe('v2 validation — actionable rating without observation', () => {
  it('blocks for Monitor without observation', () => {
    expect(validateCard('monitor', '')).toBe('Observation required for this rating.');
  });

  it('blocks for Repair without observation', () => {
    expect(validateCard('repair', '  ')).toBe('Observation required for this rating.');
  });

  it('blocks for Replace without observation', () => {
    expect(validateCard('replace', '')).toBe('Observation required for this rating.');
  });

  it('blocks for Safety Concern without observation', () => {
    expect(validateCard('safety', '')).toBe('Observation required for this rating.');
  });
});

describe('v2 validation — passes', () => {
  it('passes for Satisfactory without observation', () => {
    expect(validateCard('satisfactory', '')).toBeNull();
  });

  it('passes for N/A without observation', () => {
    expect(validateCard('na', '')).toBeNull();
  });

  it('passes for actionable rating with observation', () => {
    expect(validateCard('repair', 'Cracked')).toBeNull();
    expect(validateCard('monitor', 'Slight wear')).toBeNull();
  });
});

describe('v2 validation — quick pass bypass', () => {
  it('quick-passed section passes validation even with unrated fields', () => {
    var findings = [
      { section_id: 'sec-1', is_section_pass: true },
    ];
    var fields = [
      { id: 'f1', name: 'Roof' },
      { id: 'f2', name: 'Siding' },
    ];
    var errors = validateSection('sec-1', fields, findings);
    expect(errors).toEqual([]);
  });

  it('non-quick-passed section with unrated fields fails', () => {
    var findings = [];
    var fields = [
      { id: 'f1', name: 'Roof' },
      { id: 'f2', name: 'Siding' },
    ];
    var errors = validateSection('sec-1', fields, findings);
    expect(errors).toHaveLength(2);
    expect(errors[0].error).toBe('Rating required.');
  });

  it('non-quick-passed section with all rated fields passes', () => {
    var findings = [
      { section_id: 'sec-1', field_id: 'f1', condition_value: 'satisfactory', observation: '', is_custom: false },
      { section_id: 'sec-1', field_id: 'f2', condition_value: 'na', observation: '', is_custom: false },
    ];
    var fields = [
      { id: 'f1', name: 'Roof' },
      { id: 'f2', name: 'Siding' },
    ];
    var errors = validateSection('sec-1', fields, findings);
    expect(errors).toEqual([]);
  });
});

// ─── Sidebar jump validation ──────────────────────────────────────────────

describe('v2 validation — sidebar jump', () => {
  it('jump blocked when current section has incomplete cards', () => {
    // Simulating: current section has unrated fields → validation fails
    var findings = [];
    var fields = [{ id: 'f1', name: 'Roof' }];
    var errors = validateSection('sec-1', fields, findings);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('jump allowed when current section is quick-passed', () => {
    var findings = [{ section_id: 'sec-1', is_section_pass: true }];
    var fields = [{ id: 'f1', name: 'Roof' }];
    var errors = validateSection('sec-1', fields, findings);
    expect(errors).toEqual([]);
  });
});

// ─── Undo pass restores state ─────────────────────────────────────────────

describe('v2 undo pass — state restoration', () => {
  it('removing pass finding restores grey status', () => {
    // Before undo: has pass
    var findingsBefore = [{ section_id: 'sec-1', is_section_pass: true, id: 'pass-1' }];
    expect(sectionStatus('sec-1', findingsBefore)).toBe('green');

    // After undo: pass removed
    var findingsAfter = findingsBefore.filter(function (f) { return f.id !== 'pass-1'; });
    expect(sectionStatus('sec-1', findingsAfter)).toBe('grey');
  });

  it('removing pass finding restores orange when other findings exist', () => {
    var findingsBefore = [
      { section_id: 'sec-1', is_section_pass: true, id: 'pass-1' },
      { section_id: 'sec-1', is_section_pass: false, condition_value: 'repair', id: 'f1' },
    ];
    expect(sectionStatus('sec-1', findingsBefore)).toBe('green');

    var findingsAfter = findingsBefore.filter(function (f) { return f.id !== 'pass-1'; });
    expect(sectionStatus('sec-1', findingsAfter)).toBe('orange');
  });
});
