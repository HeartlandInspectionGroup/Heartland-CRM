/**
 * Unit tests for get-property-profile.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-property-profile');
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
                maybeSingle: function () {
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
  mockResult = { data: null, error: null };
  mod._setClient(mockClient());
});

// ─── Method guards ────────────────────────────────────────────────────────────

describe('get-property-profile — method guards', () => {
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

describe('get-property-profile — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

// ─── Success ──────────────────────────────────────────────────────────────────

describe('get-property-profile — success', () => {
  it('returns profile when one exists', async () => {
    mockResult = {
      data: { id: 'pp-1', record_id: 'rec-1', property_type: 'single_family' },
      error: null,
    };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);

    var body = JSON.parse(res.body);
    expect(body.profile).not.toBeNull();
    expect(body.profile.property_type).toBe('single_family');
  });

  it('returns null when no profile exists', async () => {
    mockResult = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-empty' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).profile).toBeNull();
  });
});

// ─── Errors ───────────────────────────────────────────────────────────────────

describe('get-property-profile — errors', () => {
  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'timeout' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('timeout');
  });
});
