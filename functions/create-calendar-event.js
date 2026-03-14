/**
 * Netlify Function: create-calendar-event
 *
 * Called when a client submits the booking wizard.
 * 1. Sends client a confirmation email via Resend
 * 2. Sends Jake a notification email with full booking details + .ics attachment
 *    so Power Automate can auto-accept it into Outlook to block the calendar slot.
 * 3. Flags booking in Supabase with calendar_event_status ok or failed
 */

const RESEND_API_KEY      = process.env.RESEND_API_KEY;
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

const FROM_EMAIL    = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME     = 'Heartland Inspection Group';
const JAKE_EMAIL    = 'jake@heartlandinspectiongroup.com';
const CALENDAR_USER = 'jake@heartlandinspectiongroup.com';
const ADMIN_URL     = 'https://heartlandinspectiongroup.com/admin.html';

// AZURE GRAPH - get access token
async function getAzureToken() {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) return null;
  var tokenUrl = 'https://login.microsoftonline.com/' + AZURE_TENANT_ID + '/oauth2/v2.0/token';
  var body = new URLSearchParams({
    client_id:     AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  });
  var res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) { console.error('Azure token failed:', await res.text()); return null; }
  var data = await res.json();
  return data.access_token;
}

// AZURE GRAPH - write calendar event
async function writeCalendarEvent(token, dtStart, dtEnd, address, clientName, phone, email, services, total) {
  var serviceNames = (services || []).map(function(s) { return s.name; }).join(', ');
  var bodyHtml = '<p><strong>Client:</strong> ' + clientName + '<br>'
    + '<strong>Phone:</strong> ' + phone + '<br>'
    + '<strong>Email:</strong> ' + email + '<br>'
    + '<strong>Services:</strong> ' + serviceNames + '<br>'
    + '<strong>Total:</strong> $' + total + '</p>';

  // Convert ICS local format YYYYMMDDTHHMMSS to ISO for Graph API
  function icsToIso(ics) {
    // ics = 20250315T090000
    var y  = ics.slice(0,4), mo = ics.slice(4,6), d = ics.slice(6,8);
    var h  = ics.slice(9,11), mi = ics.slice(11,13);
    return y + '-' + mo + '-' + d + 'T' + h + ':' + mi + ':00';
  }

  var graphEvent = {
    subject: 'Inspection - ' + address,
    body: { contentType: 'HTML', content: bodyHtml },
    start: { dateTime: icsToIso(dtStart), timeZone: 'America/Chicago' },
    end:   { dateTime: icsToIso(dtEnd),   timeZone: 'America/Chicago' },
    location: { displayName: address },
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
    categories: ['Inspection'],
    showAs: 'busy',
  };

  var res = await fetch('https://graph.microsoft.com/v1.0/users/' + CALENDAR_USER + '/events', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphEvent),
  });
  if (!res.ok) {
    var err = await res.text();
    throw new Error('Graph API event creation failed (' + res.status + '): ' + err);
  }
  return await res.json();
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ICS BUILDER
function buildIcs(uid, dtStart, dtEnd, summary, description, location) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const esc = (s) => (s || '').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Heartland Inspection Group//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + now,
    'DTSTART;TZID=America/Chicago:' + dtStart,
    'DTEND;TZID=America/Chicago:' + dtEnd,
    'SUMMARY:' + esc(summary),
    'DESCRIPTION:' + esc(description),
    'LOCATION:' + esc(location),
    'ORGANIZER;CN=' + esc(FROM_NAME) + ':mailto:' + FROM_EMAIL,
    'ATTENDEE;CN=Jake;RSVP=TRUE:mailto:' + JAKE_EMAIL,
    'STATUS:TENTATIVE',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Inspection in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// DATE HELPERS
function parseToIcsLocal(dateStr, timeStr) {
  const pad = (n) => String(n).padStart(2, '0');
  const parts = timeStr.trim().split(' ');
  var hm = parts[0].split(':');
  var h = parseInt(hm[0], 10);
  var m = parseInt(hm[1] || '0', 10);
  var meridiem = parts[1] ? parts[1].toUpperCase() : null;
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return dateStr.replace(/-/g, '') + 'T' + pad(h) + pad(m) + '00';
}

