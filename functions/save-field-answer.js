/**
 * Netlify Function: save-field-answer
 * Upserts a structured answer for a wizard field on an inspection record.
 * POST body: { record_id, field_id, question_id?, selected_value, text_value? }
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

  var { record_id, field_id, question_id, selected_value, text_value } = body;
  if (!record_id || !field_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'record_id and field_id required' }) };

  try {
    var row = {
      record_id: record_id,
      field_id: field_id,
      selected_value: selected_value || null,
      text_value: text_value || null,
      updated_at: new Date().toISOString(),
    };
    if (question_id) row.question_id = question_id;

    // Use partial unique indexes — upsert manually: delete then insert
    var delQuery = db().from('inspection_field_answers')
      .delete()
      .eq('record_id', record_id)
      .eq('field_id', field_id);
    if (question_id) {
      delQuery = delQuery.eq('question_id', question_id);
    } else {
      delQuery = delQuery.is('question_id', null);
    }
    await delQuery;

    var { data, error } = await db().from('inspection_field_answers')
      .insert(row)
      .select('id')
      .single();

    if (error) throw error;
    return { statusCode: 200, headers, body: JSON.stringify({ id: data.id }) };
  } catch (err) {
    console.error('save-field-answer error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
