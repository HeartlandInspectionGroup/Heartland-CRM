const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {

  // ── AUTH CHECK ──
  const adminToken = process.env.ADMIN_TOKEN;
  if (event.httpMethod !== 'OPTIONS' && event.headers['x-admin-token'] !== adminToken) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { id, device_id } = event.queryStringParameters || {};

  // Load by explicit record ID
  if (id) {
    try {
      const { data, error } = await supabase
        .from('inspection_records')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) };
    } catch (err) {
      console.error('load-draft by id error:', err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // Load most recent draft by device
  if (device_id) {
    try {
      const { data, error } = await supabase
        .from('inspection_records')
        .select('*')
        .eq('device_id', device_id)
        .eq('status', 'scheduled')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      // PGRST116 = no rows found — not an error, just no draft
      if (error && error.code !== 'PGRST116') throw error;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data || null) };
    } catch (err) {
      console.error('load-draft by device_id error:', err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'device_id or id required' }) };
};
