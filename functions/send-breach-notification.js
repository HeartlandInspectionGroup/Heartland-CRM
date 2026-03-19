/**
 * Netlify Function: send-breach-notification
 *
 * Sends breach notification emails to affected clients.
 * Auth: requires valid admin JWT (UI already owner-gated via laCheckOwnerAndRender).
 *
 * POST body: { scope: 'all' | 'date_range' | 'single', start_date?, end_date?, client_email?, message }
 */

const { createClient } = require('@supabase/supabase-js');
const { corsHeaders } = require('./lib/cors');
const { requireAuth } = require('./auth');
const { writeAuditLog } = require('./write-audit-log');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME = 'Heartland Inspection Group';

var _sb;
function db() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _sb;
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  var authError = await requireAuth(event);
  if (authError) return authError;

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var { scope, start_date, end_date, client_email, message } = body;
  if (!scope) return { statusCode: 400, headers, body: JSON.stringify({ error: 'scope required' }) };
  if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'message required' }) };
  if (scope === 'date_range' && (!start_date || !end_date)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'start_date and end_date required for date_range scope' }) };
  }
  if (scope === 'single' && !client_email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'client_email required for single scope' }) };
  }

  try {
    // Query affected clients
    var query = db().from('inspection_records').select('cust_name, cust_email').not('cust_email', 'is', null);

    if (scope === 'date_range') {
      query = query.gte('inspection_date', start_date).lte('inspection_date', end_date);
    } else if (scope === 'single') {
      query = query.eq('cust_email', client_email);
    }

    var { data: records, error: qErr } = await query;
    if (qErr) throw qErr;

    // Deduplicate by email
    var emailMap = {};
    (records || []).forEach(function (r) {
      if (r.cust_email && !emailMap[r.cust_email]) {
        emailMap[r.cust_email] = r.cust_name || 'Client';
      }
    });
    var recipients = Object.keys(emailMap);

    if (!recipients.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent: 0, message: 'No recipients found' }) };
    }

    // Send emails via Resend
    var sent = 0;
    for (var i = 0; i < recipients.length; i++) {
      var email = recipients[i];
      var name = emailMap[email];
      var personalMessage = message.replace('[Client Name]', name);
      try {
        var res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_NAME + ' <' + FROM_EMAIL + '>',
            to: [email],
            subject: 'Important Notice Regarding Your Data',
            text: personalMessage,
          }),
        });
        if (res.ok) sent++;
      } catch (e) {
        console.error('[send-breach-notification] Email failed for', email, e.message);
      }
    }

    // Audit log
    writeAuditLog({
      record_id: null,
      action: 'breach.notification_sent',
      category: 'compliance',
      actor: 'admin',
      details: { recipient_count: sent, scope: scope, timestamp: new Date().toISOString() },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent: sent }) };
  } catch (err) {
    console.error('send-breach-notification error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
