/**
 * Netlify Function: cancel-booking
 *
 * Called when a client or agent cancels from their portal.
 * - Validates token ownership (client portal token OR agent portal_token)
 * - Marks inspection_records.status = 'cancelled'
 * - Also marks bookings.status = 'cancelled'
 * - Deletes Outlook calendar event
 * - Emails Jake (admin alert, red header)
 * - Emails client (branded cancellation confirmation)
 *
 * POST body: { token, booking_id }
 */

const RESEND_API_KEY      = process.env.RESEND_API_KEY;
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SITE_URL            = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';
const ADMIN_URL           = SITE_URL + '/admin.html';
const PHONE               = '(815) 329-8583';

const FROM_EMAIL    = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME     = 'Heartland Inspection Group';
const JAKE_EMAIL    = 'jake@heartlandinspectiongroup.com';
const CALENDAR_USER = 'jake@heartlandinspectiongroup.com';

const { emailWrap, emailBtn, emailInfoTable, esc } = require('./lib/email-template');
const { writeAuditLog } = require('./write-audit-log');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

async function sbGet(path) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
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

async function getAzureToken() {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) return null;
  var res = await fetch(
    'https://login.microsoftonline.com/' + AZURE_TENANT_ID + '/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: AZURE_CLIENT_ID, client_secret: AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
      }).toString(),
    }
  );
  if (!res.ok) return null;
  var data = await res.json();
  return data.access_token;
}

