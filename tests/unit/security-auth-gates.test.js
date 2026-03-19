/**
 * Security tests: verify auth gates on HIGH-risk functions (HEA-247)
 *
 * Each function must return 401 when called without valid auth headers.
 */

import { describe, it, expect, beforeEach } from 'vitest';

function noAuthEvent(method, body) {
  return {
    httpMethod: method || 'POST',
    headers: {},
    queryStringParameters: {},
    body: body ? JSON.stringify(body) : '{}',
  };
}

// ── score-weights.js ──────────────────────────────────────────────────
describe('score-weights — auth gate', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-token';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
  });

  it('GET returns 200 without auth (public read)', async () => {
    const { handler } = require('../../functions/score-weights');
    var res = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {} });
    expect(res.statusCode).toBe(200);
  });

  it('POST returns 401 without auth', async () => {
    const { handler } = require('../../functions/score-weights');
    var res = await handler(noAuthEvent('POST', { weights: {} }));
    expect(res.statusCode).toBe(401);
  });

  it('POST returns non-401 with valid token', async () => {
    const { handler } = require('../../functions/score-weights');
    var res = await handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'test-token' },
      queryStringParameters: {},
      body: JSON.stringify({ sectionWeights: [] }),
    });
    // May be 200 or 500 (no real DB), but NOT 401
    expect(res.statusCode).not.toBe(401);
  });
});

// ── update-invoice.js ─────────────────────────────────────────────────
describe('update-invoice — auth gate', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-token';
  });

  it('returns 401 without auth', async () => {
    const { handler } = require('../../functions/update-invoice');
    var res = await handler(noAuthEvent('POST', { invoice_id: 'x', action: 'void' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns non-401 with valid token', async () => {
    const { handler } = require('../../functions/update-invoice');
    var res = await handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'test-token' },
      queryStringParameters: {},
      body: JSON.stringify({ invoice_id: 'x', action: 'void' }),
    });
    expect(res.statusCode).not.toBe(401);
  });
});

// ── submit-inspection.js ──────────────────────────────────────────────
describe('submit-inspection — auth gate', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-token';
  });

  it('returns 401 without auth', async () => {
    const { handler } = require('../../functions/submit-inspection');
    var res = await handler(noAuthEvent('POST', { inspection_id: 'x' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns non-401 with valid token', async () => {
    const { handler } = require('../../functions/submit-inspection');
    var res = await handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'test-token' },
      queryStringParameters: {},
      body: JSON.stringify({ inspection_id: 'test-id' }),
    });
    // Will be 500 (no real DB), but NOT 401
    expect(res.statusCode).not.toBe(401);
  });
});

// ── sync-inspection.js ────────────────────────────────────────────────
describe('sync-inspection — auth gate', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-token';
  });

  it('returns 401 without auth', async () => {
    const { handler } = require('../../functions/sync-inspection');
    var res = await handler(noAuthEvent('POST', { inspection_id: 'x', changes: [{}] }));
    expect(res.statusCode).toBe(401);
  });

  it('returns non-401 with valid token', async () => {
    const { handler } = require('../../functions/sync-inspection');
    var res = await handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'test-token' },
      queryStringParameters: {},
      body: JSON.stringify({ inspection_id: 'x', changes: [{ type: 'status_change', status: 'in_progress' }] }),
    });
    expect(res.statusCode).not.toBe(401);
  });
});
