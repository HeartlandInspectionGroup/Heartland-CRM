const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { finding_id } = body;

  if (!finding_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'finding_id required' }) };
  }

  try {
    // Check if finding exists
    var { data: existing, error: fetchErr } = await db()
      .from('inspection_findings')
      .select('id')
      .eq('id', finding_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!existing) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Finding not found' }) };
    }

    // Delete (cascade deletes inspection_finding_recommendations via FK)
    var { error: delErr } = await db()
      .from('inspection_findings')
      .delete()
      .eq('id', finding_id);

    if (delErr) throw delErr;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('delete-finding error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