function addHoursToIcsLocal(icsLocal, hours) {
  const pad = (n) => String(n).padStart(2, '0');
  var y  = parseInt(icsLocal.slice(0, 4), 10);
  var mo = parseInt(icsLocal.slice(4, 6), 10) - 1;
  var dy = parseInt(icsLocal.slice(6, 8), 10);
  var h  = parseInt(icsLocal.slice(9, 11), 10);
  var mi = parseInt(icsLocal.slice(11, 13), 10);
  var d  = new Date(y, mo, dy, h + hours, mi);
  return '' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
}

function fmtDisplayDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function fmtMoney(n) {
  return '$' + Number(n || 0).toFixed(0);
}

// CLIENT CONFIRMATION EMAIL
function buildClientEmail(p) {
  var firstName = p.firstName || '';
  var address   = p.address   || '';
  var date      = p.date      || '';
  var time      = p.time      || '';
  var services  = p.services  || [];
  var total         = p.total         || 0;
  var discount      = p.discount      || 0;
  var discountPct   = p.discountPct   || 0;
  var couponCode    = p.couponCode    || '';
  var couponDiscount= p.couponDiscount|| 0;
  var taxAmount     = p.taxAmount     || 0;

  var dateFormatted = fmtDisplayDate(date);

  var serviceRows = services.map(function(s) {
    return '<tr><td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#1a2530;border-bottom:1px solid #eaeef0;">' + s.name + '</td>'
         + '<td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#1a2530;text-align:right;border-bottom:1px solid #eaeef0;">' + (s.price ? fmtMoney(s.price) : 'Included') + '</td></tr>';
  }).join('');

  var discountRow = discountPct > 0
    ? '<tr><td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#3d7a3c;border-bottom:1px solid #eaeef0;"><strong>Bundle Discount (' + discountPct + '%)</strong></td><td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#3d7a3c;text-align:right;border-bottom:1px solid #eaeef0;">-' + fmtMoney(discount) + '</td></tr>'
    : '';

  var couponRow = (couponCode && couponDiscount > 0)
    ? '<tr><td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#3d7a3c;border-bottom:1px solid #eaeef0;"><strong>Coupon (' + couponCode + ')</strong></td><td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#3d7a3c;text-align:right;border-bottom:1px solid #eaeef0;">-' + fmtMoney(couponDiscount) + '</td></tr>'
    : '';

  var taxRow = taxAmount > 0
    ? '<tr><td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#6b7d8a;border-bottom:1px solid #eaeef0;">State Tax</td><td style="padding:8px 12px;font-family:sans-serif;font-size:14px;color:#6b7d8a;text-align:right;border-bottom:1px solid #eaeef0;">' + fmtMoney(taxAmount) + '</td></tr>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f7f9;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;padding:32px 0;"><tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">'
    + '<tr><td style="background:#15516d;padding:32px 40px;text-align:center;">'
    + '<img src="https://i.imgur.com/I1vTiVT.png" alt="Heartland Inspection Group" style="height:48px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;">'
    + '<h1 style="margin:0;font-family:Georgia,serif;font-size:24px;color:#ffffff;font-weight:400;">Booking Request Received</h1>'
    + '</td></tr>'
    + '<tr><td style="padding:36px 40px;">'
    + '<p style="margin:0 0 20px;font-family:sans-serif;font-size:16px;color:#1a2530;">Hi ' + firstName + ',</p>'
    + '<p style="margin:0 0 28px;font-family:sans-serif;font-size:15px;color:#4a5568;line-height:1.6;">Thanks for booking with Heartland Inspection Group! We\'ve received your request and will confirm your appointment within <strong>1 business day</strong>.</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6f9;border-radius:10px;margin-bottom:28px;"><tr><td style="padding:20px 24px;">'
    + '<h3 style="margin:0 0 14px;font-family:sans-serif;font-size:12px;color:#15516d;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Appointment Details</h3>'
    + '<table cellpadding="0" cellspacing="0" style="width:100%;">'
    + '<tr><td style="font-family:sans-serif;font-size:14px;color:#6b7d8a;padding:4px 0;width:120px;">Property</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;font-weight:600;padding:4px 0;">' + address + '</td></tr>'
    + '<tr><td style="font-family:sans-serif;font-size:14px;color:#6b7d8a;padding:4px 0;">Preferred Date</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;font-weight:600;padding:4px 0;">' + dateFormatted + '</td></tr>'
    + '<tr><td style="font-family:sans-serif;font-size:14px;color:#6b7d8a;padding:4px 0;">Preferred Time</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;font-weight:600;padding:4px 0;">' + time + '</td></tr>'
    + '</table></td></tr></table>'
    + '<h3 style="margin:0 0 12px;font-family:sans-serif;font-size:12px;color:#15516d;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Services Requested</h3>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eaeef0;border-radius:10px;overflow:hidden;margin-bottom:28px;">'
    + serviceRows + discountRow + couponRow + taxRow
    + '<tr style="background:#f0f6f9;"><td style="padding:12px;font-family:sans-serif;font-size:15px;color:#1a2530;font-weight:700;">Estimated Total</td><td style="padding:12px;font-family:sans-serif;font-size:18px;color:#15516d;font-weight:700;text-align:right;">' + fmtMoney(total) + '</td></tr>'
    + '</table>'
    + '<p style="margin:0 0 8px;font-family:sans-serif;font-size:13px;color:#6b7d8a;">Questions? Reach us at:</p>'
    + '<p style="margin:0;font-family:sans-serif;font-size:14px;"><a href="tel:8153298583" style="color:#15516d;text-decoration:none;">(815) 329-8583</a> &nbsp;&middot;&nbsp; <a href="mailto:info@heartlandinspectiongroup.com" style="color:#15516d;text-decoration:none;">info@heartlandinspectiongroup.com</a></p>'
    + '</td></tr>'
    + '<tr><td style="background:#f0f6f9;padding:20px 40px;text-align:center;"><p style="margin:0;font-family:sans-serif;font-size:12px;color:#9aabb5;">Heartland Inspection Group &nbsp;&middot;&nbsp; Roscoe, IL &nbsp;&middot;&nbsp; heartlandinspectiongroup.com</p></td></tr>'
    + '</table></td></tr></table></body></html>';
}

