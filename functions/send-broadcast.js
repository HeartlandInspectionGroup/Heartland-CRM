/**
 * Netlify Function: send-broadcast
 *
 * Sends a broadcast email to a list of recipients and logs to Supabase.
 * Called from the admin Broadcasts tab.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const FROM_EMAIL = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME  = 'Heartland Inspection Group';
const BCC_EMAIL  = 'jake@heartlandinspectiongroup.com';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const { emailWrap, esc } = require('./lib/email-template');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  var adminToken = process.env.ADMIN_TOKEN;
  if (event.headers['x-admin-token'] !== adminToken) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  var parsed;
  try { parsed = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { type, subject, body, recipients } = parsed;
  // recipients: [{ name, email }]

  if (!type || !subject || !body || !recipients || !recipients.length) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  var sent   = [];
  var failed = [];

  for (var i = 0; i < recipients.length; i++) {
    var r = recipients[i];
    if (!r.email) continue;
    var firstName = (r.name || 'there').split(' ')[0];

    // Personalise body — replace {{name}} and {{first_name}} tokens if present
    var personalBody = body
      .replace(/\{\{name\}\}/gi, r.name || 'there')
      .replace(/\{\{first_name\}\}/gi, firstName);

    // Render body as pre-line text inside the branded wrapper
    var bodyHtml = ''
      + '<div style="padding:32px 40px;">'
      + '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#333;line-height:1.8;white-space:pre-line;">'
      + esc(personalBody)
      + '</div>'
      + '</div>';

    var htmlBody = emailWrap({ subtitle: subject }, bodyHtml);

    try {
      var res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RESEND_API_KEY,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    FROM_NAME + ' <' + FROM_EMAIL + '>',
          to:      [r.email],
          bcc:     [BCC_EMAIL],
          subject: subject,
          html:    htmlBody,
        }),
      });
      if (res.ok) {
        sent.push({ name: r.name, email: r.email });
      } else {
        var errText = await res.text();
        console.error('Resend error for', (r.email || '').replace(/^(.).*@/, '$1***@'), errText);
        failed.push({ name: r.name, email: r.email });
      }
    } catch(e) {
      console.error('Send error for', (r.email || '').replace(/^(.).*@/, '$1***@'), e.message);
      failed.push({ name: r.name, email: r.email });
    }
  }

  // Log to Supabase broadcast_logs
  try {
    await fetch(SUPABASE_URL + '/rest/v1/broadcast_logs', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        type,
        subject,
        recipient_count: sent.length,
        recipients: sent,
        failed_count: failed.length,
      }),
    });
  } catch(e) {
    console.error('Broadcast log error:', e.message);
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ success: true, sent: sent.length, failed: failed.length }),
  };
};
