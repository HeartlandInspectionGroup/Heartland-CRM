/**
 * Unit tests for get-narratives.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/get-narratives');
const { handler } = mod;

function makeEvent(params, token) {
  return {
    httpMethod: 'GET',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: params || {},
    body: '',
  };
}

var mockResult;

function mockClient() {
  return {
    from: function () {
      return {
        select: function () {
          return {
            eq: function () {
              return Promise.resolve(mockResult);
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockResult = { data: [], error: null };
  mod._setClient(mockClient());
});

describe('get-narratives — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });
});

describe('get-narratives — success', () => {
  it('returns narratives keyed by section_id', async () => {
    mockResult = {
      data: [
        { id: 'n1', record_id: 'rec-1', section_id: 'sec-A', draft_narrative: 'Draft A', status: 'draft' },
        { id: 'n2', record_id: 'rec-1', section_id: 'sec-B', draft_narrative: 'Draft B', status: 'draft' },
      ],
      error: null,
    };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);

    var body = JSON.parse(res.body);
    expect(body.narratives['sec-A'].draft_narrative).toBe('Draft A');
    expect(body.narratives['sec-B'].draft_narrative).toBe('Draft B');
  });

  it('returns empty object when no narratives exist', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-empty' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).narratives).toEqual({});
  });
});

describe('get-narratives — errors', () => {
  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'timeout' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(500);
  });
});
