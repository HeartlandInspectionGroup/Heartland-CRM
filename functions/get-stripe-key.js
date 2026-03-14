const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const key = process.env.STRIPE_PUBLISHABLE_KEY_TEST;
  if (!key) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Stripe publishable key not configured' }) };
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ key }) };
};
