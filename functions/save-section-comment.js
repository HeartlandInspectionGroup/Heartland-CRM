/**
 * Netlify Function: save-section-comment
 * Upserts a section comment for an inspection record.
 * POST body: { record_id, section_id, comment }
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

  var { record_id, section_id, comment } = body;
  if (!record_id || !section_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'record_id and section_id required' }) };

  try {
    var { error } = await db().from('inspection_section_comments')
      .upsert({ record_id: record_id, section_id: section_id, comment: comment || '', updated_at: new Date().toISOString() },
        { onConflict: 'record_id,section_id' });
    if (error) throw error;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('save-section-comment error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
