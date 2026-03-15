/**
 * Unit tests for get-wizard-fields.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-wizard-fields');
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
            in: function () {
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
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockResult = { data: [], error: null };
  mod._setClient(mockClient());
});

describe('get-wizard-fields — validation', () => {
  it('returns 400 when section_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/section_id required/);
  });
});

describe('get-wizard-fields — success', () => {
  it('returns fields ordered by order_index', async () => {
    mockResult = {
      data: [
        { id: 'f1', name: 'Roof Covering', field_type: 'condition_rating', order_index: 0 },
        { id: 'f2', name: 'Flashing', field_type: 'condition_rating', order_index: 1 },
      ],
      error: null,
    };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ section_id: 'sec-1' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).fields).toHaveLength(2);
  });

  it('supports comma-separated section_ids', async () => {
    mockResult = { data: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }], error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ section_id: 'sec-1,sec-2' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).fields).toHaveLength(3);
  });

  it('returns empty array when no fields match', async () => {
    var res = await handler(makeEvent({ section_id: 'nonexistent' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).fields).toEqual([]);
  });
});

describe('get-wizard-fields — errors', () => {
  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'db error' } };
    mod._setClient(mockClient());
    var res = await handler(makeEvent({ section_id: 'sec-1' }));
    expect(res.statusCode).toBe(500);
  });
});
