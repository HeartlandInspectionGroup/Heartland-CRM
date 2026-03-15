const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const authError = requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { photo_id, finding_id } = body;

  if (!photo_id) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'photo_id required' }) };
  }

  try {
    // Load the photo to get its record_id
    var { data: photo, error: photoErr } = await db()
      .from('inspection_finding_photos')
      .select('id, record_id')
      .eq('id', photo_id)
      .single();

    if (photoErr) throw photoErr;
    if (!photo) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Photo not found' }) };
    }

    // If linking (not unlinking), validate the finding belongs to the same record
    if (finding_id) {
      var { data: finding, error: findErr } = await db()
        .from('inspection_findings')
        .select('id, record_id')
        .eq('id', finding_id)
        .single();

      if (findErr) throw findErr;
      if (!finding) {
        return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Finding not found' }) };
      }

      if (photo.record_id !== finding.record_id) {
        return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Photo and finding belong to different records' }) };
      }
    }

    // Update the photo's finding_id (null = unlink)
    var { error: updErr } = await db()
      .from('inspection_finding_photos')
      .update({ finding_id: finding_id || null })
      .eq('id', photo_id);

    if (updErr) throw updErr;

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('link-finding-photo error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
