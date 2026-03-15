/**
 * Unit tests for submit-inspection-v2.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/submit-inspection-v2');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockFetchResult, mockUpdateResult;

function mockClient() {
  return {
    from: function () {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                maybeSingle: function () {
                  return Promise.resolve(mockFetchResult);
                },
              };
            },
          };
        },
        update: function () {
          return {
            eq: function () {
              return Promise.resolve(mockUpdateResult);
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockFetchResult = { data: { id: 'rec-1', status: 'scheduled' }, error: null };
  mockUpdateResult = { error: null };
  mod._setClient(mockClient());
});

describe('submit-inspection-v2 — method guards', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for GET', async () => {
    var res = await handler({ httpMethod: 'GET', headers: { 'x-admin-token': 'test-token' }, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without admin token', async () => {
    var res = await handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {}, body: '{}' });
    expect(res.statusCode).toBe(401);
  });
});

describe('submit-inspection-v2 — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

describe('submit-inspection-v2 — success', () => {
  it('sets status to submitted and returns ok', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

describe('submit-inspection-v2 — 404', () => {
  it('returns 404 when record not found', async () => {
    mockFetchResult = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'nonexistent' }));
    expect(res.statusCode).toBe(404);
  });
});

describe('submit-inspection-v2 — 409', () => {
  it('returns 409 when already submitted', async () => {
    mockFetchResult = { data: { id: 'rec-1', status: 'submitted' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/already submitted/i);
  });
});

describe('submit-inspection-v2 — errors', () => {
  it('returns 500 on DB error', async () => {
    mockUpdateResult = { error: { message: 'DB down' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(500);
  });
});
