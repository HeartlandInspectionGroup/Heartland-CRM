/**
 * Unit tests for generate-narrative.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/generate-narrative');
const { handler, _buildSectionPrompt, _SYSTEM_PROMPT } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

// ── Mock data ──────────────────────────────────────────────────────────────

var mockFindings, mockProfile, mockNarratives, mockSections, mockRecs, mockInsertResult, mockUpdateResult;

function mockClient() {
  return {
    from: function (table) {
      var chain = {
        select: function () { return chain; },
        eq: function () { return chain; },
        maybeSingle: function () {
          if (table === 'property_profiles') return Promise.resolve({ data: mockProfile, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then: undefined,
        insert: function () { return Promise.resolve(mockInsertResult); },
        update: function () { return { eq: function () { return Promise.resolve(mockUpdateResult); } }; },
      };
      // Make chain thenable to resolve as Promise for Promise.all
      chain.then = function (resolve, reject) {
        var data;
        if (table === 'inspection_findings') data = mockFindings;
        else if (table === 'inspection_narratives') data = mockNarratives;
        else if (table === 'wizard_sections') data = mockSections;
        else if (table === 'wizard_recommendations') data = mockRecs;
        else data = [];
        return Promise.resolve({ data: data, error: null }).then(resolve, reject);
      };
      return chain;
    },
  };
}

function mockFetch(status, respBody) {
  return function () {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      json: function () { return Promise.resolve(respBody); },
      text: function () { return Promise.resolve(JSON.stringify(respBody)); },
    });
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  process.env.ANTHROPIC_API_KEY = 'test-api-key';
  mockFindings = [
    { id: 'f1', section_id: 'sec-1', condition_value: 'repair', observation: 'Shingle damage', is_safety: false, is_section_pass: false, inspection_finding_recommendations: [{ recommendation_id: 'rec-1', recommendation_note: 'Replace within 2 years' }] },
    { id: 'f2', section_id: 'sec-2', condition_value: 'satisfactory', observation: 'Panel OK', is_safety: false, is_section_pass: false, inspection_finding_recommendations: [] },
  ];
  mockProfile = { property_type: 'single_family', year_built: 1998, foundation_type: 'basement', square_footage: 2400 };
  mockNarratives = [];
  mockSections = [{ id: 'sec-1', name: 'Roofing' }, { id: 'sec-2', name: 'Electrical' }];
  mockRecs = [{ id: 'rec-1', label: 'Roof replacement' }];
  mockInsertResult = { error: null };
  mockUpdateResult = { error: null };
  mod._setClient(mockClient());
  mod._setFetch(mockFetch(200, {
    content: [{ text: '{"sec-1": "The roofing system shows signs of wear...", "sec-2": "The electrical panel is in satisfactory condition..."}' }],
  }));
});

describe('generate-narrative — method guards', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 401 without admin token', async () => {
    var res = await handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {}, body: '{}' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when record_id missing', async () => {
    var res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
  });
});

describe('generate-narrative — skips sections with no findings', () => {
  it('returns no narratives when no findings exist', async () => {
    mockFindings = [];
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.message).toMatch(/no sections/i);
  });
});

describe('generate-narrative — does not overwrite approved/custom', () => {
  it('skips sections with approved status', async () => {
    mockNarratives = [{ section_id: 'sec-1', status: 'approved', draft_narrative: 'existing' }];
    // Only sec-2 should be generated (sec-1 is approved)
    mockFindings = [
      { id: 'f1', section_id: 'sec-1', condition_value: 'repair', observation: 'Shingle damage', is_safety: false, is_section_pass: false, inspection_finding_recommendations: [] },
      { id: 'f2', section_id: 'sec-2', condition_value: 'satisfactory', observation: 'Panel OK', is_safety: false, is_section_pass: false, inspection_finding_recommendations: [] },
    ];
    mod._setClient(mockClient());
    mod._setFetch(mockFetch(200, {
      content: [{ text: '{"sec-2": "The electrical panel is satisfactory..."}' }],
    }));

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.narratives['sec-1']).toBeUndefined();
    expect(data.narratives['sec-2']).toBeDefined();
  });

  it('skips sections with custom status', async () => {
    mockNarratives = [{ section_id: 'sec-1', status: 'custom' }, { section_id: 'sec-2', status: 'custom' }];
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.message).toMatch(/no sections/i);
  });
});

describe('generate-narrative — returns 502 on API failure', () => {
  it('returns 502 when Anthropic API returns error', async () => {
    mod._setFetch(mockFetch(500, { error: 'Internal error' }));

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(502);
  });

  it('returns error when fetch throws', async () => {
    mod._setFetch(function () { return Promise.reject(new Error('Network error')); });

    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    // Returns 500 (generic catch) or 502 (API-specific catch) depending on which fetch fails
    expect([500, 502]).toContain(res.statusCode);
  });
});

describe('generate-narrative — regenerates single section', () => {
  it('only generates for specified section_ids', async () => {
    mod._setFetch(mockFetch(200, {
      content: [{ text: '{"sec-2": "The electrical panel..."}' }],
    }));

    var res = await handler(makeEvent({ record_id: 'rec-1', section_ids: ['sec-2'] }));
    expect(res.statusCode).toBe(200);
    var data = JSON.parse(res.body);
    expect(data.narratives['sec-2']).toBeDefined();
    expect(data.narratives['sec-1']).toBeUndefined();
  });
});

describe('prompt builder — content', () => {
  it('includes section name', () => {
    var prompt = _buildSectionPrompt(
      { id: 'sec-1', name: 'Roofing' },
      [{ condition_value: 'repair', observation: 'damage', recommendations: [] }],
      null, {}
    );
    expect(prompt).toContain('SECTION: Roofing');
  });

  it('includes property context when profile provided', () => {
    var prompt = _buildSectionPrompt(
      { id: 'sec-1', name: 'Roofing' },
      [{ condition_value: 'repair', observation: 'damage', recommendations: [] }],
      { property_type: 'single_family', year_built: 1998, foundation_type: 'basement', square_footage: 2400 },
      {}
    );
    expect(prompt).toContain('single_family');
    expect(prompt).toContain('1998');
    expect(prompt).toContain('basement');
    expect(prompt).toContain('2400');
  });

  it('includes findings with ratings and observations', () => {
    var prompt = _buildSectionPrompt(
      { id: 'sec-1', name: 'Roofing' },
      [{ condition_value: 'repair', observation: 'Shingle damage on north slope', is_safety: true, recommendations: [] }],
      null, {}
    );
    expect(prompt).toContain('Rating: repair');
    expect(prompt).toContain('Shingle damage on north slope');
    expect(prompt).toContain('[SAFETY CONCERN]');
  });

  it('resolves recommendation labels', () => {
    var prompt = _buildSectionPrompt(
      { id: 'sec-1', name: 'Roofing' },
      [{ condition_value: 'repair', observation: 'damage', recommendations: [{ recommendation_id: 'rec-1', recommendation_note: 'urgent' }] }],
      null,
      { 'rec-1': 'Roof replacement' }
    );
    expect(prompt).toContain('Roof replacement');
    expect(prompt).toContain('urgent');
  });
});

describe('system prompt — guardrails', () => {
  it('prohibits banned words', () => {
    expect(_SYSTEM_PROMPT).toContain('immediately, dangerous, urgent, critical, emergency, must, failure');
  });

  it('prohibits cost estimates', () => {
    expect(_SYSTEM_PROMPT).toContain('cost estimates');
  });

  it('prohibits predicting future outcomes', () => {
    expect(_SYSTEM_PROMPT).toContain('Predict future outcomes');
  });

  it('requires third person past tense', () => {
    expect(_SYSTEM_PROMPT).toContain('third person, past tense');
  });

  it('instructs to reference qualified contractor', () => {
    expect(_SYSTEM_PROMPT).toContain('qualified contractor');
  });

  it('requires JSON output keyed by section_id', () => {
    expect(_SYSTEM_PROMPT).toContain('JSON');
    expect(_SYSTEM_PROMPT).toContain('section_id');
  });

  it('closes sections with standard closing statement', () => {
    expect(_SYSTEM_PROMPT).toContain('Further evaluation and repair by a qualified contractor is recommended for any items noted above');
  });
});
