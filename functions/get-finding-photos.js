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

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var { record_id } = event.queryStringParameters || {};
  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }

  try {
    var { data, error } = await db()
      .from('inspection_finding_photos')
      .select('*')
      .eq('record_id', record_id)
      .order('order_index', { ascending: true });

    if (error) throw error;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ photos: data || [] }) };
  } catch (err) {
    console.error('get-finding-photos error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