// JAKE NOTIFICATION EMAIL
function buildJakeEmail(p) {
  var firstName     = p.firstName     || '';
  var lastName      = p.lastName      || '';
  var phone         = p.phone         || '';
  var email         = p.email         || '';
  var address       = p.address       || '';
  var date          = p.date          || '';
  var time          = p.time          || '';
  var services      = p.services      || [];
  var total         = p.total         || 0;
  var discount      = p.discount      || 0;
  var discountPct   = p.discountPct   || 0;
  var couponCode    = p.couponCode    || '';
  var couponDiscount= p.couponDiscount|| 0;
  var taxAmount     = p.taxAmount     || 0;
  var booking_id    = p.booking_id    || null;

  var clientName    = (firstName + ' ' + lastName).trim();
  var dateFormatted = fmtDisplayDate(date);
  var adminLink     = ADMIN_URL + '#bookings';

  var serviceList = services.map(function(s) {
    return '<tr><td style="padding:6px 12px;font-family:sans-serif;font-size:13px;color:#1a2530;border-bottom:1px solid #eaeef0;">' + s.name + '</td>'
         + '<td style="padding:6px 12px;font-family:sans-serif;font-size:13px;color:#1a2530;text-align:right;border-bottom:1px solid #eaeef0;">' + (s.price ? fmtMoney(s.price) : 'Included') + '</td></tr>';
  }).join('');

  var discountRow = discountPct > 0
    ? '<tr><td style="padding:6px 12px;font-size:13px;color:#3d7a3c;border-bottom:1px solid #eaeef0;">Bundle Discount (' + discountPct + '%)</td><td style="padding:6px 12px;font-size:13px;color:#3d7a3c;text-align:right;border-bottom:1px solid #eaeef0;">-' + fmtMoney(discount) + '</td></tr>'
    : '';
  var couponRow = (couponCode && couponDiscount > 0)
    ? '<tr><td style="padding:6px 12px;font-size:13px;color:#3d7a3c;border-bottom:1px solid #eaeef0;">Coupon (' + couponCode + ')</td><td style="padding:6px 12px;font-size:13px;color:#3d7a3c;text-align:right;border-bottom:1px solid #eaeef0;">-' + fmtMoney(couponDiscount) + '</td></tr>'
    : '';
  var taxRow = taxAmount > 0
    ? '<tr><td style="padding:6px 12px;font-size:13px;color:#6b7d8a;border-bottom:1px solid #eaeef0;">State Tax</td><td style="padding:6px 12px;font-size:13px;color:#6b7d8a;text-align:right;border-bottom:1px solid #eaeef0;">' + fmtMoney(taxAmount) + '</td></tr>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f7f9;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;padding:32px 0;"><tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">'
    + '<tr><td style="background:#f59321;padding:24px 40px;">'
    + '<h1 style="margin:0;font-family:sans-serif;font-size:20px;color:#ffffff;font-weight:700;">New Booking Request</h1>'
    + '<p style="margin:6px 0 0;font-family:sans-serif;font-size:13px;color:rgba(255,255,255,0.85);">Accept the attached .ics file to block your calendar, then confirm in admin.</p>'
    + '</td></tr>'
    + '<tr><td style="padding:32px 40px;">'
    + '<h3 style="margin:0 0 12px;font-family:sans-serif;font-size:11px;color:#15516d;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Client</h3>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6f9;border-radius:10px;margin-bottom:24px;"><tr><td style="padding:16px 20px;">'
    + '<table cellpadding="0" cellspacing="0">'
    + '<tr><td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;width:80px;">Name</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;font-weight:600;">' + clientName + '</td></tr>'
    + '<tr><td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Phone</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;"><a href="tel:' + phone.replace(/\D/g,'') + '" style="color:#15516d;text-decoration:none;">' + phone + '</a></td></tr>'
    + '<tr><td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Email</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;"><a href="mailto:' + email + '" style="color:#15516d;text-decoration:none;">' + email + '</a></td></tr>'
    + '</table></td></tr></table>'
    + '<h3 style="margin:0 0 12px;font-family:sans-serif;font-size:11px;color:#15516d;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Appointment</h3>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6f9;border-radius:10px;margin-bottom:24px;"><tr><td style="padding:16px 20px;">'
    + '<table cellpadding="0" cellspacing="0">'
    + '<tr><td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;width:80px;">Address</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;font-weight:600;">' + address + '</td></tr>'
    + '<tr><td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Date</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;">' + dateFormatted + '</td></tr>'
    + '<tr><td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Time</td><td style="font-family:sans-serif;font-size:14px;color:#1a2530;">' + time + '</td></tr>'
    + '</table></td></tr></table>'
    + '<h3 style="margin:0 0 12px;font-family:sans-serif;font-size:11px;color:#15516d;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Services &amp; Pricing</h3>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eaeef0;border-radius:10px;overflow:hidden;margin-bottom:28px;">'
    + serviceList + discountRow + couponRow + taxRow
    + '<tr style="background:#f0f6f9;"><td style="padding:10px 12px;font-family:sans-serif;font-size:14px;font-weight:700;color:#1a2530;">Total</td><td style="padding:10px 12px;font-family:sans-serif;font-size:16px;font-weight:700;color:#15516d;text-align:right;">' + fmtMoney(total) + '</td></tr>'
    + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">'
    + '<a href="' + adminLink + '" style="display:inline-block;background:#15516d;color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;">Review in Admin Panel &rarr;</a>'
    + '</td></tr></table>'
    + '<p style="margin:0;font-family:sans-serif;font-size:12px;color:#9aabb5;text-align:center;">Accept the .ics attachment in Outlook to block this time slot on your calendar.</p>'
    + '</td></tr></table></td></tr></table></body></html>';
}

