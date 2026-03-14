// ─────────────────────────────────────────────
//  auth.js — shared token check helper
//
//  USAGE in any new protected function:
//
//    const { requireAuth } = require('./auth');
//
//    exports.handler = async (event) => {
//      const authError = requireAuth(event);
//      if (authError) return authError;
//      // ... rest of your function
//    };
//
//  That's it. If the request has no valid token it
//  returns a 401 immediately and your code never runs.
// ─────────────────────────────────────────────

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function requireAuth(event) {
  // Always allow preflight OPTIONS requests through
  if (event.httpMethod === 'OPTIONS') return null;

  const adminToken = process.env.ADMIN_TOKEN;
  if (event.headers['x-admin-token'] !== adminToken) {
    return {
      statusCode: 401,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  // Return null means "auth passed, continue"
  return null;
}

module.exports = { requireAuth };
