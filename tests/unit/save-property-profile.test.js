/**
 * Unit tests for save-property-profile.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/save-property-profile');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockExistingResult, mockInsertResult, mockUpdateResult;
var capturedInsert, capturedUpdateRow;

function mockClient() {
  return {
    from: function (table) {
      return {
        select: function (cols) {
          // Used for both the existence check and the .select('id') after insert/update
          return {
            eq: function () {
              return {
                maybeSingle: function () {
                  return Promise.resolve(mockExistingResult);
                },
                single: function () {
                  // This is the return from insert().select().single() or update().select().single()
                  // The insert/update mock chains will handle this
                  return Promise.resolve(mockInsertResult);
                },
              };
            },
          };
        },
        insert: function (row) {
          capturedInsert = row;
          return {
            select: function () {
              return {
                single: function () {
                  return Promise.resolve(mockInsertResult);
                },
              };
            },
          };
        },
        update: function (row) {
          capturedUpdateRow = row;
          return {
            eq: function () {
              return {
                select: function () {
                  return {
                    single: function () {
                      return Promise.resolve(mockUpdateResult);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockExistingResult = { data: null, error: null }; // No existing profile
  mockInsertResult = { data: { id: 'pp-new' }, error: null };
  mockUpdateResult = { data: { id: 'pp-existing' }, error: null };
  capturedInsert = null;
  capturedUpdateRow = null;
  mod._setClient(mockClient());
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('save-property-profile — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({ property_type: 'condo' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });

  it('returns 400 when property_type is missing', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/property_type required/);
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

// ─── Insert (no existing profile) ─────────────────────────────────────────────

describe('save-property-profile — insert', () => {
  it('inserts a new profile and returns id', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      property_type: 'single_family',
      foundation_type: 'basement',
      year_built: 1998,
      has_pool: true,
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('pp-new');
    expect(capturedInsert.property_type).toBe('single_family');
    expect(capturedInsert.foundation_type).toBe('basement');
    expect(capturedInsert.year_built).toBe(1998);
    expect(capturedInsert.has_pool).toBe(true);
  });

  it('does not pass unknown fields', async () => {
    await handler(makeEvent({
      record_id: 'rec-1',
      property_type: 'condo',
      evil: 'DROP TABLE',
    }));

    expect(capturedInsert.evil).toBeUndefined();
  });
});

// ─── Update (existing profile) ────────────────────────────────────────────────

describe('save-property-profile — update', () => {
  it('updates existing profile when one exists', async () => {
    mockExistingResult = { data: { id: 'pp-existing' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({
      record_id: 'rec-1',
      property_type: 'townhouse',
      has_fireplace: true,
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('pp-existing');
    expect(capturedUpdateRow.property_type).toBe('townhouse');
    expect(capturedUpdateRow.has_fireplace).toBe(true);
    // Insert should not have been called
    expect(capturedInsert).toBeNull();
  });
});

// ─── Errors ───────────────────────────────────────────────────────────────────

describe('save-property-profile — errors', () => {
  it('returns 500 on insert error', async () => {
    mockInsertResult = { data: null, error: { message: 'constraint violation' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({
      record_id: 'rec-1',
      property_type: 'condo',
    }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('constraint violation');
  });
});
