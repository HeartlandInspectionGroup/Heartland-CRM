/**
 * Netlify Function: create-checkout-session
 *
 * Creates a Stripe Checkout Session for an invoice. Returns the redirect URL.
 * Supports card and Venmo payment methods.
 *
 * POST /api/create-checkout-session
 * Body: { invoice_id }
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY
 */

const { createClient } = require('@supabase/supabase-js');

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

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { invoice_id } = JSON.parse(event.body);
    if (!invoice_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'invoice_id required' }) };
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe not configured' }) };
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sb = getSupabase();
    if (!sb) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };
    }

    // Fetch invoice
    const { data: invoice, error: invErr } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (invErr || !invoice) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invoice not found' }) };
    }

    if (invoice.status === 'paid' || invoice.status === 'void') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invoice is ' + invoice.status }) };
    }

    if (Number(invoice.balance_due) <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No balance due' }) };
    }

    // Fetch line items for Stripe line item display
    const { data: lineItems } = await sb
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice_id)
      .order('sort_order');

    // Fetch client email
    const { data: client } = await sb
      .from('clients')
      .select('email, first_name, last_name')
      .eq('id', invoice.client_id)
      .single();

    // Build Stripe line items from invoice line items
    // We pass the balance_due as a single line item to handle partial payments cleanly
    const stripeLineItems = (lineItems || [])
      .filter(li => li.total !== 0) // skip zero-amount items
      .map(li => ({
        price_data: {
          currency: 'usd',
          product_data: { name: li.description },
          unit_amount: Math.round(Math.abs(li.total) * 100), // Stripe uses cents
        },
        quantity: li.quantity || 1,
        // Stripe doesn't support negative amounts in line items
        // Discounts will be handled as a single total via adjustments
      }));

    // For simplicity and accuracy, use a single line item with the balance due
    // This ensures the Stripe total always matches exactly
    const siteUrl = process.env.URL || 'https://heartlandinspectiongroup.netlify.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'], // Add 'venmo' when enabled in Stripe Dashboard
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.invoice_number} — Home Inspection`,
            description: `Heartland Inspection Group`,
          },
          unit_amount: Math.round(Number(invoice.balance_due) * 100),
        },
        quantity: 1,
      }],
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      },
      customer_email: (client && client.email && !client.email.includes('@placeholder')) ? client.email : undefined,
      success_url: `${siteUrl}/client-portal.html?payment=success&invoice_id=${invoice_id}`,
      cancel_url: `${siteUrl}/client-portal.html?payment=cancelled&invoice_id=${invoice_id}`,
    });

    // Save session ID on invoice
    await sb.from('invoices').update({
      stripe_checkout_session_id: session.id,
    }).eq('id', invoice_id);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, url: session.url }),
    };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
