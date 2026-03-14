/**
 * Netlify Function: set-report-release
 *
 * Sets agent_report_release on an inspection record from the client portal.
 * Auth: client portal token — validated against client_portal_tokens table,
 *       and ownership verified against the record's cust_email.
 *
 * POST body: { token, record_id, value (bool) }
 * Returns: { ok: true }
 */

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function sbGet(url, key) {
  var res = await fetch(url, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  if (!res.ok) throw new Error('DB error ' + res.status);
  return res.json();
}

async function sbPatch(url, key, body) {
  var res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { SUPABASE_URL, SUPABASE_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Database not configured' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { token, record_id, value } = body;

  if (!token || !record_id || value === undefined)
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'token, record_id, and value required' }) };

  // Validate portal token
  var base = SUPABASE_URL + '/rest/v1/';
  var tokenRows = await sbGet(
    base + 'client_portal_tokens?token=eq.' + encodeURIComponent(token) + '&select=client_email&limit=1',
    SUPABASE_KEY
  ).catch(function() { return null; });

  if (!tokenRows || !tokenRows[0])
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Invalid token' }) };

  var clientEmail = tokenRows[0].client_email;

  // Load record and verify ownership
  var recRows = await sbGet(
    base + 'inspection_records?id=eq.' + encodeURIComponent(record_id) + '&select=id,cust_email&limit=1',
    SUPABASE_KEY
  ).catch(function() { return null; });

  if (!recRows || !recRows[0])
    return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Record not found' }) };

  var rec = recRows[0];
  if ((rec.cust_email || '').toLowerCase() !== clientEmail.toLowerCase())
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Forbidden' }) };

  // Apply the update
  var ok = await sbPatch(
    base + 'inspection_records?id=eq.' + encodeURIComponent(record_id),
    SUPABASE_KEY,
    { agent_report_release: !!value }
  );

  if (!ok)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Update failed' }) };

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
};
