/**
 * Netlify Function: clear-audit-log
 * Deletes all rows from audit_log. Admin-only. Testing use only.
 */

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN   = process.env.ADMIN_TOKEN;

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  var token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

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
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err }) };
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch(err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