// SUPABASE FLAG
async function flagBooking(bookingId, status, eventUid) {
  if (!bookingId || !SUPABASE_URL || !SUPABASE_KEY) return;
  var update = { calendar_event_status: status };
  if (eventUid) update.calendar_event_id = eventUid;
  await fetch(SUPABASE_URL + '/rest/v1/bookings?id=eq.' + bookingId, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(update),
  }).catch(function(e) { console.error('Supabase flag error:', e); });
}

// HANDLER
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Email service not configured' }) };
  }

  var payload;
  try { payload = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var required = ['firstName', 'lastName', 'phone', 'email', 'address', 'date', 'time'];
  var missing = required.filter(function(f) { return !payload[f]; });
  if (missing.length) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Missing fields: ' + missing.join(', ') }) };

  var firstName  = payload.firstName;
  var lastName   = payload.lastName;
  var email      = payload.email;
  var address    = payload.address;
  var date       = payload.date;
  var time       = payload.time;
  var services   = payload.services || [];
  var booking_id = payload.booking_id || null;

  var clientName = (firstName + ' ' + lastName).trim();

  // Build ICS
  var uid      = 'booking-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@heartlandinspectiongroup.com';
  var dtStart  = parseToIcsLocal(date, time);
  var dtEnd    = addHoursToIcsLocal(dtStart, 2);
  var icsDesc  = 'Client: ' + clientName + '\nPhone: ' + (payload.phone || '') + '\nEmail: ' + email + '\nServices: ' + services.map(function(s){return s.name;}).join(', ') + '\nTotal: ' + fmtMoney(payload.total);
  var icsContent = buildIcs(uid, dtStart, dtEnd, 'Inspection - ' + address, icsDesc, address);
  var icsBase64  = Buffer.from(icsContent).toString('base64');

  var clientEmailOk = false;
  var jakeEmailOk   = false;

  // 1. Client confirmation email
  try {
    var clientRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    FROM_NAME + ' <' + FROM_EMAIL + '>',
        to:      [email],
        subject: 'Booking Request Received - ' + address,
        html:    buildClientEmail(payload),
      }),
    });
    clientEmailOk = clientRes.ok;
    if (!clientRes.ok) console.error('Client email failed:', await clientRes.text());
  } catch(e) { console.error('Client email error:', e); }

  // 2. Jake notification email with .ics attachment
  try {
    var jakeRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    FROM_NAME + ' <' + FROM_EMAIL + '>',
        to:      [JAKE_EMAIL],
        subject: 'New Booking - ' + clientName + ' - ' + date,
        html:    buildJakeEmail(payload),
        attachments: [{ filename: 'inspection-' + date + '.ics', content: icsBase64 }],
      }),
    });
    jakeEmailOk = jakeRes.ok;
    if (!jakeRes.ok) console.error('Jake email failed:', await jakeRes.text());
  } catch(e) { console.error('Jake email error:', e); }

  // 3. Write event to Jake's Outlook calendar via Azure Graph API
  var calendarOk = false;
  var calendarEventId = null;
  try {
    var azureToken = await getAzureToken();
    if (azureToken) {
      var calResult = await writeCalendarEvent(
        azureToken, dtStart, dtEnd, address, clientName,
        payload.phone, email, services, payload.total
      );
      calendarOk = true;
      calendarEventId = calResult.id || null;
      console.log('Calendar event created:', calendarEventId);
    } else {
      console.warn('Azure credentials not configured - skipping calendar write');
    }
  } catch(e) {
    console.error('Calendar write error:', e.message);
  }

  // 4. Flag booking in Supabase
  var overallOk = clientEmailOk && jakeEmailOk;
  var eventId   = calendarEventId || (overallOk ? uid : null);
  await flagBooking(booking_id, (overallOk && calendarOk) ? 'ok' : overallOk ? 'email_only' : 'failed', eventId);

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      success: true,
      client_email: clientEmailOk,
      jake_email:   jakeEmailOk,
      calendar:     calendarOk,
    }),
  };
};
