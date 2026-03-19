/**
 * Netlify Function: create-payment
 *
 * Creates a Stripe PaymentIntent.
 * Called from:
 *   - inspector-wizard.html (uses tier-based amount, requires admin token)
 *   - invoice.html (uses booking_id + amount_cents from booking record, no auth needed)
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST);
const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');
// Tier amounts for wizard use (cents)
const TIER_AMOUNTS = {
  Standard:  22500,
  Premium:   35000,
  Signature: 47500,
};

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  var parsed;
  try { parsed = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { tier, booking_id, amount_cents, clientName, clientEmail, clientPhone, address } = parsed;

  var amount;
  var description;
  var metadata = { clientName: clientName || '', clientEmail: clientEmail || '', clientPhone: clientPhone || '' };

  // Path A: invoice.html — real amount from booking
  if (booking_id && amount_cents) {
    amount = Math.round(amount_cents);
    if (amount < 50) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid amount' }) };
    description = 'Home Inspection — ' + (address || 'Heartland Inspection Group');
    metadata.booking_id = booking_id;
    metadata.address = address || '';
  }
  // Path B: inspector wizard — uses actual final_total amount, falls back to tier
  else if (tier || amount_cents) {
    var authError = await requireAuth(event);
    if (authError) return authError;
    amount = amount_cents ? Math.round(amount_cents) : TIER_AMOUNTS[tier];
    if (!amount || amount < 50) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid amount or tier' }) };
    description = (tier || 'Inspection') + ' — Heartland Inspection Group';
    metadata.tier = tier || '';
  }
  else {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Provide booking_id+amount_cents or tier' }) };
  }

  try {
    var paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      description,
      receipt_email: clientEmail || undefined,
      metadata,
    });

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch(err) {
    console.error('Stripe error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
