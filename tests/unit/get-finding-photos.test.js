/**
 * Unit tests for get-finding-photos.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-finding-photos');
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

describe('get-finding-photos — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

describe('get-finding-photos — success', () => {
  it('returns photos for a record', async () => {
    mockResult = {
      data: [
        { id: 'p1', record_id: 'rec-1', cloudinary_url: 'http://example.com/1.jpg', order_index: 0 },
        { id: 'p2', record_id: 'rec-1', cloudinary_url: 'http://example.com/2.jpg', order_index: 1 },
      ],
      error: null,
    };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).photos).toHaveLength(2);
  });

  it('returns empty array when no photos exist', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-empty' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).photos).toEqual([]);
  });
});

describe('get-finding-photos — errors', () => {
  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'db error' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(500);
  });
});
