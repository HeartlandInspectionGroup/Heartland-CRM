/**
 * Netlify Function: save-equipment-scan
 *
 * UPSERT equipment scan data into the equipment_scans table.
 * Conflict resolution on (record_id, section_id, field_id).
 *
 * POST body: { record_id, section_id, field_id, brand, model, serial,
 *              manufacture_date, age_years, capacity, efficiency_rating,
 *              recall_status, recall_url, raw_response }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');

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

  if (!body.record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }
  if (!body.section_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'section_id required' }) };
  }

  try {
    var row = {
      record_id: body.record_id,
      section_id: body.section_id,
      field_id: body.field_id || null,
      brand: body.brand || null,
      model: body.model || null,
      serial: body.serial || null,
      manufacture_date: body.manufacture_date || null,
      age_years: body.age_years != null ? body.age_years : null,
      capacity: body.capacity || null,
      efficiency_rating: body.efficiency_rating || null,
      recall_status: body.recall_status || 'none',
      recall_url: body.recall_url || null,
      raw_response: body.raw_response || null,
    };

    var { data, error } = await db()
      .from('equipment_scans')
      .upsert(row, { onConflict: 'record_id,section_id,field_id' })
      .select()
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ ok: true, id: data ? data.id : null }),
    };
  } catch (err) {
    console.error('save-equipment-scan error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
