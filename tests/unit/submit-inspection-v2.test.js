/**
 * Unit tests for submit-inspection-v2.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/submit-inspection-v2');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockRecord, mockSigs, mockActiveVersions, mockUpdateResult;

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
          update: function () {
            return {
              eq: function () {
                return Promise.resolve(mockUpdateResult);
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

// Default: paid + agreement signed → should pass both gates
beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockRecord = { data: { id: 'rec-1', status: 'scheduled', payment_status: 'paid', final_total: 375 }, error: null };
  mockSigs = { data: [{ id: 'sig-1', waiver_version_id: 'wv-1' }], error: null };
  mockActiveVersions = { data: [{ id: 'wv-1' }], error: null };
  mockUpdateResult = { error: null };
  mod._setClient(mockClient());
});

describe('submit-inspection-v2 — method guards', () => {
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

describe('submit-inspection-v2 — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

describe('submit-inspection-v2 — success', () => {
  it('sets status to submitted and returns ok when both gates pass', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('passes when final_total is 0 regardless of payment_status', async () => {
    mockRecord = { data: { id: 'rec-1', status: 'scheduled', payment_status: 'unpaid', final_total: 0 }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
  });
});

describe('submit-inspection-v2 — 404', () => {
  it('returns 404 when record not found', async () => {
    mockRecord = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'nonexistent' }));
    expect(res.statusCode).toBe(404);
  });
});

describe('submit-inspection-v2 — 409', () => {
  it('returns 409 when already submitted', async () => {
    mockRecord = { data: { id: 'rec-1', status: 'submitted', payment_status: 'paid' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/already submitted/i);
  });
});

describe('submit-inspection-v2 — payment gate', () => {
  it('returns 402 when payment_status is unpaid and final_total > 0', async () => {
    mockRecord = { data: { id: 'rec-1', status: 'scheduled', payment_status: 'unpaid', final_total: 375 }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(402);
    expect(JSON.parse(res.body).error).toMatch(/payment required/i);
  });

  it('returns 402 when payment_status is null and final_total > 0', async () => {
    mockRecord = { data: { id: 'rec-1', status: 'scheduled', payment_status: null, final_total: 375 }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(402);
  });
});

describe('submit-inspection-v2 — agreement gate', () => {
  it('returns 403 when no waiver signatures exist', async () => {
    mockSigs = { data: [], error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/agreement must be signed/i);
  });

  it('returns 403 when signatures exist but waiver_version is inactive', async () => {
    mockActiveVersions = { data: [], error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(403);
  });
});

describe('submit-inspection-v2 — errors', () => {
  it('returns 500 on DB error', async () => {
    mockUpdateResult = { error: { message: 'DB down' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(500);
  });
});
