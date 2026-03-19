/**
 * Netlify Function: delete-field-photo
 *
 * Deletes a photo from inspection_finding_photos by id.
 *
 * POST body: { id }
 * Returns: { ok: true }
 */

const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');

function getEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { SUPABASE_URL, SUPABASE_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { id } = body;
  if (!id)
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'id required' }) };

  var res = await fetch(SUPABASE_URL + '/rest/v1/inspection_finding_photos?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    },
  });

  if (!res.ok) {
    var text = await res.text();
    console.error('[delete-field-photo] error:', text);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Failed to delete photo' }) };
  }

  return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
};
