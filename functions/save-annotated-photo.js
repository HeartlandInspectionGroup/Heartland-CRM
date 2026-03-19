/**
 * Netlify Function: save-annotated-photo
 *
 * Saves an annotated photo URL back to inspection_finding_photos.
 * Called after the annotation engine flattens canvas + uploads to Cloudinary.
 *
 * POST body: { photo_id, annotated_url }
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

  var { photo_id, annotated_url } = body;

  if (!photo_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'photo_id required' }) };
  }
  if (!annotated_url) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'annotated_url required' }) };
  }

  try {
    // Check that the photo exists
    var { data: photo, error: fetchErr } = await db()
      .from('inspection_finding_photos')
      .select('id')
      .eq('id', photo_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!photo) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Photo not found' }) };
    }

    // Update annotated_url
    var { error: updErr } = await db()
      .from('inspection_finding_photos')
      .update({ annotated_url: annotated_url })
      .eq('id', photo_id);

    if (updErr) throw updErr;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('save-annotated-photo error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
