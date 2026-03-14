/**
 * Netlify Function: resolve-portal-token
 *
 * Validates a portal token and returns all data for that client:
 * - Client info (name, email)
 * - All bookings matching their email
 * - All inspection_records matching their email
 *
 * GET /api/resolve-portal-token?token=abc123
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function sbFetch(path) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  });
  return res.json();
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var token = (event.queryStringParameters || {}).token;
  if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token required' }) };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    // 1. Resolve token → client email (never expires)
    var tokenRows = await sbFetch('client_portal_tokens?token=eq.' + encodeURIComponent(token) + '&select=*&limit=1');
    if (!tokenRows || !tokenRows[0]) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invalid or expired portal link' }) };
    }
    var tokenRow   = tokenRows[0];

    // Enforce token expiration
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invalid or expired portal link' }) };
    }

    var clientEmail = tokenRow.client_email;
    var clientName  = tokenRow.client_name || '';

    if (!clientEmail) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No client email on token' }) };
    }

    var emailParam = encodeURIComponent(clientEmail);

    // 2. Load all bookings for this email
    var bookings = await sbFetch('bookings?client_email=eq.' + emailParam + '&order=preferred_date.desc&select=*');

    // 3. Load all inspection records for this email
    var records = await sbFetch('inspection_records?cust_email=eq.' + emailParam + '&order=inspection_date.desc&select=id,status,address,tier,category,inspection_date,updated_at,report_url,invoice_url,invoice_amount,payment_method,inspector_name,booking_id');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        client: { name: clientName, email: clientEmail },
        bookings: bookings || [],
        records:  records  || [],
      }),
    };
  } catch(err) {
    console.error('resolve-portal-token error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
