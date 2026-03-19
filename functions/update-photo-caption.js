/**
 * Netlify Function: update-photo-caption
 * Updates inspection_finding_photos.caption by photo ID.
 * POST body: { photo_id, caption }
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');

var _sb;
function db() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _sb;
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  var authErr = await requireAuth(event);
  if (authErr) return authErr;
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var { photo_id, caption } = body;
  if (!photo_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'photo_id required' }) };

  try {
    var { error } = await db().from('inspection_finding_photos')
      .update({ caption: caption || null })
      .eq('id', photo_id);
    if (error) throw error;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('update-photo-caption error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
