/**
 * Netlify Function: collect-payment-v2
 *
 * Records a payment from the V2 wizard review screen.
 * Supports: card (after client-side Stripe confirm), cash, check.
 *
 * POST body: { record_id, payment_method, stripe_payment_intent_id?, adjusted_amount? }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { writeAuditLog } = require('./write-audit-log');

const { corsHeaders } = require('./lib/cors');

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

// Allow tests to inject a Stripe stub
var _stripe;
function getStripe() {
  if (!_stripe) _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST);
  return _stripe;
}
exports._setStripe = function (s) { _stripe = s; };

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id, payment_method, stripe_payment_intent_id, adjusted_amount } = body;

  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }
  if (!payment_method) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'payment_method required' }) };
  }

  var validMethods = ['card', 'cash', 'check'];
  if (validMethods.indexOf(payment_method) === -1) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'payment_method must be card, cash, or check' }) };
  }

  try {
    // For card payments: verify the PaymentIntent succeeded via Stripe API
    if (payment_method === 'card') {
      if (!stripe_payment_intent_id) {
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'stripe_payment_intent_id required for card payments' }) };
      }

      var pi;
      try {
        pi = await getStripe().paymentIntents.retrieve(stripe_payment_intent_id);
      } catch (stripeErr) {
        return { statusCode: 402, headers: headers, body: JSON.stringify({ error: 'Stripe verification failed: ' + stripeErr.message }) };
      }

      if (pi.status !== 'succeeded') {
        return { statusCode: 402, headers: headers, body: JSON.stringify({ error: 'Payment not completed. Status: ' + pi.status }) };
      }

      var { error: updErr } = await db()
        .from('inspection_records')
        .update({
          payment_status: 'paid',
          payment_method: 'card',
          stripe_payment_id: stripe_payment_intent_id,
        })
        .eq('id', record_id);

      if (updErr) throw updErr;
    }
    // Cash or check
    else if (payment_method === 'cash' || payment_method === 'check') {
      var { error: updErr2 } = await db()
        .from('inspection_records')
        .update({
          payment_status: 'paid',
          payment_method: payment_method,
        })
        .eq('id', record_id);

      if (updErr2) throw updErr2;
    }
    // Price adjustment — update final_total if adjusted_amount provided
    if (adjusted_amount !== undefined && adjusted_amount !== null) {
      var adjNum = Number(adjusted_amount);
      if (!isNaN(adjNum) && adjNum >= 0) {
        // Fetch current final_total for audit log
        var { data: curRec } = await db()
          .from('inspection_records')
          .select('final_total')
          .eq('id', record_id)
          .maybeSingle();

        var originalAmount = curRec ? Number(curRec.final_total || 0) : 0;
        if (adjNum !== originalAmount) {
          await db()
            .from('inspection_records')
            .update({ final_total: adjNum })
            .eq('id', record_id);

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

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('collect-payment-v2 error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
