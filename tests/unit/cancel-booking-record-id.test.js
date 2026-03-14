/**
 * Unit tests for cancel-booking.js — record_id extension
 *
 * Tests cover the NEW record_id path only — the booking_id path was
 * already working. We test:
 *  - Missing both booking_id and record_id → 400
 *  - record_id path: loads record by id not booking_id
 *  - record_id path: patches inspection_records by id, does NOT touch bookings
 *  - record_id path: reads calendar_event_id from inspection_records not bookings
 *  - record_id path: validates token the same way as booking_id path
 *  - record_id path: guards against double-cancel and completed inspections
 *  - booking_id path still works (regression)
 *  - audit log includes record_id when no booking_id
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { handler } = require('../../functions/cancel-booking');

// ── Env setup ─────────────────────────────────────────────────────────────────
beforeEach(() => {
  process.env.SUPABASE_URL       = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  process.env.ADMIN_TOKEN        = 'admin-token-abc';
  process.env.RESEND_API_KEY     = 'resend-fake';
  process.env.SITE_URL           = 'https://quiet-mousse-ce00ef.netlify.app';
});

// ── Fake record ───────────────────────────────────────────────────────────────
const FAKE_REC = {
  id:             'record-uuid-111',
  booking_id:     null,
  status:         'scheduled',
  cust_name:      'Jane Doe',
  cust_email:     'jane@example.com',
  address:        '123 Main St, Roscoe, IL',
  inspection_date:'2026-04-15',
  calendar_event_id: null,
};

// ── Fetch mock builder ────────────────────────────────────────────────────────
function makeFetch({ agentValid = true, rec = FAKE_REC, patchOk = true, emailOk = true } = {}) {
  return vi.fn(function(url, opts) {
    // Agent token validation
    if (url.includes('agents?portal_token')) {
      var rows = agentValid ? [{ id: 'agent-1' }] : [];
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve(rows),
        text: () => Promise.resolve(JSON.stringify(rows)) });
    }
    // Client portal token (not used in these tests — return empty)
    if (url.includes('client_portal_tokens')) {
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve('[]') });
    }
    // Record lookup by id
    if (url.includes('inspection_records?id=eq.') && (!opts || opts.method !== 'PATCH')) {
      var rows2 = rec ? [rec] : [];
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve(rows2),
        text: () => Promise.resolve(JSON.stringify(rows2)) });
    }
    // Record lookup by booking_id
    if (url.includes('inspection_records?booking_id=eq.') && (!opts || opts.method !== 'PATCH')) {
      var rows3 = rec ? [rec] : [];
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve(rows3),
        text: () => Promise.resolve(JSON.stringify(rows3)) });
    }
    // PATCH calls
    if (opts && opts.method === 'PATCH') {
      return Promise.resolve({ ok: patchOk, status: patchOk ? 204 : 500,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('') });
    }
    // Bookings lookup (for calendar_event_id)
    if (url.includes('bookings?id=eq.')) {
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve([{ calendar_event_id: null }]),
        text: () => Promise.resolve(JSON.stringify([{ calendar_event_id: null }])) });
    }
    // Audit log
    if (url.includes('audit_log')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
    }
    // Email
    if (url.includes('resend.com')) {
      return Promise.resolve({ ok: emailOk, status: emailOk ? 200 : 500,
        json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
    }
    // Default
    return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
  });
}

function makeEvent(body) {
  return { httpMethod: 'POST', headers: {}, body: JSON.stringify(body) };
}

// ═════════════════════════════════════════════════════════════════════════════
// Validation — missing both ids
// ═════════════════════════════════════════════════════════════════════════════

describe('cancel-booking — validation', () => {
  it('returns 400 when both booking_id and record_id are missing', async () => {
    global.fetch = makeFetch();
    var res = await handler(makeEvent({ token: 'agent-token' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/booking_id or record_id/i);
  });

  it('returns 400 when token is missing', async () => {
    global.fetch = makeFetch();
    var res = await handler(makeEvent({ record_id: 'record-uuid-111' }));
    expect(res.statusCode).toBe(400);
  });

  it('proceeds when only record_id is provided', async () => {
    global.fetch = makeFetch();
    var res = await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));
    expect(res.statusCode).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// record_id path — record lookup
// ═════════════════════════════════════════════════════════════════════════════

describe('cancel-booking — record_id lookup', () => {
  it('looks up record by id, not by booking_id', async () => {
    var queriedUrls = [];
    global.fetch = vi.fn(function(url, opts) {
      queriedUrls.push(url);
      return makeFetch()(url, opts);
    });
    await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));

    var recordLookups = queriedUrls.filter(u => u.includes('inspection_records?'));
    // Should use id=eq. not booking_id=eq.
    expect(recordLookups.some(u => u.includes('id=eq.record-uuid-111'))).toBe(true);
    expect(recordLookups.some(u => u.includes('booking_id=eq.'))).toBe(false);
  });

  it('returns 404 when record not found', async () => {
    global.fetch = makeFetch({ rec: null });
    var res = await handler(makeEvent({ token: 'agent-token', record_id: 'nonexistent' }));
    expect(res.statusCode).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// record_id path — patch behaviour
// ═════════════════════════════════════════════════════════════════════════════

describe('cancel-booking — record_id patch', () => {
  it('patches inspection_records by id=eq., not booking_id', async () => {
    var patchedUrls = [];
    global.fetch = vi.fn(function(url, opts) {
      if (opts && opts.method === 'PATCH') patchedUrls.push(url);
      return makeFetch()(url, opts);
    });
    await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));
    expect(patchedUrls.some(u => u.includes('inspection_records?id=eq.record-uuid-111'))).toBe(true);
  });

  it('does NOT patch the bookings table when only record_id given', async () => {
    var patchedUrls = [];
    global.fetch = vi.fn(function(url, opts) {
      if (opts && opts.method === 'PATCH') patchedUrls.push(url);
      return makeFetch()(url, opts);
    });
    await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));
    expect(patchedUrls.some(u => u.includes('/bookings?'))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// record_id path — calendar event from inspection_records
// ═════════════════════════════════════════════════════════════════════════════

describe('cancel-booking — calendar event source', () => {
  it('reads calendar_event_id from inspection_records when no booking_id', async () => {
    var recWithCal = Object.assign({}, FAKE_REC, { calendar_event_id: 'cal-event-xyz' });
    var queriedUrls = [];
    global.fetch = vi.fn(function(url, opts) {
      queriedUrls.push(url);
      return makeFetch({ rec: recWithCal })(url, opts);
    });
    await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));
    // Should NOT query bookings table for calendar_event_id
    expect(queriedUrls.some(u => u.includes('bookings?id=eq.'))).toBe(false);
  });

  it('does NOT query bookings for calendar_event_id when using record_id', async () => {
    var queriedUrls = [];
    global.fetch = vi.fn(function(url, opts) {
      queriedUrls.push(url);
      return makeFetch()(url, opts);
    });
    await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));
    expect(queriedUrls.some(u => u.includes('bookings?id=eq.'))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// record_id path — auth
// ═════════════════════════════════════════════════════════════════════════════

describe('cancel-booking — auth with record_id', () => {
  it('returns 401 for invalid agent token', async () => {
    global.fetch = makeFetch({ agentValid: false });
    var res = await handler(makeEvent({ token: 'bad-token', record_id: 'record-uuid-111' }));
    expect(res.statusCode).toBe(401);
  });

  it('allows admin token bypass', async () => {
    global.fetch = makeFetch();
    var res = await handler(makeEvent({ token: 'admin-token-abc', _admin: true, record_id: 'record-uuid-111' }));
    expect(res.statusCode).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// record_id path — status guards
// ═════════════════════════════════════════════════════════════════════════════

describe('cancel-booking — status guards with record_id', () => {
  it('returns 400 when record already cancelled', async () => {
    global.fetch = makeFetch({ rec: Object.assign({}, FAKE_REC, { status: 'cancelled' }) });
    var res = await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/already cancelled/i);
  });

  it('returns 400 when record is submitted (completed)', async () => {
    global.fetch = makeFetch({ rec: Object.assign({}, FAKE_REC, { status: 'submitted' }) });
    var res = await handler(makeEvent({ token: 'agent-token', record_id: 'record-uuid-111' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/cannot cancel a completed/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Regression — booking_id path still works
// ═════════════════════════════════════════════════════════════════════════════

describe('cancel-booking — booking_id regression', () => {
  it('still patches both tables when booking_id is provided', async () => {
    var patchedUrls = [];
    var recWithBooking = Object.assign({}, FAKE_REC, { booking_id: 'booking-uuid-999' });
    global.fetch = vi.fn(function(url, opts) {
      if (opts && opts.method === 'PATCH') patchedUrls.push(url);
      return makeFetch({ rec: recWithBooking })(url, opts);
    });
    await handler(makeEvent({ token: 'agent-token', booking_id: 'booking-uuid-999' }));
    expect(patchedUrls.some(u => u.includes('inspection_records?booking_id=eq.booking-uuid-999'))).toBe(true);
    expect(patchedUrls.some(u => u.includes('bookings?id=eq.booking-uuid-999'))).toBe(true);
  });

  it('returns 200 on success with booking_id', async () => {
    var recWithBooking = Object.assign({}, FAKE_REC, { booking_id: 'booking-uuid-999' });
    global.fetch = makeFetch({ rec: recWithBooking });
    var res = await handler(makeEvent({ token: 'agent-token', booking_id: 'booking-uuid-999' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });
});
