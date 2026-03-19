/**
 * Netlify Function: Address Autocomplete Proxy
 * Proxies Nominatim geocoding requests server-side to add the required User-Agent header.
 * Browser fetch cannot set User-Agent, so this avoids Nominatim's 403 responses.
 *
 * Route: /api/address-autocomplete?q=QUERY
 */
const https = require('https');

const { corsHeaders } = require('./lib/cors');

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const q = (event.queryStringParameters || {}).q || '';
  if (!q || q.length < 5) {
    return { statusCode: 200, headers: headers, body: JSON.stringify([]) };
  }

  const url = 'https://nominatim.openstreetmap.org/search'
    + '?q=' + encodeURIComponent(q)
    + '&format=jsonv2'
    + '&addressdetails=1'
    + '&countrycodes=us'
    + '&layer=address'
    + '&limit=6';

  try {
    const data = await new Promise(function (resolve, reject) {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'HeartlandInspectionGroup/1.0',
          'Accept': 'application/json'
        }
      }, function (res) {
        let body = '';
        res.on('data', function (chunk) { body += chunk; });
        res.on('end', function () {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('Invalid JSON from Nominatim')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, function () { req.destroy(); reject(new Error('Nominatim timeout')); });
    });

    return { statusCode: 200, headers: headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
