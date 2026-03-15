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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id } = body;

  if (!record_id) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'record_id required' }) };
  }

  try {
    // Fetch current record
    var { data: record, error: fetchErr } = await db()
      .from('inspection_records')
      .select('id, status')
      .eq('id', record_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!record) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Record not found' }) };
    }

    if (record.status === 'submitted') {
      return { statusCode: 409, headers: HEADERS, body: JSON.stringify({ error: 'Already submitted' }) };
    }

    // Set status to submitted
    var { error: updErr } = await db()
      .from('inspection_records')
      .update({ status: 'submitted', completed_at: new Date().toISOString() })
      .eq('id', record_id);

    if (updErr) throw updErr;

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('submit-inspection-v2 error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
