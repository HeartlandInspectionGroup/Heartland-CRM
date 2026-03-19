/**
 * Unit tests for save-narrative.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/save-narrative');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockFetchResult, mockUpdateResult;

function mockClient() {
  return {
    from: function () {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                eq: function () {
                  return {
                    maybeSingle: function () {
                      return Promise.resolve(mockFetchResult);
                    },
                  };
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
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockFetchResult = { data: { id: 'narr-1', record_id: 'rec-1', section_id: 'sec-1', draft_narrative: 'AI draft text', status: 'draft' }, error: null };
  mockUpdateResult = { error: null };
  mod._setClient(mockClient());
});

describe('save-narrative — method guards', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 401 without admin token', async () => {
    var res = await handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {}, body: '{}' });
    expect(res.statusCode).toBe(401);
  });
});

describe('save-narrative — validation', () => {
  it('returns 400 when record_id missing', async () => {
    var res = await handler(makeEvent({ section_id: 'sec-1', action: 'approve' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id/);
  });

  it('returns 400 when section_id missing', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', action: 'approve' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/section_id/);
  });

  it('returns 400 when action missing', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/action/);
  });

  it('returns 400 for invalid action', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1', action: 'delete' }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when edit action missing custom_text', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1', action: 'edit' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/custom_text/);
  });
});

describe('save-narrative — 404', () => {
  it('returns 404 when narrative not found', async () => {
    mockFetchResult = { data: null, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1', action: 'approve' }));
    expect(res.statusCode).toBe(404);
  });
});

describe('save-narrative — approve', () => {
  it('returns 200 with status approved', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1', action: 'approve' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('approved');
  });
});

describe('save-narrative — edit', () => {
  it('returns 200 with status custom', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1', action: 'edit', custom_text: 'My custom narrative' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('custom');
  });
});

describe('save-narrative — revert', () => {
  it('returns 200 with status draft', async () => {
    mockFetchResult = { data: { id: 'narr-1', record_id: 'rec-1', section_id: 'sec-1', draft_narrative: 'AI draft', approved_narrative: 'approved', status: 'approved' }, error: null };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1', action: 'revert' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('draft');
  });
});

describe('save-narrative — DB errors', () => {
  it('returns 500 on update error', async () => {
    mockUpdateResult = { error: { message: 'DB down' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1', section_id: 'sec-1', action: 'approve' }));
    expect(res.statusCode).toBe(500);
  });
});
