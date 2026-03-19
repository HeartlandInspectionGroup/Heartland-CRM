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

  var { record_id, health_score } = body;

  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }

  try {
    // Fetch current record
    var { data: record, error: fetchErr } = await db()
      .from('inspection_records')
      .select('id, status, payment_status, final_total, category, is_bundle')
      .eq('id', record_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!record) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Record not found' }) };
    }

    if (record.status === 'submitted' || record.status === 'narrative') {
      return { statusCode: 409, headers: headers, body: JSON.stringify({ error: 'Already submitted' }) };
    }

    // ── Payment gate (state law: no report without payment) ──
    // $0 inspections bypass payment gate entirely
    // Bundle add-ons bypass payment gate (payment tied to parent inspection)
    var isAddon = record.category === 'addon';
    var isBundleAddon = isAddon && record.is_bundle === true;
    var payStatus = record.payment_status || 'unpaid';
    if (!isBundleAddon && payStatus !== 'paid' && Number(record.final_total || 0) > 0) {
      return { statusCode: 402, headers: headers, body: JSON.stringify({ error: 'Payment required before submission' }) };
    }

    // ── Agreement gate ──
    var { data: sigs, error: sigErr } = await db()
      .from('waiver_signatures')
      .select('id, waiver_version_id')
      .eq('inspection_record_id', record_id);

    if (sigErr) throw sigErr;

    var agreementSigned = false;
    if (sigs && sigs.length > 0) {
      var versionIds = sigs.map(function (s) { return s.waiver_version_id; });
      var { data: activeVersions, error: vErr } = await db()
        .from('waiver_versions')
        .select('id')
        .in('id', versionIds)
        .eq('is_active', true);
      if (vErr) throw vErr;
      agreementSigned = !!(activeVersions && activeVersions.length > 0);
    }

    if (!agreementSigned) {
      return { statusCode: 403, headers: headers, body: JSON.stringify({ error: 'Agreement must be signed before submission' }) };
    }

    // Add-ons go straight to submitted (no narrative review step)
    // All other inspections go to narrative (awaiting narrative approval before report delivery)
    var targetStatus = isAddon ? 'submitted' : 'narrative';
    var { error: updErr } = await db()
      .from('inspection_records')
      .update({ status: targetStatus, completed_at: new Date().toISOString(), health_score: (health_score !== null && health_score !== undefined && !isNaN(health_score)) ? Number(health_score) : null })
      .eq('id', record_id);

    if (updErr) throw updErr;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, addon: isAddon }) };
  } catch (err) {
    console.error('submit-inspection-v2 error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
