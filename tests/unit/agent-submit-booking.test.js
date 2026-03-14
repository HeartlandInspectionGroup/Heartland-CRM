/**
 * Unit tests for agent-submit-booking.js
 *
 * Tests cover:
 *  - payload sanitisation (pick)
 *  - field allowlists (BOOKING_ALLOWED, RECORD_ALLOWED)
 *  - token validation logic (mocked)
 *  - handler auth rejection
 *  - handler missing payload rejection
 *  - agent_id is always forced to authenticated agent (never trust client)
 *
 * Integration (real Supabase inserts) is covered by manual E2E.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Import the pure helpers directly ─────────────────────────────────────────
const {
  _pick,
  _BOOKING_ALLOWED,
  _RECORD_ALLOWED,
  handler,
} = require('../../functions/agent-submit-booking');

// ── Helper: build a minimal valid event ──────────────────────────────────────
function makeEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      portal_token: 'valid-token-abc',
      booking: {
        client_name:      'Jane Doe',
        client_email:     'jane@example.com',
        client_phone:     '555-1234',
        property_address: '123 Main St, Roscoe, IL 61073',
        final_total:      375,
        preferred_date:   '2026-04-15',
        preferred_time:   '09:00 AM',
        agent_id:         'client-sent-agent-id', // should be overwritten
        data_source:      'client-sent-source',   // should be overwritten
      },
      record: {
        category:       'home_inspection',
        tier:           'Pre Purchase',
        cust_name:      'Jane Doe',
        cust_email:     'jane@example.com',
        cust_phone:     '555-1234',
        address:        '123 Main St, Roscoe, IL 61073',
        final_total:    375,
        payment_status: 'unpaid',
        status:         'cancelled', // should be forced to 'scheduled'
        agent_id:       'client-sent-agent-id', // should be overwritten
      },
    }),
    ...overrides,
  };
}

// ── Mock fetch so no real network calls happen ────────────────────────────────
function mockFetch(responses) {
  var callIndex = 0;
  return vi.fn(function(url) {
    var resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    var body = resp.body !== undefined ? resp.body : '{}';
    return Promise.resolve({
      ok:     resp.ok !== false,
      status: resp.status || 200,
      text:   function() { return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)); },
      json:   function() { return Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body); },
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// pick() — payload sanitisation
// ═════════════════════════════════════════════════════════════════════════════

describe('_pick', () => {
  it('returns only allowed keys', () => {
    var input = { a: 1, b: 2, c: 3 };
    expect(_pick(input, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('ignores keys not in object', () => {
    var result = _pick({ a: 1 }, ['a', 'b']);
    expect(result).toEqual({ a: 1 });
    expect('b' in result).toBe(false);
  });

  it('strips keys not in allowlist', () => {
    var result = _pick(
      { client_name: 'Jake', injected_field: 'evil', status: 'scheduled' },
      _BOOKING_ALLOWED
    );
    expect('injected_field' in result).toBe(false);
    expect(result.client_name).toBe('Jake');
  });

  it('allows undefined values through (preserves explicit undefined)', () => {
    // pick only includes keys that are !== undefined
    var result = _pick({ a: undefined, b: 'hello' }, ['a', 'b']);
    expect('a' in result).toBe(false);
    expect(result.b).toBe('hello');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Allowlists — confirm critical fields are present / absent
// ═════════════════════════════════════════════════════════════════════════════

describe('BOOKING_ALLOWED allowlist', () => {
  it('includes required booking fields', () => {
    ['client_name','client_email','client_phone','property_address',
     'final_total','preferred_date','preferred_time','agent_id',
     'data_source','status'].forEach(function(f) {
      expect(_BOOKING_ALLOWED).toContain(f);
    });
  });
});

describe('RECORD_ALLOWED allowlist', () => {
  it('includes required record fields', () => {
    ['category','tier','cust_name','cust_email','cust_phone','address',
     'final_total','payment_status','status','booking_id','agent_id',
     'inspection_date'].forEach(function(f) {
      expect(_RECORD_ALLOWED).toContain(f);
    });
  });

  it('does not include dead/nonexistent columns', () => {
    ['scheduled_date','scheduled_time','total_amount'].forEach(function(f) {
      expect(_RECORD_ALLOWED).not.toContain(f);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler — HTTP method guard
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — HTTP method', () => {
  it('returns 405 for GET', async () => {
    var res = await handler({ httpMethod: 'GET', headers: {}, body: '' });
    expect(res.statusCode).toBe(405);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler — invalid JSON
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — bad JSON', () => {
  it('returns 400 for malformed body', async () => {
    // Need SUPABASE_URL and KEY set so we get past env check
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    var res = await handler({ httpMethod: 'POST', headers: {}, body: 'not-json' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid json/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler — auth rejection
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — token auth', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });

  it('returns 401 when portal_token is missing', async () => {
    global.fetch = mockFetch([
      { body: '[]' }, // agents lookup returns empty
    ]);
    var event = makeEvent();
    var body = JSON.parse(event.body);
    delete body.portal_token;
    event.body = JSON.stringify(body);

    var res = await handler(event);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/invalid.*token/i);
  });

  it('returns 401 when token does not match any agent', async () => {
    global.fetch = mockFetch([
      { body: '[]' }, // agents lookup returns empty
    ]);
    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when agent is inactive', async () => {
    global.fetch = mockFetch([
      { body: '[]' }, // active=eq.true filter means inactive agents return empty
    ]);
    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler — missing payloads
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — missing payloads', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });

  it('returns 400 when booking is missing', async () => {
    global.fetch = mockFetch([
      { body: JSON.stringify([{ id: 'agent-1', name: 'Test Agent', role: 'agent', booking_discount: 0 }]) },
    ]);
    var event = makeEvent();
    var body = JSON.parse(event.body);
    delete body.booking;
    event.body = JSON.stringify(body);
    var res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/booking payload/i);
  });

  it('returns 400 when record is missing', async () => {
    global.fetch = mockFetch([
      { body: JSON.stringify([{ id: 'agent-1', name: 'Test Agent', role: 'agent', booking_discount: 0 }]) },
    ]);
    var event = makeEvent();
    var body = JSON.parse(event.body);
    delete body.record;
    event.body = JSON.stringify(body);
    var res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record payload/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler — agent_id is always forced to authenticated agent
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — agent_id enforcement', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.SITE_URL = '';
  });

  it('overwrites client-sent agent_id with authenticated agent id', async () => {
    var capturedBooking = null;
    var capturedRecord  = null;

    global.fetch = vi.fn(function(url, opts) {
      // 1st call: agent lookup
      if (url.includes('agents?portal_token')) {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'real-agent-uuid', name: 'Jake', role: 'agent', booking_discount: 0 }])),
          json: () => Promise.resolve([{ id: 'real-agent-uuid', name: 'Jake', role: 'agent', booking_discount: 0 }]),
        });
      }
      // 2nd call: bookings insert
      if (url.includes('/rest/v1/bookings') && opts && opts.method === 'POST') {
        capturedBooking = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'new-booking-id' }])),
          json: () => Promise.resolve([{ id: 'new-booking-id' }]),
        });
      }
      // 3rd call: inspection_records insert
      if (url.includes('/rest/v1/inspection_records') && opts && opts.method === 'POST') {
        capturedRecord = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'new-record-id' }])),
          json: () => Promise.resolve([{ id: 'new-record-id' }]),
        });
      }
      // audit log and calendar — fire and forget, just succeed
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({}),
      });
    });

    var res = await handler(makeEvent());

    expect(res.statusCode).toBe(200);

    // agent_id must be real-agent-uuid, not client-sent-agent-id
    expect(capturedBooking.agent_id).toBe('real-agent-uuid');
    expect(capturedRecord.agent_id).toBe('real-agent-uuid');

    // data_source must be forced to 'agent_portal'
    expect(capturedBooking.data_source).toBe('agent_portal');

    // booking status must be 'pending' (bookings table constraint), record must be 'scheduled'
    expect(capturedBooking.status).toBe('pending');

    // status on record must be forced to 'scheduled'
    expect(capturedRecord.status).toBe('scheduled');
  });

  it('returns booking_id and record_id on success', async () => {
    global.fetch = vi.fn(function(url, opts) {
      if (url.includes('agents?portal_token')) {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'real-agent-uuid', name: 'Jake', role: 'agent', booking_discount: 0 }])),
          json: () => Promise.resolve([{ id: 'real-agent-uuid', name: 'Jake', role: 'agent', booking_discount: 0 }]),
        });
      }
      if (url.includes('/rest/v1/bookings') && opts && opts.method === 'POST') {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'booking-uuid-123' }])),
          json: () => Promise.resolve([{ id: 'booking-uuid-123' }]),
        });
      }
      if (url.includes('/rest/v1/inspection_records') && opts && opts.method === 'POST') {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'record-uuid-456' }])),
          json: () => Promise.resolve([{ id: 'record-uuid-456' }]),
        });
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) });
    });

    var res = await handler(makeEvent());
    var data = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.booking_id).toBe('booking-uuid-123');
    expect(data.record_id).toBe('record-uuid-456');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler — booking insert failure rolls back
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — failure handling', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.SITE_URL = '';
  });

  it('returns 500 when bookings insert fails', async () => {
    global.fetch = vi.fn(function(url) {
      if (url.includes('agents?portal_token')) {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'agent-1', name: 'Jake', role: 'agent', booking_discount: 0 }])),
          json: () => Promise.resolve([{ id: 'agent-1', name: 'Jake', role: 'agent', booking_discount: 0 }]),
        });
      }
      // bookings insert fails
      return Promise.resolve({
        ok: false, status: 422,
        text: () => Promise.resolve(JSON.stringify({ message: 'constraint violation' })),
        json: () => Promise.resolve({ message: 'constraint violation' }),
      });
    });

    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/failed to create booking/i);
  });

  it('attempts booking rollback and returns 500 when record insert fails', async () => {
    var deleteCalled = false;

    global.fetch = vi.fn(function(url, opts) {
      if (url.includes('agents?portal_token')) {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'agent-1', name: 'Jake', role: 'agent', booking_discount: 0 }])),
          json: () => Promise.resolve([{ id: 'agent-1', name: 'Jake', role: 'agent', booking_discount: 0 }]),
        });
      }
      if (url.includes('/rest/v1/bookings') && opts && opts.method === 'POST') {
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{ id: 'booking-to-rollback' }])),
          json: () => Promise.resolve([{ id: 'booking-to-rollback' }]),
        });
      }
      if (url.includes('/rest/v1/inspection_records') && opts && opts.method === 'POST') {
        return Promise.resolve({
          ok: false, status: 422,
          text: () => Promise.resolve(JSON.stringify({ message: 'record insert failed' })),
          json: () => Promise.resolve({ message: 'record insert failed' }),
        });
      }
      // DELETE call for rollback
      if (url.includes('bookings?id=eq.booking-to-rollback') && opts && opts.method === 'DELETE') {
        deleteCalled = true;
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) });
    });

    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/failed to create inspection record/i);
    expect(deleteCalled).toBe(true);
  });
});
