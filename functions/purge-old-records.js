/**
 * Netlify Function: purge-old-records
 *
 * Hard-deletes inspection records older than 7 years.
 * Owner-only — validates JWT email matches OWNER_EMAIL.
 * Deletes children in order, NEVER deletes waiver_signatures.
 *
 * POST body: { record_ids: string[] }
 */

const { createClient } = require('@supabase/supabase-js');
const { corsHeaders } = require('./lib/cors');
const { writeAuditLog } = require('./write-audit-log');

var _sb;
function db() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _sb;
}

async function validateOwner(event) {
  var authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  var jwt = authHeader.substring(7);
  try {
    var { data, error } = await db().auth.getUser(jwt);
    if (error || !data || !data.user) return null;
    var ownerEmail = process.env.OWNER_EMAIL || '';
    if (!ownerEmail || data.user.email.toLowerCase() !== ownerEmail.toLowerCase()) return null;
    return data.user.email;
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  var ownerEmail = await validateOwner(event);
  if (!ownerEmail) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Owner access required' }) };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var { record_ids } = body;
  if (!Array.isArray(record_ids) || !record_ids.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'record_ids array required' }) };
  }

  try {
    // Verify all records are older than 7 years
    var sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
    var cutoffDate = sevenYearsAgo.toISOString().split('T')[0];

    var { data: records, error: recErr } = await db()
      .from('inspection_records')
      .select('id, inspection_date')
      .in('id', record_ids);

    if (recErr) throw recErr;

    var validIds = [];
    var minDate = null;
    var maxDate = null;
    (records || []).forEach(function (r) {
      if (r.inspection_date && r.inspection_date <= cutoffDate) {
        validIds.push(r.id);
        if (!minDate || r.inspection_date < minDate) minDate = r.inspection_date;
        if (!maxDate || r.inspection_date > maxDate) maxDate = r.inspection_date;
      }
    });

    if (!validIds.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No records qualify — all must be older than 7 years' }) };
    }

    // Delete children in order (NEVER waiver_signatures)
    await db().from('inspection_finding_photos').delete().in('record_id', validIds);
    await db().from('inspection_finding_recommendations').delete().in('finding_id',
      (await db().from('inspection_findings').select('id').in('record_id', validIds)).data?.map(f => f.id) || []
    );
    await db().from('inspection_findings').delete().in('record_id', validIds);
    await db().from('inspection_narratives').delete().in('record_id', validIds);
    await db().from('property_profiles').delete().in('record_id', validIds);

    // Delete inspection_records last
    var { error: delErr } = await db().from('inspection_records').delete().in('id', validIds);
    if (delErr) throw delErr;

    // Audit log
    writeAuditLog({
      record_id: null,
      action: 'data.retention_purge',
      category: 'compliance',
      actor: ownerEmail,
      details: { count: validIds.length, date_range: minDate + ' to ' + maxDate },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, purged: validIds.length }) };
  } catch (err) {
    console.error('purge-old-records error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
