/**
 * Unit tests for get-record-status.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-record-status');
const { handler } = mod;

function makeEvent(params, token) {
  return {
    httpMethod: 'GET',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: params || {},
    body: '',
  };
}

// ── Mock DB builder ──────────────────────────────────────────────────────────

var mockRecord, mockSigs, mockActiveVersions;

function mockClient() {
  return {
    from: function (table) {
      if (table === 'inspection_records') {
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
      }
      if (table === 'waiver_signatures') {
        return {
          select: function () {
            return {
              eq: function () {
                return Promise.resolve(mockSigs);
              },
            };
          },
        };
      }
      if (table === 'waiver_versions') {
        return {
          select: function () {
            return {
              in: function () {
                return {
                  eq: function () {
                    return Promise.resolve(mockActiveVersions);
                  },
                };
              },
            };
          },
        };
      }
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockRecord = { data: { id: 'rec-1', payment_status: 'paid', status: 'scheduled' }, error: null };
  mockSigs = { data: [{ id: 'sig-1', waiver_version_id: 'wv-1' }], error: null };
  mockActiveVersions = { data: [{ id: 'wv-1' }], error: null };
  mod._setClient(mockClient());
});

describe('get-record-status — method guards', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for POST', async () => {
    var res = await handler({ httpMethod: 'POST', headers: { 'x-admin-token': 'test-token' }, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without admin token', async () => {
    var res = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { record_id: 'rec-1' }, body: '' });
    expect(res.statusCode).toBe(401);
  });
});

describe('get-record-status — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

describe('get-record-status — 404', () => {
  it('returns 404 when record not found', async () => {
    mockRecord = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'nonexistent' }));
    expect(res.statusCode).toBe(404);
  });
});

describe('get-record-status — returns correct fields', () => {
  it('returns payment_status, agreement_signed, status for paid + signed record', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.payment_status).toBe('paid');
    expect(data.agreement_signed).toBe(true);
    expect(data.status).toBe('scheduled');
  });

  it('returns agreement_signed = false when no signatures exist', async () => {
    mockSigs = { data: [], error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    var data = JSON.parse(res.body);
    expect(data.agreement_signed).toBe(false);
  });

  it('returns agreement_signed = false when signatures exist but waiver_version is inactive', async () => {
    mockActiveVersions = { data: [], error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    var data = JSON.parse(res.body);
    expect(data.agreement_signed).toBe(false);
  });

  it('defaults payment_status to unpaid when null', async () => {
    mockRecord = { data: { id: 'rec-1', payment_status: null, status: 'scheduled' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    var data = JSON.parse(res.body);
    expect(data.payment_status).toBe('unpaid');
  });

  it('returns waived payment_status correctly', async () => {
    mockRecord = { data: { id: 'rec-1', payment_status: 'waived', status: 'in_progress' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    var data = JSON.parse(res.body);
    expect(data.payment_status).toBe('waived');
    expect(data.status).toBe('in_progress');
  });
});
