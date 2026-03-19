/**
 * Netlify Function: send-invoice-email
 *
 * Sends a branded invoice email to the client using inspection_records data.
 * POST body: { record_id }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { emailWrap, emailBtn, emailInfoTable, esc } = require('./lib/email-template');
const { resolveTemplate } = require('./lib/template-utils');
const { corsHeaders } = require('./lib/cors');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME      = 'Heartland Inspection Group';
const SITE_URL       = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';
const BCC_EMAIL      = 'jake@heartlandinspectiongroup.com';

function ensureAbsoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return 'https://heartland-crm.netlify.app' + (url.startsWith('/') ? '' : '/') + url;
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var authError = await requireAuth(event);
  if (authError) return authError;

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { record_id } = body;
  if (!record_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'record_id required' }) };

  try {
    var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    var { data: rec, error: recErr } = await sb.from('inspection_records').select('*').eq('id', record_id).single();
    if (recErr || !rec) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Record not found' }) };
    if (!rec.cust_email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Record has no client email' }) };

    var invoiceUrl = ensureAbsoluteUrl(rec.invoice_url || (SITE_URL + '/invoice-receipt.html?id=' + record_id));
    var firstName = (rec.cust_name || 'there').split(' ')[0];
    var dateStr = rec.inspection_date
      ? new Date(rec.inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    var tplVars = { client_name: rec.cust_name || '', address: rec.address || '', date: dateStr };
    var tpl = await resolveTemplate('send_invoice', { subject: 'Your Heartland Inspection Invoice', body: 'Your inspection invoice is ready. You can view and print it at any time using the link below.' }, tplVars);

    var bodyHtml = ''
      + '<div style="padding:32px 40px 8px;">'
      + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:16px;color:#1a2530;margin:0 0 12px;">Hi ' + esc(firstName) + ',</p>'
      + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 24px;">' + esc(tpl.body) + '</p>'
      + emailInfoTable([
        { label: 'Property', value: esc(rec.address || '') },
        { label: 'Client', value: esc(rec.cust_name || '') },
        ...(dateStr ? [{ label: 'Inspection Date', value: esc(dateStr) }] : []),
      ])
      + '</div>'
      + '<div style="padding:0 40px 32px;text-align:center;">'
      + emailBtn(invoiceUrl, 'View Your Invoice')
      + '</div>';

    var html = emailWrap({ subtitle: 'Your Inspection Invoice' }, bodyHtml);

    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_NAME + ' <' + FROM_EMAIL + '>',
        to: [rec.cust_email],
        bcc: [BCC_EMAIL],
        subject: tpl.subject,
        html: html,
      }),
    });

    if (!res.ok) {
      var err = await res.text();
      throw new Error('Resend error: ' + err);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('send-invoice-email error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
