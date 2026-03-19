/**
 * Netlify Function: iwb-submit-booking
 *
 * Receives a walk-in booking from the Inspector Wizard (IWB overlay)
 * and writes to the bookings table server-side using the service key.
 *
 * Auth: x-admin-token header (Jake is already authenticated in the wizard).
 *
 * POST body:
 *   booking  — bookings row payload
 *   calendar — calendar event payload (forwarded to create-calendar-event)
 *
 * Returns: { ok: true, booking_id }
 */

const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');// Read env lazily so tests can set process.env after require()
function getEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    SITE_URL:     process.env.SITE_URL || '',
  };
}

// ── Allowlist — only known-safe booking fields ────────────────────────────────
const BOOKING_ALLOWED = [
  'data_source', 'status',
  'client_name', 'client_email', 'client_phone',
  'property_address', 'property_city', 'property_state', 'property_zip',
  'year_built', 'sqft', 'home_size_tier',
  'services', 'base_price', 'addons_total',
  'discount_amount', 'coupon_code', 'coupon_discount', 'final_total',
  'preferred_date', 'preferred_time', 'notes',
  'agent_id',
];

function pick(obj, allowed) {
  var out = {};
  allowed.forEach(function(k) { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };

  // Auth check — admin token required
  var authErr = await requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { SUPABASE_URL, SUPABASE_KEY, SITE_URL } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { booking, calendar } = body;

  if (!booking || typeof booking !== 'object')
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'booking payload required' }) };

  // Sanitise and force known-safe values
  var cleanBooking = pick(booking, BOOKING_ALLOWED);
  cleanBooking.data_source = 'inspector_wizard';
  cleanBooking.status      = 'pending';
  cleanBooking.agent_id    = null; // IWB bookings are always direct, never agent-attributed

  // Insert booking row server-side with service key
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
    console.error('[iwb-submit-booking] bookings insert failed:', text);
    return { statusCode: 500, headers: headers,
      body: JSON.stringify({ error: 'Failed to create booking: ' + text }) };
  }

  var bookingId = rows[0].id;

  // Fire-and-forget: calendar event
  if (calendar && SITE_URL) {
    fetch((SITE_URL.startsWith('http') ? SITE_URL : 'https://' + SITE_URL) +
      '/.netlify/functions/create-calendar-event', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(Object.assign({}, calendar, { booking_id: bookingId })),
    }).catch(function(e) { console.warn('[iwb-submit-booking] calendar event failed:', e.message); });
  }

  // Fire-and-forget: audit log
  fetch(SUPABASE_URL + '/rest/v1/audit_log', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':         SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      record_id: null,
      action:    'booking.created',
      category:  'scheduling',
      actor:     'inspector',
      details:   {
        source:  'inspector_wizard',
        address: cleanBooking.property_address,
        client:  cleanBooking.client_name,
      },
    }),
  }).catch(function() {});

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({ ok: true, booking_id: bookingId }),
  };
};

// Exported for unit tests
exports._pick           = pick;
exports._BOOKING_ALLOWED = BOOKING_ALLOWED;
