/**
 * Unit tests for delete-finding.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/delete-finding');
const { handler } = mod;

function makeEvent(body, token, method) {
  return {
    httpMethod: method || 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockFetchResult, mockDeleteResult;

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
        delete: function () {
          return {
            eq: function () {
              return Promise.resolve(mockDeleteResult);
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockFetchResult = { data: { id: 'f1' }, error: null };
  mockDeleteResult = { error: null };
  mod._setClient(mockClient());
});

describe('delete-finding — method guards', () => {
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

  it('accepts DELETE method', async () => {
    var res = await handler(makeEvent({ finding_id: 'f1' }, 'test-token', 'DELETE'));
    expect(res.statusCode).toBe(200);
  });
});

describe('delete-finding — validation', () => {
  it('returns 400 when finding_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/finding_id required/);
  });
});

describe('delete-finding — success', () => {
  it('deletes finding and returns ok', async () => {
    var res = await handler(makeEvent({ finding_id: 'f1' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

describe('delete-finding — not found', () => {
  it('returns 404 when finding does not exist', async () => {
    mockFetchResult = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ finding_id: 'nonexistent' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
  });
});

describe('delete-finding — errors', () => {
  it('returns 500 on DB error', async () => {
    mockDeleteResult = { error: { message: 'FK constraint' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ finding_id: 'f1' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('FK constraint');
  });
});
