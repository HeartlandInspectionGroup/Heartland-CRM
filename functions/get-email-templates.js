/**
 * Netlify Function: get-email-templates
 * Returns all email template rows using service role (RLS bypass).
 * GET — no params needed.
 */

const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var authError = await requireAuth(event);
  if (authError) return authError;

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/email_templates?select=template_key,subject,body,default_subject,default_body&order=template_key', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    var rows = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ templates: Array.isArray(rows) ? rows : [] }) };
  } catch (err) {
    console.error('get-email-templates error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
