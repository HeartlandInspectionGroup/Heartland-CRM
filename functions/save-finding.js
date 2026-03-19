const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');// Whitelist of allowed finding columns
const FINDING_FIELDS = [
  'record_id', 'section_id', 'field_id',
  'condition_value', 'is_safety', 'priority', 'observation',
  'measurement_value', 'materials_value', 'yes_no_value',
  'is_custom', 'custom_label',
  'is_section_pass', 'not_applicable', 'na_reason', 'order_index',
];

function pick(obj, allowed) {
  var out = {};
  allowed.forEach(function (k) { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id, section_id, recommendation_ids } = body;

  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }
  if (!section_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'section_id required' }) };
  }

  var findingRow = pick(body, FINDING_FIELDS);
  findingRow.updated_at = new Date().toISOString();

  try {
    // Upsert finding on (record_id, section_id, field_id)
    var { data, error } = await db()
      .from('inspection_findings')
      .upsert(findingRow, { onConflict: 'record_id,section_id,field_id' })
      .select('id')
      .single();

    if (error) throw error;

    var findingId = data.id;

    // Replace recommendations for this finding
    if (Array.isArray(recommendation_ids)) {
      // Delete existing
      var { error: delErr } = await db()
        .from('inspection_finding_recommendations')
        .delete()
        .eq('finding_id', findingId);

      if (delErr) throw delErr;

      // Insert new recommendations
      // Supports both ['uuid'] strings and [{id:'uuid', note:'text'}] objects
      if (recommendation_ids.length > 0) {
        var recRows = recommendation_ids.map(function (item, idx) {
          var isObj = item && typeof item === 'object';
          return {
            finding_id: findingId,
            recommendation_id: isObj ? item.id : item,
            recommendation_note: isObj ? (item.note || null) : null,
            order_index: idx,
          };
        });

        var { error: insErr } = await db()
          .from('inspection_finding_recommendations')
          .insert(recRows);

        if (insErr) throw insErr;
      }
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ id: findingId }) };
  } catch (err) {
    console.error('save-finding error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
