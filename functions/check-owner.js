/**
 * Netlify Function: check-owner
 *
 * Checks if the authenticated user is the account owner.
 * GET, requires Authorization: Bearer <JWT>
 * Returns { isOwner: true/false }
 */

const { createClient } = require('@supabase/supabase-js');
const { corsHeaders } = require('./lib/cors');

var _sb;
function db() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _sb;
}

exports._setClient = function (c) { _sb = c; };

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  var authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  var jwt = authHeader.substring(7);
  try {
    var { data, error } = await db().auth.getUser(jwt);
    if (error || !data || !data.user || !data.user.email) {
      console.error('check-owner: getUser failed —', error ? error.message : 'no user/email in response');
      return { statusCode: 200, headers, body: JSON.stringify({ isOwner: false }) };
    }

    var ownerEmail = (process.env.OWNER_EMAIL || '').trim();
    var jwtEmail = data.user.email.toLowerCase().trim();
    console.error('check-owner DEBUG — jwt email:', jwtEmail, '| OWNER_EMAIL env:', ownerEmail);
    var isOwner = ownerEmail && jwtEmail === ownerEmail.toLowerCase();

    return { statusCode: 200, headers, body: JSON.stringify({ isOwner: isOwner }) };
  } catch (err) {
    console.error('check-owner error:', err);
    return { statusCode: 200, headers, body: JSON.stringify({ isOwner: false }) };
  }
};