async function deleteCalendarEvent(token, eventId) {
  if (!token || !eventId) return false;
  var res = await fetch(
    'https://graph.microsoft.com/v1.0/users/' + CALENDAR_USER + '/events/' + eventId,
    { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } }
  );
  return res.ok || res.status === 404;
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return false;
  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_NAME + ' <' + FROM_EMAIL + '>', to: [to], subject, html }),
    });
    return res.ok;
  } catch(e) { console.error('sendEmail error:', e); return false; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { token, booking_id, record_id } = body;
  if (!token || (!booking_id && !record_id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token and either booking_id or record_id required' }) };
  }

  // Validate token — admin bypass, client portal token, or agent portal_token
  var clientEmail = null;
  var ADMIN_TOKEN_VAL = process.env.ADMIN_TOKEN;
  var isAdmin = body._admin === true && ADMIN_TOKEN_VAL && token === ADMIN_TOKEN_VAL;

  if (!isAdmin) {
    var tokenRows = await sbGet('client_portal_tokens?token=eq.' + encodeURIComponent(token) + '&select=client_email&limit=1');
    if (tokenRows && tokenRows[0]) {
      clientEmail = tokenRows[0].client_email;
    } else {
      // Try agent portal_token
      var agentRows = await sbGet('agents?portal_token=eq.' + encodeURIComponent(token) + '&active=eq.true&select=id&limit=1');
      if (!agentRows || !agentRows[0]) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
      }
      // Agent is authorized — we'll get client email from the inspection record
    }
  }

  // Load inspection record — by booking_id or record_id
  var rec;
  if (booking_id) {
    var recRows = await sbGet('inspection_records?booking_id=eq.' + booking_id + '&select=*&limit=1');
    rec = recRows && recRows[0];
  } else {
    var recRowsById = await sbGet('inspection_records?id=eq.' + record_id + '&select=*&limit=1');
    rec = recRowsById && recRowsById[0];
  }
  if (!rec) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Inspection record not found' }) };

  // For client tokens verify ownership
  if (clientEmail && (rec.cust_email || '').toLowerCase() !== clientEmail.toLowerCase()) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // Guard against double-cancel
  if (rec.status === 'cancelled') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Already cancelled' }) };
  }
  if (rec.status === 'submitted') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot cancel a completed inspection' }) };
  }

  // Delete Outlook calendar event
  // If booking_id exists, get calendar_event_id from bookings table.
  // If record_id only (no booking), check inspection_records directly.
  var calendarDeleted = false;
  try {
    var calEventId = null;
    if (booking_id) {
      var bookingRows = await sbGet('bookings?id=eq.' + booking_id + '&select=calendar_event_id&limit=1');
      calEventId = bookingRows && bookingRows[0] && bookingRows[0].calendar_event_id;
    } else if (rec.calendar_event_id) {
      calEventId = rec.calendar_event_id;
    }
    if (calEventId) {
      var azureToken = await getAzureToken();
      if (azureToken) calendarDeleted = await deleteCalendarEvent(azureToken, calEventId);
    }
  } catch(e) { console.error('Calendar delete error:', e); }

  // Mark cancelled — update by booking_id or record id depending on what we have
  if (booking_id) {
    await sbPatch('inspection_records?booking_id=eq.' + booking_id, { status: 'cancelled' });
    await sbPatch('bookings?id=eq.' + booking_id, { status: 'cancelled', calendar_event_id: null });
  } else {
    await sbPatch('inspection_records?id=eq.' + rec.id, { status: 'cancelled' });
  }

  var clientName  = rec.cust_name  || rec.cust_email || 'Client';
  var clientAddr  = rec.address    || '—';
  var inspDate    = fmtDate(rec.inspection_date);
  var custEmail   = rec.cust_email || '';

  // ── Email Jake (red alert header — internal only) ──────────────────────
  var jakeHtml = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7f9;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;padding:32px 0;"><tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">'
    + '<tr><td style="background:#c0392b;padding:20px 32px;">'
    + '<h1 style="margin:0;font-family:sans-serif;font-size:18px;font-weight:700;color:#fff;">&#10060; Booking Cancelled</h1>'
    + '</td></tr>'
    + '<tr><td style="padding:28px 32px;font-family:sans-serif;">'
    + '<p style="margin:0 0 16px;font-size:15px;color:#1a2530;"><strong>' + clientName + '</strong> has cancelled their booking.</p>'
    + '<table cellpadding="0" cellspacing="0" style="background:#f0f6f9;border-radius:8px;padding:16px 20px;width:100%;margin-bottom:20px;">'
    + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;width:120px;">Property</td><td style="font-size:14px;color:#1a2530;font-weight:600;">' + clientAddr + '</td></tr>'
    + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Date</td><td style="font-size:14px;color:#1a2530;">' + inspDate + '</td></tr>'
    + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Calendar</td><td style="font-size:14px;color:' + (calendarDeleted ? '#27ae60' : '#c0392b') + ';">' + (calendarDeleted ? '&#10003; Event removed from Outlook' : '&#9888; Could not remove calendar event') + '</td></tr>'
    + '</table>'
    + '<table cellpadding="0" cellspacing="0"><tr><td style="background:#15516d;border-radius:8px;padding:12px 28px;">'
    + '<a href="' + ADMIN_URL + '" style="font-family:sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">View in Admin &rarr;</a>'
    + '</td></tr></table>'
    + '</td></tr></table></td></tr></table></body></html>';

  await sendEmail(JAKE_EMAIL, 'Booking Cancelled — ' + clientName, jakeHtml);

  // ── Email Client (branded cancellation confirmation) ───────────────────
  if (custEmail) {
    var clientBodyHtml = `
      <div style="padding:36px 40px;">
        <p style="margin:0 0 20px;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;color:#1a2530;">
          Hi ${esc(rec.cust_name || 'there')},
        </p>
        <p style="margin:0 0 24px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.6;">
          Your inspection booking has been cancelled. We're sorry to see you go — if you'd like to rebook or have any questions, we're here to help.
        </p>
        ${emailInfoTable([
          { label: 'Property',   value: esc(clientAddr) },
          { label: 'Date',       value: esc(inspDate) },
        ])}
        <p style="margin:0 0 24px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.6;">
          To schedule a new inspection, give us a call or visit our website.
        </p>
        <div style="text-align:center;margin-bottom:8px;">
          ${emailBtn('tel:8153298583', 'Call Us: ' + PHONE, '#15516d')}
        </div>
      </div>`;

    var clientHtml = emailWrap({ subtitle: 'Booking Cancelled', preheader: 'Your inspection at ' + clientAddr + ' has been cancelled.' }, clientBodyHtml);
    await sendEmail(custEmail, 'Your Inspection Has Been Cancelled — ' + clientAddr, clientHtml);
  }

  // ── Audit log (fire and forget) ──
  writeAuditLog({
    record_id: rec.id || null,
    action:    'booking.cancelled',
    category:  'scheduling',
    actor:     'client',
    details:   { address: clientAddr, client: clientName, booking_id: booking_id || null, record_id: record_id || null },
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, calendar_deleted: calendarDeleted }),
  };
};
