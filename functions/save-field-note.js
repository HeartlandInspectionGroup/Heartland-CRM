/**
 * Netlify Function: save-field-note
 *
 * Saves a field capture note to inspection_narratives as draft.
 * Upserts — creates or updates the row for this record + section.
 *
 * POST body: { record_id, section_id, note }
 * Returns: { ok: true }
 */

const { requireAuth } = require('./auth');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
};

function getEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

  const authErr = requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { SUPABASE_URL, SUPABASE_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Database not configured' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { record_id, section_id, note } = body;
  if (!record_id || !section_id)
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'record_id and section_id required' }) };

  // Upsert — create or update draft_narrative for this record + section
  var res = await fetch(SUPABASE_URL + '/rest/v1/inspection_narratives', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      record_id,
      section_id,
      draft_narrative: note || null,
      status: 'draft',
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    var text = await res.text();
    console.error('[save-field-note] error:', text);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Failed to save note' }) };
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
};
