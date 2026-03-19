/**
 * Netlify Function: clear-audit-log
 * Deletes all rows from audit_log. Admin-only. Testing use only.
 */

const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var authError = await requireAuth(event);
  if (authError) return authError;

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/audit_log?id=neq.00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
    });

    if (!res.ok) {
      var err = await res.text();
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err }) };
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
  } catch(err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
