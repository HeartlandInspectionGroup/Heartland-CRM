/**
 * Unit tests for scan-equipment-label.js (HEA-220 + HEA-230)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/scan-equipment-label');
const { handler, _decodeSerialDateAI } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

function mockFetch(visionResponse, cpscResponse, dateDecodeResponse) {
  var callCount = 0;
  return function (url, opts) {
    callCount++;
    // Anthropic API calls
    if (url.indexOf('anthropic.com') >= 0) {
      // Determine if this is the vision call or date decode call by checking body
      var body = '';
      try { body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body); } catch (e) {}
      var isDateDecode = body.indexOf('serial number expert') >= 0;
      if (isDateDecode && dateDecodeResponse) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () { return Promise.resolve(dateDecodeResponse); },
          text: function () { return Promise.resolve(JSON.stringify(dateDecodeResponse)); },
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () { return Promise.resolve(visionResponse); },
        text: function () { return Promise.resolve(JSON.stringify(visionResponse)); },
      });
    }
    // CPSC API
    if (url.indexOf('saferproducts.gov') >= 0) {
      if (cpscResponse === null) {
        return Promise.reject(new Error('CPSC timeout'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () { return Promise.resolve(cpscResponse); },
        text: function () { return Promise.resolve(JSON.stringify(cpscResponse)); },
      });
    }
    return Promise.reject(new Error('Unexpected URL: ' + url));
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  process.env.ANTHROPIC_API_KEY = 'test-api-key';
});

// ── AI-based serial number date decoder tests ──────────────────────────

describe('AI serial number date decoder', () => {
  it('returns decoded date for high confidence result', async () => {
    var fakeFetch = function (url, opts) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({
            content: [{ text: '{"manufacture_year":2018,"manufacture_month":3,"confidence":"high","decode_method":"Carrier: positions 5-6 = year"}' }],
          });
        },
      });
    };
    var result = await _decodeSerialDateAI('Carrier', '2318A12345', 'test-key', fakeFetch);
    expect(result).not.toBeNull();
    expect(result.year).toBe(2018);
    expect(result.month).toBe(3);
    expect(result.confidence).toBe('high');
    expect(result.decode_method).toBe('Carrier: positions 5-6 = year');
  });

  it('returns decoded date for medium confidence result', async () => {
    var fakeFetch = function (url, opts) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({
            content: [{ text: '{"manufacture_year":2020,"manufacture_month":null,"confidence":"medium","decode_method":"Navien: first two digits = year"}' }],
          });
        },
      });
    };
    var result = await _decodeSerialDateAI('Navien', 'AB2004XYZ', 'test-key', fakeFetch);
    expect(result).not.toBeNull();
    expect(result.year).toBe(2020);
    expect(result.month).toBeNull();
    expect(result.confidence).toBe('medium');
  });

  it('returns null for low confidence result', async () => {
    var fakeFetch = function (url, opts) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({
            content: [{ text: '{"manufacture_year":null,"manufacture_month":null,"confidence":"low","decode_method":"unknown format"}' }],
          });
        },
      });
    };
    var result = await _decodeSerialDateAI('UnknownBrand', 'XYZ123', 'test-key', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null when brand or serial is missing', async () => {
    var fakeFetch = function () { return Promise.reject(new Error('should not be called')); };
    expect(await _decodeSerialDateAI(null, 'ABC123', 'test-key', fakeFetch)).toBeNull();
    expect(await _decodeSerialDateAI('Carrier', null, 'test-key', fakeFetch)).toBeNull();
  });

  it('returns null when API returns error status', async () => {
    var fakeFetch = function (url, opts) {
      return Promise.resolve({ ok: false, status: 500 });
    };
    var result = await _decodeSerialDateAI('Carrier', '2318A12345', 'test-key', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null when API response is unparseable', async () => {
    var fakeFetch = function (url, opts) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({
            content: [{ text: 'not valid json at all' }],
          });
        },
      });
    };
    var result = await _decodeSerialDateAI('Carrier', '2318A12345', 'test-key', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    var fakeFetch = function () { return Promise.reject(new Error('network error')); };
    var result = await _decodeSerialDateAI('Carrier', '2318A12345', 'test-key', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null for future year in decode result', async () => {
    var fakeFetch = function (url, opts) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({
            content: [{ text: '{"manufacture_year":2099,"manufacture_month":1,"confidence":"high","decode_method":"test"}' }],
          });
        },
      });
    };
    var result = await _decodeSerialDateAI('Carrier', 'FUTURE123', 'test-key', fakeFetch);
    expect(result).toBeNull();
  });
});

// ── Vision response parsing ──────────────────────────────────────────

describe('scan-equipment-label — Claude Vision response', () => {
  it('returns structured JSON from Claude Vision', async () => {
    mod._setFetch(mockFetch(
      {
        content: [{ text: '{"brand":"Carrier","model":"58CVA080-12","serial":"2318A12345","manufacture_date":"2018","capacity":"80,000 BTU","efficiency_rating":"80% AFUE"}' }],
      },
      [],
      { content: [{ text: '{"manufacture_year":2018,"manufacture_month":3,"confidence":"high","decode_method":"Carrier format"}' }] }
    ));

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg', sectionType: 'Heating' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.brand).toBe('Carrier');
    expect(data.model).toBe('58CVA080-12');
    expect(data.serial).toBe('2318A12345');
    expect(data.capacity).toBe('80,000 BTU');
    expect(data.efficiency).toBe('80% AFUE');
    expect(data.age).toBe(new Date().getFullYear() - 2018);
    expect(data.manufactureDate).toBe('2018-03-01');
  });

  it('handles Claude Vision returning partial data', async () => {
    mod._setFetch(mockFetch(
      {
        content: [{ text: '{"brand":"Trane","model":null,"serial":null,"manufacture_date":null,"capacity":null,"efficiency_rating":null}' }],
      },
      []
    ));

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg', sectionType: 'Cooling' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.brand).toBe('Trane');
    expect(data.model).toBeNull();
    // No serial = no date decode call, so age should be null
    expect(data.age).toBeNull();
  });

  it('returns age=null when AI date decode returns low confidence', async () => {
    mod._setFetch(mockFetch(
      {
        content: [{ text: '{"brand":"SomeBrand","model":"X","serial":"ABC123","manufacture_date":null,"capacity":null,"efficiency_rating":null}' }],
      },
      [],
      { content: [{ text: '{"manufacture_year":null,"manufacture_month":null,"confidence":"low","decode_method":"unknown format"}' }] }
    ));

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg' }));
    var data = JSON.parse(res.body);
    expect(data.age).toBeNull();
    expect(data.manufactureDate).toBeNull();
  });
});

// ── CPSC API query construction ──────────────────────────────────────

describe('scan-equipment-label — CPSC API', () => {
  it('queries CPSC with brand and model', async () => {
    var capturedUrls = [];
    mod._setFetch(function (url, opts) {
      capturedUrls.push(url);
      if (url.indexOf('anthropic.com') >= 0) {
        // Check if it's the date decode call
        var body = '';
        try { body = typeof opts.body === 'string' ? opts.body : ''; } catch (e) {}
        if (body.indexOf('serial number expert') >= 0) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: function () { return Promise.resolve({ content: [{ text: '{"manufacture_year":null,"manufacture_month":null,"confidence":"low","decode_method":"unknown"}' }] }); },
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () { return Promise.resolve({ content: [{ text: '{"brand":"Carrier","model":"58CVA","serial":"ABC123","manufacture_date":null,"capacity":null,"efficiency_rating":null}' }] }); },
        });
      }
      if (url.indexOf('saferproducts.gov') >= 0) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () { return Promise.resolve([]); },
        });
      }
      return Promise.reject(new Error('Unexpected: ' + url));
    });

    await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg' }));

    var cpscUrl = capturedUrls.find(function (u) { return u.indexOf('saferproducts.gov') >= 0; });
    expect(cpscUrl).toBeDefined();
    expect(cpscUrl).toContain('ProductName=Carrier');
    expect(cpscUrl).toContain('RecallDescription=58CVA');
  });

  it('returns recallStatus=found when CPSC returns matches', async () => {
    mod._setFetch(mockFetch(
      { content: [{ text: '{"brand":"Carrier","model":"ABC","serial":null,"manufacture_date":null,"capacity":null,"efficiency_rating":null}' }] },
      [{ RecallNumber: 'R123', RecallDate: '2024-01-15', Description: 'Fire hazard', Hazard: 'Fire', URL: 'https://cpsc.gov/recall/123' }]
    ));

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg' }));
    var data = JSON.parse(res.body);
    expect(data.recallStatus).toBe('found');
    expect(data.recalls.length).toBe(1);
    expect(data.recalls[0].url).toBe('https://cpsc.gov/recall/123');
  });

  it('returns recallStatus=unavailable when CPSC times out', async () => {
    mod._setFetch(function (url, opts) {
      if (url.indexOf('anthropic.com') >= 0) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () { return Promise.resolve({ content: [{ text: '{"brand":"Carrier","model":"X","serial":null,"manufacture_date":null,"capacity":null,"efficiency_rating":null}' }] }); },
        });
      }
      // CPSC call throws
      return Promise.reject(new Error('timeout'));
    });

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.recallStatus).toBe('unavailable');
    expect(data.brand).toBe('Carrier');
  });

  it('returns recallStatus=none when CPSC returns empty array', async () => {
    mod._setFetch(mockFetch(
      { content: [{ text: '{"brand":"Rheem","model":"XYZ","serial":null,"manufacture_date":null,"capacity":null,"efficiency_rating":null}' }] },
      []
    ));

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg' }));
    var data = JSON.parse(res.body);
    expect(data.recallStatus).toBe('none');
    expect(data.recalls).toEqual([]);
  });
});

// ── Auth and validation ─────────────────────────────────────────────

describe('scan-equipment-label — guards', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {} });
    expect(res.statusCode).toBe(204);
  });

  it('returns 401 without auth', async () => {
    var res = await handler({ httpMethod: 'POST', headers: {}, body: '{}' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when imageUrl missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    var data = JSON.parse(res.body);
    expect(data.error).toContain('imageUrl');
  });

  it('returns 500 when ANTHROPIC_API_KEY not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg' }));
    expect(res.statusCode).toBe(500);
    var data = JSON.parse(res.body);
    expect(data.error).toContain('ANTHROPIC_API_KEY');
  });
});

// ── Integration: age calculation in handler ──────────────────────────

describe('scan-equipment-label — age from AI decode', () => {
  it('calculates age_years from AI-decoded manufacture year', async () => {
    mod._setFetch(mockFetch(
      { content: [{ text: '{"brand":"Navien","model":"NPE-240A","serial":"NV2019ABC","manufacture_date":null,"capacity":"199,000 BTU","efficiency_rating":"0.97 UEF"}' }] },
      [],
      { content: [{ text: '{"manufacture_year":2019,"manufacture_month":6,"confidence":"high","decode_method":"Navien: digits 3-6 = year"}' }] }
    ));

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg', sectionType: 'Plumbing' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.brand).toBe('Navien');
    expect(data.age).toBe(new Date().getFullYear() - 2019);
    expect(data.manufactureDate).toBe('2019-06-01');
    expect(data.capacity).toBe('199,000 BTU');
    expect(data.efficiency).toBe('0.97 UEF');
  });

  it('skips date decode when serial is null', async () => {
    var anthropicCalls = 0;
    mod._setFetch(function (url, opts) {
      if (url.indexOf('anthropic.com') >= 0) {
        anthropicCalls++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () {
            return Promise.resolve({
              content: [{ text: '{"brand":"Lennox","model":"XC21","serial":null,"manufacture_date":null,"capacity":null,"efficiency_rating":null}' }],
            });
          },
        });
      }
      if (url.indexOf('saferproducts.gov') >= 0) {
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([]); } });
      }
      return Promise.reject(new Error('Unexpected: ' + url));
    });

    var res = await handler(makeEvent({ imageUrl: 'https://example.com/label.jpg' }));
    var data = JSON.parse(res.body);
    // Only 1 Anthropic call (vision), no date decode call since serial is null
    expect(anthropicCalls).toBe(1);
    expect(data.age).toBeNull();
  });
});
