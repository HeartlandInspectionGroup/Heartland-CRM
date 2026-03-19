/**
 * Netlify Function: save-field-options
 * Replaces all wizard_field_options for a field — delete existing, insert new set.
 * POST body: { field_id, options: [{ label, value, requires_text, order_index }] }
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');

var _sb;
function db() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _sb;
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  var authErr = await requireAuth(event);
  if (authErr) return authErr;
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var { field_id, options } = body;
  if (!field_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'field_id required' }) };
  if (!Array.isArray(options)) options = [];

  try {
    // Delete existing options for this field
    var { error: delErr } = await db().from('wizard_field_options').delete().eq('field_id', field_id);
    if (delErr) throw delErr;

    // Insert new set
    if (options.length) {
      var rows = options.map(function (o, idx) {
        return {
          field_id: field_id,
          label: o.label || '',
          value: o.value || '',
          requires_text: !!o.requires_text,
          order_index: o.order_index !== undefined ? o.order_index : idx,
          active: true,
        };
      });
      var { error: insErr } = await db().from('wizard_field_options').insert(rows);
      if (insErr) throw insErr;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: options.length }) };
  } catch (err) {
    console.error('save-field-options error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
