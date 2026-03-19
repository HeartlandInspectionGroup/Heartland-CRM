const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

// Allow tests to inject a fetch stub
var _fetch = typeof fetch !== 'undefined' ? fetch : null;
exports._setFetch = function (f) { _fetch = f; };

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id } = body;

  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }

  try {
    // Look up the inspection record to find its booking_id
    var { data: record, error: recErr } = await db()
      .from('inspection_records')
      .select('id, booking_id')
      .eq('id', record_id)
      .maybeSingle();

    if (recErr) throw recErr;

    if (!record) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Record not found' }) };
    }

    if (!record.booking_id) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'No booking found for this record' }) };
    }

    // Call confirm-booking-email internally with portal_only: true
    var siteUrl = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';
    var fnUrl = siteUrl + '/.netlify/functions/confirm-booking-email';

    var fetchFn = _fetch || globalThis.fetch;
    var res = await fetchFn(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': process.env.ADMIN_TOKEN,
      },
      body: JSON.stringify({
        booking_id: record.booking_id,
        portal_only: true,
      }),
    });

    var resData;
    try { resData = await res.json(); } catch (e) { resData = {}; }

    if (!res.ok) {
      return {
        statusCode: res.status || 500,
        headers: headers,
        body: JSON.stringify({ error: resData.error || 'Failed to send agreement email' }),
      };
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('send-agreement-email error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
