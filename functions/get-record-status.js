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

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var { record_id } = event.queryStringParameters || {};
  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }

  try {
    // Fetch the inspection record
    var { data: record, error: recErr } = await db()
      .from('inspection_records')
      .select('id, payment_status, status, final_total')
      .eq('id', record_id)
      .maybeSingle();

    if (recErr) throw recErr;

    if (!record) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Record not found' }) };
    }

    // Derive agreement_signed: check if any waiver_signatures exist for this
    // record where the waiver_version is still active
    var { data: sigs, error: sigErr } = await db()
      .from('waiver_signatures')
      .select('id, waiver_version_id')
      .eq('inspection_record_id', record_id);

    if (sigErr) throw sigErr;

    var agreement_signed = false;

    if (sigs && sigs.length > 0) {
      // Check that at least one signature has an active waiver_version
      var versionIds = sigs.map(function (s) { return s.waiver_version_id; });
      var { data: activeVersions, error: vErr } = await db()
        .from('waiver_versions')
        .select('id')
        .in('id', versionIds)
        .eq('is_active', true);

      if (vErr) throw vErr;

      agreement_signed = !!(activeVersions && activeVersions.length > 0);
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        payment_status: record.payment_status || 'unpaid',
        final_total: record.final_total || 0,
        agreement_signed: agreement_signed,
        status: record.status || 'scheduled',
      }),
    };
  } catch (err) {
    console.error('get-record-status error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
