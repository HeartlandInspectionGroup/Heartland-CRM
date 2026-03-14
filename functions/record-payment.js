/**
 * Netlify Function: record-payment
 *
 * Records a manual payment (cash/check) against a booking.
 * Sends a receipt email to the client via Resend.
 * Identity anchor: booking_id — no invoices/payments/clients tables.
 *
 * POST /api/record-payment
 * Body: { booking_id, amount, payment_method, reference_number?, notes? }
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const METHOD_LABELS = { cash: 'Cash', check: 'Check', other: 'Other' };

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Admin auth
  const adminToken = process.env.ADMIN_TOKEN;
  if (event.headers['x-admin-token'] !== adminToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { booking_id, amount, payment_method, reference_number, notes } = body;

  if (!booking_id || !amount || !payment_method) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'booking_id, amount, and payment_method are required' }) };
  }
  if (!['cash', 'check', 'other'].includes(payment_method)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'payment_method must be cash, check, or other' }) };
  }

  try {
    // Fetch booking
    const bRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking_id}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const rows = await bRes.json();
    const booking = rows && rows[0];
    if (!booking) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Booking not found' }) };

    const methodNote = payment_method === 'check' && reference_number
      ? `Check #${reference_number}`
      : METHOD_LABELS[payment_method] || payment_method;

    const paymentNote = [methodNote, notes].filter(Boolean).join(' — ');

    // Update booking as paid
    await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        payment_status:        'paid',
        stripe_transaction_id: paymentNote, // reuse field for offline reference
      })
    });

    // Also update inspection_records (source of truth) — match by booking_id
    await fetch(`${SUPABASE_URL}/rest/v1/inspection_records?booking_id=eq.${booking_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        payment_status: 'paid',
        payment_method: payment_method,
      })
    });

    // Send receipt email if we have an email
    if (RESEND_API_KEY && booking.client_email) {
      const firstName = (booking.client_name || 'there').split(' ')[0];
      const dateStr   = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f4f7;font-family:'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f7;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#15516d;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
    <img src="https://i.imgur.com/I1vTiVT.png" alt="Heartland Inspection Group" style="height:44px;display:block;margin:0 auto 14px;">
    <div style="font-size:20px;color:#fff;font-family:Georgia,serif;font-weight:400;">Payment Receipt</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 40px;">
    <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 24px;">Hi ${esc(firstName)},<br><br>We've received your payment. Thank you!</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6f9;border-radius:10px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:13px;color:#6b7d8a;padding:5px 0;width:130px;">Property</td><td style="font-size:14px;color:#1a2530;font-weight:600;padding:5px 0;">${esc(booking.property_address || '')}</td></tr>
        <tr><td style="font-size:13px;color:#6b7d8a;padding:5px 0;">Amount Paid</td><td style="font-size:14px;color:#27ae60;font-weight:700;padding:5px 0;">${fmt(amount)}</td></tr>
        <tr><td style="font-size:13px;color:#6b7d8a;padding:5px 0;">Method</td><td style="font-size:14px;color:#1a2530;padding:5px 0;">${esc(METHOD_LABELS[payment_method] || payment_method)}${reference_number ? ' #' + esc(reference_number) : ''}</td></tr>
        <tr><td style="font-size:13px;color:#6b7d8a;padding:5px 0;">Date</td><td style="font-size:14px;color:#1a2530;padding:5px 0;">${dateStr}</td></tr>
        ${notes ? `<tr><td style="font-size:13px;color:#6b7d8a;padding:5px 0;">Notes</td><td style="font-size:14px;color:#1a2530;padding:5px 0;">${esc(notes)}</td></tr>` : ''}
      </table>
    </td></tr>
    </table>
    <p style="font-size:14px;color:#6b7d8a;line-height:1.6;margin:0;">Thank you for choosing Heartland Inspection Group!</p>
  </td></tr>
  <tr><td style="background:#15516d;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6);">
      <a href="tel:8153298583" style="color:#f59321;text-decoration:none;">(815) 329-8583</a>
      &nbsp;·&nbsp;
      <a href="mailto:info@heartlandinspectiongroup.com" style="color:rgba(255,255,255,0.6);text-decoration:none;">info@heartlandinspectiongroup.com</a>
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    'Heartland Inspection Group <no-reply@heartlandinspectiongroup.com>',
          to:      [booking.client_email],
          bcc:     ['jake@heartlandinspectiongroup.com'],
          subject: `Payment Received — ${booking.property_address || 'Heartland Inspection Group'}`,
          html,
        })
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('[record-payment] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
