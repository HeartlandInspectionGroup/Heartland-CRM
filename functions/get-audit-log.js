/**
 * Netlify Function: get-audit-log
 *
 * Reads audit_log using the service key (bypasses RLS).
 * Admin-only — requires x-admin-token header.
 *
 * Query params: from, to, category, action, search, limit
 */

const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');
const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Auth check
  var authError = await requireAuth(event);
  if (authError) return authError;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  var p        = event.queryStringParameters || {};
  var from     = p.from;
  var to       = p.to;
  var category = p.category;
  var action   = p.action;
  var limit    = parseInt(p.limit) || 500;

  var query = 'audit_log?order=created_at.desc&limit=' + limit + '&select=*';
  if (from)     query += '&created_at=gte.' + from + 'T00:00:00';
  if (to)       query += '&created_at=lte.' + to + 'T23:59:59';
  if (category) query += '&category=eq.' + encodeURIComponent(category);
  if (action)   query += '&action=eq.'   + encodeURIComponent(action);

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + query, {
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
    });

    if (!res.ok) {
      var errText = await res.text();
      console.error('[get-audit-log] Supabase error:', errText);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errText }) };
    }

    var rows = await res.json();
    return { statusCode: 200, headers: headers, body: JSON.stringify(rows) };

  } catch(err) {
    console.error('[get-audit-log] Error:', err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
