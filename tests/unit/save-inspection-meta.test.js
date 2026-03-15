/**
 * Unit tests for save-inspection-meta.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/save-inspection-meta');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockUpdateResult, capturedUpdate, capturedEq;

function mockClient() {
  return {
    from: function () {
      return {
        update: function (vals) {
          capturedUpdate = vals;
          return {
            eq: function (col, val) {
              capturedEq = { col, val };
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
  mockUpdateResult = { error: null };
  capturedUpdate = null;
  capturedEq = null;
  mod._setClient(mockClient());
});

// ─── Method guards ────────────────────────────────────────────────────────────

describe('save-inspection-meta — method guards', () => {
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

// ─── Validation ───────────────────────────────────────────────────────────────

describe('save-inspection-meta — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({ start_time: '09:00' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });

  it('returns 400 when no fields to update', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/No fields to update/);
  });

  it('returns 400 on invalid JSON', async () => {
    var res = await handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'test-token' },
      queryStringParameters: {},
      body: 'bad-json',
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Success ──────────────────────────────────────────────────────────────────

describe('save-inspection-meta — success', () => {
  it('updates start_time and weather_conditions', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      start_time: '09:30',
      weather_conditions: 'Clear',
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(capturedUpdate.start_time).toBe('09:30');
    expect(capturedUpdate.weather_conditions).toBe('Clear');
    expect(capturedEq.col).toBe('id');
    expect(capturedEq.val).toBe('rec-1');
  });

  it('updates only start_time when weather is absent', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      start_time: '10:00',
    }));

    expect(res.statusCode).toBe(200);
    expect(capturedUpdate.start_time).toBe('10:00');
    expect(capturedUpdate.weather_conditions).toBeUndefined();
  });

  it('updates only weather_conditions when start_time is absent', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      weather_conditions: 'Rain',
    }));

    expect(res.statusCode).toBe(200);
    expect(capturedUpdate.weather_conditions).toBe('Rain');
    expect(capturedUpdate.start_time).toBeUndefined();
  });
});

// ─── Errors ───────────────────────────────────────────────────────────────────

describe('save-inspection-meta — errors', () => {
  it('returns 500 on DB error', async () => {
    mockUpdateResult = { error: { message: 'DB down' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({
      record_id: 'rec-1',
      start_time: '09:00',
    }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('DB down');
  });
});
