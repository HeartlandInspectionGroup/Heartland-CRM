/**
 * Unit tests for V2 wizard finding card logic
 *
 * Tests the pure logic behind card rendering, validation, and auto-behavior.
 */

import { describe, it, expect } from 'vitest';

// ── Constants (same as inline in inspector-wizard-v2.html) ─────────────────

var V2_ACTIONABLE = { monitor: true, repair: true, replace: true, safety: true };

// ── Pure logic functions ───────────────────────────────────────────────────

/**
 * Is observation text required for this rating?
 */
function isObservationRequired(rating) {
  return !!V2_ACTIONABLE[rating];
}

/**
 * Should priority selector be visible?
 */
function isPriorityVisible(rating) {
  return !!rating && rating !== 'satisfactory' && rating !== 'na';
}

/**
 * Should safety flag auto-enable?
 */
function shouldAutoEnableSafety(rating) {
  return rating === 'safety';
}

/**
 * Should type-specific inputs be shown?
 */
function showMeasurement(fieldType) { return fieldType === 'measurement'; }
function showMaterials(fieldType) { return fieldType === 'materials'; }
function showYesNo(fieldType) { return fieldType === 'yes_no'; }

/**
 * Validate a card: returns error message or null.
 */
function validateCard(rating, observationText) {
  if (V2_ACTIONABLE[rating] && !observationText.trim()) {
    return 'Observation required for this rating.';
  }
  return null;
}

/**
 * Cards render in correct field order (fields already sorted by order_index from DB).
 */
function sortFields(fields) {
  return fields.slice().sort(function (a, b) { return a.order_index - b.order_index; });
}

/**
 * Normalize recommendation_ids to [{id, note}] format (backward-compatible).
 */
function normalizeRecommendations(items) {
  return items.map(function (item) {
    if (typeof item === 'string') return { id: item, note: null };
    return { id: item.id, note: item.note || null };
  });
}

// ─── Observation required tests ───────────────────────────────────────────

describe('v2 finding cards — observation required', () => {
  it('required for Monitor', () => {
    expect(isObservationRequired('monitor')).toBe(true);
  });

  it('required for Repair', () => {
    expect(isObservationRequired('repair')).toBe(true);
  });

  it('required for Replace', () => {
    expect(isObservationRequired('replace')).toBe(true);
  });

  it('required for Safety Concern', () => {
    expect(isObservationRequired('safety')).toBe(true);
  });

  it('NOT required for Satisfactory', () => {
    expect(isObservationRequired('satisfactory')).toBe(false);
  });

  it('NOT required for N/A', () => {
    expect(isObservationRequired('na')).toBe(false);
  });

  it('NOT required when no rating', () => {
    expect(isObservationRequired('')).toBe(false);
    expect(isObservationRequired(undefined)).toBe(false);
  });
});

// ─── Priority visibility tests ────────────────────────────────────────────

describe('v2 finding cards — priority visibility', () => {
  it('hidden for satisfactory', () => {
    expect(isPriorityVisible('satisfactory')).toBe(false);
  });

  it('hidden for N/A', () => {
    expect(isPriorityVisible('na')).toBe(false);
  });

  it('hidden when no rating', () => {
    expect(isPriorityVisible('')).toBe(false);
  });

  it('visible for monitor', () => {
    expect(isPriorityVisible('monitor')).toBe(true);
  });

  it('visible for repair', () => {
    expect(isPriorityVisible('repair')).toBe(true);
  });

  it('visible for safety', () => {
    expect(isPriorityVisible('safety')).toBe(true);
  });
});

// ─── Safety auto-enable tests ─────────────────────────────────────────────

describe('v2 finding cards — safety flag auto-enable', () => {
  it('auto-enables on Safety Concern', () => {
    expect(shouldAutoEnableSafety('safety')).toBe(true);
  });

  it('does NOT auto-enable on other ratings', () => {
    expect(shouldAutoEnableSafety('satisfactory')).toBe(false);
    expect(shouldAutoEnableSafety('monitor')).toBe(false);
    expect(shouldAutoEnableSafety('repair')).toBe(false);
    expect(shouldAutoEnableSafety('replace')).toBe(false);
    expect(shouldAutoEnableSafety('na')).toBe(false);
  });
});

