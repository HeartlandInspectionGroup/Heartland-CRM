/**
 * CORS helper — shared origin allowlist for all Netlify functions.
 *
 * Usage:
 *   const { corsHeaders } = require('./lib/cors');
 *
 *   exports.handler = async (event) => {
 *     var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
 *     if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
 *     // ...
 *     return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
 *   };
 */

// Hardcoded fallback allowlist (used if CORS_ORIGINS env var is not set)
var FALLBACK_ORIGINS = [
  'https://heartlandinspectiongroup.com',
  'https://www.heartlandinspectiongroup.com',
  'https://heartland-crm.netlify.app',
  'https://quiet-mousse-ce00ef.netlify.app',
  'http://localhost:3000',
  'http://localhost:8888',
];

function getAllowedOrigins() {
  var envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  return FALLBACK_ORIGINS;
}

function corsHeaders(event) {
  var origin = event && event.headers && (event.headers['origin'] || event.headers['Origin']) || '';

  // No origin = server-to-server call or webhook — allow (no ACAO header needed)
  if (!origin) {
    return {
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, Authorization',
    };
  }

  var allowed = getAllowedOrigins();

  // Exact match
  if (allowed.indexOf(origin) !== -1) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, Authorization',
    };
  }

  // Netlify deploy preview pattern: *--heartland-crm.netlify.app
  if (origin.match(/^https:\/\/[a-z0-9]+-{2}heartland-crm\.netlify\.app$/)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, Authorization',
    };
  }

  // Unknown origin — blocked (no Access-Control-Allow-Origin returned)
  console.warn('[cors] BLOCKED origin:', origin);
  return {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, Authorization',
  };
}

module.exports = { corsHeaders };
