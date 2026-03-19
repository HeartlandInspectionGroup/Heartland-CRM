/**
 * Netlify Function: save-field-questions
 * Replaces all wizard_field_questions + their options for a field.
 * POST body: { field_id, questions: [{ label, order_index, options: [{ label, value, requires_text }] }] }
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

  var { field_id, questions } = body;
  if (!field_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'field_id required' }) };
  if (!Array.isArray(questions)) questions = [];

  try {
    // Delete existing questions (cascades to their options via FK)
    var { error: delErr } = await db().from('wizard_field_questions').delete().eq('field_id', field_id);
    if (delErr) throw delErr;

    // Also delete question-level options (question_id IS NOT NULL for this field)
    await db().from('wizard_field_options').delete().eq('field_id', field_id).not('question_id', 'is', null);

    // Insert questions and their options
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var { data: qRow, error: qErr } = await db().from('wizard_field_questions')
        .insert({ field_id: field_id, label: q.label || '', order_index: q.order_index !== undefined ? q.order_index : i, active: true })
        .select('id')
        .single();
      if (qErr) throw qErr;

      // Insert options for this question
      var opts = q.options || [];
      if (opts.length) {
        var optRows = opts.map(function (o, idx) {
          return {
            field_id: field_id,
            question_id: qRow.id,
            label: o.label || '',
            value: o.value || '',
            requires_text: !!o.requires_text,
            order_index: idx,
            active: true,
          };
        });
        var { error: oErr } = await db().from('wizard_field_options').insert(optRows);
        if (oErr) throw oErr;
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: questions.length }) };
  } catch (err) {
    console.error('save-field-questions error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
