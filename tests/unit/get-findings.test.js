/**
 * Unit tests for get-findings.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-findings');
const { handler } = mod;

function makeEvent(params, token) {
  return {
    httpMethod: 'GET',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: params || {},
    body: '',
  };
}

var mockResult;

function mockClient() {
  return {
    from: function () {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                order: function () {
                  return Promise.resolve(mockResult);
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
  mockResult = { data: [], error: null };
  mod._setClient(mockClient());
});

// ─── Method guards ────────────────────────────────────────────────────────────

describe('get-findings — method guards', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for POST', async () => {
    var res = await handler({ httpMethod: 'POST', headers: { 'x-admin-token': 'test-token' }, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without admin token', async () => {
    var res = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('get-findings — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

// ─── Success cases ────────────────────────────────────────────────────────────

describe('get-findings — success', () => {
  it('returns nested recommendations per finding', async () => {
    mockResult = {
      data: [
        {
          id: 'f1',
          record_id: 'rec-1',
          section_id: 'sec-1',
          order_index: 0,
          inspection_finding_recommendations: [
            { id: 'r1', recommendation_id: 'wr1', order_index: 1 },
            { id: 'r2', recommendation_id: 'wr2', order_index: 0 },
          ],
        },
      ],
      error: null,
    };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);

    var body = JSON.parse(res.body);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].recommendations).toHaveLength(2);
    // Should be sorted by order_index
    expect(body.findings[0].recommendations[0].order_index).toBe(0);
    expect(body.findings[0].recommendations[1].order_index).toBe(1);
    // Raw join key should be removed
    expect(body.findings[0].inspection_finding_recommendations).toBeUndefined();
  });

  it('returns empty array when no findings exist', async () => {
    mockResult = { data: [], error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-empty' }));
    expect(res.statusCode).toBe(200);

    var body = JSON.parse(res.body);
    expect(body.findings).toEqual([]);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('get-findings — errors', () => {
  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'connection refused' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('connection refused');
  });
});
