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

  var params = event.queryStringParameters || {};
  var category = params.category;
  var tier = params.tier;
  if (!category) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'category required' }) };
  }

  try {
    var query = db()
      .from('wizard_sections')
      .select('*')
      .eq('active', true)
      .contains('category_ids', [category]);

    if (tier) {
      query = query.contains('tier_ids', [tier]);
    }

    var { data, error } = await query.order('order_index', { ascending: true });

    if (error) throw error;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ sections: data || [] }) };
  } catch (err) {
    console.error('get-wizard-sections error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
