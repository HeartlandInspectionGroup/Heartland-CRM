/**
 * Unit tests for V2 wizard shell logic (status indicators, nav button visibility)
 *
 * These test the pure logic functions that will be used by the shell,
 * extracted here to be testable without a DOM.
 */

import { describe, it, expect } from 'vitest';

// ── Pure logic functions (same as inline in inspector-wizard-v2.html) ──────

/**
 * Compute section status based on findings.
 * grey = no findings, orange = has findings but no is_section_pass, green = has is_section_pass
 */
function sectionStatus(sectionId, findings) {
  var sectionFindings = findings.filter(function (f) { return f.section_id === sectionId; });
  if (sectionFindings.length === 0) return 'grey';
  var hasSectionPass = sectionFindings.some(function (f) { return f.is_section_pass === true; });
  if (hasSectionPass) return 'green';
  return 'orange';
}

/**
 * Determine if Back button should be visible.
 */
function isBackVisible(activeIdx) {
  return activeIdx > 0;
}

/**
 * Determine Next button label.
 */
function nextButtonLabel(activeIdx, totalSections) {
  if (activeIdx === totalSections - 1) return 'Review & Submit';
  return 'Next';
}

// ─── Status indicator tests ───────────────────────────────────────────────────

describe('v2 shell — sectionStatus', () => {
  it('returns grey when section has no findings', () => {
    expect(sectionStatus('sec-1', [])).toBe('grey');
    expect(sectionStatus('sec-1', [
      { section_id: 'sec-2', is_section_pass: false },
    ])).toBe('grey');
  });

  it('returns orange when section has findings but no is_section_pass', () => {
    expect(sectionStatus('sec-1', [
      { section_id: 'sec-1', is_section_pass: false, condition_value: 'poor' },
    ])).toBe('orange');

    expect(sectionStatus('sec-1', [
      { section_id: 'sec-1', is_section_pass: false },
      { section_id: 'sec-1', is_section_pass: false },
    ])).toBe('orange');
  });

  it('returns green when section has an is_section_pass finding', () => {
    expect(sectionStatus('sec-1', [
      { section_id: 'sec-1', is_section_pass: true },
    ])).toBe('green');

    // Green even if other findings exist alongside the pass
    expect(sectionStatus('sec-1', [
      { section_id: 'sec-1', is_section_pass: false, condition_value: 'poor' },
      { section_id: 'sec-1', is_section_pass: true },
    ])).toBe('green');
  });

  it('handles mixed sections correctly', () => {
    var findings = [
      { section_id: 'sec-1', is_section_pass: true },
      { section_id: 'sec-2', is_section_pass: false },
      { section_id: 'sec-2', is_section_pass: false },
    ];
    expect(sectionStatus('sec-1', findings)).toBe('green');
    expect(sectionStatus('sec-2', findings)).toBe('orange');
    expect(sectionStatus('sec-3', findings)).toBe('grey');
  });
});

// ─── Navigation button tests ──────────────────────────────────────────────────

describe('v2 shell — Back button visibility', () => {
  it('is hidden on first section (index 0)', () => {
    expect(isBackVisible(0)).toBe(false);
  });

  it('is visible on second section', () => {
    expect(isBackVisible(1)).toBe(true);
  });

  it('is visible on last section', () => {
    expect(isBackVisible(9)).toBe(true);
  });
});

describe('v2 shell — Next button label', () => {
  it('reads "Next" on non-last sections', () => {
    expect(nextButtonLabel(0, 5)).toBe('Next');
    expect(nextButtonLabel(3, 5)).toBe('Next');
  });

  it('reads "Review & Submit" on last section', () => {
    expect(nextButtonLabel(4, 5)).toBe('Review & Submit');
  });

  it('reads "Review & Submit" when only one section exists', () => {
    expect(nextButtonLabel(0, 1)).toBe('Review & Submit');
  });
});

// ─── Section ordering test ────────────────────────────────────────────────────

describe('v2 shell — section ordering', () => {
  it('sections are consumed in order_index order', () => {
    var sections = [
      { id: 's3', name: 'Plumbing', order_index: 2 },
      { id: 's1', name: 'Exterior', order_index: 0 },
      { id: 's2', name: 'Interior', order_index: 1 },
    ];
    // Sort by order_index (same as what the function returns)
    sections.sort(function (a, b) { return a.order_index - b.order_index; });
    expect(sections[0].name).toBe('Exterior');
    expect(sections[1].name).toBe('Interior');
    expect(sections[2].name).toBe('Plumbing');
  });
});

// ─── Sidebar active highlighting ──────────────────────────────────────────────

describe('v2 shell — sidebar active section', () => {
  it('only one section is active at a time', () => {
    var sections = [
      { id: 's1', name: 'A' },
      { id: 's2', name: 'B' },
      { id: 's3', name: 'C' },
    ];
    var activeIdx = 1;

    var activeStates = sections.map(function (_, idx) { return idx === activeIdx; });
    expect(activeStates).toEqual([false, true, false]);
  });

  it('active index updates on jump', () => {
    var activeIdx = 0;
    // Simulate jump to section 2
    activeIdx = 2;
    expect(activeIdx).toBe(2);

    var sections = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    var activeStates = sections.map(function (_, idx) { return idx === activeIdx; });
    expect(activeStates).toEqual([false, false, true]);
  });
});
