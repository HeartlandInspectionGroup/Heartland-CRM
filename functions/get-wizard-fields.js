const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const authError = requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var { section_id } = event.queryStringParameters || {};
  if (!section_id) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'section_id required' }) };
  }

  try {
    // Support comma-separated section_ids for bulk loading
    var ids = section_id.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    var { data, error } = await db()
      .from('wizard_fields')
      .select('*')
      .in('section_id', ids)
      .eq('active', true)
      .order('order_index', { ascending: true });

    if (error) throw error;

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ fields: data || [] }) };
  } catch (err) {
    console.error('get-wizard-fields error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
