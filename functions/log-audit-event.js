/**
 * Netlify Function: log-audit-event
 *
 * Thin browser-callable wrapper around audit_log inserts.
 * Used when the audit event originates from a browser direct Supabase write
 * with no Netlify function in between.
 *
 * POST body: { record_id, action, category, details, actor }
 * No auth required — called from authenticated browser sessions.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const { corsHeaders } = require('./lib/cors');
exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { record_id, action, category, details, actor } = body;

  if (!action || !category) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'action and category required' }) };
  }

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/audit_log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        record_id: record_id || null,
        action:    action,
        category:  category,
        details:   details || {},
        actor:     actor || 'system',
      }),
    });

    if (!res.ok) {
      var errText = await res.text();
      console.error('[log-audit-event] Supabase error:', errText);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errText }) };
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };

  } catch(err) {
    console.error('[log-audit-event] Error:', err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
