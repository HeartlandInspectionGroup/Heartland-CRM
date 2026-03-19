const { corsHeaders } = require('./lib/cors');

exports.handler = async (event) => {
  var headers = { ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  var address = (event.queryStringParameters || {}).address;
  if (!address) {
    return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'address required' }) };
  }

  var key = process.env.GOOGLE_STREET_VIEW_KEY;
  if (!key) {
    return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'street view not configured' }) };
  }

  var url = 'https://maps.googleapis.com/maps/api/streetview?size=800x300&location='
    + encodeURIComponent(address) + '&key=' + key;

  try {
    var res = await fetch(url);
    if (!res.ok) {
      return { statusCode: res.status, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'street view request failed' }) };
    }

    var buffer = Buffer.from(await res.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('[street-view] fetch error:', err.message);
    return { statusCode: 502, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'upstream error' }) };
  }
};
