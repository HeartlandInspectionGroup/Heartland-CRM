/**
 * Unit tests for confirm-booking-email.js — multi-record creation for bundle bookings (HEA-210)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ──

var fetchCalls = [];
var mockBooking = {};
var mockExistingRecs = [];
var postResults = {};
var postCallCount = 0;

// Track sbPost calls for inspection_records specifically
var createdRecords = [];

// Mock crypto
vi.mock('crypto', () => ({
  randomBytes: () => ({ toString: () => 'mock-token-hex-string' }),
}));

// Mock supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}));

// Set ADMIN_TOKEN so requireAuth passes with x-admin-token header
process.env.ADMIN_TOKEN = 'test-token';

// Mock email template helpers
vi.mock('../../functions/lib/email-template', () => ({
  emailWrap: (opts, body) => '<html>' + body + '</html>',
  emailBtn: (url, text) => '<a href="' + url + '">' + text + '</a>',
  emailInfoTable: (rows) => '<table></table>',
  esc: (s) => s || '',
}));

// Mock template-utils
vi.mock('../../functions/lib/template-utils', () => ({
  resolveTemplate: () => Promise.resolve({ subject: 'Test Subject', body: '' }),
}));

// Mock write-audit-log — intercept the actual module's export
var auditLogCalls = [];
var actualWriteAuditLog = require('../../functions/write-audit-log');
var _origWriteAuditLog = actualWriteAuditLog.writeAuditLog;
actualWriteAuditLog.writeAuditLog = function(entry) {
  auditLogCalls.push(entry);
};

// Mock cors
vi.mock('../../functions/lib/cors', () => ({
  corsHeaders: () => ({}),
}));

// Set env vars before requiring the module
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.SITE_URL = 'https://test.example.com';

// Mock global fetch
var originalFetch = global.fetch;

function setupFetch() {
  postCallCount = 0;
  createdRecords = [];
  fetchCalls = [];

  global.fetch = vi.fn(async (url, opts) => {
    fetchCalls.push({ url, opts });

    // Resend email API
    if (url.includes('resend.com')) {
      return { ok: true, status: 200, text: async () => '{"id":"email-1"}' };
    }

    // sbGet — bookings lookup
    if (opts && !opts.method && url.includes('bookings')) {
      return { ok: true, status: 200, text: async () => JSON.stringify([mockBooking]) };
    }

    // sbGet — existing inspection_records lookup
    if (opts && !opts.method && url.includes('inspection_records')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(mockExistingRecs) };
    }

    // sbPost — inspection_records
    if (opts && opts.method === 'POST' && url.includes('inspection_records')) {
      postCallCount++;
      var body = JSON.parse(opts.body);
      var recordId = 'rec-' + postCallCount + '-' + (body.category || 'main');
      createdRecords.push({ id: recordId, payload: body });
      return { ok: true, status: 201, text: async () => JSON.stringify([{ id: recordId }]) };
    }

    // sbPatch — inspection_records or bookings
    if (opts && opts.method === 'PATCH') {
      return { ok: true, status: 200, text: async () => '{}' };
    }

    // Default
    return { ok: true, status: 200, text: async () => '{}' };
  });
}

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

// Must require after mocks are set up
const { handler } = require('../../functions/confirm-booking-email');

// ── Tests ──

describe('confirm-booking-email — bundle multi-record creation (HEA-210)', () => {

  beforeEach(() => {
    mockExistingRecs = [];
    auditLogCalls = [];
    setupFetch();
  });

  it('creates 3 records for booking with main + 2 addons', async () => {
    mockBooking = {
      id: 'booking-1',
      client_name: 'John Doe',
      client_email: 'john@example.com',
      client_phone: '555-1234',
      property_address: '123 Main St',
      client_current_address: '456 Oak Ave',
      preferred_date: '2026-04-15',
      preferred_time: '9:00 AM',
      agent_id: 'agent-1',
      services: [
        { name: 'Pre Purchase Inspection', price: 350 },
        { name: 'Radon Testing', price: 150, id: 'radon' },
        { name: 'Sewer Scope', price: 200, id: 'sewer' },
      ],
      final_total: 700,
    };

    var res = await handler(makeEvent({
      booking_id: 'booking-1',
      inspector_id: 'insp-1',
      inspector_name: 'Jane Inspector',
      category: 'home_inspection',
      tier: 'pre_purchase',
    }));

    expect(res.statusCode).toBe(200);
    expect(createdRecords).toHaveLength(3);

    // Main record
    var main = createdRecords[0];
    expect(main.payload.category).toBe('home_inspection');
    expect(main.payload.tier).toBe('pre_purchase');
    expect(main.payload.is_bundle).toBeUndefined();
    expect(main.payload.final_total).toBe(700);

    // Addon 1 — Radon
    var radon = createdRecords[1];
    expect(radon.payload.category).toBe('addon');
    expect(radon.payload.tier).toBe('radon');
    expect(radon.payload.is_bundle).toBe(true);
    expect(radon.payload.final_total).toBe(150);
    expect(radon.payload.status).toBe('scheduled');
    expect(radon.payload.payment_status).toBe('unpaid');

    // Addon 2 — Sewer
    var sewer = createdRecords[2];
    expect(sewer.payload.category).toBe('addon');
    expect(sewer.payload.tier).toBe('sewer');
    expect(sewer.payload.is_bundle).toBe(true);
    expect(sewer.payload.final_total).toBe(200);
  });

  it('addon records share same client info, date, and inspector as main record', async () => {
    mockBooking = {
      id: 'booking-2',
      client_name: 'Alice Smith',
      client_email: 'alice@example.com',
      client_phone: '555-9876',
      property_address: '789 Elm St',
      client_current_address: '101 Pine Rd',
      preferred_date: '2026-05-20',
      preferred_time: '10:30 AM',
      agent_id: 'agent-2',
      services: [
        { name: 'Pre Listing Inspection', price: 300 },
        { name: 'WDO Inspection', price: 100, id: 'wdo' },
      ],
      final_total: 400,
    };

    await handler(makeEvent({
      booking_id: 'booking-2',
      inspector_id: 'insp-2',
      inspector_name: 'Bob Inspector',
      category: 'home_inspection',
      tier: 'pre_listing',
    }));

    expect(createdRecords).toHaveLength(2);

    var addon = createdRecords[1];
    expect(addon.payload.cust_name).toBe('Alice Smith');
    expect(addon.payload.cust_email).toBe('alice@example.com');
    expect(addon.payload.cust_phone).toBe('555-9876');
    expect(addon.payload.address).toBe('789 Elm St');
    expect(addon.payload.client_current_address).toBe('101 Pine Rd');
    expect(addon.payload.inspection_date).toBe('2026-05-20');
    expect(addon.payload.inspection_time).toBe('10:30 AM');
    expect(addon.payload.inspector_id).toBe('insp-2');
    expect(addon.payload.inspector_name).toBe('Bob Inspector');
    expect(addon.payload.agent_id).toBe('agent-2');
    expect(addon.payload.booking_id).toBe('booking-2');
  });

  it('standalone booking with no addons creates single record (zero regression)', async () => {
    mockBooking = {
      id: 'booking-3',
      client_name: 'Solo Buyer',
      client_email: 'solo@example.com',
      client_phone: '555-0000',
      property_address: '999 Solo Ln',
      preferred_date: '2026-06-01',
      preferred_time: '8:00 AM',
      services: [
        { name: 'Pre Purchase Inspection', price: 350 },
      ],
      final_total: 350,
    };

    var res = await handler(makeEvent({
      booking_id: 'booking-3',
      inspector_id: 'insp-3',
      inspector_name: 'Carol Inspector',
      category: 'home_inspection',
      tier: 'pre_purchase',
    }));

    expect(res.statusCode).toBe(200);
    expect(createdRecords).toHaveLength(1);
    expect(createdRecords[0].payload.category).toBe('home_inspection');
    expect(createdRecords[0].payload.tier).toBe('pre_purchase');
  });

  it('services entries without id field (sub-items) are NOT created as separate records', async () => {
    mockBooking = {
      id: 'booking-4',
      client_name: 'Sub Item Buyer',
      client_email: 'sub@example.com',
      client_phone: '555-1111',
      property_address: '111 Sub St',
      preferred_date: '2026-06-15',
      preferred_time: '9:00 AM',
      services: [
        { name: 'Pre Purchase Inspection', price: 350 },
        { name: 'Radon Testing', price: 150, id: 'radon' },
        { name: 'Extra Radon Sample x2', price: 50 },  // sub-item — no id
        { name: 'Rush Fee', price: 75 },                // sub-item — no id
      ],
      final_total: 625,
    };

    await handler(makeEvent({
      booking_id: 'booking-4',
      inspector_id: 'insp-4',
      inspector_name: 'Dave Inspector',
      category: 'home_inspection',
      tier: 'pre_purchase',
    }));

    // Main + 1 addon (radon). Sub-items without id are skipped.
    expect(createdRecords).toHaveLength(2);
    expect(createdRecords[0].payload.category).toBe('home_inspection');
    expect(createdRecords[1].payload.category).toBe('addon');
    expect(createdRecords[1].payload.tier).toBe('radon');
  });

  it('booking with no services array creates single record without errors', async () => {
    mockBooking = {
      id: 'booking-5',
      client_name: 'No Services',
      client_email: 'nosvc@example.com',
      client_phone: '555-2222',
      property_address: '222 Empty St',
      preferred_date: '2026-07-01',
      preferred_time: '11:00 AM',
      final_total: 300,
      // no services field at all
    };

    var res = await handler(makeEvent({
      booking_id: 'booking-5',
      inspector_id: 'insp-5',
      inspector_name: 'Eve Inspector',
      category: 'home_inspection',
      tier: 'pre_purchase',
    }));

    expect(res.statusCode).toBe(200);
    expect(createdRecords).toHaveLength(1);
  });

  it('sets invoice_url and report_url on addon records', async () => {
    mockBooking = {
      id: 'booking-6',
      client_name: 'URL Test',
      client_email: 'url@example.com',
      client_phone: '555-3333',
      property_address: '333 URL Ave',
      preferred_date: '2026-07-15',
      preferred_time: '2:00 PM',
      services: [
        { name: 'Home Inspection', price: 400 },
        { name: 'Mold Testing', price: 175, id: 'mold' },
      ],
      final_total: 575,
    };

    await handler(makeEvent({
      booking_id: 'booking-6',
      inspector_id: 'insp-6',
      inspector_name: 'Frank Inspector',
      category: 'home_inspection',
      tier: 'pre_purchase',
    }));

    // Find PATCH calls that set invoice_url on addon records
    var patchCalls = fetchCalls.filter(c =>
      c.opts && c.opts.method === 'PATCH' && c.url.includes('inspection_records')
    );

    // Should have PATCH for main record + PATCH for addon record = at least 2
    expect(patchCalls.length).toBeGreaterThanOrEqual(2);

    // Check addon PATCH includes invoice_url with addon record ID
    var addonId = createdRecords[1].id;
    var addonPatch = patchCalls.find(c => c.url.includes(addonId));
    expect(addonPatch).toBeTruthy();
    var patchBody = JSON.parse(addonPatch.opts.body);
    expect(patchBody.invoice_url).toContain(addonId);
    expect(patchBody.report_url).toContain(addonId);
  });

  it('writes audit logs for addon records', async () => {
    mockBooking = {
      id: 'booking-7',
      client_name: 'Audit Test',
      client_email: 'audit@example.com',
      client_phone: '555-4444',
      property_address: '444 Audit Blvd',
      preferred_date: '2026-08-01',
      preferred_time: '3:00 PM',
      services: [
        { name: 'Home Inspection', price: 400 },
        { name: 'Thermal Imaging', price: 125, id: 'thermal' },
        { name: 'Water Quality', price: 100, id: 'water' },
      ],
      final_total: 625,
    };

    await handler(makeEvent({
      booking_id: 'booking-7',
      inspector_id: 'insp-7',
      inspector_name: 'Grace Inspector',
      category: 'home_inspection',
      tier: 'pre_purchase',
    }));

    // Main record gets 2 audit entries, each addon gets 2 = 2 + 2*2 = 6
    var bookingConfirmed = auditLogCalls.filter(c => c.action === 'booking.confirmed');
    var agreementSent = auditLogCalls.filter(c => c.action === 'agreement.sent');

    expect(bookingConfirmed).toHaveLength(3); // main + 2 addons
    expect(agreementSent).toHaveLength(3);    // main + 2 addons

    // Addon audit entries should reference parent record
    var addonAudits = bookingConfirmed.filter(c => c.details && c.details.source === 'confirm_booking_addon');
    expect(addonAudits).toHaveLength(2);
    addonAudits.forEach(a => {
      expect(a.details.parent_record_id).toBeTruthy();
    });
  });
});
