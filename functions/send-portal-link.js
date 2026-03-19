/**
 * Netlify Function: send-portal-link
 *
 * Looks up a client by email, creates a portal token, and sends
 * a branded email with the portal link. Always returns 200 to
 * avoid exposing whether the email exists.
 *
 * POST /api/send-portal-link
 * Body: { email }
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 */

const { createClient } = require('@supabase/supabase-js');
const { sendEmail, hasCredentials } = require('./lib/ms-graph');

const { corsHeaders } = require('./lib/cors');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

const { emailWrap, emailBtn, esc: escTpl } = require('./lib/email-template');
const { resolveTemplate } = require('./lib/template-utils');

function buildPortalEmailHtml(firstName, portalUrl, customBody) {
  var body = ''
    + '<div style="padding:32px 40px;">'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 24px;">'
    + 'Hi ' + escTpl(firstName) + ',<br><br>'
    + escTpl(customBody || 'Here\'s your personal link to access your Home Health Record. View your inspection findings, track what you\'ve addressed, and download your reports.')
    + '</p>'
    + '<div style="text-align:center;margin-bottom:20px;">'
    + emailBtn(portalUrl, 'View Your Portal')
    + '</div>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#6b7d8a;text-align:center;margin:0 0 20px;">'
    + 'This link expires in 30 days. You can request a new one anytime.'
    + '</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f8;border-radius:10px;border-left:4px solid #1a2a44;">'
    + '<tr><td style="padding:14px 20px;">'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;color:#475b6a;line-height:1.5;margin:0;">'
    + 'If you didn\'t request this link, you can safely ignore this email.'
    + '</p>'
    + '</td></tr></table>'
    + '</div>';

  return emailWrap({ subtitle: 'Your Home Health Record' }, body);
}

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Always return 200 — don't expose whether email exists
  const okResponse = {
    statusCode: 200, headers,
    body: JSON.stringify({ success: true, message: 'If an account exists, a portal link has been sent.' }),
  };

  const sb = getSupabase();
  if (!sb || !hasCredentials()) {
    console.error('send-portal-link: missing Supabase or Azure credentials');
    return okResponse;
  }

  try {
    const { email } = JSON.parse(event.body);
    if (!email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email is required' }) };
    }

    // Look up client
    const { data: client } = await sb
      .from('clients')
      .select('id, first_name, email')
      .ilike('email', email.trim())
      .single();

    if (!client) return okResponse;

    // Create token
    const { data: tokenRow, error: tokenErr } = await sb
      .from('client_portal_tokens')
      .insert({ client_id: client.id })
      .select('token')
      .single();

    if (tokenErr) throw tokenErr;

    const siteUrl = process.env.URL || 'https://heartlandinspectiongroup.netlify.app';
    const portalUrl = `${siteUrl}/client-portal.html?token=${tokenRow.token}`;

    var tplVars = { client_name: client.first_name || '', address: '' };
    var tpl = await resolveTemplate('send_portal_link', { subject: 'Your Heartland Home Health Record', body: '' }, tplVars);
    await sendEmail({
      to: client.email,
      toName: client.first_name,
      subject: tpl.subject,
      htmlBody: buildPortalEmailHtml(client.first_name, portalUrl, tpl.body || null),
    });

    return okResponse;
  } catch (err) {
    console.error('send-portal-link error:', err);
    return okResponse;
  }
};
