/**
 * Netlify Function: send-invoice
 *
 * Sends a branded invoice email to the client via Microsoft Graph.
 * Updates invoice status from draft → sent. Creates a portal token.
 *
 * POST /api/send-invoice
 * Body: { invoice_id, is_reminder? }
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 */

const { createClient } = require('@supabase/supabase-js');
const { sendEmail, hasCredentials } = require('./lib/ms-graph');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function formatMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const { emailWrap } = require('./lib/email-template');

function emailWrapper(title, innerHtml) {
  return emailWrap({ subtitle: title }, '<div style="padding:36px 40px;">' + innerHtml + '</div>');
}

function buildInvoiceEmail(invoice, lineItems, client, portalUrl, isReminder) {
  const firstName = client.first_name || 'there';
  const address = invoice.inspection_record_id ? '' : ''; // populated below if available
  const dueDateStr = invoice.due_date
    ? new Date(invoice.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const introText = isReminder
    ? `This is a friendly reminder that your invoice is still outstanding.`
    : `Here's your invoice for your upcoming home inspection.`;

  let lineItemRows = '';
  for (const item of lineItems) {
    const isNeg = item.total < 0;
    const color = isNeg ? '#3d7a3c' : '#1a2530';
    lineItemRows += `<tr>
      <td style="font-family:sans-serif;font-size:14px;color:#1a2530;padding:10px 0;border-bottom:1px solid #eaeef0;">${esc(item.description)}</td>
      <td style="font-family:sans-serif;font-size:14px;color:${color};padding:10px 0;border-bottom:1px solid #eaeef0;text-align:right;font-weight:600;">${formatMoney(item.total)}</td>
    </tr>`;
  }

  const inner = `
    <p style="font-family:sans-serif;font-size:16px;color:#1a2530;line-height:1.6;margin:0 0 20px;">
      Hi ${esc(firstName)},<br><br>
      ${introText}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;border-radius:10px;padding:24px;margin-bottom:24px;">
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Invoice ${esc(invoice.invoice_number)}</td>
            <td style="font-family:sans-serif;font-size:13px;color:#6b7d8a;text-align:right;">${dueDateStr ? 'Due ' + dueDateStr : ''}</td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #eaeef0;margin:12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${lineItemRows}
          <tr>
            <td style="font-family:sans-serif;font-size:16px;color:#15516d;padding:14px 0 0;font-weight:700;">Total</td>
            <td style="font-family:sans-serif;font-size:16px;color:#15516d;padding:14px 0 0;text-align:right;font-weight:700;">${formatMoney(invoice.balance_due)}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr><td style="background:#27ae60;border-radius:8px;padding:14px 36px;">
        <a href="${portalUrl}" style="font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;display:block;">Pay Now &mdash; ${formatMoney(invoice.balance_due)}</a>
      </td></tr>
    </table>

    <p style="font-family:sans-serif;font-size:13px;color:#6b7d8a;line-height:1.6;text-align:center;margin:0 0 12px;">
      We accept credit card, debit card, and Venmo online.<br>
      Cash or check also accepted at the inspection.
    </p>

    ${invoice.memo ? `<p style="font-family:sans-serif;font-size:14px;color:#1a2530;line-height:1.6;background:#f5f7f8;border-radius:8px;padding:16px;margin:20px 0 0;">${esc(invoice.memo)}</p>` : ''}

    <p style="font-family:sans-serif;font-size:14px;color:#6b7d8a;margin:24px 0 0;">
      Questions? Reply to this email or call <a href="tel:8153298583" style="color:#15516d;">(815) 329-8583</a>.
    </p>`;

  const title = isReminder ? 'Payment Reminder' : 'Your Invoice';
  return emailWrapper(title, inner);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { invoice_id, is_reminder } = JSON.parse(event.body);
    if (!invoice_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'invoice_id required' }) };
    }

    if (!hasCredentials()) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email credentials not configured' }) };
    }

    const sb = getSupabase();
    if (!sb) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };
    }

    // Fetch invoice + line items + client
    const { data: invoice, error: invErr } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();
    if (invErr || !invoice) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invoice not found' }) };
    }

    if (invoice.status === 'void') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot send a voided invoice' }) };
    }

    const { data: lineItems } = await sb
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice_id)
      .order('sort_order');

    const { data: client } = await sb
      .from('clients')
      .select('*')
      .eq('id', invoice.client_id)
      .single();

    if (!client || !client.email || client.email.includes('@placeholder')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Client has no valid email address' }) };
    }

    // Create portal token for the "Pay Now" link
    const { data: tokenData } = await sb
      .from('client_portal_tokens')
      .insert({ client_id: invoice.client_id })
      .select('token')
      .single();

    const siteUrl = process.env.URL || 'https://heartlandinspectiongroup.netlify.app';
    const portalUrl = `${siteUrl}/client-portal.html?token=${tokenData.token}&scroll=invoice`;

    // Build and send email
    const htmlBody = buildInvoiceEmail(invoice, lineItems || [], client, portalUrl, !!is_reminder);
    const subjectPrefix = is_reminder ? 'Reminder: ' : '';
    const subject = `${subjectPrefix}Invoice ${invoice.invoice_number} from Heartland Inspection Group`;

    await sendEmail({
      to: client.email,
      toName: `${client.first_name} ${client.last_name}`.trim(),
      subject,
      htmlBody,
    });

    // Update invoice status (only promote forward, never demote)
    const updates = { sent_at: new Date().toISOString() };
    if (invoice.status === 'draft') {
      updates.status = 'sent';
    }

    await sb.from('invoices').update(updates).eq('id', invoice_id);

    await sb.from('audit_log').insert({
      inspection_record_id: invoice.inspection_record_id,
      actor_type: 'admin',
      action: is_reminder ? 'invoice_reminder_sent' : 'invoice_sent',
      details: { invoice_id, invoice_number: invoice.invoice_number, to: client.email },
    }).catch(() => {});

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, message: 'Invoice email sent' }),
    };
  } catch (err) {
    console.error('send-invoice error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
