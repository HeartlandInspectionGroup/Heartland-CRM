/**
 * Netlify Function: agent-submit-booking
 *
 * Receives a booking submission from the agent portal and writes
 * both the bookings row and inspection_records row server-side
 * using the service key — so the anon key never touches PII tables.
 *
 * Auth: portal_token validated against agents table (role=agent).
 * Agents can only submit bookings on behalf of themselves.
 *
 * POST body:
 *   portal_token  — agent's portal token (from URL ?token=)
 *   booking       — bookings row payload
 *   record        — inspection_records row payload
 *   calendar      — calendar event payload (forwarded to create-calendar-event)
 *
 * Returns: { ok: true, booking_id, record_id }
 */

// Read env vars lazily so tests can set them after require()
function getEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    SITE_URL:     process.env.SITE_URL || '',
  };
}

const { corsHeaders } = require('./lib/cors');
// ── Supabase helpers ─────────────────────────────────────────────────────────

async function sbGet(path) {
  const { SUPABASE_URL, SUPABASE_KEY } = getEnv();
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

async function sbPost(table, payload, prefer) {
  const { SUPABASE_URL, SUPABASE_KEY } = getEnv();
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      Prefer: prefer || 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  var text = await res.text();
  var data;
  try { data = JSON.parse(text); } catch(e) { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ── Token validation ─────────────────────────────────────────────────────────

/**
 * Validate portal_token against agents table.
 * Returns the agent row if valid, null if not.
 */
async function validateAgentToken(token) {
  if (!token) return null;
  var rows = await sbGet(
    'agents?portal_token=eq.' + encodeURIComponent(token) +
    '&role=eq.agent&active=eq.true&select=id,name,email,role,booking_discount&limit=1'
  );
  return (Array.isArray(rows) && rows.length) ? rows[0] : null;
}

// ── Payload sanitisation ─────────────────────────────────────────────────────

/**
 * Only allow known-safe fields into the bookings row.
 * Prevents an agent from injecting arbitrary columns.
 */
const BOOKING_ALLOWED = [
  'data_source','status','client_name','client_email','client_phone',
  'property_address','property_city','property_state','property_zip',
  'year_built','sqft','home_size_tier',
  'services','base_price','addons_total',
  'discount_amount','coupon_code','coupon_discount','final_total',
  'preferred_date','preferred_time','notes',
  'agent_id',
];

const RECORD_ALLOWED = [
  'booking_id','inspector_name','inspector_id','agent_id','agent_name',
  'category','tier','status',
  'inspection_date',
  'cust_name','cust_email','cust_phone','address',
  'payment_status','final_total',
];

function pick(obj, allowed) {
  var out = {};
  allowed.forEach(function(k) { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

// ── Main handler ─────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { SUPABASE_URL, SUPABASE_KEY, SITE_URL } = getEnv();

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };

  // Parse body
  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { portal_token, booking, record, calendar } = body;

  // Validate token
  var agent = await validateAgentToken(portal_token);
  if (!agent) {
    return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'Invalid or expired portal token' }) };
  }

  // Require booking payload
  if (!booking || typeof booking !== 'object')
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'booking payload required' }) };
  if (!record || typeof record !== 'object')
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record payload required' }) };

  // Sanitise and force agent_id to match authenticated agent (never trust client-sent agent_id)
  var cleanBooking = pick(booking, BOOKING_ALLOWED);
  cleanBooking.agent_id   = agent.id;
  cleanBooking.data_source = 'agent_portal';
  cleanBooking.status      = 'pending'; // bookings table only accepts pending

  var cleanRecord = pick(record, RECORD_ALLOWED);
  cleanRecord.agent_id = agent.id;
  cleanRecord.status   = 'scheduled'; // always — never let client set this freely

  // 1. Insert booking
  var bResult = await sbPost('bookings', cleanBooking, 'return=representation');
  if (!bResult.ok || !Array.isArray(bResult.data) || !bResult.data[0]) {
    console.error('[agent-submit-booking] bookings insert failed:', JSON.stringify(bResult.data));
    return {
      statusCode: 500, headers: headers,
      body: JSON.stringify({ error: 'Failed to create booking: ' + JSON.stringify(bResult.data) }),
    };
  }
  var bookingId = bResult.data[0].id;

  // 2. Insert inspection_record with booking_id
  cleanRecord.booking_id = bookingId;
  var rResult = await sbPost('inspection_records', cleanRecord, 'return=representation');
  if (!rResult.ok || !Array.isArray(rResult.data) || !rResult.data[0]) {
    console.error('[agent-submit-booking] inspection_records insert failed:', JSON.stringify(rResult.data));
    // Attempt to clean up the orphaned booking row
    await fetch(SUPABASE_URL + '/rest/v1/bookings?id=eq.' + bookingId, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    }).catch(function() {});
    return {
      statusCode: 500, headers: headers,
      body: JSON.stringify({ error: 'Failed to create inspection record' }),
    };
  }
  var recordId = rResult.data[0].id;

  // 3. Fire-and-forget: calendar event
  if (calendar && SITE_URL) {
    fetch((SITE_URL.startsWith('http') ? SITE_URL : 'https://' + SITE_URL) + '/.netlify/functions/create-calendar-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, calendar, { booking_id: bookingId })),
    }).catch(function(e) { console.warn('[agent-submit-booking] calendar event failed:', e.message); });
  }

  // 4. Fire-and-forget: audit log
  fetch(SUPABASE_URL + '/rest/v1/audit_log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      record_id: recordId,
      action:    'booking.created',
      category:  'scheduling',
      actor:     'agent',
      details: {
        source:     'agent_portal',
        address:    cleanRecord.address,
        client:     cleanRecord.cust_name,
        agent_id:   agent.id,
        agent_name: agent.name,
      },
    }),
  }).catch(function() {});

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({ ok: true, booking_id: bookingId, record_id: recordId }),
  };
};

// Exported for unit tests
exports._validateAgentToken = validateAgentToken;
exports._pick               = pick;
exports._BOOKING_ALLOWED    = BOOKING_ALLOWED;
exports._RECORD_ALLOWED     = RECORD_ALLOWED;
