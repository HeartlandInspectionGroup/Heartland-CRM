/**
 * Netlify Function: generate-narrative
 *
 * Generates AI draft narratives. Supports two modes:
 *   1. Per-finding (new): POST { record_id, findings: [{ id, section_id, observation, condition_value, photo_urls }] }
 *   2. Per-section (legacy): POST { record_id, section_ids?, photo_urls? }
 *
 * Per-finding mode: one Anthropic call per finding (parallel), stores narrative on inspection_findings row.
 * Per-section mode: one Anthropic call for all sections, stores in inspection_narratives table.
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { writeAuditLog } = require('./write-audit-log');

const { corsHeaders } = require('./lib/cors');

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

// Allow tests to inject a fetch stub for Anthropic calls
var _fetch = typeof fetch !== 'undefined' ? fetch : null;
exports._setFetch = function (f) { _fetch = f; };

// ── System prompt ────────────────────────────────────────────────────────

var SYSTEM_PROMPT_FINDING = 'You are a licensed home inspection report writer. Your job is to write factual, professional narratives for individual inspection findings. You describe only what is observable — you do not diagnose, speculate, estimate costs, or make safety declarations beyond what the inspector has already recorded.\n\nYou must never:\n- Describe causes, origins, or how long a condition has existed\n- Include cost estimates or repair cost ranges of any kind\n- Name specific contractors, products, or brands\n- Upgrade or downgrade the severity level provided by the inspector\n- Declare something a code violation or structural failure unless the inspector\'s severity field explicitly says "Safety Concern" and the observation supports it\n- Use the words: immediately, dangerous, urgent, critical, emergency, must, failure, or unsafe — unless severity is "Safety Concern" and the inspector\'s observation uses representative language\n- Predict future outcomes ("this will worsen," "left unaddressed this could")\n- Describe anything not confirmed by the inspector\'s text fields or visible in the provided photos\n- Exceed 4 sentences\n\nYou must always:\n- Write in third person, past tense\n- Reflect the inspector\'s severity level as provided — do not reinterpret it\n- Close every finding with the exact closing statement mapped to the severity level below — no substitutions, no paraphrasing\n- If photo content is unclear or absent, rely only on the text fields provided\n\nClosing statements by severity — use verbatim:\n- Safety Concern: "This condition poses a potential safety risk. Immediate evaluation and correction by a qualified contractor is strongly recommended."\n- Major Defect: "Further evaluation and repair by a qualified contractor is recommended prior to closing."\n- Moderate Defect: "Further evaluation and repair by a qualified contractor is recommended."\n- Maintenance Item: "Routine maintenance and monitoring is recommended."\n- Informational: "Noted for awareness. No immediate action required."\n\nReturn ONLY the narrative text. No JSON, no markdown, no labels.';

// ── Standalone system prompt (HEA-226) — for Manual Narrative Generator ──────
var SYSTEM_PROMPT_STANDALONE = 'You are a professional home inspection report writer.\nYou will receive a photo, an optional observation note, or both.\nWrite a clear, professional inspection narrative paragraph describing what is observed.\nFocus on condition, location, and any visible defects or concerns.\nBe concise — 2-4 sentences, third person, past tense, factual.\nDo not ask for additional information. Generate the narrative based on what you have.\nReturn ONLY the narrative text. No JSON, no markdown, no labels.';

// Legacy section-level system prompt (kept for backwards compat)
var SYSTEM_PROMPT_SECTION = 'You are a licensed home inspection report writer. Your job is to write factual, professional narratives for inspection sections. You describe only what is observable — you do not diagnose, speculate, estimate costs, or make safety declarations beyond what the inspector has already recorded.\n\nYou must never:\n- Describe causes, origins, or how long a condition has existed\n- Include cost estimates or repair cost ranges of any kind\n- Name specific contractors, products, or brands\n- Upgrade or downgrade the severity levels provided by the inspector\n- Declare something a code violation or structural failure unless the inspector\'s severity field explicitly says "Safety Concern" and the observation supports it\n- Use the words: immediately, dangerous, urgent, critical, emergency, must, failure, or unsafe — unless a finding is marked "Safety Concern" and the observation supports it\n- Predict future outcomes ("this will worsen," "left unaddressed this could")\n- Describe anything not confirmed by the inspector\'s text fields or visible in the provided photos\n\nYou must always:\n- Write in third person, past tense\n- Write one cohesive paragraph per section summarizing all findings in that section\n- Reflect the inspector\'s severity levels as provided — do not reinterpret them\n- Close each section narrative with: "Further evaluation and repair by a qualified contractor is recommended for any items noted above."\n- If photo content is unclear or absent, rely only on the text fields provided\n\nReturn your response as valid JSON: an object keyed by section_id, where each value is the narrative string for that section. No markdown fences, no extra text outside the JSON object.';

// ── Helpers ──────────────────────────────────────────────────────────────

function applyCloudinaryTransform(url) {
  if (!url || url.indexOf('/upload/') === -1) return url;
  return url.replace('/upload/', '/upload/w_800,q_70,f_jpg/');
}

function buildPhotoUrlsFromDB(findingPhotos) {
  var bySection = {};
  (findingPhotos || []).forEach(function (p) {
    var sid = p.section_id;
    if (!sid) return;
    var url = p.annotated_url || p.cloudinary_url;
    if (!url) return;
    if (!bySection[sid]) bySection[sid] = [];
    if (bySection[sid].length < 10) {
      bySection[sid].push(applyCloudinaryTransform(url));
    }
  });
  return bySection;
}

function buildSectionPrompt(section, findings, profile, recLabels) {
  var lines = [];
  lines.push('SECTION: ' + section.name);

  if (profile) {
    var ctx = [];
    if (profile.property_type) ctx.push('Property type: ' + profile.property_type);
    if (profile.year_built) ctx.push('Year built: ' + profile.year_built);
    if (profile.foundation_type) ctx.push('Foundation: ' + profile.foundation_type);
    if (profile.square_footage) ctx.push('Square footage: ' + profile.square_footage);
    if (profile.construction_type) ctx.push('Construction: ' + profile.construction_type);
    if (profile.roof_type) ctx.push('Roof type: ' + profile.roof_type);
    if (ctx.length) lines.push('PROPERTY CONTEXT: ' + ctx.join(', '));
  }

  lines.push('');
  lines.push('FINDINGS:');

  findings.forEach(function (f, i) {
    var desc = [];
    desc.push('Finding ' + (i + 1) + ':');
    if (f.condition_value) desc.push('Rating: ' + f.condition_value);
    if (f.is_safety) desc.push('[SAFETY CONCERN]');
    if (f.observation) desc.push('Observation: ' + f.observation);
    if (f.custom_label) desc.push('Item: ' + f.custom_label);
    if (f.materials_value) desc.push('Materials: ' + f.materials_value);
    if (f.measurement_value) desc.push('Measurement: ' + f.measurement_value);

    if (f.recommendations && f.recommendations.length) {
      var recs = f.recommendations.map(function (r) {
        var label = recLabels[r.recommendation_id] || 'See recommendation';
        return r.recommendation_note ? label + ' (' + r.recommendation_note + ')' : label;
      });
      desc.push('Recommendations: ' + recs.join('; '));
    }

    lines.push('  ' + desc.join(' | '));
  });

  return lines.join('\n');
}

exports._applyCloudinaryTransform = applyCloudinaryTransform;
exports._buildPhotoUrlsFromDB = buildPhotoUrlsFromDB;
exports._buildSectionPrompt = buildSectionPrompt;
exports._SYSTEM_PROMPT = SYSTEM_PROMPT_SECTION;
exports._SYSTEM_PROMPT_STANDALONE = SYSTEM_PROMPT_STANDALONE;
exports._generateStandalone = generateStandalone;

// ── Standalone generation (HEA-226) — photo, comment, or both ────────────

async function generateStandalone(finding, apiKey, fetchFn) {
  var contentBlocks = [];
  var photos = (finding.photo_urls || []).slice(0, 3);
  photos.forEach(function (url) {
    var transformed = applyCloudinaryTransform(url);
    contentBlocks.push({ type: 'image', source: { type: 'url', url: transformed } });
  });

  var hasPhoto = photos.length > 0;
  var hasText = !!(finding.observation && finding.observation.trim());

  var text = '';
  if (hasPhoto && hasText) {
    text = 'Write a professional inspection narrative based on this photo and the following observation:\n' + finding.observation.trim();
  } else if (hasPhoto) {
    text = 'Write a professional inspection narrative describing what you observe in this photo.';
  } else if (hasText) {
    text = 'Write a professional inspection narrative based on the following observation:\n' + finding.observation.trim();
  }

  contentBlocks.push({ type: 'text', text: text });

  var apiRes = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: SYSTEM_PROMPT_STANDALONE,
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });

  if (!apiRes.ok) {
    var errText = '';
    try { errText = await apiRes.text(); } catch (e) {}
    throw new Error('Anthropic API error ' + apiRes.status + ': ' + errText.substring(0, 200));
  }

  var data = await apiRes.json();
  var narrative = '';
  if (data.content && data.content.length) {
    narrative = data.content.map(function (c) { return c.text || ''; }).join('').trim();
  }
  narrative = narrative.replace(/```[a-z]*\s*/g, '').replace(/```\s*/g, '').trim();
  return narrative;
}

// ── Per-finding generation ───────────────────────────────────────────────

async function generateForFinding(finding, apiKey, fetchFn) {
  var contentBlocks = [];

  // Add up to 3 photo image blocks
  var photos = (finding.photo_urls || []).slice(0, 3);
  photos.forEach(function (url) {
    var transformed = applyCloudinaryTransform(url);
    contentBlocks.push({ type: 'image', source: { type: 'url', url: transformed } });
  });

  // Build text prompt
  var text = 'Generate a professional home inspection narrative for the following finding.\n';
  text += 'Finding: ' + (finding.observation || finding.custom_label || 'Inspection finding') + '\n';
  if (finding.condition_value) text += 'Condition: ' + finding.condition_value + '\n';
  if (finding.is_safety) text += 'SAFETY CONCERN — flag prominently.\n';
  if (finding.custom_label && finding.observation) text += 'Item: ' + finding.custom_label + '\n';
  text += 'Be concise — 2-4 sentences, third person, factual.';

  contentBlocks.push({ type: 'text', text: text });

  var apiRes = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: SYSTEM_PROMPT_FINDING,
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });

  if (!apiRes.ok) {
    var errText = '';
    try { errText = await apiRes.text(); } catch (e) {}
    throw new Error('Anthropic API error ' + apiRes.status + ': ' + errText.substring(0, 200));
  }

  var data = await apiRes.json();
  var narrative = '';
  if (data.content && data.content.length) {
    narrative = data.content.map(function (c) { return c.text || ''; }).join('').trim();
  }
  // Strip any markdown fences
  narrative = narrative.replace(/```[a-z]*\s*/g, '').replace(/```\s*/g, '').trim();
  return narrative;
}

// ── Handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id } = body;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  var fetchFn = _fetch || globalThis.fetch;

  try {
    // ── Standalone mode (no record_id, no DB write) — HEA-226 ─────────
    if (!record_id && body.findings && Array.isArray(body.findings) && body.findings.length) {
      var standaloneResults = await Promise.allSettled(body.findings.map(function (f, idx) {
        return generateStandalone(f, apiKey, fetchFn)
          .then(function (narrative) { return { idx: idx, narrative: narrative }; });
      }));

      var standaloneNarratives = {};
      standaloneResults.forEach(function (r, idx) {
        if (r.status === 'fulfilled') {
          standaloneNarratives[r.value.idx] = r.value.narrative;
        } else {
          standaloneNarratives[idx] = null;
        }
      });

      return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify({ narratives: standaloneNarratives, mode: 'standalone' }),
      };
    }

    if (!record_id) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
    }

    // ── Per-photo mode (HEA-160) ────────────────────────────────────────
    if (body.photo_findings && Array.isArray(body.photo_findings) && body.photo_findings.length) {
      var photosInput = body.photo_findings.filter(function (p) { return p.id; });
      if (!photosInput.length) {
        return { statusCode: 200, headers: headers, body: JSON.stringify({ narratives: {}, message: 'No photos to generate' }) };
      }

      // Generate per photo in parallel
      var photoResults = await Promise.all(photosInput.map(function (p) {
        // Build a finding-like object for generateForFinding
        return generateForFinding({
          observation: p.caption || '',
          condition_value: p.severity || '',
          is_safety: p.is_safety || false,
          custom_label: null,
          photo_urls: p.photo_url ? [p.photo_url] : [],
        }, apiKey, fetchFn)
          .then(function (narrative) { return { id: p.id, narrative: narrative }; })
          .catch(function (err) {
            console.error('Per-photo generation failed for', p.id, ':', err.message);
            return { id: p.id, narrative: null, error: err.message };
          });
      }));

      // Update each photo row in DB
      var photoNarratives = {};
      var photoUpdatePromises = photoResults.map(function (r) {
        if (!r.narrative) return Promise.resolve();
        photoNarratives[r.id] = r.narrative;
        return db().from('inspection_finding_photos')
          .update({ narrative: r.narrative, narrative_status: 'draft' })
          .eq('id', r.id)
          .eq('record_id', record_id);
      });

      await Promise.all(photoUpdatePromises);

      writeAuditLog({
        record_id: record_id,
        action: 'narrative.per_photo_generated',
        category: 'inspection',
        actor: 'admin',
        details: { photo_ids: photosInput.map(function (p) { return p.id; }) },
      });

      return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify({ narratives: photoNarratives, mode: 'per_photo' }),
      };
    }

    // ── Per-finding mode ────────────────────────────────────────────────
    if (body.findings && Array.isArray(body.findings) && body.findings.length) {
      var findingsInput = body.findings.filter(function (f) { return f.id; });
      if (!findingsInput.length) {
        return { statusCode: 200, headers: headers, body: JSON.stringify({ narratives: {}, message: 'No findings to generate' }) };
      }

      // Generate narratives in parallel — one API call per finding
      var results = await Promise.all(findingsInput.map(function (f) {
        return generateForFinding(f, apiKey, fetchFn)
          .then(function (narrative) { return { id: f.id, narrative: narrative }; })
          .catch(function (err) {
            console.error('Per-finding generation failed for', f.id, ':', err.message);
            return { id: f.id, narrative: null, error: err.message };
          });
      }));

      // Update each finding in DB
      var narratives = {};
      var updatePromises = results.map(function (r) {
        if (!r.narrative) return Promise.resolve();
        narratives[r.id] = r.narrative;
        return db().from('inspection_findings')
          .update({ narrative: r.narrative, narrative_status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', r.id)
          .eq('record_id', record_id);
      });

      await Promise.all(updatePromises);

      writeAuditLog({
        record_id: record_id,
        action: 'narrative.per_finding_generated',
        category: 'inspection',
        actor: 'admin',
        details: { finding_ids: findingsInput.map(function (f) { return f.id; }) },
      });

      return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify({ narratives: narratives, mode: 'per_finding' }),
      };
    }

    // ── Per-section mode (legacy) ───────────────────────────────────────
    var { section_ids, photo_urls } = body;

    var dataResults = await Promise.all([
      db().from('inspection_findings').select('*, inspection_finding_recommendations(*)').eq('record_id', record_id),
      db().from('property_profiles').select('*').eq('record_id', record_id).maybeSingle(),
      db().from('inspection_narratives').select('*').eq('record_id', record_id),
      db().from('wizard_sections').select('id, name').eq('active', true),
      db().from('wizard_recommendations').select('id, label').eq('active', true),
      db().from('inspection_finding_photos').select('*').eq('record_id', record_id),
    ]);

    var findings = (dataResults[0].data || []).map(function (f) {
      f.recommendations = f.inspection_finding_recommendations || [];
      delete f.inspection_finding_recommendations;
      return f;
    });
    var profile = dataResults[1].data || null;
    var existingNarratives = dataResults[2].data || [];
    var sections = dataResults[3].data || [];
    var recommendations = dataResults[4].data || [];
    var findingPhotos = dataResults[5].data || [];

    var photoUrlsBySection = photo_urls || buildPhotoUrlsFromDB(findingPhotos);

    var recLabels = {};
    recommendations.forEach(function (r) { recLabels[r.id] = r.label; });

    var narrativeStatus = {};
    existingNarratives.forEach(function (n) {
      narrativeStatus[n.section_id] = n.status;
    });

    var findingsBySection = {};
    findings.forEach(function (f) {
      if (!f.section_id || f.is_section_pass) return;
      if (!findingsBySection[f.section_id]) findingsBySection[f.section_id] = [];
      findingsBySection[f.section_id].push(f);
    });

    var targetSections = sections.filter(function (s) {
      if (section_ids && section_ids.length) {
        if (section_ids.indexOf(s.id) === -1) return false;
      }
      if (!findingsBySection[s.id] || !findingsBySection[s.id].length) return false;
      if (narrativeStatus[s.id] === 'approved' || narrativeStatus[s.id] === 'custom') return false;
      return true;
    });

    if (!targetSections.length) {
      return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify({ narratives: {}, message: 'No sections to generate' }),
      };
    }

    var contentBlocks = [];
    targetSections.forEach(function (s, i) {
      var sectionPhotos = photoUrlsBySection[s.id] || [];
      sectionPhotos.forEach(function (url) {
        contentBlocks.push({ type: 'image', source: { type: 'url', url: url } });
      });
      var prompt = buildSectionPrompt(s, findingsBySection[s.id], profile, recLabels);
      if (i < targetSections.length - 1) prompt += '\n\n---\n\n';
      contentBlocks.push({ type: 'text', text: prompt });
    });

    contentBlocks.push({
      type: 'text',
      text: '\n\nGenerate professional inspection narratives for the sections above. ' +
        'If photos are included, reference visible conditions shown in the images. ' +
        'Return a JSON object keyed by section_id. Section IDs: ' +
        targetSections.map(function (s) { return s.id; }).join(', '),
    });

    var apiRes = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT_SECTION,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!apiRes.ok) {
      var errText = '';
      try { errText = await apiRes.text(); } catch (e) {}
      console.error('Anthropic API error:', apiRes.status, errText);
      return { statusCode: 502, headers: headers, body: JSON.stringify({ error: 'Anthropic API error: ' + apiRes.status }) };
    }

    var apiData = await apiRes.json();
    var textContent = '';
    if (apiData.content && apiData.content.length) {
      textContent = apiData.content.map(function (c) { return c.text || ''; }).join('');
    }

    var generatedNarratives;
    try {
      var cleaned = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      generatedNarratives = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse narrative JSON:', textContent.substring(0, 500));
      return { statusCode: 502, headers: headers, body: JSON.stringify({ error: 'Failed to parse AI response' }) };
    }

    var upsertPromises = targetSections.map(function (s) {
      var narrative = generatedNarratives[s.id];
      if (!narrative) return Promise.resolve();
      var existing = existingNarratives.find(function (n) { return n.section_id === s.id; });
      if (existing) {
        return db().from('inspection_narratives')
          .update({ draft_narrative: narrative, status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        return db().from('inspection_narratives')
          .insert({ record_id: record_id, section_id: s.id, draft_narrative: narrative, status: 'draft' });
      }
    });

    await Promise.all(upsertPromises);

    writeAuditLog({
      record_id: record_id,
      action: 'narrative.generated',
      category: 'inspection',
      actor: 'admin',
      details: { sections: targetSections.map(function (s) { return s.id; }) },
    });

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ narratives: generatedNarratives, mode: 'per_section' }),
    };

  } catch (err) {
    console.error('generate-narrative error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
