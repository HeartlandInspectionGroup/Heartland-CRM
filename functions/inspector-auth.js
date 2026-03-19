const { createClient } = require('@supabase/supabase-js');

const { corsHeaders } = require('./lib/cors');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { pin } = parsed;
  if (!pin) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Missing PIN' }) };
  }

  try {
    // Try with role column first; fall back gracefully if the column doesn't exist
    let data, error;
    ({ data, error } = await supabase
      .from('inspectors')
      .select('id, name, active, role')
      .eq('pin', pin)
      .single());

    if (error && error.message && error.message.includes('role')) {
      ({ data, error } = await supabase
        .from('inspectors')
        .select('id, name, active')
        .eq('pin', pin)
        .single());
    }

    if (error || !data) {
      return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'Invalid PIN' }) };
    }
    if (!data.active) {
      return { statusCode: 403, headers: headers, body: JSON.stringify({ error: 'Inspector account is inactive' }) };
    }

    // Fire-and-forget last_seen update — don't let it block the response
    supabase
      .from('inspectors')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', data.id)
      .then(({ error: updateErr }) => {
        if (updateErr) console.error('last_seen update error:', updateErr);
      });

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ id: data.id, name: data.name, role: data.role || 'inspector' }),
    };

  } catch (err) {
    console.error('inspector-auth error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
