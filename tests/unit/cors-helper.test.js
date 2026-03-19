/**
 * Unit tests for functions/lib/cors.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { corsHeaders } = require('../../functions/lib/cors');

function makeEvent(origin) {
  return { headers: origin ? { origin: origin } : {} };
}

beforeEach(() => {
  // Set env var for tests
  process.env.CORS_ORIGINS = 'https://heartlandinspectiongroup.com,https://www.heartlandinspectiongroup.com,https://heartland-crm.netlify.app,https://quiet-mousse-ce00ef.netlify.app,http://localhost:3000';
});

describe('cors.js — allowed origins', () => {
  it('returns exact origin for production domain', () => {
    var h = corsHeaders(makeEvent('https://heartlandinspectiongroup.com'));
    expect(h['Access-Control-Allow-Origin']).toBe('https://heartlandinspectiongroup.com');
  });

  it('returns exact origin for www production domain', () => {
    var h = corsHeaders(makeEvent('https://www.heartlandinspectiongroup.com'));
    expect(h['Access-Control-Allow-Origin']).toBe('https://www.heartlandinspectiongroup.com');
  });

  it('returns exact origin for Netlify deploy URL', () => {
    var h = corsHeaders(makeEvent('https://heartland-crm.netlify.app'));
    expect(h['Access-Control-Allow-Origin']).toBe('https://heartland-crm.netlify.app');
  });

  it('returns exact origin for test URL', () => {
    var h = corsHeaders(makeEvent('https://quiet-mousse-ce00ef.netlify.app'));
    expect(h['Access-Control-Allow-Origin']).toBe('https://quiet-mousse-ce00ef.netlify.app');
  });

  it('returns exact origin for localhost', () => {
    var h = corsHeaders(makeEvent('http://localhost:3000'));
    expect(h['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
  });
});

describe('cors.js — deploy preview pattern', () => {
  it('matches Netlify deploy preview URLs', () => {
    var h = corsHeaders(makeEvent('https://69b6e503c0ed4857e07a3d7d--heartland-crm.netlify.app'));
    expect(h['Access-Control-Allow-Origin']).toBe('https://69b6e503c0ed4857e07a3d7d--heartland-crm.netlify.app');
  });
});

describe('cors.js — null/absent origin (server-to-server)', () => {
  it('returns no Access-Control-Allow-Origin when origin is absent', () => {
    var h = corsHeaders(makeEvent(null));
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('returns no Access-Control-Allow-Origin when origin is empty string', () => {
    var h = corsHeaders({ headers: { origin: '' } });
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('still returns Allow-Methods and Allow-Headers for server calls', () => {
    var h = corsHeaders(makeEvent(null));
    expect(h['Access-Control-Allow-Methods']).toBeDefined();
    expect(h['Access-Control-Allow-Headers']).toBeDefined();
  });
});

describe('cors.js — unknown origin (blocked)', () => {
  it('returns no Access-Control-Allow-Origin for unknown origin', () => {
    var h = corsHeaders(makeEvent('https://evil-site.com'));
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('still returns Allow-Methods and Allow-Headers for blocked origins', () => {
    var h = corsHeaders(makeEvent('https://evil-site.com'));
    expect(h['Access-Control-Allow-Methods']).toBeDefined();
    expect(h['Access-Control-Allow-Headers']).toBeDefined();
  });
});

describe('cors.js — headers always present', () => {
  it('always includes Allow-Methods', () => {
    var h = corsHeaders(makeEvent('https://heartlandinspectiongroup.com'));
    expect(h['Access-Control-Allow-Methods']).toContain('GET');
    expect(h['Access-Control-Allow-Methods']).toContain('POST');
    expect(h['Access-Control-Allow-Methods']).toContain('OPTIONS');
  });

  it('always includes Allow-Headers with Authorization', () => {
    var h = corsHeaders(makeEvent('https://heartlandinspectiongroup.com'));
    expect(h['Access-Control-Allow-Headers']).toContain('Authorization');
    expect(h['Access-Control-Allow-Headers']).toContain('Content-Type');
    expect(h['Access-Control-Allow-Headers']).toContain('x-admin-token');
  });
});

describe('cors.js — fallback origins when env var not set', () => {
  it('uses hardcoded fallback when CORS_ORIGINS is not set', () => {
    delete process.env.CORS_ORIGINS;
    var h = corsHeaders(makeEvent('https://heartlandinspectiongroup.com'));
    expect(h['Access-Control-Allow-Origin']).toBe('https://heartlandinspectiongroup.com');
  });
});
