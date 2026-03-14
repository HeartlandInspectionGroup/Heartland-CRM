/**
 * Netlify Function: stripe-webhook
 *
 * Handles Stripe webhook events. Verifies the signature, then processes
 * checkout.session.completed events to record payments and update invoices.
 *
 * POST /api/stripe-webhook
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

function round2(n) { return Math.round(n * 100) / 100; }

exports.handler = async function (event) {
  // Stripe webhooks are always POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error('stripe-webhook: Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return { statusCode: 500, body: 'Stripe not configured' };
  }

  const stripe = require('stripe')(stripeKey);

  // Verify webhook signature
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    // Netlify provides the raw body; if base64 encoded, decode it
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const sb = getSupabase();
  if (!sb) {
    console.error('stripe-webhook: Supabase not configured');
    return { statusCode: 500, body: 'Database not configured' };
  }

  // ── Handle checkout.session.completed ──
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const invoiceId = session.metadata && session.metadata.invoice_id;

    if (!invoiceId) {
      console.warn('checkout.session.completed without invoice_id in metadata');
      return { statusCode: 200, body: 'OK (no invoice_id)' };
    }

    // Idempotency check: skip if payment already recorded for this payment intent
    const paymentIntentId = session.payment_intent;
    if (paymentIntentId) {
      const { data: existing } = await sb
        .from('payments')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

      if (existing) {
        console.log('Payment already recorded for', paymentIntentId);
        return { statusCode: 200, body: 'OK (already processed)' };
      }
    }

    // Fetch invoice
    const { data: invoice } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (!invoice) {
      console.error('Invoice not found:', invoiceId);
      return { statusCode: 200, body: 'OK (invoice not found)' };
    }

    // Determine payment method type
    let paymentMethod = 'stripe_card';
    if (paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.payment_method_types && pi.payment_method_types.includes('venmo')) {
          paymentMethod = 'stripe_venmo';
        }
        // Check the actual charge for the payment method
        if (pi.latest_charge) {
          const charge = await stripe.charges.retrieve(pi.latest_charge);
          if (charge.payment_method_details) {
            const pmType = charge.payment_method_details.type;
            if (pmType === 'venmo' || pmType === 'cashapp') {
              paymentMethod = 'stripe_venmo';
            }
          }
        }
      } catch (e) {
        console.warn('Could not retrieve payment intent details:', e.message);
      }
    }

    // Get charge details for receipt URL
    let chargeId = null;
    let receiptUrl = null;
    if (paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        chargeId = pi.latest_charge || null;
        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId);
          receiptUrl = charge.receipt_url || null;
        }
      } catch (e) {
        console.warn('Could not retrieve charge details:', e.message);
      }
    }

    const amountPaid = round2((session.amount_total || 0) / 100);

    // Calculate tax portion
    const taxPortion = Number(invoice.total) > 0
      ? round2(amountPaid * (Number(invoice.tax_amount) / Number(invoice.total)))
      : 0;

    // Record payment
    await sb.from('payments').insert({
      invoice_id: invoiceId,
      amount: amountPaid,
      payment_method: paymentMethod,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      stripe_receipt_url: receiptUrl,
      status: 'completed',
      tax_amount: taxPortion,
      recorded_by: 'stripe_webhook',
    });

    // Update invoice
    const newAmountPaid = round2(Number(invoice.amount_paid || 0) + amountPaid);
    const newBalanceDue = round2(Number(invoice.total) - newAmountPaid);
    const invoiceUpdates = {
      amount_paid: newAmountPaid,
      balance_due: Math.max(0, newBalanceDue),
      stripe_payment_intent_id: paymentIntentId,
    };
    if (newBalanceDue <= 0) {
      invoiceUpdates.status = 'paid';
      invoiceUpdates.paid_at = new Date().toISOString();
    } else {
      invoiceUpdates.status = 'partially_paid';
    }

    await sb.from('invoices').update(invoiceUpdates).eq('id', invoiceId);

    // Audit log
    await sb.from('audit_log').insert({
      record_id:  invoice.inspection_record_id || null,
      action:     'payment.stripe_webhook',
      category:   'payments',
      actor:      'system',
      details: {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        amount: amountPaid,
        method: paymentMethod,
        stripe_payment_intent_id: paymentIntentId,
      },
    }).catch(() => {});

    console.log(`Payment recorded: ${invoice.invoice_number} - $${amountPaid} via ${paymentMethod}`);
    return { statusCode: 200, body: 'OK' };
  }

  // ── Handle charge.refunded ──
  if (stripeEvent.type === 'charge.refunded') {
    const charge = stripeEvent.data.object;
    const paymentIntentId = charge.payment_intent;

    if (paymentIntentId) {
      // Find the payment record
      const { data: payment } = await sb
        .from('payments')
        .select('*, invoices(*)')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

      if (payment) {
        const refundedAmount = round2((charge.amount_refunded || 0) / 100);
        const newStatus = refundedAmount >= Number(payment.amount) ? 'refunded' : 'partially_refunded';

        await sb.from('payments').update({
          refund_amount: refundedAmount,
          refunded_at: new Date().toISOString(),
          status: newStatus,
        }).eq('id', payment.id);

        console.log(`Refund recorded: $${refundedAmount} for payment ${payment.id}`);
      }
    }

    return { statusCode: 200, body: 'OK' };
  }

  // Return 200 for all other event types (Stripe retries on non-200)
  return { statusCode: 200, body: 'OK (unhandled event type)' };
};