// ─── Type-specific input visibility ───────────────────────────────────────

describe('v2 finding cards — type-specific inputs', () => {
  it('measurement inputs shown only for measurement field_type', () => {
    expect(showMeasurement('measurement')).toBe(true);
    expect(showMeasurement('text')).toBe(false);
    expect(showMeasurement('condition_rating')).toBe(false);
    expect(showMeasurement('yes_no')).toBe(false);
  });

  it('materials input shown only for materials field_type', () => {
    expect(showMaterials('materials')).toBe(true);
    expect(showMaterials('text')).toBe(false);
    expect(showMaterials('measurement')).toBe(false);
  });

  it('yes/no toggle shown only for yes_no field_type', () => {
    expect(showYesNo('yes_no')).toBe(true);
    expect(showYesNo('text')).toBe(false);
    expect(showYesNo('measurement')).toBe(false);
  });
});

// ─── Validation tests ─────────────────────────────────────────────────────

describe('v2 finding cards — validation', () => {
  it('fails when actionable rating has no observation', () => {
    expect(validateCard('monitor', '')).toBe('Observation required for this rating.');
    expect(validateCard('repair', '')).toBe('Observation required for this rating.');
    expect(validateCard('replace', '  ')).toBe('Observation required for this rating.');
    expect(validateCard('safety', '')).toBe('Observation required for this rating.');
  });

  it('passes when actionable rating has observation', () => {
    expect(validateCard('monitor', 'Needs attention')).toBeNull();
    expect(validateCard('repair', 'Crack visible')).toBeNull();
  });

  it('passes for satisfactory with no observation', () => {
    expect(validateCard('satisfactory', '')).toBeNull();
  });

  it('passes for N/A with no observation', () => {
    expect(validateCard('na', '')).toBeNull();
  });

  it('passes when no rating selected', () => {
    expect(validateCard('', '')).toBeNull();
  });
});

// ─── Field ordering test ──────────────────────────────────────────────────

describe('v2 finding cards — field ordering', () => {
  it('renders fields in order_index order', () => {
    var fields = [
      { id: 'f3', name: 'Plumbing', order_index: 2 },
      { id: 'f1', name: 'Roof', order_index: 0 },
      { id: 'f2', name: 'Siding', order_index: 1 },
    ];
    var sorted = sortFields(fields);
    expect(sorted[0].name).toBe('Roof');
    expect(sorted[1].name).toBe('Siding');
    expect(sorted[2].name).toBe('Plumbing');
  });
});

// ─── Recommendation normalization ─────────────────────────────────────────

describe('v2 finding cards — recommendation normalization', () => {
  it('handles string array (backward-compatible)', () => {
    var result = normalizeRecommendations(['uuid-1', 'uuid-2']);
    expect(result).toEqual([
      { id: 'uuid-1', note: null },
      { id: 'uuid-2', note: null },
    ]);
  });

  it('handles object array with notes', () => {
    var result = normalizeRecommendations([
      { id: 'uuid-1', note: 'Fix asap' },
      { id: 'uuid-2', note: '' },
    ]);
    expect(result).toEqual([
      { id: 'uuid-1', note: 'Fix asap' },
      { id: 'uuid-2', note: null },
    ]);
  });

  it('handles mixed array', () => {
    var result = normalizeRecommendations(['uuid-1', { id: 'uuid-2', note: 'test' }]);
    expect(result).toEqual([
      { id: 'uuid-1', note: null },
      { id: 'uuid-2', note: 'test' },
    ]);
  });
});

// ─── Custom finding card ──────────────────────────────────────────────────

describe('v2 finding cards — custom findings', () => {
  it('custom finding has is_custom = true', () => {
    var payload = { is_custom: true, custom_label: 'Water Stain' };
    expect(payload.is_custom).toBe(true);
    expect(payload.custom_label).toBe('Water Stain');
  });
});
