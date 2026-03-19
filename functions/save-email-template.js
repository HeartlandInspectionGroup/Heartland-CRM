/**
 * Netlify Function: save-email-template
 * Updates an email template's subject and body by template_key.
 * POST body: { template_key, subject, body }
 */

const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var authError = await requireAuth(event);
  if (authError) return authError;

  var parsed;
  try { parsed = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { template_key, subject, body } = parsed;
  if (!template_key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'template_key required' }) };

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/email_templates?template_key=eq.' + encodeURIComponent(template_key), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ subject: subject, body: body, updated_at: new Date().toISOString() }),
    });
    var data = await res.json();
    if (!res.ok || !data || !data.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Template not found: ' + template_key }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, template: data[0] }) };
  } catch (err) {
    console.error('save-email-template error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
