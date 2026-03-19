// ─────────────────────────────────────────────
//  auth.js — shared authentication helper
//
//  USAGE in any protected function:
//
//    const { requireAuth } = require('./auth');
//
//    exports.handler = async (event) => {
//      const authError = await requireAuth(event);
//      if (authError) return authError;
//      // ... rest of your function
//    };
//
//  Supports two auth methods (dual-auth during migration):
//    1. x-admin-token header (legacy — static token)
//    2. Authorization: Bearer <JWT> header (new — Supabase JWT)
//
//  Both methods return null (auth passed) during migration.
//  Phase 3 will remove x-admin-token support.
// ─────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const { corsHeaders } = require('./lib/cors');

var _authClient;
function getAuthClient() {
  if (!_authClient) {
    _authClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _authClient;
}

async function requireAuth(event) {
  // Always allow preflight OPTIONS requests through
  if (event.httpMethod === 'OPTIONS') return null;

  // Method 1: Legacy x-admin-token (static string comparison)
  var adminToken = process.env.ADMIN_TOKEN;
  if (adminToken && event.headers['x-admin-token'] === adminToken) {
    return null; // auth passed
  }

  // Method 2: Supabase JWT via Authorization: Bearer header
  var authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    var jwt = authHeader.substring(7);
    if (jwt) {
      try {
        var sb = getAuthClient();
        var { data, error } = await sb.auth.getUser(jwt);
        if (!error && data && data.user) {
          return null; // auth passed — valid Supabase user
        }
        if (error) {
          console.error('[requireAuth] JWT rejected:', error.message, '| JWT prefix:', jwt.substring(0, 20) + '...');
        }
      } catch (e) {
        console.error('[requireAuth] JWT validation exception:', e.message);
      }
    }
  } else {
    console.error('[requireAuth] No valid auth header. x-admin-token present:', !!event.headers['x-admin-token'], '| Authorization present:', !!authHeader, '| ADMIN_TOKEN env set:', !!adminToken);
  }

  // Neither auth method passed
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  return {
    statusCode: 401,
    headers: headers,
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}

module.exports = { requireAuth };
