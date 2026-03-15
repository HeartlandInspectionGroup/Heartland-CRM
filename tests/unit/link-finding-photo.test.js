/**
 * Unit tests for link-finding-photo.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/link-finding-photo');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockPhotoResult, mockFindingResult, mockUpdateResult;
var capturedUpdate;

function mockClient() {
  return {
    from: function (table) {
      if (table === 'inspection_finding_photos') {
        return {
          select: function () {
            return {
              eq: function () {
                return {
                  single: function () {
                    return Promise.resolve(mockPhotoResult);
                  },
                };
              },
            };
          },
          update: function (vals) {
            capturedUpdate = vals;
            return {
              eq: function () {
                return Promise.resolve(mockUpdateResult);
              },
            };
          },
        };
      }
      if (table === 'inspection_findings') {
        return {
          select: function () {
            return {
              eq: function () {
                return {
                  single: function () {
                    return Promise.resolve(mockFindingResult);
                  },
                };
              },
            };
          },
        };
      }
      return {};
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockPhotoResult = { data: { id: 'photo-1', record_id: 'rec-1' }, error: null };
  mockFindingResult = { data: { id: 'find-1', record_id: 'rec-1' }, error: null };
  mockUpdateResult = { error: null };
  capturedUpdate = null;
  mod._setClient(mockClient());
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('link-finding-photo — validation', () => {
  it('returns 400 when photo_id is missing', async () => {
    var res = await handler(makeEvent({ finding_id: 'f1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/photo_id required/);
  });
});

// ─── Linking ──────────────────────────────────────────────────────────────────

describe('link-finding-photo — link', () => {
  it('updates finding_id on the photo', async () => {
    var res = await handler(makeEvent({ photo_id: 'photo-1', finding_id: 'find-1' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(capturedUpdate.finding_id).toBe('find-1');
  });

  it('rejects cross-record link with 403', async () => {
    mockPhotoResult = { data: { id: 'photo-1', record_id: 'rec-A' }, error: null };
    mockFindingResult = { data: { id: 'find-1', record_id: 'rec-B' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ photo_id: 'photo-1', finding_id: 'find-1' }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/different records/);
  });
});

// ─── Unlinking ────────────────────────────────────────────────────────────────

describe('link-finding-photo — unlink', () => {
  it('sets finding_id to null when finding_id is null', async () => {
    var res = await handler(makeEvent({ photo_id: 'photo-1', finding_id: null }));

    expect(res.statusCode).toBe(200);
    expect(capturedUpdate.finding_id).toBeNull();
  });

  it('sets finding_id to null when finding_id is omitted', async () => {
    var res = await handler(makeEvent({ photo_id: 'photo-1' }));

    expect(res.statusCode).toBe(200);
    expect(capturedUpdate.finding_id).toBeNull();
  });
});

// ─── Errors ───────────────────────────────────────────────────────────────────

describe('link-finding-photo — errors', () => {
  it('returns 500 on photo lookup error', async () => {
    mockPhotoResult = { data: null, error: { message: 'DB down' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ photo_id: 'photo-1', finding_id: 'find-1' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('DB down');
  });
});
