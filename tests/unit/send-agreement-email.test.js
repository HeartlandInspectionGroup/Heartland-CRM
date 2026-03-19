/**
 * Unit tests for send-agreement-email.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/send-agreement-email');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockRecord, fetchCalls;

function mockClient() {
  return {
    from: function () {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                maybeSingle: function () {
                  return Promise.resolve(mockRecord);
                },
              };
            },
          };
        },
      };
    },
  };
}

function mockFetch(status, respBody) {
  fetchCalls = [];
  return function (url, opts) {
    fetchCalls.push({ url: url, opts: opts });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      json: function () { return Promise.resolve(respBody); },
    });
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  process.env.SITE_URL = 'https://test.example.com';
  mockRecord = { data: { id: 'rec-1', booking_id: 'book-1' }, error: null };
  fetchCalls = [];
  mod._setClient(mockClient());
  mod._setFetch(mockFetch(200, { success: true }));
});

describe('send-agreement-email — method guards', () => {
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

describe('send-agreement-email — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

describe('send-agreement-email — 404', () => {
  it('returns 404 when record not found', async () => {
    mockRecord = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'nonexistent' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/record not found/i);
  });

  it('returns 404 when record has no booking_id', async () => {
    mockRecord = { data: { id: 'rec-1', booking_id: null }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/no booking found/i);
  });
});

describe('send-agreement-email — success', () => {
  it('calls confirm-booking-email with portal_only and correct booking_id', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    // Verify the fetch call
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe('https://test.example.com/.netlify/functions/confirm-booking-email');
    var sentBody = JSON.parse(fetchCalls[0].opts.body);
    expect(sentBody.booking_id).toBe('book-1');
    expect(sentBody.portal_only).toBe(true);
  });
});

describe('send-agreement-email — upstream failure', () => {
  it('returns upstream error when confirm-booking-email fails', async () => {
    mod._setFetch(mockFetch(500, { error: 'Resend error' }));

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/resend error/i);
  });
});
