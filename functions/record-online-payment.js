/**
 * Netlify Function: record-online-payment
 *
 * Called by invoice.html after Stripe PaymentIntent succeeds.
 * Updates inspection_records only — that is the single source of truth.
 *
 * POST body: { booking_id, stripe_payment_intent_id }
 */

const { createClient } = require('@supabase/supabase-js');
const { writeAuditLog } = require('./write-audit-log');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { booking_id, stripe_payment_intent_id } = body;
  if (!booking_id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'booking_id required' }) };

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const SITE_URL = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

  try {
    // Find the inspection record by booking_id
    const { data: records, error: findErr } = await sb
      .from('inspection_records')
      .select('id, cust_email, invoice_url')
      .eq('booking_id', booking_id)
      .limit(1);

    if (findErr) throw findErr;
    const record = records && records[0];

    if (!record) {
      console.error('record-online-payment: no inspection record found for booking_id', booking_id);
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'No inspection record found for this booking' }) };
    }

    // Build invoice URL if not already set
    const invoiceUrl = record.invoice_url || (SITE_URL + '/invoice-receipt.html?id=' + record.id);

    // Update inspection_records — single source of truth
    const { error: updateErr } = await sb
      .from('inspection_records')
      .update({
        payment_status:    'paid',
        payment_method:    'stripe_online',
        stripe_payment_id: stripe_payment_intent_id || null,
        invoice_url:       invoiceUrl,
      })
      .eq('id', record.id);

    if (updateErr) throw updateErr;

    // ── Audit log (fire and forget) ──
    writeAuditLog({
      record_id: record.id,
      action:    'payment.online',
      category:  'payments',
      actor:     'client',
      details:   { method: 'stripe_online', stripe_payment_intent_id: stripe_payment_intent_id || null },
    });

    // Also mark booking paid for admin reference
    await sb
      .from('bookings')
      .update({ payment_status: 'paid', stripe_transaction_id: stripe_payment_intent_id || null })
      .eq('id', booking_id);

    // Look up portal token — upsert if missing so redirect always works
    let portalToken = null;
    if (record.cust_email) {
      const { data: tokenRows } = await sb
        .from('client_portal_tokens')
        .select('token')
        .eq('client_email', record.cust_email)
        .limit(1);
      if (tokenRows && tokenRows[0]) {
        portalToken = tokenRows[0].token;
      } else {
        // No token exists — generate and insert a fresh one
        const freshToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const { error: tokErr } = await sb
          .from('client_portal_tokens')
          .insert({ token: freshToken, client_email: record.cust_email, client_name: '', booking_id: booking_id });
        if (!tokErr) {
          portalToken = freshToken;
          console.log('record-online-payment: generated fresh portal token for', record.cust_email);
        } else {
          console.error('record-online-payment: token insert failed', tokErr);
        }
      }
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        ok: true,
        portal_token: portalToken,
        portal_url: portalToken ? SITE_URL + '/client-portal.html?token=' + portalToken : null,
      }),
    };
  } catch (err) {
    console.error('record-online-payment error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
