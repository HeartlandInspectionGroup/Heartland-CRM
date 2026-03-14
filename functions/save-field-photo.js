/**
 * Netlify Function: save-field-photo
 *
 * Saves a field photo to inspection_finding_photos.
 * finding_id is null at this stage — gets linked in office mode.
 *
 * POST body: { record_id, section_id, cloudinary_url, cloudinary_public_id }
 * Returns: { ok: true, id }
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

  var { record_id, section_id, cloudinary_url, cloudinary_public_id } = body;
  if (!record_id || !section_id || !cloudinary_url)
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'record_id, section_id and cloudinary_url required' }) };

  var res = await fetch(SUPABASE_URL + '/rest/v1/inspection_finding_photos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      record_id,
      section_id,
      finding_id:           null,
      cloudinary_url,
      cloudinary_public_id: cloudinary_public_id || null,
    }),
  });

  var text = await res.text();
  var rows;
  try { rows = JSON.parse(text); } catch(e) { rows = null; }

  if (!res.ok || !Array.isArray(rows) || !rows[0]) {
    console.error('[save-field-photo] error:', text);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Failed to save photo' }) };
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, id: rows[0].id }) };
};
