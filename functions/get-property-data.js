/**
 * Netlify Function: get-property-data
 *
 * Receives an inspection address, calls Rentcast API server-side,
 * returns yearBuilt and sqft for agent portal pre-fill.
 *
 * GET /.netlify/functions/get-property-data?address=123+Main+St,+Rockford,+IL+61101
 *
 * Response (success):
 *   { yearBuilt: 1998, sqft: 2100 }
 * Response (not found):
 *   { yearBuilt: null, sqft: null }
 */

const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;

const { corsHeaders } = require('./lib/cors');
exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const address = (event.queryStringParameters || {}).address || '';
  if (!address.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'address required' }) };
  }

  if (!RENTCAST_API_KEY) {
    console.warn('get-property-data: RENTCAST_API_KEY not set');
    return { statusCode: 200, headers, body: JSON.stringify({ yearBuilt: null, sqft: null }) };
  }

  try {
    const url = 'https://api.rentcast.io/v1/properties?address=' + encodeURIComponent(address) + '&limit=1';
    const res = await fetch(url, {
      headers: {
        'X-Api-Key': RENTCAST_API_KEY,
        'Accept': 'application/json',
      }
    });

    if (!res.ok) {
      console.warn('get-property-data: Rentcast returned', res.status);
      return { statusCode: 200, headers, body: JSON.stringify({ yearBuilt: null, sqft: null }) };
    }

    const data = await res.json();
    // /v1/properties always returns an array
    const prop = Array.isArray(data) ? data[0] : data;

    if (!prop) {
      console.warn('get-property-data: no property found for address:', address);
      return { statusCode: 200, headers, body: JSON.stringify({ yearBuilt: null, sqft: null }) };
    }

    // Log raw values so we can see exactly what Rentcast returns
    console.log('get-property-data raw fields — yearBuilt:', prop.yearBuilt, '| squareFootage:', prop.squareFootage, '| buildingSize:', prop.buildingSize);

    // Rentcast /v1/properties schema: squareFootage is the correct field name.
    // buildingSize is included as a secondary fallback (some older records use it).
    const sqft = prop.squareFootage != null ? prop.squareFootage
               : prop.buildingSize  != null ? prop.buildingSize
               : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        yearBuilt: prop.yearBuilt != null ? prop.yearBuilt : null,
        sqft: sqft,
      })
    };
  } catch (err) {
    console.error('get-property-data error:', err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ yearBuilt: null, sqft: null }) };
  }
};
