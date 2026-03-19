/**
 * Unit tests for save-equipment-scan.js (HEA-220)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/save-equipment-scan');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var upsertCalls, upsertResult;

function mockClient() {
  return {
    from: function (table) {
      return {
        upsert: function (row, opts) {
          upsertCalls.push({ table: table, row: row, opts: opts });
          return {
            select: function () {
              return {
                single: function () {
                  return Promise.resolve(upsertResult);
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
  upsertCalls = [];
  upsertResult = { data: { id: 'scan-uuid-1' }, error: null };
  mod._setClient(mockClient());
});

describe('save-equipment-scan — upsert', () => {
  it('upserts equipment scan data correctly', async () => {
    var body = {
      record_id: 'rec-1',
      section_id: 'sec-heating',
      field_id: null,
      brand: 'Carrier',
      model: '58CVA080-12',
      serial: '2318A12345',
      manufacture_date: '2018',
      age_years: 8,
      capacity: '80,000 BTU',
      efficiency_rating: '80% AFUE',
      recall_status: 'none',
      recall_url: null,
      raw_response: { brand: 'Carrier' },
    };

    var res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.id).toBe('scan-uuid-1');

    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].table).toBe('equipment_scans');
    expect(upsertCalls[0].row.brand).toBe('Carrier');
    expect(upsertCalls[0].row.record_id).toBe('rec-1');
    expect(upsertCalls[0].opts.onConflict).toBe('record_id,section_id,field_id');
  });

  it('handles conflict update — same record_id, section_id, field_id', async () => {
    var body1 = {
      record_id: 'rec-1',
      section_id: 'sec-heating',
      field_id: null,
      brand: 'Carrier',
      model: 'OLD-MODEL',
    };
    var body2 = {
      record_id: 'rec-1',
      section_id: 'sec-heating',
      field_id: null,
      brand: 'Carrier',
      model: 'NEW-MODEL',
    };

    await handler(makeEvent(body1));
    await handler(makeEvent(body2));

    expect(upsertCalls.length).toBe(2);
    expect(upsertCalls[0].row.model).toBe('OLD-MODEL');
    expect(upsertCalls[1].row.model).toBe('NEW-MODEL');
    // Both use the same onConflict constraint
    expect(upsertCalls[0].opts.onConflict).toBe('record_id,section_id,field_id');
    expect(upsertCalls[1].opts.onConflict).toBe('record_id,section_id,field_id');
  });

  it('stores appliance sub-card field_id correctly', async () => {
    var body = {
      record_id: 'rec-1',
      section_id: 'sec-appliances',
      field_id: 'appliance_0',
      brand: 'Whirlpool',
      model: 'WRF535SMHZ',
    };

    var res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(200);
    expect(upsertCalls[0].row.field_id).toBe('appliance_0');
    expect(upsertCalls[0].row.section_id).toBe('sec-appliances');
  });
});

describe('save-equipment-scan — validation', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {} });
    expect(res.statusCode).toBe(204);
  });

  it('returns 401 without auth', async () => {
    var res = await handler({ httpMethod: 'POST', headers: {}, body: '{}' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when record_id missing', async () => {
    var res = await handler(makeEvent({ section_id: 'sec-1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('record_id');
  });

  it('returns 400 when section_id missing', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('section_id');
  });

  it('returns 405 for GET', async () => {
    var res = await handler({ httpMethod: 'GET', headers: { 'x-admin-token': 'test-token' }, queryStringParameters: {} });
    expect(res.statusCode).toBe(405);
  });
});

describe('save-equipment-scan — error handling', () => {
  it('returns 500 on DB error', async () => {
    upsertResult = { data: null, error: { message: 'DB connection failed' } };
    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1' }));
    expect(res.statusCode).toBe(500);
  });
});
