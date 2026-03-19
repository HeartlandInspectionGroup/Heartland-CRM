/**
 * Netlify Function: save-field-photo
 *
 * Saves a field photo to inspection_finding_photos.
 * finding_id is null at this stage — gets linked in office mode.
 *
 * POST body: { record_id, section_id, cloudinary_url, cloudinary_public_id, field_id?, severity?, is_safety?, caption? }
 * Returns: { ok: true, id }
 */

const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');

// field_id column is uuid — reject non-UUID values (e.g. "uuid_mfg" suffix from label photos)
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(val) { return typeof val === 'string' && UUID_RE.test(val); }

function getEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const { SUPABASE_URL, SUPABASE_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { record_id, section_id, cloudinary_url, cloudinary_public_id, field_id, severity, is_safety, caption, update_id } = body;

  // UPDATE mode — update existing photo row with new fields (HEA-160 Finding Modal)
  if (update_id) {
    var updates = {};
    if (field_id && isValidUuid(field_id)) updates.field_id = field_id;
    if (severity) updates.severity = severity;
    if (is_safety !== undefined) updates.is_safety = !!is_safety;
    if (caption !== undefined) updates.caption = caption;
    if (!Object.keys(updates).length) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'No fields to update' }) };
    }
    var updRes = await fetch(SUPABASE_URL + '/rest/v1/inspection_finding_photos?id=eq.' + update_id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(updates),
    });
    if (!updRes.ok) {
      var errText = await updRes.text();
      console.error('[save-field-photo] update error:', errText);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Failed to update photo' }) };
    }
    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, id: update_id }) };
  }

  if (!record_id || !section_id || !cloudinary_url)
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id, section_id and cloudinary_url required' }) };

  var row = {
    record_id: record_id,
    section_id: section_id,
    finding_id: null,
    cloudinary_url: cloudinary_url,
    cloudinary_public_id: cloudinary_public_id || null,
  };
  // Photo-centric fields (HEA-160) — optional, backwards compatible
  // field_id is uuid column — only include valid UUIDs (HEA-225: _mfg suffix is not a UUID)
  if (field_id && isValidUuid(field_id)) row.field_id = field_id;
  if (severity) row.severity = severity;
  if (is_safety !== undefined) row.is_safety = !!is_safety;
  if (caption) row.caption = caption;

  var res = await fetch(SUPABASE_URL + '/rest/v1/inspection_finding_photos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(row),
  });

  var text = await res.text();
  var rows;
  try { rows = JSON.parse(text); } catch(e) { rows = null; }

  if (!res.ok || !Array.isArray(rows) || !rows[0]) {
    console.error('[save-field-photo] error:', text);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Failed to save photo' }) };
  }

  return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, id: rows[0].id }) };
};
