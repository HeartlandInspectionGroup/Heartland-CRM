/**
 * Unit tests for save-annotated-photo.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/save-annotated-photo');
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
  mockFetchResult = { data: { id: 'photo-1' }, error: null };
  mockUpdateResult = { error: null };
  mod._setClient(mockClient());
});

describe('save-annotated-photo — method guards', () => {
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

describe('save-annotated-photo — validation', () => {
  it('returns 400 when photo_id is missing', async () => {
    var res = await handler(makeEvent({ annotated_url: 'https://example.com/img.png' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/photo_id required/);
  });

  it('returns 400 when annotated_url is missing', async () => {
    var res = await handler(makeEvent({ photo_id: 'photo-1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/annotated_url required/);
  });
});

describe('save-annotated-photo — 404', () => {
  it('returns 404 when photo not found', async () => {
    mockFetchResult = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ photo_id: 'nonexistent', annotated_url: 'https://example.com/img.png' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/photo not found/i);
  });
});

describe('save-annotated-photo — success', () => {
  it('updates annotated_url and returns ok', async () => {
    var res = await handler(makeEvent({ photo_id: 'photo-1', annotated_url: 'https://res.cloudinary.com/annotated.png' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

describe('save-annotated-photo — DB errors', () => {
  it('returns 500 on fetch error', async () => {
    mockFetchResult = { data: null, error: { message: 'DB down' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ photo_id: 'photo-1', annotated_url: 'https://example.com/img.png' }));
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on update error', async () => {
    mockUpdateResult = { error: { message: 'update failed' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ photo_id: 'photo-1', annotated_url: 'https://example.com/img.png' }));
    expect(res.statusCode).toBe(500);
  });
});
