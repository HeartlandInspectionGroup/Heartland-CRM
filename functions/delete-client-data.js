/**
 * Netlify Function: delete-client-data
 *
 * Right-to-erasure endpoint — cascading delete of all PII
 * associated with a client email across all tables.
 *
 * POST body: { email }
 * Headers:   x-admin-token required
 *
 * Returns: { ok: true, deleted: { table: count, ... } }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { writeAuditLog } = require('./write-audit-log');

const { corsHeaders } = require('./lib/cors');

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const authError = await requireAuth(event);
  if (authError) return authError;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { email } = body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  email = email.trim().toLowerCase();

  var sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var deleted = {};

  try {
    // 1. Delete waiver signatures (references inspection_records)
    var { data: sigs } = await sb.from('waiver_signatures').delete().eq('client_email', email).select('id');
    deleted.waiver_signatures = sigs ? sigs.length : 0;

    // 2. Delete client portal tokens
    var { data: tokens } = await sb.from('client_portal_tokens').delete().eq('client_email', email).select('id');
    deleted.client_portal_tokens = tokens ? tokens.length : 0;

    // 3. Get inspection record IDs for this email (needed for cascade)
    var { data: records } = await sb.from('inspection_records').select('id, booking_id').eq('cust_email', email);
    var recordIds = (records || []).map(function(r) { return r.id; });
    var bookingIds = (records || []).map(function(r) { return r.booking_id; }).filter(Boolean);

    // 4. Delete field photos for these records
    if (recordIds.length) {
      var { data: photos } = await sb.from('field_photos').delete().in('record_id', recordIds).select('id');
      deleted.field_photos = photos ? photos.length : 0;

      var { data: findingPhotos } = await sb.from('inspection_finding_photos').delete().in('record_id', recordIds).select('id');
      deleted.inspection_finding_photos = findingPhotos ? findingPhotos.length : 0;
    }

    // 5. Delete inspection records
    var { data: recs } = await sb.from('inspection_records').delete().eq('cust_email', email).select('id');
    deleted.inspection_records = recs ? recs.length : 0;

    // 6. Delete bookings
    var { data: bks } = await sb.from('bookings').delete().eq('client_email', email).select('id');
    deleted.bookings = bks ? bks.length : 0;

    // 7. Delete from clients table
    var { data: cls } = await sb.from('clients').delete().eq('email', email).select('id');
    deleted.clients = cls ? cls.length : 0;

    // 8. Audit log — record the deletion (no PII stored)
    writeAuditLog({
      record_id: null,
      action:    'client.data_deleted',
      category:  'admin',
      actor:     'admin',
      details:   { tables_affected: Object.keys(deleted).filter(function(k) { return deleted[k] > 0; }) },
    });

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ ok: true, deleted: deleted }),
    };

  } catch (err) {
    console.error('[delete-client-data] Error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
