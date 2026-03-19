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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id, start_time, weather_conditions } = body;

  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }

  var updates = {};
  if (start_time !== undefined) updates.start_time = start_time;
  if (weather_conditions !== undefined) updates.weather_conditions = weather_conditions;

  if (Object.keys(updates).length === 0) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'No fields to update' }) };
  }

  try {
    var { error } = await db()
      .from('inspection_records')
      .update(updates)
      .eq('id', record_id);

    if (error) throw error;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('save-inspection-meta error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
