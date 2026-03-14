/**
 * Unit tests for iwb-submit-booking.js
 *
 * Tests cover:
 *  - Auth gate (x-admin-token required)
 *  - HTTP method guards
 *  - Missing booking payload → 400
 *  - data_source, status, agent_id always forced
 *  - Allowlist strips unknown fields
 *  - Successful insert returns booking_id
 *  - Booking insert failure → 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { handler, _pick, _BOOKING_ALLOWED } = require('../../functions/iwb-submit-booking');

const VALID_TOKEN = 'test-admin-token';

function makeEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': VALID_TOKEN },
    body: JSON.stringify({
      booking: {
        client_name:      'Rachel Schminkey',
        client_email:     'rachel@example.com',
        client_phone:     '(319) 432-9796',
        property_address: '11219 Meadowsweet Lane, Roscoe, IL 61073',
        final_total:      425,
        preferred_date:   '2026-03-17',
        preferred_time:   '3:00 PM',
        data_source:      'client-sent',   // should be overwritten
        status:           'confirmed',     // should be overwritten
        agent_id:         'some-agent-id', // should be forced to null
        injected_field:   'evil',          // should be stripped
      },
      calendar: {
        firstName: 'Rachel', lastName: 'Schminkey',
        address: '11219 Meadowsweet Lane', date: '2026-03-17', time: '3:00 PM',
      },
    }),
    ...overrides,
  };
}

function makeFetch(bookingId = 'new-booking-uuid') {
  return vi.fn(function(url, opts) {
    if (url.includes('/rest/v1/bookings') && opts && opts.method === 'POST') {
      return Promise.resolve({ ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify([{ id: bookingId }])) });
    }
    // audit log, calendar — fire and forget
    return Promise.resolve({ ok: true, status: 200,
      text: () => Promise.resolve('{}') });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// _pick and allowlist
// ═════════════════════════════════════════════════════════════════════════════

describe('_pick', () => {
  it('returns only allowed keys', () => {
    expect(_pick({ a: 1, b: 2 }, ['a'])).toEqual({ a: 1 });
  });
  it('strips keys not in allowlist', () => {
    expect('injected_field' in _pick({ client_name: 'Jake', injected_field: 'evil' }, _BOOKING_ALLOWED)).toBe(false);
  });
});

describe('BOOKING_ALLOWED', () => {
  it('includes required booking fields', () => {
    ['client_name','client_email','client_phone','property_address',
     'final_total','preferred_date','preferred_time','data_source','status','agent_id']
      .forEach(f => expect(_BOOKING_ALLOWED).toContain(f));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HTTP guards
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — HTTP guards', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.ADMIN_TOKEN = VALID_TOKEN;
  });

  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for GET', async () => {
    var res = await handler({ httpMethod: 'GET', headers: { 'x-admin-token': VALID_TOKEN }, body: '' });
    expect(res.statusCode).toBe(405);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Auth
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — auth', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    global.fetch = makeFetch();
  });

  it('returns 401 with no token', async () => {
    var event = makeEvent({ headers: {} });
    var res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    var event = makeEvent({ headers: { 'x-admin-token': 'wrong' } });
    var res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it('proceeds with correct token', async () => {
    global.fetch = makeFetch();
    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Validation
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — validation', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    global.fetch = makeFetch();
  });

  it('returns 400 for bad JSON', async () => {
    var res = await handler({ httpMethod: 'POST', headers: { 'x-admin-token': VALID_TOKEN }, body: 'not-json' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when booking payload missing', async () => {
    var res = await handler({ httpMethod: 'POST', headers: { 'x-admin-token': VALID_TOKEN },
      body: JSON.stringify({ calendar: {} }) });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/booking payload/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Forced field values
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — forced fields', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    process.env.SITE_URL = '';
  });

  it('forces data_source to inspector_wizard', async () => {
    var captured = null;
    global.fetch = vi.fn(function(url, opts) {
      if (url.includes('/rest/v1/bookings')) { captured = JSON.parse(opts.body); }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify([{ id: 'bid' }])) });
    });
    await handler(makeEvent());
    expect(captured.data_source).toBe('inspector_wizard');
  });

  it('forces status to pending', async () => {
    var captured = null;
    global.fetch = vi.fn(function(url, opts) {
      if (url.includes('/rest/v1/bookings')) { captured = JSON.parse(opts.body); }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify([{ id: 'bid' }])) });
    });
    await handler(makeEvent());
    expect(captured.status).toBe('pending');
  });

  it('forces agent_id to null', async () => {
    var captured = null;
    global.fetch = vi.fn(function(url, opts) {
      if (url.includes('/rest/v1/bookings')) { captured = JSON.parse(opts.body); }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify([{ id: 'bid' }])) });
    });
    await handler(makeEvent());
    expect(captured.agent_id).toBeNull();
  });

  it('strips unknown fields', async () => {
    var captured = null;
    global.fetch = vi.fn(function(url, opts) {
      if (url.includes('/rest/v1/bookings')) { captured = JSON.parse(opts.body); }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify([{ id: 'bid' }])) });
    });
    await handler(makeEvent());
    expect('injected_field' in captured).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Success
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — success', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    process.env.SITE_URL = '';
  });

  it('returns ok:true and booking_id on success', async () => {
    global.fetch = makeFetch('booking-uuid-789');
    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    var body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.booking_id).toBe('booking-uuid-789');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Failure
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — failure', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    process.env.SITE_URL = '';
  });

  it('returns 500 when bookings insert fails', async () => {
    global.fetch = vi.fn(function(url, opts) {
      if (url.includes('/rest/v1/bookings'))
        return Promise.resolve({ ok: false, status: 422,
          text: () => Promise.resolve(JSON.stringify({ message: 'constraint violation' })) });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    });
    var res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/failed to create booking/i);
  });
});
