/**
 * Netlify Function: record-field-payment
 *
 * Records a field payment (card/cash/check) collected on-site by admin/inspector.
 * Writes to inspection_records (source of truth) AND mirrors to bookings.
 * Sends a payment receipt email to the client.
 *
 * POST body: {
 *   record_id, booking_id?, payment_method, payment_notes,
 *   stripe_payment_id?, amount, cust_name, cust_email, address
 * }
 */

const { sendEmail, hasCredentials } = require('./lib/ms-graph');
const { writeAuditLog } = require('./write-audit-log');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL     = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
};

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function sbPatch(path, body) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  return res;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Admin auth
  var adminToken = process.env.ADMIN_TOKEN;
  if (event.headers['x-admin-token'] !== adminToken) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { record_id, booking_id, payment_method, payment_notes, stripe_payment_id, amount, cust_name, cust_email, address } = body;

  if (!record_id || !payment_method) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'record_id and payment_method required' }) };
  }
  if (!['card', 'cash', 'check'].includes(payment_method)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'payment_method must be card, cash, or check' }) };
  }

  try {
    // ── 1. Update inspection_records (source of truth) ──
    var recUpdates = {
      payment_status: 'paid',
      payment_method: payment_method,
    };
    if (stripe_payment_id) recUpdates.stripe_payment_id = stripe_payment_id;

    var recRes = await sbPatch('inspection_records?id=eq.' + encodeURIComponent(record_id), recUpdates);
    if (!recRes.ok) {
      var errText = await recRes.text();
      throw new Error('Failed to update inspection record: ' + errText);
    }

    // ── 2. Mirror to bookings ──
    if (booking_id) {
      var bkUpdates = {
        payment_status: 'paid',
      };
      if (stripe_payment_id) bkUpdates.stripe_transaction_id = stripe_payment_id;
      await sbPatch('bookings?id=eq.' + encodeURIComponent(booking_id), bkUpdates);
    }

    console.log('[record-field-payment] Recorded:', payment_method, 'for record', record_id, 'booking', booking_id || 'n/a');

    // ── Audit log (fire and forget) ──
    writeAuditLog({
      record_id: record_id,
      action:    'payment.field',
      category:  'payments',
      actor:     'admin',
      details:   { method: payment_method, amount: amount, address: address, client: cust_name },
    });

    // ── 3. Send receipt email (non-fatal) ──
    if (cust_email && hasCredentials()) {
      try {
        var firstName = (cust_name || 'there').split(' ')[0];
        var methodLabel = { card: 'Credit/Debit Card', cash: 'Cash', check: 'Check' }[payment_method] || payment_method;
        var dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        var invoiceUrl = SITE_URL + '/invoice-receipt.html?id=' + record_id;

        var html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Barlow',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:linear-gradient(135deg,#121e30,#1a2a44);border-radius:14px 14px 0 0;padding:28px 40px;text-align:center;">
    <img src="https://i.imgur.com/I1vTiVT.png" alt="Heartland Inspection Group" style="height:44px;display:block;margin:0 auto 14px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-bottom:6px;">Payment Receipt</div>
    <div style="font-family:'Georgia',serif;font-size:22px;color:#fff;">Thank you, ${esc(firstName)}!</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 40px;">
    <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 24px;">Your payment has been received and recorded. Here are your details:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;border-radius:10px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#8a9ab0;padding:5px 0;width:140px;">Property</td><td style="font-size:14px;color:#1a2a44;font-weight:600;padding:5px 0;">${esc(address || '')}</td></tr>
        <tr><td style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#8a9ab0;padding:5px 0;">Amount Paid</td><td style="font-size:16px;color:#27ae60;font-weight:700;padding:5px 0;">${fmt(amount)}</td></tr>
        <tr><td style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#8a9ab0;padding:5px 0;">Method</td><td style="font-size:14px;color:#1a2a44;padding:5px 0;">${esc(methodLabel)}</td></tr>
        <tr><td style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#8a9ab0;padding:5px 0;">Date</td><td style="font-size:14px;color:#1a2a44;padding:5px 0;">${dateStr}</td></tr>
        ${stripe_payment_id ? `<tr><td style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#8a9ab0;padding:5px 0;">Transaction</td><td style="font-size:12px;color:#8a9ab0;padding:5px 0;word-break:break-all;">${esc(stripe_payment_id)}</td></tr>` : ''}
      </table>
    </td></tr>
    </table>
    <p style="font-size:14px;color:#6b7d8a;line-height:1.6;margin:0 0 20px;">
      You can view your invoice and inspection details at any time:
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr><td style="background:#1a2a44;border-radius:8px;padding:12px 28px;">
        <a href="${invoiceUrl}" style="color:#fff;text-decoration:none;font-size:14px;font-weight:700;font-family:'Barlow Condensed',sans-serif;letter-spacing:0.5px;">View Invoice Receipt →</a>
      </td></tr>
    </table>
    <p style="font-size:14px;color:#6b7d8a;line-height:1.6;margin:0;">Thank you for choosing Heartland Inspection Group!</p>
  </td></tr>
  <tr><td style="background:linear-gradient(135deg,#121e30,#1a2a44);border-radius:0 0 14px 14px;padding:20px 40px;text-align:center;">
    <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.5);">Questions? We're here to help.</p>
    <p style="margin:0;font-size:13px;">
      <a href="tel:8153298583" style="color:#f59321;text-decoration:none;font-weight:700;">(815) 329-8583</a>
      &nbsp;·&nbsp;
      <a href="mailto:info@heartlandinspectiongroup.com" style="color:rgba(255,255,255,0.55);text-decoration:none;">info@heartlandinspectiongroup.com</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

        await sendEmail({
          to:       cust_email,
          toName:   cust_name || '',
          subject:  'Payment Received — Heartland Inspection Group',
          htmlBody: html,
        });
        console.log('[record-field-payment] Receipt email sent to', cust_email);
      } catch(emailErr) {
        console.error('[record-field-payment] Email failed (non-fatal):', emailErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ success: true }),
    };

  } catch(err) {
    console.error('[record-field-payment] Error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
