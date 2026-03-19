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

const { requireAuth } = require('./auth');
const { sendEmail, hasCredentials } = require('./lib/ms-graph');
const { writeAuditLog } = require('./write-audit-log');

const { corsHeaders } = require('./lib/cors');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL     = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

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
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Admin auth
  var authError = await requireAuth(event);
  if (authError) return authError;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { record_id, booking_id, payment_method, payment_notes, stripe_payment_id, amount, cust_name, cust_email, address, adjusted_amount } = body;

  if (!record_id || !payment_method) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id and payment_method required' }) };
  }
  if (!['card', 'cash', 'check'].includes(payment_method)) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'payment_method must be card, cash, or check' }) };
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

    // ── 1b. Price adjustment — update final_total if adjusted ──
    if (adjusted_amount !== undefined && adjusted_amount !== null) {
      var adjNum = Number(adjusted_amount);
      if (!isNaN(adjNum) && adjNum >= 0) {
        var originalAmount = Number(amount || 0);
        if (adjNum !== originalAmount) {
          await sbPatch('inspection_records?id=eq.' + encodeURIComponent(record_id), { final_total: adjNum });
          writeAuditLog({
            record_id: record_id,
            action: 'payment.amount_adjusted',
            category: 'payments',
            actor: 'admin',
            details: { original_amount: originalAmount, adjusted_amount: adjNum },
          });
        }
      }
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
      details:   { method: payment_method, amount: amount },
    });

    // ── 3. Send receipt email (non-fatal) ──
    if (cust_email && hasCredentials()) {
      try {
        var firstName = (cust_name || 'there').split(' ')[0];
        var methodLabel = { card: 'Credit/Debit Card', cash: 'Cash', check: 'Check' }[payment_method] || payment_method;
        var dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        var invoiceUrl = SITE_URL + '/invoice-receipt.html?id=' + record_id;

        var { emailWrap, emailBtn, emailInfoTable, esc: escT } = require('./lib/email-template');
        var { resolveTemplate } = require('./lib/template-utils');
        var tplVars = { client_name: cust_name || '', address: address || '', amount: fmt(amount), date: dateStr, method: methodLabel };
        var tpl = await resolveTemplate('field_payment_receipt', { subject: 'Payment Received — Heartland Inspection Group', body: 'Payment received — thank you! Here are your details:' }, tplVars);
        var bodyHtml = ''
          + '<div style="padding:32px 40px 8px;">'
          + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:16px;color:#1a2530;margin:0 0 12px;">Hi ' + esc(firstName) + ',</p>'
          + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 24px;">' + esc(tpl.body) + '</p>'
          + '</div>'
          + '<div style="padding:0 40px 24px;">'
          + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">'
          + '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:130px;">Property</td><td style="padding:14px 16px;font-size:14px;color:#1a2530;font-weight:600;border-bottom:1px solid #e5e7eb;">' + esc(address || '') + '</td></tr>'
          + '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Amount Paid</td><td style="padding:14px 16px;font-size:16px;color:#27ae60;font-weight:700;border-bottom:1px solid #e5e7eb;">' + fmt(amount) + '</td></tr>'
          + '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Method</td><td style="padding:14px 16px;font-size:14px;color:#1a2530;border-bottom:1px solid #e5e7eb;">' + esc(methodLabel) + '</td></tr>'
          + '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;' + (stripe_payment_id ? 'border-bottom:1px solid #e5e7eb;' : '') + '">Date</td><td style="padding:14px 16px;font-size:14px;color:#1a2530;' + (stripe_payment_id ? 'border-bottom:1px solid #e5e7eb;' : '') + '">' + dateStr + '</td></tr>'
          + (stripe_payment_id ? '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;">Transaction</td><td style="padding:14px 16px;font-size:12px;color:#6b7280;word-break:break-all;">' + esc(stripe_payment_id) + '</td></tr>' : '')
          + '</table>'
          + '</div>'
          + '<div style="padding:0 40px 32px;text-align:center;">'
          + emailBtn(invoiceUrl, 'View Your Invoice')
          + '</div>';
        var html = emailWrap({ subtitle: 'Payment Receipt' }, bodyHtml);

        await sendEmail({
          to:       cust_email,
          toName:   cust_name || '',
          subject:  tpl.subject,
          htmlBody: html,
        });
        console.log('[record-field-payment] Receipt email sent to', (cust_email || '').replace(/^(.).*@/, '$1***@'));
      } catch(emailErr) {
        console.error('[record-field-payment] Email failed (non-fatal):', emailErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ success: true }),
    };

  } catch(err) {
    console.error('[record-field-payment] Error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
