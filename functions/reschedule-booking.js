/**
 * Netlify Function: reschedule-booking
 *
 * Called when a client or agent requests a reschedule.
 *
 * Flow:
 * 1. Validate token (client portal token OR agent portal_token)
 * 2. Load original inspection_record + booking
 * 3. Delete old Outlook calendar event via Azure Graph
 * 4. Mark original inspection_record + booking as cancelled
 * 5. Create new booking row (status: pending)
 * 6. Call create-calendar-event — handles new calendar event + client email + Jake email + .ics
 * 7. Audit log
 * 8. Return success
 *
 * POST body: { token, booking_id, new_date, new_time }
 */

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SITE_URL            = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

const CALENDAR_USER = 'jake@heartlandinspectiongroup.com';

const { writeAuditLog } = require('./write-audit-log');

const { corsHeaders } = require('./lib/cors');

async function sbGet(path) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
  });
  return res.json();
}

async function sbPatch(path, body) {
  await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

async function sbPost(table, body) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  var data = await res.json();
  if (!res.ok) console.error('[reschedule] sbPost error on', table, JSON.stringify(data));
  return Array.isArray(data) ? data[0] : data;
}

async function getAzureToken() {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) return null;
  var res = await fetch(
    'https://login.microsoftonline.com/' + AZURE_TENANT_ID + '/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }).toString(),
    }
  );
  if (!res.ok) { console.error('[reschedule] Azure token failed:', await res.text()); return null; }
  return (await res.json()).access_token;
}

async function deleteCalendarEvent(azureToken, eventId) {
  if (!azureToken || !eventId) return false;
  var res = await fetch(
    'https://graph.microsoft.com/v1.0/users/' + CALENDAR_USER + '/events/' + eventId,
    { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + azureToken } }
  );
  return res.ok || res.status === 404;
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { token, booking_id, new_date, new_time } = body;
  if (!token || !booking_id || !new_date || !new_time) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token, booking_id, new_date, and new_time required' }) };
  }

  // 1. Validate token
  var clientEmail = null;
  var isAgent     = false;
  var isAdmin     = false;

  var ADMIN_TOKEN_VAL = process.env.ADMIN_TOKEN;
  if (body._admin === true && ADMIN_TOKEN_VAL && token === ADMIN_TOKEN_VAL) {
    isAdmin = true;
  } else {
    var tokenRows = await sbGet('client_portal_tokens?token=eq.' + encodeURIComponent(token) + '&select=client_email&limit=1');
    if (tokenRows && tokenRows[0]) {
      clientEmail = tokenRows[0].client_email;
    } else {
      var agentRows = await sbGet('agents?portal_token=eq.' + encodeURIComponent(token) + '&active=eq.true&select=id&limit=1');
      if (!agentRows || !agentRows[0]) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
      }
      isAgent = true;
    }
  }

  // 2. Load original inspection record
  var recRows = await sbGet('inspection_records?booking_id=eq.' + booking_id + '&select=*&limit=1');
  var rec = recRows && recRows[0];
  if (!rec) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Inspection record not found' }) };

  if (!isAdmin && clientEmail && (rec.cust_email || '').toLowerCase() !== clientEmail.toLowerCase()) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }
  if (!isAdmin && rec.payment_status === 'paid') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paid bookings cannot be rescheduled online. Please call us.' }) };
  }
  if (rec.status === 'cancelled' || rec.status === 'submitted' || rec.status === 'narrative') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot reschedule this record.' }) };
  }

  var bookingRows = await sbGet('bookings?id=eq.' + booking_id + '&select=*&limit=1');
  var origBooking = bookingRows && bookingRows[0];

  // Normalise field names — agent portal wrote client_name/client_email/property_address
  // inspection_records uses cust_name/cust_email/address — fall back to bookings row
  var custName  = rec.cust_name   || (origBooking && origBooking.client_name)  || '';
  var custEmail = rec.cust_email  || (origBooking && origBooking.client_email) || '';
  var custPhone = rec.cust_phone  || (origBooking && origBooking.client_phone) || '';
  var address   = rec.address     || (origBooking && origBooking.property_address) || '';
  var total     = rec.final_total || rec.total_amount || (origBooking && origBooking.final_total) || (origBooking && origBooking.total_amount) || 0;

  // 3. Delete old Outlook calendar event
  var calDeleted = false;
  try {
    var azureToken = await getAzureToken();
    var calEventId = (origBooking && origBooking.calendar_event_id) || rec.calendar_event_id || null;
    console.log('[reschedule] calendar_event_id from booking:', origBooking && origBooking.calendar_event_id, 'from record:', rec.calendar_event_id);
    if (azureToken && calEventId) {
      calDeleted = await deleteCalendarEvent(azureToken, calEventId);
      console.log('[reschedule] Deleted old calendar event:', calEventId, calDeleted);
    } else {
      console.log('[reschedule] Skipping calendar delete — no event ID found or no azure token');
    }
  } catch(e) {
    console.error('[reschedule] Calendar delete error:', e.message);
  }

  // 4. Cancel original records
  await sbPatch('inspection_records?booking_id=eq.' + booking_id, { status: 'cancelled' });
  await sbPatch('bookings?id=eq.' + booking_id, { status: 'cancelled', calendar_event_id: null });

  // 5. Create new booking (pending)
  var newBooking = await sbPost('bookings', {
    status:           'pending',
    client_name:      custName,
    client_email:     custEmail,
    client_phone:     custPhone,
    property_address: address,
    preferred_date:   new_date,
    preferred_time:   new_time,
    services:         origBooking ? (origBooking.services || null) : null,
    final_total:      total,
    payment_status:   'unpaid',
    agent_id:         rec.agent_id || null,
    data_source:      'reschedule',
    notes:            'Rescheduled from booking ' + booking_id,
  });

  var newBookingId = newBooking && newBooking.id;

  // 6. Call create-calendar-event (handles calendar + client email + Jake email + .ics)
  if (newBookingId) {
    var nameParts = custName.trim().split(' ');
    var firstName = nameParts[0] || '';
    var lastName  = nameParts.slice(1).join(' ') || '';

    var calPayload = {
      firstName:  firstName,
      lastName:   lastName,
      phone:      custPhone,
      email:      custEmail,
      address:    address,
      date:       new_date,
      time:       new_time,
      services:   origBooking ? (origBooking.services || []) : [],
      total:      total,
      booking_id: newBookingId,
    };
    console.log('[reschedule] Calling create-calendar-event with:', JSON.stringify(calPayload));

    try {
      var calRes = await fetch(SITE_URL + '/.netlify/functions/create-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calPayload),
      });
      var calText = await calRes.text();
      console.log('[reschedule] create-calendar-event response:', calRes.status, calText);
    } catch(e) {
      console.error('[reschedule] create-calendar-event error:', e.message);
    }
  }

  // 7. Audit log
  writeAuditLog({
    record_id: rec.id || null,
    action:    'booking.rescheduled',
    category:  'scheduling',
    actor:     isAdmin ? 'admin' : isAgent ? 'agent' : 'client',
    details:   { address: address, client: custName, new_date, new_time, new_booking_id: newBookingId },
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success:          true,
      new_booking_id:   newBookingId,
      calendar_deleted: calDeleted,
    }),
  };
};
