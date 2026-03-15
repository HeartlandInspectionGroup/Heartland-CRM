/**
 * Unit tests for get-wizard-sections.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-wizard-sections');
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
                contains: function () {
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
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockResult = { data: [], error: null };
  mod._setClient(mockClient());
});

describe('get-wizard-sections — method guards', () => {
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

describe('get-wizard-sections — validation', () => {
  it('returns 400 when category is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/category required/);
  });
});

describe('get-wizard-sections — success', () => {
  it('returns sections ordered by order_index', async () => {
    mockResult = {
      data: [
        { id: 's1', name: 'Exterior', order_index: 0, icon: '🏠' },
        { id: 's2', name: 'Interior', order_index: 1, icon: '🏡' },
      ],
      error: null,
    };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ category: 'home_inspection' }));
    expect(res.statusCode).toBe(200);

    var body = JSON.parse(res.body);
    expect(body.sections).toHaveLength(2);
    expect(body.sections[0].name).toBe('Exterior');
    expect(body.sections[1].name).toBe('Interior');
  });

  it('returns empty array when no sections match', async () => {
    mockResult = { data: [], error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ category: 'nonexistent' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).sections).toEqual([]);
  });
});

describe('get-wizard-sections — errors', () => {
  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'db error' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ category: 'home_inspection' }));
    expect(res.statusCode).toBe(500);
  });
});
