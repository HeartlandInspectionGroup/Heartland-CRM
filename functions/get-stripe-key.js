const { corsHeaders } = require('./lib/cors');
exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const key = process.env.STRIPE_PUBLISHABLE_KEY_TEST;
  if (!key) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Stripe publishable key not configured' }) };
  }

  return { statusCode: 200, headers: headers, body: JSON.stringify({ key }) };
};
