/**
 * Netlify Function: get-agent-records
 *
 * Returns inspection records, waiver versions, and waiver signatures
 * for the authenticated agent. The agent_id used in the query is always
 * derived from the validated portal_token — never trusted from the client.
 *
 * Auth: portal_token validated against agents table (role=agent, active=true).
 *
 * GET  ?token=<portal_token>
 *
 * Returns:
 *   { ok: true, records: [...], waiver_versions: [...], waiver_signatures: [...] }
 */

const { corsHeaders } = require('./lib/cors');
// Read env lazily so tests can set process.env after require()
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
  if (!res.ok) {
    var text = await res.text();
    throw new Error('Supabase error ' + res.status + ': ' + text);
  }
  return res.json();
}

/**
 * Validate portal_token — returns agent row or null.
 * Exported for unit tests.
 */
async function validateAgentToken(token, supabaseUrl, supabaseKey) {
  if (!token) return null;
  var rows = await sbGet(
    supabaseUrl + '/rest/v1/agents' +
    '?portal_token=eq.' + encodeURIComponent(token) +
    '&role=eq.agent&active=eq.true' +
    '&select=id,name,email,role&limit=1',
    supabaseKey
  );
  return (Array.isArray(rows) && rows.length) ? rows[0] : null;
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { SUPABASE_URL, SUPABASE_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };

  var token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token)
    return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'Token required' }) };

  // Validate token — agent_id comes from DB, never from client
  var agent;
  try {
    agent = await validateAgentToken(token, SUPABASE_URL, SUPABASE_KEY);
  } catch(e) {
    console.error('[get-agent-records] token validation error:', e.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database error during auth' }) };
  }

  if (!agent)
    return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'Invalid or expired portal token' }) };

  // Fetch all three datasets in parallel
  try {
    var base = SUPABASE_URL + '/rest/v1/';
    var results = await Promise.all([
      sbGet(
        base + 'inspection_records' +
        '?agent_id=eq.' + encodeURIComponent(agent.id) +
        '&order=inspection_date.desc.nullslast,created_at.desc' +
        '&select=*',
        SUPABASE_KEY
      ),
      sbGet(base + 'waiver_versions?order=created_at.desc&select=*', SUPABASE_KEY),
      sbGet(base + 'waiver_signatures?order=signed_at.desc&select=*', SUPABASE_KEY),
    ]);

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        ok:                true,
        agent_id:          agent.id,
        records:           Array.isArray(results[0]) ? results[0] : [],
        waiver_versions:   Array.isArray(results[1]) ? results[1] : [],
        waiver_signatures: Array.isArray(results[2]) ? results[2] : [],
      }),
    };

  } catch(e) {
    console.error('[get-agent-records] fetch error:', e.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Failed to load records' }) };
  }
};

exports._validateAgentToken = validateAgentToken;
exports._getEnv             = getEnv;
