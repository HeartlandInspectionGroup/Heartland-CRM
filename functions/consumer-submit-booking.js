/**
 * Netlify Function: consumer-submit-booking
 *
 * Receives a booking submission from the public consumer wizard (index.html)
 * and writes to the bookings table server-side using the service key.
 *
 * No auth — this is a public endpoint. Protection comes from:
 *   - Server-side write (anon key never touches bookings table)
 *   - Field allowlist (no arbitrary column injection)
 *   - data_source and agent_id always forced server-side
 *
 * POST body:
 *   booking  — bookings row payload
 *
 * Returns: { ok: true, booking_id }
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

// ── Allowlist ─────────────────────────────────────────────────────────────────
const BOOKING_ALLOWED = [
  'data_source', 'status',
  'client_name', 'client_email', 'client_phone',
  'property_address', 'property_city', 'property_state', 'property_zip',
  'year_built', 'sqft', 'home_size_tier',
  'services', 'base_price', 'addons_total',
  'discount_pct', 'discount_amount',
  'coupon_code', 'coupon_discount',
  'tax_state', 'tax_rate', 'tax_amount',
  'final_total',
  'preferred_date', 'preferred_time',
  'client_current_address', 'notes',
  'agent_id',
];

function pick(obj, allowed) {
  var out = {};
  allowed.forEach(function(k) { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
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

  var { booking } = body;
  if (!booking || typeof booking !== 'object')
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'booking payload required' }) };

  // Sanitise and force known-safe values
  var cleanBooking = pick(booking, BOOKING_ALLOWED);
  cleanBooking.data_source = 'consumer_wizard';
  cleanBooking.status      = 'pending';
  cleanBooking.agent_id    = null;

  // Insert server-side with service key
  var res = await fetch(SUPABASE_URL + '/rest/v1/bookings', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':         SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(cleanBooking),
  });

  var text = await res.text();
  var rows;
  try { rows = JSON.parse(text); } catch(e) { rows = null; }

  if (!res.ok || !Array.isArray(rows) || !rows[0]) {
    console.error('[consumer-submit-booking] insert failed:', text);
    return { statusCode: 500, headers: HEADERS,
      body: JSON.stringify({ error: 'Failed to create booking: ' + text }) };
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ ok: true, booking_id: rows[0].id }),
  };
};

exports._pick           = pick;
exports._BOOKING_ALLOWED = BOOKING_ALLOWED;
