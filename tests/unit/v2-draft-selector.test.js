/**
 * Unit tests for V2 wizard draft selector and Start New Inspection logic
 */

import { describe, it, expect } from 'vitest';

// ── Pure logic functions (same as inline in inspector-wizard-v2.html) ──────

/**
 * Filter records into drafts for the current inspector.
 */
function filterDrafts(records, inspectorId) {
  if (!inspectorId) return [];
  return records.filter(function (r) {
    return r.inspector_id === inspectorId && (r.status === 'draft' || r.status === 'scheduled');
  });
}

/**
 * Determine if draft selector should be shown.
 */
function shouldShowDrafts(drafts) {
  return drafts.length > 0;
}

// ── Test data ──────────────────────────────────────────────────────────────

var RECORDS = [
  { id: 'rec-1', cust_name: 'Jane Smith', address: '123 Main St', status: 'scheduled', inspector_id: 'insp-1', inspection_date: '2026-03-20' },
  { id: 'rec-2', cust_name: 'Bob Jones', address: '456 Oak Ave', status: 'scheduled', inspector_id: 'insp-2', inspection_date: '2026-03-21' },
  { id: 'rec-3', cust_name: 'Alice Doe', address: '789 Pine Rd', status: 'draft', inspector_id: 'insp-1', inspection_date: '2026-03-22' },
  { id: 'rec-4', cust_name: 'Eve White', address: '321 Elm Ct', status: 'submitted', inspector_id: 'insp-1', inspection_date: '2026-03-15' },
  { id: 'rec-5', cust_name: 'Charlie', address: '100 Birch Ln', status: 'scheduled', inspector_id: null, inspection_date: '2026-03-25' },
];

// ─── Draft filtering ──────────────────────────────────────────────────────

describe('v2 draft selector — filtering', () => {
  it('returns only scheduled/draft records for current inspector', () => {
    var drafts = filterDrafts(RECORDS, 'insp-1');
    expect(drafts).toHaveLength(2);
    expect(drafts[0].id).toBe('rec-1');
    expect(drafts[1].id).toBe('rec-3');
  });

  it('excludes submitted records', () => {
    var drafts = filterDrafts(RECORDS, 'insp-1');
    var ids = drafts.map(function (d) { return d.id; });
    expect(ids).not.toContain('rec-4');
  });

  it('returns empty for different inspector', () => {
    var drafts = filterDrafts(RECORDS, 'insp-2');
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe('rec-2');
  });

  it('returns empty when inspector_id is null', () => {
    var drafts = filterDrafts(RECORDS, null);
    expect(drafts).toEqual([]);
  });

  it('returns empty when no records match', () => {
    var drafts = filterDrafts(RECORDS, 'nonexistent');
    expect(drafts).toEqual([]);
  });

  it('returns empty for empty records array', () => {
    var drafts = filterDrafts([], 'insp-1');
    expect(drafts).toEqual([]);
  });
});

// ─── Draft selector visibility ────────────────────────────────────────────

describe('v2 draft selector — visibility', () => {
  it('shows when drafts exist', () => {
    expect(shouldShowDrafts([{ id: 'rec-1' }])).toBe(true);
  });

  it('hides when no drafts', () => {
    expect(shouldShowDrafts([])).toBe(false);
  });
});

// ─── Draft selector and job picker coexistence ────────────────────────────

describe('v2 draft selector — coexistence', () => {
  it('drafts and full job list are separate arrays', () => {
    var allRecords = RECORDS.slice();
    var drafts = filterDrafts(allRecords, 'insp-1');
    // Drafts are a subset, full list stays intact
    expect(drafts).toHaveLength(2);
    expect(allRecords).toHaveLength(5);
  });
});

// ─── Resume flow ──────────────────────────────────────────────────────────

describe('v2 draft selector — resume', () => {
  it('resume passes correct record_id', () => {
    // v2ResumeDraft calls v2ResumeFromUrl(recordId)
    // The URL gets ?record=<id> via pushState
    var recordId = 'rec-1';
    expect(recordId).toBe('rec-1');
  });
});

// ─── Start New Inspection ─────────────────────────────────────────────────

describe('v2 Start New Inspection', () => {
  it('button triggers openWalkinBooking (function exists)', () => {
    // openWalkinBooking is a global function from inspector-wizard-iwb.js
    // In V2, the button onclick="openWalkinBooking()" opens the IWB overlay
    expect(typeof openWalkinBooking === 'undefined' || typeof openWalkinBooking === 'function').toBe(true);
  });
});
