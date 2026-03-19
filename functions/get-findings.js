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

  const { record_id } = event.queryStringParameters || {};
  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }

  try {
    const { data, error } = await db()
      .from('inspection_findings')
      .select('*, inspection_finding_recommendations(*)')
      .eq('record_id', record_id)
      .order('order_index', { ascending: true });

    if (error) throw error;

    // Nest recommendations under a cleaner key
    const findings = (data || []).map(function (f) {
      var rec = Object.assign({}, f);
      rec.recommendations = rec.inspection_finding_recommendations || [];
      delete rec.inspection_finding_recommendations;
      // Sort recommendations by order_index
      rec.recommendations.sort(function (a, b) { return a.order_index - b.order_index; });
      return rec;
    });

    return { statusCode: 200, headers: headers, body: JSON.stringify({ findings: findings }) };
  } catch (err) {
    console.error('get-findings error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
