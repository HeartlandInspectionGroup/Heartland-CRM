/**
 * Netlify Function: stripe-status
 *
 * Checks whether Stripe API keys are configured and valid.
 * Returns connection status without exposing any secrets.
 *
 * GET /api/stripe-status
 */

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('[stripe-status] Checking connection — key present:', !!stripeKey, '| webhook secret present:', !!webhookSecret);

  if (!stripeKey) {
    console.log('[stripe-status] No STRIPE_SECRET_KEY configured');
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        connected: false,
        message: 'STRIPE_SECRET_KEY not configured',
        webhook: false,
      }),
    };
  }

  try {
    const stripe = require('stripe')(stripeKey);
    const mode = stripeKey.startsWith('sk_live') ? 'live' : 'test';
    console.log('[stripe-status] Verifying key (mode: %s)...', mode);
    // Light API call to verify the key works
    const account = await stripe.account.retrieve();
    const accountName = account.settings?.dashboard?.display_name || account.business_profile?.name || null;
    console.log('[stripe-status] Connected — account: %s | mode: %s | webhook: %s', accountName || '(unnamed)', mode, !!webhookSecret);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        connected: true,
        mode,
        account_name: accountName,
        webhook: !!webhookSecret,
      }),
    };
  } catch (err) {
    console.error('[stripe-status] Connection failed:', err.message);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        connected: false,
        message: 'Invalid API key or Stripe error',
        webhook: !!webhookSecret,
      }),
    };
  }
};
