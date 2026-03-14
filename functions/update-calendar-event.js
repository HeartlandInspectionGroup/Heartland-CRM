/**
 * Netlify Function: update-calendar-event
 *
 * Called when admin approves a reschedule request.
 * 1. Deletes the old Outlook calendar event (using stored calendar_event_id)
 * 2. Creates a new event at the new date/time
 * 3. Saves the new event ID back to the bookings table
 *
 * Also called on cancellation to delete the event with no replacement.
 *
 * POST /api/update-calendar-event
 * Body (reschedule): { booking_id, action: 'reschedule', new_date, new_time }
 * Body (cancel):     { booking_id, action: 'cancel' }
 */

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ADMIN_TOKEN         = process.env.ADMIN_TOKEN;
const CALENDAR_USER       = 'jake@heartlandinspectiongroup.com';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
};

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
  if (!res.ok) { console.error('Azure token failed:', await res.text()); return null; }
  var data = await res.json();
  return data.access_token;
}

async function deleteCalendarEvent(token, eventId) {
  if (!token || !eventId) return false;
  var res = await fetch(
    'https://graph.microsoft.com/v1.0/users/' + CALENDAR_USER + '/events/' + eventId,
    {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    }
  );
  if (!res.ok && res.status !== 404) {
    console.error('Delete calendar event failed:', res.status, await res.text());
    return false;
  }
  return true;
}

function pad(n) { return String(n).padStart(2, '0'); }

function parseToIso(dateStr, timeStr) {
  // dateStr = YYYY-MM-DD, timeStr = "9:00 AM" or "14:00"
  var parts = (timeStr || '9:00 AM').trim().split(' ');
  var hm = parts[0].split(':');
  var h  = parseInt(hm[0], 10);
  var m  = parseInt(hm[1] || '0', 10);
  var meridiem = parts[1] ? parts[1].toUpperCase() : null;
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return dateStr + 'T' + pad(h) + ':' + pad(m) + ':00';
}

function addHours(isoLocal, hours) {
  var d = new Date(isoLocal + '-06:00'); // CST
  d.setHours(d.getHours() + hours);
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
       + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
}

async function createCalendarEvent(token, booking, newDate, newTime) {
  var dtStart = parseToIso(newDate, newTime || '9:00 AM');
  var dtEnd   = addHours(dtStart, 2);

  var bodyHtml = '<p><strong>Client:</strong> ' + (booking.client_name || '') + '<br>'
    + '<strong>Phone:</strong> ' + (booking.client_phone || '') + '<br>'
    + '<strong>Email:</strong> ' + (booking.client_email || '') + '</p>';

  var graphEvent = {
    subject:   'Inspection - ' + (booking.property_address || ''),
    body:      { contentType: 'HTML', content: bodyHtml },
    start:     { dateTime: dtStart, timeZone: 'America/Chicago' },
    end:       { dateTime: dtEnd,   timeZone: 'America/Chicago' },
    location:  { displayName: booking.property_address || '' },
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
    categories: ['Inspection'],
    showAs: 'busy',
  };

  var res = await fetch(
    'https://graph.microsoft.com/v1.0/users/' + CALENDAR_USER + '/events',
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(graphEvent),
    }
  );
  if (!res.ok) {
    var err = await res.text();
    throw new Error('Graph API create failed (' + res.status + '): ' + err);
  }
  var data = await res.json();
  return data.id;
}

async function updateBooking(bookingId, updates) {
  await fetch(SUPABASE_URL + '/rest/v1/bookings?id=eq.' + bookingId, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Accept either admin token OR a valid agent portal token
  var isAdmin = event.headers['x-admin-token'] === ADMIN_TOKEN;
  var agentToken = event.headers['x-portal-token'] || '';
  var isAgent = false;
  if (!isAdmin && agentToken) {
    // Validate the agent token against the agents table
    var aRes = await fetch(SUPABASE_URL + '/rest/v1/agents?portal_token=eq.' + encodeURIComponent(agentToken) + '&role=eq.agent&active=eq.true&select=id&limit=1', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    var aRows = aRes.ok ? await aRes.json() : [];
    isAgent = Array.isArray(aRows) && aRows.length > 0;
  }
  if (!isAdmin && !isAgent) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  var body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { booking_id, action, new_date, new_time } = body;
  if (!booking_id || !action) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'booking_id and action required' }) };
  }

  // Load booking
  var bRes = await fetch(SUPABASE_URL + '/rest/v1/bookings?id=eq.' + booking_id + '&select=*', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  var rows = await bRes.json();
  var booking = rows && rows[0];
  if (!booking) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Booking not found' }) };

  try {
    var azureToken = await getAzureToken();
    var deleted = false;
    var newEventId = null;

    // Delete old event if we have an ID
    if (azureToken && booking.calendar_event_id) {
      deleted = await deleteCalendarEvent(azureToken, booking.calendar_event_id);
      console.log('Deleted old calendar event:', booking.calendar_event_id, deleted);
    }

    if (action === 'reschedule') {
      if (!new_date) return { statusCode: 400, headers, body: JSON.stringify({ error: 'new_date required for reschedule' }) };

      // Delete the old calendar event first
      if (azureToken && booking.calendar_event_id) {
        try {
          await deleteCalendarEvent(azureToken, booking.calendar_event_id);
          console.log('Deleted old calendar event:', booking.calendar_event_id);
        } catch(delErr) {
          console.error('Delete old calendar event failed:', delErr.message);
        }
      }

      // Create new event with updated date/time
      if (azureToken) {
        try {
          newEventId = await createCalendarEvent(azureToken, booking, new_date, new_time);
          console.log('Created new calendar event:', newEventId);
        } catch(calErr) {
          console.error('Create calendar event failed:', calErr.message);
        }
      }

      // Update booking with new date/time and new event ID
      var bookingUpdates = {
        preferred_date: new_date,
        status: 'confirmed',
        reschedule_requested: false,
        reschedule_date: null,
        reschedule_time: null,
        calendar_event_id: newEventId || null,
      };
      if (new_time) bookingUpdates.preferred_time = new_time;
      await updateBooking(booking_id, bookingUpdates);

      // Mirror date + time to inspection_records (source of truth)
      var recUpdates = {
        inspection_date:      new_date,
        inspection_time:      new_time || null,
        reschedule_requested: false,
        reschedule_date:      null,
        reschedule_time:      null,
      };
      await fetch(SUPABASE_URL + '/rest/v1/inspection_records?booking_id=eq.' + booking_id, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(recUpdates),
      });

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'rescheduled', calendar_updated: !!newEventId }) };
    }

    if (action === 'cancel') {
      // Clear event ID from booking
      await updateBooking(booking_id, { calendar_event_id: null, status: 'cancelled' });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'cancelled', calendar_deleted: deleted }) };
    }

    if (action === 'create') {
      // Create a fresh event (for manual bookings that never had one)
      if (!new_date) return { statusCode: 400, headers, body: JSON.stringify({ error: 'new_date required for create' }) };
      if (azureToken) {
        try {
          newEventId = await createCalendarEvent(azureToken, booking, new_date || booking.preferred_date, new_time || booking.preferred_time);
          await updateBooking(booking_id, { calendar_event_id: newEventId, calendar_event_status: 'ok' });
          console.log('Created calendar event for manual booking:', newEventId);
        } catch(calErr) {
          console.error('Create calendar event failed:', calErr.message);
          await updateBooking(booking_id, { calendar_event_status: 'failed' });
        }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'created', calendar_updated: !!newEventId }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch(err) {
    console.error('update-calendar-event error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
