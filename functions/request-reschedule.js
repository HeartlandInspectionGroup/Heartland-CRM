/**
 * Netlify Function: request-reschedule
 *
 * Called when a client requests a new date from their portal.
 * - Validates token ownership against inspection_records
 * - Writes reschedule_requested/date/time to inspection_records
 * - Also writes to bookings (for admin reference / calendar awareness)
 * - Emails Jake
 *
 * POST body: { token, booking_id, new_date, new_time }
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL       = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';
const ADMIN_URL      = SITE_URL + '/admin.html';

const FROM_EMAIL = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME  = 'Heartland Inspection Group';
const JAKE_EMAIL = 'jake@heartlandinspectiongroup.com';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function fmtDate(d) {
  if (!d) return '';
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

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { token, booking_id, new_date, new_time } = body;
  if (!token || !booking_id || !new_date) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token, booking_id, and new_date required' }) };
  }

  // Validate token
  var tokenRows = await sbGet('client_portal_tokens?token=eq.' + token + '&select=client_email');
  var tokenRow  = tokenRows && tokenRows[0];
  if (!tokenRow) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };

  // Load inspection record — single source of truth
  var recRows = await sbGet('inspection_records?booking_id=eq.' + booking_id + '&select=*&limit=1');
  var rec     = recRows && recRows[0];
  if (!rec) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Inspection record not found' }) };

  // Verify ownership
  if ((rec.cust_email || '').toLowerCase() !== tokenRow.client_email.toLowerCase()) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // Write reschedule request to inspection_records — source of truth
  await sbPatch('inspection_records?booking_id=eq.' + booking_id, {
    reschedule_requested: true,
    reschedule_date:      new_date,
    reschedule_time:      new_time || null,
  });

  // Also mirror to bookings for admin calendar awareness
  await sbPatch('bookings?id=eq.' + booking_id, {
    reschedule_requested: true,
    reschedule_date:      new_date,
    reschedule_time:      new_time || null,
  });

  // Email Jake
  if (RESEND_API_KEY) {
    var html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7f9;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;padding:32px 0;"><tr><td align="center">'
      + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">'
      + '<tr><td style="background:#f59321;padding:20px 32px;">'
      + '<h1 style="margin:0;font-family:sans-serif;font-size:18px;font-weight:700;color:#fff;">\u23f0 Reschedule Requested</h1>'
      + '</td></tr>'
      + '<tr><td style="padding:28px 32px;font-family:sans-serif;">'
      + '<p style="margin:0 0 16px;font-size:15px;color:#1a2530;"><strong>' + (rec.cust_name || rec.cust_email) + '</strong> has requested to reschedule their inspection.</p>'
      + '<table cellpadding="0" cellspacing="0" style="background:#f0f6f9;border-radius:8px;padding:16px 20px;width:100%;margin-bottom:20px;">'
      + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;width:120px;">Property</td><td style="font-size:14px;color:#1a2530;font-weight:600;">' + (rec.address || '') + '</td></tr>'
      + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Current Date</td><td style="font-size:14px;color:#1a2530;">' + fmtDate(rec.inspection_date) + '</td></tr>'
      + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Requested Date</td><td style="font-size:14px;color:#27ae60;font-weight:700;">' + fmtDate(new_date) + (new_time ? ' at ' + new_time : '') + '</td></tr>'
      + '</table>'
      + '<table cellpadding="0" cellspacing="0"><tr><td style="background:#15516d;border-radius:8px;padding:12px 28px;">'
      + '<a href="' + ADMIN_URL + '" style="font-family:sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">Review in Admin \u2192</a>'
      + '</td></tr></table>'
      + '</td></tr></table></td></tr></table></body></html>';

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    FROM_NAME + ' <' + FROM_EMAIL + '>',
          to:      [JAKE_EMAIL],
          subject: 'Reschedule Request \u2014 ' + (rec.cust_name || rec.cust_email),
          html,
        }),
      });
    } catch(e) { console.error('Notify email failed:', e); }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'Reschedule request submitted.' }),
  };
};
