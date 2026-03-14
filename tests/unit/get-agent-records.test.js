/**
 * Unit tests for get-agent-records.js
 *
 * Tests cover:
 *  - HTTP method guards (GET only)
 *  - Missing token → 401
 *  - Bad/inactive token → 401
 *  - Valid token → agent_id from DB used, never client-supplied
 *  - All three datasets returned correctly
 *  - DB fetch error → 500
 *  - agent_id isolation (different tokens return different agent IDs)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { handler, _validateAgentToken } = require('../../functions/get-agent-records');

// ── Mock fetch factory ────────────────────────────────────────────────────────

function makeFetch(agentRow, records, waiverVersions, waiverSignatures) {
  return vi.fn(function(url) {
    if (url.includes('agents?portal_token')) {
      var body = agentRow ? [agentRow] : [];
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    }
    if (url.includes('inspection_records')) {
      var r = records || [];
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(r),
        text: () => Promise.resolve(JSON.stringify(r)),
      });
    }
    if (url.includes('waiver_versions')) {
      var wv = waiverVersions || [];
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(wv),
        text: () => Promise.resolve(JSON.stringify(wv)),
      });
    }
    if (url.includes('waiver_signatures')) {
      var ws = waiverSignatures || [];
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(ws),
        text: () => Promise.resolve(JSON.stringify(ws)),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  });
}

function makeEvent(token) {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: token !== undefined ? { token } : {},
    body: '',
  };
}

const FAKE_AGENT = { id: 'agent-uuid-123', name: 'Jake', role: 'agent' };

// ═════════════════════════════════════════════════════════════════════════════
// HTTP method guards
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — HTTP method', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });

  it('returns 204 for OPTIONS preflight', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for POST', async () => {
    var res = await handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(405);
  });

  it('returns 405 for PUT', async () => {
    var res = await handler({ httpMethod: 'PUT', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(405);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Auth — token validation
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — auth', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });

  it('returns 401 when token is missing', async () => {
    global.fetch = makeFetch(null);
    var res = await handler(makeEvent(undefined));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/token required/i);
  });

  it('returns 401 when token is empty string', async () => {
    global.fetch = makeFetch(null);
    var res = await handler(makeEvent(''));
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token does not match any active agent', async () => {
    global.fetch = makeFetch(null); // empty agents result
    var res = await handler(makeEvent('bad-token'));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/invalid.*token/i);
  });

  it('returns 401 for inactive agent (active=eq.true filter excludes them)', async () => {
    global.fetch = makeFetch(null); // active filter means inactive agents return empty
    var res = await handler(makeEvent('inactive-token'));
    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Successful response shape
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — success', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });

  it('returns 200 with records, waiver_versions, waiver_signatures', async () => {
    var fakeRecords   = [{ id: 'rec-1', cust_name: 'Jane', agent_id: FAKE_AGENT.id }];
    var fakeVersions  = [{ id: 'wv-1', name: 'Standard Waiver', is_active: true }];
    var fakeSigs      = [{ id: 'sig-1', inspection_record_id: 'rec-1' }];

    global.fetch = makeFetch(FAKE_AGENT, fakeRecords, fakeVersions, fakeSigs);
    var res = await handler(makeEvent('valid-token'));
    expect(res.statusCode).toBe(200);

    var body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.records).toEqual(fakeRecords);
    expect(body.waiver_versions).toEqual(fakeVersions);
    expect(body.waiver_signatures).toEqual(fakeSigs);
  });

  it('returns agent_id in response', async () => {
    global.fetch = makeFetch(FAKE_AGENT, [], [], []);
    var res = await handler(makeEvent('valid-token'));
    var body = JSON.parse(res.body);
    expect(body.agent_id).toBe(FAKE_AGENT.id);
  });

  it('returns empty arrays when no records exist', async () => {
    global.fetch = makeFetch(FAKE_AGENT, [], [], []);
    var res = await handler(makeEvent('valid-token'));
    var body = JSON.parse(res.body);
    expect(body.records).toEqual([]);
    expect(body.waiver_versions).toEqual([]);
    expect(body.waiver_signatures).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// agent_id isolation — key security property
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — agent_id isolation', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });

  it('queries inspection_records using agent_id from DB, not from client', async () => {
    var queriedUrl = null;
    var agentFromDB = { id: 'db-agent-uuid', name: 'Jake', role: 'agent' };

    global.fetch = vi.fn(function(url) {
      if (url.includes('agents?portal_token')) {
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve([agentFromDB]),
          text: () => Promise.resolve(JSON.stringify([agentFromDB])) });
      }
      if (url.includes('inspection_records')) {
        queriedUrl = url;
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve([]),
          text: () => Promise.resolve('[]') });
      }
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });

    // Even if the client tried to inject a different agent_id via the token,
    // the URL queried must use the agent_id from the DB row
    await handler(makeEvent('valid-token'));
    expect(queriedUrl).toContain('agent_id=eq.' + agentFromDB.id);
    expect(queriedUrl).not.toContain('agent_id=eq.some-other-agent-id');
  });

  it('two different tokens return different agent_ids in query', async () => {
    var agentA = { id: 'agent-A', name: 'Alice', role: 'agent' };
    var agentB = { id: 'agent-B', name: 'Bob',   role: 'agent' };
    var queriedUrls = [];

    function makeAgentFetch(agent) {
      return vi.fn(function(url) {
        if (url.includes('agents?portal_token')) {
          return Promise.resolve({ ok: true, status: 200,
            json: () => Promise.resolve([agent]),
            text: () => Promise.resolve(JSON.stringify([agent])) });
        }
        if (url.includes('inspection_records')) {
          queriedUrls.push(url);
        }
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
      });
    }

    global.fetch = makeAgentFetch(agentA);
    await handler(makeEvent('token-A'));
    global.fetch = makeAgentFetch(agentB);
    await handler(makeEvent('token-B'));

    expect(queriedUrls[0]).toContain('agent_id=eq.agent-A');
    expect(queriedUrls[1]).toContain('agent_id=eq.agent-B');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Error handling
// ═════════════════════════════════════════════════════════════════════════════

describe('handler — error handling', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });

  it('returns 500 when inspection_records fetch fails', async () => {
    global.fetch = vi.fn(function(url) {
      if (url.includes('agents?portal_token')) {
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve([FAKE_AGENT]),
          text: () => Promise.resolve(JSON.stringify([FAKE_AGENT])) });
      }
      // All other fetches fail
      return Promise.resolve({ ok: false, status: 500,
        json: () => Promise.resolve({ message: 'DB error' }),
        text: () => Promise.resolve('DB error') });
    });

    var res = await handler(makeEvent('valid-token'));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/failed to load/i);
  });

  it('returns 500 when DB is not configured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    var res = await handler(makeEvent('any-token'));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/not configured/i);
    // Restore
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  });
});
