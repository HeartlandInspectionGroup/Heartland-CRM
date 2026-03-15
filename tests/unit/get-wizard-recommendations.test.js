/**
 * Unit tests for get-wizard-recommendations.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-wizard-recommendations');
const { handler } = mod;

function makeEvent(token) {
  return {
    httpMethod: 'GET',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
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

describe('get-wizard-recommendations — success', () => {
  it('returns recommendations ordered by order_index', async () => {
    mockResult = {
      data: [
        { id: 'r1', label: 'Repair immediately', order_index: 0 },
        { id: 'r2', label: 'Monitor', order_index: 1 },
      ],
      error: null,
    };
    mod._setClient(mockClient());

    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    var body = JSON.parse(res.body);
    expect(body.recommendations).toHaveLength(2);
    expect(body.recommendations[0].label).toBe('Repair immediately');
  });

  it('returns empty array when none exist', async () => {
    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).recommendations).toEqual([]);
  });
});

describe('get-wizard-recommendations — errors', () => {
  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'timeout' } };
    mod._setClient(mockClient());
    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
  });
});
