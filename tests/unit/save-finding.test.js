/**
 * Unit tests for save-finding.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/save-finding');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockUpsertResult, mockDeleteResult, mockInsertResult;
var capturedUpsert, capturedDelete, capturedInsert;

function mockClient() {
  return {
    from: function (table) {
      if (table === 'inspection_findings') {
        return {
          upsert: function (row, opts) {
            capturedUpsert = { row, opts };
            return {
              select: function () {
                return {
                  single: function () {
                    return Promise.resolve(mockUpsertResult);
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'inspection_finding_recommendations') {
        return {
          delete: function () {
            return {
              eq: function (col, val) {
                capturedDelete = { col, val };
                return Promise.resolve(mockDeleteResult);
              },
            };
          },
          insert: function (rows) {
            capturedInsert = rows;
            return Promise.resolve(mockInsertResult);
          },
        };
      }
      return {};
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockUpsertResult = { data: { id: 'finding-uuid-1' }, error: null };
  mockDeleteResult = { error: null };
  mockInsertResult = { error: null };
  capturedUpsert = null;
  capturedDelete = null;
  capturedInsert = null;
  mod._setClient(mockClient());
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('save-finding — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({ section_id: 's1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });

  it('returns 400 when section_id is missing', async () => {
    var res = await handler(makeEvent({ record_id: 'r1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/section_id required/);
  });

  it('returns 400 on invalid JSON', async () => {
    var res = await handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'test-token' },
      queryStringParameters: {},
      body: 'not-json',
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Upsert ───────────────────────────────────────────────────────────────────

describe('save-finding — upsert', () => {
  it('upserts a new finding and returns id', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      field_id: 'fld-1',
      condition_value: 'good',
      observation: 'Looks fine',
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('finding-uuid-1');

    // Verify upsert was called with correct conflict target
    expect(capturedUpsert.opts.onConflict).toBe('record_id,section_id,field_id');
    expect(capturedUpsert.row.record_id).toBe('rec-1');
    expect(capturedUpsert.row.section_id).toBe('sec-1');
    expect(capturedUpsert.row.condition_value).toBe('good');
  });

  it('updates existing finding via upsert (same identifiers)', async () => {
    mockUpsertResult = { data: { id: 'existing-finding' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      field_id: 'fld-1',
      condition_value: 'poor',
      is_safety: true,
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('existing-finding');
    expect(capturedUpsert.row.condition_value).toBe('poor');
    expect(capturedUpsert.row.is_safety).toBe(true);
  });

  it('does not pass unknown fields to upsert', async () => {
    await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      evil_field: 'DROP TABLE',
    }));

    expect(capturedUpsert.row.evil_field).toBeUndefined();
  });
});

// ─── Recommendations ─────────────────────────────────────────────────────────

describe('save-finding — recommendations', () => {
  it('replaces recommendations (delete + insert)', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      recommendation_ids: ['wr-1', 'wr-2'],
    }));

    expect(res.statusCode).toBe(200);

    // Should delete existing recommendations for this finding
    expect(capturedDelete.col).toBe('finding_id');
    expect(capturedDelete.val).toBe('finding-uuid-1');

    // Should insert new ones with order_index
    expect(capturedInsert).toHaveLength(2);
    expect(capturedInsert[0].recommendation_id).toBe('wr-1');
    expect(capturedInsert[0].order_index).toBe(0);
    expect(capturedInsert[1].recommendation_id).toBe('wr-2');
    expect(capturedInsert[1].order_index).toBe(1);
  });

  it('does not touch recommendations when recommendation_ids is absent', async () => {
    await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      condition_value: 'good',
    }));

    expect(capturedDelete).toBeNull();
    expect(capturedInsert).toBeNull();
  });

  it('deletes all recommendations when empty array is passed', async () => {
    await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      recommendation_ids: [],
    }));

    // Should delete but not insert
    expect(capturedDelete.col).toBe('finding_id');
    expect(capturedInsert).toBeNull();
  });

  it('accepts [{id, note}] objects and saves recommendation_note', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      recommendation_ids: [
        { id: 'wr-1', note: 'Fix ASAP' },
        { id: 'wr-2', note: '' },
      ],
    }));

    expect(res.statusCode).toBe(200);
    expect(capturedInsert).toHaveLength(2);
    expect(capturedInsert[0].recommendation_id).toBe('wr-1');
    expect(capturedInsert[0].recommendation_note).toBe('Fix ASAP');
    expect(capturedInsert[1].recommendation_id).toBe('wr-2');
    expect(capturedInsert[1].recommendation_note).toBeNull();
  });

  it('handles mixed string and object recommendation_ids', async () => {
    await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
      recommendation_ids: ['wr-1', { id: 'wr-2', note: 'Check later' }],
    }));

    expect(capturedInsert).toHaveLength(2);
    expect(capturedInsert[0].recommendation_id).toBe('wr-1');
    expect(capturedInsert[0].recommendation_note).toBeNull();
    expect(capturedInsert[1].recommendation_id).toBe('wr-2');
    expect(capturedInsert[1].recommendation_note).toBe('Check later');
  });
});

// ─── Errors ───────────────────────────────────────────────────────────────────

describe('save-finding — errors', () => {
  it('returns 500 on upsert error', async () => {
    mockUpsertResult = { data: null, error: { message: 'constraint violation' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({
      record_id: 'rec-1',
      section_id: 'sec-1',
    }));

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('constraint violation');
  });
});
